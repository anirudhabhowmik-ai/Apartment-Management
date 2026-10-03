// services/pdfGenerator.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

import type { SignatureData } from "../store/billStore";
import { downloadWebFile } from "../utils/webFileDownload";

/* ================================================================
   TYPES
================================================================ */

type LayoutVariant = "bold" | "classic" | "minimal";

interface BillData {
  billNumber: string;
  apartmentName: string;
  address: string;
  societyName: string;
  contactNumber: string;
  email: string;
  memberName: string;
  flatNumber?: string;
  amount: number;
  month: string;
  paidDate: string;
  additionalAmount?: number;
  additionalNote?: string;
  deductionAmount?: number;
  deductionNote?: string;
  netAmount: number;
  signData?: SignatureData;
  template: {
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      text: string;
      headerBg: string;
      footerBg: string;
    };
    fontFamily: string;
    logoPosition: "top-left" | "top-center" | "top-right";
    showBorder: boolean;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    showWatermark: boolean;
    watermarkText?: string;
    layoutVariant?: LayoutVariant;
  };
  billType: "maintenance" | "salary";
  staffRole?: string;

  // ── NEW: tenant/photo support ──
  isTenantAccount?: boolean;
  societyPhotoUri?: string | null;
}

/* ================================================================
   HELPERS
================================================================ */

function formatDate(date: string): string {
  if (!date) return "";
  const parts = date.split("-");
  const year = parts[0];
  const monthNum = parts[1];
  const day = parts[2] || "01";
  return new Date(`${year}-${monthNum}-${day}`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(value: string | number | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSignatureHtml(signData?: SignatureData): string {
  if (!signData) {
    return `<div style="width:200px;height:60px;border-bottom:1px dashed #cbd5e1;margin:0 auto;"></div>`;
  }

  if (signData.type === "svg") {
    let svg = signData.svgMarkup;

    if (!/viewBox\s*=/.test(svg) && signData.width && signData.height) {
      svg = svg.replace(
        /<svg\b/i,
        `<svg viewBox="0 0 ${signData.width} ${signData.height}"`,
      );
    }

    if (!/xmlns\s*=/.test(svg)) {
      svg = svg.replace(/<svg\b/i, `<svg xmlns="http://www.w3.org/2000/svg"`);
    }

    svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
      const cleaned = String(attrs)
        .replace(/\swidth\s*=\s*"[^"]*"/gi, "")
        .replace(/\sheight\s*=\s*"[^"]*"/gi, "");
      return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
    });

    return `
      <div style="width:200px;height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto;">
        <div class="signature-svg-wrap" style="width:100%;height:100%;">
          ${svg}
        </div>
      </div>
    `;
  }

  const imgStyle = signData.transparentBg ? `mix-blend-mode: multiply;` : ``;

  return `
    <div style="width:200px;height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto;">
      <img src="${escapeHtml(signData.uri)}"
           style="max-width:100%;max-height:100%;object-fit:contain;${imgStyle}"
           alt="Signature" />
    </div>
  `;
}

function buildBillFileName(billNumber: string): string {
  const safeSuffix = billNumber.replace(/[^\w-]+/g, "_");
  return `Bill-${safeSuffix}.pdf`;
}

/**
 * Loads an image URI and returns something the HTML renderer can use.
 *  - http/https / data:  → returned as-is
 *  - file:// / content:// → read as base64 and returned as a data: URI
 * Returns null if the URI is missing or loading fails.
 */
async function resolvePhotoForHtml(
  rawUri: string | null | undefined,
): Promise<string | null> {
  if (!rawUri) return null;
  const uri = String(rawUri).trim();
  if (!uri) return null;

  if (/^https?:\/\//i.test(uri) || uri.startsWith("data:")) return uri;

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const lower = uri.toLowerCase();
    let mime = "image/jpeg";
    if (lower.endsWith(".png")) mime = "image/png";
    else if (lower.endsWith(".webp")) mime = "image/webp";
    else if (lower.endsWith(".gif")) mime = "image/gif";
    else if (lower.endsWith(".heic")) mime = "image/heic";

    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.warn("[pdfGenerator] could not load society photo:", e);
    return null;
  }
}

/* ================================================================
   ROW BUILDER
================================================================ */

function rowHtml(
  label: string,
  value: string,
  opts: {
    labelColor: string;
    valueColor: string;
    borderBottom: string;
    paddingY: number;
    labelSize?: number;
    valueSize?: number;
    uppercaseLabel?: boolean;
  },
): string {
  return `
    <div style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding-top:${opts.paddingY}px;
      padding-bottom:${opts.paddingY}px;
      border-bottom:${opts.borderBottom};
    ">
      <div style="
        font-size:${opts.labelSize ?? 13}px;
        color:${opts.labelColor};
        ${opts.uppercaseLabel ? "text-transform:uppercase; letter-spacing:0.6px; font-weight:700;" : ""}
      ">${escapeHtml(label)}</div>
      <div style="
        font-size:${opts.valueSize ?? 13}px;
        font-weight:700;
        color:${opts.valueColor};
      ">${escapeHtml(value)}</div>
    </div>
  `;
}

/* ================================================================
   HEADER BUILDER
================================================================ */

function buildHeaderHtml(
  variant: LayoutVariant,
  t: BillData["template"],
  initials: string,
  societyName: string,
  address: string,
  contactLine: string,
  photoUri: string | null,
): string {
  const { colors } = t;

  if (variant === "bold") {
    return `
      <div style="
        background:${colors.headerBg};
        padding:24px 26px;
        display:flex;
        align-items:center;
        gap:16px;
      ">
        <div style="
          width:56px;height:56px;
          border-radius:12px;
          background:#ffffff;
          color:${colors.headerBg};
          display:flex;align-items:center;justify-content:center;
          font-size:16px;font-weight:800;letter-spacing:0.6px;
          overflow:hidden;
        ">
          ${
            photoUri
              ? `<img src="${escapeHtml(
                  photoUri,
                )}" style="width:100%;height:100%;object-fit:cover;" alt="Logo" />`
              : escapeHtml(initials)
          }
        </div>
        <div style="flex:1;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.3px;">
            ${escapeHtml(societyName)}
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:3px;">
            ${escapeHtml(address)}
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:2px;">
            ${escapeHtml(contactLine)}
          </div>
        </div>
      </div>
    `;
  }

  if (variant === "classic") {
    return `
      <div style="text-align:center;padding-bottom:14px;">
        ${
          photoUri
            ? `
          <div style="
            width:64px;height:64px;border-radius:14px;overflow:hidden;
            margin:0 auto 12px auto;
          ">
            <img src="${escapeHtml(
              photoUri,
            )}" style="width:100%;height:100%;object-fit:cover;" alt="Logo" />
          </div>
        `
            : ""
        }
        <div style="
          font-size:22px;
          font-weight:800;
          color:${colors.primary};
          letter-spacing:1.2px;
        ">${escapeHtml(societyName)}</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">
          ${escapeHtml(address)}
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">
          ${escapeHtml(contactLine)}
        </div>
        <div style="
          height:2px;
          background:${colors.primary};
          margin-top:12px;
        "></div>
      </div>
    `;
  }

  return `
    <div style="
      padding-bottom:10px;
      border-bottom:1px solid #e5e7eb;
      text-align:left;
    ">
      <div style="display:flex;align-items:center;gap:12px;">
        ${
          photoUri
            ? `
          <div style="
            width:44px;height:44px;border-radius:10px;overflow:hidden;
            flex-shrink:0;
          ">
            <img src="${escapeHtml(
              photoUri,
            )}" style="width:100%;height:100%;object-fit:cover;" alt="Logo" />
          </div>
        `
            : ""
        }
        <div style="flex:1;">
          <div style="font-size:18px;font-weight:800;color:#0f172a;">
            ${escapeHtml(societyName)}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
            ${escapeHtml(address)}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
            ${escapeHtml(contactLine)}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ================================================================
   HTML BUILDER (native — used by expo-print only)
================================================================ */

async function buildBillHtml(data: BillData): Promise<string> {
  const {
    billNumber,
    address,
    societyName,
    contactNumber,
    email,
    memberName,
    flatNumber,
    amount,
    month,
    paidDate,
    additionalAmount,
    additionalNote,
    deductionAmount,
    deductionNote,
    netAmount,
    signData,
    template,
    billType,
    staffRole,
    isTenantAccount = false,
    societyPhotoUri = null,
  } = data;

  const colors = template.colors;
  const variant: LayoutVariant = template.layoutVariant ?? "bold";
  const signatureHtml = buildSignatureHtml(signData);

  const initials = societyName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3);

  const contactLine = [
    contactNumber ? `📞 ${contactNumber}` : "",
    email ? `✉ ${email}` : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const resolvedPhotoUri =
    billType === "maintenance"
      ? await resolvePhotoForHtml(societyPhotoUri)
      : null;

  const headerHtml = buildHeaderHtml(
    variant,
    template,
    initials,
    societyName,
    address,
    contactLine,
    resolvedPhotoUri,
  );

  const isOwnerBill = billType === "maintenance";
  const ownerTenantWord = isTenantAccount ? "Tenant" : "Owner";
  const unitLabel = isTenantAccount ? "Room Number" : "Flat Number";
  const memberLabel = isOwnerBill ? `${ownerTenantWord} Name` : "Staff Name";

  const infoRowsData: [string, string][] = [
    [memberLabel, memberName],
    ...(flatNumber ? ([[unitLabel, flatNumber]] as [string, string][]) : []),
    ...(staffRole ? ([["Role", staffRole]] as [string, string][]) : []),
    ["Month", month],
    ["Payment Date", formatDate(paidDate)],
  ];

  const billTitleText = isOwnerBill
    ? isTenantAccount
      ? "RENT BILL"
      : "MAINTENANCE BILL"
    : "SALARY RECEIPT";

  const baseLabel = isOwnerBill
    ? isTenantAccount
      ? "Base Rent"
      : "Base Maintenance"
    : "Base Salary";

  const totalLabel = isOwnerBill
    ? isTenantAccount
      ? "Rent Amount"
      : "Maintenance Amount"
    : "Salary Amount";

  const infoPanelHtml = (() => {
    if (variant === "bold") {
      const rows = infoRowsData
        .map(([label, value]) =>
          rowHtml(label, value, {
            labelColor: "#475569",
            valueColor: "#0f172a",
            borderBottom: "0",
            paddingY: 6,
          }),
        )
        .join("");
      return `
        <div style="
          background:${colors.secondary};
          border-radius:10px;
          padding:12px 14px;
          margin-top:12px;
        ">
          ${rows}
        </div>
      `;
    }

    if (variant === "classic") {
      const rows = infoRowsData
        .map(([label, value], i) =>
          rowHtml(label, value, {
            labelColor: "#475569",
            valueColor: colors.text,
            borderBottom:
              i === infoRowsData.length - 1 ? "0" : "1px solid #e2e8f0",
            paddingY: 7,
          }),
        )
        .join("");
      return `
        <div style="
          background:#ffffff;
          border:1px solid #cbd5e1;
          padding:12px 14px;
          margin-top:14px;
        ">
          ${rows}
        </div>
      `;
    }

    const rows = infoRowsData
      .map(([label, value], i) =>
        rowHtml(label, value, {
          labelColor: "#64748b",
          valueColor: "#0f172a",
          borderBottom:
            i === infoRowsData.length - 1 ? "0" : "1px solid #f1f5f9",
          paddingY: 6,
        }),
      )
      .join("");
    return `
      <div style="margin-top:12px;">
        ${rows}
      </div>
    `;
  })();

  const billTitleHtml = (() => {
    if (variant === "bold") {
      return `
        <div style="
          font-size:18px;
          font-weight:800;
          color:#ffffff;
          text-align:center;
          padding:12px;
          background:${colors.primary};
          border-radius:8px;
          margin:14px 0 12px 0;
          letter-spacing:0.8px;
        ">${escapeHtml(billTitleText)}</div>
      `;
    }
    if (variant === "classic") {
      return `
        <div style="
          font-size:15px;
          font-weight:800;
          color:${colors.primary};
          text-align:center;
          letter-spacing:3px;
          padding:12px 0;
          border-top:1px solid #cbd5e1;
          border-bottom:1px solid #cbd5e1;
          margin:16px 0 12px 0;
        ">${escapeHtml(billTitleText)}</div>
      `;
    }
    return `
      <div style="
        font-size:15px;
        font-weight:700;
        color:#0f172a;
        text-align:left;
        padding:8px 0;
        margin:12px 0 4px 0;
      ">${escapeHtml(billTitleText)}</div>
    `;
  })();

  const amountRowsData: [string, string][] = [
    [baseLabel, formatCurrency(amount)],
    ...(additionalAmount
      ? ([["Additional Amount", `+ ${formatCurrency(additionalAmount)}`]] as [
          string,
          string,
        ][])
      : []),
    ...(deductionAmount
      ? ([["Deduction", `- ${formatCurrency(deductionAmount)}`]] as [
          string,
          string,
        ][])
      : []),
  ];

  const amountPanelHtml = (() => {
    if (variant === "bold") {
      const rows = amountRowsData
        .map(([label, value]) =>
          rowHtml(label, value, {
            labelColor: "#475569",
            valueColor: "#0f172a",
            borderBottom: "0",
            paddingY: 6,
          }),
        )
        .join("");
      return `
        <div style="
          background:${colors.secondary};
          border-radius:10px;
          padding:12px 14px;
          margin-top:12px;
        ">
          ${rows}
        </div>
      `;
    }

    if (variant === "classic") {
      const rows = amountRowsData
        .map(([label, value], i) =>
          rowHtml(label, value, {
            labelColor: "#475569",
            valueColor: colors.text,
            borderBottom:
              i === amountRowsData.length - 1 ? "0" : "1px solid #e2e8f0",
            paddingY: 7,
          }),
        )
        .join("");
      return `
        <div style="
          background:#ffffff;
          border:1px solid #cbd5e1;
          padding:12px 14px;
          margin-top:12px;
        ">
          ${rows}
        </div>
      `;
    }

    const rows = amountRowsData
      .map(([label, value], i) =>
        rowHtml(label, value, {
          labelColor: "#64748b",
          valueColor: "#0f172a",
          borderBottom:
            i === amountRowsData.length - 1 ? "0" : "1px solid #f1f5f9",
          paddingY: 6,
        }),
      )
      .join("");
    return `
      <div style="margin-top:12px;">
        ${rows}
      </div>
    `;
  })();

  const totalHtml = (() => {
    if (variant === "bold") {
      return `
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          background:${colors.primary};
          border-radius:10px;
          padding:12px 14px;
          margin-top:14px;
        ">
          <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.88);">
            ${escapeHtml(totalLabel)}
          </div>
          <div style="font-size:20px;font-weight:800;color:#ffffff;">
            ${escapeHtml(formatCurrency(netAmount))}
          </div>
        </div>
      `;
    }

    if (variant === "classic") {
      return `
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          border-top:2px solid ${colors.primary};
          border-bottom:2px solid ${colors.primary};
          padding:10px 0;
          margin-top:14px;
        ">
          <div style="font-size:13px;font-weight:700;color:#475569;letter-spacing:1px;text-transform:uppercase;">
            ${escapeHtml(totalLabel)}
          </div>
          <div style="font-size:18px;font-weight:800;color:${colors.primary};">
            ${escapeHtml(formatCurrency(netAmount))}
          </div>
        </div>
      `;
    }

    return `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        border-top:1px solid #0f172a;
        padding:8px 0;
        margin-top:12px;
      ">
        <div style="font-size:13px;font-weight:700;color:#64748b;">
          ${escapeHtml(totalLabel)}
        </div>
        <div style="font-size:18px;font-weight:800;color:#0f172a;">
          ${escapeHtml(formatCurrency(netAmount))}
        </div>
      </div>
    `;
  })();

  const signatureAlign = variant === "minimal" ? "flex-start" : "center";
  const containerPadding = variant === "bold" ? "0 30px 30px" : "30px";

  const watermarkText =
    template.watermarkText ||
    (isTenantAccount && isOwnerBill ? "HOME" : "SOCIETY");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: '${template.fontFamily}', sans-serif;
          background: ${colors.background};
          padding: 40px 20px;
          color: ${colors.text};
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .bill-container {
          max-width: 800px;
          margin: 0 auto;
          background: ${colors.background};
          padding: ${containerPadding};
          ${
            template.showBorder
              ? `border: ${template.borderWidth}px solid ${template.borderColor};
                 border-radius: ${template.borderRadius}px;`
              : ""
          }
          ${
            variant === "bold" && template.borderRadius > 0
              ? `border-radius:${template.borderRadius}px; overflow:hidden;`
              : ""
          }
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          position: relative;
        }

        ${
          template.showWatermark
            ? `
          .watermark {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 60px;
            color: rgba(0,0,0,0.05);
            font-weight: bold;
            letter-spacing: 8px;
            pointer-events: none;
            width: 100%;
            text-align: center;
          }
        `
            : ""
        }

        .signature-svg-wrap svg {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }

        @media print {
          body { padding: 0; background: white; }
          .bill-container { box-shadow: none; border: none; }
        }
      </style>
    </head>
    <body>
      <div class="bill-container">
        ${
          template.showWatermark
            ? `<div class="watermark">${escapeHtml(watermarkText)}</div>`
            : ""
        }

        ${headerHtml}

        ${billTitleHtml}

        <div style="
          display:flex;
          justify-content:space-between;
          font-size:12px;
          color:#64748b;
          margin-bottom:12px;
        ">
          <div>Bill #: ${escapeHtml(billNumber)}</div>
          <div>Date: ${escapeHtml(formatDate(paidDate))}</div>
        </div>

        ${infoPanelHtml}

        ${amountPanelHtml}

        ${totalHtml}

        ${
          additionalNote || deductionNote
            ? `
          <div style="
            margin-top:16px;
            padding:12px 14px;
            background:${colors.footerBg};
            border-radius:8px;
          ">
            <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:4px;">
              Notes
            </div>
            ${
              additionalNote
                ? `<div style="font-size:12px;color:#475569;opacity:0.85;">• Additional: ${escapeHtml(
                    additionalNote,
                  )}</div>`
                : ""
            }
            ${
              deductionNote
                ? `<div style="font-size:12px;color:#475569;opacity:0.85;">• Deduction: ${escapeHtml(
                    deductionNote,
                  )}</div>`
                : ""
            }
          </div>
        `
            : ""
        }

        ${
          signData
            ? `
          <div style="
            margin-top:26px;
            padding-top:18px;
            border-top:2px solid ${template.borderColor};
            display:flex;
            flex-direction:column;
            align-items:${signatureAlign};
          ">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">
              Authorized Signatory
            </div>
            ${signatureHtml}
          </div>
        `
            : ""
        }

        <div style="
          margin-top:26px;
          padding:16px;
          border-top:2px solid ${colors.primary};
          text-align:center;
          background:${colors.footerBg};
          border-radius:8px;
        ">
          <div style="font-size:11px;color:#64748b;opacity:0.75;">
            This is a computer-generated receipt.
          </div>
          <div style="font-size:11px;color:#64748b;opacity:0.75;margin-top:4px;">
            ${escapeHtml(societyName)} | ${escapeHtml(contactNumber)}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:6px;">
            Generated on ${escapeHtml(new Date().toLocaleString())}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/* ================================================================
   WEB — hand-rolled PDF (no library)
================================================================ */

/** Escape a PDF string literal: ( ) \ must be escaped. */
function pdfEscape(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

type PdfLine = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  color?: [number, number, number];
};

/** "Rs. 1,234" — ASCII-only so Helvetica can render it. */
function inrAscii(amount: number): string {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function layoutBillLines(data: BillData): {
  lines: PdfLine[];
  pageHeight: number;
} {
  const {
    billNumber,
    societyName,
    address,
    contactNumber,
    email,
    memberName,
    flatNumber,
    amount,
    month,
    paidDate,
    additionalAmount,
    additionalNote,
    deductionAmount,
    deductionNote,
    netAmount,
    billType,
    staffRole,
    isTenantAccount = false,
  } = data;

  const PAGE_H = 841.89;
  const MARGIN = 40;
  const LINE = 15;

  const lines: PdfLine[] = [];
  let y = PAGE_H - MARGIN;

  const push = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
      x?: number;
    } = {},
  ) => {
    lines.push({
      text,
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? 10,
      bold: opts.bold,
      color: opts.color,
    });
    y -= opts.gap ?? LINE;
  };

  const isOwnerBill = billType === "maintenance";
  const unitLabel = isTenantAccount ? "Room Number" : "Flat Number";
  const memberLabel = isOwnerBill
    ? `${isTenantAccount ? "Tenant" : "Owner"} Name`
    : "Staff Name";
  const billTitleText = isOwnerBill
    ? isTenantAccount
      ? "RENT BILL"
      : "MAINTENANCE BILL"
    : "SALARY RECEIPT";
  const baseLabel = isOwnerBill
    ? isTenantAccount
      ? "Base Rent"
      : "Base Maintenance"
    : "Base Salary";
  const totalLabel = isOwnerBill
    ? isTenantAccount
      ? "Rent Amount"
      : "Maintenance Amount"
    : "Salary Amount";

  // ── Header ──
  push(societyName, { size: 18, bold: true, color: [0.06, 0.09, 0.16] });
  if (address) push(address, { size: 10, color: [0.39, 0.45, 0.55] });
  const contactLine = [
    contactNumber ? `Phone: ${contactNumber}` : "",
    email ? `Email: ${email}` : "",
  ]
    .filter(Boolean)
    .join("   ");
  if (contactLine) push(contactLine, { size: 9.5, color: [0.58, 0.64, 0.72] });

  y -= 6;

  // ── Bill title strip ──
  push(billTitleText, {
    size: 13,
    bold: true,
    color: [0.15, 0.39, 0.92],
  });
  push(`Bill #: ${billNumber}`, { size: 9.5, color: [0.39, 0.45, 0.55] });
  push(`Date: ${formatDate(paidDate)}`, {
    size: 9.5,
    color: [0.39, 0.45, 0.55],
  });

  y -= 8;

  // ── Info block ──
  const infoRows: [string, string][] = [
    [memberLabel, memberName],
    ...(flatNumber ? ([[unitLabel, flatNumber]] as [string, string][]) : []),
    ...(staffRole ? ([["Role", staffRole]] as [string, string][]) : []),
    ["Month", month],
    ["Payment Date", formatDate(paidDate)],
  ];
  for (const [label, value] of infoRows) {
    push(`${label}: ${value}`, { size: 10.5 });
  }

  y -= 8;

  // ── Amount block ──
  push(baseLabel, { size: 10.5 });
  push(inrAscii(amount), { size: 10.5, x: MARGIN + 240 });

  if (additionalAmount) {
    push("Additional Amount", { size: 10.5 });
    push(`+ ${inrAscii(additionalAmount)}`, {
      size: 10.5,
      x: MARGIN + 240,
    });
    if (additionalNote) {
      push(`(${additionalNote})`, {
        size: 9,
        color: [0.58, 0.64, 0.72],
      });
    }
  }
  if (deductionAmount) {
    push("Deduction", { size: 10.5 });
    push(`- ${inrAscii(deductionAmount)}`, {
      size: 10.5,
      x: MARGIN + 240,
    });
    if (deductionNote) {
      push(`(${deductionNote})`, { size: 9, color: [0.58, 0.64, 0.72] });
    }
  }

  y -= 4;
  push("―".repeat(56), { size: 8, color: [0.8, 0.85, 0.9] });
  push(totalLabel, { size: 12, bold: true, color: [0.06, 0.09, 0.16] });
  push(inrAscii(netAmount), {
    size: 12,
    bold: true,
    color: [0.09, 0.4, 0.92],
    x: MARGIN + 240,
  });

  y -= 12;

  // ── Footer note ──
  push("This is a computer-generated receipt.", {
    size: 9,
    color: [0.58, 0.64, 0.72],
  });
  push(`${societyName} | ${contactNumber}`, {
    size: 9,
    color: [0.58, 0.64, 0.72],
  });
  push(`Generated on ${new Date().toLocaleString()}`, {
    size: 8.5,
    color: [0.65, 0.7, 0.78],
  });

  return { lines, pageHeight: PAGE_H };
}

function buildMinimalPdfBase64(lines: PdfLine[], pageHeight: number): string {
  const PAGE_W = 595.28;

  let content = "q\n";
  for (const line of lines) {
    const font = line.bold ? "/F2" : "/F1";
    const [r, g, b] = line.color ?? [0, 0, 0];
    content +=
      `BT\n` +
      `${font} ${line.size} Tf\n` +
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n` +
      `1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm\n` +
      `(${pdfEscape(line.text)}) Tj\n` +
      `ET\n`;
  }
  content += "Q\n";

  const contentLength = content.length;

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objects[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(
      2,
    )} ${pageHeight.toFixed(2)}] ` +
    `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> ` +
    `/Contents 4 0 R >>`;
  objects[4] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;
  objects[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[6] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  // btoa exists only in browsers — this code path runs only on web.
  // eslint-disable-next-line no-undef
  return btoa(pdf);
}

function generateBillPdfBase64OnWeb(data: BillData): string {
  const { lines, pageHeight } = layoutBillLines(data);
  return buildMinimalPdfBase64(lines, pageHeight);
}

/* ================================================================
   GENERATE PDF
================================================================ */

export async function generateBillPDF(data: BillData): Promise<string> {
  /* ------------------------------------------------------------
     WEB — build a real PDF in-browser (no expo-print).
     expo-print's web shim opens the browser print dialog and
     ignores `base64: true`, so we bypass it entirely on web.
  ------------------------------------------------------------ */
  if (Platform.OS === "web") {
    const base64 = generateBillPdfBase64OnWeb(data);
    return `data:application/pdf;base64,${base64}`;
  }

  /* ------------------------------------------------------------
     NATIVE — unchanged from the working APK build.
  ------------------------------------------------------------ */
  const html = await buildBillHtml(data);

  try {
    const { base64 } = await Print.printToFileAsync({
      html,
      base64: true,
      ...(Platform.OS === "android" && {
        width: 800,
        height: 1000,
        margins: { left: 20, right: 20, top: 20, bottom: 20 },
      }),
    });

    if (!base64) {
      throw new Error("PDF generation failed — no data returned.");
    }

    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error("Cache directory is unavailable on this device.");
    }

    const fileName = buildBillFileName(data.billNumber);
    const fileUri = `${cacheDir}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      throw new Error("PDF was written but could not be verified on disk.");
    }

    return fileUri;
  } catch (error) {
    console.error("PDF generation error:", error);
    throw error;
  }
}

/* ================================================================
   SHARE PDF (native only)
================================================================ */

export async function sharePDF(uri: string, fileName: string): Promise<void> {
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      throw new Error("Sharing is not available on this device.");
    }

    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: fileName || "Download Bill",
      UTI: "com.adobe.pdf",
    });
  } catch (error) {
    console.error("Share PDF error:", error);
    throw error;
  }
}

/* ================================================================
   SAVE TO DEVICE
================================================================ */

export async function savePDFToDevice(
  uri: string,
  fileName: string,
): Promise<{ saved: boolean; message?: string }> {
  try {
    if (Platform.OS === "web") {
      // On web, `uri` is a real data: URI from generateBillPDF.
      // downloadWebFile forces an actual download via <a download>.
      await downloadWebFile(uri, fileName, "application/pdf");
      return { saved: true };
    }

    if (Platform.OS === "android") {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!permissions.granted) {
        return { saved: false, message: "Permission denied" };
      }

      const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        "application/pdf",
      );

      await FileSystem.writeAsStringAsync(newUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return { saved: true };
    }

    await sharePDF(uri, fileName);
    return { saved: true };
  } catch (err) {
    console.error("savePDFToDevice error:", err);
    return {
      saved: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/* ================================================================
   OPTIONAL: alert-driven helper
================================================================ */

export async function downloadBillWithFeedback(
  data: BillData,
  fileName: string,
): Promise<void> {
  try {
    const uri = await generateBillPDF(data);
    const result = await savePDFToDevice(uri, fileName);

    if (result.saved) {
      Alert.alert("Success", "Bill saved as PDF successfully.");
    } else {
      Alert.alert(
        "Save Failed",
        result.message || "Could not save the bill. Please try again.",
      );
    }
  } catch (error) {
    console.error("downloadBillWithFeedback error:", error);
    Alert.alert(
      "Error",
      `Failed to generate bill: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

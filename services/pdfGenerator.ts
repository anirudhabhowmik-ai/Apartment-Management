import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

import type { SignatureData } from "../store/billStore";

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

/**
 * Renders whichever signature variant is saved:
 *   - SVG markup → inlined, scaled to fit a 200x80 box
 *   - Image URI  → rendered as <img> with optional white→transparent trick
 *   - Nothing    → an empty dashed line
 */
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

/* ================================================================
   ROW BUILDER — matches the preview exactly
================================================================ */

/**
 * Renders a single label → value row.
 *
 * label left, value right — the layout the preview uses for
 * "Owner Name: Rahul Sharma" style rows.
 */
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
   HEADER BUILDER — three genuinely different headers
================================================================ */

function buildHeaderHtml(
  variant: LayoutVariant,
  t: BillData["template"],
): string {
  const { colors, borderColor } = t;
  const initial = (t.logoPosition && t.logoPosition) || "top-left";

  if (variant === "bold") {
    return `
      <div style="
        background:${colors.headerBg};
        margin:-30px -30px 24px -30px;
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
        ">
          <%= initials %>
        </div>
        <div style="flex:1;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.3px;">
            <%= societyName %>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:3px;">
            <%= address %>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:2px;">
            <%= contactLine %>
          </div>
        </div>
      </div>
    `;
  }

  if (variant === "classic") {
    return `
      <div style="text-align:center;padding-bottom:14px;">
        <div style="
          font-size:22px;
          font-weight:800;
          color:${colors.primary};
          letter-spacing:1.2px;
        "><%= societyName %></div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">
          <%= address %>
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">
          <%= contactLine %>
        </div>
        <div style="
          height:2px;
          background:${colors.primary};
          margin-top:12px;
        "></div>
      </div>
    `;
  }

  // minimal
  return `
    <div style="
      padding-bottom:10px;
      border-bottom:1px solid #e5e7eb;
      text-align:left;
    ">
      <div style="font-size:18px;font-weight:800;color:#0f172a;">
        <%= societyName %>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
        <%= address %>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
        <%= contactLine %>
      </div>
    </div>
  `;
}

/* ================================================================
   GENERATE PDF
================================================================ */

export async function generateBillPDF(data: BillData): Promise<string> {
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

  /* ---------- Header markup per variant ---------- */
  const headerRaw = buildHeaderHtml(variant, template);
  const headerHtml = headerRaw
    .replace(/<%= initials %>/g, escapeHtml(initials))
    .replace(/<%= societyName %>/g, escapeHtml(societyName))
    .replace(/<%= address %>/g, escapeHtml(address))
    .replace(/<%= contactLine %>/g, escapeHtml(contactLine));

  /* ---------- Shared label / value data ---------- */
  const memberLabel = billType === "maintenance" ? "Owner Name" : "Staff Name";

  const infoRowsData: [string, string][] = [
    [memberLabel, memberName],
    ...(flatNumber
      ? ([["Flat Number", flatNumber]] as [string, string][])
      : []),
    ...(staffRole ? ([["Role", staffRole]] as [string, string][]) : []),
    ["Month", month],
    ["Payment Date", formatDate(paidDate)],
  ];

  /* ---------- Info panel per variant ---------- */
  const infoPanelHtml = (() => {
    if (variant === "bold") {
      // soft-tinted rounded panel
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
      // bordered square panel with dividers between rows
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

    // minimal — no panel, just hairline dividers
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

  /* ---------- Bill title per variant ---------- */
  const billTitleText =
    billType === "maintenance" ? "MAINTENANCE BILL" : "SALARY RECEIPT";

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

  /* ---------- Amount breakdown per variant ---------- */
  const amountRowsData: [string, string][] = [
    [
      billType === "maintenance" ? "Base Maintenance" : "Base Salary",
      formatCurrency(amount),
    ],
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

  /* ---------- Total row per variant ---------- */
  const totalLabel =
    billType === "maintenance" ? "Maintenance Amount" : "Salary Amount";

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

  /* ---------- Signature alignment per variant ---------- */
  const signatureAlign = variant === "minimal" ? "flex-start" : "center";

  /* ---------- Container per variant ---------- */
  const containerPadding = variant === "bold" ? "0 30px 30px" : "30px";

  const html = `
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
            ? `<div class="watermark">${escapeHtml(
                template.watermarkText || "SOCIETY",
              )}</div>`
            : ""
        }

        ${headerHtml}

        ${billTitleHtml}

        <!-- Bill # / date -->
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

    const fileName = buildBillFileName(billNumber);
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
   SHARE PDF
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

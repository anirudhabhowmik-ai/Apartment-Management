import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
    BillMemberType,
    BillTemplateDesign,
    SavedBillConfig,
    SignatureData,
} from "../store/billStore";

export interface OwnerBillIndividualData {
  ownerName: string;
  flatNumber: string;
  flatArea?: string; // e.g. "1,200 sq. ft."
  monthLabel: string;
  items: { label: string; amount: number }[];
  previousDue?: number;
  paidOn?: string;
}

export interface StaffBillIndividualData {
  staffName: string;
  staffRole: string;
  monthLabel: string;
  presentDays?: string;
  workingDays?: string;
  earnings: { label: string; amount: number }[];
  deductions?: { label: string; amount: number }[];
  paymentMode?: string;
  paymentDate?: string;
}

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function rowsHtml(rows: [string, string][]) {
  return rows
    .map(
      ([label, value]) =>
        `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`,
    )
    .join("");
}

// Renders whichever signature type is stored. For uploaded images with
// transparentBg enabled, "mix-blend-mode: multiply" is applied - this is
// the standard trick for putting a scanned/photographed signature on a
// white document: white pixels multiply with the white page and vanish,
// leaving only the ink visible, without needing real alpha transparency.
function signatureHtml(signature?: SignatureData) {
  if (!signature) {
    return `<div style="width: 140px; height: 1px; background: #cbd5e1; margin: 30px auto 0;"></div>`;
  }
  if (signature.type === "svg") {
    return `<div style="display:flex; justify-content:center;">${signature.svgMarkup.replace("<svg ", '<svg style="height:50px;" ')}</div>`;
  }
  const blendStyle = signature.transparentBg ? "mix-blend-mode: multiply;" : "";
  return `<img src="${signature.uri}" style="height: 55px; ${blendStyle}" />`;
}

function buildOwnerBillHtml(
  design: BillTemplateDesign,
  config: SavedBillConfig,
  data: OwnerBillIndividualData,
) {
  const itemsTotal = data.items.reduce((s, i) => s + i.amount, 0);
  const total = itemsTotal + (data.previousDue ?? 0);
  const rows: [string, string][] = [
    ["Owner Name", data.ownerName],
    ["Flat Number", data.flatNumber],
  ];
  if (data.flatArea) rows.push(["Flat Area", data.flatArea]);
  rows.push(["Maintenance Month", data.monthLabel]);
  data.items.forEach((i) => rows.push([i.label, formatCurrency(i.amount)]));
  if (data.previousDue)
    rows.push(["Previous Due", formatCurrency(data.previousDue)]);

  return baseHtml({
    accent: config.accentColor || design.colors.primary,
    docTitle: "Maintenance Bill",
    societyName: config.societyName,
    address: config.address,
    contactNumber: config.contactNumber,
    email: config.email,
    rowsHtmlContent: rowsHtml(rows),
    totalLabel: "Maintenance Amount",
    totalValue: formatCurrency(total),
    footerNote: data.paidOn ? `Paid on ${data.paidOn}` : "Payment Pending",
    signature: config.signature,
  });
}

function buildStaffBillHtml(
  design: BillTemplateDesign,
  config: SavedBillConfig,
  data: StaffBillIndividualData,
) {
  const totalEarnings = data.earnings.reduce((s, i) => s + i.amount, 0);
  const totalDeductions = (data.deductions ?? []).reduce(
    (s, i) => s + i.amount,
    0,
  );
  const net = totalEarnings - totalDeductions;

  const rows: [string, string][] = [
    ["Staff Name", data.staffName],
    ["Role", data.staffRole],
    ["Salary Month", data.monthLabel],
  ];
  if (data.presentDays || data.workingDays) {
    rows.push([
      "Attendance",
      `${data.presentDays ?? "-"} / ${data.workingDays ?? "-"} days`,
    ]);
  }
  data.earnings.forEach((i) => rows.push([i.label, formatCurrency(i.amount)]));
  (data.deductions ?? []).forEach((i) =>
    rows.push([`${i.label} (deduction)`, `- ${formatCurrency(i.amount)}`]),
  );

  return baseHtml({
    accent: config.accentColor || design.colors.primary,
    docTitle: "Salary Slip",
    societyName: config.societyName,
    address: config.address,
    contactNumber: config.contactNumber,
    email: config.email,
    rowsHtmlContent: rowsHtml(rows),
    totalLabel: "Salary Amount",
    totalValue: formatCurrency(net),
    footerNote: data.paymentMode
      ? `Paid via ${data.paymentMode}${data.paymentDate ? ` on ${data.paymentDate}` : ""}`
      : "",
    signature: config.signature,
  });
}

function baseHtml(opts: {
  accent: string;
  docTitle: string;
  societyName: string;
  address: string;
  contactNumber: string;
  email: string;
  rowsHtmlContent: string;
  totalLabel: string;
  totalValue: string;
  footerNote: string;
  signature?: SignatureData;
}) {
  const contactLine =
    opts.contactNumber || opts.email
      ? `<div style="text-align:center; font-size:11px; color:#94a3b8; margin-top:4px;">${[opts.contactNumber, opts.email].filter(Boolean).join("  •  ")}</div>`
      : "";

  return `
  <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
    <body style="font-family: -apple-system, Roboto, Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f5;">
      <div style="max-width: 480px; margin: 24px auto; background: #fff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background: ${opts.accent}; padding: 20px; text-align: center;">
          <div style="color: #fff; font-size: 18px; font-weight: 800;">${opts.docTitle}</div>
        </div>
        <div style="padding: 20px;">
          <div style="text-align: center; font-size: 18px; font-weight: 800; color: #0f172a;">${opts.societyName}</div>
          ${opts.address ? `<div style="text-align:center; font-size:12px; color:#64748b; margin-top:2px;">${opts.address}</div>` : ""}
          ${contactLine}
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 14px 0;" />
          <style>.row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#0f172a;} .label{color:#64748b;} .value{font-weight:700;}</style>
          ${opts.rowsHtmlContent}
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 14px 0;" />
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:15px; font-weight:800; color:#0f172a;">${opts.totalLabel}</span>
            <span style="font-size:22px; font-weight:800; color:${opts.accent};">${opts.totalValue}</span>
          </div>
          ${opts.footerNote ? `<div style="margin-top:8px; font-size:11.5px; color:#64748b; font-style:italic;">${opts.footerNote}</div>` : ""}
          <div style="margin-top: 30px; text-align: center;">
            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px;">Authorized Signatory</div>
            ${signatureHtml(opts.signature)}
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

export async function downloadBill(
  memberType: BillMemberType,
  design: BillTemplateDesign,
  config: SavedBillConfig | null,
  individualData: OwnerBillIndividualData | StaffBillIndividualData,
): Promise<void> {
  if (!config) {
    throw new Error(
      `No ${memberType === "owner" ? "owner bill" : "staff slip"} template has been set up yet.`,
    );
  }

  const html =
    memberType === "owner"
      ? buildOwnerBillHtml(
          design,
          config,
          individualData as OwnerBillIndividualData,
        )
      : buildStaffBillHtml(
          design,
          config,
          individualData as StaffBillIndividualData,
        );

  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle:
        memberType === "owner" ? "Download Bill" : "Download Salary Slip",
      UTI: "com.adobe.pdf",
    });
  }
}

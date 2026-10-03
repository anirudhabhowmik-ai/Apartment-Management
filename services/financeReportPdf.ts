import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { PeopleTransaction } from "../utils/peopleTransactions";
import { downloadWebFile } from "../utils/webFileDownload";

interface FinanceReportPdfInput {
  propertyName: string;
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactions: PeopleTransaction[];
}

export interface FinanceReportPdfResult {
  saved: boolean;
  fileName: string;
  fileUri: string;
  message?: string;
}

/* ================================================================
   HELPERS
================================================================ */

const escapeHtml = (value: string | number | undefined | null): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (amount: number): string =>
  `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;

const capitalize = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

const getCategoryLabel = (category: string): string =>
  ({
    salary: "Salary",
    maintenance: "Maintenance",
    electricity: "Electricity",
    water: "Water",
    other: "Other",
  })[category] || category;

/* ================================================================
   HTML BUILDER
================================================================ */

function buildFinanceReportHtml({
  propertyName,
  month,
  income,
  expenses,
  net,
  transactions,
}: FinanceReportPdfInput): string {
  const maintenance = transactions.filter((t) => t.category === "maintenance");
  const staff = transactions.filter((t) => t.category === "salary");
  const otherExpenses = transactions.filter(
    (t) => t.category !== "maintenance" && t.category !== "salary",
  );

  const maintenanceRows = maintenance
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.wing || "")}</td>
        <td>${escapeHtml(t.flatNumber || "")}</td>
        <td>${escapeHtml(t.memberName || "")}</td>
        <td>${escapeHtml(t.phone || "")}</td>
        <td class="amount">${escapeHtml(formatCurrency(t.amount))}</td>
        <td><span class="status ${t.status}">${escapeHtml(
          capitalize(t.status),
        )}</span></td>
      </tr>
    `,
    )
    .join("");

  const staffRows = staff
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.memberName || t.description || "")}</td>
        <td>${escapeHtml(t.phone || "")}</td>
        <td>${escapeHtml(capitalize(t.memberRole || "Staff"))}</td>
        <td class="amount">${escapeHtml(formatCurrency(t.amount))}</td>
        <td><span class="status ${t.status}">${escapeHtml(
          capitalize(t.status),
        )}</span></td>
      </tr>
    `,
    )
    .join("");

  const expenseRows = otherExpenses
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.description || getCategoryLabel(t.category))}</td>
        <td class="amount">${escapeHtml(formatCurrency(t.amount))}</td>
        <td>${escapeHtml(t.dueDate || "")}</td>
        <td><span class="status ${t.status}">${escapeHtml(
          capitalize(t.status),
        )}</span></td>
      </tr>
    `,
    )
    .join("");

  const emptyRow = (cols: number) =>
    `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8;padding:10px;">No entries</td></tr>`;

  const netColor = net >= 0 ? "#16A34A" : "#DC2626";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Finance Report - ${escapeHtml(month)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 24px;
      margin: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #2563EB;
      margin-bottom: 18px;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      color: #2563EB;
      margin: 0;
    }
    .subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }
    .month-tag {
      font-size: 11px;
      font-weight: 700;
      background: #EFF6FF;
      color: #2563EB;
      padding: 6px 10px;
      border-radius: 8px;
    }
    .summary {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .summary-card {
      flex: 1;
      border-radius: 12px;
      padding: 12px;
      border: 1px solid #e2e8f0;
    }
    .summary-card.income { background: #ECFDF3; border-color: #BBF7D0; }
    .summary-card.expense { background: #FEF2F2; border-color: #FECACA; }
    .summary-card.net { background: #EFF6FF; border-color: #BFDBFE; }
    .summary-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #64748b;
    }
    .summary-amount {
      font-size: 18px;
      font-weight: 800;
      margin-top: 4px;
    }
    .summary-card.income .summary-amount { color: #16A34A; }
    .summary-card.expense .summary-amount { color: #DC2626; }
    .summary-card.net .summary-amount { color: #2563EB; }

    .section {
      margin-top: 22px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #64748b;
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    tbody td {
      font-size: 11.5px;
      padding: 8px 6px;
      border-bottom: 1px solid #f1f5f9;
      color: #0f172a;
    }
    td.amount {
      font-weight: 700;
      white-space: nowrap;
    }
    .status {
      display: inline-block;
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .status.paid { background: #DCFCE7; color: #16A34A; }
    .status.due { background: #FEF3C7; color: #D97706; }
    .status.overdue { background: #FEE2E2; color: #DC2626; }

    .footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Finance Report</h1>
      <div class="subtitle">${escapeHtml(propertyName)}</div>
    </div>
    <div class="month-tag">${escapeHtml(month)}</div>
  </div>

  <div class="summary">
    <div class="summary-card income">
      <div class="summary-label">Income</div>
      <div class="summary-amount">${escapeHtml(formatCurrency(income))}</div>
    </div>
    <div class="summary-card expense">
      <div class="summary-label">Expenses</div>
      <div class="summary-amount">${escapeHtml(formatCurrency(expenses))}</div>
    </div>
    <div class="summary-card net">
      <div class="summary-label">Net</div>
      <div class="summary-amount" style="color:${netColor};">${escapeHtml(
        formatCurrency(net),
      )}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Maintenance</div>
    <table>
      <thead>
        <tr>
          <th>Wing</th>
          <th>Flat</th>
          <th>Owner</th>
          <th>Phone</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${maintenanceRows || emptyRow(6)}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Staff</div>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Role</th>
          <th>Paid</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${staffRows || emptyRow(5)}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Other Expenses</div>
    <table>
      <thead>
        <tr>
          <th>Expense</th>
          <th>Amount</th>
          <th>Due Date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${expenseRows || emptyRow(4)}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Generated on ${escapeHtml(new Date().toLocaleString())}
  </div>
</body>
</html>
  `.trim();
}

/* ================================================================
   WEB PDF — normalises jsPDF output safely across all its builds
================================================================ */

function coercePdfOutputToDataUri(pdf: any): string {
  let out: unknown = null;
  try {
    out = pdf.output("datauristring");
  } catch {
    out = null;
  }

  if (typeof out === "string") {
    if (out.startsWith("data:application/pdf")) {
      return out;
    }
    if (/^[A-Za-z0-9+/=]+$/.test(out) && out.length > 100) {
      return `data:application/pdf;base64,${out}`;
    }
  }

  let raw: unknown = out;
  if (raw == null) {
    try {
      raw = pdf.output("arraybuffer");
    } catch {
      raw = null;
    }
  }

  if (raw instanceof ArrayBuffer) {
    return arrayBufferToPdfDataUri(raw);
  }

  if (raw instanceof Uint8Array) {
    // Copy into a fresh Uint8Array so `.buffer` is a plain ArrayBuffer.
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return arrayBufferToPdfDataUri(copy.buffer);
  }

  if (Array.isArray(raw)) {
    return arrayBufferToPdfDataUri(new Uint8Array(raw).buffer);
  }

  try {
    const s = pdf.output();
    if (typeof s === "string" && s.startsWith("data:application/pdf")) {
      return s;
    }
  } catch {
    // ignore
  }

  throw new Error(
    `Could not convert jsPDF output to a data URI (got ${
      raw == null ? "null" : typeof raw
    }).`,
  );
}

function arrayBufferToPdfDataUri(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as any,
    );
  }
  const base64 = btoa(binary);
  return `data:application/pdf;base64,${base64}`;
}

async function generateFinanceReportDataUriOnWeb(
  params: FinanceReportPdfInput,
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Web PDF generation requires a browser environment.");
  }

  const html = buildFinanceReportHtml(params);

  const mod: any = await import("html2pdf.js" as any);
  const html2pdf = mod?.default ?? mod;

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const bodyHtml = parsed.body ? parsed.body.innerHTML : html;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = "800px";
  container.style.background = "#ffffff";
  container.innerHTML = bodyHtml;
  document.body.appendChild(container);

  try {
    const worker = html2pdf()
      .set({
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: {
          unit: "pt",
          format: "a4",
          orientation: "portrait",
        },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(container);

    await worker.toPdf();

    const pdf: any = worker.get("pdf");
    if (!pdf) {
      throw new Error("Could not access the jsPDF instance.");
    }

    return coercePdfOutputToDataUri(pdf);
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

/* ================================================================
   MAIN EXPORT
================================================================ */

export const downloadFinanceReportPdf = async ({
  propertyName,
  month,
  income,
  expenses,
  net,
  transactions,
}: FinanceReportPdfInput): Promise<FinanceReportPdfResult> => {
  const safeMonth = month.replace(/[^\w-]+/g, "_");
  const fileName = `apartment-management-finance-${safeMonth}.pdf`;

  if (Platform.OS === "web") {
    const fileUri = await generateFinanceReportDataUriOnWeb({
      propertyName,
      month,
      income,
      expenses,
      net,
      transactions,
    });
    await downloadWebFile(fileUri, fileName, "application/pdf");
    return { saved: true, fileName, fileUri };
  }

  const html = buildFinanceReportHtml({
    propertyName,
    month,
    income,
    expenses,
    net,
    transactions,
  });

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

  const fileUri = `${cacheDir}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error("PDF was written but could not be verified on disk.");
  }

  if (Platform.OS === "android") {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted) {
      return { saved: false, fileName, fileUri };
    }

    const base64Bytes = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      "application/pdf",
    );

    await FileSystem.writeAsStringAsync(destUri, base64Bytes, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { saved: true, fileName, fileUri: destUri };
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    dialogTitle: `Finance Report — ${month}`,
    UTI: "com.adobe.pdf",
  });

  return { saved: true, fileName, fileUri };
};

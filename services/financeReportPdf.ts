// services/financeReportPdf.ts
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
  /** true = file was saved, false = user cancelled the folder picker */
  saved: boolean;
  /** File name shown to the user, e.g. "apartment-management-finance-2024-12.pdf" */
  fileName: string;
  /** Full URI where the file was written (cache + SAF destination). */
  fileUri: string;
  /** Optional human message from the OS layer (share sheet, etc.). */
  message?: string;
}

/* ================================================================
   HELPERS  (used by the native expo-print HTML template)
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
   NATIVE HTML BUILDER  (unchanged — used only by expo-print)
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
   WEB — hand-rolled PDF (no library)

   The PDF format is plain text with a small fixed structure. We build
   a minimal 1-page PDF containing Helvetica text and hand the bytes
   to `downloadWebFile`, which forces a real <a download>.
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
  color?: [number, number, number]; // 0..1 RGB
};

/**
 * Lays out the report as a flat list of draw commands.
 * Coordinate origin in PDF is bottom-left, y increases upward.
 * A4 = 595.28 x 841.89 pt.
 */
function layoutReportLines(params: FinanceReportPdfInput): {
  lines: PdfLine[];
  pageHeight: number;
} {
  const { propertyName, month, income, expenses, net, transactions } = params;

  const PAGE_W = 595.28; // eslint-disable-line @typescript-eslint/no-unused-vars
  const PAGE_H = 841.89;
  const MARGIN = 36;
  const LINE = 14;

  const lines: PdfLine[] = [];
  let y = PAGE_H - MARGIN;

  const push = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
    } = {},
  ) => {
    lines.push({
      text,
      x: MARGIN,
      y,
      size: opts.size ?? 10,
      bold: opts.bold,
      color: opts.color,
    });
    y -= opts.gap ?? LINE;
  };

  const inr = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

  // Header
  push("Finance Report", { size: 18, bold: true, color: [0.15, 0.39, 0.92] });
  push(propertyName, { size: 11, color: [0.39, 0.45, 0.55] });
  push(`Month: ${month}`, { size: 10, color: [0.39, 0.45, 0.55] });
  y -= 6;

  // Summary
  push(`Income:    ${inr(income)}`, {
    size: 11,
    bold: true,
    color: [0.09, 0.64, 0.29],
  });
  push(`Expenses:  ${inr(expenses)}`, {
    size: 11,
    bold: true,
    color: [0.86, 0.15, 0.15],
  });
  push(`Net:       ${inr(net)}`, {
    size: 11,
    bold: true,
    color: net >= 0 ? [0.15, 0.39, 0.92] : [0.86, 0.15, 0.15],
  });
  y -= 10;

  // Sections
  const addSection = (title: string, rows: string[]) => {
    y -= 6;
    push(title, { size: 12, bold: true });
    if (rows.length === 0) {
      push("No entries", { size: 10, color: [0.58, 0.64, 0.72] });
      return;
    }
    for (const row of rows) {
      // simple truncation — PDF text here is single-line
      const safe = row.length > 110 ? row.slice(0, 109) + "\u2026" : row;
      push(safe, { size: 9.5 });
    }
  };

  addSection(
    "Maintenance",
    transactions
      .filter((t) => t.category === "maintenance")
      .map(
        (t) =>
          `${t.wing || ""}  Flat ${t.flatNumber || ""}  \u00B7  ${
            t.memberName || ""
          }  \u00B7  ${t.phone || ""}  \u00B7  ${inr(t.amount)}  \u00B7  ${
            t.status
          }`,
      ),
  );

  addSection(
    "Staff",
    transactions
      .filter((t) => t.category === "salary")
      .map(
        (t) =>
          `${t.memberName || t.description || ""}  \u00B7  ${
            t.phone || ""
          }  \u00B7  ${t.memberRole || "Staff"}  \u00B7  ${inr(
            t.amount,
          )}  \u00B7  ${t.status}`,
      ),
  );

  addSection(
    "Other Expenses",
    transactions
      .filter((t) => t.category !== "maintenance" && t.category !== "salary")
      .map(
        (t) =>
          `${t.description || getCategoryLabel(t.category)}  \u00B7  ${inr(
            t.amount,
          )}  \u00B7  ${t.dueDate || ""}  \u00B7  ${t.status}`,
      ),
  );

  // Footer
  y -= 10;
  push(`Generated on ${new Date().toLocaleString()}`, {
    size: 8.5,
    color: [0.58, 0.64, 0.72],
  });

  return { lines, pageHeight: PAGE_H };
}

/**
 * Serializes a minimal one-page PDF (Helvetica only) as base64.
 * No third-party library — just the raw PDF syntax.
 */
function buildMinimalPdfBase64(lines: PdfLine[], pageHeight: number): string {
  const PAGE_W = 595.28;

  // ---- content stream ----
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

  // We must use latin-1 byte length for the stream /Length entry.
  // TextEncoder would give UTF-8 length, but we write ASCII only, so
  // length matches character count.
  const contentLength = content.length;

  // ---- object graph ----
  // 1 Catalog, 2 Pages, 3 Page, 4 Contents, 5 Helvetica, 6 Helvetica-Bold
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

  // ---- assemble ----
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

  // Base64 encode (PDF bytes are latin-1 ASCII here).
  return btoa(pdf);
}

function generatePdfBase64OnWeb(params: FinanceReportPdfInput): string {
  const { lines, pageHeight } = layoutReportLines(params);
  return buildMinimalPdfBase64(lines, pageHeight);
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

  /* ------------------------------------------------------------
     WEB PATH — generate a real PDF in-browser (no library) and
     force a direct download. Never touches expo-print, so the
     browser never opens a print dialog.
  ------------------------------------------------------------ */
  if (Platform.OS === "web") {
    const base64 = generatePdfBase64OnWeb({
      propertyName,
      month,
      income,
      expenses,
      net,
      transactions,
    });
    const fileUri = `data:application/pdf;base64,${base64}`;
    await downloadWebFile(fileUri, fileName, "application/pdf");
    return { saved: true, fileName, fileUri };
  }

  /* ------------------------------------------------------------
     NATIVE PATH — unchanged from your working APK build.
  ------------------------------------------------------------ */
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

  /* ==============================================================
     ANDROID — save directly to a user-chosen folder using SAF.
  ============================================================== */
  if (Platform.OS === "android") {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted) {
      return {
        saved: false,
        fileName,
        fileUri,
      };
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

    return {
      saved: true,
      fileName,
      fileUri: destUri,
    };
  }

  /* ==============================================================
     iOS — share sheet fallback (no "save to folder" API exists).
  ============================================================== */
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    dialogTitle: `Finance Report — ${month}`,
    UTI: "com.adobe.pdf",
  });

  return {
    saved: true,
    fileName,
    fileUri,
  };
};

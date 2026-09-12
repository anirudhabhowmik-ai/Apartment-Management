import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

import { PeopleTransaction } from "../utils/peopleTransactions";

interface FinanceReportPdfInput {
  propertyName: string;
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactions: PeopleTransaction[];
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
   MAIN EXPORT
================================================================ */

export const downloadFinanceReportPdf = async ({
  propertyName,
  month,
  income,
  expenses,
  net,
  transactions,
}: FinanceReportPdfInput): Promise<void> => {
  const html = buildFinanceReportHtml({
    propertyName,
    month,
    income,
    expenses,
    net,
    transactions,
  });

  // 1. Generate PDF bytes in memory
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

  // 2. Write to our own cache so the file has a stable, shareable URI
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("Cache directory is unavailable on this device.");
  }

  const safeMonth = month.replace(/[^\w-]+/g, "_");
  const fileName = `ai-khata-finance-${safeMonth}.pdf`;
  const fileUri = `${cacheDir}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error("PDF was written but could not be verified on disk.");
  }

  // ==============================================================
  // ANDROID — save directly to a user-chosen folder using SAF.
  //   The system folder picker appears once. After the user picks
  //   (e.g. Downloads), the PDF is written straight there. No share
  //   sheet, no Gmail/Drive prompt.
  // ==============================================================
  if (Platform.OS === "android") {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    // If the user cancels the folder picker, we bail out quietly.
    // (Caller gets a resolved promise, no error.)
    if (!permissions.granted) {
      return;
    }

    // SAF needs the raw bytes; read from the cache file we just wrote.
    const base64Bytes = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Create a new file inside the chosen directory with a .pdf mime
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      "application/pdf",
    );

    // Write the bytes to it
    await FileSystem.writeAsStringAsync(destUri, base64Bytes, {
      encoding: FileSystem.EncodingType.Base64,
    });

    Alert.alert("Downloaded", `Finance report saved as "${fileName}".`, [
      { text: "OK" },
    ]);

    return;
  }

  // ==============================================================
  // iOS — no direct "save to folder" API exists. Fall back to the
  // share sheet. The user can tap "Save to Files" there to keep a
  // copy in iCloud Drive or On My iPhone.
  // ==============================================================
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    dialogTitle: `Finance Report — ${month}`,
    UTI: "com.adobe.pdf",
  });
};

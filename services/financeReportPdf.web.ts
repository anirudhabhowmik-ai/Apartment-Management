import { PeopleTransaction } from "../utils/peopleTransactions";

interface FinanceReportPdfInput {
  propertyName: string;
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactions: PeopleTransaction[];
}

const escapePdfText = (value: string) =>
  value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

export const downloadFinanceReportPdf = async ({
  propertyName,
  month,
  income,
  expenses,
  net,
  transactions,
}: FinanceReportPdfInput) => {
  const lines: string[] = [];
  let y = 555;
  const addLine = (text: string, size = 9, bold = false) => {
    const font = bold ? "F2" : "F1";
    lines.push(
      `BT /${font} ${size} Tf 40 ${y} Td (${escapePdfText(text)}) Tj ET`,
    );
    y -= size + 7;
  };
  const addSection = (title: string, headers: string[], rows: string[][]) => {
    y -= 10;
    addLine(title, 13, true);
    addLine(headers.join(" | "), 9, true);
    if (!rows.length) {
      addLine("No entries");
      return;
    }
    rows.forEach((row) =>
      addLine(row.map((cell) => cell.slice(0, 22)).join(" | ")),
    );
  };

  const maintenance = transactions
    .filter((transaction) => transaction.category === "maintenance")
    .map((transaction) => [
      transaction.wing || "",
      transaction.flatNumber || "",
      transaction.memberName || "",
      transaction.phone || "",
      `Rs. ${transaction.amount}`,
      transaction.status,
    ]);
  const staff = transactions
    .filter((transaction) => transaction.category === "salary")
    .map((transaction) => [
      transaction.memberName || transaction.description || "",
      transaction.phone || "",
      transaction.memberRole || "Staff",
      `Rs. ${transaction.amount}`,
      transaction.status,
    ]);
  const expenseRows = transactions
    .filter(
      (transaction) =>
        transaction.category !== "maintenance" &&
        transaction.category !== "salary",
    )
    .map((transaction) => [
      transaction.description || transaction.category,
      `Rs. ${transaction.amount}`,
      transaction.dueDate,
      transaction.status,
    ]);

  addLine("AI Khata Finance Report", 20, true);
  addLine(`${propertyName} | Billing month: ${month}`, 11);
  addLine(
    `Income: Rs. ${income}    Expenses: Rs. ${expenses}    Net: Rs. ${net}`,
    11,
    true,
  );
  addSection(
    "Maintenance",
    ["Wing", "Flat", "Owner", "Phone", "Amount", "Status"],
    maintenance,
  );
  addSection("Staff", ["Name", "Phone", "Role", "Paid", "Status"], staff);
  addSection(
    "Expenses",
    ["Expense", "Amount", "Due Date", "Status"],
    expenseRows,
  );

  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const url = URL.createObjectURL(
    new Blob([new TextEncoder().encode(pdf).buffer], {
      type: "application/pdf",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `ai-khata-finance-${month}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};

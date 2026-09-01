import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { PeopleTransaction } from "../utils/peopleTransactions";

interface FinanceReportPdfInput {
  propertyName: string;
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactions: PeopleTransaction[];
}

export const downloadFinanceReportPdf = async ({
  propertyName,
  month,
  income,
  expenses,
  net,
  transactions,
}: FinanceReportPdfInput) => {
  const rows = transactions
    .map(
      (transaction) =>
        `<tr><td>${transaction.category}</td><td>${transaction.description || ""}</td><td>${transaction.wing || ""}</td><td>${transaction.flatNumber || ""}</td><td>Rs. ${transaction.amount}</td><td>${transaction.status}</td></tr>`,
    )
    .join("");
  const html = `<html><body><h1>AI Khata Finance Report</h1><p>${propertyName} | ${month}</p><p>Income: Rs. ${income} | Expenses: Rs. ${expenses} | Net: Rs. ${net}</p><table><tr><th>Category</th><th>Description</th><th>Wing</th><th>Flat</th><th>Amount</th><th>Status</th></tr>${rows}</table></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
};

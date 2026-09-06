import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
import { Platform } from "react-native";

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
  signData?: string;
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
  };
  billType: "maintenance" | "salary";
  staffRole?: string;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function generateBillPDF(data: BillData): Promise<string> {
  const {
    billNumber,
    apartmentName,
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

  // Generate the bill HTML
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=${template.fontFamily.replace(" ", "+")}&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: '${template.fontFamily}', sans-serif;
          background: ${colors.background};
          padding: 40px 20px;
          color: ${colors.text};
        }
        
        .bill-container {
          max-width: 800px;
          margin: 0 auto;
          background: ${colors.background};
          padding: 30px;
          ${
            template.showBorder
              ? `
            border: ${template.borderWidth}px solid ${template.borderColor};
            border-radius: ${template.borderRadius}px;
          `
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
            top: 50%;
            left: 50%;
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
        
        .header {
          display: flex;
          ${
            template.logoPosition === "top-center"
              ? "flex-direction: column; align-items: center;"
              : template.logoPosition === "top-right"
                ? "flex-direction: row-reverse;"
                : "flex-direction: row;"
          }
          justify-content: space-between;
          align-items: center;
          padding-bottom: 20px;
          border-bottom: 2px solid ${colors.primary};
          margin-bottom: 20px;
        }
        
        .logo-placeholder {
          width: 80px;
          height: 80px;
          background: ${colors.primary};
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
          text-align: center;
        }
        
        .header-text {
          text-align: ${
            template.logoPosition === "top-center"
              ? "center"
              : template.logoPosition === "top-right"
                ? "right"
                : "left"
          };
        }
        
        .society-name {
          font-size: 28px;
          font-weight: 700;
          color: ${colors.primary};
        }
        
        .society-address {
          font-size: 14px;
          color: ${colors.text};
          opacity: 0.8;
          margin-top: 4px;
        }
        
        .bill-title {
          font-size: 24px;
          font-weight: 700;
          color: ${colors.primary};
          text-align: center;
          margin: 20px 0;
        }
        
        .bill-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        
        .bill-number {
          font-size: 14px;
          color: ${colors.text};
          opacity: 0.7;
        }
        
        .bill-date {
          font-size: 14px;
          color: ${colors.text};
          opacity: 0.7;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin: 20px 0;
          padding: 20px;
          background: ${colors.background};
          border: 1px solid ${template.borderColor};
          border-radius: 8px;
        }
        
        .info-item {
          display: flex;
          flex-direction: column;
        }
        
        .info-label {
          font-size: 12px;
          font-weight: 600;
          color: ${colors.text};
          opacity: 0.6;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .info-value {
          font-size: 16px;
          font-weight: 600;
          margin-top: 4px;
          color: ${colors.text};
        }
        
        .amount-breakdown {
          margin: 20px 0;
          padding: 20px;
          background: ${colors.background};
          border: 1px solid ${template.borderColor};
          border-radius: 8px;
        }
        
        .amount-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid ${template.borderColor};
        }
        
        .amount-row:last-child {
          border-bottom: none;
        }
        
        .amount-row.total {
          font-weight: 700;
          font-size: 18px;
          border-top: 2px solid ${colors.primary};
          margin-top: 8px;
          padding-top: 12px;
          border-bottom: none;
        }
        
        .amount-label {
          color: ${colors.text};
          opacity: 0.8;
        }
        
        .amount-value {
          color: ${colors.text};
          font-weight: 600;
        }
        
        .amount-value.total {
          color: ${colors.primary};
          font-size: 20px;
        }
        
        .notes-section {
          margin: 20px 0;
          padding: 15px;
          background: ${colors.footerBg};
          border-radius: 8px;
        }
        
        .notes-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 5px;
          color: ${colors.text};
        }
        
        .notes-text {
          font-size: 13px;
          color: ${colors.text};
          opacity: 0.7;
        }
        
        .signature-section {
          margin: 30px 0 20px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          border-top: 2px solid ${template.borderColor};
          padding-top: 20px;
        }
        
        .signature-label {
          font-size: 14px;
          color: ${colors.text};
          opacity: 0.6;
          margin-bottom: 10px;
        }
        
        .signature-image {
          max-width: 200px;
          max-height: 80px;
          border: 1px solid ${template.borderColor};
          border-radius: 8px;
          padding: 5px;
        }
        
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 2px solid ${colors.primary};
          text-align: center;
          background: ${colors.footerBg};
          padding: 20px;
          border-radius: 8px;
        }
        
        .footer-text {
          font-size: 12px;
          color: ${colors.text};
          opacity: 0.6;
        }
        
        .footer-contact {
          font-size: 12px;
          color: ${colors.text};
          opacity: 0.6;
          margin-top: 4px;
        }
        
        @media print {
          body {
            padding: 0;
            background: white;
          }
          .bill-container {
            box-shadow: none;
            border: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="bill-container">
        ${template.showWatermark ? `<div class="watermark">${template.watermarkText || "SOCIETY"}</div>` : ""}
        
        <div class="header">
          <div class="logo-placeholder">
            ${societyName
              .split(" ")
              .map((word) => word[0])
              .join("")
              .slice(0, 3)}
          </div>
          <div class="header-text">
            <div class="society-name">${societyName}</div>
            <div class="society-address">${address}</div>
            <div class="society-address">📞 ${contactNumber} | ✉ ${email}</div>
          </div>
        </div>
        
        <div class="bill-title">
          ${billType === "maintenance" ? "MAINTENANCE BILL" : "SALARY RECEIPT"}
        </div>
        
        <div class="bill-details">
          <div class="bill-number">Bill #: ${billNumber}</div>
          <div class="bill-date">Date: ${formatDate(paidDate)}</div>
        </div>
        
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Member Name</span>
            <span class="info-value">${memberName}</span>
          </div>
          ${
            flatNumber
              ? `
            <div class="info-item">
              <span class="info-label">Flat Number</span>
              <span class="info-value">${flatNumber}</span>
            </div>
          `
              : ""
          }
          ${
            staffRole
              ? `
            <div class="info-item">
              <span class="info-label">Staff Role</span>
              <span class="info-value">${staffRole}</span>
            </div>
          `
              : ""
          }
          <div class="info-item">
            <span class="info-label">Month</span>
            <span class="info-value">${month}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Payment Date</span>
            <span class="info-value">${formatDate(paidDate)}</span>
          </div>
        </div>
        
        <div class="amount-breakdown">
          <div class="amount-row">
            <span class="amount-label">Base ${billType === "maintenance" ? "Maintenance" : "Salary"}</span>
            <span class="amount-value">${formatCurrency(amount)}</span>
          </div>
          ${
            additionalAmount
              ? `
            <div class="amount-row">
              <span class="amount-label">Additional Amount</span>
              <span class="amount-value">+${formatCurrency(additionalAmount)}</span>
            </div>
          `
              : ""
          }
          ${
            deductionAmount
              ? `
            <div class="amount-row">
              <span class="amount-label">Deduction</span>
              <span class="amount-value">-${formatCurrency(deductionAmount)}</span>
            </div>
          `
              : ""
          }
          <div class="amount-row total">
            <span class="amount-label">Total Amount</span>
            <span class="amount-value total">${formatCurrency(netAmount)}</span>
          </div>
        </div>
        
        ${
          additionalNote || deductionNote
            ? `
          <div class="notes-section">
            <div class="notes-title">Notes</div>
            ${additionalNote ? `<div class="notes-text">• Additional: ${additionalNote}</div>` : ""}
            ${deductionNote ? `<div class="notes-text">• Deduction: ${deductionNote}</div>` : ""}
          </div>
        `
            : ""
        }
        
        ${
          signData
            ? `
          <div class="signature-section">
            <div class="signature-label">Authorized Signature</div>
            <img src="${signData}" class="signature-image" alt="Signature" />
          </div>
        `
            : ""
        }
        
        <div class="footer">
          <div class="footer-text">This is a computer-generated receipt. No signature required.</div>
          <div class="footer-contact">${societyName} | ${contactNumber}</div>
          <div class="footer-text" style="margin-top: 8px; font-size: 10px;">
            Generated on ${new Date().toLocaleString()}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
      ...(Platform.OS === "android" && {
        width: 800,
        height: 1000,
        margins: {
          left: 20,
          right: 20,
          top: 20,
          bottom: 20,
        },
      }),
    });
    return uri;
  } catch (error) {
    console.error("PDF generation error:", error);
    throw error;
  }
}

export async function sharePDF(uri: string, fileName: string) {
  try {
    await shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Download Bill",
      UTI: "com.adobe.pdf",
    });
  } catch (error) {
    console.error("Share PDF error:", error);
    throw error;
  }
}

import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

import type { SignatureData } from "../store/billStore";

/* ================================================================
   TYPES
================================================================ */

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

    // Ensure viewBox exists so the SVG scales properly
    if (!/viewBox\s*=/.test(svg) && signData.width && signData.height) {
      svg = svg.replace(
        /<svg\b/i,
        `<svg viewBox="0 0 ${signData.width} ${signData.height}"`,
      );
    }

    // Ensure xmlns (some SVG builders drop it)
    if (!/xmlns\s*=/.test(svg)) {
      svg = svg.replace(/<svg\b/i, `<svg xmlns="http://www.w3.org/2000/svg"`);
    }

    // Strip intrinsic width/height so CSS controls sizing
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

  // type === "image"
  const imgStyle = signData.transparentBg ? `mix-blend-mode: multiply;` : ``;

  return `
    <div style="width:200px;height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto;">
      <img src="${escapeHtml(signData.uri)}"
           style="max-width:100%;max-height:100%;object-fit:contain;${imgStyle}"
           alt="Signature" />
    </div>
  `;
}

/**
 * Builds a safe, unique filename for a generated bill.
 */
function buildBillFileName(billNumber: string): string {
  const safeSuffix = billNumber.replace(/[^\w-]+/g, "_");
  return `Bill-${safeSuffix}.pdf`;
}

/* ================================================================
   GENERATE PDF
================================================================ */

/**
 * Generates the bill PDF and returns a file:// URI that lives inside
 * this app's OWN cache directory (FileSystem.cacheDirectory).
 *
 * IMPORTANT — why we don't just return Print.printToFileAsync's uri:
 * On some Android builds/devices, the file that expo-print writes lives
 * in a sandboxed location that expo-sharing's FileProvider is not
 * configured to read, which throws:
 *   "Not allowed to read file under given URL."
 * even though the file exists. Copying that same file with
 * FileSystem.copyAsync can fail for the same reason (source not
 * readable by our FileProvider).
 *
 * The reliable fix: ask expo-print for the PDF as a base64 string
 * (entirely in memory, no filesystem read of its sandboxed uri), then
 * write those bytes ourselves into FileSystem.cacheDirectory, which our
 * app's own FileProvider config always has permission to serve to
 * other apps via expo-sharing.
 */
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
  const signatureHtml = buildSignatureHtml(signData);

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
          padding: 30px;
          ${
            template.showBorder
              ? `border: ${template.borderWidth}px solid ${template.borderColor};
                 border-radius: ${template.borderRadius}px;`
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
          width: 80px; height: 80px;
          background: ${colors.primary};
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: white; font-weight: bold; font-size: 14px; text-align: center;
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

        .bill-number, .bill-date {
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

        .info-item { display: flex; flex-direction: column; }

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

        .amount-row:last-child { border-bottom: none; }

        .amount-row.total {
          font-weight: 700;
          font-size: 18px;
          border-top: 2px solid ${colors.primary};
          margin-top: 8px;
          padding-top: 12px;
          border-bottom: none;
        }

        .amount-label { color: ${colors.text}; opacity: 0.8; }
        .amount-value { color: ${colors.text}; font-weight: 600; }
        .amount-value.total { color: ${colors.primary}; font-size: 20px; }

        .notes-section {
          margin: 20px 0;
          padding: 15px;
          background: ${colors.footerBg};
          border-radius: 8px;
        }

        .notes-title {
          font-weight: 600; font-size: 14px;
          margin-bottom: 5px; color: ${colors.text};
        }

        .notes-text {
          font-size: 13px; color: ${colors.text}; opacity: 0.7;
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

        .signature-svg-wrap svg {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }

        .footer {
          margin-top: 30px;
          padding: 20px;
          border-top: 2px solid ${colors.primary};
          text-align: center;
          background: ${colors.footerBg};
          border-radius: 8px;
        }

        .footer-text, .footer-contact {
          font-size: 12px;
          color: ${colors.text};
          opacity: 0.6;
        }

        .footer-contact { margin-top: 4px; }

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

        <div class="header">
          <div class="logo-placeholder">
            ${escapeHtml(
              societyName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 3),
            )}
          </div>
          <div class="header-text">
            <div class="society-name">${escapeHtml(societyName)}</div>
            <div class="society-address">${escapeHtml(address)}</div>
            <div class="society-address">📞 ${escapeHtml(
              contactNumber,
            )} | ✉ ${escapeHtml(email)}</div>
          </div>
        </div>

        <div class="bill-title">
          ${billType === "maintenance" ? "MAINTENANCE BILL" : "SALARY RECEIPT"}
        </div>

        <div class="bill-details">
          <div class="bill-number">Bill #: ${escapeHtml(billNumber)}</div>
          <div class="bill-date">Date: ${escapeHtml(formatDate(paidDate))}</div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Member Name</span>
            <span class="info-value">${escapeHtml(memberName)}</span>
          </div>
          ${
            flatNumber
              ? `
            <div class="info-item">
              <span class="info-label">Flat Number</span>
              <span class="info-value">${escapeHtml(flatNumber)}</span>
            </div>`
              : ""
          }
          ${
            staffRole
              ? `
            <div class="info-item">
              <span class="info-label">Staff Role</span>
              <span class="info-value">${escapeHtml(staffRole)}</span>
            </div>`
              : ""
          }
          <div class="info-item">
            <span class="info-label">Month</span>
            <span class="info-value">${escapeHtml(month)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Payment Date</span>
            <span class="info-value">${escapeHtml(formatDate(paidDate))}</span>
          </div>
        </div>

        <div class="amount-breakdown">
          <div class="amount-row">
            <span class="amount-label">Base ${
              billType === "maintenance" ? "Maintenance" : "Salary"
            }</span>
            <span class="amount-value">${formatCurrency(amount)}</span>
          </div>
          ${
            additionalAmount
              ? `
            <div class="amount-row">
              <span class="amount-label">Additional Amount</span>
              <span class="amount-value">+${formatCurrency(
                additionalAmount,
              )}</span>
            </div>`
              : ""
          }
          ${
            deductionAmount
              ? `
            <div class="amount-row">
              <span class="amount-label">Deduction</span>
              <span class="amount-value">-${formatCurrency(
                deductionAmount,
              )}</span>
            </div>`
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
            ${
              additionalNote
                ? `<div class="notes-text">• Additional: ${escapeHtml(
                    additionalNote,
                  )}</div>`
                : ""
            }
            ${
              deductionNote
                ? `<div class="notes-text">• Deduction: ${escapeHtml(
                    deductionNote,
                  )}</div>`
                : ""
            }
          </div>`
            : ""
        }

        ${
          signData
            ? `
          <div class="signature-section">
            <div class="signature-label">Authorized Signature</div>
            ${signatureHtml}
          </div>`
            : ""
        }

        <div class="footer">
          <div class="footer-text">This is a computer-generated receipt. No signature required.</div>
          <div class="footer-contact">${escapeHtml(
            societyName,
          )} | ${escapeHtml(contactNumber)}</div>
          <div class="footer-text" style="margin-top: 8px; font-size: 10px;">
            Generated on ${escapeHtml(new Date().toLocaleString())}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    // ✅ Ask expo-print for the PDF bytes as base64, in memory.
    // We do NOT use the returned `uri` for sharing — that file lives in
    // expo-print's own sandboxed cache location, which is what was
    // causing "Not allowed to read file under given URL." on some
    // Android builds.
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

    // ✅ Write those bytes ourselves into OUR OWN cache directory.
    // This directory is always covered by this app's FileProvider,
    // so expo-sharing can read it reliably.
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error("Cache directory is unavailable on this device.");
    }

    const fileName = buildBillFileName(billNumber);
    const fileUri = `${cacheDir}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Sanity check the file actually landed where we expect.
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
   SAVE TO DEVICE (Android SAF, iOS share sheet)
================================================================ */

export async function savePDFToDevice(
  uri: string,
  fileName: string,
): Promise<{ saved: boolean; message?: string }> {
  try {
    if (Platform.OS === "android") {
      // `uri` now always points at a file we wrote ourselves into
      // FileSystem.cacheDirectory, so this read is safe.
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

    // iOS: share sheet → "Save to Files"
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

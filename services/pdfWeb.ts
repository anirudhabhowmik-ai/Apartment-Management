// services/pdfWeb.ts
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Render an HTML fragment to a multi-page A4 PDF and return it as a
 * `data:application/pdf;base64,...` URI.
 *
 * Used on web only. Native platforms use expo-print instead.
 */
export async function htmlFragmentToPdfDataUri(
  htmlFragment: string,
  containerWidth = 800,
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Web PDF generation requires a browser environment.");
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${containerWidth}px`;
  container.style.background = "#ffffff";
  container.innerHTML = htmlFragment;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: containerWidth,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);

    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: "portrait",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output("datauristring");
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

/**
 * Extract the inner HTML of the `<body>` from a full HTML document
 * string. Falls back to the raw string if parsing fails.
 */
export function extractBodyHtml(fullHtml: string): string {
  if (typeof DOMParser === "undefined") return fullHtml;
  const parsed = new DOMParser().parseFromString(fullHtml, "text/html");
  return parsed.body ? parsed.body.innerHTML : fullHtml;
}

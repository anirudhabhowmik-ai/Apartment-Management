// services/pdfWeb.ts

type AnyWindow = Window & {
  jspdf?: { jsPDF: new (opts?: any) => any };
  html2canvas?: (el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>;
};

declare const window: AnyWindow;

let loadingPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-pdf-lib="${src}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error(`Failed to load ${src}`)),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.pdfLib = src;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensurePdfLibsLoaded(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    if (!window.html2canvas) await loadScript("/html2canvas.min.js");
    if (!window.jspdf) await loadScript("/jspdf.umd.min.js");
    if (!window.html2canvas || !window.jspdf) {
      throw new Error("PDF libraries failed to initialize.");
    }
  })();
  return loadingPromise;
}

/**
 * Renders a full HTML document (including <head><style>) to a PDF
 * and triggers a silent browser download.
 *
 * The rendering container hugs its content (inline-block + explicit
 * padding) so the resulting PDF has no empty side gaps.
 */
export async function htmlToPdfDownload(
  fullHtmlDocument: string,
  fileName: string,
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Web PDF generation requires a browser environment.");
  }

  await ensurePdfLibsLoaded();

  // Parse the whole document.
  const parsed = new DOMParser().parseFromString(fullHtmlDocument, "text/html");

  // Collect all <style> blocks (head + body) so the render keeps
  // the intended styling.
  const styleTags = Array.from(parsed.querySelectorAll("style"))
    .map((el) => el.outerHTML)
    .join("\n");

  // Take only the body content, but re-attach the styles.
  const bodyHtml = parsed.body ? parsed.body.innerHTML : fullHtmlDocument;

  // Build an off-screen container that hugs its content and owns the
  // outer padding. This prevents html2canvas from rendering a wide
  // blank gutter on either side.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = "1000px";
  container.style.background = "#ffffff";
  container.style.display = "inline-block";
  container.style.padding = "40px 44px";
  container.style.boxSizing = "border-box";
  container.style.fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  container.style.color = "#0f172a";
  container.innerHTML = `${styleTags}${bodyHtml}`;
  document.body.appendChild(container);

  try {
    const canvas = await window.html2canvas!(container, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 1000,
      width: container.scrollWidth,
      height: container.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);

    const { jsPDF } = window.jspdf!;
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

    const blob: Blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    return url;
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

function clickDirectDownload(
  url: string,
  fileName: string,
  openInNewTab = false,
): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  if (openInNewTab) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadWebFile(
  uri: string,
  fileName: string,
  mimeType?: string,
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Browser download is unavailable.");
  }

  if (/^blob:/i.test(uri)) {
    const blobOrigin = new URL(uri).origin;
    if (blobOrigin !== window.location.origin) {
      throw new Error(
        "This attachment is an expired browser-local file. Reattach it to the record before downloading.",
      );
    }
  }

  let response: Response;
  try {
    response = await fetch(uri);
  } catch (error) {
    if (/^https?:\/\//i.test(uri)) {
      clickDirectDownload(uri, fileName, true);
      return;
    }
    throw error;
  }

  if (!response.ok) {
    if (/^https?:\/\//i.test(uri)) {
      clickDirectDownload(uri, fileName, true);
      return;
    }
    throw new Error(`Could not read file (${response.status}).`);
  }

  const sourceBlob = await response.blob();
  const blob =
    mimeType && sourceBlob.type !== mimeType
      ? sourceBlob.slice(0, sourceBlob.size, mimeType)
      : sourceBlob;
  const objectUrl = URL.createObjectURL(blob);

  try {
    clickDirectDownload(objectUrl, fileName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

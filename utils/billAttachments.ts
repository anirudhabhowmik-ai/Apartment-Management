import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { BillAttachment } from "../types/member";

const BILL_ATTACHMENT_DIRECTORY = "bill-attachments/";

export async function persistBillAttachment(
  attachment: BillAttachment,
  pickedFile?: File,
): Promise<BillAttachment> {
  if (!pickedFile && !attachment.uri.startsWith("file://")) return attachment;

  const source = pickedFile ?? new File(attachment.uri);
  const destinationDirectory = new Directory(
    Paths.document,
    BILL_ATTACHMENT_DIRECTORY,
  );
  if (source.uri.startsWith(destinationDirectory.uri)) return attachment;

  if (!source.exists) {
    throw new Error(
      "This attachment is no longer readable. Please select it again.",
    );
  }

  destinationDirectory.create({
    intermediates: true,
    idempotent: true,
  });

  const safeName = (attachment.name || "attachment")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-100);
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
  const destination = new File(destinationDirectory, uniqueName);

  await source.copy(destination);
  return { ...attachment, uri: destination.uri };
}

export async function pickBillPdfAttachments(
  limit: number,
): Promise<{ attachments: BillAttachment[]; selectedCount: number }> {
  if (Platform.OS === "web") {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return { attachments: [], selectedCount: 0 };

    const assets = result.assets ?? [];
    const attachments = await Promise.all(
      assets.slice(0, limit).map((asset) =>
        persistBillAttachment({
          uri: asset.uri,
          name: asset.name || "Bill.pdf",
          mimeType: asset.mimeType || "application/pdf",
        }),
      ),
    );
    return { attachments, selectedCount: assets.length };
  }

  const result = await File.pickFileAsync({
    multipleFiles: true,
    mimeTypes: ["application/pdf"],
  });
  if (result.canceled) return { attachments: [], selectedCount: 0 };

  const attachments = await Promise.all(
    result.result.slice(0, limit).map((file) =>
      persistBillAttachment(
        {
          uri: file.uri,
          name: file.name || "Bill.pdf",
          mimeType: file.type || "application/pdf",
        },
        file,
      ),
    ),
  );
  return { attachments, selectedCount: result.result.length };
}

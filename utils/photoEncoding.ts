import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export async function encodePhotoForServer(localUri: string): Promise<string> {
  if (!localUri) return localUri;
  if (localUri.startsWith("data:") || /^https?:\/\//i.test(localUri)) {
    return localUri;
  }

  if (Platform.OS === "web") {
    const response = await fetch(localUri);
    if (!response.ok) {
      throw new Error("Could not read the selected photo in this browser.");
    }

    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not encode the selected photo."));
      };
      reader.onerror = () =>
        reject(
          reader.error || new Error("Could not encode the selected photo."),
        );
      reader.readAsDataURL(blob);
    });
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const lower = localUri.toLowerCase();
  const mime = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

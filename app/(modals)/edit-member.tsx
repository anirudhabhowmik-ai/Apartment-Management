// app/(modals)/edit-member.tsx
import { Ionicons } from "@expo/vector-icons";
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  requestPermissionsAsync,
} from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystemModern from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DatePickerModal from "../../components/DatePickerModal";
import { useExpenses, useMembers, useStaff } from "../../hooks/useManagement";
import { useAuthStore } from "../../store/useAuthStore";
import type { BillAttachment, ManagementType, MemberRole } from "../../types";

type TransactionKind = "expense" | "income";

interface RoleOption {
  role: MemberRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: {
    number: string;
    label?: string;
  }[];
}

const BLUE = "#2563EB";
const BLUE_LIGHT = "#EFF6FF";
const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const BACKGROUND = "#F8FAFC";
const RED = "#DC2626";
const GREEN = "#16A34A";

const MAX_BILL_ATTACHMENTS = 2;

const FLAT_ROLES: RoleOption[] = [
  { role: "flat", label: "Flat Owner", icon: "business-outline" },
  { role: "shop", label: "Shop Owner", icon: "storefront-outline" },
];

const SERVANT_ROLES: RoleOption[] = [
  { role: "sweeper", label: "Sweeper", icon: "sparkles-outline" },
  { role: "security", label: "Security", icon: "shield-outline" },
  { role: "maintenance", label: "Maintenance", icon: "construct-outline" },
  { role: "gardener", label: "Gardener", icon: "leaf-outline" },
  { role: "driver", label: "Driver", icon: "car-outline" },
  { role: "accountant", label: "Accountant", icon: "calculator-outline" },
];

const EXPENSE_ROLES: RoleOption[] = [
  { role: "electricity", label: "Electricity", icon: "flash-outline" },
  { role: "water", label: "Water", icon: "water-outline" },
  { role: "maintenance", label: "Maintenance", icon: "construct-outline" },
  { role: "other", label: "Other", icon: "ellipsis-horizontal-circle-outline" },
];

const INCOME_SOURCES: RoleOption[] = [
  { role: "hall_rent", label: "Community Hall Rent", icon: "business-outline" },
  { role: "parking_rent", label: "Parking Rent", icon: "car-outline" },
  { role: "advertisement", label: "Advertisement", icon: "megaphone-outline" },
  {
    role: "interest",
    label: "Interest / Deposit",
    icon: "trending-up-outline",
  },
  {
    role: "other_income",
    label: "Other Income",
    icon: "ellipsis-horizontal-circle-outline",
  },
];

// ---------------------------------------------------------------------------
// Free-form role normalization. Mirrors the backend `normalizeRole()`.
// ---------------------------------------------------------------------------
function normalizeRoleInput(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizePhone(raw?: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function toDateInput(raw: unknown): string {
  if (raw === null || raw === undefined) return "";

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }

    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] : "";
  }

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return "";
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
}

const pickExtension = (mimeOrUri?: string | null): string => {
  const s = String(mimeOrUri || "").toLowerCase();
  if (s.includes("image/png") || s.endsWith(".png")) return "png";
  if (s.includes("image/webp") || s.endsWith(".webp")) return "webp";
  if (s.includes("application/pdf") || s.endsWith(".pdf")) return "pdf";
  if (s.includes("image/gif") || s.endsWith(".gif")) return "gif";
  if (s.includes("image/heic") || s.endsWith(".heic")) return "heic";
  if (s.includes("image/jpeg") || s.endsWith(".jpg")) return "jpg";
  if (s.includes("image/jpg") || s.endsWith(".jpeg")) return "jpg";
  return "jpg";
};

const pickMimeType = (mimeOrUri?: string | null): string => {
  const ext = pickExtension(mimeOrUri);
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
};

// ---------------------------------------------------------------
// PDF helpers (accept `mimeType?: string | null` because
// BillAttachment allows null)
// ---------------------------------------------------------------
const isPdfAttachment = (att: {
  uri?: string;
  mimeType?: string | null;
  name?: string;
}): boolean => {
  const mime = (att.mimeType ?? "").toLowerCase();
  const name = (att.name ?? "").toLowerCase();
  const uri = att.uri ?? "";
  if (mime === "application/pdf" || mime.includes("pdf")) return true;
  if (name.endsWith(".pdf")) return true;
  if (uri.startsWith("data:application/pdf")) return true;
  if (/\.pdf(\?|$)/i.test(uri)) return true;
  return false;
};

const fileIconForBill = (att: {
  uri?: string;
  mimeType?: string | null;
  name?: string;
}): keyof typeof Ionicons.glyphMap => {
  if (isPdfAttachment(att)) return "document-text";
  if ((att.mimeType ?? "").startsWith("image/")) return "image";
  if (att.name?.toLowerCase().endsWith(".pdf")) return "document-text";
  return "document-attach";
};

async function saveBillWithFolderPicker(
  uri: string,
  suggestedName: string,
  sourceHint?: string | null,
): Promise<{ savedUri: string } | null> {
  const safeBase = (suggestedName || "bill").replace(/[^\w\-]+/g, "_");
  const ext = pickExtension(sourceHint || uri);
  const mimeType = pickMimeType(sourceHint || uri);
  const fileName = `${safeBase}.${ext}`;

  if (Platform.OS === "web") {
    try {
      let href = uri;
      let isBlob = false;

      if (uri.startsWith("data:")) {
        const match = uri.match(/^data:([^;]+);base64,(.*)$/);
        if (!match) throw new Error("Invalid data URI");
        const mime = match[1] || mimeType;
        const b64 = match[2];
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        href = URL.createObjectURL(blob);
        isBlob = true;
      }

      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (isBlob) setTimeout(() => URL.revokeObjectURL(href), 1000);
      return { savedUri: fileName };
    } catch (e: any) {
      throw new Error(e?.message || "Browser download failed.");
    }
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("Cache directory not available.");
  const tempUri = `${cacheDir}${fileName}`;

  try {
    if (uri.startsWith("data:")) {
      const match = uri.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) throw new Error("Invalid data URI");
      const b64 = match[2];
      await FileSystem.writeAsStringAsync(tempUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (uri.startsWith("file://")) {
      await FileSystem.copyAsync({ from: uri, to: tempUri });
    } else {
      await FileSystem.downloadAsync(uri, tempUri);
    }
  } catch (e: any) {
    throw new Error(e?.message || "Failed to prepare file for saving.");
  }

  if (Platform.OS === "android") {
    const SAF: any =
      (FileSystemModern as any)?.StorageAccessFramework ??
      (FileSystem as any)?.StorageAccessFramework;
    if (SAF?.requestDirectoryPermissionsAsync) {
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted) return null;

      const base64Data = await FileSystem.readAsStringAsync(tempUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileUri = await SAF.createFileAsync(
        perm.directoryUri,
        fileName,
        mimeType,
      );

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return { savedUri: fileUri };
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(tempUri, {
      mimeType,
      dialogTitle: `Save ${fileName}`,
    });
    return { savedUri: tempUri };
  }

  throw new Error("Saving is not available on this device.");
}

async function downloadBillAttachment(
  uri?: string | null,
  name?: string | null,
): Promise<void> {
  if (!uri) {
    Alert.alert("No bill", "This attachment has no file.");
    return;
  }

  const baseName = (name || "bill").replace(/\.[^.]+$/, "");

  try {
    let hint: string | null = null;
    if (uri.startsWith("data:")) {
      const m = uri.match(/^data:([^;]+);/);
      hint = m?.[1] || null;
    } else {
      hint = uri;
    }

    const result = await saveBillWithFolderPicker(uri, baseName, hint);
    if (!result) return;
    Alert.alert("Downloaded", "Bill saved successfully.");
  } catch (e: any) {
    console.warn("downloadBillAttachment failed:", e);
    Alert.alert(
      "Download failed",
      e?.message || "Unable to save the bill attachment.",
    );
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIEWPORT = Math.min(SCREEN_WIDTH - 64, 320);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface RawImage {
  uri: string;
  width: number;
  height: number;
}

interface PhotoAdjustModalProps {
  visible: boolean;
  image: RawImage | null;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function PhotoAdjustModal({
  visible,
  image,
  onCancel,
  onConfirm,
}: PhotoAdjustModalProps) {
  const [zoom, setZoom] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (visible && image) {
      setZoom(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [visible, image]);

  const baseScale = useMemo(() => {
    if (!image || !image.width || !image.height) return 1;
    return VIEWPORT / Math.min(image.width, image.height);
  }, [image]);

  const effectiveScale = baseScale * zoom;
  const displayWidth = (image?.width ?? 0) * effectiveScale;
  const displayHeight = (image?.height ?? 0) * effectiveScale;

  const clampTranslate = (t: { x: number; y: number }, currentZoom: number) => {
    if (!image) return { x: 0, y: 0 };
    const scale = baseScale * currentZoom;
    const dW = image.width * scale;
    const dH = image.height * scale;
    const maxX = Math.max(0, (dW - VIEWPORT) / 2);
    const maxY = Math.max(0, (dH - VIEWPORT) / 2);
    return {
      x: clampNumber(t.x, -maxX, maxX),
      y: clampNumber(t.y, -maxY, maxY),
    };
  };

  useEffect(() => {
    setTranslate((t) => clampTranslate(t, zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, image]);

  const zoomRef = useRef(zoom);
  const translateRef = useRef(translate);
  const imageRef = useRef(image);
  const baseScaleRef = useRef(baseScale);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);
  useEffect(() => {
    imageRef.current = image;
  }, [image]);
  useEffect(() => {
    baseScaleRef.current = baseScale;
  }, [baseScale]);

  const clampTranslateFromRefs = (
    t: { x: number; y: number },
    currentZoom: number,
  ) => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };
    const scale = baseScaleRef.current * currentZoom;
    const dW = img.width * scale;
    const dH = img.height * scale;
    const maxX = Math.max(0, (dW - VIEWPORT) / 2);
    const maxY = Math.max(0, (dH - VIEWPORT) / 2);
    return {
      x: clampNumber(t.x, -maxX, maxX),
      y: clampNumber(t.y, -maxY, maxY),
    };
  };

  type ActiveGesture =
    | {
        mode: "pinch";
        touchIds: [number, number];
        startDistance: number;
        startZoom: number;
      }
    | {
        mode: "pan";
        touchId: number;
        startTouch: { x: number; y: number };
        startTranslate: { x: number; y: number };
      };

  const gestureRef = useRef<ActiveGesture | null>(null);

  const getSortedTouches = (touches: any[]) =>
    [...touches]
      .map((t) => ({
        identifier: t.identifier as number,
        pageX: t.pageX as number,
        pageY: t.pageY as number,
      }))
      .sort((a, b) => a.identifier - b.identifier);

  const beginGesture = (touches: any[]) => {
    const pts = getSortedTouches(touches);
    if (pts.length >= 2) {
      const [a, b] = pts;
      const dx = a.pageX - b.pageX;
      const dy = a.pageY - b.pageY;
      gestureRef.current = {
        mode: "pinch",
        touchIds: [a.identifier, b.identifier],
        startDistance: Math.sqrt(dx * dx + dy * dy),
        startZoom: zoomRef.current,
      };
    } else if (pts.length === 1) {
      gestureRef.current = {
        mode: "pan",
        touchId: pts[0].identifier,
        startTouch: { x: pts[0].pageX, y: pts[0].pageY },
        startTranslate: { ...translateRef.current },
      };
    } else {
      gestureRef.current = null;
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        beginGesture(evt.nativeEvent.touches);
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        const gesture = gestureRef.current;

        const expectedCount =
          gesture?.mode === "pinch" ? 2 : gesture?.mode === "pan" ? 1 : 0;

        if (touches.length > 0 && touches.length !== expectedCount) {
          beginGesture(touches);
        }

        const g = gestureRef.current;
        if (!g) return;

        if (g.mode === "pinch" && touches.length >= 2) {
          const sorted = getSortedTouches(touches);
          const tracked = sorted.filter((p) =>
            g.touchIds.includes(p.identifier),
          );
          const [a, b] = tracked.length >= 2 ? tracked : sorted.slice(0, 2);

          const dx = a.pageX - b.pageX;
          const dy = a.pageY - b.pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (g.startDistance > 0) {
            const nextZoom = clampNumber(
              g.startZoom * (distance / g.startDistance),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            zoomRef.current = nextZoom;
            setZoom(nextZoom);
          }
        } else if (g.mode === "pan" && touches.length === 1) {
          const touch = touches[0];
          const dx = touch.pageX - g.startTouch.x;
          const dy = touch.pageY - g.startTouch.y;
          const next = clampTranslateFromRefs(
            { x: g.startTranslate.x + dx, y: g.startTranslate.y + dy },
            zoomRef.current,
          );
          translateRef.current = next;
          setTranslate(next);
        }
      },

      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const remaining = evt.nativeEvent.touches;
        if (remaining.length > 0) {
          beginGesture(remaining);
        } else {
          gestureRef.current = null;
        }
        const clamped = clampTranslateFromRefs(
          translateRef.current,
          zoomRef.current,
        );
        translateRef.current = clamped;
        setTranslate(clamped);
      },

      onPanResponderTerminate: () => {
        gestureRef.current = null;
      },
    }),
  ).current;

  const handleReset = () => {
    setZoom(1);
    setTranslate({ x: 0, y: 0 });
  };

  const handleConfirm = async () => {
    if (!image) return;
    setProcessing(true);
    try {
      const scale = baseScale * zoom;
      const cropSize = VIEWPORT / scale;

      let originX =
        image.width / 2 - VIEWPORT / (2 * scale) - translate.x / scale;
      let originY =
        image.height / 2 - VIEWPORT / (2 * scale) - translate.y / scale;

      originX = clampNumber(originX, 0, Math.max(0, image.width - cropSize));
      originY = clampNumber(originY, 0, Math.max(0, image.height - cropSize));

      const result = await ImageManipulator.manipulateAsync(
        image.uri,
        [
          {
            crop: { originX, originY, width: cropSize, height: cropSize },
          },
          { resize: { width: 500, height: 500 } },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      onConfirm(result.uri);
    } catch (err) {
      console.error("Error adjusting photo:", err);
      onConfirm(image.uri);
    } finally {
      setProcessing(false);
    }
  };

  if (!image) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={adjustStyles.backdrop}>
        <View style={adjustStyles.card}>
          <Text style={adjustStyles.title}>Adjust Photo</Text>
          <Text style={adjustStyles.subtitle}>
            Pinch to zoom • Drag to reposition
          </Text>

          <View style={adjustStyles.viewportWrapper}>
            <View
              style={[
                adjustStyles.viewport,
                { width: VIEWPORT, height: VIEWPORT },
              ]}
              {...panResponder.panHandlers}
            >
              <Image
                source={{ uri: image.uri }}
                style={{
                  position: "absolute",
                  width: displayWidth,
                  height: displayHeight,
                  left: VIEWPORT / 2 - displayWidth / 2 + translate.x,
                  top: VIEWPORT / 2 - displayHeight / 2 + translate.y,
                }}
                resizeMode="cover"
              />
              <View
                style={[adjustStyles.circleGuide, { pointerEvents: "none" }]}
              />
              <View style={adjustStyles.zoomLevelBadge}>
                <Text style={adjustStyles.zoomLevelText}>
                  {Math.round(zoom * 100)}%
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={adjustStyles.resetButton}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={14} color="#64748b" />
            <Text style={adjustStyles.resetText}>Reset Position & Zoom</Text>
          </TouchableOpacity>

          <View style={adjustStyles.actionRow}>
            <TouchableOpacity
              style={adjustStyles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={processing}
            >
              <Text style={adjustStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={adjustStyles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.85}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={adjustStyles.confirmText}>Use Photo</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const adjustStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  subtitle: { fontSize: 12.5, color: "#64748b", marginBottom: 16 },
  viewportWrapper: { alignItems: "center", justifyContent: "center" },
  viewport: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  circleGuide: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  zoomLevelBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  zoomLevelText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  resetText: { fontSize: 12.5, fontWeight: "600", color: "#64748b" },
  actionRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 16 },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  confirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#1a73e8",
  },
  confirmText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
});

export default function EditMemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    memberId?: string | string[];
    accountId?: string | string[];
    groupId?: string | string[];
    groupType?: string | string[];
  }>();

  const pick = (raw: string | string[] | undefined): string => {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === "string" ? v.trim() : "";
  };

  const memberId = pick(params.memberId);
  const accountId = pick(params.accountId) || pick(params.groupId);

  const rawGroupType = pick(params.groupType).toLowerCase();
  const groupType: ManagementType =
    rawGroupType === "staff"
      ? "staff"
      : rawGroupType === "expense"
        ? "expense"
        : "apartment";

  const membersHook = useMembers(accountId || null);
  const staffHook = useStaff(accountId || null);
  const expensesHook = useExpenses(accountId || null);

  const activeHook =
    groupType === "staff"
      ? staffHook
      : groupType === "expense"
        ? expensesHook
        : membersHook;

  const { getById, update, remove } = activeHook;

  const member = getById(memberId);

  const { user } = useAuthStore();

  const isSelf = !!user?.id && !!member?.userId && user.id === member.userId;

  const identityLocked = !isSelf && !!(member as any)?.hasAccess;

  let roleOptions: RoleOption[] = [];
  if (groupType === "apartment") roleOptions = FLAT_ROLES;
  else if (groupType === "staff") roleOptions = SERVANT_ROLES;
  else if (groupType === "expense") roleOptions = EXPENSE_ROLES;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole | null>(null);
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRole, setCustomRole] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [wing, setWing] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [maintenanceAmount, setMaintenanceAmount] = useState("");

  const [monthlySalary, setMonthlySalary] = useState("");

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<"paid" | "due">("paid");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [billAttachments, setBillAttachments] = useState<BillAttachment[]>([]);

  const [transactionKind, setTransactionKind] =
    useState<TransactionKind>("expense");
  const isIncome = transactionKind === "income";

  const activeCategoryOptions = isIncome ? INCOME_SOURCES : EXPENSE_ROLES;

  const [showDatePicker, setShowDatePicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityName, setIdentityName] = useState("");
  const [identityPhone, setIdentityPhone] = useState("");
  const [identityPhotoUri, setIdentityPhotoUri] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState("");

  const [showLockedInfo, setShowLockedInfo] = useState(false);

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [isBillPhotoMode, setIsBillPhotoMode] = useState(false);

  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);

  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  const originalRef = useRef<Record<string, any> | null>(null);

  const deleteButtonLabel =
    groupType === "expense"
      ? "Delete Expense"
      : groupType === "staff"
        ? "Delete Staff Role"
        : "Delete Member Property";

  const deleteTitle =
    groupType === "expense"
      ? "Delete Expense?"
      : groupType === "staff"
        ? "Delete Staff Role?"
        : "Delete Member Property?";

  const deleteConfirmText =
    groupType === "expense"
      ? "Delete"
      : groupType === "staff"
        ? "Delete Staff Role"
        : "Delete Member Property";

  const getHeaderTitle = () => {
    if (groupType === "expense")
      return isIncome ? "Edit Income" : "Edit Expense";
    if (groupType === "staff") return "Edit Staff";
    if (groupType === "apartment") return "Edit Member";
    return "Edit Member";
  };

  const filteredContacts = useMemo(() => {
    const search = contactSearch.toLowerCase().trim();
    if (!search) return contactsList;

    return contactsList.filter((contact) => {
      const nameMatch = contact.name.toLowerCase().includes(search);
      const phoneMatch = contact.phoneNumbers.some((p) =>
        p.number.toLowerCase().includes(search),
      );
      return nameMatch || phoneMatch;
    });
  }, [contactsList, contactSearch]);

  const buildFormSnapshot = (): Record<string, any> => ({
    name: name.trim(),
    phone: phone.replace(/\D/g, "").slice(-10),
    role: role ?? "",
    isCustomRole,
    customRole: isCustomRole ? normalizeRoleInput(customRole) : "",
    photoUri: photoUri ?? "",
    wing: wing.trim(),
    flatNumber: flatNumber.trim(),
    areaSqft: areaSqft.trim(),
    parkingAvailable,
    maintenanceAmount: maintenanceAmount.trim(),
    monthlySalary: monthlySalary.trim(),
    expenseAmount: expenseAmount.trim(),
    expenseStatus,
    reminderEnabled,
    expenseDescription: expenseDescription.trim(),
    dueDate: dueDate ?? "",
    transactionKind,
    billAttachmentsKey: billAttachments
      .map((b) => `${b.uri}|${b.name ?? ""}`)
      .join("::"),
  });

  useEffect(() => {
    if (!member) return;

    setName(member.name ?? "");

    let memberPhoneValue = member.phone || "";
    memberPhoneValue = memberPhoneValue
      .replace(/[^0-9]/g, "")
      .replace(/^91/, "")
      .replace(/^0/, "");
    if (memberPhoneValue.length > 10) {
      memberPhoneValue = memberPhoneValue.slice(-10);
    }
    setPhone(memberPhoneValue);
    setPhotoUri(member.photoUri || null);

    const normalizedMemberRole = normalizeRoleInput(member.role ?? "");

    const isStandardRole = roleOptions.some(
      (option) =>
        normalizeRoleInput(String(option.role)) === normalizedMemberRole,
    );

    if (isStandardRole) {
      setRole((normalizedMemberRole as MemberRole) ?? null);
      setIsCustomRole(false);
      setCustomRole("");
    } else {
      setIsCustomRole(true);
      setRole((normalizedMemberRole as MemberRole) || null);
      setCustomRole(normalizedMemberRole || "");
    }

    if (groupType === "apartment" && "flatNumber" in member) {
      setWing(member.wing || "");
      setFlatNumber(member.flatNumber || "");
      setAreaSqft(member.areaSqft?.toString() || "");
      setParkingAvailable(member.parkingAvailable || false);
      setMaintenanceAmount(member.maintenanceAmount?.toString() || "");
    }

    if (groupType === "staff" && "monthlySalary" in member) {
      setMonthlySalary(member.monthlySalary?.toString() || "");
    }

    if (groupType === "expense" && "amount" in member) {
      setTransactionKind(
        member.transactionType === "income" ? "income" : "expense",
      );
      setExpenseAmount(member.amount?.toString() || "");
      setExpenseStatus(member.status || "paid");
      setReminderEnabled(member.reminderEnabled || false);
      setDueDate(toDateInput(member.dueDate));
      setExpenseDescription(member.description || "");
      setRole((member.role as MemberRole) || null);
      setBillAttachments(member.billAttachments || []);
    }

    const t = setTimeout(() => {
      originalRef.current = buildFormSnapshot();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, groupType]);

  // ── IDENTITY EDITOR ─────────────────────────────────────────

  const openIdentityEditor = () => {
    if (groupType === "expense") return;

    if (isSelf) {
      router.push("/(modals)/edit-profile");
      return;
    }

    if (identityLocked) {
      setShowLockedInfo(true);
      return;
    }

    setIdentityName(name);
    setIdentityPhone(phone);
    setIdentityPhotoUri(photoUri);
    setIdentityError("");
    setShowIdentityModal(true);
  };

  const closeIdentityEditor = () => {
    setShowIdentityModal(false);
    setIdentityError("");
  };

  const saveIdentityEditor = () => {
    const trimmedName = identityName.trim();
    const cleanPhone = identityPhone.replace(/\D/g, "").slice(-10);

    if (!trimmedName) {
      setIdentityError("Name is required");
      return;
    }
    if (cleanPhone.length !== 10) {
      setIdentityError("Phone number must be 10 digits");
      return;
    }

    setName(trimmedName);
    setPhone(cleanPhone);
    setPhotoUri(identityPhotoUri);
    setShowIdentityModal(false);
    setIdentityError("");
  };

  const openIdentityPhotoPicker = () => {
    setIsBillPhotoMode(false);
    setShowPhotoOptions(true);
  };

  const showPhotoSelectionOptions = (forBill: boolean = false) => {
    setIsBillPhotoMode(forBill);
    setShowPhotoOptions(true);
  };

  const takePhoto = async () => {
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Permission to access camera is required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      if (isBillPhotoMode) {
        setBillAttachments((cur) => {
          if (cur.length >= MAX_BILL_ATTACHMENTS) {
            Alert.alert(
              "Attachment limit reached",
              `You can attach at most ${MAX_BILL_ATTACHMENTS} files.`,
            );
            return cur;
          }
          return [
            ...cur,
            {
              uri: asset.uri,
              name: asset.fileName || "Bill image",
              mimeType: asset.mimeType,
            },
          ];
        });
      } else {
        setRawImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
        setShowAdjustModal(true);
      }
    }
  };

  const choosePhoto = async () => {
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Permission to access photos is required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: isBillPhotoMode,
    });

    if (!result.canceled && result.assets[0]) {
      const assets = result.assets;

      if (isBillPhotoMode) {
        setBillAttachments((cur) => {
          const remaining = MAX_BILL_ATTACHMENTS - cur.length;
          if (remaining <= 0) {
            Alert.alert(
              "Attachment limit reached",
              `You can attach at most ${MAX_BILL_ATTACHMENTS} files.`,
            );
            return cur;
          }
          const next = assets.slice(0, remaining).map((asset) => ({
            uri: asset.uri,
            name: asset.fileName || "Bill image",
            mimeType: asset.mimeType,
          }));
          if (assets.length > remaining) {
            Alert.alert(
              "Some files were skipped",
              `Only ${remaining} slot${
                remaining === 1 ? "" : "s"
              } available. Attached ${next.length} of ${assets.length} files.`,
            );
          }
          return [...cur, ...next];
        });
      } else {
        const asset = assets[0];
        setRawImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
        setShowAdjustModal(true);
      }
    }
  };

  const chooseBillPdf = async () => {
    setShowPhotoOptions(false);
    try {
      const remaining = MAX_BILL_ATTACHMENTS - billAttachments.length;
      if (remaining <= 0) {
        Alert.alert(
          "Attachment limit reached",
          `You can attach at most ${MAX_BILL_ATTACHMENTS} files. Remove one to add more.`,
        );
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      if (!result.assets || result.assets.length === 0) return;

      const picked: BillAttachment[] = [];
      for (const asset of result.assets) {
        if (picked.length >= remaining) break;
        picked.push({
          uri: asset.uri,
          name: asset.name || "Bill.pdf",
          mimeType: asset.mimeType || "application/pdf",
        } as BillAttachment);
      }

      setBillAttachments((cur) => [...cur, ...picked]);

      if (result.assets.length > remaining) {
        Alert.alert(
          "Some files were skipped",
          `Only ${remaining} slot${
            remaining === 1 ? "" : "s"
          } available. Attached ${picked.length} of ${result.assets.length} files.`,
        );
      }

      setError("");
    } catch (e: any) {
      console.warn("[edit-member] chooseBillPdf failed:", e);
      setError(e?.message || "Could not pick PDF. Please try again.");
    }
  };

  const handleAdjustConfirm = (uri: string) => {
    setPhotoUri(uri);
    setIdentityPhotoUri(uri);
    setShowAdjustModal(false);
    setRawImage(null);
  };

  const handleAdjustCancel = () => {
    setShowAdjustModal(false);
    setRawImage(null);
  };

  const pickContact = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Contact picker is only available on mobile devices. Please enter the phone number manually.",
        [{ text: "OK" }],
      );
      return;
    }

    try {
      setLoadingContacts(true);
      setError("");

      const { status } = await requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your contacts to help you quickly add phone numbers.",
          [{ text: "Cancel", style: "cancel" }, { text: "OK" }],
        );
        setError("Permission to access contacts is required");
        return;
      }

      const contacts = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        { sortOrder: ContactsSortOrder.GivenName },
      );

      if (!contacts || contacts.length === 0) {
        setError("No contacts found on your device");
        return;
      }

      const mapped: ContactData[] = contacts
        .filter((c: any) => c.phones && c.phones.length > 0)
        .map((c: any) => ({
          id: c.id ?? `${c.fullName ?? "unknown"}-${Math.random()}`,
          name: c.fullName || "Unknown",
          phoneNumbers: (c.phones ?? []).map((p: any) => ({
            number: p.number || "",
            label: p.label || undefined,
          })),
        }));

      if (mapped.length === 0) {
        setError("No contacts with phone numbers found");
        return;
      }

      setContactSearch("");
      setContactsList(mapped);
      setShowContactPicker(true);
    } catch (err) {
      console.error("Error fetching contacts:", err);
      setError("Failed to fetch contacts. Please try again.");
    } finally {
      setLoadingContacts(false);
    }
  };

  const selectContact = (contact: ContactData) => {
    if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) {
      setError("Selected contact doesn't have a phone number");
      return;
    }

    let value = contact.phoneNumbers[0].number || "";
    value = value.replace(/[^0-9]/g, "");
    value = value.replace(/^91/, "");
    value = value.replace(/^0/, "");
    if (value.length > 10) value = value.slice(-10);

    if (value.length !== 10) {
      setError("Selected contact does not have a valid 10-digit phone number");
      return;
    }

    if (showIdentityModal) {
      setIdentityPhone(value);
      if (!identityName.trim() && contact.name) {
        setIdentityName(contact.name);
      }
    } else {
      setPhone(value);
      if (!name.trim() && contact.name) setName(contact.name);
    }

    setFieldErrors((cur) => ({ ...cur, phone: "" }));
    setError("");
    setContactSearch("");
    setShowContactPicker(false);
  };

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  const handleUpdate = async () => {
    setError("");

    const errors: Record<string, string> = {};

    if (!identityLocked && groupType !== "expense") {
      if (!name.trim()) errors.name = "Name is required";
      if (!phone.trim()) {
        errors.phone = "Phone number is required";
      } else if (phone.replace(/\D/g, "").length !== 10) {
        errors.phone = "Phone number must be 10 digits";
      }
    }

    if (groupType === "expense") {
      if (!name.trim()) errors.name = "Name is required";
    } else if (isCustomRole) {
      if (!normalizeRoleInput(customRole)) {
        errors.role = "Please enter a custom role name";
      }
    } else {
      if (!role) errors.role = "Please select a role";
    }

    if (groupType === "apartment") {
      if (!flatNumber.trim()) errors.flatNumber = "Flat number is required";
      if (!maintenanceAmount.trim()) {
        errors.maintenanceAmount = "Maintenance amount is required";
      } else if (isNaN(Number(maintenanceAmount))) {
        errors.maintenanceAmount = "Maintenance amount must be a number";
      }
    }

    if (groupType === "staff") {
      if (!monthlySalary.trim()) {
        errors.monthlySalary = "Monthly salary is required";
      } else if (isNaN(Number(monthlySalary))) {
        errors.monthlySalary = "Monthly salary must be a number";
      }
    }

    if (groupType === "expense") {
      if (!expenseAmount.trim()) {
        errors.expenseAmount = "Amount is required";
      } else if (isNaN(Number(expenseAmount))) {
        errors.expenseAmount = "Amount must be a number";
      }
      if (!role) errors.role = "Please choose a category";
      if (billAttachments.length > MAX_BILL_ATTACHMENTS) {
        errors.billAttachments = `You can attach at most ${MAX_BILL_ATTACHMENTS} files.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix all the errors");
      return;
    }

    const current = buildFormSnapshot();
    const original = originalRef.current;

    if (original) {
      const keys = new Set([...Object.keys(original), ...Object.keys(current)]);
      let changed = false;
      for (const k of keys) {
        if ((original as any)[k] !== (current as any)[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        Alert.alert(
          "No changes to save",
          "You haven't made any changes yet. Update a field and try again.",
          [{ text: "OK" }],
        );
        return;
      }
    }

    setFieldErrors({});
    setLoading(true);

    const effectiveRole = isCustomRole ? normalizeRoleInput(customRole) : role;

    const updateData: any = {
      role: effectiveRole,
    };

    if (!identityLocked && groupType !== "expense") {
      const trimmedName = name.trim();
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);

      if (trimmedName && trimmedName !== (member?.name ?? "")) {
        updateData.name = trimmedName;
      }
      if (cleanPhone && cleanPhone !== normalizePhone(member?.phone)) {
        updateData.phone = cleanPhone;
      }
      if (photoUri && photoUri !== (member?.photoUri ?? null)) {
        updateData.photoUri = photoUri;
      }
    }

    if (groupType === "apartment") {
      if (wing && wing.trim()) updateData.wing = wing.trim();
      updateData.flatNumber = flatNumber.trim();
      if (areaSqft && !isNaN(Number(areaSqft))) {
        updateData.areaSqft = Number(areaSqft);
      }
      updateData.parkingAvailable = parkingAvailable;
      updateData.maintenanceAmount = Number(maintenanceAmount);
    }

    if (groupType === "staff") {
      updateData.monthlySalary = Number(monthlySalary);
    }

    if (groupType === "expense") {
      updateData.name = name.trim();
      updateData.amount = Number(expenseAmount);
      updateData.role = role;
      updateData.transactionType = transactionKind;
      updateData.status = expenseStatus;
      updateData.reminderEnabled =
        expenseStatus === "due" ? reminderEnabled : false;
      updateData.dueDate = toDateInput(dueDate) || undefined;
      updateData.description = expenseDescription.trim() || undefined;
      updateData.billAttachments = billAttachments;
    }

    try {
      await update(memberId, updateData);
      router.back();
    } catch (e: any) {
      console.error("[edit-member] update failed:", e);
      setError(
        e?.message ||
          `Failed to update ${
            groupType === "staff"
              ? "staff"
              : groupType === "expense"
                ? "expense"
                : "member"
          }`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => setShowDeleteConfirmation(true);

  const confirmDelete = async () => {
    try {
      setLoading(true);
      setError("");
      setFieldErrors({});

      await remove(memberId);

      setShowDeleteConfirmation(false);
      router.back();
    } catch (e: any) {
      console.error("Delete error:", e);
      setError(e.message || `Failed to delete. Please try again.`);
      setLoading(false);
    }
  };

  if (!member) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: getHeaderTitle() }} />
        <View style={styles.centerContent}>
          <View style={styles.notFoundIcon}>
            <Ionicons name="person-outline" size={34} color="#2563eb" />
          </View>
          <Text style={styles.notFoundTitle}>
            {groupType === "staff"
              ? "Staff"
              : groupType === "expense"
                ? "Expense"
                : "Member"}{" "}
            not found
          </Text>
          <Text style={styles.notFoundSubtitle}>
            This record may have already been removed.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ title: getHeaderTitle() }} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {groupType !== "expense" && (
          <TouchableOpacity
            style={styles.identityCard}
            onPress={openIdentityEditor}
            activeOpacity={0.85}
          >
            <View style={styles.identityAvatarWrapper}>
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={styles.identityAvatarImage}
                />
              ) : (
                <View style={styles.identityAvatarPlaceholder}>
                  <Ionicons name="person" size={34} color="#2563eb" />
                </View>
              )}
              {!identityLocked && !isSelf ? (
                <View style={styles.identityAvatarBadge}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              ) : null}
            </View>

            <View style={styles.identityInfo}>
              <Text style={styles.identityName} numberOfLines={1}>
                {name || (groupType === "staff" ? "Staff" : "Member")}
              </Text>
              <View style={styles.identityPhoneRow}>
                <Ionicons name="call-outline" size={13} color="#64748B" />
                <Text style={styles.identityPhone} numberOfLines={1}>
                  {phone ? `+91 ${phone}` : "—"}
                </Text>
              </View>
              {identityLocked ? (
                <View style={styles.lockedRow}>
                  <Ionicons name="lock-closed" size={12} color="#64748B" />
                  <Text style={styles.lockedRowText}>
                    Managed by the {groupType === "staff" ? "staff" : "member"}
                  </Text>
                </View>
              ) : null}
            </View>

            <Ionicons
              name={identityLocked ? "lock-closed" : "chevron-forward"}
              size={identityLocked ? 18 : 20}
              color={identityLocked ? "#CBD5E1" : "#94A3B8"}
            />
          </TouchableOpacity>
        )}

        {groupType === "apartment" && (
          <View style={styles.card}>
            <SectionHeader
              icon="home-outline"
              title="Flat Details"
              subtitle="Apartment and maintenance information"
            />

            <FieldLabel label="Wing / Section" optional />
            <InputContainer icon="business-outline">
              <TextInput
                style={styles.input}
                placeholder="A Wing, B Wing, Tower 1"
                placeholderTextColor="#9ca3af"
                value={wing}
                onChangeText={setWing}
              />
            </InputContainer>

            <FieldLabel
              label="Flat Number"
              required
              error={fieldErrors.flatNumber}
            />
            <InputContainer
              icon="home-outline"
              error={!!fieldErrors.flatNumber}
            >
              <TextInput
                style={styles.input}
                placeholder="A-204"
                placeholderTextColor="#9ca3af"
                value={flatNumber}
                onChangeText={(text) => {
                  setFlatNumber(text);
                  if (fieldErrors.flatNumber) {
                    setFieldErrors({ ...fieldErrors, flatNumber: "" });
                  }
                }}
              />
            </InputContainer>
            {fieldErrors.flatNumber ? (
              <FieldError text={fieldErrors.flatNumber} />
            ) : null}

            <FieldLabel label="Area" optional />
            <InputContainer icon="resize-outline" suffix="sq. ft.">
              <TextInput
                style={styles.input}
                placeholder="1200"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={areaSqft}
                onChangeText={(text) =>
                  setAreaSqft(text.replace(/[^0-9]/g, ""))
                }
              />
            </InputContainer>

            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="car-outline" size={20} color="#2563eb" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Parking Available</Text>
                <Text style={styles.settingSubtitle}>
                  Does this flat have parking?
                </Text>
              </View>
              <Switch
                value={parkingAvailable}
                onValueChange={setParkingAvailable}
                trackColor={{ false: "#d1d5db", true: "#93c5fd" }}
                thumbColor={parkingAvailable ? "#2563eb" : "#f4f4f5"}
              />
            </View>

            <FieldLabel
              label="Monthly Maintenance"
              required
              error={fieldErrors.maintenanceAmount}
            />
            <InputContainer
              icon="wallet-outline"
              error={!!fieldErrors.maintenanceAmount}
              prefix="₹"
            >
              <TextInput
                style={styles.input}
                placeholder="2500"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={maintenanceAmount}
                onChangeText={(text) => {
                  setMaintenanceAmount(text.replace(/[^0-9]/g, ""));
                  if (fieldErrors.maintenanceAmount) {
                    setFieldErrors({ ...fieldErrors, maintenanceAmount: "" });
                  }
                }}
              />
            </InputContainer>
            {fieldErrors.maintenanceAmount ? (
              <FieldError text={fieldErrors.maintenanceAmount} />
            ) : null}

            <FieldLabel label="Role" required error={fieldErrors.role} />
            <View style={styles.roleGrid}>
              {roleOptions.map((option) => {
                const normalizedOptionRole = normalizeRoleInput(
                  String(option.role),
                );
                const normalizedCurrentRole = normalizeRoleInput(
                  String(role ?? ""),
                );
                const selected =
                  !isCustomRole &&
                  normalizedCurrentRole === normalizedOptionRole;
                return (
                  <TouchableOpacity
                    key={option.role}
                    style={[
                      styles.roleOption,
                      selected && styles.roleOptionSelected,
                    ]}
                    onPress={() => {
                      setRole(option.role);
                      setIsCustomRole(false);
                      setCustomRole("");
                      if (fieldErrors.role) {
                        setFieldErrors({ ...fieldErrors, role: "" });
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.roleRadio,
                        selected && styles.roleRadioSelected,
                      ]}
                    >
                      {selected ? <View style={styles.roleRadioDot} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.roleOptionText,
                        selected && styles.roleOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  isCustomRole && styles.roleOptionSelected,
                ]}
                onPress={() => {
                  setIsCustomRole(true);
                  const normalized = normalizeRoleInput(customRole);
                  setRole(normalized ? (normalized as MemberRole) : null);
                }}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.roleRadio,
                    isCustomRole && styles.roleRadioSelected,
                  ]}
                >
                  {isCustomRole ? <View style={styles.roleRadioDot} /> : null}
                </View>
                <Text
                  style={[
                    styles.roleOptionText,
                    isCustomRole && styles.roleOptionTextSelected,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {isCustomRole ? (
              <View style={styles.customRoleWrapper}>
                <InputContainer
                  icon="create-outline"
                  error={!!fieldErrors.role}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter custom role"
                    placeholderTextColor="#9ca3af"
                    value={customRole}
                    onChangeText={(text) => {
                      setCustomRole(text);
                      const normalized = normalizeRoleInput(text);
                      setRole(normalized ? (normalized as MemberRole) : null);
                      if (fieldErrors.role) {
                        setFieldErrors({ ...fieldErrors, role: "" });
                      }
                    }}
                  />
                </InputContainer>
              </View>
            ) : null}

            {fieldErrors.role ? <FieldError text={fieldErrors.role} /> : null}
          </View>
        )}

        {groupType === "staff" && (
          <View style={styles.card}>
            <SectionHeader
              icon="briefcase-outline"
              title="Employment Details"
              subtitle="Salary and employment information"
            />

            <FieldLabel
              label="Monthly Salary"
              required
              error={fieldErrors.monthlySalary}
            />
            <InputContainer
              icon="wallet-outline"
              error={!!fieldErrors.monthlySalary}
              prefix="₹"
            >
              <TextInput
                style={styles.input}
                placeholder="5000"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={monthlySalary}
                onChangeText={(text) => {
                  setMonthlySalary(text.replace(/[^0-9]/g, ""));
                  if (fieldErrors.monthlySalary) {
                    setFieldErrors({ ...fieldErrors, monthlySalary: "" });
                  }
                }}
              />
            </InputContainer>
            {fieldErrors.monthlySalary ? (
              <FieldError text={fieldErrors.monthlySalary} />
            ) : null}

            <FieldLabel label="Role" required error={fieldErrors.role} />
            <View style={styles.roleGrid}>
              {roleOptions.map((option) => {
                const normalizedOptionRole = normalizeRoleInput(
                  String(option.role),
                );
                const normalizedCurrentRole = normalizeRoleInput(
                  String(role ?? ""),
                );
                const selected =
                  !isCustomRole &&
                  normalizedCurrentRole === normalizedOptionRole;
                return (
                  <TouchableOpacity
                    key={option.role}
                    style={[
                      styles.roleOption,
                      selected && styles.roleOptionSelected,
                    ]}
                    onPress={() => {
                      setRole(option.role);
                      setIsCustomRole(false);
                      setCustomRole("");
                      if (fieldErrors.role) {
                        setFieldErrors({ ...fieldErrors, role: "" });
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.roleRadio,
                        selected && styles.roleRadioSelected,
                      ]}
                    >
                      {selected ? <View style={styles.roleRadioDot} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.roleOptionText,
                        selected && styles.roleOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  isCustomRole && styles.roleOptionSelected,
                ]}
                onPress={() => {
                  setIsCustomRole(true);
                  const normalized = normalizeRoleInput(customRole);
                  setRole(normalized ? (normalized as MemberRole) : null);
                }}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.roleRadio,
                    isCustomRole && styles.roleRadioSelected,
                  ]}
                >
                  {isCustomRole ? <View style={styles.roleRadioDot} /> : null}
                </View>
                <Text
                  style={[
                    styles.roleOptionText,
                    isCustomRole && styles.roleOptionTextSelected,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {isCustomRole ? (
              <View style={styles.customRoleWrapper}>
                <InputContainer
                  icon="create-outline"
                  error={!!fieldErrors.role}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter custom role"
                    placeholderTextColor="#9ca3af"
                    value={customRole}
                    onChangeText={(text) => {
                      setCustomRole(text);
                      const normalized = normalizeRoleInput(text);
                      setRole(normalized ? (normalized as MemberRole) : null);
                      if (fieldErrors.role) {
                        setFieldErrors({ ...fieldErrors, role: "" });
                      }
                    }}
                  />
                </InputContainer>
              </View>
            ) : null}

            {fieldErrors.role ? <FieldError text={fieldErrors.role} /> : null}
          </View>
        )}

        {groupType === "expense" && (
          <View style={styles.card}>
            <SectionHeader
              icon={isIncome ? "trending-up-outline" : "receipt-outline"}
              title={isIncome ? "Income Details" : "Expense Details"}
              subtitle={
                isIncome
                  ? "Update income information"
                  : "Update expense and payment information"
              }
            />

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View
                style={[
                  styles.typeBadge,
                  isIncome ? styles.typeBadgeIncome : styles.typeBadgeExpense,
                ]}
              >
                <View
                  style={[
                    styles.typeBadgeIcon,
                    isIncome
                      ? styles.typeBadgeIconIncome
                      : styles.typeBadgeIconExpense,
                  ]}
                >
                  <Ionicons
                    name={isIncome ? "arrow-up-circle" : "arrow-down-circle"}
                    size={18}
                    color={isIncome ? GREEN : RED}
                  />
                </View>
                <View style={styles.typeBadgeTextWrap}>
                  <Text
                    style={[
                      styles.typeBadgeTitle,
                      { color: isIncome ? "#166534" : "#991b1b" },
                    ]}
                  >
                    {isIncome ? "Income" : "Expense"}
                  </Text>
                  <Text style={styles.typeBadgeSubtitle}>
                    {isIncome
                      ? "Money received · cannot be changed"
                      : "Money spent · cannot be changed"}
                  </Text>
                </View>
                <Ionicons name="lock-closed" size={14} color="#94a3b8" />
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.fieldLabel,
                    fieldErrors.role ? styles.fieldLabelError : undefined,
                  ]}
                >
                  Category
                </Text>
              </View>
              <View style={styles.roleGrid}>
                {activeCategoryOptions.map((option) => {
                  const selected = role === option.role;
                  return (
                    <TouchableOpacity
                      key={option.role}
                      style={[
                        styles.roleOption,
                        selected && styles.roleOptionSelected,
                      ]}
                      onPress={() => {
                        setRole(option.role);
                        if (fieldErrors.role) {
                          setFieldErrors({ ...fieldErrors, role: "" });
                        }
                      }}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          styles.roleRadio,
                          selected && styles.roleRadioSelected,
                        ]}
                      >
                        {selected ? <View style={styles.roleRadioDot} /> : null}
                      </View>
                      <Text
                        style={[
                          styles.roleOptionText,
                          selected && styles.roleOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {fieldErrors.role ? <FieldError text={fieldErrors.role} /> : null}
            </View>

            <FieldLabel
              label={isIncome ? "Income Name" : "Expense Name"}
              required
              error={fieldErrors.name}
            />
            <InputContainer
              icon="document-text-outline"
              error={!!fieldErrors.name}
            >
              <TextInput
                style={styles.input}
                placeholder={
                  isIncome
                    ? "e.g. Hall booking - Sharma wedding"
                    : "Water bill, Lift repair"
                }
                placeholderTextColor="#9ca3af"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (fieldErrors.name) {
                    setFieldErrors({ ...fieldErrors, name: "" });
                  }
                }}
              />
            </InputContainer>
            {fieldErrors.name ? <FieldError text={fieldErrors.name} /> : null}

            <FieldLabel
              label={isIncome ? "Income Amount" : "Amount"}
              required
              error={fieldErrors.expenseAmount}
            />
            <InputContainer
              icon="cash-outline"
              error={!!fieldErrors.expenseAmount}
              prefix="₹"
            >
              <TextInput
                style={styles.input}
                placeholder="4200"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={expenseAmount}
                onChangeText={(text) => {
                  setExpenseAmount(text.replace(/[^0-9]/g, ""));
                  if (fieldErrors.expenseAmount) {
                    setFieldErrors({ ...fieldErrors, expenseAmount: "" });
                  }
                }}
              />
            </InputContainer>
            {fieldErrors.expenseAmount ? (
              <FieldError text={fieldErrors.expenseAmount} />
            ) : null}

            <Text style={styles.fieldLabel}>Payment Status</Text>
            <View style={styles.paymentStatusRow}>
              <TouchableOpacity
                style={[
                  styles.paymentStatusCard,
                  expenseStatus === "paid" && styles.paymentStatusCardPaid,
                ]}
                onPress={() => {
                  setExpenseStatus("paid");
                  setReminderEnabled(false);
                }}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.paymentIcon,
                    expenseStatus === "paid" && styles.paymentIconPaid,
                  ]}
                >
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={expenseStatus === "paid" ? "#15803d" : "#6b7280"}
                  />
                </View>
                <View style={styles.paymentTextWrapper}>
                  <Text
                    style={[
                      styles.paymentTitle,
                      expenseStatus === "paid" && styles.paymentTitlePaid,
                    ]}
                  >
                    {isIncome ? "Received" : "Paid"}
                  </Text>
                  <Text style={styles.paymentSubtitle}>
                    {isIncome ? "Payment collected" : "Payment completed"}
                  </Text>
                </View>
                {expenseStatus === "paid" ? (
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentStatusCard,
                  expenseStatus === "due" && styles.paymentStatusCardDue,
                ]}
                onPress={() => setExpenseStatus("due")}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.paymentIcon,
                    expenseStatus === "due" && styles.paymentIconDue,
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={expenseStatus === "due" ? "#c2410c" : "#6b7280"}
                  />
                </View>
                <View style={styles.paymentTextWrapper}>
                  <Text
                    style={[
                      styles.paymentTitle,
                      expenseStatus === "due" && styles.paymentTitleDue,
                    ]}
                  >
                    {isIncome ? "Pending" : "Due"}
                  </Text>
                  <Text style={styles.paymentSubtitle}>
                    {isIncome ? "Payment awaited" : "Payment pending"}
                  </Text>
                </View>
                {expenseStatus === "due" ? (
                  <Ionicons name="checkmark-circle" size={20} color="#ea580c" />
                ) : null}
              </TouchableOpacity>
            </View>

            {expenseStatus === "due" ? (
              <View style={styles.reminderCard}>
                <View style={styles.reminderIcon}>
                  <Ionicons
                    name="notifications-outline"
                    size={20}
                    color="#c2410c"
                  />
                </View>
                <View style={styles.reminderText}>
                  <Text style={styles.reminderTitle}>Payment Reminder</Text>
                  <Text style={styles.reminderSubtitle}>
                    Get notified on the expense date
                  </Text>
                </View>
                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{ false: "#d1d5db", true: "#fdba74" }}
                  thumbColor={reminderEnabled ? "#ea580c" : "#f4f4f5"}
                />
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Expense Date</Text>
            <TouchableOpacity
              style={styles.dateField}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.75}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar-outline" size={20} color="#2563eb" />
              </View>
              <View style={styles.dateTextWrapper}>
                <Text
                  style={dueDate ? styles.dateValue : styles.datePlaceholder}
                >
                  {dueDate || "Select expense date"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>
              Bill Attachments
              <Text style={styles.optionalText}>
                {" "}
                • Optional • up to {MAX_BILL_ATTACHMENTS}
              </Text>
            </Text>

            {billAttachments.length > 0 ? (
              <View style={styles.attachmentList}>
                {billAttachments.map((attachment, index) => {
                  const isPdf = isPdfAttachment(attachment);
                  return (
                    <View
                      key={`${attachment.uri}-${index}`}
                      style={[
                        styles.attachmentRow,
                        index === billAttachments.length - 1 &&
                          styles.attachmentRowLast,
                      ]}
                    >
                      <View style={styles.attachmentIcon}>
                        <Ionicons
                          name={fileIconForBill(attachment)}
                          size={19}
                          color={isPdf ? "#DC2626" : "#2563eb"}
                        />
                      </View>
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {attachment.name}
                      </Text>
                      <TouchableOpacity
                        style={styles.attachmentAction}
                        onPress={() =>
                          downloadBillAttachment(
                            attachment.uri,
                            attachment.name,
                          )
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="download-outline"
                          size={19}
                          color="#2563eb"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.attachmentAction,
                          styles.attachmentDeleteAction,
                        ]}
                        onPress={() =>
                          setBillAttachments((cur) =>
                            cur.filter((_, i) => i !== index),
                          )
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={19}
                          color="#dc2626"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyAttachment}>
                <View style={styles.emptyAttachmentIcon}>
                  <Ionicons
                    name="document-attach-outline"
                    size={26}
                    color="#2563eb"
                  />
                </View>
                <Text style={styles.emptyAttachmentTitle}>
                  No bill attached
                </Text>
                <Text style={styles.emptyAttachmentSubtitle}>
                  Add an image or PDF of the bill for your records.
                </Text>
              </View>
            )}

            {(() => {
              const limitReached =
                billAttachments.length >= MAX_BILL_ATTACHMENTS;
              return (
                <TouchableOpacity
                  style={[
                    styles.attachButton,
                    limitReached && styles.attachButtonDisabled,
                  ]}
                  onPress={() => {
                    if (limitReached) {
                      Alert.alert(
                        "Attachment limit reached",
                        `You can attach at most ${MAX_BILL_ATTACHMENTS} files. Remove one to add more.`,
                      );
                      return;
                    }
                    showPhotoSelectionOptions(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={limitReached ? "lock-closed" : "attach"}
                    size={21}
                    color={limitReached ? "#94a3b8" : "#2563eb"}
                  />
                  <Text
                    style={[
                      styles.attachButtonText,
                      limitReached && styles.attachButtonTextDisabled,
                    ]}
                  >
                    {limitReached
                      ? `Attachment limit reached (${MAX_BILL_ATTACHMENTS} files max)`
                      : billAttachments.length
                        ? "Add another bill"
                        : "Attach bill or receipt"}
                  </Text>
                </TouchableOpacity>
              );
            })()}

            {fieldErrors.billAttachments ? (
              <FieldError text={fieldErrors.billAttachments} />
            ) : null}

            <Text style={styles.fieldLabel}>Note</Text>
            <View style={styles.noteContainer}>
              <Ionicons
                name="create-outline"
                size={19}
                color="#9ca3af"
                style={styles.noteIcon}
              />
              <TextInput
                style={styles.noteInput}
                placeholder="Add a note about this expense..."
                placeholderTextColor="#9ca3af"
                value={expenseDescription}
                onChangeText={setExpenseDescription}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {error && (error !== "Please fix all the errors" || hasFieldErrors) ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={19} color="#dc2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.updateButton, loading && styles.updateButtonDisabled]}
          onPress={handleUpdate}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons
            name={loading ? "hourglass-outline" : "checkmark-circle-outline"}
            size={21}
            color="#fff"
          />
          <Text style={styles.updateButtonText}>
            {loading
              ? "Saving Changes..."
              : groupType === "expense"
                ? isIncome
                  ? "Save Income"
                  : "Save Expense"
                : "Save Changes"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteButton, loading && styles.buttonDisabled]}
          onPress={handleDelete}
          disabled={loading}
          activeOpacity={0.85}
        >
          <View style={styles.deleteButtonIconWrap}>
            <Ionicons name="trash-outline" size={18} color={RED} />
          </View>
          <View style={styles.deleteButtonTextWrap}>
            <Text style={styles.deleteButtonLabel}>{deleteButtonLabel}</Text>
            <Text style={styles.deleteButtonHint} numberOfLines={1}>
              {groupType === "expense"
                ? "Permanently remove this transaction"
                : groupType === "staff"
                  ? "Remove this staff role from the property"
                  : "Remove this member from the property"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={RED} />
        </TouchableOpacity>

        <View style={{ height: Math.max(40, insets.bottom + 20) }} />
      </ScrollView>

      {/* ── IDENTITY EDITOR MODAL ─────────────────────────────── */}
      <Modal
        visible={showIdentityModal}
        transparent
        animationType="fade"
        onRequestClose={closeIdentityEditor}
      >
        <TouchableWithoutFeedback onPress={closeIdentityEditor}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback
              onPress={(event) => event.stopPropagation()}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
              >
                <View style={styles.editModal}>
                  <View style={styles.modalTopRow}>
                    <View style={styles.modalTitleIcon}>
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color="#2563EB"
                      />
                    </View>
                    <View style={styles.modalTitleContent}>
                      <Text style={styles.editModalTitle}>
                        Edit {groupType === "staff" ? "Staff" : "Member"}
                      </Text>
                      <Text style={styles.modalSubtitle}>
                        Update name, photo and phone number
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.modalCloseButton}
                      onPress={closeIdentityEditor}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close" size={21} color="#475569" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.identityModalAvatarRow}>
                      <TouchableOpacity
                        style={styles.identityModalAvatar}
                        onPress={openIdentityPhotoPicker}
                        activeOpacity={0.85}
                      >
                        {identityPhotoUri ? (
                          <Image
                            source={{ uri: identityPhotoUri }}
                            style={styles.identityModalAvatarImage}
                          />
                        ) : (
                          <View style={styles.identityModalAvatarPlaceholder}>
                            <Ionicons name="person" size={34} color="#2563eb" />
                          </View>
                        )}
                        <View style={styles.identityModalAvatarBadge}>
                          <Ionicons name="camera" size={13} color="#fff" />
                        </View>
                      </TouchableOpacity>
                      <View style={styles.identityModalAvatarText}>
                        <Text style={styles.identityModalAvatarTitle}>
                          {identityPhotoUri ? "Change photo" : "Add photo"}
                        </Text>
                        <Text style={styles.identityModalAvatarSubtitle}>
                          Tap the avatar to pick from camera or gallery
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.fieldLabel}>Full Name</Text>
                    <View style={styles.identityFieldRow}>
                      <Ionicons
                        name="person-outline"
                        size={18}
                        color="#94A3B8"
                        style={styles.identityFieldIcon}
                      />
                      <TextInput
                        style={styles.identityFieldInput}
                        value={identityName}
                        onChangeText={(t) => {
                          setIdentityName(t);
                          setIdentityError("");
                        }}
                        placeholder="e.g. Ramesh Kumar"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="words"
                      />
                    </View>

                    <Text style={styles.fieldLabel}>Phone Number</Text>
                    <View style={styles.identityFieldRow}>
                      <View style={styles.identityPhonePrefix}>
                        <Text style={styles.identityPhonePrefixText}>+91</Text>
                      </View>
                      <TextInput
                        style={styles.identityFieldInput}
                        value={identityPhone}
                        onChangeText={(t) => {
                          setIdentityPhone(
                            t.replace(/[^0-9]/g, "").slice(0, 10),
                          );
                          setIdentityError("");
                        }}
                        keyboardType="number-pad"
                        maxLength={10}
                        placeholder="9876543210"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={styles.identityContactButton}
                        onPress={pickContact}
                        activeOpacity={0.75}
                      >
                        {loadingContacts ? (
                          <ActivityIndicator size="small" color="#2563EB" />
                        ) : (
                          <Ionicons
                            name="people-outline"
                            size={18}
                            color="#2563EB"
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.identityFreeHint}>
                      No OTP needed — this person hasn't joined the app yet.
                    </Text>

                    {identityError ? (
                      <View style={styles.validationBox}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={17}
                          color="#DC2626"
                        />
                        <Text style={styles.validationText}>
                          {identityError}
                        </Text>
                      </View>
                    ) : null}
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.cancelModalButton}
                      onPress={closeIdentityEditor}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={saveIdentityEditor}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.saveButtonText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── LOCKED INFO MODAL ─────────────────────────────────── */}
      {showLockedInfo && (
        <Modal
          transparent
          animationType="fade"
          visible={showLockedInfo}
          onRequestClose={() => setShowLockedInfo(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowLockedInfo(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.tooltipCard}>
                  <View style={styles.tooltipIconCircle}>
                    <Ionicons name="lock-closed" size={26} color="#2563EB" />
                  </View>
                  <Text style={styles.tooltipTitle}>
                    Managed by the {groupType === "staff" ? "staff" : "member"}
                  </Text>
                  <Text style={styles.tooltipSubtitle}>
                    This person has joined the app. Their name, phone number and
                    photo can only be changed by them from their own profile.
                  </Text>
                  <TouchableOpacity
                    style={styles.tooltipActionButton}
                    onPress={() => setShowLockedInfo(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tooltipActionText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate || ""}
        onClose={() => setShowDatePicker(false)}
        onSelect={(next: unknown) => setDueDate(toDateInput(next))}
      />

      {/* ── DELETE CONFIRMATION ───────────────────────────────── */}
      <Modal
        transparent
        animationType="fade"
        visible={showDeleteConfirmation}
        onRequestClose={() => setShowDeleteConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmationModal}>
            <View style={styles.deleteWarningIcon}>
              <Ionicons name="trash-outline" size={25} color="#dc2626" />
            </View>
            <Text style={styles.confirmationTitle}>{deleteTitle}</Text>
            <Text style={styles.confirmationMessage}>
              {groupType === "expense" ? (
                <>
                  This will permanently delete{" "}
                  <Text style={styles.confirmationName}>
                    {name || "this expense"}
                  </Text>
                  . This action cannot be undone.
                </>
              ) : groupType === "staff" ? (
                <>
                  This will remove{" "}
                  <Text style={styles.confirmationName}>
                    {name || "this staff member"}
                  </Text>
                  {phone ? ` (+91 ${phone})` : ""} from the staff list of this
                  property. Their profile stays, but their staff role (salary,
                  attendance and payment history) will no longer be part of this
                  society. This action cannot be undone.
                </>
              ) : (
                <>
                  This will remove{" "}
                  <Text style={styles.confirmationName}>
                    {name || "this member"}
                  </Text>
                  {phone ? ` (+91 ${phone})` : ""} from this property. Their
                  profile stays, but this flat's record (wing, flat number,
                  maintenance and payment history) will no longer be part of
                  this society. This action cannot be undone.
                </>
              )}
            </Text>
            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowDeleteConfirmation(false)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmDeleteButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={confirmDelete}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={17} color="#fff" />
                    <Text style={styles.confirmDeleteButtonText}>
                      {deleteConfirmText}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPhotoOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoOptions(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowPhotoOptions(false)}
        >
          <Pressable style={styles.photoOptionsModal} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.photoOptionsTitle}>
              {isBillPhotoMode ? "Add Bill / Receipt" : "Upload Photo"}
            </Text>
            <Text style={styles.photoOptionsSubtitle}>
              {isBillPhotoMode
                ? "Choose how you want to add a bill or receipt"
                : "Choose how you want to add a photo"}
            </Text>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={takePhoto}
              activeOpacity={0.7}
            >
              <View style={styles.photoOptionIcon}>
                <Ionicons name="camera" size={24} color="#1a73e8" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Take Photo</Text>
                <Text style={styles.photoOptionDescription}>
                  {isBillPhotoMode
                    ? "Capture a photo of the bill or receipt"
                    : "Capture a photo using your camera"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={choosePhoto}
              activeOpacity={0.7}
            >
              <View
                style={[styles.photoOptionIcon, { backgroundColor: "#ecfdf5" }]}
              >
                <Ionicons name="images" size={24} color="#059669" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Choose from Gallery</Text>
                <Text style={styles.photoOptionDescription}>
                  {isBillPhotoMode
                    ? "Select a bill or receipt from your device"
                    : "Select a photo from your device"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            {isBillPhotoMode && (
              <TouchableOpacity
                style={styles.photoOptionButton}
                onPress={chooseBillPdf}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.photoOptionIcon,
                    { backgroundColor: "#FEF2F2" },
                  ]}
                >
                  <Ionicons name="document-text" size={24} color="#DC2626" />
                </View>
                <View style={styles.photoOptionTextContainer}>
                  <Text style={styles.photoOptionTitle}>Upload PDF</Text>
                  <Text style={styles.photoOptionDescription}>
                    Bills, invoices, receipts (PDF only)
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.photoOptionsCancel}
              onPress={() => setShowPhotoOptions(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.photoOptionsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={closeContactPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.contactPickerModal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Contact</Text>
                <Text style={styles.modalSubtitle}>
                  Choose a contact to fill the phone number
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeContactPicker}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchContainer}>
              <Ionicons name="search-outline" size={20} color="#94a3b8" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search name or phone"
                placeholderTextColor="#94a3b8"
                value={contactSearch}
                onChangeText={setContactSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {contactSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setContactSearch("")}
                  style={styles.clearSearchButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={19} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={styles.contactList}
              contentContainerStyle={styles.contactListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => (
                  <TouchableOpacity
                    key={contact.id}
                    style={styles.contactRow}
                    onPress={() => selectContact(contact)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactAvatarText}>
                        {contact.name
                          ? contact.name.charAt(0).toUpperCase()
                          : "?"}
                      </Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {contact.name || "Unknown"}
                      </Text>
                      {contact.phoneNumbers.length > 0 && (
                        <Text style={styles.contactPhone} numberOfLines={1}>
                          {contact.phoneNumbers[0].number}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.noContactsContainer}>
                  <Ionicons name="search-outline" size={34} color="#94a3b8" />
                  <Text style={styles.noContactsTitle}>No contacts found</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={closeContactPicker}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PhotoAdjustModal
        visible={showAdjustModal}
        image={rawImage}
        onCancel={handleAdjustCancel}
        onConfirm={handleAdjustConfirm}
      />
    </KeyboardAvoidingView>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color="#2563eb" />
      </View>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FieldLabel({
  label,
  required,
  optional,
  error,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={[styles.fieldLabel, error && styles.fieldLabelError]}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
        {optional ? <Text style={styles.optionalText}> • Optional</Text> : null}
      </Text>
    </View>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <View style={styles.fieldErrorRow}>
      <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
      <Text style={styles.fieldError}>{text}</Text>
    </View>
  );
}

function InputContainer({
  children,
  icon,
  error,
  prefix,
  suffix,
}: {
  children: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <View style={[styles.inputContainer, error && styles.errorBorder]}>
      <Ionicons
        name={icon}
        size={19}
        color={error ? "#dc2626" : "#9ca3af"}
        style={styles.inputIcon}
      />
      {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
      {children}
      {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f8fc" },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexGrow: 1,
  },

  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  notFoundIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  notFoundTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  notFoundSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 7,
    marginBottom: 22,
  },
  backButton: {
    minWidth: 130,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e8edf5",
    marginBottom: 14,
  },
  identityAvatarWrapper: { width: 68, height: 68, position: "relative" },
  identityAvatarImage: { width: 68, height: 68, borderRadius: 34 },
  identityAvatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d7e6ff",
  },
  identityAvatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  identityInfo: { flex: 1, marginLeft: 14, minWidth: 0 },
  identityName: { fontSize: 17, fontWeight: "800", color: "#111827" },
  identityPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  identityPhone: { fontSize: 12.5, color: "#6b7280", fontWeight: "600" },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 7,
  },
  lockedRowText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e8edf5",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 19,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeaderText: { flex: 1, marginLeft: 11 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sectionSubtitle: { fontSize: 12, color: "#8a94a6", marginTop: 3 },

  fieldContainer: { marginTop: 8 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldLabelRow: { marginTop: 2, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  fieldLabelError: { color: "#dc2626" },
  requiredMark: { color: "#dc2626" },
  optionalText: { color: "#9ca3af", fontWeight: "500" },

  typeBadge: {
    marginTop: 8,
    minHeight: 60,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeBadgeExpense: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  typeBadgeIncome: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  typeBadgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  typeBadgeIconExpense: { backgroundColor: "#fee2e2" },
  typeBadgeIconIncome: { backgroundColor: "#dcfce7" },
  typeBadgeTextWrap: { flex: 1, minWidth: 0 },
  typeBadgeTitle: { fontSize: 14, fontWeight: "800" },
  typeBadgeSubtitle: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    fontWeight: "500",
  },

  inputContainer: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 15,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },
  inputPrefix: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "700",
    marginRight: 5,
  },
  inputSuffix: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    marginLeft: 8,
  },
  errorBorder: { borderColor: "#dc2626", backgroundColor: "#fffafa" },
  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -9,
    marginBottom: 14,
  },
  fieldError: {
    fontSize: 12,
    color: "#dc2626",
    marginLeft: 5,
    fontWeight: "600",
  },

  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 14,
    gap: 9,
  },
  roleOption: {
    minHeight: 47,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  roleOptionSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  roleRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  roleRadioSelected: { borderColor: "#2563eb" },
  roleRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },
  roleOptionText: { fontSize: 13, color: "#4b5563", fontWeight: "600" },
  roleOptionTextSelected: { color: "#2563eb", fontWeight: "800" },
  customRoleWrapper: { marginTop: 12 },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 2,
    marginTop: 1,
    marginBottom: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#eef2f7",
  },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  settingTextContainer: { flex: 1, marginLeft: 11 },
  settingTitle: { fontSize: 14, fontWeight: "700", color: "#1f2937" },
  settingSubtitle: { fontSize: 11, color: "#8a94a6", marginTop: 3 },

  paymentStatusRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },
  paymentStatusCard: {
    flex: 1,
    minHeight: 78,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 13,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
  },
  paymentStatusCardPaid: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },
  paymentStatusCardDue: {
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
  },
  paymentIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  paymentIconPaid: { backgroundColor: "#dcfce7" },
  paymentIconDue: { backgroundColor: "#ffedd5" },
  paymentTextWrapper: { flex: 1, marginLeft: 8 },
  paymentTitle: { fontSize: 13, fontWeight: "800", color: "#374151" },
  paymentTitlePaid: { color: "#15803d" },
  paymentTitleDue: { color: "#c2410c" },
  paymentSubtitle: { fontSize: 10, color: "#9ca3af", marginTop: 2 },

  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    marginBottom: 15,
  },
  reminderIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#ffedd5",
    justifyContent: "center",
    alignItems: "center",
  },
  reminderText: { flex: 1, marginLeft: 10 },
  reminderTitle: { fontSize: 13, fontWeight: "800", color: "#9a3412" },
  reminderSubtitle: { fontSize: 11, color: "#c2410c", marginTop: 3 },

  dateField: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    marginTop: 8,
    marginBottom: 15,
  },
  dateIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  dateTextWrapper: { flex: 1, marginLeft: 11 },
  dateValue: { fontSize: 14, color: "#111827", fontWeight: "600" },
  datePlaceholder: { fontSize: 14, color: "#9ca3af" },

  attachmentList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 10,
  },
  attachmentRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  attachmentRowLast: { borderBottomWidth: 0 },
  attachmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  attachmentName: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
    marginLeft: 9,
  },
  attachmentAction: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 9,
    backgroundColor: "#eff6ff",
    marginLeft: 5,
  },
  attachmentDeleteAction: { backgroundColor: "#fff1f2" },
  emptyAttachment: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fafcff",
    marginTop: 8,
    marginBottom: 10,
  },
  emptyAttachmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 9,
  },
  emptyAttachmentTitle: { fontSize: 13, fontWeight: "700", color: "#374151" },
  emptyAttachmentSubtitle: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
  attachButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 15,
  },
  attachButtonDisabled: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f1f5f9",
    opacity: 0.85,
  },
  attachButtonText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "800",
  },
  attachButtonTextDisabled: { color: "#64748b" },

  noteContainer: {
    minHeight: 105,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    marginTop: 8,
  },
  noteIcon: { marginTop: 2, marginRight: 9 },
  noteInput: {
    flex: 1,
    minHeight: 80,
    fontSize: 14,
    color: "#111827",
    padding: 0,
  },

  errorCard: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#b91c1c",
    fontWeight: "600",
    marginLeft: 8,
    lineHeight: 18,
  },

  updateButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  updateButtonDisabled: {
    backgroundColor: "#93c5fd",
    shadowOpacity: 0,
    elevation: 0,
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 8,
  },

  deleteButton: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  deleteButtonIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  deleteButtonTextWrap: { flex: 1, minWidth: 0 },
  deleteButtonLabel: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "800",
  },
  deleteButtonHint: {
    color: "#B91C1C",
    opacity: 0.75,
    fontSize: 11,
    marginTop: 3,
  },

  buttonDisabled: { opacity: 0.6 },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    padding: 22,
  },
  confirmationModal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  deleteWarningIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  confirmationMessage: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 19,
    marginTop: 9,
    textAlign: "center",
  },
  confirmationName: {
    color: "#111827",
    fontWeight: "800",
  },
  confirmationActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 23,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: { color: "#374151", fontSize: 13, fontWeight: "700" },
  confirmDeleteButton: {
    flex: 1.4,
    height: 46,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 11,
    gap: 6,
    paddingHorizontal: 8,
  },
  confirmDeleteButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 18,
  },
  photoOptionsModal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 480,
  },
  photoOptionsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
    textAlign: "center",
  },
  photoOptionsSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20,
  },
  photoOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  photoOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  photoOptionTextContainer: { flex: 1 },
  photoOptionTitle: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  photoOptionDescription: { fontSize: 12, color: "#64748b", marginTop: 1 },
  photoOptionsCancel: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
  },
  photoOptionsCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },

  contactPickerModal: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  modalSubtitle: { fontSize: 11.5, color: "#6b7280", marginTop: 2 },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSearchContainer: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  modalSearchInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 9,
    fontSize: 14,
    color: "#111827",
  },
  clearSearchButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  contactList: { maxHeight: 380 },
  contactListContent: { paddingBottom: 8 },
  contactRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },
  contactAvatarText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  contactInfo: { flex: 1, marginRight: 8 },
  contactName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  contactPhone: { fontSize: 12, color: "#6b7280", marginTop: 3 },
  noContactsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  noContactsTitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 10,
    fontWeight: "600",
  },
  modalCancelButton: {
    height: 48,
    borderRadius: 13,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

  keyboardView: { width: "100%", alignItems: "center" },
  editModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
  },
  modalTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  modalTitleIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  modalTitleContent: { flex: 1 },
  editModalTitle: { color: "#0F172A", fontSize: 17, fontWeight: "700" },
  identityModalAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
    gap: 12,
  },
  identityModalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    position: "relative",
  },
  identityModalAvatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  identityModalAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d7e6ff",
  },
  identityModalAvatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  identityModalAvatarText: { flex: 1, minWidth: 0 },
  identityModalAvatarTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  identityModalAvatarSubtitle: {
    fontSize: 11.5,
    color: "#6b7280",
    marginTop: 3,
    lineHeight: 16,
  },

  identityFieldRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  identityFieldIcon: { marginRight: 10 },
  identityFieldInput: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },
  identityPhonePrefix: {
    paddingRight: 10,
    marginRight: 6,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    height: 40,
    justifyContent: "center",
  },
  identityPhonePrefixText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "700",
  },
  identityContactButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  identityFreeHint: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 6,
  },

  validationBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    gap: 7,
  },
  validationText: { flex: 1, color: "#B91C1C", fontSize: 11, lineHeight: 16 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 20,
    gap: 8,
  },
  cancelModalButton: {
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  tooltipCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  tooltipIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  tooltipTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  tooltipSubtitle: {
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 320,
  },
  tooltipActionButton: {
    marginTop: 18,
    width: "100%",
    minHeight: 47,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

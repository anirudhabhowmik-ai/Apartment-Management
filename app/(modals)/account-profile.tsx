// app/(modals)/account-profile.tsx
// Edit user Name, Photo, manage Access & Roles, and (owner only) delete the property
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccounts } from "../../hooks/useAccounts";
import { useUserRole } from "../../hooks/useUserRole";
import { useAuthStore } from "../../store/useAuthStore";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/api\/?$/, "");

// ============================================================================
// TYPES
// ============================================================================

interface RawImage {
  uri: string;
  width: number;
  height: number;
}

type InvitationRole =
  | "admin"
  | "member_visibility"
  | "staff_visibility"
  | "ownership_transfer";

type InvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "revoked"
  | "cancelled";

interface ApiInvitation {
  id: string;
  account_id: string;
  invited_phone: string;
  invited_name: string | null;
  role: InvitationRole;
  status: InvitationStatus;
  target_member_id: string | null;
  target_staff_id: string | null;
  created_at: string;
  responded_at: string | null;
  dismissed_at: string | null;
  accepted_by?: string | null;
  invited_by_phone: string;
  account_name: string;
  account_photo_url: string | null;
  accepted_user_name?: string | null;
  accepted_user_photo_url?: string | null;
  invitee_user_name?: string | null;
  invitee_user_photo_url?: string | null;
  can_dismiss?: boolean;
}

interface RevokePreview {
  userId: string;
  phone: string | null;
  isAdmin: boolean;
  memberProfile: {
    id: string;
    name: string;
    wing: string | null;
    flatNumber: string | null;
    role: string | null;
  } | null;
  staffProfile: {
    id: string;
    name: string;
    role: string | null;
  } | null;
}

interface AccessPerson {
  key: string;
  userId: string | null;
  phone: string;
  name: string;
  photoUrl: string | null;
  roles: InvitationRole[];
  primaryInvitation: ApiInvitation;
  invitations: ApiInvitation[];
}

interface PendingGroup {
  key: string;
  phone: string;
  name: string;
  photoUrl: string | null;
  roles: InvitationRole[];
  invitations: ApiInvitation[];
}

// ============================================================================
// HELPERS
// ============================================================================

const normalizePhone = (raw?: string | null): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const roleLabelShort = (role: InvitationRole): string => {
  if (role === "admin") return "Admin";
  if (role === "member_visibility") return "Member";
  if (role === "staff_visibility") return "Staff";
  return "Ownership";
};

// ============================================================================
// INLINE CUSTOM ALERT
// ============================================================================

type AlertVariant = "info" | "success" | "warning" | "error" | "question";

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertState {
  visible: boolean;
  variant: AlertVariant;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

const EMPTY_ALERT: AlertState = {
  visible: false,
  variant: "info",
  title: "",
  message: undefined,
  buttons: [],
};

function AppAlert({
  state,
  onDismiss,
}: {
  state: AlertState;
  onDismiss: () => void;
}) {
  const { variant, title, message, buttons } = state;

  const meta: Record<
    AlertVariant,
    { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
  > = {
    info: { icon: "information-circle", color: "#2563EB", bg: "#EFF6FF" },
    success: { icon: "checkmark-circle", color: "#16A34A", bg: "#F0FDF4" },
    warning: { icon: "warning", color: "#D97706", bg: "#FEF3C7" },
    error: { icon: "close-circle", color: "#DC2626", bg: "#FEF2F2" },
    question: { icon: "help-circle", color: "#7C3AED", bg: "#F5F3FF" },
  };

  const m = meta[variant];

  const handlePress = (btn: AlertButton) => {
    onDismiss();
    if (btn.onPress) setTimeout(btn.onPress, 0);
  };

  const hasTwo = buttons.length === 2;
  const isStacked = buttons.length > 2;

  return (
    <Modal
      transparent
      visible={state.visible}
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={inlineAlertStyles.backdrop} onPress={onDismiss}>
        <Pressable
          style={inlineAlertStyles.card}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[inlineAlertStyles.iconCircle, { backgroundColor: m.bg }]}
          >
            <Ionicons name={m.icon} size={30} color={m.color} />
          </View>

          <Text style={inlineAlertStyles.title}>{title}</Text>

          {message ? (
            <Text style={inlineAlertStyles.message}>{message}</Text>
          ) : null}

          <View
            style={[
              inlineAlertStyles.actions,
              isStacked && inlineAlertStyles.actionsStacked,
            ]}
          >
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const isPrimary = !isDestructive && !isCancel;

              return (
                <Pressable
                  key={`${btn.text}-${idx}`}
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    inlineAlertStyles.button,
                    hasTwo && inlineAlertStyles.buttonHalf,
                    isStacked && inlineAlertStyles.buttonFull,
                    isCancel && inlineAlertStyles.buttonCancel,
                    isDestructive && inlineAlertStyles.buttonDestructive,
                    isPrimary && inlineAlertStyles.buttonPrimary,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      inlineAlertStyles.buttonText,
                      isCancel && inlineAlertStyles.buttonTextCancel,
                      isDestructive && inlineAlertStyles.buttonTextDestructive,
                      isPrimary && inlineAlertStyles.buttonTextPrimary,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function useAppAlert() {
  const [state, setState] = useState<AlertState>(EMPTY_ALERT);

  const show = useCallback(
    (opts: {
      variant?: AlertVariant;
      title: string;
      message?: string;
      buttons?: AlertButton[];
    }) => {
      setState({
        visible: true,
        variant: opts.variant ?? "info",
        title: opts.title,
        message: opts.message,
        buttons:
          opts.buttons && opts.buttons.length > 0
            ? opts.buttons
            : [{ text: "OK", style: "default" }],
      });
    },
    [],
  );

  const dismiss = useCallback(() => {
    setState(EMPTY_ALERT);
  }, []);

  return { state, show, dismiss };
}

const inlineAlertStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: "center",
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  message: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
  },
  actions: {
    flexDirection: "row",
    width: "100%",
    marginTop: 20,
    justifyContent: "center",
    gap: 10,
  },
  actionsStacked: { flexDirection: "column", gap: 8 },
  button: {
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 20,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonHalf: { flex: 1, minWidth: 0 },
  buttonFull: { width: "100%" },
  buttonCancel: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  buttonDestructive: { backgroundColor: "#DC2626" },
  buttonPrimary: { backgroundColor: "#2563EB" },
  buttonText: { fontSize: 14.5, fontWeight: "800" },
  buttonTextCancel: { color: "#475569" },
  buttonTextDestructive: { color: "#FFFFFF" },
  buttonTextPrimary: { color: "#FFFFFF" },
});

// ============================================================================
// PHOTO ADJUST MODAL
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIEWPORT = Math.min(SCREEN_WIDTH - 64, 320);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface PhotoAdjustModalProps {
  visible: boolean;
  image: RawImage | null;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
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

  const clampTranslate = (t: { x: number; y: number }, z: number) => {
    if (!image) return { x: 0, y: 0 };
    const scale = baseScale * z;
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

  const clampTranslateFromRefs = (t: { x: number; y: number }, z: number) => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };
    const scale = baseScaleRef.current * z;
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
        const g = gestureRef.current;
        const expectedCount =
          g?.mode === "pinch" ? 2 : g?.mode === "pan" ? 1 : 0;
        if (touches.length > 0 && touches.length !== expectedCount) {
          beginGesture(touches);
        }
        const g2 = gestureRef.current;
        if (!g2) return;

        if (g2.mode === "pinch" && touches.length >= 2) {
          const sorted = getSortedTouches(touches);
          const tracked = sorted.filter((p) =>
            g2.touchIds.includes(p.identifier),
          );
          const [a, b] = tracked.length >= 2 ? tracked : sorted.slice(0, 2);
          const dx = a.pageX - b.pageX;
          const dy = a.pageY - b.pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (g2.startDistance > 0) {
            const nextZoom = clampNumber(
              g2.startZoom * (distance / g2.startDistance),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            zoomRef.current = nextZoom;
            setZoom(nextZoom);
          }
        } else if (g2.mode === "pan" && touches.length === 1) {
          const touch = touches[0];
          const dx = touch.pageX - g2.startTouch.x;
          const dy = touch.pageY - g2.startTouch.y;
          const next = clampTranslateFromRefs(
            { x: g2.startTranslate.x + dx, y: g2.startTranslate.y + dy },
            zoomRef.current,
          );
          translateRef.current = next;
          setTranslate(next);
        }
      },

      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const remaining = evt.nativeEvent.touches;
        if (remaining.length > 0) beginGesture(remaining);
        else gestureRef.current = null;
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
          { crop: { originX, originY, width: cropSize, height: cropSize } },
          { resize: { width: 500, height: 500 } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
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

// ============================================================================
// MENU ROW
// ============================================================================

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  description: string;
  onPress: () => void;
  isLast?: boolean;
}

function MenuRow({
  icon,
  color,
  title,
  description,
  onPress,
  isLast,
}: MenuRowProps) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, isLast && styles.menuItemLast]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuIcon, { backgroundColor: color + "14" }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.menuItemContent}>
          <Text style={styles.menuItemTitle}>{title}</Text>
          <Text style={styles.menuItemDescription} numberOfLines={1}>
            {description}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </TouchableOpacity>
  );
}

// ============================================================================
// GRANT AVATAR
// ============================================================================

function GrantAvatar({
  photoUrl,
  name,
  size = 41,
  radius = 13,
  style,
  textStyle,
}: {
  photoUrl?: string | null;
  name?: string | null;
  size?: number;
  radius?: number;
  style?: any;
  textStyle?: any;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ width: size, height: size, borderRadius: radius }, style]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius },
        styles.accessAvatar,
        style,
      ]}
    >
      <Text style={[styles.accessAvatarText, textStyle]}>{initial}</Text>
    </View>
  );
}

// ============================================================================
// REVOKE ACCESS MODAL
// ============================================================================

type RevokeTab = "admin" | "member" | "staff" | "ownership";

interface RevokeAccessModalProps {
  visible: boolean;
  onClose: () => void;
  accountId: string | null;
  acceptedAdmins: ApiInvitation[];
  acceptedMembers: ApiInvitation[];
  acceptedStaff: ApiInvitation[];
  acceptedOwnership: ApiInvitation[];
  getAuthToken: () => Promise<string | null>;
  onRevoked: () => Promise<void> | void;
  onNotify: (opts: {
    variant?: AlertVariant;
    title: string;
    message?: string;
  }) => void;
}

function RevokeAccessModal({
  visible,
  onClose,
  accountId,
  acceptedAdmins,
  acceptedMembers,
  acceptedStaff,
  acceptedOwnership,
  getAuthToken,
  onRevoked,
  onNotify,
}: RevokeAccessModalProps) {
  const [tab, setTab] = useState<RevokeTab>("admin");
  const [search, setSearch] = useState("");

  const [target, setTarget] = useState<ApiInvitation | null>(null);
  const [preview, setPreview] = useState<RevokePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keepMemberVisibility, setKeepMemberVisibility] = useState(true);
  const [keepStaffVisibility, setKeepStaffVisibility] = useState(true);

  useEffect(() => {
    if (visible) {
      setTab("admin");
      setSearch("");
      setTarget(null);
      setPreview(null);
      setPreviewLoading(false);
      setSubmitting(false);
      setKeepMemberVisibility(true);
      setKeepStaffVisibility(true);
    }
  }, [visible]);

  const activeList =
    tab === "admin"
      ? acceptedAdmins
      : tab === "member"
        ? acceptedMembers
        : tab === "staff"
          ? acceptedStaff
          : acceptedOwnership;

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return activeList;
    return activeList.filter((inv) => {
      const name =
        inv.accepted_user_name ??
        inv.invitee_user_name ??
        inv.invited_name ??
        "";
      const phone = inv.invited_phone ?? "";
      return name.toLowerCase().includes(s) || phone.toLowerCase().includes(s);
    });
  }, [activeList, search]);

  const roleLabel = (role: InvitationRole) => {
    if (role === "admin") return "Admin";
    if (role === "member_visibility") return "Member";
    if (role === "staff_visibility") return "Staff";
    return "Ownership";
  };

  const displayName = (inv: ApiInvitation) =>
    inv.accepted_user_name ??
    inv.invitee_user_name ??
    inv.invited_name ??
    roleLabel(inv.role);

  const photoUrl = (inv: ApiInvitation) =>
    inv.accepted_user_photo_url ?? inv.invitee_user_photo_url ?? null;

  const openRevoke = async (inv: ApiInvitation) => {
    const targetUserId = inv.accepted_by ?? null;
    if (!targetUserId) {
      onNotify({
        variant: "error",
        title: "Error",
        message: "Missing user reference on invitation.",
      });
      return;
    }

    setTarget(inv);
    setPreview(null);
    setPreviewLoading(true);
    setKeepMemberVisibility(true);
    setKeepStaffVisibility(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        setPreviewLoading(false);
        return;
      }

      const res = await fetch(
        `${API_URL}/api/accounts/${accountId}/access/${targetUserId}/preview-revoke`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        setPreview(null);
        return;
      }

      const data: RevokePreview = await res.json();
      setPreview(data);
    } catch (err) {
      console.warn("previewRevoke error:", err);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeRevokeConfirm = () => {
    if (submitting) return;
    setTarget(null);
    setPreview(null);
    setPreviewLoading(false);
    setKeepMemberVisibility(true);
    setKeepStaffVisibility(true);
  };

  const confirmRevoke = async () => {
    if (!target) return;
    const token = await getAuthToken();
    if (!token) return;

    const targetUserId = target.accepted_by ?? null;
    if (!targetUserId) {
      onNotify({
        variant: "error",
        title: "Error",
        message: "Missing user reference on invitation.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        target.role === "admin"
          ? {
              keepMemberVisibility:
                preview?.memberProfile != null ? keepMemberVisibility : false,
              keepStaffVisibility:
                preview?.staffProfile != null ? keepStaffVisibility : false,
            }
          : {};

      const res = await fetch(
        `${API_URL}/api/accounts/${accountId}/access/${targetUserId}?role=${target.role}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        onNotify({
          variant: "error",
          title: "Error",
          message: "Failed to revoke access.",
        });
        return;
      }

      closeRevokeConfirm();
      await onRevoked();
    } catch (err) {
      console.error("revoke error:", err);
      onNotify({
        variant: "error",
        title: "Error",
        message: "Network error.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hasRevokeToggles =
    target?.role === "admin" &&
    (!!preview?.memberProfile || !!preview?.staffProfile);

  const formatMemberContext = () => {
    if (!preview?.memberProfile) return "";
    const { wing, flatNumber, role } = preview.memberProfile;
    const parts: string[] = [];
    if (wing) parts.push(`Wing ${wing}`);
    if (flatNumber) parts.push(`Flat ${flatNumber}`);
    if (role) parts.push(role.charAt(0).toUpperCase() + role.slice(1));
    return parts.join(" • ");
  };

  const formatStaffContext = () => {
    if (!preview?.staffProfile) return "";
    const { role } = preview.staffProfile;
    if (!role) return "";
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const tabs: { key: RevokeTab; label: string; count: number }[] = [
    { key: "admin", label: "Admin", count: acceptedAdmins.length },
    { key: "member", label: "Member", count: acceptedMembers.length },
    { key: "staff", label: "Staff", count: acceptedStaff.length },
    { key: "ownership", label: "Ownership", count: acceptedOwnership.length },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.revokeAccessOverlay}>
        <View style={styles.revokeAccessContainer}>
          <View style={styles.revokeAccessHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.revokeAccessTitle}>Revoke Access</Text>
              <Text style={styles.revokeAccessSubtitle}>
                Remove admin, member, staff, or ownership access from this
                account
              </Text>
            </View>
            <TouchableOpacity
              style={styles.revokeAccessCloseButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={21} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={styles.revokeAccessSearchContainer}>
            <Ionicons name="search-outline" size={19} color="#64748B" />
            <TextInput
              style={styles.revokeAccessSearchInput}
              placeholder="Search by name or phone"
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch("")}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={19} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.revokeAccessTabs}>
            {tabs.map((t) => {
              const isActive = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.revokeAccessTab,
                    isActive && styles.revokeAccessTabActive,
                  ]}
                  onPress={() => setTab(t.key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.revokeAccessTabText,
                      isActive && styles.revokeAccessTabTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                  <View
                    style={[
                      styles.revokeAccessTabCount,
                      isActive && styles.revokeAccessTabCountActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.revokeAccessTabCountText,
                        isActive && styles.revokeAccessTabCountTextActive,
                      ]}
                    >
                      {t.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.revokeAccessListWrapper}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {filtered.length === 0 ? (
                <View style={styles.revokeAccessEmpty}>
                  <View style={styles.revokeAccessEmptyIcon}>
                    <Ionicons name="people-outline" size={26} color="#64748B" />
                  </View>
                  <Text style={styles.revokeAccessEmptyTitle}>
                    {search ? "No matches" : "No access to revoke"}
                  </Text>
                  <Text style={styles.revokeAccessEmptyText}>
                    {search
                      ? "Try another name or phone number."
                      : `No accepted ${roleLabel(
                          tab === "admin"
                            ? "admin"
                            : tab === "member"
                              ? "member_visibility"
                              : tab === "staff"
                                ? "staff_visibility"
                                : "ownership_transfer",
                        ).toLowerCase()}s yet.`}
                  </Text>
                </View>
              ) : (
                filtered.map((inv) => {
                  const name = displayName(inv);
                  const pUrl = photoUrl(inv);
                  const avatarStyle =
                    inv.role === "admin"
                      ? styles.adminAvatar
                      : inv.role === "member_visibility"
                        ? styles.memberAvatar
                        : inv.role === "staff_visibility"
                          ? styles.staffAvatar
                          : styles.ownershipAvatar;
                  const avatarTextStyle =
                    inv.role === "member_visibility"
                      ? styles.memberAvatarText
                      : inv.role === "staff_visibility"
                        ? styles.staffAvatarText
                        : inv.role === "ownership_transfer"
                          ? styles.ownershipAvatarText
                          : undefined;

                  return (
                    <View key={inv.id} style={styles.revokeAccessRow}>
                      <GrantAvatar
                        photoUrl={pUrl}
                        name={name}
                        style={avatarStyle}
                        textStyle={avatarTextStyle}
                      />
                      <View style={styles.revokeAccessInfo}>
                        <Text style={styles.revokeAccessName} numberOfLines={1}>
                          {name}
                        </Text>
                        <View style={styles.revokeAccessSubRow}>
                          <Text
                            style={styles.revokeAccessPhone}
                            numberOfLines={1}
                          >
                            +91{inv.invited_phone}
                          </Text>
                          <View
                            style={[
                              styles.accessBadge,
                              inv.role === "admin"
                                ? styles.adminBadge
                                : inv.role === "member_visibility"
                                  ? styles.memberBadge
                                  : inv.role === "staff_visibility"
                                    ? styles.staffBadge
                                    : styles.ownershipBadge,
                            ]}
                          >
                            <Text
                              style={
                                inv.role === "admin"
                                  ? styles.adminBadgeText
                                  : inv.role === "member_visibility"
                                    ? styles.memberBadgeText
                                    : inv.role === "staff_visibility"
                                      ? styles.staffBadgeText
                                      : styles.ownershipBadgeText
                              }
                            >
                              {roleLabel(inv.role).toUpperCase()}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.revokeAccessButton}
                        onPress={() => openRevoke(inv)}
                        activeOpacity={0.8}
                        disabled={submitting}
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={15}
                          color="#DC2626"
                        />
                        <Text style={styles.revokeAccessButtonText}>
                          Revoke
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </View>

      {target && (
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(target)}
          onRequestClose={closeRevokeConfirm}
        >
          <TouchableWithoutFeedback onPress={closeRevokeConfirm}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.revokeModal}>
                  <View style={styles.revokeIcon}>
                    <Ionicons name="shield-outline" size={25} color="#7C3AED" />
                  </View>
                  <Text style={styles.revokeModalTitle}>
                    Revoke {roleLabel(target.role)} Access?
                  </Text>

                  {previewLoading ? (
                    <View style={{ paddingVertical: 12 }}>
                      <ActivityIndicator color="#7C3AED" />
                    </View>
                  ) : (
                    <>
                      <Text style={styles.revokeModalDescription}>
                        {displayName(target)} will lose{" "}
                        {roleLabel(target.role).toLowerCase()} access.
                        {hasRevokeToggles
                          ? " They still have another profile on this property — choose which access to keep below."
                          : ""}
                      </Text>

                      {target.role === "admin" && preview?.memberProfile && (
                        <TouchableOpacity
                          style={styles.revokeToggleRow}
                          onPress={() => setKeepMemberVisibility((v) => !v)}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.revokeToggleIconWrap,
                              { backgroundColor: "#DCFCE7" },
                            ]}
                          >
                            <Ionicons name="person" size={18} color="#16A34A" />
                          </View>
                          <View style={styles.revokeToggleContent}>
                            <Text style={styles.revokeToggleTitle}>
                              Keep Member visibility
                            </Text>
                            <Text
                              style={styles.revokeToggleSubtitle}
                              numberOfLines={1}
                            >
                              {preview.memberProfile.name}
                              {formatMemberContext()
                                ? `  •  ${formatMemberContext()}`
                                : ""}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.revokeCheckbox,
                              keepMemberVisibility &&
                                styles.revokeCheckboxChecked,
                            ]}
                          >
                            {keepMemberVisibility ? (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#FFFFFF"
                              />
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      )}

                      {target.role === "admin" && preview?.staffProfile && (
                        <TouchableOpacity
                          style={styles.revokeToggleRow}
                          onPress={() => setKeepStaffVisibility((v) => !v)}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.revokeToggleIconWrap,
                              { backgroundColor: "#E0F2FE" },
                            ]}
                          >
                            <Ionicons
                              name="briefcase"
                              size={18}
                              color="#0284C7"
                            />
                          </View>
                          <View style={styles.revokeToggleContent}>
                            <Text style={styles.revokeToggleTitle}>
                              Keep Staff visibility
                            </Text>
                            <Text
                              style={styles.revokeToggleSubtitle}
                              numberOfLines={1}
                            >
                              {preview.staffProfile.name}
                              {formatStaffContext()
                                ? `  •  ${formatStaffContext()}`
                                : ""}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.revokeCheckbox,
                              keepStaffVisibility &&
                                styles.revokeCheckboxChecked,
                            ]}
                          >
                            {keepStaffVisibility ? (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#FFFFFF"
                              />
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      )}

                      {hasRevokeToggles && (
                        <Text style={styles.revokeHint}>
                          Unchecked roles will be revoked along with{" "}
                          {roleLabel(target.role).toLowerCase()}.
                        </Text>
                      )}
                    </>
                  )}

                  <View style={styles.revokeModalActions}>
                    <TouchableOpacity
                      style={styles.cancelModalButton}
                      onPress={closeRevokeConfirm}
                      activeOpacity={0.8}
                      disabled={submitting}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.revokeConfirmButton}
                      onPress={confirmRevoke}
                      activeOpacity={0.8}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons
                            name="shield-outline"
                            size={17}
                            color="#FFFFFF"
                          />
                          <Text style={styles.revokeConfirmText}>
                            Revoke {roleLabel(target.role)}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </Modal>
  );
}

// ============================================================================
// DELETE PENDING MODAL
// ============================================================================

interface DeletePendingModalProps {
  group: PendingGroup | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}

function DeletePendingModal({
  group,
  submitting,
  onCancel,
  onConfirm,
}: DeletePendingModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (group) {
      setSelectedIds(new Set(group.invitations.map((i) => i.id)));
    }
  }, [group]);

  if (!group) return null;

  const multiRole = group.roles.length > 1;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const nothingSelected = selectedIds.size === 0;
  const allSelected = selectedIds.size === group.invitations.length;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(group)}
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.deleteModal}>
              <View style={styles.deleteIcon}>
                <Ionicons name="trash-outline" size={25} color="#DC2626" />
              </View>
              <Text style={styles.deleteModalTitle}>
                {multiRole ? "Delete which invitations?" : "Delete Invitation?"}
              </Text>
              <Text style={styles.deleteModalDescription}>
                {multiRole
                  ? `Choose the roles to remove for ${group.name || "this person"}. Unchecked roles stay pending.`
                  : "This person will no longer be able to accept this invitation."}
              </Text>

              {multiRole ? (
                <View style={{ width: "100%", marginTop: 8 }}>
                  {group.invitations.map((inv) => {
                    const checked = selectedIds.has(inv.id);
                    const badge =
                      inv.role === "member_visibility"
                        ? {
                            bg: "#DCFCE7",
                            text: "#16A34A",
                            label: "Member",
                            icon: "person",
                          }
                        : inv.role === "staff_visibility"
                          ? {
                              bg: "#E0F2FE",
                              text: "#0284C7",
                              label: "Staff",
                              icon: "briefcase",
                            }
                          : inv.role === "admin"
                            ? {
                                bg: "#EDE9FE",
                                text: "#7C3AED",
                                label: "Admin",
                                icon: "shield-checkmark",
                              }
                            : {
                                bg: "#FEF3C7",
                                text: "#B45309",
                                label: "Ownership",
                                icon: "swap-horizontal",
                              };

                    return (
                      <TouchableOpacity
                        key={inv.id}
                        style={styles.revokeToggleRow}
                        onPress={() => toggle(inv.id)}
                        activeOpacity={0.8}
                        disabled={submitting}
                      >
                        <View
                          style={[
                            styles.revokeToggleIconWrap,
                            { backgroundColor: badge.bg },
                          ]}
                        >
                          <Ionicons
                            name={badge.icon as any}
                            size={18}
                            color={badge.text}
                          />
                        </View>
                        <View style={styles.revokeToggleContent}>
                          <Text style={styles.revokeToggleTitle}>
                            {badge.label} invitation
                          </Text>
                          <Text
                            style={styles.revokeToggleSubtitle}
                            numberOfLines={1}
                          >
                            +91{inv.invited_phone}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.revokeCheckbox,
                            checked && styles.revokeCheckboxChecked,
                          ]}
                        >
                          {checked ? (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#FFFFFF"
                            />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    style={{
                      alignSelf: "center",
                      marginTop: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                    onPress={() => {
                      if (allSelected) setSelectedIds(new Set());
                      else
                        setSelectedIds(
                          new Set(group.invitations.map((i) => i.id)),
                        );
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        color: "#2563EB",
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.deleteModalActions}>
                <TouchableOpacity
                  style={styles.cancelModalButton}
                  onPress={onCancel}
                  activeOpacity={0.8}
                  disabled={submitting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.deleteConfirmButton,
                    nothingSelected && { opacity: 0.55 },
                  ]}
                  onPress={() => onConfirm(Array.from(selectedIds))}
                  activeOpacity={0.8}
                  disabled={submitting || nothingSelected}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color="#FFFFFF"
                      />
                      <Text style={styles.deleteConfirmText}>
                        {multiRole && !allSelected
                          ? `Delete ${selectedIds.size}`
                          : "Delete"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ============================================================================
// DELETE PROPERTY MODAL
// ============================================================================

interface DeletePropertyModalProps {
  visible: boolean;
  propertyName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeletePropertyModal({
  visible,
  propertyName,
  submitting,
  onCancel,
  onConfirm,
}: DeletePropertyModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (visible) setAcknowledged(false);
  }, [visible]);

  const canConfirm = acknowledged && !submitting;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.deletePropertyModal}>
              <View style={styles.deletePropertyIcon}>
                <Ionicons name="warning" size={28} color="#DC2626" />
              </View>

              <Text style={styles.deletePropertyTitle}>
                Delete this property?
              </Text>

              <Text style={styles.deletePropertySubtitle} numberOfLines={2}>
                You're about to delete{" "}
                <Text style={{ fontWeight: "800", color: "#0F172A" }}>
                  {propertyName || "this property"}
                </Text>
                .
              </Text>

              <View style={styles.deletePropertyWarningCard}>
                <Text style={styles.deletePropertyWarningTitle}>
                  This will permanently remove:
                </Text>

                {[
                  "All members and their payment history",
                  "All staff and attendance records",
                  "All expenses and income entries",
                  "Bill templates and settings",
                  "Access for every admin, member, and staff",
                ].map((line) => (
                  <View key={line} style={styles.deletePropertyBullet}>
                    <Ionicons name="remove-circle" size={12} color="#DC2626" />
                    <Text style={styles.deletePropertyBulletText}>{line}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.deletePropertyNote}>
                This action cannot be undone.
              </Text>

              <TouchableOpacity
                style={styles.deletePropertyCheckboxRow}
                onPress={() => setAcknowledged((v) => !v)}
                activeOpacity={0.75}
                disabled={submitting}
              >
                <View
                  style={[
                    styles.deletePropertyCheckbox,
                    acknowledged && styles.deletePropertyCheckboxChecked,
                  ]}
                >
                  {acknowledged ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : null}
                </View>
                <Text style={styles.deletePropertyCheckboxLabel}>
                  I understand this will permanently delete the property and all
                  of its data.
                </Text>
              </TouchableOpacity>

              <View style={styles.deletePropertyActions}>
                <TouchableOpacity
                  style={styles.cancelModalButton}
                  onPress={onCancel}
                  activeOpacity={0.8}
                  disabled={submitting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.deleteConfirmButton,
                    !canConfirm && { opacity: 0.5 },
                  ]}
                  onPress={onConfirm}
                  activeOpacity={0.85}
                  disabled={!canConfirm}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color="#FFFFFF"
                      />
                      <Text style={styles.deleteConfirmText}>
                        Delete Property
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ============================================================================
// SCREEN
// ============================================================================

export default function AccountProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuthStore();
  const {
    selectedAccount,
    editAccount,
    refresh: refreshAccounts,
  } = useAccounts() as any;
  const { isAdmin } = useUserRole();
  const canEdit = isAdmin;

  const alert = useAppAlert();
  const showAlert = alert.show;

  const [propertyName, setPropertyName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const [invitations, setInvitations] = useState<ApiInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [invitationToDelete, setInvitationToDelete] = useState<string | null>(
    null,
  );
  const [deletingInvitation, setDeletingInvitation] = useState(false);

  const [pendingGroupToDelete, setPendingGroupToDelete] =
    useState<PendingGroup | null>(null);

  const [resendingInvitationId, setResendingInvitationId] = useState<
    string | null
  >(null);

  const [showRevokeAccessModal, setShowRevokeAccessModal] = useState(false);

  // Delete property modal state
  const [showDeletePropertyModal, setShowDeletePropertyModal] = useState(false);
  const [deletingProperty, setDeletingProperty] = useState(false);

  // ============================================================
  // DERIVED
  // ============================================================

  const pendingInvitations = useMemo(
    () => invitations.filter((i) => i.status === "pending"),
    [invitations],
  );
  const rejectedInvitations = useMemo(
    () => invitations.filter((i) => i.status === "rejected"),
    [invitations],
  );
  const acceptedInvitations = useMemo(
    () => invitations.filter((i) => i.status === "accepted" && !i.dismissed_at),
    [invitations],
  );

  const pendingGroups = useMemo<PendingGroup[]>(() => {
    const byKey = new Map<string, PendingGroup>();

    for (const inv of pendingInvitations) {
      const ten = normalizePhone(inv.invited_phone);
      const key = `${inv.account_id}:${ten}`;
      const existing = byKey.get(key);

      if (existing) {
        if (!existing.roles.includes(inv.role)) existing.roles.push(inv.role);
        existing.invitations.push(inv);
        continue;
      }

      byKey.set(key, {
        key,
        phone: ten,
        name: inv.invitee_user_name ?? inv.invited_name ?? "Invitee",
        photoUrl:
          inv.invitee_user_photo_url ?? inv.accepted_user_photo_url ?? null,
        roles: [inv.role],
        invitations: [inv],
      });
    }

    return Array.from(byKey.values());
  }, [pendingInvitations]);

  const pendingOwnershipGroups = useMemo(
    () => pendingGroups.filter((g) => g.roles.includes("ownership_transfer")),
    [pendingGroups],
  );
  const pendingNonOwnershipGroups = useMemo(
    () => pendingGroups.filter((g) => !g.roles.includes("ownership_transfer")),
    [pendingGroups],
  );

  const personKey = useCallback((inv: ApiInvitation): string => {
    if (inv.accepted_by) return `u:${inv.accepted_by}`;
    const ten = String(inv.invited_phone ?? "").replace(/\D/g, "");
    return `p:${ten.slice(-10)}`;
  }, []);

  const acceptedPeople = useMemo<AccessPerson[]>(() => {
    const byKey = new Map<string, AccessPerson>();

    for (const inv of acceptedInvitations) {
      const key = personKey(inv);
      const existing = byKey.get(key);

      if (existing) {
        if (!existing.roles.includes(inv.role)) existing.roles.push(inv.role);
        existing.invitations.push(inv);
        continue;
      }

      const photoUrl =
        inv.accepted_user_photo_url ?? inv.invitee_user_photo_url ?? null;
      const name =
        inv.accepted_user_name ??
        inv.invitee_user_name ??
        inv.invited_name ??
        "";

      byKey.set(key, {
        key,
        userId: inv.accepted_by ?? null,
        phone: String(inv.invited_phone ?? ""),
        name,
        photoUrl,
        roles: [inv.role],
        primaryInvitation: inv,
        invitations: [inv],
      });
    }

    return Array.from(byKey.values());
  }, [acceptedInvitations, personKey]);

  const effectiveRoleOf = useCallback(
    (person: AccessPerson): InvitationRole => {
      if (person.roles.includes("ownership_transfer"))
        return "ownership_transfer";
      if (person.roles.includes("admin")) return "admin";
      if (person.roles.includes("member_visibility"))
        return "member_visibility";
      return "staff_visibility";
    },
    [],
  );

  const isOwner = selectedAccount?.ownerId === user?.id;

  const acceptedOwnership = useMemo(
    () =>
      acceptedPeople
        .filter((p) => p.userId !== selectedAccount?.ownerId)
        .filter((p) => effectiveRoleOf(p) === "ownership_transfer"),
    [acceptedPeople, selectedAccount?.ownerId, effectiveRoleOf],
  );

  const acceptedAdmins = useMemo(
    () =>
      acceptedPeople
        .filter((p) => p.userId !== selectedAccount?.ownerId)
        .filter((p) => effectiveRoleOf(p) === "admin"),
    [acceptedPeople, selectedAccount?.ownerId, effectiveRoleOf],
  );

  const acceptedMembers = useMemo(
    () =>
      acceptedPeople
        .filter((p) => p.userId !== selectedAccount?.ownerId)
        .filter((p) => effectiveRoleOf(p) === "member_visibility"),
    [acceptedPeople, selectedAccount?.ownerId, effectiveRoleOf],
  );

  const acceptedStaff = useMemo(
    () =>
      acceptedPeople
        .filter((p) => p.userId !== selectedAccount?.ownerId)
        .filter((p) => effectiveRoleOf(p) === "staff_visibility"),
    [acceptedPeople, selectedAccount?.ownerId, effectiveRoleOf],
  );

  const acceptedInvitationsForRevoke = useMemo(() => {
    return acceptedPeople
      .filter((p) => p.userId !== selectedAccount?.ownerId)
      .flatMap((p) => p.invitations);
  }, [acceptedPeople, selectedAccount?.ownerId]);

  const revokeAdmins = useMemo(
    () => acceptedInvitationsForRevoke.filter((i) => i.role === "admin"),
    [acceptedInvitationsForRevoke],
  );
  const revokeMembers = useMemo(
    () =>
      acceptedInvitationsForRevoke.filter(
        (i) => i.role === "member_visibility",
      ),
    [acceptedInvitationsForRevoke],
  );
  const revokeStaff = useMemo(
    () =>
      acceptedInvitationsForRevoke.filter((i) => i.role === "staff_visibility"),
    [acceptedInvitationsForRevoke],
  );
  const revokeOwnership = useMemo(
    () =>
      acceptedInvitationsForRevoke.filter(
        (i) => i.role === "ownership_transfer",
      ),
    [acceptedInvitationsForRevoke],
  );

  const totalPeopleWithAccess =
    acceptedPeople.length +
    pendingGroups.length +
    rejectedInvitations.length +
    (selectedAccount?.ownerId === user?.id ? 1 : 0);

  const totalRevocable = acceptedPeople.filter(
    (p) => p.userId !== selectedAccount?.ownerId,
  ).length;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync("auth_token");
    } catch (err) {
      console.warn("[account-profile] SecureStore read failed:", err);
      return null;
    }
  }, []);

  // ============================================================
  // LOAD INVITATIONS
  // ============================================================

  const loadInvitations = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!selectedAccount?.id) return;
      if (!opts?.silent) setInvitationsLoading(true);
      try {
        const token = await getAuthToken();
        if (!token) return;
        const url = `${API_URL}/api/accounts/${selectedAccount.id}/invitations`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.invitations)
            ? data.invitations
            : Array.isArray(data?.rows)
              ? data.rows
              : [];

        const KNOWN_STATUS = [
          "pending",
          "accepted",
          "rejected",
          "revoked",
          "cancelled",
        ];
        const KNOWN_ROLE = [
          "admin",
          "member_visibility",
          "staff_visibility",
          "ownership_transfer",
        ];

        const normalized: ApiInvitation[] = rows.map((r) => {
          const rawStatus = String(r.status ?? "")
            .trim()
            .toLowerCase();
          const safeStatus = (
            KNOWN_STATUS.includes(rawStatus) ? rawStatus : "pending"
          ) as InvitationStatus;

          const rawRole = String(r.role ?? "")
            .trim()
            .toLowerCase();
          const safeRole = (
            KNOWN_ROLE.includes(rawRole) ? rawRole : "member_visibility"
          ) as InvitationRole;

          return {
            ...r,
            status: safeStatus,
            role: safeRole,
            accepted_user_name: r.accepted_user_name ?? null,
            accepted_user_photo_url: r.accepted_user_photo_url ?? null,
            invitee_user_name: r.invitee_user_name ?? null,
            invitee_user_photo_url: r.invitee_user_photo_url ?? null,
            can_dismiss: r.can_dismiss === true,
          };
        });

        setInvitations(normalized);
      } catch (err) {
        console.warn("[account-profile] loadInvitations error:", err);
      } finally {
        if (!opts?.silent) setInvitationsLoading(false);
      }
    },
    [selectedAccount?.id, getAuthToken],
  );

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) loadInvitations({ silent: true });
  }, [isFocused, loadInvitations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvitations({ silent: true });
    setRefreshing(false);
  }, [loadInvitations]);

  // ============================================================
  // PHOTO
  // ============================================================

  const takePhoto = async () => {
    if (!canEdit) return;
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert({
        variant: "warning",
        title: "Permission needed",
        message: "Please grant permission to access your camera.",
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setRawImage({ uri: asset.uri, width: asset.width, height: asset.height });
      setShowAdjustModal(true);
    }
  };

  const choosePhoto = async () => {
    if (!canEdit) return;
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert({
        variant: "warning",
        title: "Permission needed",
        message: "Please grant permission to access your photos.",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setRawImage({ uri: asset.uri, width: asset.width, height: asset.height });
      setShowAdjustModal(true);
    }
  };

  const handleAdjustConfirm = async (uri: string) => {
    if (!canEdit) return;
    if (selectedAccount) {
      try {
        await editAccount(selectedAccount.id, { photoUri: uri });
      } catch (error) {
        console.error("Failed to update account photo:", error);
      }
    }
    setShowAdjustModal(false);
    setRawImage(null);
  };

  const handleAdjustCancel = () => {
    setShowAdjustModal(false);
    setRawImage(null);
  };

  // ============================================================
  // NAME
  // ============================================================

  const startEditingName = () => {
    if (!canEdit) return;
    setPropertyName(selectedAccount?.name || "");
    setEditingName(true);
  };

  const cancelEditingName = () => {
    if (savingName) return;
    setEditingName(false);
    setPropertyName("");
  };

  const savePropertyName = async () => {
    if (!canEdit || savingName) return;
    const trimmed = propertyName.trim();
    if (!trimmed || !selectedAccount) return;

    setSavingName(true);
    try {
      await editAccount(selectedAccount.id, { name: trimmed });
      setEditingName(false);
    } catch (err) {
      console.error("savePropertyName error:", err);
      showAlert({
        variant: "error",
        title: "Error",
        message: "Failed to update account name.",
      });
    } finally {
      setSavingName(false);
    }
  };

  // ============================================================
  // INVITATION ACTIONS
  // ============================================================

  const confirmDeleteInvitation = async () => {
    if (!invitationToDelete) return;
    const authToken = await getAuthToken();
    if (!authToken) return;

    setDeletingInvitation(true);
    try {
      const res = await fetch(
        `${API_URL}/api/accounts/${selectedAccount?.id}/invitations/${invitationToDelete}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        },
      );
      if (!res.ok) {
        showAlert({
          variant: "error",
          title: "Error",
          message: "Failed to delete invitation",
        });
        return;
      }
      setInvitations((prev) => prev.filter((i) => i.id !== invitationToDelete));
      setInvitationToDelete(null);
    } catch (err) {
      console.error("deleteInvitation error:", err);
      showAlert({
        variant: "error",
        title: "Error",
        message: "Network error",
      });
    } finally {
      setDeletingInvitation(false);
    }
  };

  const confirmDeletePendingGroup = async (ids: string[]) => {
    if (!pendingGroupToDelete || ids.length === 0) return;
    const authToken = await getAuthToken();
    if (!authToken) return;

    setDeletingInvitation(true);
    try {
      const url =
        ids.length === 1
          ? `${API_URL}/api/accounts/${selectedAccount?.id}/invitations/${ids[0]}`
          : `${API_URL}/api/accounts/${selectedAccount?.id}/invitations/batch`;

      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: ids.length === 1 ? undefined : JSON.stringify({ ids }),
      });

      if (!res.ok) {
        showAlert({
          variant: "error",
          title: "Error",
          message: "Failed to delete invitation(s)",
        });
        return;
      }

      const idSet = new Set(ids);
      setInvitations((prev) => prev.filter((i) => !idSet.has(i.id)));
      setPendingGroupToDelete(null);
    } catch (err) {
      console.error("deletePendingGroup error:", err);
      showAlert({
        variant: "error",
        title: "Error",
        message: "Network error",
      });
    } finally {
      setDeletingInvitation(false);
    }
  };

  const handleDismissInvitation = async (invitationId: string) => {
    const authToken = await getAuthToken();
    if (!authToken) return;
    try {
      const res = await fetch(
        `${API_URL}/api/accounts/${selectedAccount?.id}/invitations/${invitationId}/dismiss`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        },
      );
      if (!res.ok) return;
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    } catch (err) {
      console.warn("dismissInvitation error:", err);
    }
  };

  const handleResendInvite = async (invitation: ApiInvitation) => {
    const authToken = await getAuthToken();
    if (!authToken) {
      showAlert({
        variant: "error",
        title: "Error",
        message: "You're not signed in. Please log in again.",
      });
      return;
    }

    setResendingInvitationId(invitation.id);
    try {
      const delRes = await fetch(
        `${API_URL}/api/accounts/${invitation.account_id}/invitations/${invitation.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        },
      );

      if (!delRes.ok) {
        let d: any = null;
        try {
          d = await delRes.json();
        } catch {}
        showAlert({
          variant: "error",
          title: "Resend Failed",
          message:
            d?.message ||
            d?.error ||
            "Could not clear the old invitation. Please try again.",
        });
        return;
      }

      const createRes = await fetch(
        `${API_URL}/api/accounts/${invitation.account_id}/invitations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            phone: invitation.invited_phone,
            name: invitation.invited_name ?? undefined,
            role: invitation.role,
            targetMemberId: invitation.target_member_id ?? undefined,
            targetStaffId: invitation.target_staff_id ?? undefined,
          }),
        },
      );

      let createData: any = null;
      try {
        createData = await createRes.json();
      } catch {}

      if (!createRes.ok) {
        showAlert({
          variant: "error",
          title: "Resend Failed",
          message:
            createData?.message ||
            createData?.error ||
            "Could not send a new invitation. Please try again.",
        });
        return;
      }

      await loadInvitations({ silent: true });
    } catch (err) {
      console.error("resendInvitation error:", err);
      showAlert({
        variant: "error",
        title: "Error",
        message: "Network error. Please check your connection.",
      });
    } finally {
      setResendingInvitationId(null);
    }
  };

  // ============================================================
  // DELETE PROPERTY
  // ============================================================

  const openDeleteProperty = () => {
    if (!isOwner) {
      showAlert({
        variant: "warning",
        title: "Only the owner can delete",
        message: "Only the account owner can delete this property.",
      });
      return;
    }
    setShowDeletePropertyModal(true);
  };

  const performDeleteProperty = async () => {
    if (!selectedAccount?.id || !isOwner) return;

    const token = await getAuthToken();
    if (!token) {
      showAlert({
        variant: "error",
        title: "Not signed in",
        message: "Please log in again and retry.",
      });
      return;
    }

    setDeletingProperty(true);
    try {
      const res = await fetch(`${API_URL}/api/accounts/${selectedAccount.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      let body: any = null;
      try {
        body = await res.json();
      } catch {}

      if (!res.ok) {
        const code = body?.code;
        let message = body?.message || "Could not delete the property.";
        if (code === "owner_required") {
          message = "Only the owner can delete this property.";
        } else if (code === "not_found") {
          message = "This property no longer exists.";
        }
        showAlert({
          variant: "error",
          title: "Delete failed",
          message,
        });
        return;
      }

      setShowDeletePropertyModal(false);

      try {
        if (typeof refreshAccounts === "function") {
          await refreshAccounts();
        }
      } catch {}

      showAlert({
        variant: "success",
        title: "Property deleted",
        message:
          "The property has been removed. You can create or join another property anytime.",
        buttons: [
          {
            text: "OK",
            style: "default",
            onPress: () => {
              try {
                router.replace("/(tabs)/profile");
              } catch {
                router.replace("/(tabs)");
              }
            },
          },
        ],
      });
    } catch (err) {
      console.error("deleteProperty error:", err);
      showAlert({
        variant: "error",
        title: "Network error",
        message: "Please check your connection and try again.",
      });
    } finally {
      setDeletingProperty(false);
    }
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const roleBadge = (role: InvitationRole) => {
    switch (role) {
      case "admin":
        return {
          label: "Admin",
          style: styles.adminBadge,
          text: styles.adminBadgeText,
        };
      case "member_visibility":
        return {
          label: "Member",
          style: styles.memberBadge,
          text: styles.memberBadgeText,
        };
      case "staff_visibility":
        return {
          label: "Staff",
          style: styles.staffBadge,
          text: styles.staffBadgeText,
        };
      case "ownership_transfer":
        return {
          label: "Ownership",
          style: styles.ownershipBadge,
          text: styles.ownershipBadgeText,
        };
    }
  };

  const renderPersonRow = (
    person: AccessPerson,
    isLast: boolean,
    kind: "ownership" | "admin" | "member" | "staff",
  ) => {
    const avatarStyle =
      kind === "admin"
        ? styles.adminAvatar
        : kind === "member"
          ? styles.memberAvatar
          : kind === "staff"
            ? styles.staffAvatar
            : styles.ownershipAvatar;

    const avatarTextStyle =
      kind === "member"
        ? styles.memberAvatarText
        : kind === "staff"
          ? styles.staffAvatarText
          : kind === "ownership"
            ? styles.ownershipAvatarText
            : undefined;

    const badge =
      kind === "admin"
        ? {
            label: "ADMIN",
            style: styles.adminBadge,
            text: styles.adminBadgeText,
          }
        : kind === "member"
          ? {
              label: "MEMBER",
              style: styles.memberBadge,
              text: styles.memberBadgeText,
            }
          : kind === "staff"
            ? {
                label: "STAFF",
                style: styles.staffBadge,
                text: styles.staffBadgeText,
              }
            : {
                label: "OWNERSHIP",
                style: styles.ownershipBadge,
                text: styles.ownershipBadgeText,
              };

    const secondaryLabel = (() => {
      if (kind === "admin") return null;
      if (kind === "member" && person.roles.includes("staff_visibility"))
        return "STAFF";
      if (kind === "staff" && person.roles.includes("member_visibility"))
        return "MEMBER";
      return null;
    })();

    return (
      <View
        key={person.key}
        style={[styles.accessRow, isLast && styles.lastAccessRow]}
      >
        <GrantAvatar
          photoUrl={person.photoUrl}
          name={person.name || "Unknown"}
          style={avatarStyle}
          textStyle={avatarTextStyle}
        />
        <View style={styles.accessInfo}>
          <Text style={styles.accessName} numberOfLines={1}>
            {person.name || "Unknown"}
          </Text>
          <Text style={styles.accessPhone}>+91{person.phone}</Text>
        </View>

        {secondaryLabel ? (
          <View
            style={[
              styles.accessBadge,
              secondaryLabel === "STAFF"
                ? styles.staffBadge
                : styles.memberBadge,
            ]}
          >
            <Text
              style={
                secondaryLabel === "STAFF"
                  ? styles.staffBadgeText
                  : styles.memberBadgeText
              }
            >
              {secondaryLabel}
            </Text>
          </View>
        ) : null}

        <View style={[styles.accessBadge, badge.style]}>
          <Text style={badge.text}>{badge.label}</Text>
        </View>

        {kind === "member" || kind === "staff" ? (
          <TouchableOpacity
            style={styles.closeIconButton}
            onPress={() => {
              person.invitations.forEach((inv) =>
                handleDismissInvitation(inv.id),
              );
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color="#64748B" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderPendingGroupRow = (
    group: PendingGroup,
    isLast: boolean,
    kind: "ownership" | "other",
  ) => {
    const avatarStyle =
      kind === "ownership" ? styles.ownershipAvatar : styles.pendingAvatar;
    const avatarTextStyle =
      kind === "ownership"
        ? styles.ownershipAvatarText
        : styles.pendingAvatarText;

    return (
      <View
        key={group.key}
        style={[styles.accessRow, isLast && styles.lastAccessRow]}
      >
        <GrantAvatar
          photoUrl={group.photoUrl}
          name={group.name}
          style={avatarStyle}
          textStyle={avatarTextStyle}
        />
        <View style={styles.accessInfo}>
          <Text style={styles.accessName} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.accessPhone}>+91{group.phone}</Text>

          {kind === "ownership" ? (
            <View style={styles.ownershipPendingPill}>
              <Ionicons name="hourglass-outline" size={11} color="#B45309" />
              <Text style={styles.ownershipPendingPillText}>
                Pending acceptance
              </Text>
            </View>
          ) : null}
        </View>

        {group.roles
          .filter((r) =>
            kind === "ownership"
              ? r === "ownership_transfer"
              : r !== "ownership_transfer",
          )
          .map((role) => {
            const badge = roleBadge(role);
            return (
              <View
                key={role}
                style={[styles.accessBadge, badge.style, { marginLeft: 6 }]}
              >
                <Text style={badge.text}>{badge.label.toUpperCase()}</Text>
              </View>
            );
          })}

        <TouchableOpacity
          style={styles.deleteInvitationButton}
          onPress={() => setPendingGroupToDelete(group)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
            colors={["#2563EB"]}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        {/* ACCOUNT CARD */}
        <View style={styles.profileCard}>
          <View style={styles.profileAccent} />
          <View style={styles.profileCardContent}>
            <View style={styles.avatarContainer}>
              {selectedAccount?.photoUri ? (
                <Image
                  source={{ uri: selectedAccount.photoUri }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>
                    {selectedAccount?.name
                      ? getInitials(selectedAccount.name)
                      : "A"}
                  </Text>
                </View>
              )}
              {canEdit && (
                <TouchableOpacity
                  style={styles.cameraButton}
                  onPress={() => setShowPhotoOptions(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.profileDetails}>
              {editingName ? (
                <View style={styles.nameEditContainer}>
                  <TextInput
                    style={styles.inlineNameInput}
                    value={propertyName}
                    onChangeText={setPropertyName}
                    autoFocus
                    editable={!savingName}
                    onSubmitEditing={savePropertyName}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    style={styles.cancelNameButton}
                    onPress={cancelEditingName}
                    activeOpacity={0.8}
                    disabled={savingName}
                  >
                    <Ionicons name="close" size={17} color="#475569" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveNameButton}
                    onPress={savePropertyName}
                    activeOpacity={0.8}
                    disabled={savingName}
                  >
                    {savingName ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameDisplayContainer}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {selectedAccount?.name || "Apartment"}
                  </Text>
                  {canEdit && (
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={startEditingName}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pencil" size={13} color="#FFFFFF" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.phoneDisplayRow}>
                <Ionicons name="call-outline" size={14} color="#64748B" />
                <Text style={styles.userPhone} numberOfLines={1}>
                  {user?.phone}
                </Text>
              </View>

              <View style={styles.accountTypeBadge}>
                <View style={styles.accountTypeDot} />
                <Text style={styles.accountTypeText}>Society Account</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ACCESS & ROLES */}
        {canEdit && (
          <>
            <Text style={styles.sectionTitle}>ACCESS & ROLES</Text>
            <View style={styles.menuCard}>
              <MenuRow
                icon="shield-outline"
                color="#7C3AED"
                title="Add Admin"
                description="Give another person administrator access"
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/grant-access",
                    params: {
                      accountId: selectedAccount?.id || "",
                      role: "admin",
                    },
                  })
                }
              />

              {/* ── Single entry point for BOTH member & staff visibility ── */}
              <MenuRow
                icon="eye-outline"
                color="#16A34A"
                title="Manage Visibility"
                description="Manage apartment owner and staff visibility access"
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/grant-access",
                    params: {
                      accountId: selectedAccount?.id || "",
                      role: "member_visibility",
                      visibilityTabs: "true",
                    },
                  })
                }
              />

              <MenuRow
                icon="swap-horizontal-outline"
                color="#D97706"
                title="Transfer account ownership"
                description="Transfer full ownership of this account to another person"
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/grant-access",
                    params: {
                      accountId: selectedAccount?.id || "",
                      role: "ownership_transfer",
                      memberType: "ownership",
                    },
                  })
                }
                isLast
              />
            </View>

            {isOwner && (
              <>
                <Text style={styles.sectionTitle}>REVOKE ACCESS</Text>
                <View style={styles.menuCard}>
                  <TouchableOpacity
                    style={[styles.menuItem, styles.menuItemLast]}
                    onPress={() => setShowRevokeAccessModal(true)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.menuItemLeft}>
                      <View
                        style={[
                          styles.menuIcon,
                          { backgroundColor: "#FEF2F214" },
                        ]}
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={20}
                          color="#DC2626"
                        />
                      </View>
                      <View style={styles.menuItemContent}>
                        <Text style={styles.menuItemTitle}>
                          Revoke Admin, Member, Staff & Ownership Access
                        </Text>
                        <Text
                          style={styles.menuItemDescription}
                          numberOfLines={1}
                        >
                          {totalRevocable > 0
                            ? `${totalRevocable} ${
                                totalRevocable === 1
                                  ? "person has"
                                  : "people have"
                              } access — tap to manage`
                            : "No one has additional access"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.revokeAccessCountBadge}>
                      <Text style={styles.revokeAccessCountText}>
                        {totalRevocable}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        {/* PEOPLE WITH ACCESS */}
        <View style={styles.accessOverview}>
          <View style={styles.accessHeader}>
            <View>
              <Text style={styles.accessTitle}>People With Access</Text>
              <Text style={styles.accessSubtitle}>
                Users who can access this account
              </Text>
            </View>
            <View style={styles.accessTotalBadge}>
              {invitationsLoading ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.accessTotalText}>
                  {totalPeopleWithAccess}
                </Text>
              )}
            </View>
          </View>

          {selectedAccount?.ownerId === user?.id && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Account Owner</Text>
              <View
                style={[
                  styles.accessRow,
                  acceptedOwnership.length === 0 &&
                    acceptedAdmins.length === 0 &&
                    acceptedMembers.length === 0 &&
                    acceptedStaff.length === 0 &&
                    pendingGroups.length === 0 &&
                    rejectedInvitations.length === 0 &&
                    styles.lastAccessRow,
                ]}
              >
                <GrantAvatar
                  photoUrl={user?.photoUrl ?? null}
                  name={user?.name ?? user?.phone ?? "You"}
                  style={styles.ownerAvatar}
                />
                <View style={styles.accessInfo}>
                  <View style={styles.accessNameRow}>
                    <Text style={styles.accessName}>
                      {user?.name?.trim() ? user.name : "You"}
                    </Text>
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>YOU</Text>
                    </View>
                  </View>
                  <Text style={styles.accessPhone}>{user?.phone || ""}</Text>
                </View>
                <View style={[styles.accessBadge, styles.ownerBadge]}>
                  <Text style={styles.ownerBadgeText}>Owner</Text>
                </View>
              </View>
            </View>
          )}

          {acceptedOwnership.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Ownership</Text>
              {acceptedOwnership.map((person, index) =>
                renderPersonRow(
                  person,
                  index === acceptedOwnership.length - 1 &&
                    acceptedAdmins.length === 0 &&
                    acceptedMembers.length === 0 &&
                    acceptedStaff.length === 0 &&
                    pendingGroups.length === 0 &&
                    rejectedInvitations.length === 0,
                  "ownership",
                ),
              )}
            </View>
          )}

          {acceptedAdmins.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Admins</Text>
              {acceptedAdmins.map((person, index) =>
                renderPersonRow(
                  person,
                  index === acceptedAdmins.length - 1 &&
                    acceptedMembers.length === 0 &&
                    acceptedStaff.length === 0 &&
                    pendingGroups.length === 0 &&
                    rejectedInvitations.length === 0,
                  "admin",
                ),
              )}
            </View>
          )}

          {acceptedMembers.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Members</Text>
              {acceptedMembers.map((person, index) =>
                renderPersonRow(
                  person,
                  index === acceptedMembers.length - 1 &&
                    acceptedStaff.length === 0 &&
                    pendingGroups.length === 0 &&
                    rejectedInvitations.length === 0,
                  "member",
                ),
              )}
            </View>
          )}

          {acceptedStaff.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Staff</Text>
              {acceptedStaff.map((person, index) =>
                renderPersonRow(
                  person,
                  index === acceptedStaff.length - 1 &&
                    pendingGroups.length === 0 &&
                    rejectedInvitations.length === 0,
                  "staff",
                ),
              )}
            </View>
          )}

          {pendingOwnershipGroups.length > 0 && (
            <View style={styles.accessGroup}>
              <View style={styles.pendingHeader}>
                <Text style={styles.accessHeading}>Ownership Transfer</Text>
                <View
                  style={[
                    styles.pendingCountBadge,
                    { backgroundColor: "#FEF3C7" },
                  ]}
                >
                  <Text style={[styles.pendingCountText, { color: "#B45309" }]}>
                    {pendingOwnershipGroups.length}
                  </Text>
                </View>
              </View>
              {pendingOwnershipGroups.map((group, index) =>
                renderPendingGroupRow(
                  group,
                  index === pendingOwnershipGroups.length - 1 &&
                    pendingNonOwnershipGroups.length === 0 &&
                    rejectedInvitations.length === 0,
                  "ownership",
                ),
              )}
            </View>
          )}

          {pendingNonOwnershipGroups.length > 0 && (
            <View style={styles.accessGroup}>
              <View style={styles.pendingHeader}>
                <Text style={styles.accessHeading}>Pending Invitations</Text>
                <View style={styles.pendingCountBadge}>
                  <Text style={styles.pendingCountText}>
                    {pendingNonOwnershipGroups.length}
                  </Text>
                </View>
              </View>
              {pendingNonOwnershipGroups.map((group, index) =>
                renderPendingGroupRow(
                  group,
                  index === pendingNonOwnershipGroups.length - 1 &&
                    rejectedInvitations.length === 0,
                  "other",
                ),
              )}
            </View>
          )}

          {rejectedInvitations.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Rejected</Text>
              {rejectedInvitations.map((inv, index) => {
                const badge = roleBadge(inv.role);
                const isResending = resendingInvitationId === inv.id;
                const photoUrl =
                  inv.invitee_user_photo_url ??
                  inv.accepted_user_photo_url ??
                  null;
                const displayName =
                  inv.invitee_user_name ?? inv.invited_name ?? "Invitee";
                return (
                  <View
                    key={inv.id}
                    style={[
                      styles.accessRow,
                      index === rejectedInvitations.length - 1 &&
                        styles.lastAccessRow,
                    ]}
                  >
                    <GrantAvatar
                      photoUrl={photoUrl}
                      name={displayName}
                      style={styles.rejectedAvatar}
                      textStyle={styles.rejectedAvatarText}
                    />
                    <View style={styles.accessInfo}>
                      <Text style={styles.accessName}>{displayName}</Text>
                      <Text style={styles.accessPhone}>
                        +91{inv.invited_phone}
                      </Text>
                    </View>
                    <View style={[styles.accessBadge, badge.style]}>
                      <Text style={badge.text}>{badge.label}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.resendButton}
                      onPress={() => handleResendInvite(inv)}
                      activeOpacity={0.75}
                      disabled={isResending}
                    >
                      {isResending ? (
                        <ActivityIndicator size="small" color="#2563EB" />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={14} color="#2563EB" />
                          <Text style={styles.resendButtonText}>Resend</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteInvitationButton}
                      onPress={() => setInvitationToDelete(inv.id)}
                      activeOpacity={0.7}
                      disabled={isResending}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color="#DC2626"
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {!invitationsLoading &&
            acceptedAdmins.length === 0 &&
            acceptedMembers.length === 0 &&
            acceptedStaff.length === 0 &&
            acceptedOwnership.length === 0 &&
            pendingGroups.length === 0 &&
            rejectedInvitations.length === 0 &&
            selectedAccount?.ownerId !== user?.id && (
              <View style={styles.noAccessContainer}>
                <View style={styles.noAccessIcon}>
                  <Ionicons name="people-outline" size={26} color="#64748B" />
                </View>
                <Text style={styles.noAccessTitle}>No additional access</Text>
                <Text style={styles.noAccessText}>
                  No other people currently have access to this account.
                </Text>
              </View>
            )}
        </View>

        {/* DANGER ZONE (owner only) */}
        {isOwner && (
          <>
            <Text
              style={[styles.sectionTitle, { color: "#DC2626", marginTop: 12 }]}
            >
              DANGER ZONE
            </Text>
            <View style={styles.menuCard}>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={openDeleteProperty}
                activeOpacity={0.75}
                disabled={deletingProperty}
              >
                <View style={styles.menuItemLeft}>
                  <View
                    style={[styles.menuIcon, { backgroundColor: "#DC262614" }]}
                  >
                    {deletingProperty ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#DC2626"
                      />
                    )}
                  </View>
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemTitle}>
                      {deletingProperty ? "Deleting…" : "Delete Property"}
                    </Text>
                    <Text style={styles.menuItemDescription} numberOfLines={1}>
                      Permanently remove this property and its data
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* PHOTO OPTIONS */}
      {canEdit && (
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
              <Text style={styles.photoOptionsTitle}>Upload Photo</Text>
              <Text style={styles.photoOptionsSubtitle}>
                Choose how you want to add a photo
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
                    Capture a photo using your camera
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
                  style={[
                    styles.photoOptionIcon,
                    { backgroundColor: "#ecfdf5" },
                  ]}
                >
                  <Ionicons name="images" size={24} color="#059669" />
                </View>
                <View style={styles.photoOptionTextContainer}>
                  <Text style={styles.photoOptionTitle}>
                    Choose from Gallery
                  </Text>
                  <Text style={styles.photoOptionDescription}>
                    Select a photo from your device
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

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
      )}

      {/* PHOTO ADJUST */}
      {canEdit && (
        <PhotoAdjustModal
          visible={showAdjustModal}
          image={rawImage}
          onCancel={handleAdjustCancel}
          onConfirm={handleAdjustConfirm}
        />
      )}

      {/* DELETE SINGLE INVITATION */}
      {invitationToDelete && (
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(invitationToDelete)}
          onRequestClose={() => setInvitationToDelete(null)}
        >
          <TouchableWithoutFeedback onPress={() => setInvitationToDelete(null)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.deleteModal}>
                  <View style={styles.deleteIcon}>
                    <Ionicons name="trash-outline" size={25} color="#DC2626" />
                  </View>
                  <Text style={styles.deleteModalTitle}>
                    Delete Invitation?
                  </Text>
                  <Text style={styles.deleteModalDescription}>
                    This person will no longer be able to accept this
                    invitation.
                  </Text>
                  <View style={styles.deleteModalActions}>
                    <TouchableOpacity
                      style={styles.cancelModalButton}
                      onPress={() => setInvitationToDelete(null)}
                      activeOpacity={0.8}
                      disabled={deletingInvitation}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteConfirmButton}
                      onPress={confirmDeleteInvitation}
                      activeOpacity={0.8}
                      disabled={deletingInvitation}
                    >
                      {deletingInvitation ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons
                            name="trash-outline"
                            size={17}
                            color="#FFFFFF"
                          />
                          <Text style={styles.deleteConfirmText}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* DELETE GROUPED PENDING INVITATIONS */}
      <DeletePendingModal
        group={pendingGroupToDelete}
        submitting={deletingInvitation}
        onCancel={() => {
          if (deletingInvitation) return;
          setPendingGroupToDelete(null);
        }}
        onConfirm={(ids) => {
          void confirmDeletePendingGroup(ids);
        }}
      />

      {/* REVOKE ACCESS MODAL */}
      <RevokeAccessModal
        visible={showRevokeAccessModal}
        onClose={() => setShowRevokeAccessModal(false)}
        accountId={selectedAccount?.id ?? null}
        acceptedAdmins={revokeAdmins}
        acceptedMembers={revokeMembers}
        acceptedStaff={revokeStaff}
        acceptedOwnership={revokeOwnership}
        getAuthToken={getAuthToken}
        onRevoked={async () => {
          await loadInvitations({ silent: true });
        }}
        onNotify={(opts) => showAlert(opts)}
      />

      {/* DELETE PROPERTY MODAL */}
      <DeletePropertyModal
        visible={showDeletePropertyModal}
        propertyName={selectedAccount?.name || "this property"}
        submitting={deletingProperty}
        onCancel={() => {
          if (deletingProperty) return;
          setShowDeletePropertyModal(false);
        }}
        onConfirm={performDeleteProperty}
      />

      <AppAlert state={alert.state} onDismiss={alert.dismiss} />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 18,
  },
  profileAccent: { height: 5, backgroundColor: "#2563EB" },
  profileCardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
  },
  avatarContainer: { position: "relative", marginRight: 15 },
  avatar: { width: 76, height: 76, borderRadius: 22 },
  avatarPlaceholder: {
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 27, fontWeight: "700" },
  cameraButton: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 31,
    height: 31,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileDetails: { flex: 1, minWidth: 0 },
  nameDisplayContainer: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
  },
  userName: {
    flexShrink: 1,
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "700",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    marginLeft: 10,
  },
  editButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  phoneDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  userPhone: { color: "#64748B", fontSize: 13, marginLeft: 6 },
  accountTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 9,
  },
  accountTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
    marginRight: 6,
  },
  accountTypeText: { color: "#475569", fontSize: 10, fontWeight: "700" },
  nameEditContainer: { flexDirection: "row", alignItems: "center" },
  inlineNameInput: {
    flex: 1,
    maxWidth: 175,
    height: 42,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "#F8FBFF",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  cancelNameButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  saveNameButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },

  sectionTitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginLeft: 4,
    marginBottom: 7,
    marginTop: 4,
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 18,
  },
  menuItem: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  menuIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  menuItemContent: { flex: 1, minWidth: 0 },
  menuItemTitle: { color: "#1E293B", fontSize: 14, fontWeight: "600" },
  menuItemDescription: { color: "#94A3B8", fontSize: 10, marginTop: 3 },

  revokeAccessCountBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  revokeAccessCountText: { color: "#DC2626", fontSize: 13, fontWeight: "800" },

  accessOverview: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  accessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
  },
  accessTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  accessSubtitle: { color: "#64748B", fontSize: 11, marginTop: 3 },
  accessTotalBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  accessTotalText: { color: "#2563EB", fontSize: 13, fontWeight: "700" },
  accessGroup: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  accessHeading: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 5,
  },
  accessRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  lastAccessRow: { borderBottomWidth: 0 },
  accessAvatar: {
    width: 41,
    height: 41,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  ownerAvatar: { backgroundColor: "#DBEAFE", marginRight: 11 },
  adminAvatar: { backgroundColor: "#EDE9FE", marginRight: 11 },
  memberAvatar: { backgroundColor: "#DCFCE7", marginRight: 11 },
  staffAvatar: { backgroundColor: "#E0F2FE", marginRight: 11 },
  pendingAvatar: { backgroundColor: "#FEF3C7", marginRight: 11 },
  rejectedAvatar: { backgroundColor: "#FEF2F2", marginRight: 11 },
  ownershipAvatar: { backgroundColor: "#FEF3C7", marginRight: 11 },
  ownershipAvatarText: { color: "#B45309" },
  accessAvatarText: { color: "#2563EB", fontSize: 15, fontWeight: "700" },
  pendingAvatarText: { color: "#B45309" },
  rejectedAvatarText: { color: "#DC2626" },
  memberAvatarText: { color: "#16A34A" },
  staffAvatarText: { color: "#0284C7" },
  accessInfo: { flex: 1, minWidth: 0 },
  accessNameRow: { flexDirection: "row", alignItems: "center" },
  accessName: { color: "#1E293B", fontSize: 13, fontWeight: "700" },
  accessPhone: { color: "#94A3B8", fontSize: 11, marginTop: 3 },
  youBadge: {
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 6,
  },
  youBadgeText: { color: "#2563EB", fontSize: 8, fontWeight: "700" },
  accessBadge: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginLeft: 8,
  },
  ownerBadge: { backgroundColor: "#DBEAFE" },
  ownerBadgeText: { color: "#1D4ED8", fontSize: 9, fontWeight: "700" },
  adminBadge: { backgroundColor: "#EDE9FE" },
  adminBadgeText: { color: "#7C3AED", fontSize: 9, fontWeight: "700" },
  memberBadge: { backgroundColor: "#DCFCE7" },
  memberBadgeText: { color: "#16A34A", fontSize: 9, fontWeight: "700" },
  staffBadge: { backgroundColor: "#E0F2FE" },
  staffBadgeText: { color: "#0284C7", fontSize: 9, fontWeight: "700" },
  ownershipBadge: { backgroundColor: "#FEF3C7" },
  ownershipBadgeText: { color: "#B45309", fontSize: 9, fontWeight: "700" },
  ownershipPendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  ownershipPendingPillText: {
    color: "#B45309",
    fontSize: 10,
    fontWeight: "700",
  },
  pendingHeader: { flexDirection: "row", alignItems: "center" },
  pendingCountBadge: {
    minWidth: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
    marginTop: 7,
  },
  pendingCountText: { color: "#B45309", fontSize: 9, fontWeight: "700" },
  deleteInvitationButton: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  closeIconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    minWidth: 72,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    marginLeft: 8,
  },
  resendButtonText: { color: "#2563EB", fontSize: 11, fontWeight: "700" },
  noAccessContainer: {
    alignItems: "center",
    paddingHorizontal: 25,
    paddingVertical: 28,
  },
  noAccessIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  noAccessTitle: { color: "#334155", fontSize: 14, fontWeight: "700" },
  noAccessText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 4,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 16,
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
  photoOptionsCancelText: { fontSize: 15, fontWeight: "700", color: "#dc2626" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },

  deleteModal: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  deleteIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  deleteModalTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  deleteModalDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 7,
    maxWidth: 290,
  },
  deleteModalActions: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
    marginTop: 20,
    gap: 9,
  },
  deleteConfirmButton: {
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  deleteConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  cancelModalButton: {
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: { color: "#475569", fontSize: 13, fontWeight: "700" },

  revokeModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  revokeIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  revokeModalTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  revokeModalDescription: {
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 7,
    maxWidth: 340,
  },
  revokeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    gap: 10,
  },
  revokeToggleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  revokeToggleContent: { flex: 1, minWidth: 0 },
  revokeToggleTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },
  revokeToggleSubtitle: {
    color: "#64748B",
    fontSize: 11.5,
    marginTop: 3,
  },
  revokeCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  revokeCheckboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  revokeHint: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 10,
    maxWidth: 300,
  },
  revokeModalActions: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
    marginTop: 20,
    gap: 9,
  },
  revokeConfirmButton: {
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#7C3AED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  revokeConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  revokeAccessOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "flex-end",
  },
  revokeAccessContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 19,
    maxHeight: "90%",
    minHeight: "62%",
    paddingBottom: 16,
  },
  revokeAccessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  revokeAccessTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
  },
  revokeAccessSubtitle: {
    color: "#64748B",
    fontSize: 11.5,
    marginTop: 3,
  },
  revokeAccessCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  revokeAccessSearchContainer: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 13,
    paddingHorizontal: 12,
  },
  revokeAccessSearchInput: {
    flex: 1,
    height: "100%",
    color: "#0F172A",
    fontSize: 13,
    paddingHorizontal: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  revokeAccessTabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  revokeAccessTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  revokeAccessTabActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  revokeAccessTabText: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "700",
  },
  revokeAccessTabTextActive: { color: "#1D4ED8" },
  revokeAccessTabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  revokeAccessTabCountActive: { backgroundColor: "#DBEAFE" },
  revokeAccessTabCountText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
  },
  revokeAccessTabCountTextActive: { color: "#1D4ED8" },
  revokeAccessListWrapper: {
    flex: 1,
    minHeight: 240,
    marginTop: 8,
  },
  revokeAccessEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 42,
    paddingHorizontal: 25,
  },
  revokeAccessEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },
  revokeAccessEmptyTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  revokeAccessEmptyText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 4,
    maxWidth: 260,
  },
  revokeAccessRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  revokeAccessInfo: { flex: 1, minWidth: 0, marginLeft: 4 },
  revokeAccessName: {
    color: "#0F172A",
    fontSize: 13.5,
    fontWeight: "700",
  },
  revokeAccessSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  revokeAccessPhone: { color: "#94A3B8", fontSize: 11 },
  revokeAccessButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginLeft: 8,
  },
  revokeAccessButtonText: {
    color: "#DC2626",
    fontSize: 11.5,
    fontWeight: "800",
  },

  deletePropertyModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: "center",
  },
  deletePropertyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  deletePropertyTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  deletePropertySubtitle: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 340,
  },
  deletePropertyWarningCard: {
    width: "100%",
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    marginTop: 14,
  },
  deletePropertyWarningTitle: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  deletePropertyBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 3,
  },
  deletePropertyBulletText: {
    color: "#7F1D1D",
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
  deletePropertyNote: {
    color: "#DC2626",
    fontSize: 11.5,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  deletePropertyCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  deletePropertyCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  deletePropertyCheckboxChecked: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  deletePropertyCheckboxLabel: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  deletePropertyActions: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
    marginTop: 18,
    gap: 10,
  },
});

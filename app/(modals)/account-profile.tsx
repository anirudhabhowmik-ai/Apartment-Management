// app/(modals)/account-profile.tsx
import { Ionicons } from "@expo/vector-icons";
import {
    Contact,
    ContactField,
    ContactsSortOrder,
    requestPermissionsAsync,
} from "expo-contacts";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
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
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccounts } from "../../hooks/useAccounts";
import { useUserRole } from "../../hooks/useUserRole";
import { sendOtp, verifyOtp } from "../../services/otpService";
import { useAccessStore } from "../../store/accessStore";
import { useAuthStore } from "../../store/useAuthStore";

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: { number: string; label?: string }[];
}

interface RawImage {
  uri: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Photo Adjust Modal
// ---------------------------------------------------------------------------

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
            {
              x: g2.startTranslate.x + dx,
              y: g2.startTranslate.y + dy,
            },
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
          {
            crop: {
              originX,
              originY,
              width: cropSize,
              height: cropSize,
            },
          },
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
// SCREEN
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

export default function AccountProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user, setUser } = useAuthStore();
  const { selectedAccount, editAccount } = useAccounts();
  const { isAdmin } = useUserRole();
  const canEdit = isAdmin;

  const grants = useAccessStore((s) => s.grants);
  const removeGrant = useAccessStore((s) => s.removeGrant);

  const [propertyName, setPropertyName] = useState("");
  const [editingName, setEditingName] = useState(false);

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showPhoneTooltip, setShowPhoneTooltip] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState(["", "", "", "", "", ""]);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [timer, setTimer] = useState(30);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const otpInputs = useRef<(TextInput | null)[]>([]);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [invitationToDelete, setInvitationToDelete] = useState<string | null>(
    null,
  );

  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const accountGrants = grants.filter(
    (g) => g.accountId === selectedAccount?.id,
  );
  const pendingInvitations = accountGrants.filter((g) => !g.acceptedAt);
  const acceptedAdmins = accountGrants.filter(
    (g) => g.acceptedAt && g.role === "admin",
  );
  const visibleMembers = accountGrants.filter(
    (g) => g.acceptedAt && g.role === "member_visibility",
  );
  const visibleStaff = accountGrants.filter(
    (g) => g.acceptedAt && g.role === "staff_visibility",
  );

  const totalPeopleWithAccess =
    acceptedAdmins.length +
    visibleMembers.length +
    visibleStaff.length +
    pendingInvitations.length +
    (selectedAccount?.ownerId === user?.id ? 1 : 0);

  // ── Timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isTimerActive && timer > 0) {
      timerInterval.current = setInterval(() => setTimer((p) => p - 1), 1000);
    } else if (timer === 0) {
      setIsTimerActive(false);
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    }
    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    };
  }, [isTimerActive, timer]);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  // ── Photo ───────────────────────────────────────────────────────
  const takePhoto = async () => {
    if (!canEdit) return;
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Please grant permission to access your camera.",
      );
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
      Alert.alert(
        "Permission needed",
        "Please grant permission to access your photos.",
      );
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

  // ── Name ────────────────────────────────────────────────────────
  const startEditingName = () => {
    if (!canEdit) return;
    setPropertyName(selectedAccount?.name || "");
    setEditingName(true);
  };

  const savePropertyName = async () => {
    if (!canEdit) return;
    const trimmed = propertyName.trim();
    if (!trimmed || !selectedAccount) return;
    await editAccount(selectedAccount.id, { name: trimmed });
    setEditingName(false);
  };

  // ── Phone ───────────────────────────────────────────────────────
  const openPhoneEditor = () => {
    if (!canEdit) return;
    setPhone("");
    setPhoneOtp(["", "", "", "", "", ""]);
    setPhoneError("");
    setPhoneOtpSent(false);
    setOtpMessage("");
    setTimer(30);
    setIsTimerActive(false);
    setShowPhoneModal(true);
  };

  const handleSendPhoneOtp = async () => {
    if (phone.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number");
      return;
    }
    setPhoneError("");
    const result = await sendOtp(`+91${phone}`);
    if (result.success) {
      setPhoneOtpSent(true);
      setOtpMessage(`OTP sent to +91${phone}`);
      setTimer(30);
      setIsTimerActive(true);
      setTimeout(() => otpInputs.current[0]?.focus(), 300);
    } else {
      setPhoneError(result.message || "Unable to send OTP");
    }
  };

  const handleResendOtp = async () => {
    if (phone.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number");
      return;
    }
    setPhoneError("");
    const result = await sendOtp(`+91${phone}`);
    if (result.success) {
      setOtpMessage(`OTP resent to +91${phone}`);
      setTimer(30);
      setIsTimerActive(true);
      setTimeout(() => otpInputs.current[0]?.focus(), 300);
    } else {
      setPhoneError(result.message || "Unable to resend OTP");
    }
  };

  const verifyPhoneOtp = async () => {
    const otpString = phoneOtp.join("");
    if (otpString.length !== 6) {
      setPhoneError("Please enter complete 6-digit OTP");
      return;
    }
    const result = await verifyOtp(`+91${phone}`, otpString);
    if (!result.success) {
      setPhoneError(result.message || "Invalid OTP");
      return;
    }
    if (user) setUser({ ...user, phone: `+91${phone}` });
    closePhoneModal();
  };

  const closePhoneModal = () => {
    setShowPhoneModal(false);
    setPhone("");
    setPhoneOtp(["", "", "", "", "", ""]);
    setPhoneError("");
    setPhoneOtpSent(false);
    setOtpMessage("");
    setTimer(30);
    setIsTimerActive(false);
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(-1);
    const next = [...phoneOtp];
    next[index] = cleaned;
    setPhoneOtp(next);
    if (cleaned.length === 1 && index < 5) {
      otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (event: any, index: number) => {
    if (
      event.nativeEvent.key === "Backspace" &&
      !phoneOtp[index] &&
      index > 0
    ) {
      otpInputs.current[index - 1]?.focus();
    }
  };

  // ── Contacts ────────────────────────────────────────────────────
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
      const { status } = await requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your contacts to help you quickly add phone numbers.",
          [{ text: "Cancel", style: "cancel" }, { text: "OK" }],
        );
        setPhoneError("Permission to access contacts is required");
        return;
      }
      const contacts = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        { sortOrder: ContactsSortOrder.GivenName },
      );
      if (contacts.length === 0) {
        setPhoneError("No contacts found on your device");
        return;
      }
      const mapped: ContactData[] = contacts
        .filter((c) => c.phones && c.phones.length > 0)
        .map((c) => ({
          id: c.id,
          name: c.fullName || "Unknown",
          phoneNumbers: c.phones.map((p) => ({
            number: p.number || "",
            label: p.label || undefined,
          })),
        }));
      if (mapped.length === 0) {
        setPhoneError("No contacts with phone numbers found");
        return;
      }
      setContactSearch("");
      setContactsList(mapped);
      setShowContactPicker(true);
      setPhoneError("");
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setPhoneError("Failed to fetch contacts. Please try again.");
    }
  };

  const filteredContacts = contactsList.filter((c) => {
    const s = contactSearch.toLowerCase().trim();
    if (!s) return true;
    return (
      c.name.toLowerCase().includes(s) ||
      c.phoneNumbers.some((p) => p.number.toLowerCase().includes(s))
    );
  });

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  const selectContact = (contact: ContactData) => {
    if (!contact?.phoneNumbers?.length) {
      setPhoneError("Selected contact doesn't have a phone number");
      return;
    }
    let phoneNumber = contact.phoneNumbers[0].number || "";
    phoneNumber = phoneNumber
      .replace(/[^0-9]/g, "")
      .replace(/^91/, "")
      .replace(/^0/, "");
    if (phoneNumber.length > 10) phoneNumber = phoneNumber.slice(-10);
    if (phoneNumber.length !== 10) {
      setPhoneError(
        "Selected contact does not have a valid 10-digit phone number",
      );
      return;
    }
    setPhone(phoneNumber);
    setPhoneError("");
    setContactSearch("");
    setShowContactPicker(false);
  };

  // ── Invitation ──────────────────────────────────────────────────
  const confirmDeleteInvitation = () => {
    if (!invitationToDelete) return;
    removeGrant(invitationToDelete);
    setInvitationToDelete(null);
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        {/* HEADER */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Account Profile</Text>
            <Text style={styles.headerSubtitle}>
              Manage photo, name, phone and access
            </Text>
          </View>
        </View>

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
                    onSubmitEditing={savePropertyName}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    style={styles.saveNameButton}
                    onPress={savePropertyName}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark" size={17} color="#FFFFFF" />
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
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="create-outline"
                        size={15}
                        color="#2563EB"
                      />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Phone row */}
              <View style={styles.phoneDisplayRow}>
                <Ionicons name="call-outline" size={14} color="#64748B" />
                <TouchableOpacity
                  style={styles.phonePressable}
                  activeOpacity={0.7}
                  onPress={
                    canEdit ? openPhoneEditor : () => setShowPhoneTooltip(true)
                  }
                >
                  <Text style={styles.userPhone} numberOfLines={1}>
                    {user?.phone || "+91 9876543210"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.phoneInfoIcon}
                  onPress={() => setShowPhoneTooltip(true)}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Ionicons name="information" size={11} color="#2563EB" />
                </TouchableOpacity>

                {canEdit && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={openPhoneEditor}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={14} color="#2563EB" />
                  </TouchableOpacity>
                )}
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
              <MenuRow
                icon="person-add-outline"
                color="#16A34A"
                title="Manage Apartment Owner Visibility"
                description="Give visibility access to apartment owners"
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/grant-access",
                    params: {
                      accountId: selectedAccount?.id || "",
                      role: "member_visibility",
                      memberType: "owner",
                    },
                  })
                }
              />
              <MenuRow
                icon="briefcase-outline"
                color="#0891B2"
                title="Manage Staff Visibility"
                description="Give visibility access to society staff members"
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/grant-access",
                    params: {
                      accountId: selectedAccount?.id || "",
                      role: "staff_visibility",
                      memberType: "staff",
                    },
                  })
                }
                isLast
              />
            </View>
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
              <Text style={styles.accessTotalText}>
                {totalPeopleWithAccess}
              </Text>
            </View>
          </View>

          {selectedAccount?.ownerId === user?.id && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Account Owner</Text>
              <View
                style={[
                  styles.accessRow,
                  acceptedAdmins.length === 0 &&
                    visibleMembers.length === 0 &&
                    pendingInvitations.length === 0 &&
                    styles.lastAccessRow,
                ]}
              >
                <View style={[styles.accessAvatar, styles.ownerAvatar]}>
                  <Text style={styles.accessAvatarText}>
                    {(user?.phone || "You").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.accessInfo}>
                  <View style={styles.accessNameRow}>
                    <Text style={styles.accessName}>You</Text>
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

          {acceptedAdmins.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Admins</Text>
              {acceptedAdmins.map((grant, index) => (
                <View
                  key={grant.id}
                  style={[
                    styles.accessRow,
                    index === acceptedAdmins.length - 1 &&
                      visibleMembers.length === 0 &&
                      pendingInvitations.length === 0 &&
                      styles.lastAccessRow,
                  ]}
                >
                  <View style={[styles.accessAvatar, styles.adminAvatar]}>
                    <Text style={styles.accessAvatarText}>
                      {grant.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <View style={[styles.accessBadge, styles.adminBadge]}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {visibleMembers.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Members</Text>
              {visibleMembers.map((grant, index) => (
                <View
                  key={grant.id}
                  style={[
                    styles.accessRow,
                    index === visibleMembers.length - 1 &&
                      pendingInvitations.length === 0 &&
                      styles.lastAccessRow,
                  ]}
                >
                  <View style={[styles.accessAvatar, styles.memberAvatar]}>
                    <Text
                      style={[styles.accessAvatarText, styles.memberAvatarText]}
                    >
                      {grant.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <View style={[styles.accessBadge, styles.memberBadge]}>
                    <Text style={styles.memberBadgeText}>Member</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {visibleStaff.length > 0 && (
            <View style={styles.accessGroup}>
              <Text style={styles.accessHeading}>Staff</Text>
              {visibleStaff.map((grant, index) => (
                <View
                  key={grant.id}
                  style={[
                    styles.accessRow,
                    index === visibleStaff.length - 1 &&
                      pendingInvitations.length === 0 &&
                      styles.lastAccessRow,
                  ]}
                >
                  <View style={[styles.accessAvatar, styles.staffAvatar]}>
                    <Text
                      style={[styles.accessAvatarText, styles.staffAvatarText]}
                    >
                      {grant.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <View style={[styles.accessBadge, styles.staffBadge]}>
                    <Text style={styles.staffBadgeText}>Staff</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {pendingInvitations.length > 0 && (
            <View style={styles.accessGroup}>
              <View style={styles.pendingHeader}>
                <Text style={styles.accessHeading}>Pending Invitations</Text>
                <View style={styles.pendingCountBadge}>
                  <Text style={styles.pendingCountText}>
                    {pendingInvitations.length}
                  </Text>
                </View>
              </View>
              {pendingInvitations.map((grant, index) => (
                <View
                  key={grant.id}
                  style={[
                    styles.accessRow,
                    index === pendingInvitations.length - 1 &&
                      styles.lastAccessRow,
                  ]}
                >
                  <View style={[styles.accessAvatar, styles.pendingAvatar]}>
                    <Ionicons name="time-outline" size={19} color="#D97706" />
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <View style={styles.pendingStatus}>
                    <Text style={styles.pendingStatusText}>Pending</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteInvitationButton}
                    onPress={() => setInvitationToDelete(grant.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {selectedAccount?.ownerId !== user?.id &&
            acceptedAdmins.length === 0 &&
            visibleMembers.length === 0 &&
            pendingInvitations.length === 0 && (
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

      {/* PHONE EDIT MODAL */}
      {canEdit && showPhoneModal && (
        <Modal
          transparent
          animationType="fade"
          visible={showPhoneModal}
          onRequestClose={closePhoneModal}
        >
          <TouchableWithoutFeedback onPress={closePhoneModal}>
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
                          name="call-outline"
                          size={20}
                          color="#2563EB"
                        />
                      </View>
                      <View style={styles.modalTitleContent}>
                        <Text style={styles.editModalTitle}>
                          Change Phone Number
                        </Text>
                        <Text style={styles.modalSubtitle}>
                          {phoneOtpSent
                            ? "Verify your new number"
                            : "Enter your new mobile number"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.modalCloseButton}
                        onPress={closePhoneModal}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={21} color="#475569" />
                      </TouchableOpacity>
                    </View>

                    {!phoneOtpSent ? (
                      <>
                        <Text style={styles.fieldLabel}>New phone number</Text>
                        <View style={styles.phoneInputRow}>
                          <View style={styles.phonePrefixBox}>
                            <Text style={styles.phonePrefix}>+91</Text>
                          </View>
                          <TextInput
                            style={styles.phoneInput}
                            value={phone}
                            onChangeText={(value) => {
                              const cleaned = value.replace(/[^0-9]/g, "");
                              setPhone(cleaned.slice(0, 10));
                              setPhoneError("");
                            }}
                            keyboardType="number-pad"
                            maxLength={10}
                            placeholder="98765 43210"
                            placeholderTextColor="#94A3B8"
                          />
                          <TouchableOpacity
                            onPress={pickContact}
                            style={styles.phoneContactButton}
                            activeOpacity={0.75}
                          >
                            <Ionicons
                              name="people-outline"
                              size={20}
                              color="#2563EB"
                            />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.inputHint}>
                          We'll send a 6-digit verification code to this number.
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={styles.otpMessageContainer}>
                          <View style={styles.otpSuccessIcon}>
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#16A34A"
                            />
                          </View>
                          <View style={styles.otpMessageContent}>
                            <Text style={styles.otpMessageTitle}>
                              Verification code sent
                            </Text>
                            <Text style={styles.otpMessageText}>
                              {otpMessage}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.fieldLabel}>
                          Enter verification code
                        </Text>
                        <View style={styles.otpContainer}>
                          {[0, 1, 2, 3, 4, 5].map((index) => (
                            <TextInput
                              key={index}
                              ref={(ref) => {
                                otpInputs.current[index] = ref;
                              }}
                              style={[
                                styles.otpInput,
                                phoneOtp[index] && styles.otpInputFilled,
                              ]}
                              value={phoneOtp[index]}
                              onChangeText={(text) =>
                                handleOtpChange(text, index)
                              }
                              onKeyPress={(event) =>
                                handleOtpKeyPress(event, index)
                              }
                              keyboardType="number-pad"
                              maxLength={1}
                              selectionColor="#2563EB"
                            />
                          ))}
                        </View>

                        <View style={styles.timerContainer}>
                          {isTimerActive ? (
                            <Text style={styles.timerText}>
                              Resend available in{" "}
                              <Text style={styles.timerStrong}>{timer}s</Text>
                            </Text>
                          ) : (
                            <TouchableOpacity
                              onPress={handleResendOtp}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.resendOtpText}>
                                Resend OTP
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </>
                    )}

                    {phoneError ? (
                      <View style={styles.validationBox}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={17}
                          color="#DC2626"
                        />
                        <Text style={styles.validationText}>{phoneError}</Text>
                      </View>
                    ) : null}

                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.cancelModalButton}
                        onPress={closePhoneModal}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.saveButton,
                          (!phoneOtpSent
                            ? phone.length !== 10
                            : phoneOtp.join("").length !== 6) &&
                            styles.saveButtonDisabled,
                        ]}
                        onPress={
                          phoneOtpSent ? verifyPhoneOtp : handleSendPhoneOtp
                        }
                        disabled={
                          !phoneOtpSent
                            ? phone.length !== 10
                            : phoneOtp.join("").length !== 6
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            phoneOtpSent
                              ? "checkmark-circle-outline"
                              : "paper-plane-outline"
                          }
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.saveButtonText}>
                          {phoneOtpSent ? "Verify OTP" : "Send OTP"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* PHONE TOOLTIP */}
      {showPhoneTooltip && (
        <Modal
          transparent
          animationType="fade"
          visible={showPhoneTooltip}
          onRequestClose={() => setShowPhoneTooltip(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowPhoneTooltip(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.tooltipCard}>
                  <View style={styles.tooltipIconCircle}>
                    <Ionicons name="call-outline" size={26} color="#2563EB" />
                  </View>
                  <Text style={styles.tooltipTitle}>Phone Number</Text>
                  <Text style={styles.tooltipSubtitle}>
                    This phone number is tied to the account owner. You can
                    change it or transfer ownership to another person.
                  </Text>

                  <View style={styles.tooltipList}>
                    <View style={styles.tooltipRow}>
                      <View style={styles.tooltipRowIcon}>
                        <Ionicons
                          name="create-outline"
                          size={17}
                          color="#2563EB"
                        />
                      </View>
                      <View style={styles.tooltipRowTextContainer}>
                        <Text style={styles.tooltipRowTitle}>
                          Change your number
                        </Text>
                        <Text style={styles.tooltipRowText}>
                          Tap the phone number to update it. We'll send an OTP
                          to verify the new number.
                        </Text>
                      </View>
                    </View>

                    <View style={styles.tooltipRow}>
                      <View
                        style={[
                          styles.tooltipRowIcon,
                          { backgroundColor: "#FEF3C7" },
                        ]}
                      >
                        <Ionicons
                          name="swap-horizontal-outline"
                          size={17}
                          color="#D97706"
                        />
                      </View>
                      <View style={styles.tooltipRowTextContainer}>
                        <Text style={styles.tooltipRowTitle}>
                          Transfer ownership
                        </Text>
                        <Text style={styles.tooltipRowText}>
                          Add someone else's number and verify it with OTP to
                          transfer ownership of this account to them.
                        </Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.tooltipActionButton}
                    onPress={() => setShowPhoneTooltip(false)}
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

      {/* DELETE INVITATION */}
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
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteConfirmButton}
                      onPress={confirmDeleteInvitation}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color="#FFFFFF"
                      />
                      <Text style={styles.deleteConfirmText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* CONTACT PICKER */}
      {showContactPicker && (
        <Modal
          visible={showContactPicker}
          transparent
          animationType="slide"
          onRequestClose={closeContactPicker}
        >
          <TouchableWithoutFeedback onPress={closeContactPicker}>
            <View style={styles.contactModalOverlay}>
              <TouchableWithoutFeedback
                onPress={(event) => event.stopPropagation()}
              >
                <View
                  style={[
                    styles.contactModalContainer,
                    { paddingBottom: Math.max(insets.bottom, 16) },
                  ]}
                >
                  <View style={styles.contactModalHeader}>
                    <View>
                      <Text style={styles.contactModalTitle}>
                        Select Contact
                      </Text>
                      <Text style={styles.contactModalSubtitle}>
                        Choose a contact from your phone
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={closeContactPicker}
                      style={styles.contactModalCloseButton}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close" size={21} color="#475569" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.contactModalSearchContainer}>
                    <Ionicons name="search-outline" size={19} color="#64748B" />
                    <TextInput
                      style={styles.contactModalSearchInput}
                      placeholder="Search contacts"
                      placeholderTextColor="#94A3B8"
                      value={contactSearch}
                      onChangeText={setContactSearch}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                    {contactSearch.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => setContactSearch("")}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="close-circle"
                          size={19}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View style={styles.contactCountRow}>
                    <Text style={styles.contactCount}>
                      {filteredContacts.length}{" "}
                      {filteredContacts.length === 1 ? "contact" : "contacts"}
                    </Text>
                  </View>

                  <View style={styles.contactListWrapper}>
                    <ScrollView
                      style={styles.contactListContainer}
                      contentContainerStyle={styles.contactListContent}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {filteredContacts.length > 0 ? (
                        filteredContacts.map((contact) => (
                          <TouchableOpacity
                            key={contact.id}
                            style={styles.contactItem}
                            onPress={() => selectContact(contact)}
                            activeOpacity={0.75}
                          >
                            <View style={styles.contactAvatar}>
                              <Text style={styles.contactAvatarText}>
                                {contact.name
                                  ? contact.name.charAt(0).toUpperCase()
                                  : "?"}
                              </Text>
                            </View>
                            <View style={styles.contactInfo}>
                              <Text
                                style={styles.contactName}
                                numberOfLines={1}
                              >
                                {contact.name || "Unknown"}
                              </Text>
                              {contact.phoneNumbers.length > 0 ? (
                                <Text
                                  style={styles.contactPhone}
                                  numberOfLines={1}
                                >
                                  {contact.phoneNumbers[0].number}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.contactArrow}>
                              <Ionicons
                                name="chevron-forward"
                                size={17}
                                color="#94A3B8"
                              />
                            </View>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <View style={styles.noContactsContainer}>
                          <View style={styles.noContactsIcon}>
                            <Ionicons
                              name="search-outline"
                              size={27}
                              color="#64748B"
                            />
                          </View>
                          <Text style={styles.noContactsTitle}>
                            No contacts found
                          </Text>
                          <Text style={styles.noContactsText}>
                            Try another name or phone number.
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>

                  <TouchableOpacity
                    style={styles.contactModalCancelButton}
                    onPress={closeContactPicker}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.contactModalCancelButtonText}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: { color: "#0F172A", fontSize: 20, fontWeight: "800" },
  headerSubtitle: { color: "#64748B", fontSize: 12, marginTop: 2 },

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
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 7,
  },
  phoneDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  phonePressable: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingRight: 4,
    flexShrink: 1,
  },
  userPhone: { color: "#64748B", fontSize: 13, marginLeft: 6 },
  phoneInfoIcon: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
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
    maxWidth: 190,
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
  saveNameButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 7,
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
  ownerAvatar: { backgroundColor: "#DBEAFE" },
  adminAvatar: { backgroundColor: "#EDE9FE" },
  memberAvatar: { backgroundColor: "#DCFCE7" },
  staffAvatar: { backgroundColor: "#E0F2FE" },
  pendingAvatar: { backgroundColor: "#FEF3C7" },
  accessAvatarText: { color: "#2563EB", fontSize: 15, fontWeight: "700" },
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
  pendingStatus: {
    backgroundColor: "#FEF3C7",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 7,
  },
  pendingStatusText: { color: "#B45309", fontSize: 9, fontWeight: "700" },
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
  photoOptionsCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  keyboardView: { width: "100%", alignItems: "center" },
  editModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
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
  modalSubtitle: { color: "#64748B", fontSize: 11, marginTop: 3 },
  modalCloseButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 7,
  },
  phoneInputRow: {
    height: 51,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    paddingLeft: 4,
    paddingRight: 5,
  },
  phonePrefixBox: {
    height: 41,
    minWidth: 55,
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  phonePrefix: { color: "#334155", fontSize: 14, fontWeight: "700" },
  phoneInput: {
    flex: 1,
    height: "100%",
    color: "#0F172A",
    fontSize: 15,
    paddingHorizontal: 11,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  phoneContactButton: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  inputHint: { color: "#94A3B8", fontSize: 10, lineHeight: 15, marginTop: 7 },
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
  cancelButtonText: { color: "#475569", fontSize: 13, fontWeight: "700" },
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
  saveButtonDisabled: { backgroundColor: "#CBD5E1" },
  saveButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  otpMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 13,
    padding: 11,
  },
  otpSuccessIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  otpMessageContent: { flex: 1 },
  otpMessageTitle: { color: "#166534", fontSize: 12, fontWeight: "700" },
  otpMessageText: { color: "#15803D", fontSize: 10, marginTop: 2 },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  otpInput: {
    width: 43,
    height: 53,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  otpInputFilled: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  timerContainer: { alignItems: "center", marginTop: 12 },
  timerText: { color: "#64748B", fontSize: 11 },
  timerStrong: { color: "#334155", fontWeight: "700" },
  resendOtpText: { color: "#2563EB", fontSize: 12, fontWeight: "700" },

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

  contactModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "flex-end",
  },
  contactModalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 19,
    maxHeight: "88%",
    minHeight: "52%",
  },
  contactModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  contactModalTitle: { color: "#0F172A", fontSize: 18, fontWeight: "700" },
  contactModalSubtitle: { color: "#64748B", fontSize: 11, marginTop: 3 },
  contactModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  contactModalSearchContainer: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 13,
    paddingHorizontal: 12,
  },
  contactModalSearchInput: {
    flex: 1,
    height: "100%",
    color: "#0F172A",
    fontSize: 13,
    paddingHorizontal: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  contactCountRow: { paddingVertical: 9 },
  contactCount: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  contactListWrapper: { flex: 1, minHeight: 220 },
  contactListContainer: { flex: 1 },
  contactListContent: { paddingBottom: 5 },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  contactAvatar: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  contactAvatarText: { color: "#2563EB", fontSize: 16, fontWeight: "700" },
  contactInfo: { flex: 1, minWidth: 0 },
  contactName: { color: "#1E293B", fontSize: 13, fontWeight: "700" },
  contactPhone: { color: "#64748B", fontSize: 11, marginTop: 3 },
  contactArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 7,
  },
  noContactsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 42,
    paddingHorizontal: 25,
  },
  noContactsIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },
  noContactsTitle: { color: "#334155", fontSize: 14, fontWeight: "700" },
  noContactsText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 4,
  },
  contactModalCancelButton: {
    minHeight: 47,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  contactModalCancelButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },

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
  tooltipList: { width: "100%", marginTop: 16, gap: 10 },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },
  tooltipRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipRowTextContainer: { flex: 1 },
  tooltipRowTitle: { color: "#0F172A", fontSize: 13, fontWeight: "700" },
  tooltipRowText: {
    color: "#64748B",
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
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

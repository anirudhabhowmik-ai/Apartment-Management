import { Ionicons } from "@expo/vector-icons";
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  requestPermissionsAsync,
} from "expo-contacts";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
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

import { sendOtp, verifyOtpOnly } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

const BLUE = "#2563EB";
const BLUE_LIGHT = "#EFF6FF";
const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const BACKGROUND = "#F8FAFC";
const RED = "#DC2626";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIEWPORT = Math.min(SCREEN_WIDTH - 64, 320);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface RawImage {
  uri: string;
  width: number;
  height: number;
}

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: { number: string; label?: string }[];
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePhoneInput(raw?: string | null): string {
  if (!raw) return "";

  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;

  return ten;
}

async function authedFetch(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

async function getToken(): Promise<string | null> {
  try {
    const SecureStore = require("expo-secure-store");
    return await SecureStore.getItemAsync("auth_token");
  } catch {
    return null;
  }
}

// ============================================================
// PHOTO ADJUST MODAL
// ============================================================

function PhotoAdjustModal({
  visible,
  image,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  image: RawImage | null;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
}) {
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
        startTouch: {
          x: pts[0].pageX,
          y: pts[0].pageY,
        },
        startTranslate: {
          ...translateRef.current,
        },
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
            {
              x: g.startTranslate.x + dx,
              y: g.startTranslate.y + dy,
            },
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
            crop: {
              originX,
              originY,
              width: cropSize,
              height: cropSize,
            },
          },
          {
            resize: {
              width: 500,
              height: 500,
            },
          },
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
                {
                  width: VIEWPORT,
                  height: VIEWPORT,
                },
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

  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
  },

  subtitle: {
    fontSize: 12.5,
    color: "#64748b",
    marginBottom: 16,
  },

  viewportWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },

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

  zoomLevelText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },

  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },

  resetText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#64748b",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 16,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },

  cancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

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

  confirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});

// ============================================================
// MAIN SCREEN
// ============================================================

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user, updateProfile, refreshProfile, logout } = useAuthStore();

  const [name, setName] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);

  const [rawImage, setRawImage] = useState<RawImage | null>(null);

  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showPhoneModal, setShowPhoneModal] = useState(false);

  const [phoneStep, setPhoneStep] = useState<"enter" | "otp">("enter");

  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

  const [showContactPicker, setShowContactPicker] = useState(false);

  const [contactsList, setContactsList] = useState<ContactData[]>([]);

  const [contactSearch, setContactSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    refreshProfile();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;

    setName(user.name ?? "");
    setPhotoUri(user.photoUrl ?? null);
  }, [user]);

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

      setRawImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });

      setShowAdjustModal(true);
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
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      setRawImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });

      setShowAdjustModal(true);
    }
  };

  const openContactPicker = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Contact picker is only available on mobile devices.",
      );

      return;
    }

    try {
      setLoadingContacts(true);

      const { status } = await requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your contacts to help you pick a phone number.",
          [{ text: "OK" }],
        );

        return;
      }

      const contacts = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        {
          sortOrder: ContactsSortOrder.GivenName,
        },
      );

      const mapped: ContactData[] = (contacts || [])
        .filter((c: any) => c.phones && c.phones.length > 0)
        .map((c: any) => ({
          id: c.id ?? `${c.fullName ?? "unknown"}-${Math.random()}`,

          name: c.fullName || "Unknown",

          phoneNumbers: (c.phones ?? []).map((p: any) => ({
            number: p.number || "",
            label: p.label || undefined,
          })),
        }));

      setContactsList(mapped);
      setContactSearch("");
      setShowContactPicker(true);
    } catch (err) {
      console.error("Error fetching contacts:", err);

      Alert.alert("Error", "Failed to fetch contacts.");
    } finally {
      setLoadingContacts(false);
    }
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase().trim();

    if (!q) return contactsList;

    return contactsList.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);

      const phoneMatch = c.phoneNumbers.some((p) =>
        p.number.toLowerCase().includes(q),
      );

      return nameMatch || phoneMatch;
    });
  }, [contactsList, contactSearch]);

  const selectContact = (contact: ContactData) => {
    if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) {
      return;
    }

    const value = normalizePhoneInput(contact.phoneNumbers[0].number);

    if (value.length !== 10) {
      Alert.alert(
        "Invalid number",
        "That contact doesn't have a valid 10-digit number.",
      );

      return;
    }

    setNewPhone(value);
    setPhoneError("");
    setShowContactPicker(false);
    setContactSearch("");
  };

  const handleSave = async () => {
    setError("");

    const trimmed = name.trim();

    if (
      trimmed === (user?.name ?? "") &&
      (photoUri ?? null) === (user?.photoUrl ?? null)
    ) {
      router.back();
      return;
    }

    setLoading(true);

    try {
      await updateProfile({
        name: trimmed || null,
        photoUrl: photoUri,
      });

      router.back();
    } catch (e: any) {
      setError(e?.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const openPhoneModal = () => {
    setPhoneStep("enter");
    setNewPhone("");
    setOtp("");
    setPhoneError("");
    setShowPhoneModal(true);
  };

  const closePhoneModal = () => {
    if (phoneLoading) return;

    setShowPhoneModal(false);
    setPhoneStep("enter");
    setNewPhone("");
    setOtp("");
    setPhoneError("");
  };

  const handleSendOtp = async () => {
    setPhoneError("");

    const ten = normalizePhoneInput(newPhone);

    if (ten.length !== 10) {
      setPhoneError("Please enter a valid 10-digit phone number.");

      return;
    }

    const currentTen = normalizePhoneInput(user?.phone ?? "");

    if (ten === currentTen) {
      setPhoneError("This is already your current phone number.");

      return;
    }

    setPhoneLoading(true);

    try {
      const token = await getToken();

      if (!token) {
        setPhoneError("You're not signed in.");

        return;
      }

      const pre = await authedFetch("/auth/request-phone-change", token, {
        method: "POST",
        body: JSON.stringify({
          newPhone: ten,
        }),
      });

      let preData: any = null;

      try {
        preData = await pre.json();
      } catch {
        preData = null;
      }

      if (!pre.ok) {
        setPhoneError(
          preData?.message || "This number cannot be used right now.",
        );

        return;
      }

      const otpResult = await sendOtp(ten);

      if (!otpResult.success) {
        setPhoneError(otpResult.message || "Failed to send OTP.");

        return;
      }

      setPhoneStep("otp");
    } catch (e: any) {
      console.error("handleSendOtp error:", e);

      setPhoneError(e?.message || "Failed to start phone change.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await logout({
        revokeAllSessions: true,
      });
    } catch (e) {
      console.warn("Logout after phone change failed:", e);
    } finally {
      setSigningOut(false);
      setShowSignOutModal(false);

      router.replace("/(auth)/login");
    }
  };

  const handleConfirmOtp = async () => {
    setPhoneError("");

    const ten = normalizePhoneInput(newPhone);

    if (otp.length !== 6) {
      setPhoneError("Enter the 6-digit OTP.");

      return;
    }

    setPhoneLoading(true);

    try {
      const verify = await verifyOtpOnly(ten, otp);

      if (!verify.success || !verify.accessToken) {
        setPhoneError(verify.message || "OTP verification failed.");

        return;
      }

      const token = await getToken();

      if (!token) {
        setPhoneError("You're not signed in.");

        return;
      }

      const res = await authedFetch("/auth/confirm-phone-change", token, {
        method: "POST",
        body: JSON.stringify({
          newPhone: ten,
          accessToken: verify.accessToken,
        }),
      });

      let data: any = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        setPhoneError(data?.message || "Failed to update phone number.");

        return;
      }

      closePhoneModal();

      setShowSignOutModal(true);
    } catch (e: any) {
      console.error("handleConfirmOtp error:", e);

      setPhoneError(e?.message || "Failed to update phone number.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUri(null);
  };

  const currentPhoneDisplay = user?.phone
    ? `+91 ${normalizePhoneInput(user.phone)}`
    : "No phone on file";

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Edit Profile",
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 24) + 80,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.photoCard}>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => setShowPhotoOptions(true)}
              activeOpacity={0.8}
            >
              {photoUri ? (
                <Image
                  source={{
                    uri: photoUri,
                  }}
                  style={styles.photoImage}
                />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={28} color={BLUE} />

                  <View style={styles.photoPlus}>
                    <Ionicons name="add" size={12} color="#fff" />
                  </View>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.photoTextContainer}>
              <Text style={styles.photoTitle}>
                {photoUri ? "Profile photo" : "Add profile photo"}
              </Text>

              <Text style={styles.photoSubtitle}>
                {photoUri
                  ? "Tap the photo to change it"
                  : "Optional • Shows on your profile card"}
              </Text>
            </View>

            {photoUri && (
              <TouchableOpacity
                onPress={handleRemovePhoto}
                style={styles.removePhotoButton}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={19} color={RED} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Name</Text>

            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#94A3B8" />

              <TextInput
                style={styles.textInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#A1AAB8"
                value={name}
                onChangeText={setName}
                returnKeyType="done"
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
              Phone Number
            </Text>

            <View style={styles.phoneRow}>
              <View style={styles.phoneLeft}>
                <View style={styles.phoneIconWrap}>
                  <Ionicons name="call-outline" size={18} color={BLUE} />
                </View>

                <Text style={styles.phoneValue} numberOfLines={1}>
                  {currentPhoneDisplay}
                </Text>
              </View>

              <TouchableOpacity
                onPress={openPhoneModal}
                style={styles.changePhoneButton}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-horizontal" size={14} color="#fff" />

                <Text style={styles.changePhoneText}>Change</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.helperText}>
              Changing your number signs you out. Sign back in with the new
              number.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={19} color={RED} />

              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#fff"
                />

                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ====================================================== */}
      {/* PHOTO OPTIONS */}
      {/* ====================================================== */}

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
                <Ionicons name="camera" size={24} color={BLUE} />
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
                  {
                    backgroundColor: "#ecfdf5",
                  },
                ]}
              >
                <Ionicons name="images" size={24} color="#059669" />
              </View>

              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Choose from Gallery</Text>

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

      {/* ====================================================== */}
      {/* PHONE CHANGE MODAL */}
      {/* ====================================================== */}

      <Modal
        visible={showPhoneModal}
        transparent
        animationType="fade"
        onRequestClose={closePhoneModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.phoneModalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <View style={styles.phoneModal}>
            <View style={styles.phoneModalHeader}>
              <View style={styles.phoneModalIcon}>
                <Ionicons
                  name={
                    phoneStep === "enter" ? "call-outline" : "keypad-outline"
                  }
                  size={22}
                  color={BLUE}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.phoneModalTitle}>
                  {phoneStep === "enter" ? "Change Phone Number" : "Verify OTP"}
                </Text>

                <Text style={styles.phoneModalSubtitle}>
                  {phoneStep === "enter"
                    ? "We'll send an OTP to the new number."
                    : `Enter the code sent to +91 ${newPhone}`}
                </Text>
              </View>

              <TouchableOpacity
                onPress={closePhoneModal}
                style={styles.closeModalButton}
                activeOpacity={0.7}
                disabled={phoneLoading}
              >
                <Ionicons name="close" size={20} color={TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.phoneModalScrollContent}
            >
              {phoneStep === "enter" ? (
                <>
                  <View style={styles.noteBox}>
                    <Ionicons
                      name="warning-outline"
                      size={18}
                      color="#B45309"
                    />

                    <Text style={styles.noteText}>
                      Changing your phone signs you out of every account on this
                      device. The new number becomes your login. If you're
                      selling or transferring your account, enter the buyer's
                      number and let them verify the OTP.
                    </Text>
                  </View>

                  <Text style={styles.modalFieldLabel}>New Phone Number</Text>

                  <View
                    style={[
                      styles.phoneInputRow,
                      phoneError && styles.inputError,
                    ]}
                  >
                    <View style={styles.countryCode}>
                      <Text style={styles.countryCodeText}>+91</Text>
                    </View>

                    <TextInput
                      style={styles.phoneInput}
                      placeholder="9876543210"
                      placeholderTextColor="#A1AAB8"
                      keyboardType="number-pad"
                      maxLength={10}
                      value={newPhone}
                      onChangeText={(text) => {
                        setNewPhone(text.replace(/[^0-9]/g, ""));

                        setPhoneError("");
                      }}
                    />

                    <TouchableOpacity
                      onPress={openContactPicker}
                      style={styles.contactButton}
                      activeOpacity={0.8}
                      disabled={loadingContacts}
                    >
                      {loadingContacts ? (
                        <ActivityIndicator size="small" color={BLUE} />
                      ) : (
                        <Ionicons
                          name="people-outline"
                          size={20}
                          color={BLUE}
                        />
                      )}
                    </TouchableOpacity>
                  </View>

                  {phoneError ? (
                    <View style={styles.inlineError}>
                      <Ionicons name="alert-circle" size={14} color={RED} />

                      <Text style={styles.inlineErrorText}>{phoneError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.phoneModalActions}>
                    <TouchableOpacity
                      style={styles.phoneCancelBtn}
                      onPress={closePhoneModal}
                      activeOpacity={0.85}
                      disabled={phoneLoading}
                    >
                      <Text style={styles.phoneCancelText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.phonePrimaryBtn,
                        phoneLoading && {
                          opacity: 0.6,
                        },
                      ]}
                      onPress={handleSendOtp}
                      activeOpacity={0.85}
                      disabled={phoneLoading}
                    >
                      {phoneLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons
                            name="send-outline"
                            size={16}
                            color="#fff"
                          />

                          <Text style={styles.phonePrimaryText}>Send OTP</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalFieldLabel}>Enter 6-digit OTP</Text>

                  <TextInput
                    style={styles.otpInput}
                    placeholder="● ● ● ● ● ●"
                    placeholderTextColor="#C7CDD6"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={(text) => {
                      setOtp(text.replace(/[^0-9]/g, ""));

                      setPhoneError("");
                    }}
                    autoFocus
                  />

                  {phoneError ? (
                    <View style={styles.inlineError}>
                      <Ionicons name="alert-circle" size={14} color={RED} />

                      <Text style={styles.inlineErrorText}>{phoneError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => setPhoneStep("enter")}
                    style={styles.resendRow}
                    disabled={phoneLoading}
                  >
                    <Text style={styles.resendText}>
                      Wrong number? Go back and edit
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.phoneModalActions}>
                    <TouchableOpacity
                      style={styles.phoneCancelBtn}
                      onPress={closePhoneModal}
                      activeOpacity={0.85}
                      disabled={phoneLoading}
                    >
                      <Text style={styles.phoneCancelText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.phonePrimaryBtn,
                        phoneLoading && {
                          opacity: 0.6,
                        },
                      ]}
                      onPress={handleConfirmOtp}
                      activeOpacity={0.85}
                      disabled={phoneLoading}
                    >
                      {phoneLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={16} color="#fff" />

                          <Text style={styles.phonePrimaryText}>Verify</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ====================================================== */}
      {/* SIGN OUT MODAL */}
      {/* ====================================================== */}

      <Modal
        visible={showSignOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!signingOut) {
            setShowSignOutModal(false);
          }
        }}
      >
        <View style={styles.signOutBackdrop}>
          <View style={styles.signOutModal}>
            <View style={styles.signOutIconWrap}>
              <Ionicons name="log-out-outline" size={29} color={RED} />
            </View>

            <Text style={styles.signOutTitle}>Sign out?</Text>

            <Text style={styles.signOutMessage}>
              Your phone number has been updated successfully.{"\n\n"}You need
              to sign in again with your new number to continue.
            </Text>

            <View style={styles.signOutActions}>
              <TouchableOpacity
                style={styles.signOutCancelButton}
                onPress={() => setShowSignOutModal(false)}
                activeOpacity={0.8}
                disabled={signingOut}
              >
                <Text style={styles.signOutCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.signOutConfirmButton,
                  signingOut && styles.signOutConfirmButtonDisabled,
                ]}
                onPress={handleSignOut}
                activeOpacity={0.85}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={17} color="#fff" />

                    <Text style={styles.signOutConfirmText}>Sign Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====================================================== */}
      {/* CONTACT PICKER */}
      {/* ====================================================== */}

      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContactPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowContactPicker(false)}>
          <View style={styles.contactModalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.contactModal,
                  {
                    paddingBottom: Math.max(insets.bottom, 8),
                  },
                ]}
              >
                <View style={styles.contactModalHandle} />

                <View style={styles.contactModalHeader}>
                  <Text style={styles.contactModalTitle}>Select Contact</Text>

                  <TouchableOpacity
                    onPress={() => setShowContactPicker(false)}
                    style={styles.contactCloseButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={22} color="#374151" />
                  </TouchableOpacity>
                </View>

                <View style={styles.contactSearchContainer}>
                  <Ionicons name="search-outline" size={20} color="#9ca3af" />

                  <TextInput
                    style={styles.contactSearchInput}
                    placeholder="Search contacts"
                    placeholderTextColor="#9ca3af"
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {contactSearch.length > 0 ? (
                    <TouchableOpacity onPress={() => setContactSearch("")}>
                      <Ionicons name="close-circle" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{
                    paddingBottom: 4,
                  }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {filteredContacts.length === 0 ? (
                    <View style={styles.noContacts}>
                      <Ionicons
                        name="people-outline"
                        size={34}
                        color="#9ca3af"
                      />

                      <Text style={styles.noContactsText}>
                        No contacts found.
                      </Text>
                    </View>
                  ) : (
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

                        <View
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <Text style={styles.contactName} numberOfLines={1}>
                            {contact.name || "Unknown"}
                          </Text>

                          {contact.phoneNumbers[0] ? (
                            <Text style={styles.contactPhone} numberOfLines={1}>
                              {contact.phoneNumbers[0].number}
                            </Text>
                          ) : null}
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#9ca3af"
                        />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.contactCancelBtn}
                  onPress={() => setShowContactPicker(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.contactCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <PhotoAdjustModal
        visible={showAdjustModal}
        image={rawImage}
        onCancel={() => {
          setShowAdjustModal(false);
          setRawImage(null);
        }}
        onConfirm={(uri) => {
          setPhotoUri(uri);
          setShowAdjustModal(false);
          setRawImage(null);
        }}
      />
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  flex: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    flexGrow: 1,
  },

  photoCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  photoButton: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },

  photoImage: {
    width: 66,
    height: 66,
  },

  photoPlus: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  photoTextContainer: {
    flex: 1,
    marginLeft: 14,
  },

  photoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
  },

  photoSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 4,
    lineHeight: 17,
  },

  removePhotoButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },

  inputContainer: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },

  inputError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FFF7F7",
  },

  textInput: {
    flex: 1,
    minHeight: 50,
    fontSize: 15,
    color: TEXT,
  },

  helperText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 8,
  },

  phoneRow: {
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    paddingLeft: 8,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  phoneLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  phoneIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  phoneValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
  },

  changePhoneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: BLUE,
  },

  changePhoneText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  phoneInputRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 6,
  },

  countryCode: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },

  countryCodeText: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "600",
  },

  phoneInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 10,
    fontSize: 15,
    color: TEXT,
  },

  contactButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },

  errorCard: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 12,
  },

  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "500",
  },

  saveButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 6,
  },

  saveButtonDisabled: {
    opacity: 0.65,
  },

  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // ==========================================================
  // PHOTO OPTIONS
  // ==========================================================

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

  photoOptionTextContainer: {
    flex: 1,
  },

  photoOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },

  photoOptionDescription: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },

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

  // ==========================================================
  // PHONE CHANGE MODAL
  // ==========================================================

  /*
   * FIX:
   * Previously this was:
   *
   * justifyContent: "flex-end"
   *
   * which forced the phone modal to the bottom.
   *
   * It is now centered.
   */
  phoneModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },

  phoneModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 20,
    maxHeight: "88%",
    overflow: "hidden",
  },

  phoneModalScrollContent: {
    paddingBottom: 4,
  },

  phoneModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },

  phoneModalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },

  phoneModalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
  },

  phoneModalSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 3,
  },

  closeModalButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  noteBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 16,
  },

  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#92400E",
  },

  modalFieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },

  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },

  inlineErrorText: {
    fontSize: 12,
    color: RED,
    fontWeight: "500",
    flex: 1,
  },

  phoneModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },

  phoneCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  phoneCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

  phonePrimaryBtn: {
    flex: 1.4,
    height: 50,
    borderRadius: 13,
    backgroundColor: BLUE,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },

  phonePrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },

  otpInput: {
    minHeight: 58,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 10,
    textAlign: "center",
    color: TEXT,
  },

  resendRow: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 6,
  },

  resendText: {
    fontSize: 12,
    color: BLUE,
    fontWeight: "600",
  },

  // ==========================================================
  // SIGN OUT MODAL
  // ==========================================================

  signOutBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  signOutModal: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },

  signOutIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  signOutTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },

  signOutMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    textAlign: "center",
    marginTop: 9,
    maxWidth: 310,
  },

  signOutActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 24,
  },

  signOutCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },

  signOutCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

  signOutConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  signOutConfirmButtonDisabled: {
    opacity: 0.65,
  },

  signOutConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ==========================================================
  // CONTACT PICKER
  // ==========================================================

  contactModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
  },

  contactModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "75%",
    minHeight: "60%",
  },

  contactModalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 14,
  },

  contactModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  contactModalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },

  contactCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },

  contactSearchContainer: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#f4f6f9",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  contactSearchInput: {
    flex: 1,
    height: 46,
    fontSize: 14,
    color: "#111827",
    paddingHorizontal: 9,
  },

  contactRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f2f5",
  },

  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  contactAvatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2563eb",
  },

  contactName: {
    fontSize: 14,
    color: "#1f2937",
    fontWeight: "700",
  },

  contactPhone: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 3,
  },

  noContacts: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },

  noContactsText: {
    fontSize: 13,
    color: "#9ca3af",
  },

  contactCancelBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },

  contactCancelText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "800",
  },
});

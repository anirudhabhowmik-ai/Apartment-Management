import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { Contact, ContactField, ContactsSortOrder } from "expo-contacts";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DatePickerModal from "../../components/DatePickerModal";
import { useMembers } from "../../hooks/useMembers";
import { GroupType } from "../../types/group";
import { BillAttachment, MemberRole } from "../../types/member";

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

const APARTMENT_ROLES: RoleOption[] = [
  {
    role: "owner",
    label: "Owner",
    icon: "home-outline",
  },
  {
    role: "secretary",
    label: "Secretary",
    icon: "shield-checkmark-outline",
  },
  {
    role: "tenant",
    label: "Tenant",
    icon: "person-outline",
  },
];

const STAFF_ROLES: RoleOption[] = [
  {
    role: "sweeper",
    label: "Sweeper",
    icon: "sparkles-outline",
  },
  {
    role: "security",
    label: "Security",
    icon: "shield-outline",
  },
  {
    role: "maintenance",
    label: "Maintenance",
    icon: "construct-outline",
  },
];

const EXPENSE_ROLES: RoleOption[] = [
  {
    role: "electricity",
    label: "Electricity",
    icon: "flash-outline",
  },
  {
    role: "water",
    label: "Water",
    icon: "water-outline",
  },
  {
    role: "maintenance",
    label: "Maintenance",
    icon: "construct-outline",
  },
  {
    role: "other",
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
  },
];

// ---------------------------------------------------------------------------
// Photo Adjust Modal - Same as in AddAccountScreen
// ---------------------------------------------------------------------------

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
  "worklet";
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

  // ----- Refs kept in sync with the latest state, for the PanResponder -----
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

  // -------------------------------------------------------------------
  // Gesture tracking - fixed for proper two-finger pinch
  // -------------------------------------------------------------------

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

// ================================================================
// MAIN COMPONENT
// ================================================================

export default function AddMemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { groupId, groupType } = useLocalSearchParams<{
    groupId: string;
    groupType: GroupType;
  }>();

  const { addNewMember } = useMembers(groupId ?? null);

  // ============================================================
  // ROLE OPTIONS
  // ============================================================

  let roleOptions: RoleOption[] = [];

  if (groupType === "apartment") {
    roleOptions = APARTMENT_ROLES;
  } else if (groupType === "staff") {
    roleOptions = STAFF_ROLES;
  } else if (groupType === "expense") {
    roleOptions = EXPENSE_ROLES;
  }

  // ============================================================
  // COMMON STATE
  // ============================================================

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole | null>(null);
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRole, setCustomRole] = useState("");

  // ============================================================
  // APARTMENT STATE
  // ============================================================

  const [wing, setWing] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [maintenanceAmount, setMaintenanceAmount] = useState("");

  // ============================================================
  // STAFF STATE
  // ============================================================

  const [monthlySalary, setMonthlySalary] = useState("");

  // ============================================================
  // EXPENSE STATE
  // ============================================================

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<"paid" | "due">("paid");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [billAttachments, setBillAttachments] = useState<BillAttachment[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ============================================================
  // CONTACT PICKER
  // ============================================================

  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  // ============================================================
  // PHOTO UPLOAD STATE
  // ============================================================

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // ============================================================
  // LOADING / ERRORS
  // ============================================================

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  // ============================================================
  // HELPERS
  // ============================================================

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({
        ...current,
        [field]: "",
      }));
    }
  };

  const getGroupTypeLabel = (type: GroupType): string => {
    switch (type) {
      case "apartment":
        return "Apartment";
      case "staff":
        return "Staff";
      case "expense":
        return "Expense";
      default:
        return "Member";
    }
  };

  const getButtonText = (type: GroupType): string => {
    switch (type) {
      case "apartment":
        return "Add Apartment";
      case "staff":
        return "Add Staff";
      case "expense":
        return "Add Expense";
      default:
        return "Add Member";
    }
  };

  const getHeaderTitle = () => {
    if (groupType === "expense") {
      return "Add Expense";
    }

    if (groupType === "staff") {
      return "Add Staff";
    }

    return "Add Apartment";
  };

  // ============================================================
  // PICK PHOTO - Updated with photo options modal
  // ============================================================

  const showPhotoSelectionOptions = () => {
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

  const handleAdjustConfirm = (uri: string) => {
    setPhotoUri(uri);
    setShowAdjustModal(false);
    setRawImage(null);
  };

  const handleAdjustCancel = () => {
    setShowAdjustModal(false);
    setRawImage(null);
  };

  // ============================================================
  // PICK CONTACT
  // ============================================================

  const pickContact = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Contact picker is only available on mobile devices.",
      );
      return;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Allow contact access to quickly select a phone number.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "OK",
            },
          ],
        );

        setError("Permission to access contacts is required");
        return;
      }

      const contacts = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        {
          sortOrder: ContactsSortOrder.GivenName,
        },
      );

      if (contacts.length === 0) {
        setError("No contacts found on your device");
        return;
      }

      const mappedContacts: ContactData[] = contacts
        .filter((contact) => contact.phones && contact.phones.length > 0)
        .map((contact) => ({
          id: contact.id || `contact-${Math.random()}`,
          name: contact.fullName || "Unknown",
          phoneNumbers:
            contact.phones?.map((item) => ({
              number: item.number || "",
              label: item.label || undefined,
            })) || [],
        }));

      if (mappedContacts.length === 0) {
        setError("No contacts with phone numbers found");
        return;
      }

      setContactSearch("");
      setContactsList(mappedContacts);
      setShowContactPicker(true);
      setError("");
    } catch (e) {
      console.error("Error fetching contacts:", e);
      setError("Failed to fetch contacts. Please try again.");
    }
  };

  // ============================================================
  // FILTER CONTACTS
  // ============================================================

  const filteredContacts = contactsList.filter((contact) => {
    const search = contactSearch.toLowerCase().trim();

    if (!search) {
      return true;
    }

    const nameMatch = contact.name.toLowerCase().includes(search);

    const phoneMatch = contact.phoneNumbers.some((item) =>
      item.number.toLowerCase().includes(search),
    );

    return nameMatch || phoneMatch;
  });

  // ============================================================
  // CLOSE CONTACT PICKER
  // ============================================================

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  // ============================================================
  // SELECT CONTACT
  // ============================================================

  const selectContact = (contact: ContactData) => {
    if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) {
      setError("Selected contact doesn't have a phone number");
      return;
    }

    let phoneNumber = contact.phoneNumbers[0].number || "";

    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

    phoneNumber = phoneNumber.replace(/^91/, "");

    phoneNumber = phoneNumber.replace(/^0/, "");

    if (phoneNumber.length > 10) {
      phoneNumber = phoneNumber.slice(-10);
    }

    if (phoneNumber.length !== 10) {
      setError("Selected contact does not have a valid 10-digit phone number");
      return;
    }

    setPhone(phoneNumber);
    clearFieldError("phone");
    setError("");

    if (!name.trim() && contact.name) {
      setName(contact.name);
      clearFieldError("name");
    }

    setContactSearch("");
    setShowContactPicker(false);
  };

  // ============================================================
  // CONTACT MODAL
  // ============================================================

  const renderContactPickerModal = () => {
    if (!showContactPicker) {
      return null;
    }

    return (
      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={closeContactPicker}
      >
        <TouchableWithoutFeedback onPress={closeContactPicker}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContainer,
                  {
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                ]}
              >
                {/* MODAL HANDLE */}

                <View style={styles.modalHandle} />

                {/* HEADER */}

                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Select Contact</Text>
                    <Text style={styles.modalSubtitle}>
                      Choose a contact to fill the phone number
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={closeContactPicker}
                    style={styles.modalCloseButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={22} color={TEXT} />
                  </TouchableOpacity>
                </View>

                {/* SEARCH */}

                <View style={styles.modalSearchContainer}>
                  <Ionicons name="search-outline" size={20} color="#94A3B8" />

                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Search name or phone"
                    placeholderTextColor="#94A3B8"
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
                      <Ionicons name="close-circle" size={19} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* RESULT COUNT */}

                <Text style={styles.resultCount}>
                  {filteredContacts.length}{" "}
                  {filteredContacts.length === 1 ? "contact" : "contacts"}
                </Text>

                {/* CONTACT LIST */}

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
                              <Text
                                style={styles.contactPhone}
                                numberOfLines={1}
                              >
                                {contact.phoneNumbers[0].number}
                              </Text>
                            )}
                          </View>

                          <View style={styles.contactSelectIcon}>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
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
                            size={30}
                            color="#94A3B8"
                          />
                        </View>

                        <Text style={styles.noContactsTitle}>
                          No contacts found
                        </Text>

                        <Text style={styles.noContactsText}>
                          Try a different name or phone number.
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>

                {/* CANCEL */}

                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={closeContactPicker}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // ============================================================
  // PICK BILL
  // ============================================================

  const handlePickBill = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError("Permission to access photos is required");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        setBillAttachments((currentAttachments) => [
          ...currentAttachments,
          ...result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.fileName || "Bill image",
            mimeType: asset.mimeType,
          })),
        ]);
      }
    } catch (e) {
      console.error("Bill picker error:", e);
      setError("Unable to select bill attachment.");
    }
  };

  // ============================================================
  // HANDLE ADD
  // ============================================================

  const handleAdd = async () => {
    setError("");

    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Name is required";
    }

    if (groupType !== "expense") {
      if (!phone || phone.length === 0) {
        errors.phone = "Phone number is required";
      } else if (phone.length !== 10) {
        errors.phone = "Phone number must be 10 digits";
      }

      if (!role) {
        errors.role = "Please select a role";
      }
    }

    if (groupType === "apartment") {
      if (!flatNumber.trim()) {
        errors.flatNumber = "Apartment number is required";
      }

      if (!maintenanceAmount.trim()) {
        errors.maintenanceAmount = "Maintenance amount is required";
      } else if (isNaN(Number(maintenanceAmount))) {
        errors.maintenanceAmount = "Enter a valid amount";
      }
    }

    if (groupType === "staff") {
      if (!monthlySalary.trim()) {
        errors.monthlySalary = "Monthly salary is required";
      } else if (isNaN(Number(monthlySalary))) {
        errors.monthlySalary = "Enter a valid salary";
      }
    }

    if (groupType === "expense") {
      if (!expenseAmount.trim()) {
        errors.expenseAmount = "Expense amount is required";
      } else if (isNaN(Number(expenseAmount))) {
        errors.expenseAmount = "Enter a valid amount";
      }
    }

    if (!groupId || !groupType) {
      errors.group = "Missing group information. Please try again.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields");
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      await addNewMember({
        groupId,
        groupType,
        name: name.trim(),
        phone: groupType === "expense" ? "" : `+91${phone}`,
        role: groupType === "expense" ? "expense" : role,
        photoUri: photoUri ?? undefined,

        wing:
          groupType === "apartment" && wing.trim() ? wing.trim() : undefined,

        flatNumber: groupType === "apartment" ? flatNumber.trim() : undefined,

        areaSqft:
          groupType === "apartment" && areaSqft ? Number(areaSqft) : undefined,

        parkingAvailable:
          groupType === "apartment" ? parkingAvailable : undefined,

        maintenanceAmount:
          groupType === "apartment" ? Number(maintenanceAmount) : undefined,

        monthlySalary:
          groupType === "staff" ? Number(monthlySalary) : undefined,

        amount: groupType === "expense" ? Number(expenseAmount) : undefined,

        status: groupType === "expense" ? expenseStatus : undefined,

        reminderEnabled:
          groupType === "expense" && expenseStatus === "due"
            ? reminderEnabled
            : undefined,

        dueDate: groupType === "expense" ? dueDate : undefined,

        description:
          groupType === "expense"
            ? expenseDescription.trim() || undefined
            : undefined,

        billAttachments: groupType === "expense" ? billAttachments : undefined,
      } as any);

      router.back();
    } catch (e: any) {
      setError(
        e?.message ||
          `Failed to add ${getGroupTypeLabel(groupType).toLowerCase()}. Please try again.`,
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // INPUT COMPONENT
  // ============================================================

  const renderInput = ({
    label,
    value,
    onChangeText,
    placeholder,
    icon,
    errorKey,
    keyboardType = "default",
    optional = false,
    maxLength,
  }: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    icon: keyof typeof Ionicons.glyphMap;
    errorKey?: string;
    keyboardType?: "default" | "numeric" | "number-pad";
    optional?: boolean;
    maxLength?: number;
  }) => {
    const inputError = errorKey ? fieldErrors[errorKey] : "";

    return (
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.inputLabel,
              inputError ? styles.inputLabelError : undefined,
            ]}
          >
            {label}
          </Text>

          {optional && <Text style={styles.optionalText}>Optional</Text>}
        </View>

        <View
          style={[
            styles.inputContainer,
            inputError ? styles.inputContainerError : undefined,
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={inputError ? RED : "#94A3B8"}
          />

          <TextInput
            style={styles.textInput}
            placeholder={placeholder}
            placeholderTextColor="#A1AAB8"
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            maxLength={maxLength}
          />
        </View>

        {inputError ? (
          <Text style={styles.fieldError}>{inputError}</Text>
        ) : null}
      </View>
    );
  };

  // ============================================================
  // SECTION HEADER
  // ============================================================

  const renderSectionHeader = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    subtitle?: string,
  ) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color={BLUE} />
      </View>

      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>

        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          title: getHeaderTitle(),
          headerBackTitle: "Back",
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ======================================================
            PAGE HEADER
        ====================================================== */}

        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderIcon}>
            <Ionicons
              name={
                groupType === "expense"
                  ? "receipt-outline"
                  : groupType === "staff"
                    ? "people-outline"
                    : "home-outline"
              }
              size={28}
              color={BLUE}
            />
          </View>

          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>
              {groupType === "expense"
                ? "New Expense"
                : groupType === "staff"
                  ? "New Staff Member"
                  : "New Apartment Member"}
            </Text>

            <Text style={styles.pageSubtitle}>
              {groupType === "expense"
                ? "Record a society expense"
                : groupType === "staff"
                  ? "Add staff information"
                  : "Add resident and apartment details"}
            </Text>
          </View>
        </View>

        {/* ======================================================
            MEMBER PHOTO
        ====================================================== */}

        {groupType !== "expense" && (
          <View style={styles.photoCard}>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={showPhotoSelectionOptions}
              activeOpacity={0.8}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoImage} />
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
                {photoUri ? "Profile photo added" : "Add profile photo"}
              </Text>

              <Text style={styles.photoSubtitle}>
                {photoUri
                  ? "Tap the photo to change it"
                  : "Optional • Helps identify members"}
              </Text>
            </View>

            {photoUri && (
              <TouchableOpacity
                onPress={() => setPhotoUri(null)}
                style={styles.removePhotoButton}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={19} color={RED} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ======================================================
            MEMBER INFORMATION
        ====================================================== */}

        {groupType !== "expense" && (
          <View style={styles.card}>
            {renderSectionHeader(
              "person-circle-outline",
              "Basic Information",
              "Enter the member's contact details",
            )}

            {renderInput({
              label: "Full Name",
              value: name,
              onChangeText: (text) => {
                setName(text);
                clearFieldError("name");
              },
              placeholder: "e.g. Ramesh Kumar",
              icon: "person-outline",
              errorKey: "name",
            })}

            {/* PHONE */}

            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.inputLabel,
                    fieldErrors.phone ? styles.inputLabelError : undefined,
                  ]}
                >
                  Phone Number
                </Text>
              </View>

              <View
                style={[
                  styles.inputContainer,
                  fieldErrors.phone ? styles.inputContainerError : undefined,
                ]}
              >
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>

                <TextInput
                  style={styles.textInput}
                  placeholder="9876543210"
                  placeholderTextColor="#A1AAB8"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text.replace(/[^0-9]/g, ""));
                    clearFieldError("phone");
                  }}
                />

                <TouchableOpacity
                  onPress={pickContact}
                  style={styles.contactButton}
                  activeOpacity={0.8}
                >
                  <Ionicons name="people-outline" size={20} color={BLUE} />
                </TouchableOpacity>
              </View>

              {fieldErrors.phone ? (
                <Text style={styles.fieldError}>{fieldErrors.phone}</Text>
              ) : (
                <Text style={styles.helperText}>
                  You can select a number from your contacts
                </Text>
              )}
            </View>

            {/* ROLE */}

            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.inputLabel,
                    fieldErrors.role ? styles.inputLabelError : undefined,
                  ]}
                >
                  Role
                </Text>
              </View>

              <View style={styles.roleGrid}>
                {roleOptions.map((option) => {
                  const selected = !isCustomRole && role === option.role;

                  return (
                    <TouchableOpacity
                      key={option.role}
                      style={[
                        styles.roleCard,
                        selected && styles.roleCardSelected,
                      ]}
                      onPress={() => {
                        setRole(option.role);
                        setIsCustomRole(false);
                        setCustomRole("");
                        clearFieldError("role");
                      }}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.roleIcon,
                          selected && styles.roleIconSelected,
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={19}
                          color={selected ? "#fff" : BLUE}
                        />
                      </View>

                      <Text
                        style={[
                          styles.roleText,
                          selected && styles.roleTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>

                      {selected && (
                        <View style={styles.roleCheck}>
                          <Ionicons name="checkmark" size={13} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={[
                    styles.roleCard,
                    isCustomRole && styles.roleCardSelected,
                  ]}
                  onPress={() => {
                    setIsCustomRole(true);
                    setRole(
                      customRole.trim()
                        ? (customRole.trim() as MemberRole)
                        : null,
                    );
                  }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.roleIcon,
                      isCustomRole && styles.roleIconSelected,
                    ]}
                  >
                    <Ionicons
                      name="create-outline"
                      size={19}
                      color={isCustomRole ? "#fff" : BLUE}
                    />
                  </View>

                  <Text
                    style={[
                      styles.roleText,
                      isCustomRole && styles.roleTextSelected,
                    ]}
                  >
                    Custom
                  </Text>

                  {isCustomRole && (
                    <View style={styles.roleCheck}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {isCustomRole && (
                <View style={styles.customRoleWrapper}>
                  <TextInput
                    style={styles.customRoleInput}
                    placeholder="Enter custom role"
                    placeholderTextColor="#A1AAB8"
                    value={customRole}
                    onChangeText={(text) => {
                      setCustomRole(text);
                      setRole(text.trim() ? (text.trim() as MemberRole) : null);
                      clearFieldError("role");
                    }}
                  />
                </View>
              )}

              {fieldErrors.role ? (
                <Text style={styles.fieldError}>{fieldErrors.role}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ======================================================
            APARTMENT DETAILS
        ====================================================== */}

        {groupType === "apartment" && (
          <View style={styles.card}>
            {renderSectionHeader(
              "home-outline",
              "Apartment Details",
              "Add unit and maintenance information",
            )}

            {renderInput({
              label: "Wing / Section",
              value: wing,
              onChangeText: setWing,
              placeholder: "e.g. A Wing or Tower 1",
              icon: "business-outline",
              optional: true,
            })}

            {renderInput({
              label: "Apartment Number",
              value: flatNumber,
              onChangeText: (text) => {
                setFlatNumber(text);
                clearFieldError("flatNumber");
              },
              placeholder: "e.g. A-204",
              icon: "keypad-outline",
              errorKey: "flatNumber",
            })}

            {renderInput({
              label: "Area",
              value: areaSqft,
              onChangeText: (text) => setAreaSqft(text.replace(/[^0-9]/g, "")),
              placeholder: "e.g. 1200",
              icon: "resize-outline",
              keyboardType: "numeric",
              optional: true,
            })}

            {/* PARKING */}

            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="car-outline" size={21} color={BLUE} />
              </View>

              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Parking Available</Text>

                <Text style={styles.settingSubtitle}>
                  Does this apartment have parking?
                </Text>
              </View>

              <Switch
                value={parkingAvailable}
                onValueChange={setParkingAvailable}
                trackColor={{
                  false: "#CBD5E1",
                  true: "#93C5FD",
                }}
                thumbColor={
                  Platform.OS === "android"
                    ? parkingAvailable
                      ? BLUE
                      : "#F8FAFC"
                    : undefined
                }
              />
            </View>

            {renderInput({
              label: "Monthly Maintenance",
              value: maintenanceAmount,
              onChangeText: (text) => {
                setMaintenanceAmount(text.replace(/[^0-9]/g, ""));
                clearFieldError("maintenanceAmount");
              },
              placeholder: "e.g. 2500",
              icon: "cash-outline",
              keyboardType: "numeric",
              errorKey: "maintenanceAmount",
            })}
          </View>
        )}

        {/* ======================================================
            STAFF DETAILS
        ====================================================== */}

        {groupType === "staff" && (
          <View style={styles.card}>
            {renderSectionHeader(
              "briefcase-outline",
              "Staff Details",
              "Set the monthly salary",
            )}

            {renderInput({
              label: "Monthly Salary",
              value: monthlySalary,
              onChangeText: (text) => {
                setMonthlySalary(text.replace(/[^0-9]/g, ""));
                clearFieldError("monthlySalary");
              },
              placeholder: "e.g. 5000",
              icon: "cash-outline",
              keyboardType: "numeric",
              errorKey: "monthlySalary",
            })}
          </View>
        )}

        {/* ======================================================
            EXPENSE DETAILS
        ====================================================== */}

        {groupType === "expense" && (
          <View style={styles.card}>
            {renderSectionHeader(
              "receipt-outline",
              "Expense Details",
              "Record the expense and payment information",
            )}

            {renderInput({
              label: "Expense Name",
              value: name,
              onChangeText: (text) => {
                setName(text);
                clearFieldError("name");
              },
              placeholder: "e.g. Water bill, Lift repair",
              icon: "document-text-outline",
              errorKey: "name",
            })}

            {renderInput({
              label: "Amount",
              value: expenseAmount,
              onChangeText: (text) => {
                setExpenseAmount(text.replace(/[^0-9]/g, ""));
                clearFieldError("expenseAmount");
              },
              placeholder: "e.g. 4200",
              icon: "cash-outline",
              keyboardType: "numeric",
              errorKey: "expenseAmount",
            })}

            {/* PAYMENT STATUS */}

            <View style={styles.fieldContainer}>
              <Text style={styles.inputLabel}>Payment Status</Text>

              <View style={styles.paymentStatusRow}>
                <TouchableOpacity
                  style={[
                    styles.paymentStatus,
                    expenseStatus === "paid" && styles.paymentStatusPaid,
                  ]}
                  onPress={() => {
                    setExpenseStatus("paid");
                    setReminderEnabled(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.paymentStatusIcon,
                      expenseStatus === "paid" && styles.paymentStatusIconPaid,
                    ]}
                  >
                    <Ionicons
                      name="checkmark"
                      size={17}
                      color={expenseStatus === "paid" ? "#fff" : "#64748B"}
                    />
                  </View>

                  <View>
                    <Text
                      style={[
                        styles.paymentStatusTitle,
                        expenseStatus === "paid" &&
                          styles.paymentStatusTitlePaid,
                      ]}
                    >
                      Paid
                    </Text>

                    <Text style={styles.paymentStatusSubtitle}>
                      Already paid
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.paymentStatus,
                    expenseStatus === "due" && styles.paymentStatusDue,
                  ]}
                  onPress={() => setExpenseStatus("due")}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.paymentStatusIcon,
                      expenseStatus === "due" && styles.paymentStatusIconDue,
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={17}
                      color={expenseStatus === "due" ? "#fff" : "#64748B"}
                    />
                  </View>

                  <View>
                    <Text
                      style={[
                        styles.paymentStatusTitle,
                        expenseStatus === "due" && styles.paymentStatusTitleDue,
                      ]}
                    >
                      Due
                    </Text>

                    <Text style={styles.paymentStatusSubtitle}>
                      Payment pending
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* REMINDER */}

            {expenseStatus === "due" && (
              <View style={styles.reminderCard}>
                <View style={styles.reminderIcon}>
                  <Ionicons
                    name="notifications-outline"
                    size={20}
                    color="#D97706"
                  />
                </View>

                <View style={styles.reminderText}>
                  <Text style={styles.reminderTitle}>Set Reminder</Text>

                  <Text style={styles.reminderSubtitle}>
                    Get notified about this due expense
                  </Text>
                </View>

                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{
                    false: "#CBD5E1",
                    true: "#FCD34D",
                  }}
                  thumbColor={
                    Platform.OS === "android"
                      ? reminderEnabled
                        ? "#D97706"
                        : "#F8FAFC"
                      : undefined
                  }
                />
              </View>
            )}

            {/* DATE */}

            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Expense Date</Text>
              </View>

              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <View style={styles.dateLeft}>
                  <View style={styles.dateIcon}>
                    <Ionicons name="calendar-outline" size={19} color={BLUE} />
                  </View>

                  <Text style={styles.dateText}>
                    {dueDate || "Select date"}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* ATTACHMENTS */}

            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Bill Attachment</Text>

                <Text style={styles.optionalText}>Optional</Text>
              </View>

              {billAttachments.length > 0 && (
                <View style={styles.attachmentList}>
                  {billAttachments.map((attachment, index) => (
                    <View
                      key={`${attachment.uri}-${index}`}
                      style={styles.attachmentRow}
                    >
                      <View style={styles.attachmentIcon}>
                        <Ionicons name="image-outline" size={20} color={BLUE} />
                      </View>

                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {attachment.name}
                      </Text>

                      <TouchableOpacity
                        style={styles.attachmentAction}
                        onPress={() => Linking.openURL(attachment.uri)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="eye-outline" size={19} color={BLUE} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.attachmentAction}
                        onPress={() =>
                          setBillAttachments((currentAttachments) =>
                            currentAttachments.filter(
                              (_, attachmentIndex) => attachmentIndex !== index,
                            ),
                          )
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={19} color={RED} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.attachButton}
                onPress={handlePickBill}
                activeOpacity={0.8}
              >
                <View style={styles.attachButtonIcon}>
                  <Ionicons name="add" size={20} color={BLUE} />
                </View>

                <View style={styles.attachButtonTextContainer}>
                  <Text style={styles.attachButtonTitle}>
                    {billAttachments.length > 0
                      ? "Add another bill"
                      : "Attach bill or receipt"}
                  </Text>

                  <Text style={styles.attachButtonSubtitle}>
                    Select one or more images
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* NOTE */}

            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Note</Text>

                <Text style={styles.optionalText}>Optional</Text>
              </View>

              <View style={styles.textAreaContainer}>
                <Ionicons
                  name="create-outline"
                  size={19}
                  color="#94A3B8"
                  style={styles.textAreaIcon}
                />

                <TextInput
                  style={styles.textArea}
                  placeholder="Add any additional information..."
                  placeholderTextColor="#A1AAB8"
                  value={expenseDescription}
                  onChangeText={setExpenseDescription}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>
          </View>
        )}

        {/* ======================================================
            ERROR
        ====================================================== */}

        {error &&
        (error !== "Please fix the highlighted fields" || hasFieldErrors) ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle" size={19} color={RED} />
            </View>

            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ======================================================
            SAVE BUTTON
        ====================================================== */}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAdd}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <>
              <Text style={styles.buttonText}>Saving...</Text>
            </>
          ) : (
            <>
              <Ionicons
                name={
                  groupType === "expense"
                    ? "receipt-outline"
                    : "checkmark-circle-outline"
                }
                size={21}
                color="#fff"
              />

              <Text style={styles.buttonText}>{getButtonText(groupType)}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.bottomHint}>
          Your information will be saved securely in your society records.
        </Text>
      </ScrollView>

      {/* ======================================================
          DATE PICKER
      ====================================================== */}

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={setDueDate}
      />

      {/* ======================================================
          CONTACT PICKER
      ====================================================== */}

      {renderContactPickerModal()}

      {/* ======================================================
          PHOTO OPTIONS MODAL - Matches AddAccountScreen
      ====================================================== */}

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
                style={[styles.photoOptionIcon, { backgroundColor: "#ecfdf5" }]}
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

      {/* ======================================================
          PHOTO ADJUST MODAL - Pinch to zoom / drag
      ====================================================== */}

      <PhotoAdjustModal
        visible={showAdjustModal}
        image={rawImage}
        onCancel={handleAdjustCancel}
        onConfirm={handleAdjustConfirm}
      />
    </KeyboardAvoidingView>
  );
}

// ================================================================
// STYLES - All shadow* replaced with boxShadow
// ================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 50,
  },

  // ============================================================
  // PAGE HEADER
  // ============================================================

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  pageHeaderIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  pageHeaderText: {
    flex: 1,
  },

  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.3,
  },

  pageSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 4,
    lineHeight: 18,
  },

  // ============================================================
  // PHOTO
  // ============================================================

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

  // ============================================================
  // CARD
  // ============================================================

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },

  // ============================================================
  // SECTION HEADER
  // ============================================================

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  sectionHeaderText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 3,
  },

  // ============================================================
  // INPUTS
  // ============================================================

  fieldContainer: {
    marginTop: 18,
  },

  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },

  inputLabelError: {
    color: RED,
  },

  optionalText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },

  inputContainer: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 6,
  },

  inputContainerError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FFF7F7",
  },

  textInput: {
    flex: 1,
    minHeight: 50,
    fontSize: 15,
    color: TEXT,
    paddingHorizontal: 10,
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

  contactButton: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },

  helperText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 6,
  },

  fieldError: {
    fontSize: 11,
    color: RED,
    marginTop: 6,
    fontWeight: "500",
  },

  // ============================================================
  // ROLE
  // ============================================================

  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  roleCard: {
    width: "47.5%",
    minHeight: 62,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },

  roleCardSelected: {
    borderColor: BLUE,
    backgroundColor: BLUE_LIGHT,
  },

  roleIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 9,
  },

  roleIconSelected: {
    backgroundColor: BLUE,
  },

  roleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },

  roleTextSelected: {
    color: BLUE,
    fontWeight: "700",
  },

  roleCheck: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
  },

  customRoleWrapper: {
    marginTop: 10,
  },

  customRoleInput: {
    height: 50,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: TEXT,
    backgroundColor: "#fff",
  },

  // ============================================================
  // SETTINGS
  // ============================================================

  settingRow: {
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
  },

  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  settingText: {
    flex: 1,
  },

  settingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
  },

  settingSubtitle: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 3,
  },

  // ============================================================
  // PAYMENT STATUS
  // ============================================================

  paymentStatusRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },

  paymentStatus: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  paymentStatusPaid: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },

  paymentStatusDue: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },

  paymentStatusIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  paymentStatusIconPaid: {
    backgroundColor: "#16A34A",
  },

  paymentStatusIconDue: {
    backgroundColor: "#D97706",
  },

  paymentStatusTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },

  paymentStatusTitlePaid: {
    color: "#15803D",
  },

  paymentStatusTitleDue: {
    color: "#B45309",
  },

  paymentStatusSubtitle: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
  },

  // ============================================================
  // REMINDER
  // ============================================================

  reminderCard: {
    minHeight: 68,
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginTop: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  reminderIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  reminderText: {
    flex: 1,
  },

  reminderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
  },

  reminderSubtitle: {
    fontSize: 11,
    color: "#A16207",
    marginTop: 3,
  },

  // ============================================================
  // DATE
  // ============================================================

  dateInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },

  dateLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  dateIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  dateText: {
    fontSize: 14,
    color: TEXT,
    fontWeight: "500",
  },

  // ============================================================
  // ATTACHMENTS
  // ============================================================

  attachmentList: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 10,
  },

  attachmentRow: {
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FBFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0ECFF",
  },

  attachmentIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 9,
  },

  attachmentName: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    fontWeight: "500",
  },

  attachmentAction: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  attachButton: {
    minHeight: 66,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#93C5FD",
    borderRadius: 14,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FBFF",
  },

  attachButtonIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  attachButtonTextContainer: {
    flex: 1,
  },

  attachButtonTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE,
  },

  attachButtonSubtitle: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 3,
  },

  // ============================================================
  // TEXT AREA
  // ============================================================

  textAreaContainer: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 13,
  },

  textAreaIcon: {
    marginTop: 2,
  },

  textArea: {
    flex: 1,
    minHeight: 85,
    paddingHorizontal: 10,
    paddingTop: 0,
    fontSize: 14,
    color: TEXT,
    lineHeight: 20,
  },

  // ============================================================
  // ERROR
  // ============================================================

  errorCard: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  errorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "500",
  },

  // ============================================================
  // BUTTON
  // ============================================================

  button: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 18,
    boxShadow: "0px 5px 10px rgba(37, 99, 235, 0.18)",
  },

  buttonDisabled: {
    opacity: 0.65,
  },

  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  bottomHint: {
    fontSize: 10,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 11,
    lineHeight: 15,
    paddingHorizontal: 20,
  },

  // ============================================================
  // CONTACT MODAL
  // ============================================================

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "88%",
    minHeight: "55%",
  },

  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 18,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  modalTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: TEXT,
  },

  modalSubtitle: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 3,
  },

  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  modalSearchContainer: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  modalSearchInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 9,
    fontSize: 14,
    color: TEXT,
  },

  clearSearchButton: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },

  resultCount: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 12,
    marginBottom: 5,
    fontWeight: "500",
  },

  contactListWrapper: {
    flex: 1,
    minHeight: 220,
  },

  contactListContainer: {
    flex: 1,
  },

  contactListContent: {
    paddingBottom: 8,
  },

  contactItem: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  contactAvatarText: {
    fontSize: 17,
    fontWeight: "700",
    color: BLUE,
  },

  contactInfo: {
    flex: 1,
    marginRight: 8,
  },

  contactName: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
  },

  contactPhone: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 4,
  },

  contactSelectIcon: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },

  noContactsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 55,
    paddingHorizontal: 30,
  },

  noContactsIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },

  noContactsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
  },

  noContactsText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 5,
    lineHeight: 18,
  },

  modalCancelButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },

  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

  // ============================================================
  // PHOTO OPTIONS MODAL - Matches AddAccountScreen
  // ============================================================

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    alignItems: "center",
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
}) as any;

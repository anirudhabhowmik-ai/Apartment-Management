import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";
import { AccountType } from "../../types";

type SetupOptionId =
  | "apartment"
  | "home"
  | "join_owner"
  | "join_staff_sweeper"
  | "join_staff_security";

type TabId = "create" | "invitations";

interface SetupOption {
  id: SetupOptionId;
  title: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  category: "create" | "join";
}

interface StaffRole {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accessLevel: "full" | "limited" | "readonly";
  permissions: string[];
}

const STAFF_ROLES: StaffRole[] = [
  {
    id: "security",
    label: "Security Guard",
    description: "Manage gate entry, visitor logs, and security patrols",
    icon: "shield-checkmark",
    accessLevel: "limited",
    permissions: ["gate_entry", "visitor_management", "patrol_logs"],
  },
  {
    id: "sweeper",
    label: "Sweeper / Cleaner",
    description: "Track cleaning tasks, attendance, and salary",
    icon: "brush",
    accessLevel: "limited",
    permissions: ["cleaning_tasks", "attendance", "salary_view"],
  },
  {
    id: "maintenance",
    label: "Maintenance Staff",
    description: "Handle repairs, maintenance requests, and inventory",
    icon: "construct",
    accessLevel: "limited",
    permissions: ["repairs", "maintenance_requests", "inventory"],
  },
  {
    id: "gardener",
    label: "Gardener",
    description: "Manage garden maintenance, landscaping, and watering",
    icon: "leaf",
    accessLevel: "limited",
    permissions: ["gardening", "landscaping", "watering_schedule"],
  },
  {
    id: "driver",
    label: "Driver",
    description: "Manage vehicle schedules, trips, and maintenance",
    icon: "car",
    accessLevel: "limited",
    permissions: ["vehicle_schedule", "trip_logs", "vehicle_maintenance"],
  },
];

const SETUP_OPTIONS: SetupOption[] = [
  {
    id: "apartment",
    title: "Apartment Society",
    badge: "Secretary / Admin",
    badgeColor: "#1a73e8",
    badgeBg: "#e8f0fe",
    description:
      "Manage flats, flat owners, monthly maintenance dues, staff salaries & accounts",
    icon: "business",
    iconColor: "#1a73e8",
    iconBg: "#e8f0fe",
    category: "create",
  },
  {
    id: "home",
    title: "Personal Home",
    badge: "Owner / Admin",
    badgeColor: "#059669",
    badgeBg: "#ecfdf5",
    description:
      "Track your personal rent, electricity bills, maid expenses and family budget",
    icon: "home",
    iconColor: "#059669",
    iconBg: "#ecfdf5",
    category: "create",
  },
  {
    id: "join_owner",
    title: "Join as Apartment Owner",
    badge: "Join via Invitation",
    badgeColor: "#7c3aed",
    badgeBg: "#f3e8ff",
    description:
      "Connect with your society to check monthly dues, view receipts & building notices",
    icon: "key",
    iconColor: "#7c3aed",
    iconBg: "#f3e8ff",
    category: "join",
  },
];

const STAFF_JOIN_OPTIONS: SetupOption[] = [
  {
    id: "join_staff_sweeper",
    title: "Join as Sweeper",
    badge: "Sweeper / Cleaner",
    badgeColor: "#059669",
    badgeBg: "#ecfdf5",
    description:
      "Track your daily cleaning tasks, attendance, and monthly salary payouts",
    icon: "brush",
    iconColor: "#059669",
    iconBg: "#ecfdf5",
    category: "join",
  },
  {
    id: "join_staff_security",
    title: "Join as Security Guard",
    badge: "Security Guard",
    badgeColor: "#d97706",
    badgeBg: "#fef3c7",
    description:
      "Manage gate entry, visitor logs, security patrols, and daily attendance",
    icon: "shield-checkmark",
    iconColor: "#d97706",
    iconBg: "#fef3c7",
    category: "join",
  },
];

const DUMMY_INVITATIONS: any[] = [
  {
    id: "dummy_invite_1",
    accountId: "dummy_account_1",
    accountName: "Green Valley Apartments",
    invitedByPhone: "+91 9876543210",
    invitedByName: "Ramesh Kumar",
    role: "member_visibility",
    name: "John Doe",
    phone: "+91 9876543210",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  },
  {
    id: "dummy_invite_2",
    accountId: "dummy_account_2",
    accountName: "Sunset Heights",
    invitedByPhone: "+91 9876543211",
    invitedByName: "Priya Sharma",
    role: "sweeper",
    name: "Rajesh",
    phone: "+91 9876543211",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  },
  {
    id: "dummy_invite_3",
    accountId: "dummy_account_3",
    accountName: "Lake View Society",
    invitedByPhone: "+91 9876543212",
    invitedByName: "Amit Singh",
    role: "security",
    name: "Vikram",
    phone: "+91 9876543212",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  },
];

// ---------------------------------------------------------------------------
// Smooth Zoom Slider - Android / iOS compatible
// ---------------------------------------------------------------------------

interface CustomSliderProps {
  minimumValue: number;
  maximumValue: number;
  value: number;
  onValueChange: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
}

function CustomSlider({
  minimumValue,
  maximumValue,
  value,
  onValueChange,
  minimumTrackTintColor = "#1a73e8",
  maximumTrackTintColor = "#e2e8f0",
  thumbTintColor = "#1a73e8",
}: CustomSliderProps) {
  const sliderWidth = useRef(0);
  const sliderPageX = useRef(0);
  const isDragging = useRef(false);

  const thumbSize = 22;

  const clamp = (number: number, min: number, max: number) => {
    return Math.min(Math.max(number, min), max);
  };

  const valueToPercent = () => {
    if (maximumValue === minimumValue) return 0;
    return clamp((value - minimumValue) / (maximumValue - minimumValue), 0, 1);
  };

  const updateFromPageX = (pageX: number) => {
    if (sliderWidth.current <= 0) return;
    const relativeX = pageX - sliderPageX.current;
    const percent = clamp(relativeX / sliderWidth.current, 0, 1);
    const newValue = minimumValue + percent * (maximumValue - minimumValue);
    onValueChange(newValue);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        isDragging.current = true;
        updateFromPageX(event.nativeEvent.pageX);
      },
      onPanResponderMove: (event) => {
        if (!isDragging.current) return;
        updateFromPageX(event.nativeEvent.pageX);
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
      },
    }),
  ).current;

  const percent = valueToPercent();

  return (
    <View
      style={sliderStyles.sliderContainer}
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        sliderWidth.current = width;
        // @ts-ignore - measureInWindow is available on native
        event.currentTarget?.measureInWindow?.((pageX: number) => {
          sliderPageX.current = pageX;
        });
      }}
      {...panResponder.panHandlers}
    >
      {/* Track */}
      <View style={sliderStyles.sliderTrack}>
        <View
          style={[
            sliderStyles.sliderTrackFill,
            {
              width: `${percent * 100}%`,
              backgroundColor: minimumTrackTintColor,
            },
          ]}
        />
        <View
          style={[
            sliderStyles.sliderTrackRemaining,
            {
              flex: 1,
              backgroundColor: maximumTrackTintColor,
            },
          ]}
        />
      </View>

      {/* Thumb */}
      <View
        style={[
          sliderStyles.sliderThumb,
          {
            left: `${percent * 100}%`,
            backgroundColor: thumbTintColor,
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            marginLeft: -thumbSize / 2,
            pointerEvents: "none",
          },
        ]}
      >
        <View style={sliderStyles.sliderThumbInner} />
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  sliderContainer: {
    width: "100%",
    height: 44,
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 2,
  },
  sliderTrack: {
    width: "100%",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
  },
  sliderTrackFill: {
    height: "100%",
  },
  sliderTrackRemaining: {
    height: "100%",
  },
  sliderThumb: {
    position: "absolute",
    top: "50%",
    marginTop: -11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.22)",
  },
  sliderThumbInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
});

// ---------------------------------------------------------------------------
// Photo Adjust Modal - Fixed for Android
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
  }, [zoom, image]);

  const gestureRef = useRef<{
    mode: "pan" | "pinch";
    startTouch?: { x: number; y: number };
    startTranslate?: { x: number; y: number };
    startDistance?: number;
    startZoom?: number;
  } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 1) {
          const touch = touches[0];
          gestureRef.current = {
            mode: "pan",
            startTouch: { x: touch.pageX, y: touch.pageY },
            startTranslate: { ...translate },
          };
        } else if (touches.length === 2) {
          gestureRef.current = {
            mode: "pinch",
            startDistance: getTouchDistance(touches),
            startZoom: zoom,
          };
        }
      },
      onPanResponderMove: (
        evt: GestureResponderEvent,
        _gestureState: PanResponderGestureState,
      ) => {
        const touches = evt.nativeEvent.touches;
        const gesture = gestureRef.current;

        if (!gesture) return;

        if (touches.length === 2 && gesture.mode === "pinch") {
          const distance = getTouchDistance(touches);
          if (gesture.startDistance && gesture.startDistance > 0) {
            const nextZoom = clampNumber(
              (gesture.startZoom || 1) * (distance / gesture.startDistance),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            setZoom(nextZoom);
          }
        } else if (touches.length === 1 && gesture.mode === "pan") {
          const touch = touches[0];
          const dx = touch.pageX - (gesture.startTouch?.x || 0);
          const dy = touch.pageY - (gesture.startTouch?.y || 0);
          const next = clampTranslate(
            {
              x: (gesture.startTranslate?.x || 0) + dx,
              y: (gesture.startTranslate?.y || 0) + dy,
            },
            zoom,
          );
          setTranslate(next);
        }
      },
      onPanResponderRelease: () => {
        gestureRef.current = null;
        setTranslate((t) => clampTranslate(t, zoom));
      },
      onPanResponderTerminate: () => {
        gestureRef.current = null;
      },
    }),
  ).current;

  const handleZoomChange = (value: number) => {
    setZoom(value);
    setTranslate((current) => {
      return clampTranslate(current, value);
    });
  };

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
            Drag to reposition • Use slider to zoom
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

          {/* Smooth Zoom Slider */}
          <View style={adjustStyles.sliderContainer}>
            <View style={adjustStyles.sliderLabelRow}>
              <Text style={adjustStyles.sliderLabel}>Zoom</Text>
              <Text style={adjustStyles.zoomValueText}>
                {Math.round(zoom * 100)}%
              </Text>
            </View>

            <CustomSlider
              minimumValue={MIN_ZOOM}
              maximumValue={MAX_ZOOM}
              value={zoom}
              onValueChange={handleZoomChange}
              minimumTrackTintColor="#1a73e8"
              maximumTrackTintColor="#e2e8f0"
              thumbTintColor="#1a73e8"
            />
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

// Helper functions
function clampNumber(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

function getTouchDistance(touches: any[]) {
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
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
  sliderContainer: {
    width: "100%",
    marginTop: 16,
  },
  sliderLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  zoomValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a73e8",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
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

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function AddAccountScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const grantAccountRole = useAuthStore((s) => s.grantAccountRole);
  const { createAccount, accounts } = useAccounts();
  const selectAccount = useAccountStore((s) => s.selectAccount);
  const getPendingGrantsByPhone = useAccessStore(
    (s) => s.getPendingGrantsByPhone,
  );
  const acceptGrant = useAccessStore((s) => s.acceptGrant);
  const removeGrant = useAccessStore((s) => s.removeGrant);

  const [step, setStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<TabId>("create");
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectingGrantId, setRejectingGrantId] = useState<string | null>(null);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showDummyInvites, setShowDummyInvites] = useState(true);

  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const pendingInvitations = useMemo(() => {
    const realInvitations = user?.phone
      ? getPendingGrantsByPhone(user.phone)
      : [];

    if (realInvitations.length === 0 && showDummyInvites) {
      return DUMMY_INVITATIONS;
    }

    return realInvitations;
  }, [user?.phone, getPendingGrantsByPhone, showDummyInvites]);

  const getInvitationApartmentName = (invitation: any) => {
    if (invitation.id?.startsWith("dummy_invite_")) {
      return invitation.accountName || "Apartment Society";
    }
    const account = accounts.find((a) => a.id === invitation.accountId);
    return account?.name || invitation.accountName || "Apartment Society";
  };

  const handleSelectOption = async (option: SetupOption) => {
    setError("");

    if (option.id === "apartment" || option.id === "home") {
      setSelectedType(option.id);
      setStep(2);
    } else if (option.id === "join_owner") {
      await handleDirectJoin("owner");
    } else if (option.id === "join_staff_sweeper") {
      await handleDirectJoin("staff", "sweeper");
    } else if (option.id === "join_staff_security") {
      await handleDirectJoin("staff", "security");
    }
  };

  const handleDirectJoin = async (
    roleType: "owner" | "staff",
    staffRoleId?: string,
  ) => {
    setLoading(true);
    setError("");

    try {
      const isFirstAccount = accounts.length === 0;

      const matchingGrant = pendingInvitations.find((g: any) => {
        if (roleType === "owner") {
          return g.role === "member_visibility";
        }
        return g.role !== "admin" && g.role !== "member_visibility";
      });

      if (matchingGrant) {
        if (matchingGrant.id?.startsWith("dummy_invite_")) {
          const aptName = getInvitationApartmentName(matchingGrant);
          const defaultName =
            roleType === "owner" ? `${aptName} - Owner` : `${aptName} - Staff`;

          const newAccount = await createAccount("apartment", defaultName);
          if (newAccount) {
            const role = roleType === "owner" ? "member_visibility" : "admin";
            grantAccountRole(newAccount.id, role);
            selectAccount(newAccount.id);
            setShowDummyInvites(false);
          }
        } else {
          const role =
            matchingGrant.role === "admin" ? "admin" : "member_visibility";
          acceptGrant(matchingGrant.id);
          grantAccountRole(matchingGrant.accountId, role);
          selectAccount(matchingGrant.accountId);
        }
      } else {
        let defaultName =
          roleType === "owner" ? "My Flat (Apartment)" : "Staff Workspace";

        if (roleType === "staff" && staffRoleId) {
          const role = STAFF_ROLES.find((r) => r.id === staffRoleId);
          if (role) {
            defaultName = `${role.label} - Workspace`;
          }
        }

        const newAccount = await createAccount("apartment", defaultName);
        if (newAccount) {
          const role = roleType === "owner" ? "member_visibility" : "admin";
          grantAccountRole(newAccount.id, role);

          if (roleType === "staff" && staffRoleId) {
            console.log(`Staff role selected: ${staffRoleId}`);
          }
        }
      }

      if (isFirstAccount) {
        router.replace("/(tabs)");
      } else {
        router.back();
      }
    } catch (err) {
      console.error("Direct join error:", err);
      setError("Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

  const handlePickPhoto = async () => {
    showPhotoSelectionOptions();
  };

  const handleCreate = async () => {
    setError("");

    if (!selectedType) {
      setError("Please choose Apartment or Home");
      return;
    }
    if (!name.trim()) {
      setError(
        `Please enter a name for your ${selectedType === "apartment" ? "apartment" : "home"}`,
      );
      return;
    }

    setLoading(true);
    try {
      const isFirstAccount = accounts.length === 0;

      const newAccount = await createAccount(
        selectedType,
        name.trim(),
        photoUri ?? undefined,
      );

      if (newAccount) {
        if (isFirstAccount) {
          router.replace("/(tabs)");
        } else {
          router.back();
        }
      } else {
        setError("Failed to create account. Please try again.");
      }
    } catch (e) {
      setError("Failed to create account. Please try again.");
      console.error("Account creation error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = (
    grantId: string,
    accountId: string,
    role: any,
  ) => {
    if (grantId?.startsWith("dummy_invite_")) {
      const dummyInvite = DUMMY_INVITATIONS.find((inv) => inv.id === grantId);
      if (dummyInvite) {
        const aptName = dummyInvite.accountName || "Apartment Society";
        const isOwner = role === "member_visibility";
        const defaultName = isOwner
          ? `${aptName} - Owner`
          : `${aptName} - Staff`;

        createAccount("apartment", defaultName).then((newAccount) => {
          if (newAccount) {
            const grantRole = role === "admin" ? "admin" : "member_visibility";
            grantAccountRole(newAccount.id, grantRole);
            selectAccount(newAccount.id);
            setShowDummyInvites(false);
            if (accounts.length === 0) {
              router.replace("/(tabs)");
            } else {
              router.back();
            }
          }
        });
        return;
      }
    }

    const grantRole = role === "admin" ? "admin" : "member_visibility";
    acceptGrant(grantId);
    grantAccountRole(accountId, grantRole);
    selectAccount(accountId);
    if (accounts.length === 0) {
      router.replace("/(tabs)");
    } else {
      router.back();
    }
  };

  const getUniqueApartments = () => {
    const apartmentMap = new Map();
    pendingInvitations.forEach((invitation: any) => {
      const aptName = getInvitationApartmentName(invitation);
      if (!apartmentMap.has(aptName)) {
        apartmentMap.set(aptName, {
          name: aptName,
          invitations: [],
        });
      }
      apartmentMap.get(aptName).invitations.push(invitation);
    });
    return Array.from(apartmentMap.values());
  };

  const uniqueApartments = getUniqueApartments();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#1a73e8" />
              <Text style={styles.loadingText}>Setting up your account...</Text>
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: "50%" }]} />
            </View>

            <View style={styles.header}>
              <Text style={styles.stepBadge}>STEP 1 OF 2</Text>
              <Text style={styles.title}>Choose Setup Type</Text>
              <Text style={styles.subtitle}>
                Select an option that best fits your role to get started
              </Text>
            </View>

            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "create" && styles.tabButtonActiveBlue,
                ]}
                onPress={() => setActiveTab("create")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add-circle"
                  size={16}
                  color={activeTab === "create" ? "#1a73e8" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === "create" && styles.tabButtonTextActiveBlue,
                  ]}
                >
                  Create New
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "invitations" && styles.tabButtonActivePurple,
                ]}
                onPress={() => setActiveTab("invitations")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mail-open"
                  size={16}
                  color={activeTab === "invitations" ? "#7c3aed" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === "invitations" &&
                      styles.tabButtonTextActivePurple,
                  ]}
                >
                  Invitations
                  {pendingInvitations.length > 0 && (
                    <View style={styles.invitationBadge}>
                      <Text style={styles.invitationBadgeText}>
                        {pendingInvitations.length}
                      </Text>
                    </View>
                  )}
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === "create" && (
              <View style={styles.section}>
                <View style={styles.optionsList}>
                  {SETUP_OPTIONS.filter((o) => o.category === "create").map(
                    (option) => (
                      <TouchableOpacity
                        key={option.id}
                        style={styles.card}
                        onPress={() => handleSelectOption(option)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.cardHeader}>
                          <View
                            style={[
                              styles.cardIconContainer,
                              { backgroundColor: option.iconBg },
                            ]}
                          >
                            <Ionicons
                              name={option.icon}
                              size={24}
                              color={option.iconColor}
                            />
                          </View>
                          <View style={styles.cardHeaderInfo}>
                            <Text style={styles.cardTitle}>{option.title}</Text>
                            <View style={styles.cardBadgeRow}>
                              <View
                                style={[
                                  styles.cardBadge,
                                  { backgroundColor: option.badgeBg },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.cardBadgeText,
                                    { color: option.badgeColor },
                                  ]}
                                >
                                  {option.badge}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.arrowCircle}>
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color="#1a73e8"
                            />
                          </View>
                        </View>

                        <Text style={styles.cardDescription}>
                          {option.description}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              </View>
            )}

            {activeTab === "invitations" && (
              <View style={styles.section}>
                {pendingInvitations.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyStateIcon}>
                      <Ionicons
                        name="mail-open-outline"
                        size={48}
                        color="#cbd5e1"
                      />
                    </View>
                    <Text style={styles.emptyStateTitle}>No Invitations</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      You haven't received any invitations yet. Ask your society
                      admin to send you an invitation.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.invitationsContainer}>
                    {uniqueApartments.map((apartment: any) => (
                      <View key={apartment.name} style={styles.apartmentGroup}>
                        <View style={styles.apartmentHeader}>
                          <View style={styles.apartmentIconContainer}>
                            <Ionicons
                              name="business"
                              size={20}
                              color="#1a73e8"
                            />
                          </View>
                          <Text style={styles.apartmentName}>
                            {apartment.name}
                          </Text>
                          <View style={styles.invitationCountBadge}>
                            <Text style={styles.invitationCountText}>
                              {apartment.invitations.length}
                            </Text>
                          </View>
                        </View>

                        {apartment.invitations.map((invitation: any) => {
                          const isOwnerRole =
                            invitation.role === "member_visibility";
                          const isAdminRole = invitation.role === "admin";

                          const inviterPhone =
                            invitation.invitedByPhone || "Secretary";

                          let optionCard: SetupOption = {
                            id: "join_owner",
                            title: "Join as Apartment Owner",
                            badge: "Owner",
                            badgeColor: "#7c3aed",
                            badgeBg: "#f3e8ff",
                            description:
                              "Connect with this society to view monthly maintenance dues, payment receipts & society notices.",
                            icon: "key",
                            iconColor: "#7c3aed",
                            iconBg: "#f3e8ff",
                            category: "join",
                          };

                          if (isAdminRole || isOwnerRole) {
                            optionCard = {
                              id: "join_owner",
                              title: "Join as Apartment Owner",
                              badge: "Owner",
                              badgeColor: "#7c3aed",
                              badgeBg: "#f3e8ff",
                              description:
                                "Connect with this society to view monthly maintenance dues, payment receipts & society notices.",
                              icon: "key",
                              iconColor: "#7c3aed",
                              iconBg: "#f3e8ff",
                              category: "join",
                            };
                          } else {
                            const staffOption = STAFF_JOIN_OPTIONS.find((opt) =>
                              invitation.role
                                ?.toLowerCase()
                                .includes(opt.id.replace("join_staff_", "")),
                            );
                            if (staffOption) {
                              optionCard = staffOption;
                            } else {
                              optionCard = {
                                id: "join_staff_sweeper",
                                title: "Join as Staff",
                                badge: "Staff",
                                badgeColor: "#d97706",
                                badgeBg: "#fef3c7",
                                description:
                                  "Track your daily tasks, attendance, and monthly salary payouts",
                                icon: "person",
                                iconColor: "#d97706",
                                iconBg: "#fef3c7",
                                category: "join",
                              };
                            }
                          }

                          return (
                            <View
                              key={invitation.id}
                              style={styles.invitationCard}
                            >
                              <View style={styles.invitationCardHeader}>
                                <View
                                  style={[
                                    styles.invitationCardIcon,
                                    {
                                      backgroundColor: optionCard.iconBg,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name={optionCard.icon}
                                    size={22}
                                    color={optionCard.iconColor}
                                  />
                                </View>
                                <View style={styles.invitationCardInfo}>
                                  <Text style={styles.invitationCardTitle}>
                                    {optionCard.title}
                                  </Text>
                                  <View style={styles.invitationBadgeRow}>
                                    <View
                                      style={[
                                        styles.invitationRoleBadge,
                                        {
                                          backgroundColor: optionCard.badgeBg,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.invitationRoleBadgeText,
                                          {
                                            color: optionCard.badgeColor,
                                          },
                                        ]}
                                      >
                                        {optionCard.badge}
                                      </Text>
                                    </View>
                                    <View style={styles.inviterPillSmall}>
                                      <Ionicons
                                        name="call"
                                        size={10}
                                        color="#1a73e8"
                                      />
                                      <Text style={styles.inviterPillTextSmall}>
                                        Invited by: {inviterPhone}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>

                              <Text style={styles.invitationCardDescription}>
                                {optionCard.description}
                              </Text>

                              <View style={styles.invitationActions}>
                                <TouchableOpacity
                                  style={styles.invitationRejectButton}
                                  onPress={() =>
                                    setRejectingGrantId(invitation.id)
                                  }
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name="close-outline"
                                    size={16}
                                    color="#dc2626"
                                  />
                                  <Text style={styles.invitationRejectText}>
                                    Reject
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={[
                                    styles.invitationAcceptButton,
                                    {
                                      backgroundColor: optionCard.iconColor,
                                    },
                                  ]}
                                  onPress={() =>
                                    handleAcceptInvite(
                                      invitation.id,
                                      invitation.accountId,
                                      invitation.role,
                                    )
                                  }
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.invitationAcceptText}>
                                    Accept Invitation
                                  </Text>
                                  <Ionicons
                                    name="arrow-forward"
                                    size={14}
                                    color="#ffffff"
                                  />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: "100%" }]} />
            </View>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setError("");
                setStep(1);
              }}
            >
              <Ionicons name="arrow-back" size={18} color="#1a73e8" />
              <Text style={styles.backButtonText}>Change setup type</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.stepBadge}>STEP 2 OF 2</Text>
              <Text style={styles.title}>
                {selectedType === "apartment"
                  ? "Set up Apartment Society"
                  : "Set up Personal Home"}
              </Text>
              <Text style={styles.subtitle}>
                Add a photo and name for your property to finish setup
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.photoSection}>
                <TouchableOpacity
                  style={styles.photoCircle}
                  onPress={handlePickPhoto}
                  activeOpacity={0.8}
                >
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.photoImage}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons
                        name={
                          selectedType === "apartment"
                            ? "business-outline"
                            : "home-outline"
                        }
                        size={36}
                        color="#1a73e8"
                      />
                      <View style={styles.cameraIconBadge}>
                        <Ionicons name="camera" size={14} color="#fff" />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.photoActionButtons}>
                  <TouchableOpacity
                    onPress={handlePickPhoto}
                    style={styles.photoButton}
                  >
                    <Text style={styles.photoButtonText}>
                      {photoUri ? "Change Photo" : "Add Photo (optional)"}
                    </Text>
                  </TouchableOpacity>
                  {photoUri && (
                    <TouchableOpacity
                      onPress={() => setPhotoUri(null)}
                      style={styles.removePhotoButton}
                    >
                      <Text style={styles.removePhotoText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {selectedType === "apartment"
                    ? "Apartment / Society Name"
                    : "Home Name"}
                </Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name={
                      selectedType === "apartment"
                        ? "business-outline"
                        : "home-outline"
                    }
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={
                      selectedType === "apartment"
                        ? "e.g. Green Valley Apartments"
                        : "e.g. My Home - Rajarhat"
                    }
                    placeholderTextColor="#999"
                    value={name}
                    onChangeText={(val) => {
                      setName(val);
                      setError("");
                    }}
                    autoFocus
                  />
                  {name.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setName("")}
                      style={styles.clearInput}
                    >
                      <Ionicons name="close-circle" size={18} color="#aaa" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color="#e53935" />
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleCreate}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Create Account</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Photo Options Modal */}
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

      {/* Photo Adjust (zoom / drag) Modal with Slider */}
      <PhotoAdjustModal
        visible={showAdjustModal}
        image={rawImage}
        onCancel={handleAdjustCancel}
        onConfirm={handleAdjustConfirm}
      />

      {/* Reject Modal - Centered */}
      <Modal
        visible={rejectingGrantId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingGrantId(null)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setRejectingGrantId(null)}
        >
          <Pressable style={styles.modalCardCenter} onPress={() => {}}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="close-circle" size={36} color="#dc2626" />
            </View>

            <Text style={styles.modalTitle}>Reject Invitation?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to reject this invitation? You will no
              longer be able to join this property using this invite.
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setRejectingGrantId(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={() => {
                  if (rejectingGrantId) {
                    const realGrantIds = [
                      "apartment",
                      "home",
                      "join_owner",
                      "join_staff_sweeper",
                      "join_staff_security",
                    ];
                    if (!realGrantIds.includes(rejectingGrantId)) {
                      removeGrant(rejectingGrantId);
                    }
                    if (rejectingGrantId.startsWith("dummy_invite_")) {
                      setShowDummyInvites(false);
                    }
                    setRejectingGrantId(null);
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#ffffff" />
                <Text style={styles.modalConfirmText}>Yes, Reject</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ================================================================
// STYLES - All shadow* replaced with boxShadow
// ================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 2,
    marginBottom: 18,
    marginTop: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1a73e8",
    borderRadius: 2,
  },
  header: {
    marginBottom: 16,
    marginTop: 4,
  },
  stepBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1a73e8",
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13.5,
    color: "#64748b",
    lineHeight: 19,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    marginBottom: 14,
    gap: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a73e8",
  },
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: "#eef1f6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  tabButtonActiveBlue: {
    backgroundColor: "#ffffff",
    boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.06)",
  },
  tabButtonActivePurple: {
    backgroundColor: "#ffffff",
    boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.06)",
  },
  tabButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#94a3b8",
  },
  tabButtonTextActiveBlue: {
    color: "#1a73e8",
  },
  tabButtonTextActivePurple: {
    color: "#7c3aed",
  },
  invitationBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  invitationBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  section: {
    marginBottom: 20,
  },
  optionsList: {
    gap: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardHeaderInfo: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 20,
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  cardBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  cardBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  cardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginTop: 4,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  // Invitations Styles
  invitationsContainer: {
    gap: 16,
  },
  apartmentGroup: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)",
  },
  apartmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  apartmentIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  apartmentName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
  },
  invitationCountBadge: {
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  invitationCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  invitationCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  invitationCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  invitationCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  invitationCardInfo: {
    flex: 1,
  },
  invitationCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  invitationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  invitationRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  invitationRoleBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  inviterPillSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inviterPillTextSmall: {
    fontSize: 9,
    color: "#475569",
    fontWeight: "500",
  },
  invitationCardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginBottom: 12,
  },
  invitationActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  invitationRejectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  invitationRejectText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  invitationAcceptButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  invitationAcceptText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },

  // Empty State
  emptyStateContainer: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },

  // Step 2 Styles
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)",
  },
  photoSection: {
    alignItems: "center",
    marginVertical: 14,
  },
  photoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#eff6ff",
    borderWidth: 2,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  photoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: -4,
    right: -8,
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  photoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  photoActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 12,
  },
  photoButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  photoButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a73e8",
  },
  removePhotoButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removePhotoText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ef4444",
  },
  inputGroup: {
    marginBottom: 18,
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 7,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.03)",
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    height: "100%",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  clearInput: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "500",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    height: 50,
    marginTop: 6,
    gap: 8,
    boxShadow: "0px 4px 6px rgba(26, 115, 232, 0.25)",
  },
  submitButtonDisabled: {
    backgroundColor: "#93c5fd",
    boxShadow: "none",
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15.5,
    fontWeight: "700",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },

  // Photo Options Modal
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

  // Reject Modal - Centered
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCardCenter: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.15)",
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    gap: 6,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});

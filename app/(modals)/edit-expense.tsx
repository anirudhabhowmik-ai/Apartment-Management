import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DatePickerModal from "../../components/DatePickerModal";
import { usePayments } from "../../hooks/usePayments";
import { BillAttachment } from "../../types/member";
import { PaymentStatus } from "../../types/payment";

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

export default function EditExpenseScreen() {
  const router = useRouter();
  const { accountId, paymentId } = useLocalSearchParams<{
    accountId: string;
    paymentId: string;
  }>();
  const { getPaymentById, editPayment } = usePayments(accountId);
  const payment = getPaymentById(paymentId);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"paid" | "due">("due");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [billAttachments, setBillAttachments] = useState<BillAttachment[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Photo upload states
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setName(payment.description || payment.category);
    setAmount(payment.amount.toString());
    setStatus(payment.status === "paid" ? "paid" : "due");
    setDueDate(payment.dueDate.slice(0, 10));
    setNote(payment.description || "");
    setBillAttachments(payment.billAttachments || []);
  }, [payment]);

  // Photo picker functions - exactly matching AddAccountScreen
  const showPhotoSelectionOptions = () => {
    setShowPhotoOptions(true);
  };

  const takePhoto = async () => {
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
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
    // Add the adjusted photo as a bill attachment
    const newAttachment: BillAttachment = {
      uri: uri,
      name: "Bill image",
      mimeType: "image/jpeg",
    };
    setBillAttachments((currentAttachments) => [
      ...currentAttachments,
      newAttachment,
    ]);
    setShowAdjustModal(false);
    setRawImage(null);
  };

  const handleAdjustCancel = () => {
    setShowAdjustModal(false);
    setRawImage(null);
  };

  const handlePickBill = async () => {
    // Show photo options instead of directly opening gallery
    showPhotoSelectionOptions();
  };

  const handleSave = async () => {
    if (!payment || !amount || Number(amount) <= 0) return;

    await editPayment(payment.id, {
      amount: Number(amount),
      description: note.trim() || name.trim() || undefined,
      status: status as PaymentStatus,
      billAttachments,
      dueDate: dueDate
        ? new Date(`${dueDate}T00:00:00`).toISOString()
        : payment.dueDate,
      paidDate:
        status === "paid"
          ? payment.paidDate || new Date().toISOString()
          : undefined,
    });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>EXPENSE DETAILS</Text>

      <Text style={styles.label}>Expense Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Amount (₹) *</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={amount}
        onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ""))}
      />

      <Text style={styles.label}>Payment Status</Text>
      <View style={styles.statusRow}>
        {(["paid", "due"] as const).map((option) => {
          const selected = status === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.statusButton,
                selected &&
                  (option === "paid" ? styles.statusPaid : styles.statusDue),
              ]}
              onPress={() => setStatus(option)}
            >
              <Ionicons
                name={
                  option === "paid"
                    ? "checkmark-circle-outline"
                    : "time-outline"
                }
                size={18}
                color={
                  selected
                    ? option === "paid"
                      ? "#16803a"
                      : "#d97706"
                    : "#666"
                }
              />
              <Text
                style={[
                  styles.statusText,
                  selected && {
                    color: option === "paid" ? "#16803a" : "#d97706",
                  },
                ]}
              >
                {option === "paid" ? "Paid" : "Due"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Expense Date</Text>
      <TouchableOpacity
        style={styles.dateInput}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateText}>{dueDate}</Text>
        <Ionicons name="calendar-outline" size={19} color="#1a73e8" />
      </TouchableOpacity>

      <Text style={styles.label}>Bill Attachment (optional)</Text>
      {billAttachments.length > 0 && (
        <View style={styles.attachmentList}>
          {billAttachments.map((attachment, index) => (
            <View
              key={`${attachment.uri}-${index}`}
              style={styles.attachmentRow}
            >
              <Ionicons name="image-outline" size={20} color="#1a73e8" />
              <Text style={styles.attachmentName} numberOfLines={1}>
                {attachment.name}
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL(attachment.uri)}>
                <Ionicons name="download-outline" size={20} color="#1a73e8" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setBillAttachments((items) =>
                    items.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Ionicons name="trash-outline" size={20} color="#e53935" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity style={styles.attachButton} onPress={handlePickBill}>
        <Ionicons name="attach-outline" size={20} color="#1a73e8" />
        <Text style={styles.attachButtonText}>
          {billAttachments.length
            ? "Add more attachments"
            : "Add bill attachments"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        multiline
        placeholder="Add a note"
        value={note}
        onChangeText={setNote}
      />

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>Update Expense</Text>
      </TouchableOpacity>

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={setDueDate}
      />

      {/* =========================================================
          PHOTO OPTIONS MODAL - Matches AddAccountScreen exactly
      ========================================================= */}
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

      {/* =========================================================
          PHOTO ADJUST MODAL - Pinch to zoom / drag
      ========================================================= */}
      <PhotoAdjustModal
        visible={showAdjustModal}
        image={rawImage}
        onCancel={handleAdjustCancel}
        onConfirm={handleAdjustConfirm}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", flexGrow: 1, padding: 24 },
  sectionLabel: {
    color: "#1a73e8",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 22,
  },
  label: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderColor: "#ddd",
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    height: 50,
    paddingHorizontal: 14,
  },
  statusRow: { flexDirection: "row", gap: 10 },
  statusButton: {
    alignItems: "center",
    borderColor: "#ddd",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 13,
  },
  statusPaid: { backgroundColor: "#effaf2", borderColor: "#22a553" },
  statusDue: { backgroundColor: "#fff7ed", borderColor: "#f59e0b" },
  statusText: { color: "#555", fontSize: 14, fontWeight: "600" },
  dateInput: {
    alignItems: "center",
    borderColor: "#ddd",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    height: 50,
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  dateText: { color: "#333", fontSize: 15 },
  attachButton: {
    alignItems: "center",
    borderColor: "#7eaff0",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    height: 44,
  },
  attachButtonText: { color: "#1a73e8", fontSize: 14, fontWeight: "600" },
  attachmentList: {
    borderColor: "#e2e9f4",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  attachmentRow: {
    alignItems: "center",
    backgroundColor: "#f8fbff",
    borderBottomColor: "#e2e9f4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachmentName: { color: "#333", flex: 1, fontSize: 14 },
  noteInput: { height: 90, paddingTop: 14, textAlignVertical: "top" },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    marginTop: 30,
    paddingVertical: 15,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // ================================================================
  // PHOTO OPTIONS MODAL - Matches AddAccountScreen
  // ================================================================

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
});

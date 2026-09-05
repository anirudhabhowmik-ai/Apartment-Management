import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { useAccountStore } from "../../store/accountStore";
import { Account } from "../../types";

const COLORS = {
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  background: "#F8FAFC",
  white: "#FFFFFF",

  text: "#0F172A",
  secondary: "#64748B",
  muted: "#94A3B8",

  border: "#E2E8F0",
  borderLight: "#F1F5F9",

  success: "#16A34A",
  successLight: "#F0FDF4",
};

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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AccountSwitcher() {
  const router = useRouter();

  const { accounts, selectedAccount, selectAccount, editAccount } =
    useAccounts();

  const visible = useAccountStore((state: any) => state.isAccountSwitcherOpen);

  const setAccountSwitcherOpen = useAccountStore(
    (state: any) => state.setAccountSwitcherOpen,
  );

  const [editingNameId, setEditingNameId] = useState<string | null>(null);

  const [tempName, setTempName] = useState("");

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [editingPhotoAccountId, setEditingPhotoAccountId] = useState<
    string | null
  >(null);

  const handleSelect = (account: Account) => {
    if (editingNameId) return;

    selectAccount(account.id);
    setAccountSwitcherOpen(false);
  };

  const handleAddNew = () => {
    setAccountSwitcherOpen(false);
    router.push("/(modals)/add-account");
  };

  // Photo picker functions - exactly matching AddAccountScreen
  const showPhotoSelectionOptions = (accountId: string) => {
    setEditingPhotoAccountId(accountId);
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

  const handleAdjustConfirm = async (uri: string) => {
    if (editingPhotoAccountId) {
      try {
        await editAccount(editingPhotoAccountId, {
          photoUri: uri,
        });
      } catch (error) {
        console.error("Failed to update account photo:", error);
      }
    }
    setShowAdjustModal(false);
    setRawImage(null);
    setEditingPhotoAccountId(null);
  };

  const handleAdjustCancel = () => {
    setShowAdjustModal(false);
    setRawImage(null);
    setEditingPhotoAccountId(null);
  };

  const startEditName = (account: Account) => {
    setEditingNameId(account.id);
    setTempName(account.name);
  };

  const cancelEditName = () => {
    setEditingNameId(null);
    setTempName("");
  };

  const saveEditName = async (accountId: string) => {
    const trimmed = tempName.trim();

    if (trimmed) {
      try {
        await editAccount(accountId, {
          name: trimmed,
        });
      } catch (error) {
        console.error("Failed to update account name:", error);
      }
    }

    setEditingNameId(null);
    setTempName("");
  };

  const closeSwitcher = () => {
    cancelEditName();
    setAccountSwitcherOpen(false);
  };

  // ---------------------------------------------------------
  // Selected account information for header
  // ---------------------------------------------------------

  const selectedName = selectedAccount?.name ?? "No Account";

  const selectedType =
    selectedAccount?.type === "apartment"
      ? "Apartment"
      : selectedAccount
        ? "Home"
        : "No Account";

  const selectedIcon =
    selectedAccount?.type === "apartment" ? "business-outline" : "home-outline";

  return (
    <>
      {/* ===================================================== */}
      {/* HEADER ACCOUNT SWITCHER */}
      {/* ===================================================== */}

      <Pressable
        onPress={() => setAccountSwitcherOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.triggerPressed,
        ]}
      >
        {/* Property Avatar */}
        {selectedAccount?.photoUri ? (
          <Image
            source={{
              uri: selectedAccount.photoUri,
            }}
            style={styles.triggerAvatar}
          />
        ) : (
          <View style={styles.triggerAvatarPlaceholder}>
            <Ionicons
              name={selectedAccount?.type === "apartment" ? "business" : "home"}
              size={17}
              color={COLORS.primary}
            />
          </View>
        )}

        {/* Property Name + Type */}
        <View style={styles.triggerInfo}>
          <Text
            style={styles.triggerName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {selectedName}
          </Text>

          <View style={styles.triggerTypeRow}>
            <Ionicons name={selectedIcon} size={11} color={COLORS.secondary} />

            <Text style={styles.triggerType} numberOfLines={1}>
              {selectedType}
            </Text>
          </View>
        </View>

        {/* Dropdown */}
        <View style={styles.triggerChevron}>
          <Ionicons name="chevron-down" size={15} color={COLORS.secondary} />
        </View>
      </Pressable>

      {/* ===================================================== */}
      {/* ACCOUNT MODAL */}
      {/* ===================================================== */}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={closeSwitcher}
      >
        <View style={styles.modalContainer}>
          {/* Background Overlay */}
          <Pressable style={styles.overlay} onPress={closeSwitcher} />

          {/* Bottom Sheet */}
          <View style={styles.sheet}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Switch Account</Text>

                <Text style={styles.sheetSubtitle}>
                  Select a property to manage
                </Text>
              </View>

              <Pressable
                onPress={closeSwitcher}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
              >
                <Ionicons name="close" size={21} color={COLORS.text} />
              </Pressable>
            </View>

            {/* Account Count */}
            {accounts.length > 0 && (
              <View style={styles.accountCountRow}>
                <Text style={styles.accountCountLabel}>Your accounts</Text>

                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{accounts.length}</Text>
                </View>
              </View>
            )}

            {/* ================================================= */}
            {/* ACCOUNT LIST */}
            {/* ================================================= */}

            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={
                accounts.length === 0
                  ? styles.emptyListContent
                  : styles.listContent
              }
              renderItem={({ item }) => {
                const isSelected = item.id === selectedAccount?.id;

                const isEditingName = editingNameId === item.id;

                return (
                  <View
                    style={[
                      styles.accountCard,
                      isSelected && styles.accountCardSelected,
                    ]}
                  >
                    {/* Property Avatar */}
                    <View style={styles.avatarWrapper}>
                      <Pressable
                        onPress={() => handleSelect(item)}
                        style={({ pressed }) => [
                          pressed && styles.avatarPressed,
                        ]}
                      >
                        {item.photoUri ? (
                          <Image
                            source={{
                              uri: item.photoUri,
                            }}
                            style={styles.itemAvatar}
                          />
                        ) : (
                          <View style={styles.itemAvatarPlaceholder}>
                            <Ionicons
                              name={
                                item.type === "apartment" ? "business" : "home"
                              }
                              size={21}
                              color={COLORS.primary}
                            />
                          </View>
                        )}
                      </Pressable>

                      {/* Camera - Now shows photo options modal */}
                      <Pressable
                        onPress={() => showPhotoSelectionOptions(item.id)}
                        style={({ pressed }) => [
                          styles.cameraBadge,
                          pressed && styles.cameraBadgePressed,
                        ]}
                      >
                        <Ionicons
                          name="camera"
                          size={11}
                          color={COLORS.white}
                        />
                      </Pressable>
                    </View>

                    {/* Property Information */}
                    <View style={styles.accountDetails}>
                      {isEditingName ? (
                        <View style={styles.editContainer}>
                          <TextInput
                            style={styles.nameInput}
                            value={tempName}
                            onChangeText={setTempName}
                            autoFocus
                            selectTextOnFocus
                            returnKeyType="done"
                            onSubmitEditing={() => saveEditName(item.id)}
                            {...(Platform.OS === "web"
                              ? ({
                                  outlineStyle: "none",
                                } as any)
                              : {})}
                          />

                          <Pressable
                            onPress={() => saveEditName(item.id)}
                            style={({ pressed }) => [
                              styles.saveButton,
                              pressed && styles.saveButtonPressed,
                            ]}
                          >
                            <Ionicons
                              name="checkmark"
                              size={17}
                              color={COLORS.white}
                            />
                          </Pressable>

                          <Pressable
                            onPress={cancelEditName}
                            style={({ pressed }) => [
                              styles.cancelButton,
                              pressed && styles.cancelButtonPressed,
                            ]}
                          >
                            <Ionicons
                              name="close"
                              size={16}
                              color={COLORS.secondary}
                            />
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          {/* Name */}
                          <View style={styles.nameRow}>
                            <Pressable
                              onPress={() => handleSelect(item)}
                              style={styles.namePressable}
                            >
                              <Text style={styles.itemName} numberOfLines={1}>
                                {item.name}
                              </Text>
                            </Pressable>

                            {/* Edit */}
                            <Pressable
                              onPress={() => startEditName(item)}
                              style={({ pressed }) => [
                                styles.editButton,
                                pressed && styles.editButtonPressed,
                              ]}
                            >
                              <Ionicons
                                name="pencil-outline"
                                size={14}
                                color={COLORS.secondary}
                              />
                            </Pressable>
                          </View>

                          {/* Type */}
                          <Pressable
                            onPress={() => handleSelect(item)}
                            style={styles.typePressable}
                          >
                            <Ionicons
                              name={
                                item.type === "apartment"
                                  ? "business-outline"
                                  : "home-outline"
                              }
                              size={13}
                              color={COLORS.secondary}
                            />

                            <Text style={styles.itemType}>
                              {item.type === "apartment" ? "Apartment" : "Home"}
                            </Text>

                            {isSelected && (
                              <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>
                                  Current
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        </>
                      )}
                    </View>

                    {/* Radio */}
                    {!isEditingName && (
                      <Pressable
                        onPress={() => handleSelect(item)}
                        style={styles.selectionButton}
                      >
                        <View
                          style={[
                            styles.radioOuter,
                            isSelected && styles.radioOuterSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </Pressable>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="business-outline"
                      size={36}
                      color={COLORS.primary}
                    />
                  </View>

                  <Text style={styles.emptyTitle}>No accounts yet</Text>

                  <Text style={styles.emptySubtitle}>
                    Add your first apartment or home property to get started.
                  </Text>
                </View>
              }
            />

            {/* ================================================= */}
            {/* JOIN WITH NEW PROPERTY */}
            {/* ================================================= */}

            <Pressable
              onPress={handleAddNew}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.addButtonPressed,
              ]}
            >
              <View style={styles.addIconContainer}>
                <Ionicons name="add" size={21} color={COLORS.primary} />
              </View>

              <View style={styles.addTextContainer}>
                <Text style={styles.addButtonTitle}>
                  Join With New Property
                </Text>

                <Text style={styles.addButtonSubtitle}>
                  Create or join another property
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
            </Pressable>
          </View>
        </View>
      </Modal>

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
    </>
  );
}

const styles = StyleSheet.create({
  // =========================================================
  // Header Trigger
  // =========================================================

  trigger: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    maxWidth: 280,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
  },

  triggerPressed: {
    opacity: 0.7,
    backgroundColor: COLORS.background,
  },

  triggerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },

  triggerAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginRight: 8,
  },

  triggerInfo: {
    flexShrink: 1,
    minWidth: 0,
    marginRight: 5,
  },

  triggerName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.text,
  },

  triggerTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
    gap: 4,
  },

  triggerType: {
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.secondary,
  },

  triggerChevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },

  // =========================================================
  // Modal
  // =========================================================

  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },

  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "78%",
  },

  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: 17,
  },

  // =========================================================
  // Sheet Header
  // =========================================================

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  sheetHeaderText: {
    flex: 1,
  },

  sheetTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: COLORS.text,
  },

  sheetSubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 4,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginLeft: 12,
  },

  closeButtonPressed: {
    opacity: 0.6,
  },

  // =========================================================
  // Count
  // =========================================================

  accountCountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  accountCountLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  countBadge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginLeft: 7,
  },

  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },

  listContent: {
    paddingBottom: 8,
  },

  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  // =========================================================
  // Account Card
  // =========================================================

  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },

  accountCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },

  // =========================================================
  // Avatar
  // =========================================================

  avatarWrapper: {
    position: "relative",
    marginRight: 12,
  },

  itemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
  },

  itemAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
  },

  avatarPressed: {
    opacity: 0.7,
  },

  cameraBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  cameraBadgePressed: {
    opacity: 0.7,
  },

  // =========================================================
  // Account Details
  // =========================================================

  accountDetails: {
    flex: 1,
    minWidth: 0,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  namePressable: {
    flex: 1,
    minWidth: 0,
  },

  itemName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },

  editButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginLeft: 6,
  },

  editButtonPressed: {
    opacity: 0.6,
  },

  typePressable: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  itemType: {
    fontSize: 12,
    color: COLORS.secondary,
    marginLeft: 5,
  },

  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: COLORS.successLight,
    marginLeft: 8,
  },

  currentBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.success,
  },

  // =========================================================
  // Selection
  // =========================================================

  selectionButton: {
    width: 32,
    height: 48,
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 6,
  },

  radioOuter: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: COLORS.primary,
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },

  // =========================================================
  // Edit Name
  // =========================================================

  editContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 38,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },

  saveButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    marginLeft: 6,
  },

  saveButtonPressed: {
    opacity: 0.7,
  },

  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginLeft: 5,
  },

  cancelButtonPressed: {
    opacity: 0.6,
  },

  // =========================================================
  // Empty State
  // =========================================================

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingVertical: 30,
  },

  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 7,
  },

  emptySubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.secondary,
    textAlign: "center",
    maxWidth: 280,
  },

  // =========================================================
  // Join With New Property
  // =========================================================

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: COLORS.white,
    marginTop: 4,
  },

  addButtonPressed: {
    opacity: 0.7,
    backgroundColor: COLORS.primaryLight,
  },

  addIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginRight: 12,
  },

  addTextContainer: {
    flex: 1,
  },

  addButtonTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },

  addButtonSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 3,
  },

  // =========================================================
  // PHOTO OPTIONS MODAL - Matches AddAccountScreen
  // =========================================================

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

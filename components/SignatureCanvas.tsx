import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  GestureResponderEvent,
  Image,
  PanResponder,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { SignatureData } from "../store/billStore";

// ---------------------------------------------------------------------------
// FIX FOR "draw sometimes works, sometimes doesn't / canvas not full":
//
// Root cause: the previous version converted touches to canvas-local
// coordinates using `measureInWindow()` (async) to get the canvas's screen
// position, then subtracted that from `pageX/pageY`. This overlay slides/
// fades in, so `measureInWindow` can resolve AFTER the user has already
// started drawing - meaning the very first touches (or all of them, if the
// callback is slow on that device) used a stale or zeroed origin. That
// produced strokes drawn at the wrong offset, or nothing appearing at all,
// which looks exactly like "canvas isn't full" / "works sometimes".
//
// Fix: use `evt.nativeEvent.locationX/locationY` instead. RN computes these
// natively, already relative to the exact View the touch landed on - no
// manual origin math, no measurement race, no dependency on animation
// timing. This is the standard, reliable way to get in-view touch
// coordinates for a drawing surface.
//
// Also added: the "Capture" responder handlers (onStartShouldSetPanResponder
// Capture / onMoveShouldSetPanResponderCapture) that the crop gesture below
// already had but the draw gesture was missing - without them, a parent
// view can sometimes claim the touch before it reaches the draw canvas,
// which is another way strokes could silently fail to start.
// ---------------------------------------------------------------------------

const CANVAS_HEIGHT = 200;
const STROKE_COLOR = "#0f172a";
const STROKE_WIDTH = 3;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CROP_VIEWPORT_W = Math.min(SCREEN_WIDTH - 80, 320);
const CROP_VIEWPORT_H = Math.round(CROP_VIEWPORT_W / 2.6);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface Point {
  x: number;
  y: number;
}

interface RawImage {
  uri: string;
  width: number;
  height: number;
}

interface SignatureCanvasProps {
  visible: boolean;
  onSave: (signature: SignatureData) => void;
  onCancel: () => void;
  existingSign?: SignatureData;
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++)
    d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

function getTouchDistance(touches: any[]) {
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function SignatureCanvas({
  visible,
  onSave,
  onCancel,
  existingSign,
}: SignatureCanvasProps) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploadStage, setUploadStage] = useState<"pick" | "crop">("pick");

  // ----- Draw state -----
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [canvasSize, setCanvasSize] = useState({
    width: 0,
    height: CANVAS_HEIGHT,
  });
  const [drawError, setDrawError] = useState("");
  const currentStrokeRef = useRef<Point[]>([]);
  const canvasBoxRef = useRef<View>(null);

  // ----- Upload / crop state -----
  const [pickError, setPickError] = useState("");
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [transparentBg, setTransparentBg] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropTranslate, setCropTranslate] = useState({ x: 0, y: 0 });
  const [processingCrop, setProcessingCrop] = useState(false);
  const [cropError, setCropError] = useState("");

  const resetAll = () => {
    setMode("draw");
    setUploadStage("pick");
    setStrokes([]);
    currentStrokeRef.current = [];
    setDrawError("");
    setPickError("");
    setRawImage(null);
    setTransparentBg(false);
    setCropZoom(1);
    setCropTranslate({ x: 0, y: 0 });
    setCropError("");
  };

  // Reset only on the hidden -> visible transition, inside a proper effect
  // (not render-phase), so it can never fire mid-drawing from an unrelated
  // re-render.
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      resetAll();
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  // ------------------------------------------------------------------
  // Draw tab
  // ------------------------------------------------------------------
  const drawPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        // locationX/Y are already relative to THIS view - no measurement,
        // no race condition, correct from the very first touch every time.
        const { locationX, locationY } = evt.nativeEvent;
        const point = { x: locationX, y: locationY };
        currentStrokeRef.current = [point];
        setStrokes((prev) => [...prev, [point]]);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        const point = { x: locationX, y: locationY };
        currentStrokeRef.current = [...currentStrokeRef.current, point];
        setStrokes((prev) => {
          const next = [...prev];
          next[next.length - 1] = currentStrokeRef.current;
          return next;
        });
      },
      onPanResponderRelease: () => {
        currentStrokeRef.current = [];
      },
      onPanResponderTerminate: () => {
        currentStrokeRef.current = [];
      },
    }),
  ).current;

  const hasDrawing = strokes.some((s) => s.length > 0);
  const drawPathData = strokes.map((s) => pointsToPath(s)).filter(Boolean);

  const handleUndo = () => setStrokes((prev) => prev.slice(0, -1));
  const handleClear = () => {
    setStrokes([]);
    currentStrokeRef.current = [];
    setDrawError("");
  };

  const handleSaveDrawing = () => {
    if (!hasDrawing) {
      setDrawError("Please draw your signature first");
      return;
    }
    if (canvasSize.width <= 0) {
      setDrawError("Still preparing the canvas, please try again");
      return;
    }
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}">${drawPathData
      .map(
        (d) =>
          `<path d="${d}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("")}</svg>`;

    onSave({
      type: "svg",
      svgMarkup,
      width: canvasSize.width,
      height: canvasSize.height,
    });
  };

  // ------------------------------------------------------------------
  // Upload tab: pick stage (Take Photo / Choose from Gallery)
  // ------------------------------------------------------------------
  const handleTakePhoto = async () => {
    setPickError("");
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPickError("Permission to access camera is required");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setRawImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
        setCropZoom(1);
        setCropTranslate({ x: 0, y: 0 });
        setUploadStage("crop");
      }
    } catch (err: any) {
      console.error("Camera capture failed:", err);
      setPickError(
        `Couldn't open the camera (${err?.message ?? "unknown error"}).`,
      );
    }
  };

  const handleChooseGallery = async () => {
    setPickError("");
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPickError("Permission to access photos is required");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setRawImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
        setCropZoom(1);
        setCropTranslate({ x: 0, y: 0 });
        setUploadStage("crop");
      }
    } catch (err: any) {
      console.error("Gallery pick failed:", err);
      setPickError(
        `Couldn't open the gallery (${err?.message ?? "unknown error"}).`,
      );
    }
  };

  // ------------------------------------------------------------------
  // Upload tab: crop stage - pinch-to-zoom, drag-to-reposition, then
  // "Transparent Background" toggle applied at PDF-render time.
  // ------------------------------------------------------------------
  const baseScale = rawImage
    ? Math.max(
        CROP_VIEWPORT_W / rawImage.width,
        CROP_VIEWPORT_H / rawImage.height,
      )
    : 1;
  const effectiveScale = baseScale * cropZoom;
  const displayWidth = (rawImage?.width ?? 0) * effectiveScale;
  const displayHeight = (rawImage?.height ?? 0) * effectiveScale;

  const zoomRef = useRef(cropZoom);
  const translateRef = useRef(cropTranslate);
  const imageRef = useRef(rawImage);
  const baseScaleRef = useRef(baseScale);
  zoomRef.current = cropZoom;
  translateRef.current = cropTranslate;
  imageRef.current = rawImage;
  baseScaleRef.current = baseScale;

  const clampTranslateFromRefs = (
    t: { x: number; y: number },
    zoom: number,
  ) => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };
    const scale = baseScaleRef.current * zoom;
    const dW = img.width * scale;
    const dH = img.height * scale;
    const maxX = Math.max(0, (dW - CROP_VIEWPORT_W) / 2);
    const maxY = Math.max(0, (dH - CROP_VIEWPORT_H) / 2);
    return {
      x: clampNumber(t.x, -maxX, maxX),
      y: clampNumber(t.y, -maxY, maxY),
    };
  };

  type CropGesture =
    | {
        mode: "pinch";
        touchIds: [number, number];
        startDistance: number;
        startZoom: number;
      }
    | {
        mode: "pan";
        touchId: number;
        startTouch: Point;
        startTranslate: Point;
      };

  const cropGestureRef = useRef<CropGesture | null>(null);

  const sortedTouches = (touches: any[]) =>
    [...touches]
      .map((t) => ({
        identifier: t.identifier as number,
        pageX: t.pageX,
        pageY: t.pageY,
      }))
      .sort((a, b) => a.identifier - b.identifier);

  const beginCropGesture = (touches: any[]) => {
    const pts = sortedTouches(touches);
    if (pts.length >= 2) {
      const [a, b] = pts;
      cropGestureRef.current = {
        mode: "pinch",
        touchIds: [a.identifier, b.identifier],
        startDistance: getTouchDistance(pts as any),
        startZoom: zoomRef.current,
      };
    } else if (pts.length === 1) {
      cropGestureRef.current = {
        mode: "pan",
        touchId: pts[0].identifier,
        startTouch: { x: pts[0].pageX, y: pts[0].pageY },
        startTranslate: { ...translateRef.current },
      };
    } else {
      cropGestureRef.current = null;
    }
  };

  const cropPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) =>
        beginCropGesture(evt.nativeEvent.touches),
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        const g = cropGestureRef.current;
        const expected = g?.mode === "pinch" ? 2 : g?.mode === "pan" ? 1 : 0;
        if (touches.length > 0 && touches.length !== expected)
          beginCropGesture(touches);

        const gesture = cropGestureRef.current;
        if (!gesture) return;

        if (gesture.mode === "pinch" && touches.length >= 2) {
          const sorted = sortedTouches(touches);
          const tracked = sorted.filter((p) =>
            gesture.touchIds.includes(p.identifier),
          );
          const [a, b] = tracked.length >= 2 ? tracked : sorted.slice(0, 2);
          const distance = getTouchDistance([a, b] as any);
          if (gesture.startDistance > 0) {
            const nextZoom = clampNumber(
              gesture.startZoom * (distance / gesture.startDistance),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            zoomRef.current = nextZoom;
            setCropZoom(nextZoom);
          }
        } else if (gesture.mode === "pan" && touches.length === 1) {
          const touch = touches[0];
          const dx = touch.pageX - gesture.startTouch.x;
          const dy = touch.pageY - gesture.startTouch.y;
          const next = clampTranslateFromRefs(
            {
              x: gesture.startTranslate.x + dx,
              y: gesture.startTranslate.y + dy,
            },
            zoomRef.current,
          );
          translateRef.current = next;
          setCropTranslate(next);
        }
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const remaining = evt.nativeEvent.touches;
        if (remaining.length > 0) beginCropGesture(remaining);
        else cropGestureRef.current = null;
        const clamped = clampTranslateFromRefs(
          translateRef.current,
          zoomRef.current,
        );
        translateRef.current = clamped;
        setCropTranslate(clamped);
      },
      onPanResponderTerminate: () => {
        cropGestureRef.current = null;
      },
    }),
  ).current;

  const handleRetake = () => {
    setRawImage(null);
    setUploadStage("pick");
    setCropError("");
  };

  const handleConfirmCrop = async () => {
    if (!rawImage) return;
    setCropError("");
    setProcessingCrop(true);
    try {
      const scale = baseScale * cropZoom;
      const cropW = CROP_VIEWPORT_W / scale;
      const cropH = CROP_VIEWPORT_H / scale;

      let originX =
        rawImage.width / 2 -
        CROP_VIEWPORT_W / (2 * scale) -
        cropTranslate.x / scale;
      let originY =
        rawImage.height / 2 -
        CROP_VIEWPORT_H / (2 * scale) -
        cropTranslate.y / scale;

      originX = clampNumber(originX, 0, Math.max(0, rawImage.width - cropW));
      originY = clampNumber(originY, 0, Math.max(0, rawImage.height - cropH));

      const result = await ImageManipulator.manipulateAsync(
        rawImage.uri,
        [
          { crop: { originX, originY, width: cropW, height: cropH } },
          { resize: { width: 900 } },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.PNG },
      );

      onSave({ type: "image", uri: result.uri, transparentBg });
    } catch (err: any) {
      console.error("Signature crop failed:", err);
      setCropError(
        `Couldn't process the image (${err?.message ?? "unknown error"}). Please try again.`,
      );
    } finally {
      setProcessingCrop(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={sigStyles.overlay}>
      <View style={sigStyles.backdrop}>
        <View style={sigStyles.card}>
          <Text style={sigStyles.title}>Secretary Signature</Text>
          <Text style={sigStyles.subtitle}>
            Appears on every generated bill
          </Text>

          <View style={sigStyles.modeSwitcher}>
            <TouchableOpacity
              style={[
                sigStyles.modeButton,
                mode === "draw" && sigStyles.modeButtonActive,
              ]}
              onPress={() => setMode("draw")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="create-outline"
                size={15}
                color={mode === "draw" ? "#1a73e8" : "#94a3b8"}
              />
              <Text
                style={[
                  sigStyles.modeButtonText,
                  mode === "draw" && sigStyles.modeButtonTextActive,
                ]}
              >
                Draw
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                sigStyles.modeButton,
                mode === "upload" && sigStyles.modeButtonActive,
              ]}
              onPress={() => setMode("upload")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="image-outline"
                size={15}
                color={mode === "upload" ? "#1a73e8" : "#94a3b8"}
              />
              <Text
                style={[
                  sigStyles.modeButtonText,
                  mode === "upload" && sigStyles.modeButtonTextActive,
                ]}
              >
                Upload
              </Text>
            </TouchableOpacity>
          </View>

          {mode === "draw" && (
            <>
              <View
                ref={canvasBoxRef}
                style={sigStyles.canvasBox}
                collapsable={false}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  setCanvasSize({ width, height });
                }}
                {...drawPanResponder.panHandlers}
              >
                {!hasDrawing && existingSign && (
                  <View style={sigStyles.existingHint} pointerEvents="none">
                    <Text style={sigStyles.existingHintText}>
                      Draw over this box to replace the saved signature
                    </Text>
                  </View>
                )}
                <Svg
                  width="100%"
                  height={CANVAS_HEIGHT}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                >
                  {drawPathData.map((d, i) => (
                    <Path
                      key={i}
                      d={d}
                      stroke={STROKE_COLOR}
                      strokeWidth={STROKE_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
                </Svg>
                {!hasDrawing && (
                  <View
                    style={sigStyles.placeholderLine}
                    pointerEvents="none"
                  />
                )}
              </View>

              {drawError ? (
                <View style={sigStyles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#dc2626" />
                  <Text style={sigStyles.errorText}>{drawError}</Text>
                </View>
              ) : (
                <Text style={sigStyles.hintText}>
                  Sign above the line, then tap Save
                </Text>
              )}

              <View style={sigStyles.toolRow}>
                <TouchableOpacity
                  style={sigStyles.toolButton}
                  onPress={handleUndo}
                  disabled={strokes.length === 0}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="arrow-undo"
                    size={15}
                    color={strokes.length === 0 ? "#cbd5e1" : "#475569"}
                  />
                  <Text
                    style={[
                      sigStyles.toolButtonText,
                      strokes.length === 0 && { color: "#cbd5e1" },
                    ]}
                  >
                    Undo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sigStyles.toolButton}
                  onPress={handleClear}
                  disabled={!hasDrawing}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="refresh"
                    size={15}
                    color={!hasDrawing ? "#cbd5e1" : "#475569"}
                  />
                  <Text
                    style={[
                      sigStyles.toolButtonText,
                      !hasDrawing && { color: "#cbd5e1" },
                    ]}
                  >
                    Clear
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={sigStyles.actionRow}>
                <TouchableOpacity
                  style={sigStyles.cancelButton}
                  onPress={onCancel}
                  activeOpacity={0.8}
                >
                  <Text style={sigStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    sigStyles.saveButton,
                    !hasDrawing && sigStyles.saveButtonDisabled,
                  ]}
                  onPress={handleSaveDrawing}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={sigStyles.saveText}>Save Signature</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {mode === "upload" && uploadStage === "pick" && (
            <>
              <TouchableOpacity
                style={sigStyles.uploadOption}
                onPress={handleTakePhoto}
                activeOpacity={0.8}
              >
                <View style={sigStyles.uploadOptionIcon}>
                  <Ionicons name="camera" size={22} color="#1a73e8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sigStyles.uploadOptionTitle}>Take a Photo</Text>
                  <Text style={sigStyles.uploadOptionSubtitle}>
                    Capture the signature with your camera
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>

              <TouchableOpacity
                style={sigStyles.uploadOption}
                onPress={handleChooseGallery}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    sigStyles.uploadOptionIcon,
                    { backgroundColor: "#ecfdf5" },
                  ]}
                >
                  <Ionicons name="images" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sigStyles.uploadOptionTitle}>
                    Choose from Gallery
                  </Text>
                  <Text style={sigStyles.uploadOptionSubtitle}>
                    Select an existing signature image
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>

              {pickError ? (
                <View style={sigStyles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#dc2626" />
                  <Text style={sigStyles.errorText}>{pickError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={sigStyles.cancelButtonFull}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={sigStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === "upload" && uploadStage === "crop" && rawImage && (
            <>
              <View style={sigStyles.cropViewportWrapper}>
                <View
                  style={[
                    sigStyles.cropViewport,
                    { width: CROP_VIEWPORT_W, height: CROP_VIEWPORT_H },
                  ]}
                  {...cropPanResponder.panHandlers}
                >
                  <Image
                    source={{ uri: rawImage.uri }}
                    style={{
                      position: "absolute",
                      width: displayWidth,
                      height: displayHeight,
                      left:
                        CROP_VIEWPORT_W / 2 -
                        displayWidth / 2 +
                        cropTranslate.x,
                      top:
                        CROP_VIEWPORT_H / 2 -
                        displayHeight / 2 +
                        cropTranslate.y,
                    }}
                    resizeMode="cover"
                  />
                  <View
                    style={sigStyles.cropGuideBorder}
                    pointerEvents="none"
                  />
                </View>
              </View>
              <Text style={sigStyles.hintText}>
                Pinch with two fingers to zoom • Drag to reposition
              </Text>

              <View style={sigStyles.transparentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={sigStyles.transparentLabel}>
                    Transparent Background
                  </Text>
                  <Text style={sigStyles.transparentSubtext}>
                    Blends a white background into the bill so only the ink
                    shows
                  </Text>
                </View>
                <Switch
                  value={transparentBg}
                  onValueChange={setTransparentBg}
                  trackColor={{ false: "#e2e8f0", true: "#93c5fd" }}
                  thumbColor={transparentBg ? "#1a73e8" : "#f4f4f5"}
                />
              </View>

              {cropError ? (
                <View style={sigStyles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#dc2626" />
                  <Text style={sigStyles.errorText}>{cropError}</Text>
                </View>
              ) : null}

              <View style={sigStyles.actionRow}>
                <TouchableOpacity
                  style={sigStyles.cancelButton}
                  onPress={handleRetake}
                  activeOpacity={0.8}
                  disabled={processingCrop}
                >
                  <Text style={sigStyles.cancelText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sigStyles.saveButton}
                  onPress={handleConfirmCrop}
                  activeOpacity={0.85}
                  disabled={processingCrop}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={sigStyles.saveText}>
                    {processingCrop ? "Saving..." : "Use This Signature"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const sigStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 20,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    width: "100%",
    maxWidth: 440,
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  subtitle: {
    fontSize: 12.5,
    color: "#64748b",
    marginTop: 2,
    marginBottom: 14,
  },

  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  modeButtonActive: {
    backgroundColor: "#ffffff",
    boxShadow: "0px 1px 3px rgba(0,0,0,0.06)",
  },
  modeButtonText: { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  modeButtonTextActive: { color: "#1a73e8" },

  canvasBox: {
    width: "100%",
    height: CANVAS_HEIGHT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    position: "relative",
  },
  existingHint: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  existingHintText: { fontSize: 11, color: "#94a3b8", fontStyle: "italic" },
  placeholderLine: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 36,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  hintText: {
    fontSize: 11.5,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  errorText: { fontSize: 12, color: "#dc2626", fontWeight: "600", flex: 1 },

  toolRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 12,
  },
  toolButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  toolButtonText: { fontSize: 13, fontWeight: "600", color: "#475569" },

  uploadOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    marginBottom: 10,
  },
  uploadOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadOptionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  uploadOptionSubtitle: { fontSize: 11.5, color: "#64748b", marginTop: 1 },
  cancelButtonFull: {
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },

  cropViewportWrapper: { alignItems: "center", justifyContent: "center" },
  cropViewport: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  cropGuideBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 12,
  },

  transparentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  transparentLabel: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  transparentSubtext: { fontSize: 11, color: "#64748b", marginTop: 2 },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
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
  saveButton: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#1a73e8",
  },
  saveButtonDisabled: { backgroundColor: "#93c5fd" },
  saveText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
});

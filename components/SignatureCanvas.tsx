import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Draw canvas now spans nearly the full device width (card padding is
// reduced specifically for this step - see cardDrawMode below) and is
// taller, so it behaves like a real signing surface rather than a small box.
const CANVAS_HEIGHT = Math.min(SCREEN_HEIGHT * 0.42, 420);

const CROP_VIEWPORT_W = Math.min(SCREEN_WIDTH - 80, 320);
const CROP_VIEWPORT_H = Math.round(CROP_VIEWPORT_W / 2.6);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const MIN_CROP_SIZE = 40;

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

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

function getImageDimensions(
  uri: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}

export default function SignatureCanvas({
  visible,
  onSave,
  onCancel,
  existingSign,
}: SignatureCanvasProps) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploadStage, setUploadStage] = useState<"pick" | "loading" | "crop">(
    "pick",
  );
  // false = "Adjust Photo" mode (pinch/drag the image). true = "Crop" mode
  // (resize/move the crop rectangle). Only one of these can ever be active
  // for touches at a time - see the two PanResponders below.
  const [isCropMode, setIsCropMode] = useState(false);

  // ----- Draw state -----
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [canvasSize, setCanvasSize] = useState({
    width: 0,
    height: CANVAS_HEIGHT,
  });
  const [drawError, setDrawError] = useState("");
  const currentStrokeRef = useRef<Point[]>([]);

  // ----- Upload / crop state -----
  const [pickError, setPickError] = useState("");
  const [rawImage, setRawImage] = useState<RawImage | null>(null);
  const [transparentBg, setTransparentBg] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropTranslate, setCropTranslate] = useState({ x: 0, y: 0 });
  const [processingCrop, setProcessingCrop] = useState(false);
  const [cropError, setCropError] = useState("");

  // Crop rectangle (in crop-viewport-local coordinates)
  const [cropRect, setCropRect] = useState<CropRect>({
    x: 0,
    y: 0,
    width: CROP_VIEWPORT_W * 0.7,
    height: CROP_VIEWPORT_H * 0.7,
  });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartRect, setDragStartRect] = useState<CropRect | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

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
    setIsCropMode(false);
    setCropRect({
      x: 0,
      y: 0,
      width: CROP_VIEWPORT_W * 0.7,
      height: CROP_VIEWPORT_H * 0.7,
    });
    setIsDraggingCrop(false);
    setIsResizing(false);
  };

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      resetAll();
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (rawImage && uploadStage === "crop") {
      const cropW = Math.min(CROP_VIEWPORT_W * 0.7, rawImage.width * 0.8);
      const cropH = Math.min(CROP_VIEWPORT_H * 0.7, rawImage.height * 0.8);
      setCropRect({
        x: (CROP_VIEWPORT_W - cropW) / 2,
        y: (CROP_VIEWPORT_H - cropH) / 2,
        width: cropW,
        height: cropH,
      });
    }
  }, [rawImage, uploadStage]);

  // ------------------------------------------------------------------
  // Draw tab - raw responder system
  // ------------------------------------------------------------------
  const handleDrawStart = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const point = { x: locationX, y: locationY };
    currentStrokeRef.current = [point];
    setStrokes((prev) => [...prev, [point]]);
  };

  const handleDrawMove = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const point = { x: locationX, y: locationY };
    currentStrokeRef.current = [...currentStrokeRef.current, point];
    setStrokes((prev) => {
      const next = [...prev];
      next[next.length - 1] = currentStrokeRef.current;
      return next;
    });
  };

  const handleDrawEnd = () => {
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = [];
    if (finished.length > 0) {
      setStrokes((prev) => {
        const next = [...prev];
        if (next.length > 0) next[next.length - 1] = finished;
        return next;
      });
    }
  };

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
          `<path d="${d}" stroke="#0f172a" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
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
  // Upload tab: pick stage
  // ------------------------------------------------------------------
  const proceedToCrop = async (
    uri: string,
    pickerWidth?: number,
    pickerHeight?: number,
  ) => {
    setUploadStage("loading");
    setPickError("");
    try {
      let width = pickerWidth ?? 0;
      let height = pickerHeight ?? 0;

      if (!width || !height) {
        const measured = await getImageDimensions(uri);
        width = measured.width;
        height = measured.height;
      }

      if (!width || !height) {
        throw new Error("Could not read image dimensions");
      }

      setRawImage({ uri, width, height });
      setCropZoom(1);
      setCropTranslate({ x: 0, y: 0 });
      setIsCropMode(false);
      setUploadStage("crop");
    } catch (err: any) {
      console.error("Failed to prepare image for cropping:", err);
      setPickError(
        `Couldn't load that image (${err?.message ?? "unknown error"}). Please try a different photo.`,
      );
      setUploadStage("pick");
    }
  };

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
        await proceedToCrop(asset.uri, asset.width, asset.height);
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
        await proceedToCrop(asset.uri, asset.width, asset.height);
      }
    } catch (err: any) {
      console.error("Gallery pick failed:", err);
      setPickError(
        `Couldn't open the gallery (${err?.message ?? "unknown error"}).`,
      );
    }
  };

  // ------------------------------------------------------------------
  // Adjust-photo (pinch/drag) responder - only active when isCropMode is
  // false. When isCropMode is true, this responder never claims the
  // gesture, so the photo is fully locked in place while cropping.
  // ------------------------------------------------------------------
  const baseScale =
    rawImage && rawImage.width > 0 && rawImage.height > 0
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
  const isCropModeRef = useRef(isCropMode);
  zoomRef.current = cropZoom;
  translateRef.current = cropTranslate;
  imageRef.current = rawImage;
  baseScaleRef.current = baseScale;
  isCropModeRef.current = isCropMode;

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

  type AdjustGesture =
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

  const adjustGestureRef = useRef<AdjustGesture | null>(null);

  const sortedTouches = (touches: any[]) =>
    [...touches]
      .map((t) => ({
        identifier: t.identifier as number,
        pageX: t.pageX,
        pageY: t.pageY,
      }))
      .sort((a, b) => a.identifier - b.identifier);

  const beginAdjustGesture = (touches: any[]) => {
    const pts = sortedTouches(touches);
    if (pts.length >= 2) {
      const [a, b] = pts;
      adjustGestureRef.current = {
        mode: "pinch",
        touchIds: [a.identifier, b.identifier],
        startDistance: getTouchDistance(pts as any),
        startZoom: zoomRef.current,
      };
    } else if (pts.length === 1) {
      adjustGestureRef.current = {
        mode: "pan",
        touchId: pts[0].identifier,
        startTouch: { x: pts[0].pageX, y: pts[0].pageY },
        startTranslate: { ...translateRef.current },
      };
    } else {
      adjustGestureRef.current = null;
    }
  };

  const imagePanResponder = useRef(
    PanResponder.create({
      // These gate on the LIVE ref, not the closed-over `isCropMode` value,
      // so flipping the toggle mid-session is respected immediately without
      // needing to recreate the responder.
      onStartShouldSetPanResponder: () => !isCropModeRef.current,
      onStartShouldSetPanResponderCapture: () => !isCropModeRef.current,
      onMoveShouldSetPanResponder: () => !isCropModeRef.current,
      onMoveShouldSetPanResponderCapture: () => !isCropModeRef.current,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (isCropModeRef.current) return;
        beginAdjustGesture(evt.nativeEvent.touches);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (isCropModeRef.current) return;
        const touches = evt.nativeEvent.touches;
        const g = adjustGestureRef.current;
        const expected = g?.mode === "pinch" ? 2 : g?.mode === "pan" ? 1 : 0;
        if (touches.length > 0 && touches.length !== expected)
          beginAdjustGesture(touches);

        const gesture = adjustGestureRef.current;
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
        if (isCropModeRef.current) return;
        const remaining = evt.nativeEvent.touches;
        if (remaining.length > 0) beginAdjustGesture(remaining);
        else adjustGestureRef.current = null;
        const clamped = clampTranslateFromRefs(
          translateRef.current,
          zoomRef.current,
        );
        translateRef.current = clamped;
        setCropTranslate(clamped);
      },
      onPanResponderTerminate: () => {
        adjustGestureRef.current = null;
      },
    }),
  ).current;

  // ------------------------------------------------------------------
  // Crop-box responder - only active when isCropMode is true. Resizes or
  // moves the crop rectangle; never touches the image's zoom/position.
  // ------------------------------------------------------------------
  const cropRectRef = useRef(cropRect);
  cropRectRef.current = cropRect;

  // Crop-box gesture responder.
  // IMPORTANT: this responder is attached to a full-screen transparent layer
  // inside the crop viewport.  The old implementation attached the responder
  // only to a rectangle around the crop box, which made the resize handles
  // unreliable on Android.  We now detect the handle ourselves and keep the
  // active gesture in refs so Android does not lose the resize state between
  // touch events.
  type CropGesture = {
    type: "resize" | "move";
    handle: string | null;
    startTouch: Point;
    startRect: CropRect;
  };

  const cropGestureRef = useRef<CropGesture | null>(null);

  const getCropHandleAtPoint = (x: number, y: number, rect: CropRect) => {
    // Large hit radius makes the small visual handles easy to grab on phones.
    const radius = 32;
    const handles: Record<string, Point> = {
      tl: { x: rect.x, y: rect.y },
      tr: { x: rect.x + rect.width, y: rect.y },
      bl: { x: rect.x, y: rect.y + rect.height },
      br: { x: rect.x + rect.width, y: rect.y + rect.height },
      top: { x: rect.x + rect.width / 2, y: rect.y },
      bottom: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
      left: { x: rect.x, y: rect.y + rect.height / 2 },
      right: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
    };

    // Corners first so they win when their hit areas overlap an edge handle.
    const cornerOrder = ["tl", "tr", "bl", "br"];
    for (const key of cornerOrder) {
      const point = handles[key];
      if (Math.hypot(x - point.x, y - point.y) <= radius) return key;
    }

    const edgeRadius = 28;
    const edgeChecks: Array<[string, boolean]> = [
      [
        "top",
        Math.abs(y - rect.y) <= edgeRadius &&
          x >= rect.x - edgeRadius &&
          x <= rect.x + rect.width + edgeRadius,
      ],
      [
        "bottom",
        Math.abs(y - (rect.y + rect.height)) <= edgeRadius &&
          x >= rect.x - edgeRadius &&
          x <= rect.x + rect.width + edgeRadius,
      ],
      [
        "left",
        Math.abs(x - rect.x) <= edgeRadius &&
          y >= rect.y - edgeRadius &&
          y <= rect.y + rect.height + edgeRadius,
      ],
      [
        "right",
        Math.abs(x - (rect.x + rect.width)) <= edgeRadius &&
          y >= rect.y - edgeRadius &&
          y <= rect.y + rect.height + edgeRadius,
      ],
    ];

    for (const [key, hit] of edgeChecks) {
      if (hit) return key;
    }

    return null;
  };

  const cropBoxPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        if (!isCropModeRef.current) return false;

        const { locationX, locationY } = evt.nativeEvent;
        const rect = cropRectRef.current;
        const handle = getCropHandleAtPoint(locationX, locationY, rect);

        const inside =
          locationX >= rect.x &&
          locationX <= rect.x + rect.width &&
          locationY >= rect.y &&
          locationY <= rect.y + rect.height;

        return handle !== null || inside;
      },

      onStartShouldSetPanResponderCapture: (evt) => {
        if (!isCropModeRef.current) return false;

        const { locationX, locationY } = evt.nativeEvent;
        const rect = cropRectRef.current;
        const handle = getCropHandleAtPoint(locationX, locationY, rect);

        const inside =
          locationX >= rect.x &&
          locationX <= rect.x + rect.width &&
          locationY >= rect.y &&
          locationY <= rect.y + rect.height;

        return handle !== null || inside;
      },

      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt) => {
        if (!isCropModeRef.current) return;

        const { locationX, locationY } = evt.nativeEvent;
        const rect = { ...cropRectRef.current };
        const handle = getCropHandleAtPoint(locationX, locationY, rect);

        const inside =
          locationX >= rect.x &&
          locationX <= rect.x + rect.width &&
          locationY >= rect.y &&
          locationY <= rect.y + rect.height;

        if (handle) {
          cropGestureRef.current = {
            type: "resize",
            handle,
            startTouch: { x: locationX, y: locationY },
            startRect: rect,
          };
          setResizeHandle(handle);
          setIsResizing(true);
          setIsDraggingCrop(false);
        } else if (inside) {
          cropGestureRef.current = {
            type: "move",
            handle: null,
            startTouch: { x: locationX, y: locationY },
            startRect: rect,
          };
          setIsDraggingCrop(true);
          setIsResizing(false);
          setResizeHandle(null);
        } else {
          cropGestureRef.current = null;
        }
      },

      onPanResponderMove: (evt) => {
        if (!isCropModeRef.current) return;

        const gesture = cropGestureRef.current;
        if (!gesture) return;

        const { locationX, locationY } = evt.nativeEvent;
        const dx = locationX - gesture.startTouch.x;
        const dy = locationY - gesture.startTouch.y;
        const rect = gesture.startRect;
        let next = { ...rect };

        if (gesture.type === "resize" && gesture.handle) {
          const handle = gesture.handle;
          const right = rect.x + rect.width;
          const bottom = rect.y + rect.height;

          switch (handle) {
            case "tl": {
              const newX = clampNumber(rect.x + dx, 0, right - MIN_CROP_SIZE);
              const newY = clampNumber(rect.y + dy, 0, bottom - MIN_CROP_SIZE);
              next = {
                x: newX,
                y: newY,
                width: right - newX,
                height: bottom - newY,
              };
              break;
            }
            case "tr": {
              const newRight = clampNumber(
                right + dx,
                rect.x + MIN_CROP_SIZE,
                CROP_VIEWPORT_W,
              );
              const newY = clampNumber(rect.y + dy, 0, bottom - MIN_CROP_SIZE);
              next = {
                x: rect.x,
                y: newY,
                width: newRight - rect.x,
                height: bottom - newY,
              };
              break;
            }
            case "bl": {
              const newX = clampNumber(rect.x + dx, 0, right - MIN_CROP_SIZE);
              const newBottom = clampNumber(
                bottom + dy,
                rect.y + MIN_CROP_SIZE,
                CROP_VIEWPORT_H,
              );
              next = {
                x: newX,
                y: rect.y,
                width: right - newX,
                height: newBottom - rect.y,
              };
              break;
            }
            case "br": {
              const newRight = clampNumber(
                right + dx,
                rect.x + MIN_CROP_SIZE,
                CROP_VIEWPORT_W,
              );
              const newBottom = clampNumber(
                bottom + dy,
                rect.y + MIN_CROP_SIZE,
                CROP_VIEWPORT_H,
              );
              next = {
                x: rect.x,
                y: rect.y,
                width: newRight - rect.x,
                height: newBottom - rect.y,
              };
              break;
            }
            case "top": {
              const newY = clampNumber(rect.y + dy, 0, bottom - MIN_CROP_SIZE);
              next = {
                x: rect.x,
                y: newY,
                width: rect.width,
                height: bottom - newY,
              };
              break;
            }
            case "bottom": {
              const newBottom = clampNumber(
                bottom + dy,
                rect.y + MIN_CROP_SIZE,
                CROP_VIEWPORT_H,
              );
              next = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: newBottom - rect.y,
              };
              break;
            }
            case "left": {
              const newX = clampNumber(rect.x + dx, 0, right - MIN_CROP_SIZE);
              next = {
                x: newX,
                y: rect.y,
                width: right - newX,
                height: rect.height,
              };
              break;
            }
            case "right": {
              const newRight = clampNumber(
                right + dx,
                rect.x + MIN_CROP_SIZE,
                CROP_VIEWPORT_W,
              );
              next = {
                x: rect.x,
                y: rect.y,
                width: newRight - rect.x,
                height: rect.height,
              };
              break;
            }
          }
        } else {
          // Moving the complete crop rectangle.
          next.x = clampNumber(rect.x + dx, 0, CROP_VIEWPORT_W - rect.width);
          next.y = clampNumber(rect.y + dy, 0, CROP_VIEWPORT_H - rect.height);
        }

        cropRectRef.current = next;
        setCropRect(next);
      },

      onPanResponderRelease: () => {
        cropGestureRef.current = null;
        setIsDraggingCrop(false);
        setIsResizing(false);
        setResizeHandle(null);
      },

      onPanResponderTerminate: () => {
        cropGestureRef.current = null;
        setIsDraggingCrop(false);
        setIsResizing(false);
        setResizeHandle(null);
      },
    }),
  ).current;

  const handleRetake = () => {
    setRawImage(null);
    setUploadStage("pick");
    setCropError("");
    setIsCropMode(false);
  };

  const handleConfirmCrop = async () => {
    if (!rawImage) return;
    setCropError("");
    setProcessingCrop(true);
    try {
      const scale = baseScale * cropZoom;

      const cropX =
        (cropRect.x -
          CROP_VIEWPORT_W / 2 +
          displayWidth / 2 -
          cropTranslate.x) /
        scale;
      const cropY =
        (cropRect.y -
          CROP_VIEWPORT_H / 2 +
          displayHeight / 2 -
          cropTranslate.y) /
        scale;
      const cropW = cropRect.width / scale;
      const cropH = cropRect.height / scale;

      const originX = clampNumber(cropX, 0, rawImage.width - cropW);
      const originY = clampNumber(cropY, 0, rawImage.height - cropH);
      const finalW = Math.min(cropW, rawImage.width - originX);
      const finalH = Math.min(cropH, rawImage.height - originY);

      const result = await ImageManipulator.manipulateAsync(
        rawImage.uri,
        [
          { crop: { originX, originY, width: finalW, height: finalH } },
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
    <View style={sigStyles.overlay} collapsable={false}>
      <View style={sigStyles.backdrop}>
        <View
          style={[sigStyles.card, mode === "draw" && sigStyles.cardDrawMode]}
        >
          <View style={mode === "draw" ? sigStyles.headerPadded : undefined}>
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
          </View>

          {mode === "draw" && (
            <>
              <View
                style={[
                  sigStyles.canvasBox,
                  { width: "100%", height: CANVAS_HEIGHT },
                ]}
                collapsable={false}
                renderToHardwareTextureAndroid
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  setCanvasSize({ width, height });
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={handleDrawStart}
                onResponderMove={handleDrawMove}
                onResponderRelease={handleDrawEnd}
                onResponderTerminate={handleDrawEnd}
              >
                {!hasDrawing && existingSign && (
                  <View
                    style={sigStyles.existingHint}
                    pointerEvents="none"
                    collapsable={false}
                  >
                    <Text style={sigStyles.existingHintText}>
                      Draw over this box to replace the saved signature
                    </Text>
                  </View>
                )}
                <View
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                  collapsable={false}
                >
                  <Svg width="100%" height={CANVAS_HEIGHT}>
                    {drawPathData.map((d, i) => (
                      <Path
                        key={i}
                        d={d}
                        stroke="#0f172a"
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    ))}
                  </Svg>
                </View>
                {!hasDrawing && (
                  <View
                    style={sigStyles.placeholderLine}
                    pointerEvents="none"
                    collapsable={false}
                  />
                )}
              </View>

              <View style={sigStyles.footerPadded}>
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
                      size={16}
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
                      size={16}
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

          {mode === "upload" && uploadStage === "loading" && (
            <View style={sigStyles.loadingBox}>
              <ActivityIndicator size="large" color="#1a73e8" />
              <Text style={sigStyles.loadingText}>Preparing image...</Text>
            </View>
          )}

          {mode === "upload" && uploadStage === "crop" && rawImage && (
            <>
              <View style={sigStyles.cropModeSwitcher}>
                <TouchableOpacity
                  style={[
                    sigStyles.cropModeButton,
                    !isCropMode && sigStyles.cropModeButtonActive,
                  ]}
                  onPress={() => setIsCropMode(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="move-outline"
                    size={15}
                    color={!isCropMode ? "#1a73e8" : "#94a3b8"}
                  />
                  <Text
                    style={[
                      sigStyles.cropModeButtonText,
                      !isCropMode && sigStyles.cropModeButtonTextActive,
                    ]}
                  >
                    Adjust Photo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    sigStyles.cropModeButton,
                    isCropMode && sigStyles.cropModeButtonActive,
                  ]}
                  onPress={() => setIsCropMode(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="crop"
                    size={15}
                    color={isCropMode ? "#1a73e8" : "#94a3b8"}
                  />
                  <Text
                    style={[
                      sigStyles.cropModeButtonText,
                      isCropMode && sigStyles.cropModeButtonTextActive,
                    ]}
                  >
                    Crop
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={sigStyles.cropModeHint}>
                {isCropMode
                  ? "Drag the corners or edges to resize the crop box. The photo is locked."
                  : "Pinch with two fingers to zoom • Drag to reposition the photo"}
              </Text>

              <View style={sigStyles.cropViewportWrapper}>
                <View
                  style={[
                    sigStyles.cropViewport,
                    { width: CROP_VIEWPORT_W, height: CROP_VIEWPORT_H },
                  ]}
                  collapsable={false}
                >
                  <View
                    style={StyleSheet.absoluteFill}
                    {...imagePanResponder.panHandlers}
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
                  </View>

                  {isCropMode && (
                    <>
                      <View style={sigStyles.cropOverlay} pointerEvents="none">
                        <View
                          style={[
                            sigStyles.cropOverlaySection,
                            { height: cropRect.y },
                          ]}
                        />
                        <View style={sigStyles.cropOverlayMiddle}>
                          <View style={{ width: cropRect.x, flex: 1 }} />
                          <View
                            style={{
                              width: cropRect.width,
                              height: cropRect.height,
                            }}
                          />
                          <View style={{ flex: 1 }} />
                        </View>
                        <View
                          style={[
                            sigStyles.cropOverlaySection,
                            {
                              height:
                                CROP_VIEWPORT_H - cropRect.y - cropRect.height,
                            },
                          ]}
                        />
                      </View>

                      <View
                        style={[
                          sigStyles.cropBoxBorder,
                          {
                            left: cropRect.x,
                            top: cropRect.y,
                            width: cropRect.width,
                            height: cropRect.height,
                          },
                        ]}
                        pointerEvents="none"
                      />

                      {/* Full viewport gesture layer. The responder itself decides
                          whether the finger is on a resize handle or inside the
                          crop box. This is much more reliable on Android than a
                          small transparent touch-area view. */}
                      <View
                        style={sigStyles.cropGestureLayer}
                        {...cropBoxPanResponder.panHandlers}
                      />

                      {/* Corner handles */}
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleCorner,
                          { left: cropRect.x - 10, top: cropRect.y - 10 },
                        ]}
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleCorner,
                          {
                            left: cropRect.x + cropRect.width - 10,
                            top: cropRect.y - 10,
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleCorner,
                          {
                            left: cropRect.x - 10,
                            top: cropRect.y + cropRect.height - 10,
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleCorner,
                          {
                            left: cropRect.x + cropRect.width - 10,
                            top: cropRect.y + cropRect.height - 10,
                          },
                        ]}
                        pointerEvents="none"
                      />

                      {/* Edge handles */}
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleEdge,
                          {
                            left: cropRect.x + cropRect.width / 2 - 8,
                            top: cropRect.y - 8,
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleEdge,
                          {
                            left: cropRect.x + cropRect.width / 2 - 8,
                            top: cropRect.y + cropRect.height - 8,
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleEdge,
                          {
                            left: cropRect.x - 8,
                            top: cropRect.y + cropRect.height / 2 - 8,
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          sigStyles.resizeHandle,
                          sigStyles.resizeHandleEdge,
                          {
                            left: cropRect.x + cropRect.width - 8,
                            top: cropRect.y + cropRect.height / 2 - 8,
                          },
                        ]}
                        pointerEvents="none"
                      />
                    </>
                  )}

                  {!isCropMode && (
                    <View style={sigStyles.zoomBadge} pointerEvents="none">
                      <Text style={sigStyles.zoomBadgeText}>
                        {Math.round(cropZoom * 100)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>

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
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    width: "100%",
    maxWidth: 440,
  },
  // While drawing, shrink the card's own side padding so the canvas can
  // stretch to nearly the full device width - the header/footer keep the
  // normal padding for readability, only the canvas bleeds wide.
  cardDrawMode: {
    paddingHorizontal: 8,
  },
  headerPadded: { paddingHorizontal: 12 },
  footerPadded: { paddingHorizontal: 12, marginTop: 10 },

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
    marginBottom: 4,
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
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    position: "relative",
    marginTop: 12,
  },
  existingHint: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  existingHintText: { fontSize: 11.5, color: "#94a3b8", fontStyle: "italic" },
  placeholderLine: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: "22%",
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  hintText: { fontSize: 12, color: "#94a3b8", textAlign: "center" },
  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginBottom: 4,
  },
  errorText: { fontSize: 12, color: "#dc2626", fontWeight: "600", flex: 1 },

  toolRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 10,
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

  loadingBox: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: { fontSize: 13, color: "#64748b", fontWeight: "600" },

  cropModeSwitcher: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginTop: 4,
    marginBottom: 8,
    gap: 4,
  },
  cropModeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  cropModeButtonActive: {
    backgroundColor: "#ffffff",
    boxShadow: "0px 1px 3px rgba(0,0,0,0.06)",
  },
  cropModeButtonText: { fontSize: 12.5, fontWeight: "700", color: "#94a3b8" },
  cropModeButtonTextActive: { color: "#1a73e8" },
  cropModeHint: {
    fontSize: 11.5,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 10,
  },

  cropViewportWrapper: { alignItems: "center", justifyContent: "center" },
  cropViewport: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  cropOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  cropOverlaySection: { width: "100%", backgroundColor: "rgba(0,0,0,0.55)" },
  cropOverlayMiddle: { flexDirection: "row", flex: 1 },
  cropBoxBorder: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 4,
  },
  cropGestureLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    zIndex: 10,
  },
  resizeHandle: {
    position: "absolute",
    width: 20,
    height: 20,
    backgroundColor: "#fff",
    borderWidth: 2.5,
    borderColor: "#1a73e8",
    zIndex: 11,
  },
  resizeHandleCorner: { borderRadius: 10 },
  resizeHandleEdge: { borderRadius: 4, width: 16, height: 16 },
  zoomBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  zoomBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  transparentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  transparentLabel: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  transparentSubtext: { fontSize: 11, color: "#64748b", marginTop: 2 },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
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

import { useRef } from "react";
import { Platform } from "react-native";

export interface PhotoTranslation {
  x: number;
  y: number;
}

interface UsePhotoAdjustPointerOptions {
  zoom: number;
  translate: PhotoTranslation;
  setZoom: (value: number) => void;
  setTranslate: (
    value: PhotoTranslation | ((current: PhotoTranslation) => PhotoTranslation),
  ) => void;
  clampTranslate: (value: PhotoTranslation, zoom: number) => PhotoTranslation;
}

export function usePhotoAdjustPointer({
  zoom,
  translate,
  setZoom,
  setTranslate,
  clampTranslate,
}: UsePhotoAdjustPointerOptions) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTranslate: PhotoTranslation;
  } | null>(null);

  const setClampedZoom = (nextZoom: number) => {
    const boundedZoom = Math.min(Math.max(nextZoom, 1), 4);
    setZoom(boundedZoom);
    setTranslate((current) => clampTranslate(current, boundedZoom));
  };

  const pointerHandlers = {
    onPointerDown: (event: any) => {
      if (Platform.OS !== "web") return;
      const nativeEvent = event.nativeEvent ?? event;
      if (nativeEvent.button !== undefined && nativeEvent.button !== 0) return;

      dragRef.current = {
        pointerId: nativeEvent.pointerId,
        startX: nativeEvent.pageX ?? nativeEvent.clientX,
        startY: nativeEvent.pageY ?? nativeEvent.clientY,
        startTranslate: translate,
      };
      event.preventDefault?.();
      try {
        event.currentTarget?.setPointerCapture?.(nativeEvent.pointerId);
      } catch {
        // Pointer capture is not supported by every React Native Web target.
      }
    },
    onPointerMove: (event: any) => {
      if (Platform.OS !== "web" || !dragRef.current) return;
      const nativeEvent = event.nativeEvent ?? event;
      if (
        nativeEvent.pointerId !== undefined &&
        nativeEvent.pointerId !== dragRef.current.pointerId
      ) {
        return;
      }
      const x = nativeEvent.pageX ?? nativeEvent.clientX;
      const y = nativeEvent.pageY ?? nativeEvent.clientY;
      const drag = dragRef.current;
      setTranslate(
        clampTranslate(
          {
            x: drag.startTranslate.x + x - drag.startX,
            y: drag.startTranslate.y + y - drag.startY,
          },
          zoom,
        ),
      );
    },
    onPointerUp: () => {
      dragRef.current = null;
    },
    onPointerCancel: () => {
      dragRef.current = null;
    },
    onWheel: (event: any) => {
      if (Platform.OS !== "web") return;
      const nativeEvent = event.nativeEvent ?? event;
      event.preventDefault?.();
      setClampedZoom(zoom * (nativeEvent.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
  };

  const zoomIn = () => setClampedZoom(zoom * 1.2);
  const zoomOut = () => setClampedZoom(zoom / 1.2);

  return { pointerHandlers, zoomIn, zoomOut };
}

import React, { isValidElement } from "react";
import { Platform, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";

const COLOR_KEYS = new Set([
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRightColor",
  "color",
  "placeholderTextColor",
  "selectionColor",
  "shadowColor",
  "tintColor",
]);

const WEB_BRAND_COLORS: Record<string, string> = {
  "#1A73E8": "#126B58",
  "#2563EB": "#126B58",
  "#1D4ED8": "#126B58",
  "#0284C7": "#287D65",
  "#0EA5E9": "#287D65",
  "#3B82F6": "#287D65",
  "#38BDF8": "#3D9678",
  "#60A5FA": "#3D9678",
  "#93C5FD": "#8ECAB2",
  "#BFDBFE": "#D1E9DE",
  "#E8F0FE": "#E5F3ED",
  "#E0F2FE": "#E5F3ED",
  "#EFF6FF": "#E5F3ED",
  "#F0F6FF": "#E5F3ED",
  "#F0F9FF": "#E5F3ED",
  "#DBEAFE": "#E5F3ED",
  "#F8FBFF": "#F6F7F2",
  "#F5F7FB": "#F6F7F2",
  "#F1F5F9": "#F6F7F2",
  "#F3F4F6": "#F6F7F2",
  "#F8FAFC": "#F6F7F2",
  "#F9FAFB": "#F6F7F2",
  "#E2E8F0": "#E1E5DC",
  "#E5E7EB": "#E1E5DC",
  "#CBD5E1": "#D1DBD3",
  "#D1D5DB": "#D1DBD3",
  "#0F172A": "#17372E",
  "#1E293B": "#24463B",
  "#1F2937": "#24463B",
  "#334155": "#345249",
  "#475569": "#52645C",
  "#64748B": "#64746C",
  "#94A3B8": "#829087",
  "#1A1A1A": "#17372E",
  "#333333": "#345249",
  "#666666": "#64746C",
};

function parseColor(value: string) {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map((part) => part + part).join("")
        : hex[1];
    return [0, 2, 4].map((index) =>
      parseInt(digits.slice(index, index + 2), 16),
    );
  }

  const rgb = value.match(
    /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/i,
  );
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function mapColor(
  value: unknown,
  key: string,
  isDarkMode: boolean,
  useWebBrand: boolean,
): unknown {
  if (typeof value !== "string" || value === "transparent") return value;

  if (!isDarkMode && useWebBrand) {
    return WEB_BRAND_COLORS[value.toUpperCase()] ?? value;
  }

  const named: Record<string, string> = {
    black: "#000000",
    white: "#FFFFFF",
    gray: "#808080",
    grey: "#808080",
  };
  const normalized = named[value.toLowerCase()] ?? value;
  const rgb = parseColor(normalized);
  if (!rgb) return value;

  const [red, green, blue] = rgb.map((channel) => channel / 255);
  const lightness =
    (Math.max(red, green, blue) + Math.min(red, green, blue)) / 2;
  const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
  const lowChroma = saturation < 0.34;

  if (key.toLowerCase().includes("border")) {
    return lowChroma && lightness > 0.28 ? "#354154" : value;
  }
  if (key === "shadowColor") return "#000000";
  if (key === "color" || key === "placeholderTextColor") {
    if (lowChroma && lightness < 0.34) return "#E7EDF5";
    if (lowChroma && lightness < 0.72) return "#A8B4C5";
    return value;
  }
  if (key.toLowerCase().includes("background") || key === "trackColor") {
    if (!lowChroma || lightness < 0.64) return value;
    if (lightness > 0.93) return "#151C27";
    if (lightness > 0.82) return "#1C2634";
    return "#263243";
  }
  if (key === "tintColor" || key === "selectionColor") return value;
  return value;
}

function mapStyle(
  style: unknown,
  isDarkMode: boolean,
  useWebBrand: boolean,
): unknown {
  if (Array.isArray(style))
    return style.map((item) => mapStyle(item, isDarkMode, useWebBrand));
  if (typeof style === "number")
    return mapStyle(
      StyleSheet.flatten(style as never),
      isDarkMode,
      useWebBrand,
    );
  if (!style || typeof style !== "object") return style;

  const result: Record<string, unknown> = { ...style };
  for (const [key, value] of Object.entries(result)) {
    if (COLOR_KEYS.has(key)) {
      result[key] = mapColor(value, key, isDarkMode, useWebBrand);
    } else if (key === "trackColor" && value && typeof value === "object") {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([track, color]) => [
          track,
          mapColor(color, "trackColor", isDarkMode, useWebBrand),
        ]),
      );
    } else if (value && typeof value === "object") {
      result[key] = mapStyle(value, isDarkMode, useWebBrand);
    }
  }
  return result;
}

function transformNode(
  node: React.ReactNode,
  isDarkMode: boolean,
  useWebBrand: boolean,
): React.ReactNode {
  if (Array.isArray(node))
    return React.Children.toArray(node).map((child) =>
      transformNode(child, isDarkMode, useWebBrand),
    );
  if (!isValidElement<Record<string, unknown>>(node)) return node;

  const props = { ...node.props };
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") {
      props.children = transformNode(
        value as React.ReactNode,
        isDarkMode,
        useWebBrand,
      );
    } else if (key === "style" || key.endsWith("Style")) {
      props[key] = mapStyle(
        typeof value === "function"
          ? (...args: unknown[]) =>
              mapStyle(value(...args), isDarkMode, useWebBrand)
          : value,
        isDarkMode,
        useWebBrand,
      );
    } else if (COLOR_KEYS.has(key)) {
      props[key] = mapColor(value, key, isDarkMode, useWebBrand);
    } else if (key === "trackColor" && value && typeof value === "object") {
      props[key] = Object.fromEntries(
        Object.entries(value).map(([track, color]) => [
          track,
          mapColor(color, "trackColor", isDarkMode, useWebBrand),
        ]),
      );
    } else if (
      typeof value === "function" &&
      (key === "renderItem" || key.endsWith("Component"))
    ) {
      props[key] = (...args: unknown[]) =>
        transformNode(value(...args), isDarkMode, useWebBrand);
    }
  }

  return React.cloneElement(node, props);
}

export function DarkModeBoundary({ children }: { children: React.ReactNode }) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const useWebBrand = Platform.OS === "web";
  if (!isDarkMode && !useWebBrand) return children;
  return <>{transformNode(children, isDarkMode, useWebBrand)}</>;
}

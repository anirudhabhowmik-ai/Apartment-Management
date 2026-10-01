import React, { isValidElement } from "react";
import { StyleSheet } from "react-native";
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

function parseColor(value: string) {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? [...hex[1]].map((part) => part + part).join("")
      : hex[1];
    return [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
  }

  const rgb = value.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/i);
  return rgb
    ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
    : null;
}

function mapColor(value: unknown, key: string): unknown {
  if (typeof value !== "string" || value === "transparent") return value;

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
  const lightness = (Math.max(red, green, blue) + Math.min(red, green, blue)) / 2;
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

function mapStyle(style: unknown): unknown {
  if (Array.isArray(style)) return style.map(mapStyle);
  if (typeof style === "number") return mapStyle(StyleSheet.flatten(style as never));
  if (!style || typeof style !== "object") return style;

  const result: Record<string, unknown> = { ...style };
  for (const [key, value] of Object.entries(result)) {
    if (COLOR_KEYS.has(key)) {
      result[key] = mapColor(value, key);
    } else if (key === "trackColor" && value && typeof value === "object") {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([track, color]) => [
          track,
          mapColor(color, "trackColor"),
        ]),
      );
    } else if (value && typeof value === "object") {
      result[key] = mapStyle(value);
    }
  }
  return result;
}

function transformNode(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) return React.Children.toArray(node).map(transformNode);
  if (!isValidElement<Record<string, unknown>>(node)) return node;

  const props = { ...node.props };
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") {
      props.children = transformNode(value as React.ReactNode);
    } else if (key === "style" || key.endsWith("Style")) {
      props[key] = mapStyle(
        typeof value === "function"
          ? (...args: unknown[]) => mapStyle(value(...args))
          : value,
      );
    } else if (COLOR_KEYS.has(key)) {
      props[key] = mapColor(value, key);
    } else if (key === "trackColor" && value && typeof value === "object") {
      props[key] = Object.fromEntries(
        Object.entries(value).map(([track, color]) => [
          track,
          mapColor(color, "trackColor"),
        ]),
      );
    } else if (
      typeof value === "function" &&
      (key === "renderItem" || key.endsWith("Component"))
    ) {
      props[key] = (...args: unknown[]) => transformNode(value(...args));
    }
  }

  return React.cloneElement(node, props);
}

export function DarkModeBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  if (!isDarkMode) return children;
  return <>{transformNode(children)}</>;
}
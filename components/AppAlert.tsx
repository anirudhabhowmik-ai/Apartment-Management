// components/AppAlert.tsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
    Animated,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

const TEXT = "#0F172A";
const TEXT_SECONDARY = "#64748B";
const BORDER = "#E5E7EB";
const BLUE = "#2563EB";
const RED = "#DC2626";
const AMBER = "#B45309";
const GREEN = "#16A34A";

export type AppAlertButtonStyle = "default" | "cancel" | "destructive";

export interface AppAlertButton {
  text: string;
  onPress?: () => void;
  style?: AppAlertButtonStyle;
}

export interface AppAlertOptions {
  title: string;
  message?: string;
  buttons?: AppAlertButton[];
  /** Small icon shown above the title. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Accent color for the icon and primary button. */
  tone?: "info" | "warning" | "danger" | "success";
}

type PendingAlert = AppAlertOptions & { id: number };

let pendingQueue: PendingAlert[] = [];
let idCounter = 0;
const listeners = new Set<(alerts: PendingAlert[]) => void>();

function emit() {
  const snapshot = [...pendingQueue];
  for (const l of listeners) {
    try {
      l(snapshot);
    } catch {}
  }
}

function show(options: AppAlertOptions) {
  const id = ++idCounter;
  pendingQueue = [...pendingQueue, { ...options, id }];
  emit();
}

function dismiss(id: number) {
  pendingQueue = pendingQueue.filter((a) => a.id !== id);
  emit();
}

/**
 * Drop-in replacement for `Alert.alert(title, message, buttons)`.
 *
 * Alert:            use `AppAlert.alert({ title, message })`
 * Confirm:          use `AppAlert.alert({ title, message, buttons: [
 *                      { text: "Cancel", style: "cancel" },
 *                      { text: "Delete", style: "destructive", onPress }
 *                    ]})`
 *
 * Also exposes a hook-based variant `useAppAlert()` for inline usage if you
 * prefer not to use the static API.
 */
export const AppAlert = {
  alert(options: AppAlertOptions) {
    show(options);
  },
};

function toneMeta(tone: AppAlertOptions["tone"]) {
  switch (tone) {
    case "warning":
      return {
        icon: "warning-outline" as const,
        bg: "#FEF3C7",
        fg: AMBER,
      };
    case "danger":
      return {
        icon: "alert-circle-outline" as const,
        bg: "#FEF2F2",
        fg: RED,
      };
    case "success":
      return {
        icon: "checkmark-circle-outline" as const,
        bg: "#DCFCE7",
        fg: GREEN,
      };
    case "info":
    default:
      return {
        icon: "information-circle-outline" as const,
        bg: "#EFF6FF",
        fg: BLUE,
      };
  }
}

export function AppAlertHost() {
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);

  useEffect(() => {
    const listener = (next: PendingAlert[]) => setAlerts(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const current = alerts[0];

  if (!current) return null;

  const meta = toneMeta(current.tone);
  const icon = current.icon ?? meta.icon;
  const buttons =
    current.buttons && current.buttons.length > 0
      ? current.buttons
      : [{ text: "OK", style: "default" as const }];

  return (
    <AlertSheet
      key={current.id}
      options={current}
      icon={icon}
      iconBg={meta.bg}
      iconFg={meta.fg}
      buttons={buttons}
      onDismiss={() => dismiss(current.id)}
    />
  );
}

function AlertSheet({
  options,
  icon,
  iconBg,
  iconFg,
  buttons,
  onDismiss,
}: {
  options: PendingAlert;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconFg: string;
  buttons: AppAlertButton[];
  onDismiss: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 20,
        bounciness: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  const handleButton = (btn: AppAlertButton) => {
    onDismiss();
    setTimeout(() => {
      try {
        btn.onPress?.();
      } catch (e) {
        console.warn("[AppAlert] button onPress threw:", e);
      }
    }, 0);
  };

  // Decide layout: 1 button → full width; 2+ → row of equal buttons
  const isSingle = buttons.length === 1;

  return (
    <Modal
      transparent
      animationType="none"
      visible
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View
          style={[styles.card, { opacity, transform: [{ scale }] }]}
        >
          <Pressable onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={26} color={iconFg} />
            </View>

            <Text style={styles.title}>{options.title}</Text>

            {options.message ? (
              <Text style={styles.message}>{options.message}</Text>
            ) : null}

            <View
              style={[
                styles.actions,
                isSingle ? styles.actionsColumn : styles.actionsRow,
              ]}
            >
              {buttons.map((btn, i) => (
                <Pressable
                  key={`${btn.text}-${i}`}
                  onPress={() => handleButton(btn)}
                  style={({ pressed }) => [
                    styles.button,
                    isSingle ? styles.buttonFull : styles.buttonFlex,
                    btn.style === "destructive" && styles.buttonDestructive,
                    btn.style === "cancel" && styles.buttonCancel,
                    (!btn.style || btn.style === "default") &&
                      styles.buttonPrimary,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      btn.style === "destructive" &&
                        styles.buttonTextDestructive,
                      btn.style === "cancel" && styles.buttonTextCancel,
                      (!btn.style || btn.style === "default") &&
                        styles.buttonTextPrimary,
                    ]}
                    numberOfLines={1}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 20,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
  },
  actionsColumn: {
    flexDirection: "column",
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonFull: { width: "100%" },
  buttonFlex: { flex: 1 },
  buttonPrimary: { backgroundColor: BLUE },
  buttonDestructive: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
  },
  buttonCancel: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: BORDER,
  },
  buttonText: {
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  buttonTextPrimary: { color: "#FFFFFF" },
  buttonTextDestructive: { color: RED },
  buttonTextCancel: { color: "#475569" },
});

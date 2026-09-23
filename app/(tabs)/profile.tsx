// app/(tabs)/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import GenerateBillModal from "../../components/GenerateBillModal";
import SubscriptionPlanModal, {
  BillingPeriod,
  DEFAULT_PLANS,
  SubscriptionPlan,
} from "../../components/SubscriptionPlanModal";
import { useAccounts } from "../../hooks/useAccounts";
import { useUserRole } from "../../hooks/useUserRole";
import { startRazorpayPayment } from "../../services/paymentService";
import { useAccountStore } from "../../store/accountStore";
import { BillMemberType } from "../../store/billStore";
import { useAuthStore } from "../../store/useAuthStore";

// ============================================================================
// Inline custom alert — self-contained, no external imports
// ============================================================================

type AlertVariant = "info" | "success" | "warning" | "error" | "question";

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertState {
  visible: boolean;
  variant: AlertVariant;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

const EMPTY_ALERT: AlertState = {
  visible: false,
  variant: "info",
  title: "",
  message: undefined,
  buttons: [],
};

function AppAlert({
  state,
  onDismiss,
}: {
  state: AlertState;
  onDismiss: () => void;
}) {
  const { variant, title, message, buttons } = state;

  const meta: Record<
    AlertVariant,
    { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
  > = {
    info: { icon: "information-circle", color: "#2563EB", bg: "#EFF6FF" },
    success: { icon: "checkmark-circle", color: "#16A34A", bg: "#F0FDF4" },
    warning: { icon: "warning", color: "#D97706", bg: "#FEF3C7" },
    error: { icon: "close-circle", color: "#DC2626", bg: "#FEF2F2" },
    question: { icon: "help-circle", color: "#7C3AED", bg: "#F5F3FF" },
  };

  const m = meta[variant];

  const handlePress = (btn: AlertButton) => {
    onDismiss();
    if (btn.onPress) {
      setTimeout(btn.onPress, 0);
    }
  };

  const hasTwo = buttons.length === 2;
  const isStacked = buttons.length > 2;

  return (
    <Modal
      transparent
      visible={state.visible}
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={inlineAlertStyles.backdrop} onPress={onDismiss}>
        <Pressable
          style={inlineAlertStyles.card}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[inlineAlertStyles.iconCircle, { backgroundColor: m.bg }]}
          >
            <Ionicons name={m.icon} size={30} color={m.color} />
          </View>

          <Text style={inlineAlertStyles.title}>{title}</Text>

          {message ? (
            <Text style={inlineAlertStyles.message}>{message}</Text>
          ) : null}

          <View
            style={[
              inlineAlertStyles.actions,
              isStacked && inlineAlertStyles.actionsStacked,
            ]}
          >
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const isPrimary = !isDestructive && !isCancel;

              return (
                <Pressable
                  key={`${btn.text}-${idx}`}
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    inlineAlertStyles.button,
                    hasTwo && inlineAlertStyles.buttonHalf,
                    isStacked && inlineAlertStyles.buttonFull,
                    isCancel && inlineAlertStyles.buttonCancel,
                    isDestructive && inlineAlertStyles.buttonDestructive,
                    isPrimary && inlineAlertStyles.buttonPrimary,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      inlineAlertStyles.buttonText,
                      isCancel && inlineAlertStyles.buttonTextCancel,
                      isDestructive && inlineAlertStyles.buttonTextDestructive,
                      isPrimary && inlineAlertStyles.buttonTextPrimary,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function useAppAlert() {
  const [state, setState] = useState<AlertState>(EMPTY_ALERT);

  const show = useCallback(
    (opts: {
      variant?: AlertVariant;
      title: string;
      message?: string;
      buttons?: AlertButton[];
    }) => {
      setState({
        visible: true,
        variant: opts.variant ?? "info",
        title: opts.title,
        message: opts.message,
        buttons:
          opts.buttons && opts.buttons.length > 0
            ? opts.buttons
            : [{ text: "OK", style: "default" }],
      });
    },
    [],
  );

  const dismiss = useCallback(() => {
    setState(EMPTY_ALERT);
  }, []);

  return { state, show, dismiss };
}

const inlineAlertStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: "center",
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  message: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
  },
  actions: {
    flexDirection: "row",
    width: "100%",
    marginTop: 20,
    justifyContent: "center",
    gap: 10,
  },
  actionsStacked: { flexDirection: "column", gap: 8 },
  button: {
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 20,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonHalf: { flex: 1, minWidth: 0 },
  buttonFull: { width: "100%" },
  buttonCancel: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  buttonDestructive: { backgroundColor: "#DC2626" },
  buttonPrimary: { backgroundColor: "#2563EB" },
  buttonText: { fontSize: 14.5, fontWeight: "800" },
  buttonTextCancel: { color: "#475569" },
  buttonTextDestructive: { color: "#FFFFFF" },
  buttonTextPrimary: { color: "#FFFFFF" },
});

// ============================================================================
// API
// ============================================================================

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/api\/?$/, "");

interface AccountPerson {
  user_id: string;
  name: string;
  phone: string | null;
  photo_url: string | null;
}

interface AccountPeopleResponse {
  owner: AccountPerson | null;
  admins: AccountPerson[];
}

// ============================================================================
// TYPES
// ============================================================================

interface MenuItem {
  id: string;
  title: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  showArrow?: boolean;
}

interface HistoryEntry {
  id: string;
  type:
    | "payment"
    | "maintenance_paid"
    | "maintenance_due"
    | "amount_changed"
    | "template_saved"
    | "member_added"
    | "member_removed"
    | "role_changed"
    | "bill_generated"
    | "staff_added"
    | "staff_removed"
    | "subscription_changed"
    | "plan_upgraded"
    | "plan_downgraded"
    | "subscription_cancelled";
  title: string;
  description: string;
  amount?: number;
  status?: "paid" | "due";
  memberName?: string;
  timestamp: number;
  date: string;
  markedBy: any;
  details?: Record<string, any>;
  oldValue?: string;
  newValue?: string;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: "#E8EEF6",
    shadowColor: "#0B1A33",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center" },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 3,
    marginRight: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0B1A33",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  heroHeaderText: { flex: 1, minWidth: 0 },
  accountName: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
    flexWrap: "wrap",
  },
  societyPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  societyPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
    marginRight: 5,
  },
  societyPillText: {
    color: "#047857",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  ownerMiniCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  ownerMiniAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    overflow: "hidden",
  },
  ownerMiniAvatarImage: { width: "100%", height: "100%" },
  ownerMiniAvatarText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "800",
  },
  ownerMiniContent: { flex: 1, minWidth: 0 },
  ownerMiniLabel: {
    color: "#94A3B8",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  ownerMiniValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  ownerMiniPhone: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 1,
  },

  manageCta: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  manageCtaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  manageCtaContent: { flex: 1, minWidth: 0 },
  manageCtaTitle: {
    color: "#1D4ED8",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: -0.1,
  },
  manageCtaSubtitle: { color: "#64748B", fontSize: 11, marginTop: 2 },
  manageCtaChevron: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },

  adminCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8EEF6",
    marginTop: 14,
    overflow: "hidden",
  },
  adminCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  adminHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  adminHeaderContent: { flex: 1, minWidth: 0 },
  adminHeaderTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  adminHeaderSubtitle: { color: "#64748B", fontSize: 11, marginTop: 3 },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  adminRowLast: { borderBottomWidth: 0 },
  adminRowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    overflow: "hidden",
  },
  adminRowAvatarImage: { width: "100%", height: "100%" },
  ownerRowAvatar: { backgroundColor: "#DBEAFE" },
  adminRowAvatarBg: { backgroundColor: "#EDE9FE" },
  adminRowAvatarText: {
    color: "#1D4ED8",
    fontSize: 15,
    fontWeight: "800",
  },
  adminRowAvatarTextAdmin: { color: "#6D28D9" },
  adminRowContent: { flex: 1, minWidth: 0 },
  adminRowNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  adminRowName: {
    color: "#0F172A",
    fontSize: 13.5,
    fontWeight: "700",
    flexShrink: 1,
  },
  adminRowPhone: { color: "#64748B", fontSize: 11.5, marginTop: 3 },
  adminRowBadge: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginLeft: 8,
  },
  ownerRowBadge: { backgroundColor: "#DBEAFE" },
  adminRowBadgeBg: { backgroundColor: "#EDE9FE" },
  ownerRowBadgeText: {
    color: "#1D4ED8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  adminRowBadgeText: {
    color: "#7C3AED",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  withdrawAdminButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginLeft: 8,
  },
  withdrawAdminButtonText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "800",
  },

  logoutButton: {
    marginTop: 20,
    marginBottom: 6,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  subscriptionCard: {
    backgroundColor: "#0F1E33",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    overflow: "hidden",
    position: "relative",
  },
  subscriptionGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(59,130,246,0.25)",
  },
  subscriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subscriptionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  subscriptionBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  subscriptionPlanName: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 10,
  },
  subscriptionPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  subscriptionPrice: { color: "#FFFFFF", fontSize: 28, fontWeight: "800" },
  subscriptionPeriod: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 4,
  },
  subscriptionFeatures: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  subscriptionFeature: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subscriptionFeatureText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 4,
  },
  subscriptionAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  subscriptionActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  subscriptionActionText: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
  subscriptionExpiry: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  subscriptionExpiryStrong: { color: "#FFFFFF", fontWeight: "700" },

  menuSection: { marginTop: 14 },
  menuSectionTitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginLeft: 4,
    marginBottom: 7,
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EEF6",
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  menuIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  menuItemContent: { flex: 1, minWidth: 0 },
  menuItemTitle: { color: "#1E293B", fontSize: 14, fontWeight: "700" },
  menuItemDescription: { color: "#94A3B8", fontSize: 10, marginTop: 3 },

  historyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EEF6",
    marginTop: 14,
    overflow: "hidden",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
  },
  historyTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  historySubtitle: { color: "#64748B", fontSize: 11, marginTop: 3 },
  historyTotalBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  historyTotalText: { color: "#2563EB", fontSize: 13, fontWeight: "800" },
  viewAllHistoryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 6,
  },
  viewAllHistoryText: { color: "#2563EB", fontSize: 13, fontWeight: "800" },
  historyItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F7FA",
  },
  historyItemLast: { borderBottomWidth: 0 },
  historyItemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  historyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  historyItemContent: { flex: 1 },
  historyItemTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  historyItemDescription: { fontSize: 12, color: "#64748B", marginTop: 2 },
  historyItemDate: { fontSize: 10, color: "#94A3B8" },
  historyItemAmount: { fontSize: 14, fontWeight: "800", color: "#0F172A" },

  historyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "flex-end",
  },
  historyModalCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 20,
    maxHeight: "92%",
    minHeight: "50%",
  },
  historyModalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 16,
  },
  historyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  historyModalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  historyModalSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  historyModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  historyModalScroll: { flex: 1, minHeight: 200 },
  historyModalContent: { paddingBottom: 20, paddingTop: 4 },

  footer: { alignItems: "center", paddingTop: 24, paddingBottom: 8 },
  footerLogo: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  versionText: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  versionNumber: { color: "#CBD5E1", fontSize: 10, marginTop: 3 },

  tooltipOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  tooltipCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  tooltipIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  tooltipTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  tooltipSubtitle: {
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 320,
  },
  tooltipActionButton: {
    marginTop: 18,
    width: "100%",
    minHeight: 47,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  noHistoryContainer: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noHistoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  noHistoryTitle: { fontSize: 16, fontWeight: "700", color: "#334155" },
  noHistoryText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  withdrawModal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  withdrawIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  withdrawModalTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  withdrawModalDescription: {
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
  },
  withdrawModalActions: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
    marginTop: 20,
    gap: 9,
  },
  withdrawCancelButton: {
    flex: 1,
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawCancelText: { color: "#475569", fontSize: 13, fontWeight: "700" },
  withdrawConfirmButton: {
    flex: 1,
    minHeight: 45,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  withdrawConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});

// ============================================================================
// SCREEN
// ============================================================================

export default function ProfileTabScreen(): React.ReactElement {
  const router = useRouter();
  const { user, logout, refreshProfile } = useAuthStore();
  const { selectedAccount } = useAccounts();
  const { isAdmin, isMember } = useUserRole();

  const isOwner = selectedAccount?.ownerId === user?.id;
  const showAdminDirectory = !isOwner;

  const canManageBills = isOwner || isAdmin;

  const canSeeSubscription = isAdmin || isMember;
  const canManageSubscription = isAdmin;

  const alert = useAppAlert();
  const showAlert = alert.show;

  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const [showPhoneTooltip, setShowPhoneTooltip] = useState(false);

  const [showGenerateBill, setShowGenerateBill] = useState(false);
  const [billMemberType, setBillMemberType] = useState<BillMemberType>("owner");

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [showPlansModal, setShowPlansModal] = useState(false);
  const [activePlan, setActivePlan] = useState<string>("pro");
  const [activePlanPeriod, setActivePlanPeriod] =
    useState<BillingPeriod>("monthly");
  const plans = DEFAULT_PLANS;

  const [accountPeople, setAccountPeople] =
    useState<AccountPeopleResponse | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const isSwitcherOpen = useAccountStore((s) => s.isAccountSwitcherOpen);

  useEffect(() => {
    if (isSwitcherOpen) {
      setShowHistoryModal(false);
      setShowPhoneTooltip(false);
      setShowGenerateBill(false);
      setShowPlansModal(false);
      setShowWithdrawModal(false);
    }
  }, [isSwitcherOpen]);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync("auth_token");
    } catch (err) {
      console.warn("[profile] SecureStore read failed:", err);
      return null;
    }
  }, []);

  const loadAccountPeople = useCallback(async () => {
    if (!selectedAccount?.id || isOwner) {
      setAccountPeople(null);
      return;
    }
    setPeopleLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_URL}/api/accounts/${selectedAccount.id}/people`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setAccountPeople(null);
        return;
      }
      const data: AccountPeopleResponse = await res.json();
      setAccountPeople({
        owner: data?.owner ?? null,
        admins: Array.isArray(data?.admins) ? data.admins : [],
      });
    } catch (err) {
      console.warn("[profile] loadAccountPeople error:", err);
      setAccountPeople(null);
    } finally {
      setPeopleLoading(false);
    }
  }, [selectedAccount?.id, isOwner, getAuthToken]);

  useEffect(() => {
    loadAccountPeople();
  }, [loadAccountPeople]);

  const adminDirectory = useMemo(() => {
    if (!accountPeople?.admins) return [];
    return accountPeople.admins.map((a) => ({
      id: a.user_id,
      name: a.name,
      phone: a.phone,
      photoUrl: a.photo_url,
      isSelf: a.user_id === user?.id,
    }));
  }, [accountPeople, user?.id]);

  const addHistoryEntry = (
    type: HistoryEntry["type"],
    title: string,
    description: string,
    options?: {
      amount?: number;
      status?: "paid" | "due";
      memberName?: string;
      details?: Record<string, any>;
      oldValue?: string;
      newValue?: string;
    },
  ) => {
    const newEntry: HistoryEntry = {
      id: Date.now().toString(),
      type,
      title,
      description,
      timestamp: Date.now(),
      date: new Date().toISOString(),
      markedBy: user?.phone,
      ...options,
    };
    setHistory((prev) => [newEntry, ...prev]);
  };

  useEffect(() => {
    const sampleHistory: HistoryEntry[] = [
      {
        id: "1",
        type: "maintenance_paid",
        title: "Maintenance Paid",
        description: "Ramesh Kumar paid maintenance for January 2024",
        amount: 2500,
        status: "paid",
        memberName: "Ramesh Kumar",
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        markedBy: "Admin (You)",
        details: { month: "January 2024", flat: "A-204" },
      },
      {
        id: "2",
        type: "maintenance_due",
        title: "Maintenance Due",
        description: "Priya Sharma has pending maintenance for February 2024",
        amount: 1800,
        status: "due",
        memberName: "Priya Sharma",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000,
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        markedBy: "System",
        details: { month: "February 2024", flat: "B-101" },
      },
      {
        id: "3",
        type: "amount_changed",
        title: "Maintenance Amount Changed",
        description:
          "Amit Singh's maintenance amount changed from ₹3,000 to ₹3,200",
        amount: 3200,
        memberName: "Amit Singh",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        markedBy: "Admin (You)",
        oldValue: "₹3,000",
        newValue: "₹3,200",
        details: { flat: "C-505" },
      },
    ];
    setHistory(sampleHistory);
  }, []);

  const getHistoryIcon = (type: HistoryEntry["type"]) => {
    switch (type) {
      case "maintenance_paid":
      case "payment":
        return { icon: "checkmark-circle", color: "#16A34A", bg: "#DCFCE7" };
      case "maintenance_due":
        return { icon: "time-outline", color: "#DC2626", bg: "#FEE2E2" };
      case "amount_changed":
        return {
          icon: "swap-horizontal-outline",
          color: "#2563EB",
          bg: "#EFF6FF",
        };
      case "template_saved":
        return {
          icon: "document-text-outline",
          color: "#7C3AED",
          bg: "#F3E8FF",
        };
      case "member_added":
      case "staff_added":
        return { icon: "person-add-outline", color: "#2563EB", bg: "#DBEAFE" };
      case "member_removed":
      case "staff_removed":
        return {
          icon: "person-remove-outline",
          color: "#DC2626",
          bg: "#FEE2E2",
        };
      case "bill_generated":
        return { icon: "receipt-outline", color: "#D97706", bg: "#FEF3C7" };
      case "role_changed":
        return { icon: "shield-outline", color: "#7C3AED", bg: "#F3E8FF" };
      case "subscription_changed":
      case "plan_upgraded":
      case "plan_downgraded":
        return { icon: "ribbon-outline", color: "#D97706", bg: "#FEF3C7" };
      case "subscription_cancelled":
        return {
          icon: "close-circle-outline",
          color: "#DC2626",
          bg: "#FEE2E2",
        };
      default:
        return {
          icon: "information-circle-outline",
          color: "#64748B",
          bg: "#F1F5F9",
        };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/(auth)/login");
    } catch (err) {
      console.error("Logout error:", err);
      showAlert({
        variant: "error",
        title: "Logout failed",
        message: "Please try again.",
      });
    }
  };

  const confirmDeleteAccount = () => {
    showAlert({
      variant: "warning",
      title: "Account deleted",
      message: "The account has been removed.",
    });
  };

  const handleDeleteAccount = () => {
    showAlert({
      variant: "error",
      title: "Delete Account",
      message:
        "Are you sure you want to delete your account? This action cannot be undone.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: confirmDeleteAccount,
        },
      ],
    });
  };

  const handlePhoneRowPress = () => {
    if (isOwner) {
      router.push("/(modals)/account-profile");
    } else {
      setShowPhoneTooltip(true);
    }
  };

  const handleBillSaved = () => {
    addHistoryEntry(
      "template_saved",
      "Bill Template Saved",
      "Bill template updated",
    );
  };

  const getPlanPrice = (plan: SubscriptionPlan, period: BillingPeriod) =>
    period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;

  const getPlanPeriodLabel = (
    plan: SubscriptionPlan,
    period: BillingPeriod,
  ) => {
    if (plan.monthlyPrice === 0) return "";
    return period === "yearly" ? "/year" : "/month";
  };

  const handlePlanChanged = (payload: {
    plan: SubscriptionPlan;
    period: BillingPeriod;
    isUpgrade: boolean;
    isDowngrade: boolean;
    amount: number;
    paymentId?: string;
  }) => {
    const { plan, period, isUpgrade, isDowngrade, amount, paymentId } = payload;
    const currentPlan = plans.find((p) => p.id === activePlan);
    const actionType: HistoryEntry["type"] = isUpgrade
      ? "plan_upgraded"
      : isDowngrade
        ? "plan_downgraded"
        : "subscription_changed";
    const actionTitle = isUpgrade
      ? "Plan Upgraded"
      : isDowngrade
        ? "Plan Downgraded"
        : "Plan Changed";
    const actionDescription = isUpgrade
      ? `Upgraded from ${currentPlan?.name ?? "Unknown"} to ${plan.name} (${period})`
      : isDowngrade
        ? `Downgraded from ${currentPlan?.name ?? "Unknown"} to ${plan.name} (${period})`
        : `Changed plan from ${currentPlan?.name ?? "Unknown"} to ${plan.name} (${period})`;

    addHistoryEntry(actionType, actionTitle, actionDescription, {
      amount,
      oldValue: currentPlan?.name ?? "Unknown",
      newValue: plan.name,
      details: {
        from: currentPlan?.name ?? "Unknown",
        to: plan.name,
        price: amount,
        period,
        paymentId: paymentId ?? null,
      },
    });

    setActivePlan(plan.id);
    setActivePlanPeriod(period);

    showAlert({
      variant: "success",
      title: "Plan Updated",
      message: `You have successfully ${
        isUpgrade
          ? "upgraded to"
          : isDowngrade
            ? "downgraded to"
            : "switched to"
      } ${plan.name} plan (${period}).`,
    });
  };

  const handleCancelSubscription = () => {
    if (!canManageSubscription) return;
    const currentPlan = plans.find((p) => p.id === activePlan);
    addHistoryEntry(
      "subscription_cancelled",
      "Subscription Cancelled",
      `Cancelled ${currentPlan?.name ?? "current"} plan`,
      {
        details: {
          plan: currentPlan?.name ?? "Unknown",
          cancelledAt: new Date().toISOString(),
        },
      },
    );
    setActivePlan("free");
    setActivePlanPeriod("monthly");
    showAlert({
      variant: "info",
      title: "Subscription Cancelled",
      message:
        "Your subscription has been cancelled. You will be moved to the Free plan.",
    });
  };

  const handleStartPayment = async (
    amount: number,
    label: string,
    userInfo?: { name?: string; phone?: string },
  ): Promise<{ success: boolean; paymentId?: string; error?: string }> => {
    try {
      const result = await startRazorpayPayment(amount, label, {
        name: userInfo?.name,
        phone: userInfo?.phone,
      });
      return {
        success: Boolean(result?.success),
        paymentId: result?.paymentId,
        error: result?.error,
      };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Payment failed" };
    }
  };

  const confirmWithdrawAdmin = async () => {
    if (!selectedAccount?.id || !user?.id) return;
    const token = await getAuthToken();
    if (!token) {
      showAlert({
        variant: "error",
        title: "Not signed in",
        message: "You're not signed in. Please log in again.",
      });
      return;
    }

    setWithdrawSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/api/accounts/${selectedAccount.id}/access/${user.id}?role=admin`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            keepMemberVisibility: true,
            keepStaffVisibility: true,
          }),
        },
      );

      if (!res.ok) {
        let data: any = null;
        try {
          data = await res.json();
        } catch {}
        showAlert({
          variant: "error",
          title: "Could not withdraw access",
          message: data?.message || "Failed to withdraw admin access.",
        });
        return;
      }

      setShowWithdrawModal(false);
      await loadAccountPeople();

      showAlert({
        variant: "success",
        title: "Admin Access Withdrawn",
        message: "You are no longer an admin of this account.",
      });
    } catch (err) {
      console.error("withdrawAdmin error:", err);
      showAlert({
        variant: "error",
        title: "Network error",
        message: "Please check your connection and try again.",
      });
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const menuItems: MenuItem[] = [
    {
      id: "generate_bill",
      title: "Generate Bill",
      description: "Create and download bills for owners and staff",
      icon: "document-text-outline",
      color: "#2563EB",
      onPress: () => {
        if (!canManageBills) {
          showAlert({
            variant: "warning",
            title: "Permission denied",
            message:
              "Only the account owner or an admin can manage bill templates.",
          });
          return;
        }
        setBillMemberType("owner");
        setShowGenerateBill(true);
      },
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Receive important account updates",
      icon: "notifications-outline",
      color: "#F59E0B",
      onPress: () => setNotifications((e) => !e),
      showArrow: false,
    },
    {
      id: "dark_mode",
      title: "Dark Mode",
      description: "Use a darker appearance",
      icon: "moon-outline",
      color: "#64748B",
      onPress: () => setDarkMode((e) => !e),
      showArrow: false,
    },
    {
      id: "privacy_policy",
      title: "Privacy Policy",
      icon: "shield-checkmark-outline",
      color: "#0891B2",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "Privacy Policy", type: "privacy" },
        }),
    },
    {
      id: "terms_conditions",
      title: "Terms & Conditions",
      icon: "document-text-outline",
      color: "#7C3AED",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "Terms & Conditions", type: "terms" },
        }),
    },
    {
      id: "about_us",
      title: "About Us",
      icon: "information-circle-outline",
      color: "#16A34A",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "About Us", type: "about" },
        }),
    },
    {
      id: "help_support",
      title: "Help & Support",
      icon: "help-circle-outline",
      color: "#F59E0B",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "Help & Support", type: "support" },
        }),
    },
    {
      id: "rate_app",
      title: "Rate the App",
      icon: "star-outline",
      color: "#F59E0B",
      onPress: () => {},
    },
  ];

  const settingsSections = useMemo(() => {
    const sections = [
      { title: "BILLING", itemIds: ["generate_bill"] },
      { title: "PREFERENCES", itemIds: ["notifications", "dark_mode"] },
      {
        title: "LEGAL & SUPPORT",
        itemIds: [
          "privacy_policy",
          "terms_conditions",
          "about_us",
          "help_support",
          "rate_app",
        ],
      },
    ];
    if (canManageBills) return sections;
    return sections.filter((s) => s.title !== "BILLING");
  }, [canManageBills]);

  const renderMenuItem = (item: MenuItem, index: number, items: MenuItem[]) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.menuItem,
        index === items.length - 1 && styles.menuItemLast,
      ]}
      onPress={item.onPress}
      activeOpacity={0.75}
    >
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuIcon, { backgroundColor: item.color + "14" }]}>
          <Ionicons name={item.icon} size={20} color={item.color} />
        </View>
        <View style={styles.menuItemContent}>
          <Text style={styles.menuItemTitle}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.menuItemDescription} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </View>
      {item.id === "notifications" ? (
        <Switch
          value={notifications}
          onValueChange={setNotifications}
          trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
          thumbColor={notifications ? "#2563EB" : "#FFFFFF"}
        />
      ) : item.id === "dark_mode" ? (
        <Switch
          value={darkMode}
          onValueChange={setDarkMode}
          trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
          thumbColor={darkMode ? "#2563EB" : "#FFFFFF"}
        />
      ) : item.showArrow !== false ? (
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      ) : null}
    </TouchableOpacity>
  );

  const renderHistoryModal = () => (
    <Modal
      visible={showHistoryModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowHistoryModal(false)}
    >
      <View style={styles.historyModalOverlay}>
        <View style={styles.historyModalCard}>
          <View style={styles.historyModalHandle} />
          <View style={styles.historyModalHeader}>
            <View>
              <Text style={styles.historyModalTitle}>Activity History</Text>
              <Text style={styles.historyModalSubtitle}>
                {history.length} events recorded
              </Text>
            </View>
            <TouchableOpacity
              style={styles.historyModalCloseButton}
              onPress={() => setShowHistoryModal(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.historyModalScroll}
            contentContainerStyle={styles.historyModalContent}
            showsVerticalScrollIndicator
          >
            {history.length === 0 ? (
              <View style={styles.noHistoryContainer}>
                <View style={styles.noHistoryIcon}>
                  <Ionicons name="time-outline" size={28} color="#94A3B8" />
                </View>
                <Text style={styles.noHistoryTitle}>No history found</Text>
                <Text style={styles.noHistoryText}>
                  No events match the selected filter.
                </Text>
              </View>
            ) : (
              history.map((item, index) => {
                const iconInfo = getHistoryIcon(item.type);
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.historyItem,
                      index === history.length - 1 && styles.historyItemLast,
                    ]}
                  >
                    <View style={styles.historyItemHeader}>
                      <View
                        style={[
                          styles.historyIconContainer,
                          { backgroundColor: iconInfo.bg },
                        ]}
                      >
                        <Ionicons
                          name={iconInfo.icon as any}
                          size={18}
                          color={iconInfo.color}
                        />
                      </View>
                      <View style={styles.historyItemContent}>
                        <Text style={styles.historyItemTitle}>
                          {item.title}
                        </Text>
                        <Text style={styles.historyItemDescription}>
                          {item.description}
                        </Text>
                        <Text style={styles.historyItemDate}>
                          {formatDate(item.date)} • by {item.markedBy}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const goToAccountProfile = () => router.push("/(modals)/account-profile");

  const accountName = selectedAccount?.name || "Apartment";

  const selfName = (user as any)?.name || "You";
  const selfPhone = user?.phone || "—";
  const selfPhotoUri = user?.photoUrl ?? null;

  const ownerName = isOwner
    ? selfName
    : (accountPeople?.owner?.name ?? "Owner");
  const ownerPhone = isOwner ? selfPhone : (accountPeople?.owner?.phone ?? "—");
  const ownerPhotoUri = isOwner
    ? selfPhotoUri
    : (accountPeople?.owner?.photo_url ?? null);

  const accountPhotoUri: string | null = selectedAccount?.photoUri ?? null;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarInner}>
                {accountPhotoUri ? (
                  <Image
                    source={{ uri: accountPhotoUri }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                ) : (
                  <Text style={styles.avatarInitials}>
                    {getInitials(accountName) || "A"}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.heroHeaderText}>
              <Text style={styles.accountName} numberOfLines={1}>
                {accountName}
              </Text>
              <View style={styles.pillRow}>
                <View style={styles.societyPill}>
                  <View style={styles.societyPillDot} />
                  <Text style={styles.societyPillText}>SOCIETY</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.ownerMiniCard}>
            <View style={styles.ownerMiniAvatar}>
              {ownerPhotoUri ? (
                <Image
                  source={{ uri: ownerPhotoUri }}
                  style={styles.ownerMiniAvatarImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <Text style={styles.ownerMiniAvatarText}>
                  {getInitials(ownerName) || "O"}
                </Text>
              )}
            </View>
            <View style={styles.ownerMiniContent}>
              <Text style={styles.ownerMiniLabel}>Account Owner</Text>
              <Text style={styles.ownerMiniValue} numberOfLines={1}>
                {ownerName}
                {isOwner ? " (You)" : ""}
              </Text>
              <TouchableOpacity
                onPress={handlePhoneRowPress}
                activeOpacity={0.7}
                hitSlop={6}
              >
                <Text style={styles.ownerMiniPhone} numberOfLines={1}>
                  {ownerPhone}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {isOwner && (
            <TouchableOpacity
              style={styles.manageCta}
              onPress={goToAccountProfile}
              activeOpacity={0.85}
            >
              <View style={styles.manageCtaIconWrap}>
                <Ionicons name="settings" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.manageCtaContent}>
                <Text style={styles.manageCtaTitle}>
                  Manage Account Profile
                </Text>
                <Text style={styles.manageCtaSubtitle} numberOfLines={1}>
                  Photo, name, phone number, and access
                </Text>
              </View>
              <View style={styles.manageCtaChevron}>
                <Ionicons name="chevron-forward" size={16} color="#2563EB" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {showAdminDirectory && (
          <View style={styles.adminCard}>
            <View style={styles.adminCardHeader}>
              <View style={styles.adminHeaderIcon}>
                <Ionicons name="shield-checkmark" size={20} color="#2563EB" />
              </View>
              <View style={styles.adminHeaderContent}>
                <Text style={styles.adminHeaderTitle}>Admin & Owners</Text>
                <Text style={styles.adminHeaderSubtitle}>
                  Contact the society admin for any help
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.adminRow,
                adminDirectory.length === 0 && styles.adminRowLast,
              ]}
            >
              <View style={[styles.adminRowAvatar, styles.ownerRowAvatar]}>
                {ownerPhotoUri ? (
                  <Image
                    source={{ uri: ownerPhotoUri }}
                    style={styles.adminRowAvatarImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                ) : (
                  <Text style={styles.adminRowAvatarText}>
                    {getInitials(ownerName) || "O"}
                  </Text>
                )}
              </View>
              <View style={styles.adminRowContent}>
                <View style={styles.adminRowNameRow}>
                  <Text style={styles.adminRowName} numberOfLines={1}>
                    {ownerName}
                  </Text>
                </View>
                <Text style={styles.adminRowPhone} numberOfLines={1}>
                  {ownerPhone}
                </Text>
              </View>
              <View style={[styles.adminRowBadge, styles.ownerRowBadge]}>
                <Text style={styles.ownerRowBadgeText}>OWNER</Text>
              </View>
            </View>

            {peopleLoading && adminDirectory.length === 0 ? (
              <View style={[styles.adminRow, styles.adminRowLast]}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text
                  style={[
                    styles.adminRowPhone,
                    { marginLeft: 10, marginTop: 0 },
                  ]}
                >
                  Loading admins…
                </Text>
              </View>
            ) : (
              adminDirectory.map((admin, index) => (
                <View
                  key={admin.id}
                  style={[
                    styles.adminRow,
                    index === adminDirectory.length - 1 && styles.adminRowLast,
                  ]}
                >
                  <View
                    style={[styles.adminRowAvatar, styles.adminRowAvatarBg]}
                  >
                    {admin.photoUrl ? (
                      <Image
                        source={{ uri: admin.photoUrl }}
                        style={styles.adminRowAvatarImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.adminRowAvatarText,
                          styles.adminRowAvatarTextAdmin,
                        ]}
                      >
                        {getInitials(admin.name) || "A"}
                      </Text>
                    )}
                  </View>
                  <View style={styles.adminRowContent}>
                    <View style={styles.adminRowNameRow}>
                      <Text style={styles.adminRowName} numberOfLines={1}>
                        {admin.name}
                        {admin.isSelf ? " (You)" : ""}
                      </Text>
                    </View>
                    <Text style={styles.adminRowPhone} numberOfLines={1}>
                      {admin.phone ?? "—"}
                    </Text>
                  </View>

                  {admin.isSelf ? (
                    <TouchableOpacity
                      style={styles.withdrawAdminButton}
                      onPress={() => setShowWithdrawModal(true)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.withdrawAdminButtonText}>
                        Withdraw
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[styles.adminRowBadge, styles.adminRowBadgeBg]}
                    >
                      <Text style={styles.adminRowBadgeText}>ADMIN</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {canSeeSubscription &&
          (() => {
            const currentPlan = plans.find((p) => p.id === activePlan);
            const isFree = activePlan === "free";
            const planName = currentPlan?.name ?? "Free";
            const planFeatures = currentPlan?.features ?? ["Basic features"];
            const price = currentPlan
              ? getPlanPrice(currentPlan, activePlanPeriod)
              : 0;
            const periodLabel = currentPlan
              ? getPlanPeriodLabel(currentPlan, activePlanPeriod)
              : "";

            return (
              <View style={styles.subscriptionCard}>
                <View style={styles.subscriptionGlow} />
                <View style={styles.subscriptionHeader}>
                  <View style={styles.subscriptionBadge}>
                    <Ionicons
                      name={isFree ? "people-outline" : "star"}
                      size={12}
                      color="#FFD700"
                    />
                    <Text style={styles.subscriptionBadgeText}>
                      {isFree ? "FREE" : "ACTIVE"}
                    </Text>
                  </View>
                  {canManageSubscription && (
                    <TouchableOpacity
                      onPress={() => setShowPlansModal(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={18}
                        color="rgba(255,255,255,0.6)"
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.subscriptionPlanName}>{planName} Plan</Text>
                <View style={styles.subscriptionPriceRow}>
                  <Text style={styles.subscriptionPrice}>
                    {price === 0 ? "Free" : `₹${price}`}
                  </Text>
                  {price > 0 && (
                    <Text style={styles.subscriptionPeriod}>{periodLabel}</Text>
                  )}
                </View>

                <View style={styles.subscriptionFeatures}>
                  {planFeatures.slice(0, 3).map((feature, index) => (
                    <View key={index} style={styles.subscriptionFeature}>
                      <Ionicons
                        name="checkmark-circle"
                        size={12}
                        color="#34D399"
                      />
                      <Text style={styles.subscriptionFeatureText}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                {canManageSubscription ? (
                  <View style={styles.subscriptionAction}>
                    <TouchableOpacity
                      style={styles.subscriptionActionButton}
                      onPress={() => setShowPlansModal(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={
                          isFree ? "arrow-forward-outline" : "refresh-outline"
                        }
                        size={18}
                        color="#2563EB"
                      />
                      <Text style={styles.subscriptionActionText}>
                        {isFree ? "Upgrade Now" : "Manage Plan"}
                      </Text>
                    </TouchableOpacity>
                    {!isFree && (
                      <Text style={styles.subscriptionExpiry}>
                        Next billing:{" "}
                        <Text style={styles.subscriptionExpiryStrong}>
                          Dec 15, 2024
                        </Text>
                      </Text>
                    )}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.subscriptionAction,
                      { justifyContent: "center" },
                    ]}
                  >
                    <Text style={styles.subscriptionExpiry}>
                      Managed by the society admin
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

        {settingsSections.map((section) => {
          const items = menuItems.filter((item) =>
            section.itemIds.includes(item.id),
          );
          if (items.length === 0) return null;
          return (
            <View key={section.title} style={styles.menuSection}>
              <Text style={styles.menuSectionTitle}>{section.title}</Text>
              <View style={styles.menuCard}>
                {items.map((item, index) => renderMenuItem(item, index, items))}
              </View>
            </View>
          );
        })}

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>Activity History</Text>
              <Text style={styles.historySubtitle}>
                Track all activities in your society
              </Text>
            </View>
            <View style={styles.historyTotalBadge}>
              <Text style={styles.historyTotalText}>{history.length}</Text>
            </View>
          </View>

          {history.slice(0, 3).map((item, index) => {
            const iconInfo = getHistoryIcon(item.type);
            return (
              <View
                key={item.id}
                style={[
                  styles.historyItem,
                  index === 2 && styles.historyItemLast,
                  { paddingHorizontal: 15, paddingVertical: 10 },
                ]}
              >
                <View style={styles.historyItemHeader}>
                  <View
                    style={[
                      styles.historyIconContainer,
                      {
                        backgroundColor: iconInfo.bg,
                        width: 32,
                        height: 32,
                      },
                    ]}
                  >
                    <Ionicons
                      name={iconInfo.icon as any}
                      size={16}
                      color={iconInfo.color}
                    />
                  </View>
                  <View style={styles.historyItemContent}>
                    <Text style={[styles.historyItemTitle, { fontSize: 13 }]}>
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.historyItemDescription, { fontSize: 11 }]}
                      numberOfLines={1}
                    >
                      {item.description}
                    </Text>
                    <Text style={[styles.historyItemDate, { fontSize: 9 }]}>
                      {formatDate(item.date)} • by {item.markedBy}
                    </Text>
                  </View>
                  {item.amount && (
                    <Text style={[styles.historyItemAmount, { fontSize: 13 }]}>
                      {formatCurrency(item.amount)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.viewAllHistoryButton}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllHistoryText}>View All History</Text>
            <Ionicons name="chevron-forward" size={16} color="#2563EB" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>DANGER ZONE</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={handleDeleteAccount}
              activeOpacity={0.75}
            >
              <View style={styles.menuItemLeft}>
                <View
                  style={[styles.menuIcon, { backgroundColor: "#DC262614" }]}
                >
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Delete Account</Text>
                  <Text style={styles.menuItemDescription}>
                    Permanently remove your account and all data
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <View style={styles.footerLogo}>
            <Ionicons name="business-outline" size={16} color="#2563EB" />
          </View>
          <Text style={styles.versionText}>Apartment Management</Text>
          <Text style={styles.versionNumber}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      {renderHistoryModal()}

      {showPhoneTooltip && (
        <Modal
          transparent
          animationType="fade"
          visible={showPhoneTooltip}
          onRequestClose={() => setShowPhoneTooltip(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowPhoneTooltip(false)}>
            <View style={styles.tooltipOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.tooltipCard}>
                  <View style={styles.tooltipIconCircle}>
                    <Ionicons name="call-outline" size={26} color="#2563EB" />
                  </View>
                  <Text style={styles.tooltipTitle}>Phone Number</Text>
                  <Text style={styles.tooltipSubtitle}>
                    This phone number belongs to the account owner. Only the
                    owner can change it from the Account Profile screen.
                  </Text>
                  <TouchableOpacity
                    style={styles.tooltipActionButton}
                    onPress={() => setShowPhoneTooltip(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tooltipActionText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {showWithdrawModal && (
        <Modal
          transparent
          animationType="fade"
          visible={showWithdrawModal}
          onRequestClose={() => {
            if (!withdrawSubmitting) setShowWithdrawModal(false);
          }}
        >
          <TouchableWithoutFeedback
            onPress={() => {
              if (!withdrawSubmitting) setShowWithdrawModal(false);
            }}
          >
            <View style={styles.tooltipOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.withdrawModal}>
                  <View style={styles.withdrawIcon}>
                    <Ionicons name="shield-outline" size={26} color="#DC2626" />
                  </View>
                  <Text style={styles.withdrawModalTitle}>
                    Withdraw Admin Access?
                  </Text>
                  <Text style={styles.withdrawModalDescription}>
                    You will lose administrator privileges on this account. If
                    you also have a member or staff profile here, that access
                    will be kept.
                  </Text>

                  <View style={styles.withdrawModalActions}>
                    <TouchableOpacity
                      style={styles.withdrawCancelButton}
                      onPress={() => setShowWithdrawModal(false)}
                      activeOpacity={0.8}
                      disabled={withdrawSubmitting}
                    >
                      <Text style={styles.withdrawCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.withdrawConfirmButton}
                      onPress={confirmWithdrawAdmin}
                      activeOpacity={0.85}
                      disabled={withdrawSubmitting}
                    >
                      {withdrawSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons
                            name="shield-outline"
                            size={17}
                            color="#FFFFFF"
                          />
                          <Text style={styles.withdrawConfirmText}>
                            Withdraw
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {canManageBills && selectedAccount?.id && (
        <GenerateBillModal
          visible={showGenerateBill}
          onClose={() => setShowGenerateBill(false)}
          memberType={billMemberType}
          onMemberTypeChange={setBillMemberType}
          onSaved={handleBillSaved}
        />
      )}

      <SubscriptionPlanModal
        visible={showPlansModal}
        onClose={() => setShowPlansModal(false)}
        activePlanId={activePlan}
        activePlanPeriod={activePlanPeriod}
        canManage={canManageSubscription}
        plans={plans}
        user={{ phone: user?.phone }}
        startPayment={handleStartPayment}
        onPlanChanged={handlePlanChanged}
        onCancelSubscription={handleCancelSubscription}
      />

      <AppAlert state={alert.state} onDismiss={alert.dismiss} />
    </View>
  );
}

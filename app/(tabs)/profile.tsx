// app/(tabs)/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
// Inline custom alert
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
    if (btn.onPress) setTimeout(btn.onPress, 0);
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

  const dismiss = useCallback(() => setState(EMPTY_ALERT), []);

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
    | "subscription_cancelled"
    | "phone_changed"
    | "merge_users"
    | "opening_balance"
    | "calendar_event";
  title: string;
  description: string;
  amount?: number;
  status?: "paid" | "due";
  memberName?: string;
  timestamp: number;
  date: string;
  markedBy: string;
  actorRole?: string | null;
  actorPhoto?: string | null;
  targetName?: string | null;
  targetPhoto?: string | null;
  actorPhone?: string | null;
  targetPhone?: string | null;
  actorIsSelf?: boolean;
  targetIsSelf?: boolean;
  details?: Record<string, any>;
  oldValue?: string;
  newValue?: string;
}

interface AuditRow {
  id: number;
  account_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_phone: string | null;
  actor_photo: string | null;
  actor_role: string | null;
  target_user_id: string | null;
  target_name: string | null;
  target_phone: string | null;
  target_photo: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before: any;
  after: any;
  metadata: any;
  visibility: string;
  summary: string | null;
  created_at: string;
}

// ============================================================================
// HELPERS
// ============================================================================
function humanRole(role?: string | null): string {
  if (!role) return "";
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member_visibility":
      return "Member";
    case "staff_visibility":
      return "Staff";
    case "ownership_transfer":
      return "Ownership Transfer";
    default:
      return role;
  }
}

function shortRoleLabel(role?: string | null): string {
  if (!role) return "";
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member_visibility":
      return "Member";
    case "staff_visibility":
      return "Staff";
    case "ownership_transfer":
      return "Ownership Transfer";
    default:
      return role;
  }
}

function prettyPhone(phone?: string | null): string {
  if (!phone) return "";
  const ten = String(phone).replace(/\D/g, "").slice(-10);
  return ten.length === 10 ? `${ten.slice(0, 5)} ${ten.slice(5)}` : "";
}

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const result = name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return result || "?";
}

const HIDDEN_ACTIONS = new Set<string>(["staff.attendance_marked"]);

function isHiddenAuditRow(row: AuditRow): boolean {
  return HIDDEN_ACTIONS.has(`${row.entity_type}.${row.action}`);
}

function classifyAuditRow(row: AuditRow): HistoryEntry["type"] {
  const k = `${row.entity_type}.${row.action}`;
  switch (k) {
    case "member.payment_paid":
      return "maintenance_paid";
    case "member.payment_due":
      return "maintenance_due";
    case "staff.payment_paid":
      return "payment";
    case "staff.payment_due":
      return "payment";
    case "staff.attendance_marked":
      return "amount_changed";
    case "member.create":
      return "member_added";
    case "member.delete":
      return "member_removed";
    case "staff.create":
      return "staff_added";
    case "staff.delete":
      return "staff_removed";
    case "member.update":
    case "staff.update":
    case "account.update":
      return "amount_changed";
    case "account.create":
    case "account.delete":
    case "account.transfer_ownership":
    case "account_member.role_granted":
    case "account_member.role_revoked":
    case "invitation.create":
    case "invitation.delete":
    case "invitation.reject":
    case "invitation.accept":
      return "role_changed";
    case "expense.create":
      return "bill_generated";
    case "expense.update":
    case "expense.delete":
      return "amount_changed";
    case "calendar_event.create":
    case "calendar_event.update":
    case "calendar_event.approve":
    case "calendar_event.reject":
    case "calendar_event.delete":
      return "calendar_event";
    case "opening_balance.create":
    case "opening_balance.update":
      return "opening_balance";
    case "user.phone_changed":
      return "phone_changed";
    case "user.merge_users":
      return "merge_users";
    default:
      return "amount_changed";
  }
}

function buildHistoryTitle(
  row: AuditRow,
  actorIsSelf: boolean,
  targetIsSelf: boolean,
): string {
  const actor = actorIsSelf
    ? "You"
    : row.actor_name && row.actor_name.trim()
      ? row.actor_name
      : humanRole(row.actor_role) || "Someone";

  const target = targetIsSelf
    ? "you"
    : row.target_name && row.target_name.trim()
      ? row.target_name
      : null;

  const meta = row.metadata ?? {};
  const role = meta.role ? humanRole(meta.role) : "a role";
  const kind = meta.kind ?? "an event";
  const k = `${row.entity_type}.${row.action}`;

  switch (k) {
    // ── Account ────────────────────────────────────────────────────────
    case "account.create":
      return `${actor} created the account`;
    case "account.update":
      return `${actor} updated the account`;
    case "account.delete":
      return `${actor} deleted the account`;
    case "account.transfer_ownership":
      if (actorIsSelf && targetIsSelf) return `You transferred ownership`;
      if (targetIsSelf) return `${actor} transferred ownership to you`;
      return target
        ? `${actor} transferred ownership to ${target}`
        : `${actor} transferred ownership`;

    // ── Member (property) ──────────────────────────────────────────────
    case "member.create":
      if (targetIsSelf) return `${actor} added your property`;
      return target
        ? `${actor} added property for ${target}`
        : `${actor} added a property`;
    case "member.update":
      if (targetIsSelf) return `${actor} updated your property details`;
      return target
        ? `${actor} updated ${target}'s property details`
        : `${actor} updated a property`;
    case "member.delete":
      if (targetIsSelf) return `${actor} removed your property`;
      return target
        ? `${actor} removed property from ${target}`
        : `${actor} removed a property`;

    // ── Staff (role) ───────────────────────────────────────────────────
    case "staff.create":
      if (targetIsSelf) return `${actor} added your staff role`;
      return target
        ? `${actor} added staff role for ${target}`
        : `${actor} added a staff role`;
    case "staff.update":
      if (targetIsSelf) return `${actor} updated your staff details`;
      return target
        ? `${actor} updated ${target}'s staff details`
        : `${actor} updated a staff member`;
    case "staff.delete":
      if (targetIsSelf) return `${actor} removed your staff role`;
      return target
        ? `${actor} removed staff role from ${target}`
        : `${actor} removed a staff role`;

    // ── Payments ───────────────────────────────────────────────────────
    case "member.payment_paid":
      if (targetIsSelf) return `${actor} marked your maintenance PAID`;
      return target
        ? `${actor} marked maintenance PAID for ${target}`
        : `${actor} marked maintenance PAID`;
    case "member.payment_due":
      if (targetIsSelf) return `${actor} marked your maintenance DUE`;
      return target
        ? `${actor} marked maintenance DUE for ${target}`
        : `${actor} marked maintenance DUE`;
    case "staff.payment_paid":
      if (targetIsSelf) return `${actor} marked your salary PAID`;
      return target
        ? `${actor} marked salary PAID for ${target}`
        : `${actor} marked salary PAID`;
    case "staff.payment_due":
      if (targetIsSelf) return `${actor} marked your salary DUE`;
      return target
        ? `${actor} marked salary DUE for ${target}`
        : `${actor} marked salary DUE`;

    // ── Expenses ───────────────────────────────────────────────────────
    case "expense.create":
      return `${actor} added an expense`;
    case "expense.update":
      return `${actor} updated an expense`;
    case "expense.delete":
      return `${actor} deleted an expense`;

    // ── Account member role changes ────────────────────────────────────
    case "account_member.role_granted":
      if (actorIsSelf && targetIsSelf) return `You got ${role} access`;
      if (targetIsSelf) return `${actor} granted you ${role} access`;
      if (actorIsSelf)
        return `You granted ${role} access to ${target ?? "a user"}`;
      return target
        ? `${actor} granted ${role} access to ${target}`
        : `${actor} granted ${role} access`;
    case "account_member.role_revoked":
      if (actorIsSelf && targetIsSelf) return `You removed your ${role} access`;
      if (targetIsSelf) return `${actor} removed your ${role} access`;
      if (actorIsSelf)
        return `You removed ${role} access from ${target ?? "a user"}`;
      return target
        ? `${actor} removed ${role} access from ${target}`
        : `${actor} removed ${role} access`;

    // ── Invitations ────────────────────────────────────────────────────
    case "invitation.create":
      if (actorIsSelf && targetIsSelf)
        return `You invited yourself for ${role} access`;
      if (targetIsSelf) return `${actor} invited you for ${role} access`;
      if (actorIsSelf)
        return `You invited ${target ?? "a user"} for ${role} access`;
      return target
        ? `${actor} invited ${target} for ${role} access`
        : `${actor} invited a user for ${role} access`;
    case "invitation.delete":
      return target
        ? `${actor} cancelled invitation for ${target}`
        : `${actor} cancelled an invitation`;
    case "invitation.reject":
      if (actorIsSelf) return `You rejected the invitation`;
      return `${actor} rejected the invitation`;
    case "invitation.accept":
      if (actorIsSelf) return `You accepted invitation for ${role} access`;
      return `${actor} accepted invitation for ${role} access`;

    // ── Calendar ───────────────────────────────────────────────────────
    case "calendar_event.create":
      return `${actor} posted ${kind}`;
    case "calendar_event.update":
      return `${actor} updated ${kind}`;
    case "calendar_event.approve":
      return `${actor} approved ${kind}`;
    case "calendar_event.reject":
      return `${actor} rejected ${kind}`;
    case "calendar_event.delete":
      return `${actor} deleted ${kind}`;

    // ── Opening balance ────────────────────────────────────────────────
    case "opening_balance.create":
      return `${actor} added opening balance`;
    case "opening_balance.update":
      return `${actor} updated opening balance`;

    // ── Users ──────────────────────────────────────────────────────────
    case "user.phone_changed":
      return actorIsSelf
        ? "You changed your phone number"
        : `${actor} changed their phone number`;
    case "user.merge_users":
      return actorIsSelf ? "You merged accounts" : `${actor} merged accounts`;

    default:
      return `${actor} performed ${k}`;
  }
}

function mapAuditRowToHistoryEntry(
  row: AuditRow,
  currentUserId?: string | null,
): HistoryEntry {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const meta = row.metadata ?? {};

  const amount =
    after.netAmount ??
    before.netAmount ??
    after.amount ??
    before.amount ??
    meta.netAmount ??
    meta.amount ??
    undefined;

  const statusRaw = after.status ?? before.status;
  const status =
    statusRaw === "paid" || statusRaw === "due" ? statusRaw : undefined;

  const actorIsSelf = !!currentUserId && row.actor_user_id === currentUserId;
  const targetIsSelf = !!currentUserId && row.target_user_id === currentUserId;

  const actorName = actorIsSelf
    ? "You"
    : row.actor_name && row.actor_name.trim()
      ? row.actor_name
      : humanRole(row.actor_role) || "Unknown user";

  const targetName = targetIsSelf
    ? "You"
    : row.target_name && row.target_name.trim()
      ? row.target_name
      : null;

  const title = buildHistoryTitle(row, actorIsSelf, targetIsSelf);

  return {
    id: String(row.id),
    type: classifyAuditRow(row),
    title,
    description: title,
    amount: typeof amount === "number" ? amount : undefined,
    status,
    memberName: targetName ?? undefined,
    timestamp: new Date(row.created_at).getTime(),
    date: row.created_at,
    markedBy: actorName,
    actorRole: row.actor_role,
    actorPhoto: row.actor_photo ?? null,
    targetName: targetName,
    targetPhoto: row.target_photo ?? null,
    actorPhone: row.actor_phone ?? null,
    targetPhone: row.target_phone ?? null,
    actorIsSelf,
    targetIsSelf,
    oldValue: Object.keys(before).length ? JSON.stringify(before) : undefined,
    newValue: Object.keys(after).length ? JSON.stringify(after) : undefined,
    details: meta,
  };
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
  adminRowBadgeBg: { backgroundColor: "#EDE9FE" },
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
    marginTop: 16,
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
  historyItemContent: { flex: 1, minWidth: 0 },
  historyItemTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  historyItemDescription: { fontSize: 12, color: "#64748B", marginTop: 2 },
  historyItemDate: { fontSize: 10, color: "#94A3B8" },
  historyItemAmount: { fontSize: 14, fontWeight: "800", color: "#0F172A" },

  historyModalRoot: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  historyModalHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF6",
  },
  historyModalBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  historyModalTitleCol: { flex: 1, minWidth: 0 },
  historyModalTitleBig: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  historyModalSubtitleBig: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  historyModalCountPill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  historyModalCountPillText: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "800",
  },
  historyModalBody: {
    flex: 1,
  },
  historyModalBodyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },

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
// Person chip styles
// ============================================================================
const chipStyles = StyleSheet.create({
  block: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatarText: { fontWeight: "800", letterSpacing: 0.3 },
  info: { flex: 1, minWidth: 0 },
  name: { color: "#0F172A", fontSize: 13, fontWeight: "700" },
  phone: { color: "#475569", fontSize: 11, fontWeight: "600", marginTop: 1 },
  role: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 1,
  },
  selfBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
    marginLeft: 6,
  },
  selfBadgeText: {
    color: "#1D4ED8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  connectorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    marginVertical: 2,
  },
  connectorLine: { width: 14, height: 1, backgroundColor: "#CBD5E1" },
  connectorArrow: { color: "#94A3B8", fontSize: 12, fontWeight: "800" },
});

// ============================================================================
// History icon mapping
// ============================================================================
function getHistoryIcon(type: HistoryEntry["type"]): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
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
    case "phone_changed":
      return { icon: "call-outline", color: "#0891B2", bg: "#CFFAFE" };
    case "merge_users":
      return {
        icon: "git-merge-outline",
        color: "#7C3AED",
        bg: "#F3E8FF",
      };
    case "opening_balance":
      return { icon: "wallet-outline", color: "#059669", bg: "#D1FAE5" };
    case "calendar_event":
      return { icon: "calendar-outline", color: "#7C3AED", bg: "#F3E8FF" };
    default:
      return {
        icon: "information-circle-outline",
        color: "#64748B",
        bg: "#F1F5F9",
      };
  }
}

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

  const historyScope: "full" | "self" | "none" =
    isOwner || isAdmin ? "full" : "self";

  const alert = useAppAlert();
  const showAlert = alert.show;

  const insets = useSafeAreaInsets();

  const topInset = Math.max(
    insets.top,
    Platform.OS === "ios" ? 44 : (StatusBar.currentHeight ?? 0),
  );
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 0);

  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [showPhoneTooltip, setShowPhoneTooltip] = useState(false);
  const [showGenerateBill, setShowGenerateBill] = useState(false);
  const [billMemberType, setBillMemberType] = useState<BillMemberType>("owner");

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const hasLoadedHistoryOnce = useRef(false);

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

  useEffect(() => {
    SecureStore.getItemAsync("notifications_enabled").then((v) => {
      if (v !== null) setNotifications(v === "true");
    });
  }, []);

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

  const loadHistory = useCallback(
    async (silent = false) => {
      if (!selectedAccount?.id) {
        setHistory([]);
        return;
      }

      if (!silent) setHistoryLoading(true);

      try {
        const token = await getAuthToken();
        if (!token) {
          if (!silent) setHistory([]);
          return;
        }

        const url =
          historyScope === "full"
            ? `${API_URL}/api/accounts/${selectedAccount.id}/history?limit=100`
            : `${API_URL}/api/accounts/${selectedAccount.id}/history/me?limit=100`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!silent) setHistory([]);
          return;
        }

        const data = await res.json();
        const rows: AuditRow[] = Array.isArray(data?.history)
          ? data.history
          : [];

        const visibleRows = rows.filter((r) => !isHiddenAuditRow(r));

        setHistory(
          visibleRows.map((r) => mapAuditRowToHistoryEntry(r, user?.id)),
        );
        hasLoadedHistoryOnce.current = true;
      } catch (err) {
        console.warn("[profile] loadHistory failed:", err);
        if (!silent) setHistory([]);
      } finally {
        if (!silent) setHistoryLoading(false);
      }
    },
    [selectedAccount?.id, historyScope, getAuthToken, user?.id],
  );

  useEffect(() => {
    loadHistory(false);
  }, [loadHistory]);

  useFocusEffect(
    useCallback(() => {
      loadHistory(true);
      loadAccountPeople();
    }, [loadHistory, loadAccountPeople]),
  );

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

  const handlePhoneRowPress = () => {
    if (isOwner) {
      router.push("/(modals)/account-profile");
    } else {
      setShowPhoneTooltip(true);
    }
  };

  const handleBillSaved = () => {
    loadHistory(true);
  };

  const toggleNotifications = async (value: boolean) => {
    setNotifications(value);
    await SecureStore.setItemAsync(
      "notifications_enabled",
      value ? "true" : "false",
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
    const { plan, period, isUpgrade, isDowngrade } = payload;
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
      await loadHistory(true);

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
      onPress: () => toggleNotifications(!notifications),
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
          onValueChange={toggleNotifications}
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

  const renderPersonChip = (
    person: {
      name: string | null;
      phone: string | null;
      photo: string | null;
      role: string | null;
      isSelf: boolean;
    },
    compact: boolean,
  ) => {
    const avatarSize = compact ? 30 : 36;

    if (person.isSelf) {
      return (
        <View style={chipStyles.row}>
          <View
            style={[
              chipStyles.avatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: "#DBEAFE",
              },
            ]}
          >
            {person.photo ? (
              <Image
                source={{ uri: person.photo }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={100}
              />
            ) : (
              <Ionicons
                name="person"
                size={compact ? 14 : 16}
                color="#1D4ED8"
              />
            )}
          </View>
          <View style={chipStyles.info}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={[
                  chipStyles.name,
                  compact && { fontSize: 12 },
                  { color: "#1D4ED8" },
                ]}
              >
                You
              </Text>
              <View style={chipStyles.selfBadge}>
                <Text style={chipStyles.selfBadgeText}>YOU</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    const displayName =
      person.name && person.name.trim()
        ? person.name
        : prettyPhone(person.phone) || "Unknown user";

    const phoneText =
      prettyPhone(person.phone) && person.name?.trim()
        ? prettyPhone(person.phone)
        : null;

    const roleText = shortRoleLabel(person.role);

    return (
      <View style={chipStyles.row}>
        <View
          style={[
            chipStyles.avatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: "#F1F5F9",
            },
          ]}
        >
          {person.photo ? (
            <Image
              source={{ uri: person.photo }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={100}
            />
          ) : (
            <Text
              style={[
                chipStyles.avatarText,
                {
                  color: "#64748B",
                  fontSize: compact ? 11 : 12,
                },
              ]}
            >
              {initialsOf(person.name)}
            </Text>
          )}
        </View>

        <View style={chipStyles.info}>
          <Text
            style={[chipStyles.name, compact && { fontSize: 12 }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>

          {phoneText ? (
            <Text
              style={[chipStyles.phone, compact && { fontSize: 10 }]}
              numberOfLines={1}
            >
              {phoneText}
            </Text>
          ) : null}

          {roleText ? (
            <Text
              style={[chipStyles.role, compact && { fontSize: 9 }]}
              numberOfLines={1}
            >
              {roleText}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderHistoryRow = (
    item: HistoryEntry,
    isLast: boolean,
    compact = false,
  ) => {
    const iconInfo = getHistoryIcon(item.type);

    const actorIsSelf = !!item.actorIsSelf;
    const targetIsSelf = !!item.targetIsSelf;

    const actor = {
      name: actorIsSelf ? "You" : item.markedBy,
      phone: item.actorPhone ?? null,
      photo: item.actorPhoto ?? null,
      role: item.actorRole ?? null,
      isSelf: actorIsSelf,
    };

    const showTarget = !!item.targetName && item.targetName !== item.markedBy;

    const target = showTarget
      ? {
          name: targetIsSelf ? "You" : item.targetName!,
          phone: item.targetPhone ?? null,
          photo: item.targetPhoto ?? null,
          role: null,
          isSelf: targetIsSelf,
        }
      : null;

    return (
      <View
        key={item.id}
        style={[
          styles.historyItem,
          isLast && styles.historyItemLast,
          compact && { paddingHorizontal: 14, paddingVertical: 12 },
        ]}
      >
        <View style={styles.historyItemHeader}>
          <View
            style={[
              styles.historyIconContainer,
              {
                backgroundColor: iconInfo.bg,
                ...(compact ? { width: 32, height: 32 } : {}),
              },
            ]}
          >
            <Ionicons
              name={iconInfo.icon}
              size={compact ? 16 : 18}
              color={iconInfo.color}
            />
          </View>

          <View style={styles.historyItemContent}>
            <Text
              style={[styles.historyItemTitle, compact && { fontSize: 13 }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
          </View>

          {item.amount ? (
            <Text
              style={[styles.historyItemAmount, compact && { fontSize: 13 }]}
            >
              {formatCurrency(item.amount)}
            </Text>
          ) : null}
        </View>

        <View
          style={[
            chipStyles.block,
            { paddingLeft: compact ? 42 : 46, marginTop: compact ? 6 : 8 },
          ]}
        >
          {renderPersonChip(actor, compact)}

          {target ? (
            <View style={chipStyles.connectorWrap}>
              <View style={chipStyles.connectorLine} />
              <Text style={chipStyles.connectorArrow}>→</Text>
            </View>
          ) : null}

          {target ? renderPersonChip(target, compact) : null}
        </View>

        <Text
          style={[
            styles.historyItemDate,
            compact && { fontSize: 9 },
            {
              marginTop: 8,
              paddingLeft: compact ? 42 : 46,
            },
          ]}
        >
          {formatDate(item.date)}
        </Text>
      </View>
    );
  };

  // ==========================================================================
  // Full-screen history modal — safe area applied directly via insets.
  // ==========================================================================
  const renderHistoryModal = () => (
    <Modal
      visible={showHistoryModal}
      animationType="slide"
      onRequestClose={() => setShowHistoryModal(false)}
      presentationStyle="fullScreen"
    >
      <View
        style={[
          styles.historyModalRoot,
          {
            paddingTop: topInset,
            paddingBottom: bottomInset,
          },
        ]}
      >
        <View style={styles.historyModalHeaderBar}>
          <TouchableOpacity
            style={styles.historyModalBackBtn}
            onPress={() => setShowHistoryModal(false)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#475569" />
          </TouchableOpacity>

          <View style={styles.historyModalTitleCol}>
            <Text style={styles.historyModalTitleBig}>
              {historyScope === "full" ? "Account History" : "My History"}
            </Text>
            <Text style={styles.historyModalSubtitleBig}>
              {historyScope === "full"
                ? "Every action in this account"
                : "Your activity in this account"}
            </Text>
          </View>

          <View style={styles.historyModalCountPill}>
            <Text style={styles.historyModalCountPillText}>
              {history.length}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.historyModalBody}
          contentContainerStyle={styles.historyModalBodyContent}
          showsVerticalScrollIndicator
        >
          {historyLoading && !hasLoadedHistoryOnce.current ? (
            <View style={styles.noHistoryContainer}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={[styles.noHistoryText, { marginTop: 12 }]}>
                Loading history…
              </Text>
            </View>
          ) : history.length === 0 ? (
            <View style={styles.noHistoryContainer}>
              <View style={styles.noHistoryIcon}>
                <Ionicons name="time-outline" size={28} color="#94A3B8" />
              </View>
              <Text style={styles.noHistoryTitle}>No history yet</Text>
              <Text style={styles.noHistoryText}>
                Activity on this account will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.historyCard}>
              {history.map((item, index) =>
                renderHistoryRow(item, index === history.length - 1, false),
              )}
            </View>
          )}
        </ScrollView>
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
                <Text style={styles.adminHeaderTitle}>Admin</Text>
                <Text style={styles.adminHeaderSubtitle}>
                  Contact the society admin for any help
                </Text>
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
            ) : adminDirectory.length === 0 ? (
              <View style={[styles.adminRow, styles.adminRowLast]}>
                <Text
                  style={[
                    styles.adminRowPhone,
                    { marginLeft: 0, marginTop: 0 },
                  ]}
                >
                  No admins yet.
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
              <Text style={styles.historyTitle}>
                {historyScope === "full" ? "Account History" : "My History"}
              </Text>
              <Text style={styles.historySubtitle}>
                {historyScope === "full"
                  ? "Track all activities in your society"
                  : "Your activity on this account"}
              </Text>
            </View>
            <View style={styles.historyTotalBadge}>
              <Text style={styles.historyTotalText}>{history.length}</Text>
            </View>
          </View>

          {historyLoading && !hasLoadedHistoryOnce.current ? (
            <View style={styles.noHistoryContainer}>
              <ActivityIndicator size="small" color="#2563EB" />
            </View>
          ) : history.length === 0 ? (
            <View style={styles.noHistoryContainer}>
              <View style={styles.noHistoryIcon}>
                <Ionicons name="time-outline" size={28} color="#94A3B8" />
              </View>
              <Text style={styles.noHistoryTitle}>No history yet</Text>
              <Text style={styles.noHistoryText}>
                Activity on this account will appear here.
              </Text>
            </View>
          ) : (
            history
              .slice(0, 3)
              .map((item, index) =>
                renderHistoryRow(
                  item,
                  index === Math.min(history.length, 3) - 1,
                  true,
                ),
              )
          )}

          <TouchableOpacity
            style={styles.viewAllHistoryButton}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllHistoryText}>View All History</Text>
            <Ionicons name="chevron-forward" size={16} color="#2563EB" />
          </TouchableOpacity>
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

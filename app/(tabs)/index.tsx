// app/(tabs)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAccounts } from "../../hooks/useAccounts";
import { useExpenses, useMembers, useStaff } from "../../hooks/useManagement";
import { useUserRole } from "../../hooks/useUserRole";
import { generateBillPDF, savePDFToDevice } from "../../services/pdfGenerator";
import { useAttendanceStore } from "../../store/attendanceStore";
import { BillMemberType, useBillStore } from "../../store/billStore";
import { useAuthStore } from "../../store/useAuthStore";
import type { AttendanceStatus, Member } from "../../types";
import { PaymentCategory } from "../../types/payment";

/* ============================================================
   TYPES
   ============================================================ */

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tab: "apartment" | "staff" | "expense";
}

type AttendanceStatusUI =
  | "present"
  | "absent"
  | "holiday"
  | "half_day"
  | "weekend"
  | "none";

type TransactionType = "income" | "expense";

type OpeningBalanceResponse = {
  account_id: string;
  opening_balance: number;
  updated_by: string | null;
  updated_by_phone?: string | null;
  updated_at: string | null;
  can_edit?: boolean;
};

type PendingAdminOffer = {
  id: string;
  account_id: string;
  account_name: string;
  account_photo_url: string | null;
  invited_name: string | null;
  invited_by_phone: string | null;
  created_at: string;
  current_role: string | null;
};

type PendingOwnershipOffer = {
  id: string;
  account_id: string;
  account_name: string;
  account_photo_url: string | null;
  invited_name: string | null;
  invited_by_phone: string | null;
  created_at: string;
  current_role: string | null;
};

type MyRole = {
  role:
    | "admin"
    | "member_visibility"
    | "staff_visibility"
    | "ownership_transfer";
  grantId: string;
  accepted_by: string | null;
};

type RevokePreview = {
  userId: string;
  phone: string | null;
  isAdmin: boolean;
  memberProfile: {
    id: string;
    name: string;
    wing: string | null;
    flatNumber: string | null;
    role: string | null;
  } | null;
  staffProfile: {
    id: string;
    name: string;
    role: string | null;
  } | null;
};

type OwnerContact = {
  userId: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const ADMIN_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "members",
    title: "Add Member",
    subtitle: "Add a resident",
    icon: "person-add-outline",
    color: "#2563EB",
    tab: "apartment",
  },
  {
    id: "staff",
    title: "Add Staff",
    subtitle: "Manage staff",
    icon: "people-outline",
    color: "#16A34A",
    tab: "staff",
  },
  {
    id: "expense",
    title: "Add Expense",
    subtitle: "Record spending",
    icon: "receipt-outline",
    color: "#EA580C",
    tab: "expense",
  },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const STATUS_COLORS: Record<
  AttendanceStatusUI,
  { bg: string; text: string; label: string }
> = {
  present: { bg: "#DCFCE7", text: "#15803D", label: "Present" },
  absent: { bg: "#FEE2E2", text: "#DC2626", label: "Absent" },
  holiday: { bg: "#DBEAFE", text: "#2563EB", label: "Holiday" },
  half_day: { bg: "#FEF3C7", text: "#D97706", label: "Half Day" },
  weekend: { bg: "#F1F5F9", text: "#64748B", label: "Weekend" },
  none: { bg: "#F1F5F9", text: "#94A3B8", label: "—" },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const OPENING_BALANCE_PREFIX = "/opening-balance";

/* ============================================================
   HELPERS
   ============================================================ */

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function openingBalanceRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  const token = await getAuthToken();
  const url = `${API_BASE_URL}${OPENING_BALANCE_PREFIX}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err: any = new Error(
      data?.message || `Request failed with status ${res.status}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

/**
 * Fetch owner + admins for a given account using the existing
 * accountController.getAccountPeople endpoint.
 */
async function fetchAccountOwnerContact(
  accountId: string,
): Promise<{ owner: OwnerContact | null; admins: OwnerContact[] }> {
  const token = await getAuthToken();
  if (!token || !API_BASE_URL) return { owner: null, admins: [] };

  try {
    const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/people`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { owner: null, admins: [] };

    const data: any = await res.json();

    const norm = (p?: string | null) => {
      if (!p) return null;
      const d = String(p).replace(/\D/g, "");
      return d.length > 10 ? d.slice(-10) : d;
    };

    const shape = (r: any): OwnerContact => ({
      userId: r?.user_id ?? r?.userId ?? "",
      name: String(r?.name || "").trim(),
      phone: norm(r?.phone),
      photoUrl: r?.photo_url ?? r?.photoUrl ?? null,
    });

    return {
      owner: data?.owner ? shape(data.owner) : null,
      admins: Array.isArray(data?.admins) ? data.admins.map(shape) : [],
    };
  } catch {
    return { owner: null, admins: [] };
  }
}

async function dialPhone(raw: string | null | undefined) {
  if (!raw) return;
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return;
  try {
    await Linking.openURL(`tel:+91${ten}`);
  } catch (e) {
    console.warn("[home] dial failed:", e);
  }
}

function formatCurrency(amount: number) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `₹${Math.abs(safeAmount).toLocaleString("en-IN")}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function getCurrentMonth() {
  return new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getMemberRoleLabel(role?: string) {
  if (!role) return "Member";
  const map: Record<string, string> = {
    flat: "Flat Owner",
    shop: "Shop Owner",
    custom: "Custom",
  };
  const key = String(role).toLowerCase();
  return (
    map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getStaffRoleLabel(role?: string) {
  if (!role) return "Staff";
  const map: Record<string, string> = {
    sweeper: "Sweeper",
    security: "Security",
    maintenance: "Maintenance",
    gardener: "Gardener",
    driver: "Driver",
    accountant: "Accountant",
    custom: "Custom",
  };
  const key = String(role).toLowerCase();
  return (
    map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function pluralizeAccounts(count: number): string {
  return count === 1 ? "1 account" : `${count} accounts`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizePhone(raw?: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function toDateOnly(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).trim().split(/[T ]/)[0];
}

function toMonthKey(raw?: string | null): string {
  if (!raw) return "";
  return toDateOnly(raw).slice(0, 7);
}

function getTransactionType(txn: any): TransactionType {
  if (!txn) return "expense";
  const raw = String(txn.transactionType ?? txn.transaction_type ?? "")
    .trim()
    .toLowerCase();
  if (raw === "income") return "income";
  if (raw === "expense") return "expense";
  if (txn?.category === "maintenance") return "income";
  return "expense";
}

function roleLabelFromId(role?: string | null): string {
  if (!role) return "Member";
  if (role === "admin") return "Admin";
  if (role === "member_visibility") return "Member";
  if (role === "staff_visibility") return "Staff";
  if (role === "ownership_transfer") return "Owner";
  return "Member";
}

function parseDateParts(raw: string): {
  year: string;
  month: string;
  day: string;
} | null {
  if (!raw) return null;
  const datePart = String(raw).trim().split(/[T ]/)[0];
  const parts = datePart.split("-");
  if (parts.length < 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day || year.length !== 4) return null;
  return { year, month: month.padStart(2, "0"), day: day.padStart(2, "0") };
}

function formatFullDate(dateStr: string) {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function formatMonthLong(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function getCalculatedStaffSalary(
  salary: number,
  month: string,
  statuses: Record<string, AttendanceStatus | AttendanceStatusUI>,
): number {
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const paidDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(
    (day) => {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const defaultStatus: AttendanceStatus =
        new Date(`${date}T00:00:00`).getDay() % 6 === 0 ? "weekend" : "present";
      return (statuses[date] ?? defaultStatus) !== "absent";
    },
  ).length;
  return Math.round((salary / daysInMonth) * paidDays);
}

function normalizeAttendanceStatus(raw: any): AttendanceStatusUI | "none" {
  if (!raw) return "none";
  const v = String(raw).trim().toLowerCase();
  if (v === "present") return "present";
  if (v === "absent") return "absent";
  if (v === "holiday") return "holiday";
  if (v === "half_day" || v === "half-day" || v === "halfday")
    return "half_day";
  if (v === "weekend") return "weekend";
  return "none";
}

/* ============================================================
   FINANCE HELPERS
   ============================================================ */

type PaidEntry = {
  category: PaymentCategory;
  amount: number;
  paidDate: string;
};

function collectMemberPaidEntries(members: any[]): PaidEntry[] {
  const out: PaidEntry[] = [];

  for (const member of members) {
    const isSalary = member?.monthlySalary !== undefined;
    const category: PaymentCategory = isSalary ? "salary" : "maintenance";
    const mp = member?.monthlyPayments;

    if (!mp || typeof mp !== "object") {
      const pd = member?.paidDate ? toDateOnly(member.paidDate) : "";
      if (pd) {
        const base = isSalary
          ? Number(member.monthlySalary) || 0
          : Number(member.maintenanceAmount) || 0;
        out.push({ category, amount: base, paidDate: pd });
      }
      continue;
    }

    for (const billingMonth of Object.keys(mp)) {
      const entry = mp[billingMonth];
      if (!entry || entry.status !== "paid") continue;

      const pd = entry.paidDate
        ? toDateOnly(entry.paidDate)
        : `${billingMonth}-01`;

      let amount = 0;
      if (entry?.netAmount != null) {
        amount = Number(entry.netAmount) || 0;
      } else {
        const base = isSalary
          ? Number(member.monthlySalary) || 0
          : Number(member.maintenanceAmount) || 0;
        const add = Number(entry?.additionalAmount) || 0;
        const ded = Number(entry?.deductionAmount) || 0;
        amount = Math.max(0, base + add - ded);
      }

      out.push({ category, amount, paidDate: pd });
    }
  }

  return out;
}

function computeMonthlyFinance(
  members: any[],
  expenses: any[],
  monthKey: string,
): { income: number; expense: number; net: number } {
  const entries = collectMemberPaidEntries(members);

  let income = 0;
  let expense = 0;

  for (const row of entries) {
    if (toMonthKey(row.paidDate) !== monthKey) continue;
    if (row.category === "salary") expense += row.amount;
    else income += row.amount;
  }

  for (const expenseRow of expenses || []) {
    if (expenseRow.status !== "paid") continue;
    const anchor = toMonthKey(
      expenseRow.dueDate || expenseRow.expense_date || "",
    );
    if (anchor !== monthKey) continue;
    const type = getTransactionType(expenseRow);
    const amt = Number(expenseRow.amount) || 0;
    if (type === "income") income += amt;
    else expense += amt;
  }

  return { income, expense, net: income - expense };
}

function computeAllTimeFinance(
  members: any[],
  expenses: any[],
): { income: number; expense: number; net: number } {
  const entries = collectMemberPaidEntries(members);

  let income = 0;
  let expense = 0;

  for (const row of entries) {
    if (row.category === "salary") expense += row.amount;
    else income += row.amount;
  }

  for (const expenseRow of expenses || []) {
    if (expenseRow.status !== "paid") continue;
    const type = getTransactionType(expenseRow);
    const amt = Number(expenseRow.amount) || 0;
    if (type === "income") income += amt;
    else expense += amt;
  }

  return { income, expense, net: income - expense };
}

/* ============================================================
   BILL MISSING MODAL — custom in-app alert with owner photo
   ============================================================ */

function BillMissingModal({
  visible,
  owner,
  admins,
  onClose,
}: {
  visible: boolean;
  owner: OwnerContact | null;
  admins: OwnerContact[];
  onClose: () => void;
}) {
  const hasOwner = !!(owner && (owner.name || owner.phone));

  const primaryContacts: OwnerContact[] = [];
  if (hasOwner && owner) primaryContacts.push(owner);
  for (const a of admins) {
    if (a.name || a.phone) primaryContacts.push(a);
  }

  const renderContact = (
    contact: OwnerContact,
    idx: number,
    isOwner: boolean,
  ) => {
    const initial = (contact.name || "?").charAt(0).toUpperCase();
    const canCall = !!contact.phone;

    return (
      <View key={`contact-${idx}`} style={styles.billContactRow}>
        <View
          style={[
            styles.billContactAvatar,
            isOwner && styles.billContactAvatarOwner,
          ]}
        >
          {contact.photoUrl ? (
            <Image
              source={{ uri: contact.photoUrl }}
              style={styles.billContactAvatarImage}
            />
          ) : (
            <Text style={styles.billContactInitial}>{initial}</Text>
          )}
        </View>

        <View style={styles.billContactInfo}>
          <View style={styles.billContactNameRow}>
            <Text style={styles.billContactName} numberOfLines={1}>
              {contact.name || (isOwner ? "Owner" : "Admin")}
            </Text>
            {isOwner ? (
              <View style={styles.billOwnerBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#B45309" />
                <Text style={styles.billOwnerBadgeText}>OWNER</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.billContactPhone} numberOfLines={1}>
            {contact.phone ? `+91 ${contact.phone}` : "No phone on file"}
          </Text>
        </View>

        {canCall ? (
          <TouchableOpacity
            style={styles.billCallButton}
            onPress={() => dialPhone(contact.phone)}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={16} color="#FFFFFF" />
            <Text style={styles.billCallButtonText}>Call</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={styles.billModalCard}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.billModalIcon}>
            <Ionicons name="document-text" size={26} color="#D97706" />
          </View>

          <Text style={styles.billModalTitle}>Bill template missing</Text>

          <Text style={styles.billModalDesc}>
            The bill template hasn't been set up for this property yet. Please
            request the owner to generate it from{" "}
            <Text style={{ fontWeight: "800" }}>Profile → Generate Bill</Text>.
          </Text>

          {primaryContacts.length > 0 ? (
            <View style={styles.billContactsWrap}>
              <Text style={styles.billContactsLabel}>
                {primaryContacts.length === 1 ? "Contact" : "Contacts"}
              </Text>
              {primaryContacts
                .slice(0, 3)
                .map((c, i) => renderContact(c, i, i === 0 && hasOwner))}
            </View>
          ) : (
            <Text style={styles.billModalNoContact}>
              Owner contact is not available right now.
            </Text>
          )}

          <TouchableOpacity
            style={styles.billModalCloseBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.billModalCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============================================================
   REUSABLE COMPONENTS
   ============================================================ */

function GroupOverviewCard({
  title,
  subtitle,
  count,
  countLabel,
  icon,
  color,
  onPress,
}: {
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.groupOverviewCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.groupOverviewHeader}>
        <View
          style={[styles.groupOverviewIcon, { backgroundColor: `${color}15` }]}
        >
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={styles.groupOverviewChevron}>
          <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
        </View>
      </View>

      <Text style={styles.groupOverviewTitle}>{title}</Text>
      <Text style={styles.groupOverviewSubtitle} numberOfLines={1}>
        {subtitle}
      </Text>

      <View style={styles.groupOverviewCountRow}>
        <Text style={[styles.groupOverviewCount, { color }]}>{count}</Text>
        <Text style={styles.groupOverviewCountLabel}>{countLabel}</Text>
      </View>
    </Pressable>
  );
}

function QuickActionCard({
  action,
  onPress,
}: {
  action: QuickAction;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickActionCard,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.quickActionIcon,
          { backgroundColor: `${action.color}12` },
        ]}
      >
        <Ionicons name={action.icon} size={23} color={action.color} />
      </View>
      <View style={styles.quickActionContent}>
        <Text style={styles.quickActionTitle}>{action.title}</Text>
        <Text style={styles.quickActionSubtitle}>{action.subtitle}</Text>
      </View>
      <View
        style={[
          styles.quickActionArrow,
          { backgroundColor: `${action.color}10` },
        ]}
      >
        <Ionicons name="chevron-forward" size={15} color={action.color} />
      </View>
    </Pressable>
  );
}

function FinancialCard({
  title,
  amount,
  icon,
  color,
  background,
  period,
}: {
  title: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  period?: string;
}) {
  return (
    <View style={styles.financialCard}>
      <View style={[styles.financialIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={styles.financialLabel}>{title}</Text>
      <Text
        style={[styles.financialAmount, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {amount < 0 ? "-" : ""}
        {formatCurrency(amount)}
      </Text>
      <Text style={styles.financialPeriod}>{period ?? "This month"}</Text>
    </View>
  );
}

function ProfileCard({ user, onEdit }: { user: any; onEdit: () => void }) {
  const displayName = user?.name || "My Profile";
  const rawPhone = normalizePhone(user?.phone);
  const photo = user?.photoUrl || null;
  const initial = displayName.charAt(0)?.toUpperCase() || "?";

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}
    >
      <View style={styles.profileHeader}>
        <View style={styles.profileAvatar}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.profileAvatarImage} />
          ) : (
            <Text style={styles.profileInitial}>{initial}</Text>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.profilePhoneRow}>
            <Ionicons name="call-outline" size={13} color="#64748B" />
            <Text style={styles.profilePhone}>
              {rawPhone ? `+91 ${rawPhone}` : "No phone on file"}
            </Text>
          </View>
        </View>
        <View style={styles.profileEditChip}>
          <Ionicons name="create-outline" size={14} color="#2563EB" />
          <Text style={styles.profileEditText}>Edit</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MyRolesCard({
  roles,
  onWithdraw,
  busy,
  loading,
}: {
  roles: MyRole[];
  onWithdraw: () => void;
  busy: boolean;
  loading: boolean;
}) {
  const roleMeta = (role: MyRole["role"]) => {
    if (role === "admin")
      return { label: "Admin", bg: "#EDE9FE", color: "#7C3AED" };
    if (role === "member_visibility")
      return { label: "Member", bg: "#DCFCE7", color: "#16A34A" };
    if (role === "staff_visibility")
      return { label: "Staff", bg: "#E0F2FE", color: "#0284C7" };
    return { label: "Owner", bg: "#FEF3C7", color: "#B45309" };
  };

  const showSkeleton = loading && roles.length === 0;

  return (
    <View style={styles.myRolesCard}>
      <View style={styles.myRolesHeaderRow}>
        <View style={styles.myRolesHeaderLeft}>
          <Text style={styles.myRolesTitle}>My Access</Text>
          <Text style={styles.myRolesSubtitle}>
            Your roles on this property
          </Text>
        </View>

        <View style={styles.myRolesChipsRight}>
          {showSkeleton ? (
            <>
              <View style={styles.myRolesSkeletonChip} />
              <View
                style={[
                  styles.myRolesSkeletonChip,
                  { width: 46, opacity: 0.7 },
                ]}
              />
            </>
          ) : roles.length === 0 ? (
            <View style={styles.myRolesEmptyChip}>
              <Text style={styles.myRolesEmptyChipText}>No roles</Text>
            </View>
          ) : (
            roles.map((r) => {
              const meta = roleMeta(r.role);
              return (
                <View
                  key={r.role}
                  style={[styles.myRoleChip, { backgroundColor: meta.bg }]}
                >
                  <Text style={[styles.myRoleChipText, { color: meta.color }]}>
                    {meta.label.toUpperCase()}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.withdrawAdminRow}
        onPress={onWithdraw}
        activeOpacity={0.75}
        disabled={busy}
      >
        <Ionicons name="exit-outline" size={16} color="#DC2626" />
        <Text style={styles.withdrawAdminRowText}>
          {busy ? "Withdrawing…" : "Withdraw my access"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  trackColorOn?: string;
  trackColorOff?: string;
  thumbColor?: string;
}

function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  trackColorOn = "#2563EB",
  trackColorOff = "#CBD5E1",
  thumbColor = "#FFFFFF",
}: ToggleSwitchProps) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: trackColorOff, true: trackColorOn }}
      thumbColor={thumbColor}
      ios_backgroundColor={trackColorOff}
    />
  );
}

function PendingAdminOfferBanner({
  offer,
  busy,
  onAccept,
  onReject,
}: {
  offer: PendingAdminOffer;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const currentLabel = roleLabelFromId(offer.current_role);
  return (
    <View style={styles.offerBanner}>
      <View style={styles.offerBannerHeader}>
        <View style={styles.offerBannerIcon}>
          <Ionicons name="shield-checkmark" size={20} color="#7C3AED" />
        </View>
        <View style={styles.offerBannerHeaderText}>
          <View style={styles.upgradeTitleRow}>
            <Text style={styles.offerBannerTitle} numberOfLines={1}>
              Upgrade to Admin
            </Text>
            <View style={styles.upgradePillGroup}>
              <View style={styles.upgradePillFrom}>
                <Text style={styles.upgradePillFromText}>
                  {currentLabel.toUpperCase()}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={11} color="#94A3B8" />
              <View style={styles.upgradePillTo}>
                <Text style={styles.upgradePillToText}>ADMIN</Text>
              </View>
            </View>
          </View>
          <Text style={styles.offerBannerSubtitle} numberOfLines={2}>
            {offer.account_name || "This account"} wants to upgrade your{" "}
            {currentLabel.toLowerCase()} access to Admin. You'll keep your
            existing role.
          </Text>
        </View>
      </View>

      <View style={styles.offerBannerActions}>
        <TouchableOpacity
          style={[styles.offerBannerBtn, styles.offerBannerReject]}
          onPress={onReject}
          activeOpacity={0.8}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <>
              <Ionicons name="close-outline" size={16} color="#DC2626" />
              <Text style={styles.offerBannerRejectText}>Reject</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.offerBannerBtn, styles.offerBannerAccept]}
          onPress={onAccept}
          activeOpacity={0.85}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={styles.offerBannerAcceptText}>Accept upgrade</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PendingOwnershipOfferBanner({
  offer,
  busy,
  onAccept,
  onReject,
}: {
  offer: PendingOwnershipOffer;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const currentLabel = roleLabelFromId(offer.current_role);
  return (
    <View style={styles.ownershipBanner}>
      <View style={styles.ownershipBannerHeader}>
        <View style={styles.ownershipBannerIcon}>
          <Ionicons name="swap-horizontal" size={20} color="#B45309" />
        </View>
        <View style={styles.ownershipBannerHeaderText}>
          <View style={styles.upgradeTitleRow}>
            <Text style={styles.ownershipBannerTitle} numberOfLines={1}>
              Ownership transfer
            </Text>
            <View style={styles.upgradePillGroup}>
              <View style={styles.ownershipPillFrom}>
                <Text style={styles.ownershipPillFromText}>
                  {currentLabel.toUpperCase()}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={11} color="#94A3B8" />
              <View style={styles.ownershipPillTo}>
                <Text style={styles.ownershipPillToText}>OWNER</Text>
              </View>
            </View>
          </View>
          <Text style={styles.ownershipBannerSubtitle} numberOfLines={3}>
            {offer.account_name || "This account"} wants to transfer full
            ownership to you. You'll become the new owner and keep your{" "}
            {currentLabel.toLowerCase()} access.
          </Text>
        </View>
      </View>

      <View style={styles.ownershipBannerActions}>
        <TouchableOpacity
          style={[styles.offerBannerBtn, styles.ownershipBannerReject]}
          onPress={onReject}
          activeOpacity={0.8}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#B45309" />
          ) : (
            <>
              <Ionicons name="close-outline" size={16} color="#B45309" />
              <Text style={styles.ownershipBannerRejectText}>Decline</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.offerBannerBtn, styles.ownershipBannerAccept]}
          onPress={onAccept}
          activeOpacity={0.85}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={styles.ownershipBannerAcceptText}>
                Accept ownership
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ============================================================
   MONTH / YEAR PICKER MODAL
   ============================================================ */

function MonthYearPickerModal({
  visible,
  year,
  month,
  onClose,
  onSelect,
}: {
  visible: boolean;
  year: number;
  month: number;
  onClose: () => void;
  onSelect: (year: number, month: number) => void;
}) {
  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);

  const yearScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (visible) {
      setDraftYear(year);
      setDraftMonth(month);
    }
  }, [visible, year, month]);

  const currentYear = new Date().getFullYear();
  const START_YEAR = Math.min(currentYear - 10, year - 2);
  const END_YEAR = Math.max(currentYear + 15, year + 5);

  const years: number[] = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) years.push(y);

  useEffect(() => {
    if (!visible) return;
    const index = years.indexOf(draftYear);
    if (index < 0) return;

    const chipWidth = 72;
    const offset = Math.max(0, index * chipWidth - 100);

    requestAnimationFrame(() => {
      yearScrollRef.current?.scrollTo({ x: offset, animated: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, draftYear, years.length]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={() => {}}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Month & Year</Text>
            <Pressable onPress={onClose} style={styles.pickerClose}>
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          <Text style={styles.pickerSectionLabel}>Year</Text>

          <ScrollView
            ref={yearScrollRef}
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.yearRow}
            keyboardShouldPersistTaps="handled"
          >
            {years.map((y) => {
              const active = y === draftYear;
              return (
                <TouchableOpacity
                  key={y}
                  onPress={() => setDraftYear(y)}
                  style={[styles.yearChip, active && styles.yearChipActive]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.yearChipText,
                      active && styles.yearChipTextActive,
                    ]}
                  >
                    {y}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.pickerSectionLabel}>Month</Text>
          <View style={styles.monthGrid}>
            {MONTHS.map((m, idx) => {
              const active = idx === draftMonth;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDraftMonth(idx)}
                  style={[styles.monthChip, active && styles.monthChipActive]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.monthChipText,
                      active && styles.monthChipTextActive,
                    ]}
                  >
                    {m.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.pickerConfirm}
            onPress={() => {
              onSelect(draftYear, draftMonth);
              onClose();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.pickerConfirmText}>Apply</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============================================================
   ATTENDANCE CALENDAR
   ============================================================ */

function AttendanceCalendar({
  staffId,
  month,
  year,
  getStatuses,
}: {
  staffId: string;
  month: number;
  year: number;
  getStatuses: (
    staffId: string,
    monthKey: string,
  ) =>
    | {
        statuses?: Record<string, any>;
        calculatedSalary?: number | null;
      }
    | undefined;
}) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const cache = getStatuses(staffId, monthKey);

  const statuses: Record<string, AttendanceStatusUI> = useMemo(() => {
    const out: Record<string, AttendanceStatusUI> = {};
    const raw = cache?.statuses ?? {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = normalizeAttendanceStatus(v);
    }
    return out;
  }, [cache]);

  const daysCells = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const first = getFirstDayOfMonth(year, month);
    const cells: (number | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [year, month]);

  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  const dayStatus = useCallback(
    (day: number): AttendanceStatusUI => {
      const key = formatDateKey(year, month, day);
      const explicit = statuses[key];
      if (explicit && explicit !== "none") return explicit;

      const dow = new Date(year, month, day).getDay();
      if (dow === 0 || dow === 6) return "weekend";

      if (isCurrentMonth && day > today.getDate()) return "none";
      return "present";
    },
    [statuses, year, month, isCurrentMonth, today],
  );

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, holiday: 0, halfDay: 0 };
    const daysInMonth = getDaysInMonth(year, month);
    for (let d = 1; d <= daysInMonth; d++) {
      const st = dayStatus(d);
      if (st === "present") s.present++;
      else if (st === "absent") s.absent++;
      else if (st === "holiday" || st === "weekend") s.holiday++;
      else if (st === "half_day") s.halfDay++;
    }
    return s;
  }, [dayStatus, year, month]);

  const hasAnyRecord = Object.keys(statuses).length > 0;

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <View
            style={[
              styles.summaryDot,
              { backgroundColor: STATUS_COLORS.present.text },
            ]}
          />
          <Text style={styles.summaryLabel}>Present</Text>
          <Text style={styles.summaryValue}>{summary.present}</Text>
        </View>
        <View style={styles.summaryItem}>
          <View
            style={[
              styles.summaryDot,
              { backgroundColor: STATUS_COLORS.absent.text },
            ]}
          />
          <Text style={styles.summaryLabel}>Absent</Text>
          <Text style={styles.summaryValue}>{summary.absent}</Text>
        </View>
        <View style={styles.summaryItem}>
          <View
            style={[
              styles.summaryDot,
              { backgroundColor: STATUS_COLORS.half_day.text },
            ]}
          />
          <Text style={styles.summaryLabel}>Half</Text>
          <Text style={styles.summaryValue}>{summary.halfDay}</Text>
        </View>
        <View style={styles.summaryItem}>
          <View
            style={[
              styles.summaryDot,
              { backgroundColor: STATUS_COLORS.holiday.text },
            ]}
          />
          <Text style={styles.summaryLabel}>Holiday</Text>
          <Text style={styles.summaryValue}>{summary.holiday}</Text>
        </View>
      </View>

      {!hasAnyRecord ? (
        <View style={styles.attendanceEmpty}>
          <Ionicons name="calendar-outline" size={26} color="#94A3B8" />
          <Text style={styles.attendanceEmptyTitle}>
            No attendance recorded yet
          </Text>
          <Text style={styles.attendanceEmptyText}>
            Attendance for {MONTHS[month]} {year} hasn't been marked by the
            admin yet.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((d, i) => (
              <View key={i} style={styles.weekCell}>
                <Text style={styles.weekText}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {daysCells.map((day, index) => {
              if (day === null) {
                return (
                  <View key={`empty-${index}`} style={styles.calendarCell} />
                );
              }
              const key = formatDateKey(year, month, day);
              const st = dayStatus(day);
              const colors = STATUS_COLORS[st] ?? STATUS_COLORS.none;
              const isToday = key === todayKey;

              return (
                <View key={key} style={styles.calendarCell}>
                  <View
                    style={[
                      styles.dayBubble,
                      { backgroundColor: colors.bg },
                      isToday && styles.dayBubbleToday,
                    ]}
                  >
                    <Text style={[styles.dayText, { color: colors.text }]}>
                      {day}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            {(
              ["present", "absent", "half_day", "holiday", "weekend"] as const
            ).map((k) => (
              <View key={k} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: STATUS_COLORS[k].bg },
                    { borderColor: STATUS_COLORS[k].text },
                  ]}
                />
                <Text style={styles.legendText}>{STATUS_COLORS[k].label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/* ============================================================
   MAIN SCREEN
   ============================================================ */

export default function HomeScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();

  const {
    accounts,
    selectedAccount,
    isLoading: accountsLoading,
    refresh: refreshAccounts,
  } = useAccounts();

  const accountId = selectedAccount?.id ?? null;

  const membersHook = useMembers(accountId);
  const staffHook = useStaff(accountId);
  const { items: expenses } = useExpenses(accountId);

  const apartmentMembers = membersHook.items;
  const staffMembers = staffHook.items;

  const allMembers: Member[] = useMemo(
    () => [...apartmentMembers, ...staffMembers],
    [apartmentMembers, staffMembers],
  );

  const { user, refreshProfile } = useAuthStore();
  const { isAdmin, isMember, isStaff } = useUserRole();

  const showQuickActions = isAdmin;
  const showBalanceCard = isAdmin;
  const showFinance = isAdmin || isMember;

  const [refreshing, setRefreshing] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);

  const now = new Date();

  const [selfYear, setSelfYear] = useState(now.getFullYear());
  const [selfMonth, setSelfMonth] = useState(now.getMonth());
  const [showSelfPicker, setShowSelfPicker] = useState(false);

  const selfMonthKey = useMemo(
    () => `${selfYear}-${String(selfMonth + 1).padStart(2, "0")}`,
    [selfYear, selfMonth],
  );

  const [downloadingBillKey, setDownloadingBillKey] = useState<string | null>(
    null,
  );

  // Attendance modal (uses top-level month; no internal slider)
  const [attendanceModalStaffId, setAttendanceModalStaffId] = useState<
    string | null
  >(null);
  const [attendanceModalMeta, setAttendanceModalMeta] = useState<{
    name: string;
    role: string;
  } | null>(null);

  // Bill-missing modal
  const [billMissingVisible, setBillMissingVisible] = useState(false);
  const [billMissingOwner, setBillMissingOwner] = useState<OwnerContact | null>(
    null,
  );
  const [billMissingAdmins, setBillMissingAdmins] = useState<OwnerContact[]>(
    [],
  );

  const [pendingAdminOffers, setPendingAdminOffers] = useState<
    PendingAdminOffer[]
  >([]);
  const [pendingOwnershipOffers, setPendingOwnershipOffers] = useState<
    PendingOwnershipOffer[]
  >([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

  const [myRoles, setMyRoles] = useState<MyRole[]>([]);
  const [myRolesLoading, setMyRolesLoading] = useState(true);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawPreview, setWithdrawPreview] = useState<RevokePreview | null>(
    null,
  );
  const [withdrawPreviewLoading, setWithdrawPreviewLoading] = useState(false);
  const [withdrawingAccess, setWithdrawingAccess] = useState(false);
  const [keepMemberVisibility, setKeepMemberVisibility] = useState(true);
  const [keepStaffVisibility, setKeepStaffVisibility] = useState(true);

  const getAttendanceRecord = useAttendanceStore((s) => s.getRecord);
  const cacheAttendance = useAttendanceStore((s) => s.saveRecord);

  const {
    getBillConfig,
    fetchConfigFromServer,
    templates: billTemplates,
  } = useBillStore();

  const accountIdsKey = useMemo(
    () =>
      accounts
        .map((a) => a.id)
        .sort()
        .join(","),
    [accounts],
  );

  const handleSelfPrevMonth = () => {
    if (selfMonth === 0) {
      setSelfYear((y) => y - 1);
      setSelfMonth(11);
    } else {
      setSelfMonth((m) => m - 1);
    }
  };

  const handleSelfNextMonth = () => {
    if (selfMonth === 11) {
      setSelfYear((y) => y + 1);
      setSelfMonth(0);
    } else {
      setSelfMonth((m) => m + 1);
    }
  };

  const handleOpenMembersGroup = useCallback(() => {
    router.push({
      pathname: "/(tabs)/people",
      params: { tab: "apartment" },
    });
  }, [router]);

  const handleOpenStaffGroup = useCallback(() => {
    router.push({
      pathname: "/(tabs)/people",
      params: { tab: "staff" },
    });
  }, [router]);

  /* ── Load pending offers ── */
  const loadPendingOffers = useCallback(async () => {
    if (!user?.phone) {
      setPendingAdminOffers([]);
      setPendingOwnershipOffers([]);
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      setPendingAdminOffers([]);
      setPendingOwnershipOffers([]);
      return;
    }

    setOffersLoading(true);
    try {
      const url = `${API_BASE_URL}/me/invitations`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setPendingAdminOffers([]);
        setPendingOwnershipOffers([]);
        return;
      }

      const data: any = await res.json();
      const rows: any[] = Array.isArray(data?.invitations)
        ? data.invitations
        : [];

      const myAccountIds = new Set(
        accountIdsKey ? accountIdsKey.split(",") : [],
      );

      const adminOffers: PendingAdminOffer[] = [];
      const ownershipOffers: PendingOwnershipOffer[] = [];

      for (const r of rows) {
        if (!r) continue;
        if (r.status !== "pending") continue;
        if (!myAccountIds.has(r.account_id)) continue;

        const currentRole: string | null = r.current_role ?? null;
        if (!currentRole) continue;

        if (r.role === "admin") {
          adminOffers.push({
            id: r.id,
            account_id: r.account_id,
            account_name: r.account_name ?? "",
            account_photo_url: r.account_photo_url ?? null,
            invited_name: r.invited_name ?? null,
            invited_by_phone: r.invited_by_phone ?? null,
            created_at: r.created_at ?? "",
            current_role: currentRole,
          });
        } else if (r.role === "ownership_transfer") {
          ownershipOffers.push({
            id: r.id,
            account_id: r.account_id,
            account_name: r.account_name ?? "",
            account_photo_url: r.account_photo_url ?? null,
            invited_name: r.invited_name ?? null,
            invited_by_phone: r.invited_by_phone ?? null,
            created_at: r.created_at ?? "",
            current_role: currentRole,
          });
        }
      }

      setPendingAdminOffers(adminOffers);
      setPendingOwnershipOffers(ownershipOffers);
    } catch (e) {
      console.warn("[home] loadPendingOffers failed:", e);
      setPendingAdminOffers([]);
      setPendingOwnershipOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, [user?.phone, accountIdsKey]);

  useEffect(() => {
    if (isFocused) {
      loadPendingOffers();
    }
  }, [isFocused, loadPendingOffers]);

  /* ── Load my grants ── */
  const loadMyRoles = useCallback(async () => {
    if (!selectedAccount?.id || !user?.id) {
      setMyRoles([]);
      setMyRolesLoading(true);
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      setMyRoles([]);
      setMyRolesLoading(false);
      return;
    }

    setMyRolesLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/accounts/${selectedAccount.id}/invitations`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setMyRoles([]);
        return;
      }
      const data: any = await res.json();
      const rows: any[] = Array.isArray(data?.invitations)
        ? data.invitations
        : Array.isArray(data)
          ? data
          : [];

      const mine: MyRole[] = rows
        .filter(
          (r) =>
            r?.status === "accepted" &&
            r?.accepted_by === user.id &&
            (r.role === "admin" ||
              r.role === "member_visibility" ||
              r.role === "staff_visibility" ||
              r.role === "ownership_transfer"),
        )
        .map((r) => ({
          role: r.role,
          grantId: r.id,
          accepted_by: r.accepted_by ?? null,
        }));

      setMyRoles(mine);
    } catch (e) {
      console.warn("[home] loadMyRoles failed:", e);
      setMyRoles([]);
    } finally {
      setMyRolesLoading(false);
    }
  }, [selectedAccount?.id, user?.id]);

  useEffect(() => {
    if (isFocused) {
      loadMyRoles();
    }
  }, [isFocused, loadMyRoles]);

  useFocusEffect(
    useCallback(() => {
      if (!accountId) return;
      let cancelled = false;
      (async () => {
        try {
          await Promise.all([
            membersHook.refresh({ force: true }),
            staffHook.refresh({ force: true }),
            loadMyRoles(),
          ]);
          await refreshProfile();
        } catch (e) {
          if (!cancelled) {
            console.warn("[home] focus refresh failed:", e);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]),
  );

  /* ── Accept / Reject admin upgrade ── */
  const handleAcceptOffer = async (offer: PendingAdminOffer) => {
    const token = await getAuthToken();
    if (!token) return;
    setBusyOfferId(offer.id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/invitations/${offer.id}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        await loadPendingOffers();
        return;
      }
      setPendingAdminOffers((prev) => prev.filter((o) => o.id !== offer.id));
      await refreshAccounts();
      await loadMyRoles();
    } catch (e) {
      console.warn("[home] accept offer failed:", e);
    } finally {
      setBusyOfferId(null);
    }
  };

  const handleRejectOffer = async (offer: PendingAdminOffer) => {
    const token = await getAuthToken();
    if (!token) return;
    setBusyOfferId(offer.id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/invitations/${offer.id}/reject`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        await loadPendingOffers();
        return;
      }
      setPendingAdminOffers((prev) => prev.filter((o) => o.id !== offer.id));
    } catch (e) {
      console.warn("[home] reject offer failed:", e);
    } finally {
      setBusyOfferId(null);
    }
  };

  /* ── Accept / Reject ownership transfer ── */
  const handleAcceptOwnership = async (offer: PendingOwnershipOffer) => {
    const token = await getAuthToken();
    if (!token) return;
    setBusyOfferId(offer.id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/invitations/${offer.id}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        await loadPendingOffers();
        return;
      }
      setPendingOwnershipOffers((prev) =>
        prev.filter((o) => o.id !== offer.id),
      );
      await refreshAccounts();
      await loadMyRoles();
      Alert.alert(
        "You're now the owner",
        `${offer.account_name || "This account"} has been transferred to you.`,
      );
    } catch (e) {
      console.warn("[home] accept ownership failed:", e);
    } finally {
      setBusyOfferId(null);
    }
  };

  const handleRejectOwnership = async (offer: PendingOwnershipOffer) => {
    const token = await getAuthToken();
    if (!token) return;
    setBusyOfferId(offer.id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/invitations/${offer.id}/reject`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        await loadPendingOffers();
        return;
      }
      setPendingOwnershipOffers((prev) =>
        prev.filter((o) => o.id !== offer.id),
      );
    } catch (e) {
      console.warn("[home] reject ownership failed:", e);
    } finally {
      setBusyOfferId(null);
    }
  };

  /* ── Withdraw modal ── */
  const openWithdrawModal = useCallback(async () => {
    if (!selectedAccount?.id || !user?.id) return;

    setWithdrawPreview(null);
    setWithdrawPreviewLoading(true);
    setKeepMemberVisibility(true);
    setKeepStaffVisibility(true);
    setShowWithdrawModal(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        setWithdrawPreviewLoading(false);
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/accounts/${selectedAccount.id}/access/${user.id}/preview-revoke`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        setWithdrawPreview(null);
        return;
      }

      const data: RevokePreview = await res.json();
      setWithdrawPreview(data);
    } catch (e) {
      console.warn("[home] preview withdraw failed:", e);
      setWithdrawPreview(null);
    } finally {
      setWithdrawPreviewLoading(false);
    }
  }, [selectedAccount?.id, user?.id]);

  const closeWithdrawModal = () => {
    if (withdrawingAccess) return;
    setShowWithdrawModal(false);
    setWithdrawPreview(null);
    setWithdrawPreviewLoading(false);
    setKeepMemberVisibility(true);
    setKeepStaffVisibility(true);
  };

  const handleWithdrawAccess = async () => {
    if (!selectedAccount?.id || !user?.id) return;
    const token = await getAuthToken();
    if (!token) return;

    setWithdrawingAccess(true);
    try {
      const hasAdmin = myRoles.some((r) => r.role === "admin");
      const hasMember = myRoles.some((r) => r.role === "member_visibility");
      const hasStaff = myRoles.some((r) => r.role === "staff_visibility");

      const calls: Array<{
        role: "admin" | "member_visibility" | "staff_visibility";
        body: Record<string, boolean>;
      }> = [];

      if (hasAdmin) {
        calls.push({
          role: "admin",
          body: {
            keepMemberVisibility:
              withdrawPreview?.memberProfile != null
                ? keepMemberVisibility
                : false,
            keepStaffVisibility:
              withdrawPreview?.staffProfile != null
                ? keepStaffVisibility
                : false,
          },
        });
      } else {
        if (hasMember && !keepMemberVisibility) {
          calls.push({ role: "member_visibility", body: {} });
        }
        if (hasStaff && !keepStaffVisibility) {
          calls.push({ role: "staff_visibility", body: {} });
        }
      }

      if (calls.length === 0) {
        Alert.alert(
          "Nothing to withdraw",
          "You have to turn off at least one role to withdraw access.",
        );
        setWithdrawingAccess(false);
        return;
      }

      for (const call of calls) {
        const res = await fetch(
          `${API_BASE_URL}/accounts/${selectedAccount.id}/access/${user.id}?role=${call.role}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(call.body),
          },
        );

        if (!res.ok) {
          Alert.alert(
            "Error",
            `Failed to withdraw ${call.role.replace(/_/g, " ")}.`,
          );
          setWithdrawingAccess(false);
          return;
        }
      }

      closeWithdrawModal();
      await Promise.all([loadMyRoles(), refreshAccounts()]);

      const kept: string[] = [];
      if (hasAdmin && withdrawPreview?.memberProfile && keepMemberVisibility) {
        kept.push("Member");
      }
      if (hasAdmin && withdrawPreview?.staffProfile && keepStaffVisibility) {
        kept.push("Staff");
      }
      if (!hasAdmin && hasMember && keepMemberVisibility) {
        kept.push("Member");
      }
      if (!hasAdmin && hasStaff && keepStaffVisibility) {
        kept.push("Staff");
      }

      const suffix =
        kept.length > 0
          ? ` You still have: ${kept.join(" and ")}.`
          : " You no longer have access to this property.";

      Alert.alert("Access withdrawn", suffix.trim());
    } catch (e) {
      console.error("[home] withdraw access failed:", e);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setWithdrawingAccess(false);
    }
  };

  useEffect(() => {
    if (!selectedAccount?.id) {
      setOpeningBalance(0);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await openingBalanceRequest<OpeningBalanceResponse>(
          `/${selectedAccount.id}`,
        );
        if (!cancelled) {
          setOpeningBalance(Number(data.opening_balance) || 0);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[home] opening balance fetch failed:", e);
          setOpeningBalance(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAccount?.id]);

  const matchedMemberProfiles = useMemo(() => {
    if (!user || !selectedAccount) return [];
    return apartmentMembers.filter((m: any) => m.userId === user.id);
  }, [user, selectedAccount, apartmentMembers]);

  const matchedStaffProfiles = useMemo(() => {
    if (!user || !selectedAccount) return [];
    return staffMembers.filter((s: any) => s.userId === user.id);
  }, [user, selectedAccount, staffMembers]);

  const hasAnyProfile =
    matchedMemberProfiles.length > 0 || matchedStaffProfiles.length > 0;

  /* ── Fetch attendance for own staff profiles across all accounts ── */
  useEffect(() => {
    if (!user?.id) return;
    if (!accounts.length) return;

    let cancelled = false;

    (async () => {
      const token = await getAuthToken();
      if (!token) return;

      for (const acct of accounts) {
        try {
          const staffRes = await fetch(
            `${API_BASE_URL}/management/accounts/${acct.id}/staff`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (cancelled) return;

          const staffList: any[] = staffRes.ok ? await staffRes.json() : [];

          const ownStaff = Array.isArray(staffList)
            ? staffList.filter((s: any) => s.user_id === user.id)
            : [];

          for (const s of ownStaff) {
            try {
              const res = await fetch(
                `${API_BASE_URL}/management/${acct.id}/staff/${s.id}/attendance/${selfMonthKey}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );

              if (cancelled) return;
              if (!res.ok) continue;

              const raw: any = await res.json();
              if (cancelled) return;
              if (!raw) continue;

              const statuses: Record<string, any> = raw.statuses ?? {};
              const rawCalc =
                raw.calculated_salary ?? raw.calculatedSalary ?? null;
              const calculatedSalary =
                rawCalc != null && Number.isFinite(Number(rawCalc))
                  ? Number(rawCalc)
                  : null;

              if (Object.keys(statuses).length > 0) {
                cacheAttendance({
                  memberId: s.id,
                  month: selfMonthKey,
                  statuses: statuses as any,
                  calculatedSalary,
                });
              }
            } catch {
              // silent
            }
          }
        } catch {
          // silent
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, accounts, selfMonthKey]);

  const dashboardData = useMemo(() => {
    const emptyData = {
      stats: {
        totalProperties: 0,
        totalStaff: 0,
        monthlyIncome: 0,
        monthlyExpense: 0,
      },
      allTime: {
        income: 0,
        expense: 0,
        net: 0,
      },
    };

    if (!showFinance || !selectedAccount) return emptyData;

    try {
      const currentMonth = `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, "0")}`;

      const monthly = computeMonthlyFinance(
        allMembers,
        expenses ?? [],
        currentMonth,
      );
      const allTime = computeAllTimeFinance(allMembers, expenses ?? []);

      return {
        stats: {
          totalProperties: apartmentMembers.length,
          totalStaff: staffMembers.length,
          monthlyIncome: monthly.income,
          monthlyExpense: monthly.expense,
        },
        allTime,
      };
    } catch (error) {
      console.error("Error calculating dashboard data:", error);
      return emptyData;
    }
  }, [
    selectedAccount,
    allMembers,
    apartmentMembers,
    staffMembers,
    showFinance,
    expenses,
  ]);

  const stats = dashboardData.stats;
  const allTime = dashboardData.allTime;

  const totalMemberRecords = apartmentMembers.length;

  const monthlyNet =
    openingBalance + (stats.monthlyIncome - stats.monthlyExpense);
  const isMonthlyPositive = monthlyNet >= 0;

  const overallIncome = allTime.income;
  const overallExpense = allTime.expense;
  const overallNet = openingBalance + allTime.net;
  const isOverallPositive = overallNet >= 0;

  /* ── Self bill download ── */
  const handleSelfDownloadBill = useCallback(
    async (opts: {
      member: any;
      memberType: BillMemberType;
      isApartment: boolean;
      accountId: string | null;
    }) => {
      const accId = opts.accountId ?? selectedAccount?.id ?? null;
      if (!accId) return;
      if (!opts.member?.id) return;

      const key = `${opts.memberType}:${accId}:${opts.member.id}:${selfMonthKey}`;
      if (downloadingBillKey === key) return;

      setDownloadingBillKey(key);

      try {
        const mp = opts.member.monthlyPayments?.[selfMonthKey];
        const paidStatus = mp?.status;
        const paidDate = mp?.paidDate || opts.member.paidDate || null;

        if (paidStatus !== "paid") {
          setDownloadingBillKey(null);
          Alert.alert(
            "Not paid yet",
            `This month's payment hasn't been marked paid for ${formatMonthLong(
              selfMonthKey,
            )}.`,
          );
          return;
        }

        let billConfig = getBillConfig(opts.memberType);
        if (!billConfig) {
          try {
            billConfig = await fetchConfigFromServer(accId, opts.memberType);
          } catch (e) {
            console.warn("[home] fetch bill config failed:", e);
          }
        }

        if (!billConfig) {
          const { owner, admins } = await fetchAccountOwnerContact(accId);
          setDownloadingBillKey(null);
          setBillMissingOwner(owner);
          setBillMissingAdmins(admins);
          setBillMissingVisible(true);
          return;
        }

        const selectedTemplate =
          billTemplates.find((t) => t.id === billConfig!.templateId) ??
          billTemplates[0];

        if (!selectedTemplate) {
          setDownloadingBillKey(null);
          Alert.alert(
            "Template not found",
            "Could not resolve the template. Please re-save it from Profile → Generate Bill.",
          );
          return;
        }

        const template = {
          colors: {
            ...selectedTemplate.colors,
            primary: billConfig.accentColor ?? selectedTemplate.colors.primary,
          },
          fontFamily: selectedTemplate.fontFamily ?? "Roboto",
          logoPosition: selectedTemplate.logoPosition ?? "top-left",
          showBorder: selectedTemplate.showBorder ?? true,
          borderColor: selectedTemplate.borderColor ?? "#e0e0e0",
          borderWidth: selectedTemplate.borderWidth ?? 1,
          borderRadius: selectedTemplate.borderRadius ?? 8,
          showWatermark: selectedTemplate.showWatermark ?? true,
          watermarkText: selectedTemplate.watermarkText ?? "Society Management",
          layoutVariant: selectedTemplate.layoutVariant ?? "bold",
        };

        let baseAmount = opts.isApartment
          ? Number(opts.member.maintenanceAmount) || 0
          : Number(opts.member.monthlySalary) || 0;

        if (!opts.isApartment) {
          const att = getAttendanceRecord(opts.member.id, selfMonthKey);
          if (att?.calculatedSalary != null) {
            baseAmount = att.calculatedSalary;
          } else if (att?.statuses && Object.keys(att.statuses).length > 0) {
            baseAmount = getCalculatedStaffSalary(
              Number(opts.member.monthlySalary) || 0,
              selfMonthKey,
              att.statuses as any,
            );
          }
        }

        const additionalAmount = Number(mp?.additionalAmount) || 0;
        const deductionAmount = Number(mp?.deductionAmount) || 0;
        const netAmount = Math.max(
          0,
          baseAmount + additionalAmount - deductionAmount,
        );

        const billNumber = `BILL-${opts.member.id
          .slice(0, 4)
          .toUpperCase()}-${Date.now().toString().slice(-6)}`;

        const billData = {
          billNumber,
          apartmentName: opts.member.wing || "Apartment",
          address:
            billConfig.address || (selectedAccount as any)?.address || "",
          societyName:
            billConfig.societyName ||
            selectedAccount?.name ||
            "Apartment Society",
          contactNumber: billConfig.contactNumber || "",
          email: billConfig.email || "",
          memberName: opts.member.name,
          flatNumber: opts.member.flatNumber || "",
          amount: baseAmount,
          month: formatMonthLong(selfMonthKey),
          paidDate: paidDate || new Date().toISOString().slice(0, 10),
          additionalAmount: additionalAmount || undefined,
          additionalNote: mp?.additionalNote || undefined,
          deductionAmount: deductionAmount || undefined,
          deductionNote: mp?.deductionNote || undefined,
          netAmount,
          signData: billConfig.signature,
          template,
          billType: opts.isApartment
            ? ("maintenance" as const)
            : ("salary" as const),
          staffRole: opts.isApartment ? undefined : opts.member.role,
        };

        const pdfUri = await generateBillPDF(billData);
        if (!pdfUri) throw new Error("PDF generation returned no URI.");

        const safeName = (opts.member.name || "Member").replace(
          /[^\w\-]+/g,
          "_",
        );
        const fileName = `Bill-${safeName}-${selfMonthKey}.pdf`;

        const result = await savePDFToDevice(pdfUri, fileName);

        setDownloadingBillKey(null);

        if (result.saved) {
          Alert.alert("Downloaded", "Bill saved successfully.");
        } else if (result.message !== "Permission denied") {
          Alert.alert(
            "Download failed",
            result.message || "Could not save the bill. Please try again.",
          );
        }
      } catch (error) {
        console.error("[home] Error generating self bill:", error);
        setDownloadingBillKey(null);
        Alert.alert(
          "Something went wrong",
          error instanceof Error
            ? error.message
            : "Failed to generate bill. Please try again.",
        );
      }
    },
    [
      selectedAccount,
      selfMonthKey,
      downloadingBillKey,
      getBillConfig,
      fetchConfigFromServer,
      billTemplates,
      getAttendanceRecord,
    ],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPendingOffers();
      await loadMyRoles();
      await refreshProfile();
      if (selectedAccount?.id) {
        try {
          const data = await openingBalanceRequest<OpeningBalanceResponse>(
            `/${selectedAccount.id}`,
          );
          setOpeningBalance(Number(data.opening_balance) || 0);
        } catch (e) {
          console.warn("[home] refresh opening balance failed:", e);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      setRefreshing(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    router.push({
      pathname: "/(tabs)/people",
      params: { tab: action.tab },
    });
  };

  const handleOpenProfile = () => {
    router.push("/(modals)/edit-profile");
  };

  /* ============================================================
     PROFILE BLOCK
     ============================================================ */

  const renderProfileBlock = () => {
    const hasMembers = matchedMemberProfiles.length > 0;
    const hasStaff = matchedStaffProfiles.length > 0;
    const accountIsOwner = selectedAccount?.ownerId === user?.id;

    return (
      <>
        <ProfileCard user={user} onEdit={handleOpenProfile} />

        {!accountIsOwner ? (
          <MyRolesCard
            roles={myRoles}
            busy={withdrawingAccess}
            loading={myRolesLoading}
            onWithdraw={openWithdrawModal}
          />
        ) : null}

        {hasAnyProfile ? (
          <View style={styles.rolesSection}>
            <Text style={styles.rolesSectionTitle}>
              My Roles on this Property
            </Text>

            {/* Shared month/year slider */}
            <View style={styles.roleMonthSwitcher}>
              <TouchableOpacity
                onPress={handleSelfPrevMonth}
                style={styles.roleMonthArrow}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={18} color="#2563EB" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowSelfPicker(true)}
                style={styles.roleMonthCenter}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={14} color="#64748B" />
                <Text style={styles.roleMonthText}>
                  {MONTHS[selfMonth]} {selfYear}
                </Text>
                <Ionicons name="chevron-down" size={14} color="#64748B" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSelfNextMonth}
                style={styles.roleMonthArrow}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={18} color="#2563EB" />
              </TouchableOpacity>
            </View>

            {/* MEMBER ROWS — no navigation on tap, informational only */}
            {hasMembers ? (
              <View style={styles.groupCard}>
                <Pressable
                  onPress={handleOpenMembersGroup}
                  style={({ pressed }) => [
                    styles.groupCardHeader,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.groupCardHeaderLeft}>
                    <View
                      style={[
                        styles.groupCardHeaderIcon,
                        { backgroundColor: "#EFF6FF" },
                      ]}
                    >
                      <Ionicons name="home-outline" size={16} color="#2563EB" />
                    </View>
                    <Text style={styles.groupCardHeaderTitle}>Member</Text>
                  </View>
                  <View style={styles.groupCardHeaderRight}>
                    <View style={styles.groupCardHeaderBadge}>
                      <Text style={styles.groupCardHeaderBadgeText}>
                        {pluralizeAccounts(matchedMemberProfiles.length)}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#94A3B8"
                    />
                  </View>
                </Pressable>

                <View style={styles.groupCardBody}>
                  {matchedMemberProfiles.map((member: any, index: number) => {
                    const unit =
                      member.unit ||
                      [member.wing, member.flatNumber]
                        .filter(Boolean)
                        .join(" · ") ||
                      "Account";
                    const roleLabel = getMemberRoleLabel(member.role);

                    const mp = member.monthlyPayments?.[selfMonthKey];
                    const isPaid = mp?.status === "paid";
                    const paidDate = mp?.paidDate ?? null;

                    const baseAmount = Number(member.maintenanceAmount) || 0;
                    const add = Number(mp?.additionalAmount) || 0;
                    const ded = Number(mp?.deductionAmount) || 0;
                    const payableAmount =
                      mp?.netAmount != null
                        ? Number(mp.netAmount)
                        : Math.max(0, baseAmount + add - ded);

                    const downloadKey = `owner:${selectedAccount?.id}:${member.id}:${selfMonthKey}`;
                    const isDownloading = downloadingBillKey === downloadKey;

                    return (
                      <View
                        key={`member-${member.id}`}
                        style={[
                          styles.roleRowWrap,
                          index === matchedMemberProfiles.length - 1 &&
                            styles.roleRowWrapLast,
                        ]}
                      >
                        {/* Read-only row (no navigation) */}
                        <View style={styles.roleRowTop}>
                          <View style={styles.groupRowInfo}>
                            <Text
                              style={styles.groupRowTitle}
                              numberOfLines={1}
                            >
                              {unit}
                            </Text>
                            <View style={styles.roleRowMetaRow}>
                              <View
                                style={[
                                  styles.roleChip,
                                  {
                                    backgroundColor: "#EFF6FF",
                                    borderColor: "#BFDBFE",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.roleChipText,
                                    { color: "#1D4ED8" },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {roleLabel}
                                </Text>
                              </View>
                              <Text
                                style={styles.roleRowAmount}
                                numberOfLines={1}
                              >
                                {formatCurrency(payableAmount)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.roleRowStatusWrap}>
                            <View
                              style={[
                                styles.statusPill,
                                isPaid
                                  ? styles.statusPillPaid
                                  : styles.statusPillDue,
                              ]}
                            >
                              <View
                                style={[
                                  styles.selfStatusDot,
                                  {
                                    backgroundColor: isPaid
                                      ? "#16A34A"
                                      : "#DC2626",
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.statusPillText,
                                  {
                                    color: isPaid ? "#15803D" : "#DC2626",
                                  },
                                ]}
                              >
                                {isPaid ? "Paid" : "Due"}
                              </Text>
                            </View>
                            {isPaid && paidDate ? (
                              <Text
                                style={styles.roleRowPaidDate}
                                numberOfLines={1}
                              >
                                {formatFullDate(paidDate)}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        {isPaid ? (
                          <View style={styles.roleRowActions}>
                            <TouchableOpacity
                              style={[
                                styles.roleRowBtn,
                                styles.roleRowBtnPrimary,
                                isDownloading && { opacity: 0.6 },
                              ]}
                              onPress={() =>
                                handleSelfDownloadBill({
                                  member,
                                  memberType: "owner",
                                  isApartment: true,
                                  accountId: selectedAccount?.id ?? null,
                                })
                              }
                              activeOpacity={0.85}
                              disabled={isDownloading}
                            >
                              {isDownloading ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#FFFFFF"
                                />
                              ) : (
                                <>
                                  <Ionicons
                                    name="download-outline"
                                    size={15}
                                    color="#FFFFFF"
                                  />
                                  <Text style={styles.roleRowBtnTextPrimary}>
                                    Download bill
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* STAFF ROWS — no navigation on tap, informational only */}
            {hasStaff ? (
              <View style={styles.groupCard}>
                <Pressable
                  onPress={handleOpenStaffGroup}
                  style={({ pressed }) => [
                    styles.groupCardHeader,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.groupCardHeaderLeft}>
                    <View
                      style={[
                        styles.groupCardHeaderIcon,
                        { backgroundColor: "#F5F3FF" },
                      ]}
                    >
                      <Ionicons
                        name="briefcase-outline"
                        size={16}
                        color="#7C3AED"
                      />
                    </View>
                    <Text style={styles.groupCardHeaderTitle}>Staff</Text>
                  </View>
                  <View style={styles.groupCardHeaderRight}>
                    <View style={styles.groupCardHeaderBadge}>
                      <Text style={styles.groupCardHeaderBadgeText}>
                        {matchedStaffProfiles.length}{" "}
                        {matchedStaffProfiles.length === 1 ? "role" : "roles"}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#94A3B8"
                    />
                  </View>
                </Pressable>

                <View style={styles.groupCardBody}>
                  {matchedStaffProfiles.map((staff: any, index: number) => {
                    const roleLabel = getStaffRoleLabel(staff.role);

                    const mp = staff.monthlyPayments?.[selfMonthKey];
                    const isPaid = mp?.status === "paid";
                    const paidDate = mp?.paidDate ?? null;

                    const att = getAttendanceRecord(staff.id, selfMonthKey);
                    const baseSalary = Number(staff.monthlySalary) || 0;
                    let adjustedBase = baseSalary;
                    if (att?.calculatedSalary != null) {
                      adjustedBase = att.calculatedSalary;
                    } else if (
                      att?.statuses &&
                      Object.keys(att.statuses).length > 0
                    ) {
                      adjustedBase = getCalculatedStaffSalary(
                        baseSalary,
                        selfMonthKey,
                        att.statuses as any,
                      );
                    }

                    const add = Number(mp?.additionalAmount) || 0;
                    const ded = Number(mp?.deductionAmount) || 0;
                    const payableAmount =
                      mp?.netAmount != null
                        ? Number(mp.netAmount)
                        : Math.max(0, adjustedBase + add - ded);

                    const downloadKey = `staff:${selectedAccount?.id}:${staff.id}:${selfMonthKey}`;
                    const isDownloading = downloadingBillKey === downloadKey;

                    return (
                      <View
                        key={`staff-${staff.id}`}
                        style={[
                          styles.roleRowWrap,
                          index === matchedStaffProfiles.length - 1 &&
                            styles.roleRowWrapLast,
                        ]}
                      >
                        {/* Read-only row (no navigation) */}
                        <View style={styles.roleRowTop}>
                          <View style={styles.groupRowInfo}>
                            <Text
                              style={styles.groupRowTitle}
                              numberOfLines={1}
                            >
                              {staff.name || "Staff"}
                            </Text>
                            <View style={styles.roleRowMetaRow}>
                              <View
                                style={[
                                  styles.roleChip,
                                  {
                                    backgroundColor: "#F5F3FF",
                                    borderColor: "#DDD6FE",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.roleChipText,
                                    { color: "#6D28D9" },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {roleLabel}
                                </Text>
                              </View>
                              <Text
                                style={styles.roleRowAmount}
                                numberOfLines={1}
                              >
                                {formatCurrency(payableAmount)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.roleRowStatusWrap}>
                            <View
                              style={[
                                styles.statusPill,
                                isPaid
                                  ? styles.statusPillPaid
                                  : styles.statusPillDue,
                              ]}
                            >
                              <View
                                style={[
                                  styles.selfStatusDot,
                                  {
                                    backgroundColor: isPaid
                                      ? "#16A34A"
                                      : "#DC2626",
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.statusPillText,
                                  {
                                    color: isPaid ? "#15803D" : "#DC2626",
                                  },
                                ]}
                              >
                                {isPaid ? "Paid" : "Due"}
                              </Text>
                            </View>
                            {isPaid && paidDate ? (
                              <Text
                                style={styles.roleRowPaidDate}
                                numberOfLines={1}
                              >
                                {formatFullDate(paidDate)}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        <View style={styles.roleRowActions}>
                          <TouchableOpacity
                            style={[styles.roleRowBtn, styles.roleRowBtnGhost]}
                            onPress={() => {
                              setAttendanceModalStaffId(staff.id);
                              setAttendanceModalMeta({
                                name: staff.name || "Staff",
                                role: roleLabel,
                              });
                            }}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name="calendar-outline"
                              size={15}
                              color="#7C3AED"
                            />
                            <Text style={styles.roleRowBtnTextGhost}>
                              View attendance
                            </Text>
                          </TouchableOpacity>

                          {isPaid ? (
                            <TouchableOpacity
                              style={[
                                styles.roleRowBtn,
                                styles.roleRowBtnPrimary,
                                isDownloading && { opacity: 0.6 },
                              ]}
                              onPress={() =>
                                handleSelfDownloadBill({
                                  member: staff,
                                  memberType: "staff",
                                  isApartment: false,
                                  accountId: selectedAccount?.id ?? null,
                                })
                              }
                              activeOpacity={0.85}
                              disabled={isDownloading}
                            >
                              {isDownloading ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#FFFFFF"
                                />
                              ) : (
                                <>
                                  <Ionicons
                                    name="download-outline"
                                    size={15}
                                    color="#FFFFFF"
                                  />
                                  <Text style={styles.roleRowBtnTextPrimary}>
                                    Download bill
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  /* ============================================================
     ATTENDANCE MODAL
     ============================================================ */

  const renderAttendanceModal = () => {
    const visible = !!attendanceModalStaffId;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAttendanceModalStaffId(null);
          setAttendanceModalMeta(null);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setAttendanceModalStaffId(null);
            setAttendanceModalMeta(null);
          }}
        >
          <Pressable
            style={styles.attendanceModalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.attendanceModalHeader}>
              <View style={styles.attendanceModalIcon}>
                <Ionicons name="calendar-outline" size={20} color="#7C3AED" />
              </View>
              <View style={styles.attendanceModalInfo}>
                <Text style={styles.attendanceModalTitle}>My Attendance</Text>
                <Text style={styles.attendanceModalSubtitle} numberOfLines={1}>
                  {attendanceModalMeta?.name || "Staff"}
                  {attendanceModalMeta?.role
                    ? `  ·  ${attendanceModalMeta.role}`
                    : ""}
                </Text>
              </View>
              <Pressable
                style={styles.attendanceModalClose}
                onPress={() => {
                  setAttendanceModalStaffId(null);
                  setAttendanceModalMeta(null);
                }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <View style={styles.attendanceModalMonthPill}>
              <Ionicons name="calendar-outline" size={14} color="#64748B" />
              <Text style={styles.attendanceModalMonthPillText}>
                {MONTHS[selfMonth]} {selfYear}
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {attendanceModalStaffId ? (
                <AttendanceCalendar
                  staffId={attendanceModalStaffId}
                  month={selfMonth}
                  year={selfYear}
                  getStatuses={getAttendanceRecord}
                />
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderWithdrawModal = () => {
    const hasAdmin = myRoles.some((r) => r.role === "admin");
    const hasMember = myRoles.some((r) => r.role === "member_visibility");
    const hasStaff = myRoles.some((r) => r.role === "staff_visibility");

    const hasMemberProfile = !!withdrawPreview?.memberProfile;
    const hasStaffProfile = !!withdrawPreview?.staffProfile;

    const showMemberToggle = hasAdmin ? hasMemberProfile : hasMember;
    const showStaffToggle = hasAdmin ? hasStaffProfile : hasStaff;

    const showAnyToggle =
      !withdrawPreviewLoading && (showMemberToggle || showStaffToggle);

    const headlineRole = hasAdmin
      ? "admin"
      : hasMember && hasStaff
        ? "member and staff"
        : hasMember
          ? "member"
          : "staff";

    const titleText = hasAdmin
      ? "Withdraw admin access?"
      : hasMember && hasStaff
        ? "Withdraw your access"
        : `Withdraw ${headlineRole} access?`;

    const descriptionText = hasAdmin
      ? hasMemberProfile || hasStaffProfile
        ? "You will lose administrator privileges on this property. Choose which access to keep below."
        : "You will lose administrator privileges on this property. You can ask the owner to invite you again later."
      : hasMember && hasStaff
        ? "Turn off the roles you no longer want. Roles you keep on will stay active."
        : hasMember
          ? "Turn the toggle off to withdraw your member access."
          : "Turn the toggle off to withdraw your staff access.";

    const nothingToWithdraw =
      !hasAdmin &&
      (!hasMember || keepMemberVisibility) &&
      (!hasStaff || keepStaffVisibility);

    return (
      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="fade"
        onRequestClose={closeWithdrawModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeWithdrawModal}>
          <Pressable style={styles.withdrawModalCard} onPress={() => {}}>
            <View style={styles.withdrawModalIcon}>
              <Ionicons name="exit-outline" size={26} color="#DC2626" />
            </View>
            <Text style={styles.withdrawModalTitle}>{titleText}</Text>
            <Text style={styles.withdrawModalDesc}>{descriptionText}</Text>

            {withdrawPreviewLoading ? (
              <View style={{ paddingVertical: 14 }}>
                <ActivityIndicator color="#DC2626" />
              </View>
            ) : null}

            {showAnyToggle && showMemberToggle ? (
              <View style={styles.withdrawToggleRow}>
                <View
                  style={[
                    styles.withdrawToggleIconWrap,
                    { backgroundColor: "#DCFCE7" },
                  ]}
                >
                  <Ionicons name="person" size={18} color="#16A34A" />
                </View>
                <View style={styles.withdrawToggleContent}>
                  <Text style={styles.withdrawToggleTitle}>
                    {hasAdmin ? "Keep Member visibility" : "Member access"}
                  </Text>
                  <Text style={styles.withdrawToggleSubtitle} numberOfLines={1}>
                    {withdrawPreview?.memberProfile?.name ||
                      user?.name ||
                      "You"}
                    {withdrawPreview?.memberProfile?.flatNumber
                      ? `  •  ${
                          withdrawPreview.memberProfile.wing
                            ? "Wing " + withdrawPreview.memberProfile.wing + " "
                            : ""
                        }Apt ${withdrawPreview.memberProfile.flatNumber}`
                      : ""}
                  </Text>
                </View>
                <ToggleSwitch
                  value={keepMemberVisibility}
                  onValueChange={setKeepMemberVisibility}
                  trackColorOn="#16A34A"
                />
              </View>
            ) : null}

            {showAnyToggle && showStaffToggle ? (
              <View style={styles.withdrawToggleRow}>
                <View
                  style={[
                    styles.withdrawToggleIconWrap,
                    { backgroundColor: "#E0F2FE" },
                  ]}
                >
                  <Ionicons name="briefcase" size={18} color="#0284C7" />
                </View>
                <View style={styles.withdrawToggleContent}>
                  <Text style={styles.withdrawToggleTitle}>
                    {hasAdmin ? "Keep Staff visibility" : "Staff access"}
                  </Text>
                  <Text style={styles.withdrawToggleSubtitle} numberOfLines={1}>
                    {withdrawPreview?.staffProfile?.name || user?.name || "You"}
                    {withdrawPreview?.staffProfile?.role
                      ? `  •  ${withdrawPreview.staffProfile.role}`
                      : ""}
                  </Text>
                </View>
                <ToggleSwitch
                  value={keepStaffVisibility}
                  onValueChange={setKeepStaffVisibility}
                  trackColorOn="#0284C7"
                />
              </View>
            ) : null}

            {showAnyToggle ? (
              <Text style={styles.withdrawHint}>
                {hasAdmin
                  ? "Roles you turn off will be removed along with admin."
                  : "Roles you turn off will be withdrawn. Roles you keep on will stay active."}
              </Text>
            ) : null}

            <View style={styles.withdrawModalActions}>
              <TouchableOpacity
                style={styles.withdrawCancelBtn}
                onPress={closeWithdrawModal}
                disabled={withdrawingAccess}
                activeOpacity={0.8}
              >
                <Text style={styles.withdrawCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.withdrawConfirmBtn,
                  nothingToWithdraw && { opacity: 0.55 },
                ]}
                onPress={handleWithdrawAccess}
                disabled={
                  withdrawingAccess ||
                  withdrawPreviewLoading ||
                  nothingToWithdraw
                }
                activeOpacity={0.85}
              >
                {withdrawingAccess ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="exit-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.withdrawConfirmText}>Withdraw</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  if (accountsLoading) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingIcon}>
          <Ionicons name="business-outline" size={28} color="#2563EB" />
        </View>
        <ActivityIndicator
          size="small"
          color="#2563EB"
          style={styles.loadingSpinner}
        />
        <Text style={styles.loadingTitle}>Loading dashboard</Text>
        <Text style={styles.loadingSubtitle}>Please wait a moment...</Text>
      </View>
    );
  }

  if (!selectedAccount) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.emptyScrollContent}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="business-outline" size={42} color="#2563EB" />
            </View>
            <Text style={styles.emptyTitle}>
              {accounts.length > 0
                ? "No property selected"
                : "Create your property"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {accounts.length > 0
                ? "Please select a property from the property settings to continue."
                : "Create your first property to start managing members, staff and expenses."}
            </Text>
            {accounts.length === 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/add-account",
                    params: { mode: "create" },
                  })
                }
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Create Property</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryActionButton,
                  pressed && styles.pressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/(modals)/add-account",
                    params: { mode: "create" },
                  })
                }
              >
                <Ionicons name="add-outline" size={18} color="#2563EB" />
                <Text style={styles.secondaryButtonText}>
                  Add another property
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  const accountTypeLabel =
    selectedAccount.type === "apartment" ? "Apartment Community" : "Home";

  const renderPendingOffers = () => {
    if (
      pendingAdminOffers.length === 0 &&
      pendingOwnershipOffers.length === 0
    ) {
      return null;
    }

    return (
      <View style={styles.offersSection}>
        {pendingOwnershipOffers.map((offer) => (
          <PendingOwnershipOfferBanner
            key={offer.id}
            offer={offer}
            busy={busyOfferId === offer.id}
            onAccept={() => handleAcceptOwnership(offer)}
            onReject={() => handleRejectOwnership(offer)}
          />
        ))}
        {pendingAdminOffers.map((offer) => (
          <PendingAdminOfferBanner
            key={offer.id}
            offer={offer}
            busy={busyOfferId === offer.id}
            onAccept={() => handleAcceptOffer(offer)}
            onReject={() => handleRejectOffer(offer)}
          />
        ))}
      </View>
    );
  };

  const portalLabel = isAdmin
    ? accountTypeLabel
    : isMember
      ? "Resident Portal"
      : isStaff
        ? "Staff Portal"
        : "Portal";

  /* ============================================================
     NON-ADMIN VIEW
     ============================================================ */

  if (!isAdmin && (isMember || isStaff)) {
    return (
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2563EB"
              colors={["#2563EB"]}
            />
          }
        >
          {renderPendingOffers()}

          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.greeting}>{getGreeting()} 👋</Text>
                <Text style={styles.accountName} numberOfLines={1}>
                  {selectedAccount?.name || "My Property"}
                </Text>
                <View style={styles.accountTypeRow}>
                  <View style={styles.accountStatusDot} />
                  <Text style={styles.accountTypeText}>{portalLabel}</Text>
                  <View style={styles.dotSeparator} />
                  <Text style={styles.monthText}>{getCurrentMonth()}</Text>
                </View>
              </View>
            </View>
          </View>

          {renderProfileBlock()}

          {/* Society blocks only for members (not staff-only) */}
          {isMember ? (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Society Overview</Text>
                    <Text style={styles.sectionSubtitle}>
                      Your community at a glance
                    </Text>
                  </View>
                </View>
                <View style={styles.groupOverviewGrid}>
                  <GroupOverviewCard
                    title="Members"
                    subtitle="Owner accounts"
                    count={totalMemberRecords}
                    countLabel={
                      totalMemberRecords === 1 ? "account" : "accounts"
                    }
                    icon="people-outline"
                    color="#2563EB"
                    onPress={handleOpenMembersGroup}
                  />
                  <GroupOverviewCard
                    title="Staff"
                    subtitle="Working on site"
                    count={staffMembers.length}
                    countLabel={staffMembers.length === 1 ? "staff" : "staff"}
                    icon="briefcase-outline"
                    color="#16A34A"
                    onPress={handleOpenStaffGroup}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Society Finance</Text>
                    <Text style={styles.sectionSubtitle}>
                      Overall · all-time totals
                    </Text>
                  </View>
                  <Pressable
                    style={styles.seeAllButton}
                    onPress={() => router.push("/(tabs)/finance")}
                  >
                    <Text style={styles.seeAllText}>View All</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color="#2563EB"
                    />
                  </Pressable>
                </View>
                <View style={styles.financialGrid}>
                  <FinancialCard
                    title="Income"
                    amount={overallIncome}
                    icon="arrow-down-outline"
                    color="#16A34A"
                    background="#DCFCE7"
                    period="Overall"
                  />
                  <FinancialCard
                    title="Expenses"
                    amount={overallExpense}
                    icon="arrow-up-outline"
                    color="#EA580C"
                    background="#FFEDD5"
                    period="Overall"
                  />
                  <FinancialCard
                    title="Net"
                    amount={overallNet}
                    icon={
                      isOverallPositive
                        ? "wallet-outline"
                        : "alert-circle-outline"
                    }
                    color={isOverallPositive ? "#2563EB" : "#DC2626"}
                    background={isOverallPositive ? "#DBEAFE" : "#FEE2E2"}
                    period="Incl. opening"
                  />
                </View>
              </View>
            </>
          ) : null}

          <View style={styles.footerMessage}>
            <Ionicons
              name={isMember ? "eye-outline" : "shield-checkmark-outline"}
              size={18}
              color="#94A3B8"
            />
            <Text style={styles.footerMessageText}>
              {isMember
                ? "View-only access · Contact admin for changes"
                : "You are viewing your personal staff dashboard"}
            </Text>
          </View>

          <View style={styles.bottomSpace} />
        </ScrollView>

        <MonthYearPickerModal
          visible={showSelfPicker}
          year={selfYear}
          month={selfMonth}
          onClose={() => setShowSelfPicker(false)}
          onSelect={(y, m) => {
            setSelfYear(y);
            setSelfMonth(m);
          }}
        />

        {renderAttendanceModal()}
        {renderWithdrawModal()}

        <BillMissingModal
          visible={billMissingVisible}
          owner={billMissingOwner}
          admins={billMissingAdmins}
          onClose={() => {
            setBillMissingVisible(false);
            setBillMissingOwner(null);
            setBillMissingAdmins([]);
          }}
        />
      </View>
    );
  }

  /* ============================================================
     ADMIN VIEW
     ============================================================ */

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
            colors={["#2563EB"]}
          />
        }
      >
        {renderPendingOffers()}

        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.greeting}>{getGreeting()} 👋</Text>
              <Text style={styles.accountName} numberOfLines={1}>
                {selectedAccount.name || "My Property"}
              </Text>
              <View style={styles.accountTypeRow}>
                <View style={styles.accountStatusDot} />
                <Text style={styles.accountTypeText}>{accountTypeLabel}</Text>
                <View style={styles.dotSeparator} />
                <Text style={styles.monthText}>{getCurrentMonth()}</Text>
              </View>
            </View>
          </View>
        </View>

        {renderProfileBlock()}

        {showBalanceCard ? (
          <View style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <View>
                <Text style={styles.balanceLabel}>Net Balance</Text>
                <Text style={styles.balancePeriod}>
                  Monthly · incl. opening
                </Text>
              </View>
              <View
                style={[
                  styles.balanceIcon,
                  {
                    backgroundColor: isMonthlyPositive ? "#DCFCE7" : "#FEE2E2",
                  },
                ]}
              >
                <Ionicons
                  name={
                    isMonthlyPositive
                      ? "trending-up-outline"
                      : "trending-down-outline"
                  }
                  size={21}
                  color={isMonthlyPositive ? "#16A34A" : "#DC2626"}
                />
              </View>
            </View>
            <Text
              style={[
                styles.balanceAmount,
                { color: isMonthlyPositive ? "#15803D" : "#DC2626" },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {isMonthlyPositive ? "" : "-"}
              {formatCurrency(monthlyNet)}
            </Text>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceBottom}>
              <View style={styles.balanceMiniItem}>
                <View
                  style={[styles.miniDot, { backgroundColor: "#16A34A" }]}
                />
                <View>
                  <Text style={styles.miniLabel}>Monthly Income</Text>
                  <Text style={styles.miniValue}>
                    {formatCurrency(stats.monthlyIncome)}
                  </Text>
                </View>
              </View>
              <View style={styles.balanceMiniItem}>
                <View
                  style={[styles.miniDot, { backgroundColor: "#EA580C" }]}
                />
                <View>
                  <Text style={styles.miniLabel}>Monthly Expenses</Text>
                  <Text style={styles.miniValue}>
                    {formatCurrency(stats.monthlyExpense)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {showFinance ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Financial Overview</Text>
                <Text style={styles.sectionSubtitle}>
                  Overall · all-time totals
                </Text>
              </View>
              <Pressable
                style={styles.seeAllButton}
                onPress={() => router.push("/(tabs)/finance")}
              >
                <Text style={styles.seeAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={15} color="#2563EB" />
              </Pressable>
            </View>
            <View style={styles.financialGrid}>
              <FinancialCard
                title="Total Income"
                amount={overallIncome}
                icon="arrow-down-outline"
                color="#16A34A"
                background="#DCFCE7"
                period="Overall"
              />
              <FinancialCard
                title="Total Expenses"
                amount={overallExpense}
                icon="arrow-up-outline"
                color="#EA580C"
                background="#FFEDD5"
                period="Overall"
              />
              <FinancialCard
                title="Net Balance"
                amount={overallNet}
                icon={
                  isOverallPositive ? "wallet-outline" : "alert-circle-outline"
                }
                color={isOverallPositive ? "#2563EB" : "#DC2626"}
                background={isOverallPositive ? "#DBEAFE" : "#FEE2E2"}
                period="Incl. opening"
              />
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.sectionSubtitle}>
                Tap a card to open the group
              </Text>
            </View>
          </View>
          <View style={styles.groupOverviewGrid}>
            <GroupOverviewCard
              title="Members"
              subtitle="Owner accounts"
              count={totalMemberRecords}
              countLabel={totalMemberRecords === 1 ? "account" : "accounts"}
              icon={
                selectedAccount.type === "apartment"
                  ? "people-outline"
                  : "home-outline"
              }
              color="#2563EB"
              onPress={handleOpenMembersGroup}
            />
            <GroupOverviewCard
              title="Staff"
              subtitle="Working on site"
              count={staffMembers.length}
              countLabel={staffMembers.length === 1 ? "staff" : "staff"}
              icon="briefcase-outline"
              color="#16A34A"
              onPress={handleOpenStaffGroup}
            />
          </View>
        </View>

        {showQuickActions ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <Text style={styles.sectionSubtitle}>
                  Manage your property faster
                </Text>
              </View>
            </View>
            <View style={styles.quickActions}>
              {ADMIN_QUICK_ACTIONS.map((action) => (
                <QuickActionCard
                  key={action.id}
                  action={action}
                  onPress={() => handleQuickAction(action)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <MonthYearPickerModal
        visible={showSelfPicker}
        year={selfYear}
        month={selfMonth}
        onClose={() => setShowSelfPicker(false)}
        onSelect={(y, m) => {
          setSelfYear(y);
          setSelfMonth(m);
        }}
      />

      {renderWithdrawModal()}

      <BillMissingModal
        visible={billMissingVisible}
        owner={billMissingOwner}
        admins={billMissingAdmins}
        onClose={() => {
          setBillMissingVisible(false);
          setBillMissingOwner(null);
          setBillMissingAdmins([]);
        }}
      />
    </View>
  );
}

/* ============================================================
   STYLES
   ============================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },

  loadingScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  loadingIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingSpinner: { marginTop: 22 },
  loadingTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  loadingSubtitle: { marginTop: 5, fontSize: 13, color: "#94A3B8" },

  header: { marginBottom: 16 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  headerTextContainer: { flex: 1 },
  greeting: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  accountName: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: "#0F172A",
  },
  accountTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
  },
  accountStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },
  accountTypeText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 7,
  },
  monthText: { fontSize: 12, color: "#94A3B8" },

  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  profileHeader: { flexDirection: "row", alignItems: "center" },
  profileAvatar: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    overflow: "hidden",
  },
  profileAvatarImage: { width: "100%", height: "100%" },
  profileInitial: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2563EB",
  },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },
  profilePhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 5,
  },
  profilePhone: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  profileEditChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  profileEditText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },

  myRolesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  myRolesHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  myRolesHeaderLeft: { flex: 1, minWidth: 0 },
  myRolesTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  myRolesSubtitle: {
    fontSize: 11.5,
    color: "#94A3B8",
    marginTop: 3,
  },
  myRolesChipsRight: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    maxWidth: "55%",
  },
  myRoleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  myRoleChipText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  myRolesSkeletonChip: {
    width: 62,
    height: 22,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  myRolesEmptyChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  myRolesEmptyChipText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#94A3B8",
  },
  withdrawAdminRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  withdrawAdminRowText: {
    color: "#DC2626",
    fontSize: 12.5,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  withdrawModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  withdrawModalIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  withdrawModalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  withdrawModalDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
  },
  withdrawToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    gap: 10,
  },
  withdrawToggleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawToggleContent: { flex: 1, minWidth: 0 },
  withdrawToggleTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },
  withdrawToggleSubtitle: {
    color: "#64748B",
    fontSize: 11.5,
    marginTop: 3,
  },
  withdrawHint: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 10,
    maxWidth: 300,
  },
  withdrawModalActions: {
    flexDirection: "row",
    width: "100%",
    gap: 9,
    marginTop: 20,
  },
  withdrawCancelBtn: {
    flex: 1,
    minHeight: 45,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawCancelText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  withdrawConfirmBtn: {
    flex: 1,
    minHeight: 45,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  withdrawConfirmText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  /* ── Bill missing modal ── */
  billModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  billModalIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  billModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  billModalDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 330,
  },
  billContactsWrap: {
    width: "100%",
    marginTop: 16,
  },
  billContactsLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },
  billContactRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  billContactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  billContactAvatarOwner: { backgroundColor: "#FEF3C7" },
  billContactAvatarImage: { width: "100%", height: "100%" },
  billContactInitial: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  billContactInfo: { flex: 1, minWidth: 0 },
  billContactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  billContactName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  billOwnerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#FDE68A",
  },
  billOwnerBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#78350F",
    letterSpacing: 0.3,
  },
  billContactPhone: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  billCallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: "#16A34A",
  },
  billCallButtonText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  billModalNoContact: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  billModalCloseBtn: {
    width: "100%",
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  billModalCloseBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  rolesSection: { marginBottom: 22 },
  rolesSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 9,
    marginLeft: 2,
  },

  roleMonthSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  roleMonthArrow: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },
  roleMonthCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleMonthText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  groupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 10,
  },
  groupCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  groupCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupCardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupCardHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  groupCardHeaderTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  groupCardHeaderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  groupCardHeaderBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
  },
  groupCardBody: { paddingHorizontal: 0, paddingVertical: 0 },

  roleRowWrap: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  roleRowWrapLast: { borderBottomWidth: 0 },
  roleRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  groupRowInfo: { flex: 1, minWidth: 0 },
  groupRowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  roleRowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
    flexWrap: "wrap",
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleChipText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  roleRowAmount: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#334155",
  },
  roleRowStatusWrap: { alignItems: "flex-end" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
  },
  statusPillPaid: { backgroundColor: "#F0FDF4" },
  statusPillDue: { backgroundColor: "#FEF2F2" },
  statusPillText: { fontSize: 11.5, fontWeight: "800" },
  selfStatusDot: { width: 6, height: 6, borderRadius: 3 },
  roleRowPaidDate: {
    fontSize: 10.5,
    color: "#94A3B8",
    marginTop: 3,
  },
  roleRowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  roleRowBtn: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  roleRowBtnPrimary: { backgroundColor: "#2563EB" },
  roleRowBtnGhost: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  roleRowBtnTextPrimary: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  roleRowBtnTextGhost: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#7C3AED",
  },

  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  groupRowLast: { borderBottomWidth: 0 },
  groupRowSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 3,
  },

  groupOverviewGrid: { flexDirection: "row", gap: 12 },
  groupOverviewCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 155,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  groupOverviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupOverviewIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  groupOverviewChevron: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  groupOverviewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 14,
  },
  groupOverviewSubtitle: {
    fontSize: 11.5,
    color: "#94A3B8",
    marginTop: 2,
  },
  groupOverviewCountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 10,
  },
  groupOverviewCount: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  groupOverviewCountLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },

  offersSection: { marginBottom: 14, gap: 10 },

  offerBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  offerBannerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    marginBottom: 12,
  },
  offerBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  offerBannerHeaderText: { flex: 1, minWidth: 0 },
  offerBannerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  offerBannerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
    marginTop: 4,
  },
  offerBannerActions: { flexDirection: "row", gap: 8 },
  offerBannerBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  offerBannerReject: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  offerBannerRejectText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
  },
  offerBannerAccept: { backgroundColor: "#7C3AED" },
  offerBannerAcceptText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  upgradeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  upgradePillGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  upgradePillFrom: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  upgradePillFromText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#475569",
  },
  upgradePillTo: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#EDE9FE",
  },
  upgradePillToText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#7C3AED",
  },

  ownershipBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    shadowColor: "#B45309",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 2,
  },
  ownershipBannerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    marginBottom: 12,
  },
  ownershipBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  ownershipBannerHeaderText: { flex: 1, minWidth: 0 },
  ownershipBannerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#78350F",
  },
  ownershipBannerSubtitle: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 17,
    marginTop: 4,
    opacity: 0.9,
  },
  ownershipBannerActions: { flexDirection: "row", gap: 8 },
  ownershipBannerReject: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  ownershipBannerRejectText: {
    color: "#B45309",
    fontSize: 13,
    fontWeight: "700",
  },
  ownershipBannerAccept: { backgroundColor: "#B45309" },
  ownershipBannerAcceptText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  ownershipPillFrom: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#FDE68A",
  },
  ownershipPillFromText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#78350F",
  },
  ownershipPillTo: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#B45309",
  },
  ownershipPillToText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  balanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  balanceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  balancePeriod: { fontSize: 11, color: "#94A3B8", marginTop: 3 },
  balanceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceAmount: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "800",
    marginTop: 15,
    letterSpacing: -0.6,
  },
  balanceDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 17,
  },
  balanceBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceMiniItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  miniDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  miniLabel: {
    fontSize: 11,
    color: "#94A3B8",
    marginBottom: 2,
  },
  miniValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },

  section: { marginBottom: 25 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 3,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingLeft: 8,
  },
  seeAllText: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "700",
    marginRight: 2,
  },

  quickActions: { gap: 10 },
  quickActionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 70,
  },
  quickActionIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  quickActionContent: { flex: 1 },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 3,
  },
  quickActionArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  financialGrid: { flexDirection: "row", gap: 10 },
  financialCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 130,
  },
  financialIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  financialLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  financialAmount: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 5,
  },
  financialPeriod: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
  },

  attendanceModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
  },
  attendanceModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  attendanceModalIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  attendanceModalInfo: { flex: 1, minWidth: 0 },
  attendanceModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  attendanceModalSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  attendanceModalClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  attendanceModalMonthPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  attendanceModalMonthPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },

  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  weekText: { fontSize: 11, fontWeight: "700", color: "#94A3B8" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  dayBubble: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 34,
    maxHeight: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleToday: { borderWidth: 2, borderColor: "#2563EB" },
  dayText: { fontSize: 12, fontWeight: "700" },
  attendanceEmpty: {
    paddingVertical: 26,
    alignItems: "center",
    gap: 8,
  },
  attendanceEmptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginTop: 4,
  },
  attendanceEmptyText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 260,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  legendText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },

  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  pickerCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  pickerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 8,
    marginTop: 8,
  },
  yearRow: { gap: 8, paddingVertical: 4 },
  yearChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    minWidth: 70,
    alignItems: "center",
  },
  yearChipActive: { backgroundColor: "#2563EB" },
  yearChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  yearChipTextActive: { color: "#FFFFFF" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthChip: {
    width: "31%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  monthChipActive: { backgroundColor: "#2563EB" },
  monthChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  monthChipTextActive: { color: "#FFFFFF" },
  pickerConfirm: {
    marginTop: 20,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  footerMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  footerMessageText: { fontSize: 12, color: "#94A3B8" },

  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  emptyStateContainer: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 24,
  },
  emptyIconCircle: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginTop: 9,
    marginBottom: 25,
  },
  primaryButton: {
    width: "100%",
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },

  pressed: { opacity: 0.72 },
  bottomSpace: { height: 20 },
});

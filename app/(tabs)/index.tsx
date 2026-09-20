import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAccounts } from "../../hooks/useAccounts";
import { useExpenses, useMembers, useStaff } from "../../hooks/useManagement";
import { useUserRole } from "../../hooks/useUserRole";
import { useAuthStore } from "../../store/useAuthStore";
import type { Member } from "../../types";
import { PaymentCategory } from "../../types/payment";

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tab: "apartment" | "staff" | "expense";
}

type AttendanceStatus = "present" | "absent" | "holiday" | "half_day" | "none";

interface AttendanceRecord {
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
}

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
};

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

const ROLE_COLORS: Record<string, string> = {
  sweeper: "#8B5CF6",
  security: "#EF4444",
  maintenance: "#F59E0B",
  maid: "#16A34A",
  driver: "#2563EB",
  cook: "#92400E",
  gardener: "#65A30D",
  other: "#64748B",
};

const ROLE_LABELS: Record<string, string> = {
  sweeper: "Sweeper",
  security: "Security",
  maintenance: "Maintenance",
  maid: "Maid",
  driver: "Driver",
  cook: "Cook",
  gardener: "Gardener",
  other: "Staff",
};

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
  AttendanceStatus,
  { bg: string; text: string; label: string }
> = {
  present: { bg: "#DCFCE7", text: "#15803D", label: "Present" },
  absent: { bg: "#FEE2E2", text: "#DC2626", label: "Absent" },
  holiday: { bg: "#DBEAFE", text: "#2563EB", label: "Holiday" },
  half_day: { bg: "#FEF3C7", text: "#D97706", label: "Half Day" },
  none: { bg: "#F1F5F9", text: "#94A3B8", label: "—" },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const OPENING_BALANCE_PREFIX = "/opening-balance";

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

function getRoleColor(role?: string) {
  if (!role) return ROLE_COLORS.other;
  return ROLE_COLORS[role.toLowerCase()] || ROLE_COLORS.other;
}

function getRoleLabel(role?: string) {
  if (!role) return "Staff";
  return ROLE_LABELS[role.toLowerCase()] || role;
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

// =============================================================================
// NEW helper — pluralize "account(s)" for badges and labels.
// A "member record" is always one account, whether it's flat / shop / custom.
// =============================================================================
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

function generateMockAttendance(
  year: number,
  month: number,
): Record<string, AttendanceRecord> {
  const result: Record<string, AttendanceRecord> = {};
  const days = getDaysInMonth(year, month);
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  for (let day = 1; day <= days; day++) {
    const date = new Date(year, month, day);
    const key = formatDateKey(year, month, day);

    if (date.getDay() === 0) {
      result[key] = { date: key, status: "holiday" };
      continue;
    }

    if (isCurrentMonth && day > today.getDate()) {
      result[key] = { date: key, status: "none" };
      continue;
    }

    const seed = (day * 7 + month * 3) % 10;
    if (seed === 0) {
      result[key] = { date: key, status: "absent" };
    } else if (seed === 5) {
      result[key] = {
        date: key,
        status: "half_day",
        checkIn: "10:00",
        checkOut: "14:00",
      };
    } else {
      result[key] = {
        date: key,
        status: "present",
        checkIn: "09:05",
        checkOut: "18:10",
      };
    }
  }

  return result;
}

function StatCard({
  title,
  value,
  icon,
  color,
  description,
}: {
  title: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View
        style={[styles.statIconContainer, { backgroundColor: `${color}12` }]}
      >
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      {description ? (
        <Text style={styles.statDescription}>{description}</Text>
      ) : null}
    </View>
  );
}

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
  return (
    <View style={styles.offerBanner}>
      <View style={styles.offerBannerHeader}>
        <View style={styles.offerBannerIcon}>
          <Ionicons name="shield-checkmark" size={20} color="#7C3AED" />
        </View>
        <View style={styles.offerBannerHeaderText}>
          <Text style={styles.offerBannerTitle} numberOfLines={1}>
            Admin offer · {offer.account_name || "this account"}
          </Text>
          <Text style={styles.offerBannerSubtitle} numberOfLines={2}>
            You already have access here. The owner wants to add Admin on top of
            your current roles.
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
              <Text style={styles.offerBannerAcceptText}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

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

function AttendanceSection({
  year,
  month,
  onChangeMonth,
}: {
  year: number;
  month: number;
  onChangeMonth: (year: number, month: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const attendance = useMemo(
    () => generateMockAttendance(year, month),
    [year, month],
  );

  const { days, summary } = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const first = getFirstDayOfMonth(year, month);

    let present = 0;
    let absent = 0;
    let holiday = 0;
    let halfDay = 0;

    Object.values(attendance).forEach((r) => {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else if (r.status === "holiday") holiday++;
      else if (r.status === "half_day") halfDay++;
    });

    const cells: (number | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return {
      days: cells,
      summary: { present, absent, holiday, halfDay },
    };
  }, [attendance, year, month]);

  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const handlePrev = () => {
    if (month === 0) onChangeMonth(year - 1, 11);
    else onChangeMonth(year, month - 1);
  };

  const handleNext = () => {
    if (month === 11) onChangeMonth(year + 1, 0);
    else onChangeMonth(year, month + 1);
  };

  return (
    <View style={styles.attendanceCard}>
      <View style={styles.sliderRow}>
        <TouchableOpacity
          onPress={handlePrev}
          style={styles.sliderArrow}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={styles.sliderMonth}
          activeOpacity={0.8}
        >
          <Text style={styles.sliderMonthText}>
            {MONTHS[month]} {year}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          style={styles.sliderArrow}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>

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

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <View key={i} style={styles.weekCell}>
            <Text style={styles.weekText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {days.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} style={styles.calendarCell} />;
          }

          const key = formatDateKey(year, month, day);
          const record = attendance[key];
          const status = record?.status ?? "none";
          const colors = STATUS_COLORS[status];
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

      <MonthYearPickerModal
        visible={showPicker}
        year={year}
        month={month}
        onClose={() => setShowPicker(false)}
        onSelect={(y, m) => onChangeMonth(y, m)}
      />
    </View>
  );
}

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
  const showAttendance = isStaff;

  const [refreshing, setRefreshing] = useState(false);

  const [openingBalance, setOpeningBalance] = useState(0);

  const now = new Date();
  const [attYear, setAttYear] = useState(now.getFullYear());
  const [attMonth, setAttMonth] = useState(now.getMonth());

  const [pendingAdminOffers, setPendingAdminOffers] = useState<
    PendingAdminOffer[]
  >([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

  const accountIdsKey = useMemo(
    () =>
      accounts
        .map((a) => a.id)
        .sort()
        .join(","),
    [accounts],
  );

  const handleChangeAttendanceMonth = (y: number, m: number) => {
    setAttYear(y);
    setAttMonth(m);
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

  const loadPendingAdminOffers = useCallback(async () => {
    if (!user?.phone) {
      setPendingAdminOffers([]);
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      setPendingAdminOffers([]);
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
        return;
      }

      const data: any = await res.json();
      const rows: any[] = Array.isArray(data?.invitations)
        ? data.invitations
        : [];

      const myAccountIds = new Set(
        accountIdsKey ? accountIdsKey.split(",") : [],
      );

      const offers: PendingAdminOffer[] = rows
        .filter((r) => {
          if (!r) return false;
          if (r.role !== "admin") return false;
          if (r.status !== "pending") return false;
          if (!myAccountIds.has(r.account_id)) return false;
          return true;
        })
        .map((r) => ({
          id: r.id,
          account_id: r.account_id,
          account_name: r.account_name ?? "",
          account_photo_url: r.account_photo_url ?? null,
          invited_name: r.invited_name ?? null,
          invited_by_phone: r.invited_by_phone ?? null,
          created_at: r.created_at ?? "",
        }));

      setPendingAdminOffers(offers);
    } catch (e) {
      console.warn("[home] loadPendingAdminOffers failed:", e);
      setPendingAdminOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, [user?.phone, accountIdsKey]);

  useEffect(() => {
    if (isFocused) {
      loadPendingAdminOffers();
    }
  }, [isFocused, loadPendingAdminOffers]);

  useFocusEffect(
    useCallback(() => {
      if (!accountId) return;
      let cancelled = false;
      (async () => {
        try {
          await Promise.all([
            membersHook.refresh({ force: true }),
            staffHook.refresh({ force: true }),
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
        await loadPendingAdminOffers();
        return;
      }
      setPendingAdminOffers((prev) => prev.filter((o) => o.id !== offer.id));
      await refreshAccounts();
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
        await loadPendingAdminOffers();
        return;
      }
      setPendingAdminOffers((prev) => prev.filter((o) => o.id !== offer.id));
    } catch (e) {
      console.warn("[home] reject offer failed:", e);
    } finally {
      setBusyOfferId(null);
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

  // Every member row (flat / shop / custom) counts as one account.
  const totalMemberRecords = apartmentMembers.length;

  const monthlyNet =
    openingBalance + (stats.monthlyIncome - stats.monthlyExpense);
  const isMonthlyPositive = monthlyNet >= 0;

  const overallIncome = allTime.income;
  const overallExpense = allTime.expense;
  const overallNet = openingBalance + allTime.net;
  const isOverallPositive = overallNet >= 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPendingAdminOffers();
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

  const handleStaffPress = (staff: any) => {
    if (!selectedAccount?.id || !staff?.id) return;
    router.push({
      pathname: "/(modals)/edit-member",
      params: {
        memberId: staff.id,
        accountId: selectedAccount.id,
        groupType: "staff",
      },
    });
  };

  const handleMemberPress = (member: any) => {
    if (!selectedAccount?.id || !member?.id) return;
    router.push({
      pathname: "/(modals)/edit-member",
      params: {
        memberId: member.id,
        accountId: selectedAccount.id,
        groupType: "apartment",
      },
    });
  };

  const handleOpenProfile = () => {
    router.push("/(modals)/edit-profile");
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
    if (pendingAdminOffers.length === 0) return null;
    return (
      <View style={styles.offersSection}>
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

  const renderProfileBlock = () => {
    const hasMembers = matchedMemberProfiles.length > 0;
    const hasStaff = matchedStaffProfiles.length > 0;

    return (
      <>
        <ProfileCard user={user} onEdit={handleOpenProfile} />

        {hasAnyProfile ? (
          <View style={styles.rolesSection}>
            <Text style={styles.rolesSectionTitle}>
              My Roles on this Property
            </Text>

            {/* ===================== MEMBER GROUP ===================== */}
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
                      {/* "accounts" instead of "flats" — a member row
                          can be flat, shop, or custom. */}
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

                    return (
                      <Pressable
                        key={`member-${member.id}`}
                        onPress={() => handleMemberPress(member)}
                        style={({ pressed }) => [
                          styles.groupRow,
                          index === matchedMemberProfiles.length - 1 &&
                            styles.groupRowLast,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.groupRowInfo}>
                          <View style={styles.groupRowTitleLine}>
                            <Text
                              style={styles.groupRowTitle}
                              numberOfLines={1}
                            >
                              {unit}
                            </Text>
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
                          </View>
                          <Text style={styles.groupRowSubtitle}>
                            Maintenance{" "}
                            {formatCurrency(member.maintenanceAmount || 0)} /
                            month
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#94A3B8"
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* ===================== STAFF GROUP ===================== */}
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

                    return (
                      <Pressable
                        key={`staff-${staff.id}`}
                        onPress={() => handleStaffPress(staff)}
                        style={({ pressed }) => [
                          styles.groupRow,
                          index === matchedStaffProfiles.length - 1 &&
                            styles.groupRowLast,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.groupRowInfo}>
                          <View style={styles.groupRowTitleLine}>
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
                          </View>
                          <Text style={styles.groupRowSubtitle}>
                            Salary {formatCurrency(staff.monthlySalary || 0)} /
                            month
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#94A3B8"
                        />
                      </Pressable>
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

          {isStaff ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>My Attendance</Text>
                  <Text style={styles.sectionSubtitle}>
                    Tap the month to change it
                  </Text>
                </View>
              </View>
              <AttendanceSection
                year={attYear}
                month={attMonth}
                onChangeMonth={handleChangeAttendanceMonth}
              />
            </View>
          ) : null}

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
      </View>
    );
  }

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

        {showAttendance ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>My Attendance</Text>
                <Text style={styles.sectionSubtitle}>
                  Tap the month to change it
                </Text>
              </View>
            </View>
            <AttendanceSection
              year={attYear}
              month={attMonth}
              onChangeMonth={handleChangeAttendanceMonth}
            />
          </View>
        ) : null}

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

        {/* ===================== OVERVIEW (clickable) ===================== */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 30 },

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
  accountTypeRow: { flexDirection: "row", alignItems: "center", marginTop: 7 },
  accountStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },
  accountTypeText: { fontSize: 12, color: "#64748B", fontWeight: "500" },
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
  profileInitial: { fontSize: 24, fontWeight: "800", color: "#2563EB" },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 19, fontWeight: "800", color: "#0F172A" },
  profilePhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 5,
  },
  profilePhone: { fontSize: 13, color: "#64748B", fontWeight: "500" },
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
  profileEditText: { fontSize: 12, fontWeight: "700", color: "#2563EB" },

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

  /* ============================ GROUPED CARDS ============================ */
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
  groupCardBody: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  groupRowLast: {
    borderBottomWidth: 0,
  },
  groupRowInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  groupRowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  groupRowTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  groupRowSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 3,
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

  /* ============================ OVERVIEW CARDS ============================ */
  groupOverviewGrid: {
    flexDirection: "row",
    gap: 12,
  },
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
  offerBannerHeaderText: { flex: 1 },
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
  balanceLabel: { fontSize: 13, fontWeight: "700", color: "#475569" },
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
  balanceDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 17 },
  balanceBottom: { flexDirection: "row", justifyContent: "space-between" },
  balanceMiniItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  miniDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  miniLabel: { fontSize: 11, color: "#94A3B8", marginBottom: 2 },
  miniValue: { fontSize: 13, fontWeight: "700", color: "#334155" },

  section: { marginBottom: 25 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  sectionSubtitle: { fontSize: 12, color: "#94A3B8", marginTop: 3 },
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

  statsGrid: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    minHeight: 135,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 25,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 12,
  },
  statTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginTop: 2,
  },
  statDescription: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

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
  quickActionTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  quickActionSubtitle: { fontSize: 11, color: "#94A3B8", marginTop: 3 },
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
  financialLabel: { fontSize: 11, color: "#64748B", fontWeight: "600" },
  financialAmount: { fontSize: 17, fontWeight: "800", marginTop: 5 },
  financialPeriod: { fontSize: 10, color: "#94A3B8", marginTop: 4 },

  attendanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sliderArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sliderMonth: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sliderMonthText: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  summaryLabel: { fontSize: 10, color: "#94A3B8", fontWeight: "600" },
  summaryValue: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
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
    maxWidth: 36,
    maxHeight: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleToday: { borderWidth: 2, borderColor: "#2563EB" },
  dayText: { fontSize: 12, fontWeight: "700" },

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
  pickerTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
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
  yearChipText: { fontSize: 14, fontWeight: "700", color: "#475569" },
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
  monthChipText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  monthChipTextActive: { color: "#FFFFFF" },
  pickerConfirm: {
    marginTop: 20,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerConfirmText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },

  footerMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  footerMessageText: { fontSize: 12, color: "#94A3B8" },

  emptyScrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
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
  primaryButtonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
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
  secondaryButtonText: { fontSize: 13, color: "#2563EB", fontWeight: "600" },

  pressed: { opacity: 0.72 },
  bottomSpace: { height: 20 },
});

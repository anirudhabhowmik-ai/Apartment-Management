// app/(tabs)/people.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DatePickerModal from "../../components/DatePickerModal";
import GenerateBillModal from "../../components/GenerateBillModal";
import MonthYearPickerModal from "../../components/MonthYearPickerModal";
import { useAccounts } from "../../hooks/useAccounts";
import {
  useExpenses,
  useManagementStore,
  useMembers,
  useStaff,
} from "../../hooks/useManagement";
import { usePayments } from "../../hooks/usePayments";
import { useUserRole } from "../../hooks/useUserRole";
import { generateBillPDF, savePDFToDevice } from "../../services/pdfGenerator";
import { useAttendanceStore } from "../../store/attendanceStore";
import { BillMemberType, useBillStore } from "../../store/billStore";
import { useAuthStore } from "../../store/useAuthStore";
import type { AttendanceStatus, ManagementType } from "../../types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const MANAGEMENT_PREFIX = "/management";

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");

  const token = await getAuthToken();
  const url = `${API_BASE_URL}${MANAGEMENT_PREFIX}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const COLORS = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primaryLight: "#EFF6FF",
  primarySoft: "#DBEAFE",

  background: "#F5F7FB",
  white: "#FFFFFF",
  surface: "#F8FAFC",

  text: "#0F172A",
  textSoft: "#334155",
  secondary: "#64748B",
  muted: "#94A3B8",

  border: "#E2E8F0",
  borderLight: "#EEF2F7",

  success: "#16A34A",
  successDark: "#15803D",
  successLight: "#F0FDF4",
  successBorder: "#BBF7D0",

  danger: "#DC2626",
  dangerLight: "#FEF2F2",
  dangerBorder: "#FECACA",

  purple: "#7C3AED",
  purpleLight: "#F5F3FF",
  purpleBorder: "#DDD6FE",

  amber: "#D97706",
  amberLight: "#FEF3C7",
  amberBorder: "#FDE68A",
};

type PaymentFilter = "all" | "paid" | "due";

// ---------------------------------------------------------------------------
// Role styling maps
// ---------------------------------------------------------------------------

interface RoleStyle {
  label: string;
  bg: string;
  text: string;
  border: string;
}

const MEMBER_ROLE_STYLES: Record<string, RoleStyle> = {
  flat: {
    label: "Flat Owner",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  shop: {
    label: "Shop Owner",
    bg: "#F5F3FF",
    text: "#6D28D9",
    border: "#DDD6FE",
  },
  custom: {
    label: "Custom",
    bg: "#F1F5F9",
    text: "#475569",
    border: "#CBD5E1",
  },
  flat_owner: {
    label: "Flat Owner",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  shop_owner: {
    label: "Shop Owner",
    bg: "#F5F3FF",
    text: "#6D28D9",
    border: "#DDD6FE",
  },
  owner: {
    label: "Owner",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  secretary: {
    label: "Secretary",
    bg: "#F5F3FF",
    text: "#6D28D9",
    border: "#DDD6FE",
  },
  tenant: {
    label: "Tenant",
    bg: "#FEF3C7",
    text: "#B45309",
    border: "#FDE68A",
  },
};

const STAFF_ROLE_STYLES: Record<string, RoleStyle> = {
  accountant: {
    label: "Accountant",
    bg: "#ECFDF5",
    text: "#047857",
    border: "#A7F3D0",
  },
  security: {
    label: "Security",
    bg: "#FEF2F2",
    text: "#B91C1C",
    border: "#FECACA",
  },
  sweeper: {
    label: "Sweeper",
    bg: "#F5F3FF",
    text: "#6D28D9",
    border: "#DDD6FE",
  },
  maintenance: {
    label: "Maintenance",
    bg: "#FEF3C7",
    text: "#B45309",
    border: "#FDE68A",
  },
  gardener: {
    label: "Gardener",
    bg: "#F0FDF4",
    text: "#15803D",
    border: "#BBF7D0",
  },
  driver: {
    label: "Driver",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  custom: {
    label: "Custom",
    bg: "#F1F5F9",
    text: "#475569",
    border: "#CBD5E1",
  },
};

const DEFAULT_ROLE_STYLE: RoleStyle = {
  label: "Role",
  bg: "#F1F5F9",
  text: "#475569",
  border: "#CBD5E1",
};

function titleCaseRole(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getMemberRoleStyle(role?: string | null): RoleStyle {
  if (!role) return { ...DEFAULT_ROLE_STYLE, label: "Member" };
  const key = String(role).toLowerCase().trim();
  if (MEMBER_ROLE_STYLES[key]) return MEMBER_ROLE_STYLES[key];
  return { ...DEFAULT_ROLE_STYLE, label: titleCaseRole(key) };
}

function getStaffRoleStyle(role?: string | null): RoleStyle {
  if (!role) return { ...DEFAULT_ROLE_STYLE, label: "Staff" };
  const key = String(role).toLowerCase().trim();
  if (STAFF_ROLE_STYLES[key]) return STAFF_ROLE_STYLES[key];
  return { ...DEFAULT_ROLE_STYLE, label: titleCaseRole(key) };
}

const CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary",
  maintenance: "Maintenance",
  electricity: "Electricity",
  water: "Water",
  hall_rent: "Hall Rent",
  parking_rent: "Parking Rent",
  advertisement: "Advertisement",
  interest: "Interest / Deposit",
  other_income: "Other Income",
  other: "Other",
};

const getCategoryLabel = (raw?: string | null): string => {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s) return "—";
  if (CATEGORY_LABELS[s]) return CATEGORY_LABELS[s];
  const lower = s.toLowerCase();
  if (CATEGORY_LABELS[lower]) return CATEGORY_LABELS[lower];
  return lower
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const getTransactionTypeLabel = (txn: any): "income" | "expense" => {
  const raw = String(txn?.transactionType ?? txn?.transaction_type ?? "")
    .trim()
    .toLowerCase();
  return raw === "income" ? "income" : "expense";
};

function parseDateParts(raw: string): {
  year: string;
  month: string;
  day: string;
} | null {
  if (!raw) return null;
  const datePart = String(raw).trim().split(/[T ]/)[0];
  const parts = datePart.split("-");
  if (parts.length < 3) return null;
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return null;
  if (year.length !== 4) return null;
  return { year, month: month.padStart(2, "0"), day: day.padStart(2, "0") };
}

const formatFullDate = (dateStr: string): string => {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.day}/${parts.month}/${parts.year}`;
};

const formatBadgeDate = (dateStr: string): string => {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.day}/${parts.month}/${parts.year}`;
};

// Indian digit grouping (12,34,567) without relying on Intl support.
const formatINR = (value: number): string => {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const negative = n < 0;
  const s = String(Math.abs(n));
  let out: string;
  if (s.length <= 3) {
    out = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = `${rest},${last3}`;
  }
  return `${negative ? "-" : ""}₹${out}`;
};

const formatPhoneForDisplay = (raw?: string | null): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return String(raw);
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
};

const callNumber = async (raw?: string | null) => {
  if (!raw) return;
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) {
    Alert.alert("Invalid number", "This phone number looks incomplete.");
    return;
  }
  const url = `tel:+91${ten}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.warn("Failed to open dialer:", error);
    Alert.alert("Cannot call", "Unable to open the phone dialer.");
  }
};

const getTabLabel = (
  type: ManagementType,
  accountType?: "apartment" | "home",
): string => {
  if (type === "apartment") {
    return accountType === "home" ? "Tenants" : "Members";
  }
  if (type === "staff") return "Staff";
  if (type === "expense") return "Transactions";
  return "Group";
};

const getAddButtonLabel = (
  type: ManagementType,
  accountType?: "apartment" | "home",
): string => {
  if (type === "apartment") {
    return accountType === "home" ? "Add Tenant" : "Add Member";
  }
  if (type === "staff") return "Add Staff";
  if (type === "expense") return "Add Entry";
  return "Add";
};

const getTabIcon = (type: ManagementType): keyof typeof Ionicons.glyphMap => {
  if (type === "apartment") return "business-outline";
  if (type === "staff") return "people-outline";
  if (type === "expense") return "wallet-outline";
  return "folder-outline";
};

const getPaymentForMonth = (member: any, month: string | null) => {
  if (!month) return { status: "due" as const, netAmount: null };

  if (member.monthlyPayments?.[month]) {
    return member.monthlyPayments[month];
  }
  if (member.paidDate?.slice(0, 7) === month) {
    return {
      status: member.paymentStatus || "due",
      paidDate: member.paidDate,
      additionalAmount: member.additionalAmount,
      deductionAmount: member.deductionAmount,
      additionalNote: member.additionalNote,
      deductionNote: member.deductionNote,
      netAmount: null,
    };
  }
  return { status: "due" as const, netAmount: null };
};

const formatMonth = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleString("default", {
    month: "short",
    year: "numeric",
  });

const formatMonthLong = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

const navigateMonth = (
  currentMonth: string | null,
  direction: "prev" | "next",
): string => {
  if (!currentMonth) return new Date().toISOString().slice(0, 7);
  const [year, month] = currentMonth.split("-").map(Number);
  let newMonth = month + (direction === "next" ? 1 : -1);
  let newYear = year;
  if (newMonth > 12) {
    newMonth = 1;
    newYear = year + 1;
  } else if (newMonth < 1) {
    newMonth = 12;
    newYear = year - 1;
  }
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
};

const normalizePhoneForSearch = (raw?: string): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const memberMatchesQuery = (member: any, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = String(member?.name ?? "").toLowerCase();
  if (name.includes(q)) return true;
  const phoneDigits = normalizePhoneForSearch(member?.phone);
  const queryDigits = q.replace(/\D/g, "");
  if (queryDigits && phoneDigits.includes(queryDigits)) return true;
  return false;
};

const defaultPaidDate = (month: string | null): string => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  if (!month) return todayStr;
  return todayStr.slice(0, 7) === month ? todayStr : `${month}-01`;
};

const getCalculatedStaffSalary = (
  salary: number,
  month: string,
  statuses: Record<string, AttendanceStatus>,
): number => {
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
};

const resolveDueAmount = (
  member: any,
  month: string | null,
  opts: {
    isApartmentTab: boolean;
    isStaffTab: boolean;
    getAttendanceRecord: (
      id: string,
      month: string,
    ) =>
      | {
          statuses?: Record<string, AttendanceStatus>;
          calculatedSalary?: number | null;
        }
      | undefined;
  },
): number => {
  const payment = getPaymentForMonth(member, month);

  if (
    payment?.netAmount != null &&
    Number.isFinite(Number(payment.netAmount))
  ) {
    return Number(payment.netAmount);
  }

  const base = opts.isApartmentTab
    ? Number(member?.maintenanceAmount) || 0
    : Number(member?.monthlySalary) || 0;

  let effectiveBase = base;
  if (opts.isStaffTab && month) {
    const att = opts.getAttendanceRecord(member.id, month);
    if (att?.calculatedSalary != null) {
      effectiveBase = att.calculatedSalary;
    } else if (att?.statuses && Object.keys(att.statuses).length > 0) {
      effectiveBase = getCalculatedStaffSalary(base, month, att.statuses);
    }
  }

  const additional = Number(payment?.additionalAmount) || 0;
  const deduction = Number(payment?.deductionAmount) || 0;
  const computed = Math.max(0, effectiveBase + additional - deduction);

  if (
    computed === 0 &&
    month &&
    payment?.status !== "paid" &&
    member?.due_amount != null &&
    Number.isFinite(Number(member.due_amount))
  ) {
    return Number(member.due_amount);
  }

  return computed;
};

const isActiveRow = (row: any): boolean => {
  const s = row?.status;
  if (s === undefined || s === null || s === "") return true;
  return String(s).toLowerCase() === "active";
};

interface GroupedCard {
  user_id: string;
  name: string;
  phone: string | null;
  photo_url: string | null;
  records: any[];
  /** Number of records before a Paid/Due filter was applied. */
  totalCount?: number;
}

function groupRowsByUser(rows: any[]): GroupedCard[] {
  const map = new Map<string, GroupedCard>();
  for (const row of rows) {
    const uid = row.userId || row.user_id || `__orphan__:${row.id}`;
    if (!map.has(uid)) {
      map.set(uid, {
        user_id: uid,
        name: row.name || "",
        phone: row.phone || null,
        photo_url: row.photoUri || row.photo_url || null,
        records: [],
      });
    }
    map.get(uid)!.records.push(row);
  }
  return Array.from(map.values());
}

const getRecordStatus = (
  record: any,
  month: string,
  isExpense: boolean,
): "paid" | "due" => {
  if (isExpense) return record.status === "paid" ? "paid" : "due";
  return getPaymentForMonth(record, month).status === "paid" ? "paid" : "due";
};

const cardHasStatus = (
  card: GroupedCard,
  status: "paid" | "due",
  month: string,
  isExpense: boolean,
): boolean =>
  card.records.some((r) => getRecordStatus(r, month, isExpense) === status);

interface TemplateMissingState {
  visible: boolean;
  memberType: BillMemberType;
  isApartment: boolean;
}

const EMPTY_TEMPLATE_MISSING: TemplateMissingState = {
  visible: false,
  memberType: "owner",
  isApartment: true,
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  hint,
  color,
  align = "left",
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <View
      style={[
        styles.summaryStat,
        align === "right" && { alignItems: "flex-end" },
      ]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.summaryHint}>{hint}</Text> : null}
    </View>
  );
}

export default function PeopleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { tab, memberId } = useLocalSearchParams<{
    tab?: ManagementType;
    memberId?: string;
  }>();

  const { selectedAccountId, selectedAccount } = useAccounts();
  const { user } = useAuthStore();
  const myUserId = user?.id ?? null;

  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    new Date().toISOString().slice(0, 7),
  );
  const month = selectedMonth || new Date().toISOString().slice(0, 7);

  const membersHook = useMembers(selectedAccountId ?? null, selectedMonth);
  const staffHook = useStaff(selectedAccountId ?? null, selectedMonth);
  const expensesHook = useExpenses(selectedAccountId ?? null);

  const { upsertMemberPayment, upsertStaffPayment } = usePayments(
    selectedAccountId ?? undefined,
  );

  const getAttendanceRecord = useAttendanceStore((state) => state.getRecord);
  const cacheAttendance = useAttendanceStore((state) => state.saveRecord);
  const clearRecord = useAttendanceStore((state) => state.clearRecord);
  const attendanceVersion = useAttendanceStore((state) => state.version);

  const { getBillConfig, templates: billTemplates } = useBillStore();
  const { isAdmin, isMember } = useUserRole();

  const canEdit = isAdmin;
  const canSeeFinance = isAdmin || isMember;
  const canSeeExpenseTab = isAdmin;
  const canSeeMemberTab = true;
  const canSeeStaffTab = true;

  const visibleTabTypes: ManagementType[] = [];
  if (canSeeMemberTab) visibleTabTypes.push("apartment");
  if (canSeeStaffTab) visibleTabTypes.push("staff");
  if (canSeeExpenseTab) visibleTabTypes.push("expense");

  const tabTypes: ManagementType[] = ["apartment", "staff", "expense"];

  const [activeTab, setActiveTab] = useState<ManagementType>("apartment");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [paymentMember, setPaymentMember] = useState<any>(null);

  const [modalAttendance, setModalAttendance] = useState<{
    statuses: Record<string, AttendanceStatus>;
    calculatedSalary: number | null;
  } | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<"paid" | "due">("due");
  const [paidDate, setPaidDate] = useState(defaultPaidDate(null));
  const [showPaidDatePicker, setShowPaidDatePicker] = useState(false);
  const [showAdditionalAmount, setShowAdditionalAmount] = useState(false);
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [additionalNote, setAdditionalNote] = useState("");
  const [showDeduction, setShowDeduction] = useState(false);
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionNote, setDeductionNote] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [generatingBill, setGeneratingBill] = useState<string | null>(null);

  const [templateMissing, setTemplateMissing] = useState<TemplateMissingState>(
    EMPTY_TEMPLATE_MISSING,
  );

  const [showGenerateBillModal, setShowGenerateBillModal] = useState(false);
  const [generateBillMemberType, setGenerateBillMemberType] =
    useState<BillMemberType>("owner");

  const [searchQuery, setSearchQuery] = useState<
    Record<ManagementType, string>
  >({
    apartment: "",
    staff: "",
    expense: "",
  });

  const [paymentFilter, setPaymentFilter] = useState<
    Record<ManagementType, PaymentFilter>
  >({
    apartment: "all",
    staff: "all",
    expense: "all",
  });

  const activeSearch = searchQuery[activeTab];
  const activeFilter = paymentFilter[activeTab];

  const setActiveSearch = (value: string) =>
    setSearchQuery((current) => ({ ...current, [activeTab]: value }));

  const setActiveFilter = (value: PaymentFilter) =>
    setPaymentFilter((current) => ({ ...current, [activeTab]: value }));

  const isApartmentTab = activeTab === "apartment";
  const isStaffTab = activeTab === "staff";
  const isExpenseTab = activeTab === "expense";

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([membersHook.refresh(), staffHook.refresh()]);
      } catch (e) {
        if (!cancelled) console.warn("Initial refresh failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedAccountId) return;
      let cancelled = false;
      (async () => {
        try {
          await Promise.all([
            membersHook.refresh({ force: true }),
            staffHook.refresh({ force: true }),
          ]);
        } catch (e) {
          if (!cancelled) console.warn("Focus refresh failed:", e);
        }
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAccountId, selectedMonth]),
  );

  useEffect(() => {
    if (!paymentMember) {
      setModalAttendance(null);
      return;
    }

    const targetMemberId = paymentMember.id;
    const accountId = selectedAccountId;

    if (!accountId || !targetMemberId) return;

    const isStaffRow = !!staffHook.getById(targetMemberId);
    if (!isStaffRow) {
      setModalAttendance(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{
          statuses?: Record<string, AttendanceStatus>;
          calculated_salary?: number | string | null;
          calculatedSalary?: number | string | null;
        } | null>(`/${accountId}/staff/${targetMemberId}/attendance/${month}`);

        if (cancelled) return;

        if (!data) {
          const cached = getAttendanceRecord(targetMemberId, month);
          setModalAttendance({
            statuses: cached?.statuses ?? {},
            calculatedSalary: cached?.calculatedSalary ?? null,
          });
          return;
        }

        const statuses: Record<string, AttendanceStatus> = data?.statuses ?? {};
        const rawCalc =
          data?.calculated_salary ?? data?.calculatedSalary ?? null;
        const calculatedSalary =
          rawCalc != null && Number.isFinite(Number(rawCalc))
            ? Number(rawCalc)
            : null;

        setModalAttendance({ statuses, calculatedSalary });

        if (Object.keys(statuses).length > 0) {
          cacheAttendance({
            memberId: targetMemberId,
            month,
            statuses,
            calculatedSalary,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[people] attendance fetch failed:", err);
        const cached = getAttendanceRecord(targetMemberId, month);
        setModalAttendance({
          statuses: cached?.statuses ?? {},
          calculatedSalary: cached?.calculatedSalary ?? null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMember, selectedMonth, selectedAccountId, attendanceVersion]);

  useEffect(() => {
    if (tab === "apartment" || tab === "staff" || tab === "expense") {
      if (!visibleTabTypes.includes(tab)) {
        setActiveTab("apartment");
      } else {
        setActiveTab(tab);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    setSearchQuery((current) => ({ ...current, [activeTab]: "" }));
    setPaymentFilter((current) => ({ ...current, [activeTab]: "all" }));
  }, [activeTab]);

  useEffect(() => {
    if (!selectedAccountId || !selectedMonth) return;
    if (staffHook.items.length === 0) return;
    staffHook.items.forEach((s: any) => {
      if (s.attendance_for_month == null) {
        const cached = getAttendanceRecord(s.id, selectedMonth);
        if (!cached) clearRecord(s.id, selectedMonth);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, selectedMonth, staffHook.items]);

  // Hide the floating add button while the keyboard is open.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Derived data (ALL hooks live above the early return below)
  // -------------------------------------------------------------------------

  const activeMembersSource = useMemo(
    () => membersHook.items.filter(isActiveRow),
    [membersHook.items],
  );
  const activeStaffSource = useMemo(
    () => staffHook.items.filter(isActiveRow),
    [staffHook.items],
  );

  const activeMembers = useMemo(() => {
    const membersInActiveGroup =
      activeTab === "apartment"
        ? activeMembersSource
        : activeTab === "staff"
          ? activeStaffSource
          : expensesHook.items;

    if (!selectedMonth) return membersInActiveGroup;

    return membersInActiveGroup.filter((member: any) => {
      const date =
        activeTab === "expense" && "dueDate" in member
          ? member.dueDate
          : member.createdAt;
      return activeTab === "expense"
        ? date?.slice(0, 7) === selectedMonth
        : (date?.slice(0, 7) ?? "") <= selectedMonth;
    });
  }, [
    activeTab,
    activeMembersSource,
    activeStaffSource,
    expensesHook.items,
    selectedMonth,
  ]);

  const showFinancialInfo =
    canSeeFinance && (isApartmentTab || isStaffTab || isExpenseTab);

  const groupedCards = useMemo<GroupedCard[]>(() => {
    if (isExpenseTab) {
      return activeMembers.map((m: any) => ({
        user_id: `expense-${m.id}`,
        name: m.name,
        phone: null,
        photo_url: null,
        records: [m],
      }));
    }
    return groupRowsByUser(activeMembers);
  }, [activeMembers, isExpenseTab]);

  const searchedCards = useMemo(
    () => groupedCards.filter((card) => memberMatchesQuery(card, activeSearch)),
    [groupedCards, activeSearch],
  );

  const statusCounts = useMemo(() => {
    let paid = 0;
    let due = 0;
    for (const card of searchedCards) {
      if (cardHasStatus(card, "paid", month, isExpenseTab)) paid += 1;
      if (cardHasStatus(card, "due", month, isExpenseTab)) due += 1;
    }
    return { all: searchedCards.length, paid, due };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedCards, month, isExpenseTab, attendanceVersion]);

  const visibleGroupedCards = useMemo<GroupedCard[]>(() => {
    if (activeFilter === "all") return searchedCards;

    // A person can own several flats / hold several roles with mixed
    // statuses. Keep only the records that match the filter so a "Due"
    // filter never shows a paid flat (and vice versa).
    const result: GroupedCard[] = [];
    for (const card of searchedCards) {
      const matching = card.records.filter(
        (r) => getRecordStatus(r, month, isExpenseTab) === activeFilter,
      );
      if (matching.length > 0) {
        result.push({
          ...card,
          records: matching,
          totalCount: card.records.length,
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedCards, activeFilter, month, isExpenseTab, attendanceVersion]);

  const summary = useMemo(() => {
    if (isExpenseTab) {
      let income = 0;
      let expense = 0;
      for (const card of groupedCards) {
        for (const r of card.records) {
          const amt = Number(r.amount) || 0;
          if (getTransactionTypeLabel(r) === "income") income += amt;
          else expense += amt;
        }
      }
      return { kind: "expense" as const, income, expense };
    }

    let paidAmount = 0;
    let dueAmount = 0;
    let paidCount = 0;
    let dueCount = 0;
    for (const card of groupedCards) {
      for (const r of card.records) {
        const amount = resolveDueAmount(r, selectedMonth, {
          isApartmentTab,
          isStaffTab,
          getAttendanceRecord,
        });
        if (getRecordStatus(r, month, false) === "paid") {
          paidAmount += amount;
          paidCount += 1;
        } else {
          dueAmount += amount;
          dueCount += 1;
        }
      }
    }
    return {
      kind: "dues" as const,
      paidAmount,
      dueAmount,
      paidCount,
      dueCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    groupedCards,
    isExpenseTab,
    isApartmentTab,
    isStaffTab,
    selectedMonth,
    month,
    attendanceVersion,
  ]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleAdd = async (type: ManagementType) => {
    if (!canEdit) return;
    router.push({
      pathname: "/(modals)/add-member",
      params: {
        accountId: selectedAccountId || "",
        groupType: type,
      },
    });
  };

  const openTemplateMissingModal = (
    memberType: BillMemberType,
    isApartment: boolean,
  ) => {
    setTemplateMissing({
      visible: true,
      memberType,
      isApartment,
    });
  };

  const closeTemplateMissingModal = () => {
    setTemplateMissing(EMPTY_TEMPLATE_MISSING);
  };

  const handleGoToBillSetup = () => {
    const { memberType } = templateMissing;
    setGenerateBillMemberType(memberType);
    closeTemplateMissingModal();
    setShowGenerateBillModal(true);
  };

  const openPaymentModal = (member: any) => {
    if (!canEdit) return;
    const m = selectedMonth || new Date().toISOString().slice(0, 7);
    const monthlyPayment = getPaymentForMonth(member, m);
    setModalAttendance(null);
    setPaymentMember(member);
    setSelectedStatus(monthlyPayment.status === "paid" ? "paid" : "due");
    setPaidDate(monthlyPayment.paidDate || defaultPaidDate(selectedMonth));
    setShowAdditionalAmount(
      Boolean(monthlyPayment.additionalAmount || monthlyPayment.additionalNote),
    );
    setAdditionalAmount(monthlyPayment.additionalAmount?.toString() || "");
    setAdditionalNote(monthlyPayment.additionalNote || "");
    setShowDeduction(
      Boolean(monthlyPayment.deductionAmount || monthlyPayment.deductionNote),
    );
    setDeductionAmount(monthlyPayment.deductionAmount?.toString() || "");
    setDeductionNote(monthlyPayment.deductionNote || "");
  };

  useEffect(() => {
    if (!memberId || (tab !== "apartment" && tab !== "staff")) return;
    if (!canEdit) return;
    const list = tab === "apartment" ? activeMembersSource : activeStaffSource;
    const member = list.find((m: any) => m.id === memberId);
    if (member) openPaymentModal(member);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersHook.items, staffHook.items, memberId, tab, canEdit]);

  const handleSavePayment = async () => {
    if (!paymentMember || !canEdit) return;

    setSaving(true);

    const saveMonth = selectedMonth || paidDate.slice(0, 7);

    const additionalAmt = showAdditionalAmount
      ? Number(additionalAmount) || 0
      : 0;
    const deductionAmt = showDeduction ? Number(deductionAmount) || 0 : 0;

    const payload = {
      status: selectedStatus,
      paidDate: selectedStatus === "paid" ? paidDate : null,
      additionalAmount: additionalAmt,
      additionalNote: showAdditionalAmount
        ? additionalNote.trim() || null
        : null,
      deductionAmount: deductionAmt,
      deductionNote: showDeduction ? deductionNote.trim() || null : null,
    };

    const kind: "apartment" | "staff" = isApartmentTab ? "apartment" : "staff";
    if (selectedAccountId) {
      const store = useManagementStore.getState();
      const bucket = store.byKindAndAccount[kind][selectedAccountId] ?? [];
      const existing = bucket.find((m: any) => m.id === paymentMember.id);
      const existingMonthly =
        existing?.monthlyPayments &&
        typeof existing.monthlyPayments === "object"
          ? existing.monthlyPayments
          : {};

      store.patchItem(kind, selectedAccountId, paymentMember.id, {
        paymentStatus: payload.status,
        paidDate: payload.paidDate ?? undefined,
        additionalAmount: payload.additionalAmount ?? undefined,
        additionalNote: payload.additionalNote ?? undefined,
        deductionAmount: payload.deductionAmount ?? undefined,
        deductionNote: payload.deductionNote ?? undefined,
        monthlyPayments: {
          ...existingMonthly,
          [saveMonth]: {
            status: payload.status,
            paidDate: payload.paidDate ?? undefined,
            additionalAmount: payload.additionalAmount ?? undefined,
            additionalNote: payload.additionalNote ?? undefined,
            deductionAmount: payload.deductionAmount ?? undefined,
            deductionNote: payload.deductionNote ?? undefined,
          },
        },
      });
    }

    try {
      if (isApartmentTab) {
        await upsertMemberPayment(paymentMember.id, saveMonth, payload);
      } else if (isStaffTab) {
        await upsertStaffPayment(paymentMember.id, saveMonth, payload);
      }

      try {
        if (isApartmentTab) await membersHook.refresh({ force: true });
        else if (isStaffTab) await staffHook.refresh({ force: true });
      } catch (refreshErr) {
        console.warn("Post-save refresh failed:", refreshErr);
      }

      setRefreshKey((previous) => previous + 1);
    } catch (error) {
      console.error("Failed to save payment:", error);
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to save payment. Please try again.",
      );
    } finally {
      setSaving(false);
      setPaymentMember(null);
    }
  };

  const handleDownloadBill = async (member: any) => {
    if (generatingBill || !canEdit) return;

    try {
      setGeneratingBill(member.id);

      const m = selectedMonth || new Date().toISOString().slice(0, 7);
      const monthlyPayment = getPaymentForMonth(member, m);

      if (monthlyPayment.status !== "paid") {
        Alert.alert(
          "No Paid Bill",
          "This member doesn't have a paid bill for this month. Please mark the payment as paid first.",
        );
        setGeneratingBill(null);
        return;
      }

      const memberType: BillMemberType = isApartmentTab ? "owner" : "staff";
      const billConfig = getBillConfig(memberType);

      if (!billConfig) {
        setGeneratingBill(null);
        openTemplateMissingModal(memberType, isApartmentTab);
        return;
      }

      const selectedTemplate =
        billTemplates.find((t) => t.id === billConfig.templateId) ??
        billTemplates[0];

      if (!selectedTemplate) {
        setGeneratingBill(null);
        Alert.alert(
          "Template Error",
          "Could not find the saved template. Please re-save it in Profile → Generate Bill.",
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

      const baseAmount = isApartmentTab
        ? member.maintenanceAmount || 0
        : member.monthlySalary || 0;

      const additionalAmount = monthlyPayment.additionalAmount || 0;
      const deductionAmount = monthlyPayment.deductionAmount || 0;
      const netAmount = baseAmount + additionalAmount - deductionAmount;

      const billNumber = `BILL-${member.id.slice(0, 4)}-${Date.now()
        .toString()
        .slice(-6)}`;

      const billData = {
        billNumber,
        apartmentName: member.wing || "Apartment",
        address: billConfig.address || (selectedAccount as any)?.address || "",
        societyName:
          billConfig.societyName ||
          selectedAccount?.name ||
          "Apartment Society",
        contactNumber: billConfig.contactNumber || "",
        email: billConfig.email || "",
        memberName: member.name,
        flatNumber: member.flatNumber || "",
        amount: baseAmount,
        month: formatMonthLong(m),
        paidDate:
          monthlyPayment.paidDate || new Date().toISOString().slice(0, 10),
        additionalAmount: additionalAmount || undefined,
        additionalNote: monthlyPayment.additionalNote,
        deductionAmount: deductionAmount || undefined,
        deductionNote: monthlyPayment.deductionNote,
        netAmount,
        signData: billConfig.signature,
        template,
        billType: isApartmentTab
          ? ("maintenance" as const)
          : ("salary" as const),
        staffRole: isApartmentTab ? undefined : member.role,
      };

      const pdfUri = await generateBillPDF(billData);

      if (!pdfUri) {
        throw new Error("PDF generation returned no URI.");
      }

      const safeName = (member.name || "Member").replace(/[^\w\-]+/g, "_");
      const fileName = `Bill-${safeName}-${m}.pdf`;

      const result = await savePDFToDevice(pdfUri, fileName);

      setGeneratingBill(null);

      if (result.saved) {
        Alert.alert("Downloaded", "Bill saved successfully.");
      } else if (result.message !== "Permission denied") {
        Alert.alert(
          "Download Failed",
          result.message || "Could not save the bill. Please try again.",
        );
      }
    } catch (error) {
      console.error("Error generating bill:", error);
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to generate bill. Please try again.",
      );
      setGeneratingBill(null);
    }
  };

  const handlePrevMonth = () => {
    setSelectedMonth(navigateMonth(selectedMonth, "prev"));
  };

  const handleNextMonth = () => {
    setSelectedMonth(navigateMonth(selectedMonth, "next"));
  };

  // -------------------------------------------------------------------------
  // Early return — safe now, every hook has already run.
  // -------------------------------------------------------------------------

  if (!selectedAccountId) {
    return (
      <View style={styles.container}>
        <View style={styles.noPropertyState}>
          <View style={styles.noPropertyIcon}>
            <Ionicons
              name="business-outline"
              size={40}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.noPropertyTitle}>Create your property</Text>
          <Text style={styles.noPropertySubtitle}>
            Create a property first to start managing your apartment or home.
          </Text>
          {canEdit && (
            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                pressed && styles.pressedButton,
              ]}
              onPress={() => router.push("/(modals)/add-account")}
            >
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.createButtonText}>Create Property</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render-only derived values
  // -------------------------------------------------------------------------

  const baseSalary = paymentMember
    ? isApartmentTab
      ? paymentMember.maintenanceAmount || 0
      : paymentMember.monthlySalary || 0
    : 0;

  const attendanceRecordForModal = paymentMember
    ? getAttendanceRecord(paymentMember.id, month)
    : undefined;

  const attendanceAdjustedSalary = (() => {
    if (!isStaffTab || !paymentMember) return null;
    if (!("monthlySalary" in paymentMember)) return null;

    const base = paymentMember.monthlySalary || 0;

    if (attendanceRecordForModal?.calculatedSalary != null) {
      return attendanceRecordForModal.calculatedSalary;
    }
    if (
      attendanceRecordForModal?.statuses &&
      Object.keys(attendanceRecordForModal.statuses).length > 0
    ) {
      return getCalculatedStaffSalary(
        base,
        month,
        attendanceRecordForModal.statuses as Record<string, AttendanceStatus>,
      );
    }
    if (modalAttendance?.calculatedSalary != null) {
      return modalAttendance.calculatedSalary;
    }
    if (
      modalAttendance?.statuses &&
      Object.keys(modalAttendance.statuses).length > 0
    ) {
      return getCalculatedStaffSalary(base, month, modalAttendance.statuses);
    }
    return null;
  })();

  const effectiveBase =
    isStaffTab && attendanceAdjustedSalary != null
      ? attendanceAdjustedSalary
      : baseSalary;

  const netPaidAmount =
    effectiveBase +
    (showAdditionalAmount ? Number(additionalAmount) || 0 : 0) -
    (showDeduction ? Number(deductionAmount) || 0 : 0);

  const isFilterActive = activeFilter !== "all";
  const filterLabel =
    activeFilter === "all" ? "All" : activeFilter === "paid" ? "Paid" : "Due";

  // Extra room at the bottom so the floating add button never covers the last card.
  const listBottomPadding = Math.max(insets.bottom, 16) + (canEdit ? 96 : 40);

  const showSummary = showFinancialInfo && groupedCards.length > 0;
  const showToolbar = groupedCards.length > 0;

  const filterOptions: {
    key: PaymentFilter;
    label: string;
    count: number;
    color: string;
    bg: string;
    border: string;
  }[] = [
    {
      key: "all",
      label: "All",
      count: statusCounts.all,
      color: COLORS.primary,
      bg: COLORS.primaryLight,
      border: COLORS.primarySoft,
    },
    {
      key: "paid",
      label: "Paid",
      count: statusCounts.paid,
      color: COLORS.successDark,
      bg: COLORS.successLight,
      border: COLORS.successBorder,
    },
    {
      key: "due",
      label: "Due",
      count: statusCounts.due,
      color: COLORS.danger,
      bg: COLORS.dangerLight,
      border: COLORS.dangerBorder,
    },
  ];

  const summaryTotal =
    summary.kind === "dues" ? summary.paidCount + summary.dueCount : 0;
  const summaryPct =
    summary.kind === "dues" && summaryTotal > 0
      ? Math.round((summary.paidCount / summaryTotal) * 100)
      : 0;

  return (
    <View style={styles.container}>
      {/* ============================ HEADER ============================ */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleArea}>
            <Text style={styles.title}>
              {isAdmin ? "Management" : isMember ? "Residents" : "Directory"}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {selectedAccount?.name || "Your property"}
            </Text>
          </View>

          <View style={styles.monthPill}>
            <Pressable
              style={({ pressed }) => [
                styles.monthArrow,
                pressed && styles.pressedButton,
              ]}
              onPress={handlePrevMonth}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.monthCenter,
                pressed && styles.pressedButton,
              ]}
              onPress={() => setShowMonthPicker(true)}
            >
              <Text style={styles.monthText}>
                {selectedMonth ? formatMonth(selectedMonth) : "All months"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.monthArrow,
                pressed && styles.pressedButton,
              ]}
              onPress={handleNextMonth}
              hitSlop={6}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.primary}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabsContainer}>
          {tabTypes
            .filter((type) => visibleTabTypes.includes(type))
            .map((type) => {
              const isActive = activeTab === type;
              return (
                <Pressable
                  key={type}
                  style={({ pressed }) => [
                    styles.tab,
                    isActive && styles.tabActive,
                    pressed && !isActive && styles.tabPressed,
                  ]}
                  onPress={() => setActiveTab(type)}
                >
                  <Ionicons
                    name={getTabIcon(type)}
                    size={17}
                    color={isActive ? COLORS.primary : COLORS.secondary}
                  />
                  <Text
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                    numberOfLines={1}
                  >
                    {getTabLabel(type, selectedAccount?.type)}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </View>

      {/* ---------- Search + filter (fixed, outside the scroll area) ---------- */}
      {showToolbar ? (
        <View style={styles.stickyToolbar}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={COLORS.muted} />
            <TextInput
              style={styles.searchInput}
              value={activeSearch}
              onChangeText={setActiveSearch}
              placeholder={
                isExpenseTab
                  ? "Search by transaction name"
                  : "Search by name or mobile no."
              }
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              blurOnSubmit
            />
            {activeSearch.length > 0 && (
              <Pressable
                onPress={() => setActiveSearch("")}
                hitSlop={8}
                style={styles.searchClearButton}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.muted} />
              </Pressable>
            )}
          </View>

          <View style={styles.chipRow}>
            {filterOptions.map((option) => {
              const selected = activeFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && {
                      backgroundColor: option.bg,
                      borderColor: option.border,
                    },
                    pressed && styles.pressedButton,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setActiveFilter(option.key);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && { color: option.color, fontWeight: "700" },
                    ]}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.chipCount,
                      selected && { backgroundColor: option.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipCountText,
                        selected && { color: COLORS.white },
                      ]}
                    >
                      {option.count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ============================ CONTENT ============================ */}
      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: listBottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        {/* ---------- Summary (scrolls away) ---------- */}
        {showSummary ? (
          <View style={styles.summaryCard}>
            {summary.kind === "expense" ? (
              <>
                <Text style={styles.summaryTitle}>
                  Cash flow · {formatMonthLong(month)}
                </Text>
                <View style={styles.summaryRow}>
                  <SummaryStat
                    label="Income"
                    value={formatINR(summary.income)}
                    color={COLORS.successDark}
                  />
                  <SummaryStat
                    label="Expense"
                    value={formatINR(summary.expense)}
                    color={COLORS.danger}
                  />
                  <SummaryStat
                    label="Net"
                    value={formatINR(summary.income - summary.expense)}
                    color={
                      summary.income - summary.expense >= 0
                        ? COLORS.successDark
                        : COLORS.danger
                    }
                    align="right"
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.summaryTitleRow}>
                  <Text style={styles.summaryTitle}>
                    {isStaffTab ? "Salaries" : "Maintenance"} ·{" "}
                    {formatMonthLong(month)}
                  </Text>
                  <Text style={styles.summaryPct}>{summaryPct}% paid</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${summaryPct}%` as any },
                    ]}
                  />
                </View>
                <View style={styles.summaryRow}>
                  <SummaryStat
                    label="Paid"
                    value={formatINR(summary.paidAmount)}
                    hint={`${summary.paidCount} ${
                      summary.paidCount === 1 ? "record" : "records"
                    }`}
                    color={COLORS.successDark}
                  />
                  <SummaryStat
                    label="Pending"
                    value={formatINR(summary.dueAmount)}
                    hint={`${summary.dueCount} ${
                      summary.dueCount === 1 ? "record" : "records"
                    }`}
                    color={COLORS.danger}
                    align="right"
                  />
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* ---------- Cards ---------- */}
        {visibleGroupedCards.length === 0 ? (
          <View style={styles.emptyCard}>
            <View
              style={[
                styles.emptyIcon,
                isStaffTab && styles.emptyIconStaff,
                isExpenseTab && styles.emptyIconExpense,
              ]}
            >
              <Ionicons
                name={
                  activeSearch
                    ? "search-outline"
                    : isFilterActive
                      ? "funnel-outline"
                      : getTabIcon(activeTab)
                }
                size={32}
                color={
                  isStaffTab
                    ? COLORS.purple
                    : isExpenseTab
                      ? COLORS.success
                      : COLORS.primary
                }
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeSearch
                ? "No matches found"
                : isFilterActive
                  ? `No ${filterLabel.toLowerCase()} ${
                      isStaffTab
                        ? "staff"
                        : isExpenseTab
                          ? "transactions"
                          : "members"
                    }`
                  : `No ${getTabLabel(
                      activeTab,
                      selectedAccount?.type,
                    ).toLowerCase()} yet`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeSearch
                ? `Nothing matches "${activeSearch}". Try a different name or number.`
                : isFilterActive
                  ? `No entries with "${filterLabel}" status for this month.`
                  : isExpenseTab
                    ? "Add your first transaction to start tracking income and expenses."
                    : isStaffTab
                      ? "Add staff members to manage attendance and salary."
                      : selectedAccount?.type === "home"
                        ? "Add tenants to start managing your property."
                        : "Add apartment members to manage maintenance and payments."}
            </Text>
            {(activeSearch || isFilterActive) && (
              <Pressable
                style={({ pressed }) => [
                  styles.clearFiltersButton,
                  pressed && styles.pressedButton,
                ]}
                onPress={() => {
                  setActiveSearch("");
                  setActiveFilter("all");
                }}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={17}
                  color={COLORS.primary}
                />
                <Text style={styles.clearFiltersText}>
                  Clear search and filter
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.cardsWrap}>
            {visibleGroupedCards.map((card) => {
              const primaryRecord = card.records[0];

              // ---------------- Expense / transaction card ----------------
              if (isExpenseTab) {
                const txn = primaryRecord;
                const isIncome = getTransactionTypeLabel(txn) === "income";
                const isPaid = txn.status === "paid";
                return (
                  <Pressable
                    key={`${card.user_id}-${refreshKey}`}
                    style={({ pressed }) => [
                      styles.memberCard,
                      pressed && styles.memberCardPressed,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      if (canEdit && txn) {
                        router.push({
                          pathname: "/(modals)/edit-member",
                          params: {
                            memberId: txn.id,
                            accountId: selectedAccountId || "",
                            groupType: activeTab,
                          },
                        });
                      }
                    }}
                  >
                    <View style={styles.txnRow}>
                      <View
                        style={[
                          styles.txnIcon,
                          {
                            backgroundColor: isIncome
                              ? COLORS.successLight
                              : COLORS.dangerLight,
                          },
                        ]}
                      >
                        <Ionicons
                          name={isIncome ? "arrow-down" : "arrow-up"}
                          size={22}
                          color={isIncome ? COLORS.successDark : COLORS.danger}
                        />
                      </View>

                      <View style={styles.txnInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {card.name || "Untitled"}
                        </Text>
                        <Text style={styles.txnMeta} numberOfLines={1}>
                          {getCategoryLabel(txn.role)}
                          {txn.dueDate
                            ? `  ·  ${formatFullDate(txn.dueDate)}`
                            : ""}
                        </Text>
                      </View>

                      <View style={styles.txnRight}>
                        <Text
                          style={[
                            styles.txnAmount,
                            {
                              color: isIncome
                                ? COLORS.successDark
                                : COLORS.text,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {isIncome ? "+" : "−"}
                          {formatINR(Number(txn.amount) || 0)}
                        </Text>
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
                              styles.statusDot,
                              {
                                backgroundColor: isPaid
                                  ? COLORS.success
                                  : COLORS.danger,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.statusPillText,
                              {
                                color: isPaid
                                  ? COLORS.successDark
                                  : COLORS.danger,
                              },
                            ]}
                          >
                            {isPaid ? "Paid" : "Due"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              }

              // ---------------- Member / staff card ----------------
              const isSelf = myUserId === card.user_id;
              const subline = [
                card.phone ? formatPhoneForDisplay(card.phone) : null,
                (card.totalCount ?? card.records.length) > 1
                  ? `${
                      card.records.length !==
                      (card.totalCount ?? card.records.length)
                        ? `${card.records.length} of ${card.totalCount}`
                        : card.records.length
                    } ${isStaffTab ? "roles" : "flats"}`
                  : null,
              ]
                .filter(Boolean)
                .join("  ·  ");

              return (
                <Pressable
                  key={`${card.user_id}-${refreshKey}-${attendanceVersion}`}
                  style={({ pressed }) => [
                    styles.memberCard,
                    pressed && styles.memberCardPressed,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (canEdit && primaryRecord) {
                      router.push({
                        pathname: "/(modals)/edit-member",
                        params: {
                          memberId: primaryRecord.id,
                          accountId: selectedAccountId || "",
                          groupType: activeTab,
                        },
                      });
                    }
                  }}
                >
                  {/* Person row */}
                  <View style={styles.memberTop}>
                    <View
                      style={[
                        styles.memberAvatar,
                        isStaffTab && styles.memberAvatarStaff,
                      ]}
                    >
                      {card.photo_url ? (
                        <Image
                          source={{ uri: card.photo_url }}
                          style={styles.memberPhoto}
                        />
                      ) : (
                        <Text style={styles.memberInitial}>
                          {card.name?.charAt(0)?.toUpperCase() || "?"}
                        </Text>
                      )}
                    </View>

                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {card.name}
                        </Text>
                        {isSelf ? (
                          <View style={styles.youBadge}>
                            <Text style={styles.youBadgeText}>You</Text>
                          </View>
                        ) : null}
                      </View>
                      {subline ? (
                        <Text style={styles.memberSubline} numberOfLines={1}>
                          {subline}
                        </Text>
                      ) : null}
                    </View>

                    {card.phone ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.callButton,
                          pressed && styles.pressedButton,
                        ]}
                        onPress={(event) => {
                          event.stopPropagation();
                          Keyboard.dismiss();
                          callNumber(card.phone);
                        }}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="call"
                          size={18}
                          color={COLORS.primary}
                        />
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Records */}
                  {card.records.map((record: any) => {
                    const monthlyPaymentData = getPaymentForMonth(
                      record,
                      selectedMonth,
                    );
                    const statusPaymentAmount = resolveDueAmount(
                      record,
                      selectedMonth,
                      {
                        isApartmentTab,
                        isStaffTab,
                        getAttendanceRecord,
                      },
                    );
                    const isPaidThisMonth =
                      monthlyPaymentData.status === "paid";

                    const paidDateForMonth: string | null =
                      isPaidThisMonth &&
                      typeof monthlyPaymentData.paidDate === "string" &&
                      monthlyPaymentData.paidDate.length >= 10
                        ? monthlyPaymentData.paidDate
                        : null;

                    const roleStyle = isApartmentTab
                      ? getMemberRoleStyle(record.role)
                      : getStaffRoleStyle(record.role);

                    const recordTitle = isApartmentTab
                      ? `${record.wing ? `${record.wing} · ` : ""}${
                          record.flatNumber
                            ? `Flat ${record.flatNumber}`
                            : "Apartment"
                        }`
                      : roleStyle.label;

                    const baseLabel = isApartmentTab
                      ? `${formatINR(Number(record.maintenanceAmount) || 0)} / month`
                      : `${formatINR(Number(record.monthlySalary) || 0)} / month`;

                    const showPay = showFinancialInfo;
                    const showAttendance = isStaffTab;
                    const showBill = showFinancialInfo && isPaidThisMonth;

                    return (
                      <View key={record.id} style={styles.recordBlock}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.recordRow,
                            pressed && styles.recordRowPressed,
                          ]}
                          onPress={(event) => {
                            event.stopPropagation();
                            Keyboard.dismiss();
                            if (canEdit) {
                              router.push({
                                pathname: "/(modals)/edit-member",
                                params: {
                                  memberId: record.id,
                                  accountId: selectedAccountId || "",
                                  groupType: activeTab,
                                },
                              });
                            }
                          }}
                        >
                          <View style={styles.recordInfo}>
                            <Text style={styles.recordTitle} numberOfLines={1}>
                              {recordTitle}
                            </Text>
                            <View style={styles.recordMetaRow}>
                              {isApartmentTab ? (
                                <View
                                  style={[
                                    styles.roleBadge,
                                    {
                                      backgroundColor: roleStyle.bg,
                                      borderColor: roleStyle.border,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.roleBadgeText,
                                      { color: roleStyle.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {roleStyle.label}
                                  </Text>
                                </View>
                              ) : null}
                              <Text
                                style={styles.recordSubtitle}
                                numberOfLines={1}
                              >
                                {baseLabel}
                              </Text>
                            </View>
                          </View>

                          {showFinancialInfo ? (
                            <View style={styles.recordRight}>
                              <Text
                                style={[
                                  styles.recordAmount,
                                  {
                                    color: isPaidThisMonth
                                      ? COLORS.successDark
                                      : COLORS.danger,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {formatINR(statusPaymentAmount)}
                              </Text>
                              <View style={styles.statusInline}>
                                <View
                                  style={[
                                    styles.statusDot,
                                    {
                                      backgroundColor: isPaidThisMonth
                                        ? COLORS.success
                                        : COLORS.danger,
                                    },
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.statusInlineText,
                                    {
                                      color: isPaidThisMonth
                                        ? COLORS.successDark
                                        : COLORS.danger,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {isPaidThisMonth
                                    ? paidDateForMonth
                                      ? `Paid ${formatBadgeDate(paidDateForMonth)}`
                                      : "Paid"
                                    : "Due"}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </Pressable>

                        {canEdit && (showPay || showAttendance || showBill) ? (
                          <View style={styles.recordActionsRow}>
                            {showAttendance ? (
                              <Pressable
                                style={({ pressed }) => [
                                  styles.recordActionButton,
                                  styles.recordActionAttendance,
                                  pressed && styles.recordActionButtonPressed,
                                ]}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  Keyboard.dismiss();
                                  router.push({
                                    pathname: "/(modals)/mark-attendance",
                                    params: {
                                      memberId: record.id,
                                      accountId: selectedAccountId || "",
                                      month: selectedMonth || "",
                                    },
                                  });
                                }}
                              >
                                <Ionicons
                                  name="calendar-outline"
                                  size={16}
                                  color={COLORS.purple}
                                />
                                <Text
                                  style={[
                                    styles.recordActionText,
                                    { color: COLORS.purple },
                                  ]}
                                >
                                  Attendance
                                </Text>
                              </Pressable>
                            ) : null}

                            {showPay ? (
                              <Pressable
                                style={({ pressed }) => [
                                  styles.recordActionButton,
                                  pressed && styles.recordActionButtonPressed,
                                ]}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  Keyboard.dismiss();
                                  openPaymentModal(record);
                                }}
                              >
                                <Ionicons
                                  name="cash-outline"
                                  size={16}
                                  color={COLORS.primary}
                                />
                                <Text style={styles.recordActionText}>
                                  Payment
                                </Text>
                              </Pressable>
                            ) : null}

                            {showBill ? (
                              <Pressable
                                style={({ pressed }) => [
                                  styles.recordActionButton,
                                  styles.recordActionButtonPrimary,
                                  pressed && styles.recordActionButtonPressed,
                                ]}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  Keyboard.dismiss();
                                  handleDownloadBill(record);
                                }}
                                disabled={generatingBill === record.id}
                              >
                                {generatingBill === record.id ? (
                                  <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                  />
                                ) : (
                                  <>
                                    <Ionicons
                                      name="download-outline"
                                      size={16}
                                      color="#fff"
                                    />
                                    <Text
                                      style={styles.recordActionTextPrimary}
                                    >
                                      Download bill
                                    </Text>
                                  </>
                                )}
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ============================ FLOATING ADD BUTTON ============================ */}
      {canEdit && !keyboardVisible ? (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => handleAdd(activeTab)}
        >
          <Ionicons name="add" size={22} color={COLORS.white} />
          <Text style={styles.fabText}>
            {getAddButtonLabel(activeTab, selectedAccount?.type)}
          </Text>
        </Pressable>
      ) : null}

      <MonthYearPickerModal
        visible={showMonthPicker}
        value={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onSelect={setSelectedMonth}
      />

      {/* ============================ PAYMENT MODAL ============================ */}
      {canEdit && (
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(paymentMember)}
          onRequestClose={() => setPaymentMember(null)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.paymentModal}>
              <View style={styles.paymentModalHeader}>
                <View style={styles.paymentHeaderIcon}>
                  <Ionicons
                    name={isApartmentTab ? "home-outline" : "wallet-outline"}
                    size={22}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.paymentHeaderInfo}>
                  <Text style={styles.paymentTitle}>Payment details</Text>
                  <Text style={styles.paymentMemberName} numberOfLines={1}>
                    {paymentMember?.name}
                  </Text>
                </View>
                <Pressable
                  style={styles.closeModalButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPaymentMember(null);
                  }}
                >
                  <Ionicons name="close" size={20} color={COLORS.text} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.paymentScroll}
                contentContainerStyle={styles.paymentScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <View style={styles.paymentMonthRow}>
                  <View>
                    <Text style={styles.paymentMonthLabel}>Payment for</Text>
                    <Text style={styles.paymentMonthText}>
                      {formatMonthLong(selectedMonth || paidDate.slice(0, 7))}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusSmallBadge,
                      selectedStatus === "paid"
                        ? styles.statusSmallBadgePaid
                        : styles.statusSmallBadgeDue,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusSmallText,
                        selectedStatus === "paid"
                          ? styles.statusSmallTextPaid
                          : styles.statusSmallTextDue,
                      ]}
                    >
                      {selectedStatus === "paid" ? "Paid" : "Due"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>Payment status</Text>

                <View style={styles.statusRadioRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.statusRadioOption,
                      selectedStatus === "paid" && styles.statusRadioOptionPaid,
                      pressed && styles.statusRadioOptionPressed,
                    ]}
                    onPress={() => setSelectedStatus("paid")}
                  >
                    <Ionicons
                      name={
                        selectedStatus === "paid"
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={22}
                      color={
                        selectedStatus === "paid"
                          ? COLORS.success
                          : COLORS.muted
                      }
                    />
                    <Text
                      style={[
                        styles.statusRadioTitle,
                        selectedStatus === "paid" &&
                          styles.statusRadioTitlePaid,
                      ]}
                    >
                      Paid
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.statusRadioOption,
                      selectedStatus === "due" && styles.statusRadioOptionDue,
                      pressed && styles.statusRadioOptionPressed,
                    ]}
                    onPress={() => setSelectedStatus("due")}
                  >
                    <Ionicons
                      name={
                        selectedStatus === "due" ? "time" : "ellipse-outline"
                      }
                      size={22}
                      color={
                        selectedStatus === "due" ? COLORS.danger : COLORS.muted
                      }
                    />
                    <Text
                      style={[
                        styles.statusRadioTitle,
                        selectedStatus === "due" && styles.statusRadioTitleDue,
                      ]}
                    >
                      Due
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.sectionLabel}>
                  {isApartmentTab ? "Maintenance amount" : "Monthly salary"}
                </Text>

                <View style={styles.amountCard}>
                  <View style={styles.amountLeft}>
                    <Ionicons
                      name="cash-outline"
                      size={20}
                      color={COLORS.primary}
                    />
                    <Text style={styles.amountLabel}>
                      {isApartmentTab ? "Base amount" : "Monthly salary"}
                    </Text>
                  </View>
                  <Text style={styles.amountValue}>
                    {formatINR(baseSalary)}
                  </Text>
                </View>

                {isStaffTab && attendanceAdjustedSalary != null ? (
                  <>
                    <Text style={styles.sectionLabel}>Attendance adjusted</Text>
                    <View
                      style={[
                        styles.amountCard,
                        {
                          borderColor: COLORS.primarySoft,
                          backgroundColor: COLORS.primaryLight,
                        },
                      ]}
                    >
                      <View style={styles.amountLeft}>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={COLORS.primary}
                        />
                        <Text
                          style={[
                            styles.amountLabel,
                            { color: COLORS.primaryDark, fontWeight: "700" },
                          ]}
                        >
                          Payable this month
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.amountValue,
                          { color: COLORS.primaryDark },
                        ]}
                      >
                        {formatINR(attendanceAdjustedSalary)}
                      </Text>
                    </View>
                  </>
                ) : null}

                <Pressable
                  style={styles.modifierButton}
                  onPress={() => {
                    setShowAdditionalAmount(!showAdditionalAmount);
                    if (showAdditionalAmount) {
                      setAdditionalAmount("");
                      setAdditionalNote("");
                    }
                  }}
                >
                  <View
                    style={[
                      styles.modifierIcon,
                      showAdditionalAmount
                        ? styles.modifierIconRemove
                        : styles.modifierIconAdd,
                    ]}
                  >
                    <Ionicons
                      name={showAdditionalAmount ? "remove" : "add"}
                      size={18}
                      color={
                        showAdditionalAmount ? COLORS.danger : COLORS.primary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.modifierText,
                      showAdditionalAmount && styles.modifierTextRemove,
                    ]}
                  >
                    {showAdditionalAmount
                      ? "Remove additional amount"
                      : "Add additional amount"}
                  </Text>
                  <Ionicons
                    name={showAdditionalAmount ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={COLORS.muted}
                  />
                </Pressable>

                {showAdditionalAmount && (
                  <View style={styles.inputGroup}>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Additional amount"
                      placeholderTextColor={COLORS.muted}
                      keyboardType="numeric"
                      value={additionalAmount}
                      onChangeText={(value) =>
                        setAdditionalAmount(value.replace(/[^0-9]/g, ""))
                      }
                    />
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Note, e.g. bonus or event work"
                      placeholderTextColor={COLORS.muted}
                      value={additionalNote}
                      onChangeText={setAdditionalNote}
                    />
                  </View>
                )}

                <Pressable
                  style={styles.modifierButton}
                  onPress={() => {
                    setShowDeduction(!showDeduction);
                    if (showDeduction) {
                      setDeductionAmount("");
                      setDeductionNote("");
                    }
                  }}
                >
                  <View
                    style={[
                      styles.modifierIcon,
                      showDeduction
                        ? styles.modifierIconRemove
                        : styles.modifierIconAdd,
                    ]}
                  >
                    <Ionicons
                      name="remove"
                      size={18}
                      color={showDeduction ? COLORS.danger : COLORS.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.modifierText,
                      showDeduction && styles.modifierTextRemove,
                    ]}
                  >
                    {showDeduction ? "Remove deduction" : "Add deduction"}
                  </Text>
                  <Ionicons
                    name={showDeduction ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={COLORS.muted}
                  />
                </Pressable>

                {showDeduction && (
                  <View style={styles.inputGroup}>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Deduction amount"
                      placeholderTextColor={COLORS.muted}
                      keyboardType="numeric"
                      value={deductionAmount}
                      onChangeText={(value) =>
                        setDeductionAmount(value.replace(/[^0-9]/g, ""))
                      }
                    />
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Note, e.g. advance or absence"
                      placeholderTextColor={COLORS.muted}
                      value={deductionNote}
                      onChangeText={setDeductionNote}
                    />
                  </View>
                )}

                <View style={styles.netAmountCard}>
                  <View>
                    <Text style={styles.netAmountLabel}>
                      {selectedStatus === "paid" ? "Net paid" : "Amount to pay"}
                    </Text>
                    <Text style={styles.netAmountHint}>
                      Base + additions − deductions
                    </Text>
                  </View>
                  <Text style={styles.netAmountValue}>
                    {formatINR(netPaidAmount)}
                  </Text>
                </View>

                {selectedStatus === "paid" && (
                  <>
                    <Text style={styles.sectionLabel}>Paid date</Text>
                    <Pressable
                      style={styles.dateSelector}
                      onPress={() => setShowPaidDatePicker(true)}
                    >
                      <View style={styles.dateIcon}>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={COLORS.primary}
                        />
                      </View>
                      <Text style={styles.dateText}>
                        {formatFullDate(paidDate)}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={COLORS.muted}
                      />
                    </Pressable>
                  </>
                )}

                <View style={styles.paymentBottomSpace} />
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.cancelButtonPressed,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPaymentMember(null);
                  }}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    selectedStatus === "due" && styles.saveDueButton,
                    pressed && styles.saveButtonPressed,
                    saving && styles.saveButtonDisabled,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    handleSavePayment();
                  }}
                  disabled={saving}
                >
                  <Ionicons
                    name={
                      selectedStatus === "paid"
                        ? "checkmark-circle-outline"
                        : "time-outline"
                    }
                    size={19}
                    color={COLORS.white}
                  />
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? "Saving..."
                      : selectedStatus === "paid"
                        ? "Save as paid"
                        : "Save as due"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ============================ TEMPLATE NOT SET UP ============================ */}
      <Modal
        transparent
        animationType="fade"
        visible={templateMissing.visible}
        onRequestClose={closeTemplateMissingModal}
      >
        <Pressable
          style={styles.templateBackdrop}
          onPress={closeTemplateMissingModal}
        >
          <Pressable
            style={styles.templateCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.templateIconWrap}>
              <Ionicons
                name="document-text-outline"
                size={30}
                color="#D97706"
              />
            </View>

            <Text style={styles.templateTitle}>Set up the bill template</Text>

            <Text style={styles.templateMessage}>
              {templateMissing.isApartment
                ? "You haven't configured the owner bill template yet. Set it up once and you'll be able to download a bill for every paid month."
                : "You haven't configured the staff payslip template yet. Set it up once and you'll be able to download a payslip for every paid month."}
            </Text>

            <View style={styles.templateActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.templateCancelButton,
                  pressed && styles.templateButtonPressed,
                ]}
                onPress={closeTemplateMissingModal}
              >
                <Text style={styles.templateCancelText}>Not now</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.templatePrimaryButton,
                  pressed && styles.templateButtonPressed,
                ]}
                onPress={handleGoToBillSetup}
              >
                <Ionicons name="settings-outline" size={16} color="#fff" />
                <Text style={styles.templatePrimaryText}>Set up now</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ============================ GENERATE BILL MODAL (inline) ============================ */}
      <GenerateBillModal
        visible={showGenerateBillModal}
        memberType={generateBillMemberType}
        onMemberTypeChange={setGenerateBillMemberType}
        onClose={() => setShowGenerateBillModal(false)}
        onSaved={() => {
          setShowGenerateBillModal(false);
        }}
      />

      <DatePickerModal
        visible={showPaidDatePicker}
        value={paidDate}
        onClose={() => setShowPaidDatePicker(false)}
        onSelect={setPaidDate}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollArea: { flex: 1 },
  pressedButton: { opacity: 0.7 },

  // ----- Header -----
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleArea: { flex: 1, minWidth: 0, marginRight: 12 },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.secondary,
  },
  monthPill: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    paddingHorizontal: 2,
  },
  monthArrow: {
    width: 34,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  monthCenter: {
    minWidth: 76,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  monthText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },

  tabsContainer: {
    flexDirection: "row",
    marginTop: 14,
    padding: 4,
    borderRadius: 14,
    backgroundColor: COLORS.borderLight,
  },
  tab: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: COLORS.white,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabPressed: { opacity: 0.7 },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  tabTextActive: { color: COLORS.primary, fontWeight: "700" },

  // ----- Scroll content -----
  listContent: { paddingHorizontal: 16, paddingTop: 16 },

  // ----- Summary -----
  summaryCard: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...cardShadow,
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  summaryPct: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.successDark,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
    overflow: "hidden",
    marginTop: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 12,
  },
  summaryStat: { flex: 1, minWidth: 0 },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.muted,
  },
  summaryValue: {
    marginTop: 3,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  summaryHint: {
    marginTop: 1,
    fontSize: 12,
    color: COLORS.secondary,
  },

  // ----- Search + chips (fixed under the header) -----
  stickyToolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
    backgroundColor: COLORS.background,
  },
  searchBox: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },
  searchClearButton: { paddingLeft: 4 },

  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 19,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  chipCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.borderLight,
  },
  chipCountText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: COLORS.secondary,
  },

  // ----- Floating add button -----
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingLeft: 16,
    paddingRight: 20,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  fabPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  fabText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: COLORS.white,
  },

  cardsWrap: {},

  // ----- Empty state -----
  emptyCard: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 44,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
  },
  emptyIconStaff: { backgroundColor: COLORS.purpleLight },
  emptyIconExpense: { backgroundColor: COLORS.successLight },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  emptySubtitle: {
    maxWidth: 300,
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.secondary,
    textAlign: "center",
  },
  clearFiltersButton: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  clearFiltersText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },

  // ----- Member card -----
  memberCard: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...cardShadow,
  },
  memberCardPressed: { opacity: 0.85 },
  memberTop: { flexDirection: "row", alignItems: "center" },
  memberAvatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: COLORS.primary,
  },
  memberAvatarStaff: { backgroundColor: COLORS.purple },
  memberPhoto: { width: "100%", height: "100%" },
  memberInitial: { fontSize: 20, fontWeight: "700", color: COLORS.white },
  memberInfo: { flex: 1, minWidth: 0 },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  memberName: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: COLORS.text,
  },
  memberSubline: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.secondary,
  },
  youBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    flexShrink: 0,
  },
  youBadgeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: COLORS.successDark,
  },
  callButton: {
    width: 42,
    height: 42,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: COLORS.primaryLight,
  },

  // ----- Record block -----
  recordBlock: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordRowPressed: { opacity: 0.75 },
  recordInfo: { flex: 1, minWidth: 0, marginRight: 10 },
  recordTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  recordMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  recordSubtitle: { fontSize: 13, color: COLORS.secondary },
  recordRight: { alignItems: "flex-end", maxWidth: "48%" },
  recordAmount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  statusInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  statusInlineText: { fontSize: 12, fontWeight: "700" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },

  recordActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  recordActionButton: {
    flexGrow: 1,
    flexBasis: "40%",
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  recordActionAttendance: {
    backgroundColor: COLORS.purpleLight,
    borderColor: COLORS.purpleBorder,
  },
  recordActionButtonPressed: { opacity: 0.75 },
  recordActionButtonPrimary: {
    flexBasis: "100%",
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  recordActionText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: COLORS.primary,
  },
  recordActionTextPrimary: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#fff",
  },

  // ----- Transaction card -----
  txnRow: { flexDirection: "row", alignItems: "center" },
  txnIcon: {
    width: 48,
    height: 48,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  txnInfo: { flex: 1, minWidth: 0, marginRight: 10 },
  txnMeta: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.secondary,
  },
  txnRight: { alignItems: "flex-end", maxWidth: "45%" },
  txnAmount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
  },
  statusPillPaid: { backgroundColor: COLORS.successLight },
  statusPillDue: { backgroundColor: COLORS.dangerLight },
  statusPillText: { fontSize: 12, fontWeight: "700" },

  // ----- No property -----
  noPropertyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  noPropertyIcon: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderRadius: 25,
    backgroundColor: COLORS.primaryLight,
  },
  noPropertyTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  noPropertySubtitle: {
    maxWidth: 310,
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.secondary,
    textAlign: "center",
  },
  createButton: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    marginTop: 22,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
  },
  createButtonText: {
    marginLeft: 7,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
  },

  // ----- Payment modal -----
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 22,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  paymentModal: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "92%",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: COLORS.white,
  },
  paymentModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  paymentHeaderIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
  },
  paymentHeaderInfo: { flex: 1, minWidth: 0 },
  paymentTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  paymentMemberName: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.secondary,
  },
  closeModalButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  paymentScroll: { flexGrow: 0 },
  paymentScrollContent: { paddingHorizontal: 18, paddingTop: 16 },
  paymentMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
  },
  paymentMonthLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  paymentMonthText: {
    marginTop: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusSmallBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusSmallBadgePaid: { backgroundColor: COLORS.successLight },
  statusSmallBadgeDue: { backgroundColor: COLORS.dangerLight },
  statusSmallText: { fontSize: 12.5, fontWeight: "700" },
  statusSmallTextPaid: { color: COLORS.successDark },
  statusSmallTextDue: { color: COLORS.danger },

  statusRadioRow: { flexDirection: "row", gap: 10 },
  statusRadioOption: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  statusRadioOptionPaid: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successLight,
  },
  statusRadioOptionDue: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  statusRadioOptionPressed: { opacity: 0.7 },
  statusRadioTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.secondary,
  },
  statusRadioTitlePaid: { color: COLORS.successDark },
  statusRadioTitleDue: { color: COLORS.danger },

  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.textSoft,
  },
  amountCard: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  amountLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  amountLabel: { marginLeft: 10, fontSize: 13, color: COLORS.secondary },
  amountValue: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: COLORS.text,
  },

  modifierButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  modifierIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 9,
  },
  modifierIconAdd: { backgroundColor: COLORS.primaryLight },
  modifierIconRemove: { backgroundColor: COLORS.dangerLight },
  modifierText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  modifierTextRemove: { color: COLORS.danger },
  inputGroup: { marginTop: 2 },
  modalInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    fontSize: 14,
    color: COLORS.text,
  },

  netAmountCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: COLORS.text,
  },
  netAmountLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#CBD5E1",
  },
  netAmountHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: "#94A3B8",
  },
  netAmountValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: COLORS.white,
  },

  dateSelector: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  dateIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
  },
  dateText: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
  paymentBottomSpace: { height: 18 },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  cancelButton: {
    flex: 1,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonPressed: { opacity: 0.7 },
  cancelButtonText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: COLORS.textSoft,
  },
  saveButton: {
    flex: 1.5,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 14,
    backgroundColor: COLORS.success,
  },
  saveDueButton: { backgroundColor: COLORS.danger },
  saveButtonPressed: { opacity: 0.85 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: COLORS.white,
  },

  // ----- Template missing modal -----
  templateBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  templateCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: "center",
  },
  templateIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  templateTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  templateMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
  },
  templateActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 22,
  },
  templateCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  templateCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  templatePrimaryButton: {
    flex: 1.3,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#D97706",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  templatePrimaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  templateButtonPressed: {
    opacity: 0.8,
  },
});

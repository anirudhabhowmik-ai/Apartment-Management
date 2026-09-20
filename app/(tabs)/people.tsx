// app/(tabs)/people.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
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
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DatePickerModal from "../../components/DatePickerModal";
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

  background: "#F8FAFC",
  white: "#FFFFFF",

  text: "#0F172A",
  textSoft: "#334155",
  secondary: "#64748B",
  muted: "#94A3B8",

  border: "#E2E8F0",
  borderLight: "#F1F5F9",

  success: "#16A34A",
  successLight: "#F0FDF4",
  successBorder: "#BBF7D0",

  danger: "#DC2626",
  dangerLight: "#FEF2F2",
  dangerBorder: "#FECACA",

  purple: "#7C3AED",
  purpleLight: "#F5F3FF",
  purpleBorder: "#DDD6FE",
};

type PaymentFilter = "all" | "paid" | "due";

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
    return accountType === "home" ? "Tenant" : "Member";
  }
  if (type === "staff") return "Staff";
  if (type === "expense") return "Transactions";
  return "Group";
};

const getCountLabel = (
  type: ManagementType,
  count: number,
  accountType?: "apartment" | "home",
): string => {
  const singular =
    type === "apartment"
      ? accountType === "home"
        ? "Tenant"
        : "Owner"
      : type === "staff"
        ? "Staff"
        : "Expense";
  const plural = type === "staff" ? "Staff" : `${singular}s`;
  return `${count} ${count === 1 ? singular : plural}`;
};

const getAddButtonLabel = (
  type: ManagementType,
  accountType?: "apartment" | "home",
): string => {
  if (type === "apartment") {
    return accountType === "home" ? "Add Tenant" : "Add Member";
  }
  if (type === "staff") return "Add Staff";
  if (type === "expense") return "Add Transaction";
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

// ---------------------------------------------------------------------------
// Grouping helper — one card per user_id within a tab.
// ---------------------------------------------------------------------------

interface GroupedCard {
  user_id: string;
  name: string;
  phone: string | null;
  photo_url: string | null;
  records: any[];
}

function groupRowsByUser(rows: any[]): GroupedCard[] {
  const map = new Map<string, GroupedCard>();
  for (const row of rows) {
    const uid = row.user_id || `__orphan__:${row.id}`;
    if (!map.has(uid)) {
      map.set(uid, {
        user_id: uid,
        name: row.name || "",
        phone: row.phone || null,
        photo_url: row.photo_url || null,
        records: [],
      });
    }
    map.get(uid)!.records.push(row);
  }
  return Array.from(map.values());
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

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const containerRef = useRef<View | null>(null);
  const searchRowRef = useRef<View | null>(null);

  const [filterAnchor, setFilterAnchor] = useState<{
    top: number;
    right: number;
  }>({ top: 0, right: 16 });

  const measureSearchRow = () => {
    const row = searchRowRef.current;
    const container = containerRef.current;
    if (!row || !container) return;
    row.measureLayout(
      container as any,
      (x, y, width, height) => {
        const screenWidth = Dimensions.get("window").width;
        const rightOffset = Math.max(screenWidth - (x + width), 12);
        setFilterAnchor({
          top: y + height + 4,
          right: rightOffset,
        });
      },
      () => {},
    );
  };

  const activeSearch = searchQuery[activeTab];
  const activeFilter = paymentFilter[activeTab];

  const setActiveSearch = (value: string) =>
    setSearchQuery((current) => ({ ...current, [activeTab]: value }));

  const setActiveFilter = (value: PaymentFilter) =>
    setPaymentFilter((current) => ({ ...current, [activeTab]: value }));

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

    const month = selectedMonth || new Date().toISOString().slice(0, 7);
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
    setShowFilterDropdown(false);
  }, [activeTab]);

  useEffect(() => {
    if (showFilterDropdown) {
      const id = requestAnimationFrame(() => measureSearchRow());
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFilterDropdown]);

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

  const activeMembersSource = membersHook.items.filter(isActiveRow);
  const activeStaffSource = staffHook.items.filter(isActiveRow);

  const membersInActiveGroup =
    activeTab === "apartment"
      ? activeMembersSource
      : activeTab === "staff"
        ? activeStaffSource
        : expensesHook.items;

  const activeMembers = selectedMonth
    ? membersInActiveGroup.filter((member: any) => {
        const date =
          activeTab === "expense" && "dueDate" in member
            ? member.dueDate
            : member.createdAt;
        return activeTab === "expense"
          ? date?.slice(0, 7) === selectedMonth
          : (date?.slice(0, 7) ?? "") <= selectedMonth;
      })
    : membersInActiveGroup;

  const isApartmentTab = activeTab === "apartment";
  const isStaffTab = activeTab === "staff";
  const isExpenseTab = activeTab === "expense";

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

  const visibleGroupedCards = useMemo(() => {
    const month = selectedMonth || new Date().toISOString().slice(0, 7);
    return groupedCards.filter((card) => {
      if (!memberMatchesQuery(card, activeSearch)) return false;
      if (activeFilter === "all") return true;

      let status: "paid" | "due" | null = null;
      for (const record of card.records) {
        if (isExpenseTab) {
          const s = record.status === "paid" ? "paid" : "due";
          if (s === activeFilter) {
            status = s;
            break;
          }
        } else {
          const monthlyPayment = getPaymentForMonth(record, month);
          const s = monthlyPayment.status === "paid" ? "paid" : "due";
          if (s === activeFilter) {
            status = s;
            break;
          }
        }
      }
      return status === activeFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    groupedCards,
    activeSearch,
    activeFilter,
    activeTab,
    isExpenseTab,
    selectedMonth,
    attendanceVersion,
  ]);

  const month = selectedMonth || new Date().toISOString().slice(0, 7);

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
        Alert.alert(
          "Bill Template Not Set Up",
          `You haven't set up the ${
            isApartmentTab ? "owner bill" : "staff slip"
          } template yet. Set it up now to generate this bill.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Generate Bill",
              onPress: () => {
                router.push({
                  pathname: "/(modals)/generate-bill",
                  params: { memberType },
                });
              },
            },
          ],
        );
        setGeneratingBill(null);
        return;
      }

      const selectedTemplate =
        billTemplates.find((t) => t.id === billConfig.templateId) ??
        billTemplates[0];

      if (!selectedTemplate) {
        Alert.alert(
          "Template Error",
          "Could not find the saved template. Please re-save it in Profile → Generate Bill.",
        );
        setGeneratingBill(null);
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

  const filterLabel =
    activeFilter === "all" ? "All" : activeFilter === "paid" ? "Paid" : "Due";

  const filterIcon: keyof typeof Ionicons.glyphMap =
    activeFilter === "all"
      ? "filter-outline"
      : activeFilter === "paid"
        ? "checkmark-circle-outline"
        : "time-outline";

  const filterColor =
    activeFilter === "all"
      ? COLORS.secondary
      : activeFilter === "paid"
        ? COLORS.success
        : COLORS.danger;

  const isFilterActive = activeFilter !== "all";

  const listBottomPadding =
    Math.max(insets.bottom, 24) + (Platform.OS === "ios" ? 320 : 160);

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingBottom: Platform.OS === "ios" ? insets.bottom : 0 },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View ref={containerRef} style={styles.innerContainer}>
        <View style={styles.header}>
          <View style={styles.headerTitleArea}>
            <Text style={styles.title}>
              {isAdmin ? "Management" : isMember ? "Residents" : "Directory"}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {selectedAccount?.name || "Your property"}
            </Text>
          </View>

          <View style={styles.monthNavigation}>
            <Pressable
              style={({ pressed }) => [
                styles.monthArrow,
                pressed && styles.pressedButton,
              ]}
              onPress={handlePrevMonth}
            >
              <Ionicons name="chevron-back" size={17} color={COLORS.primary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.monthSelector,
                pressed && styles.pressedButton,
              ]}
              onPress={() => setShowMonthPicker(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={15}
                color={COLORS.primary}
              />
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
            >
              <Ionicons
                name="chevron-forward"
                size={17}
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
                    pressed && styles.tabPressed,
                  ]}
                  onPress={() => setActiveTab(type)}
                >
                  <Ionicons
                    name={getTabIcon(type)}
                    size={16}
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

        {visibleGroupedCards.length > 0 && (
          <View
            ref={searchRowRef}
            onLayout={measureSearchRow}
            style={styles.searchFilterRow}
          >
            <View style={styles.searchBox}>
              <Ionicons
                name="search-outline"
                size={18}
                color={COLORS.muted}
                style={styles.searchIcon}
              />
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
                  style={styles.searchClearButton}
                  hitSlop={6}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={COLORS.muted}
                  />
                </Pressable>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.filterTrigger,
                isFilterActive && styles.filterTriggerActive,
                pressed && styles.pressedButton,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                measureSearchRow();
                setShowFilterDropdown((open) => !open);
              }}
            >
              <Ionicons name={filterIcon} size={16} color={filterColor} />
              <Text
                style={[
                  styles.filterTriggerText,
                  isFilterActive && { color: filterColor, fontWeight: "700" },
                ]}
              >
                {filterLabel}
              </Text>
              <Ionicons
                name={showFilterDropdown ? "chevron-up" : "chevron-down"}
                size={14}
                color={filterColor}
              />
            </Pressable>
          </View>
        )}

        {visibleGroupedCards.length > 0 && showFilterDropdown && (
          <>
            <Pressable
              style={styles.filterBackdrop}
              onPress={() => setShowFilterDropdown(false)}
            />
            <View
              style={[
                styles.filterDropdown,
                { top: filterAnchor.top, right: filterAnchor.right },
              ]}
            >
              <Text style={styles.filterDropdownTitle}>Payment Status</Text>
              {(
                [
                  { key: "all", label: "All", icon: "apps-outline" },
                  {
                    key: "paid",
                    label: "Paid",
                    icon: "checkmark-circle-outline",
                  },
                  { key: "due", label: "Due", icon: "time-outline" },
                ] as {
                  key: PaymentFilter;
                  label: string;
                  icon: keyof typeof Ionicons.glyphMap;
                }[]
              ).map((option) => {
                const isSelected = activeFilter === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={({ pressed }) => [
                      styles.filterOption,
                      isSelected && styles.filterOptionSelected,
                      pressed && styles.filterOptionPressed,
                    ]}
                    onPress={() => {
                      setActiveFilter(option.key);
                      setShowFilterDropdown(false);
                    }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={16}
                      color={isSelected ? COLORS.primary : COLORS.secondary}
                    />
                    <Text
                      style={[
                        styles.filterOptionText,
                        isSelected && styles.filterOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={COLORS.primary}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <ScrollView
          style={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: listBottomPadding },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <Pressable onPress={() => Keyboard.dismiss()}>
            <View style={styles.listHeader}>
              <View style={styles.countArea}>
                <Text style={styles.countTitle}>
                  {getCountLabel(
                    activeTab,
                    visibleGroupedCards.length,
                    selectedAccount?.type,
                  )}
                </Text>
                <Text style={styles.countSubtitle}>
                  {isExpenseTab
                    ? "Property expenses"
                    : isStaffTab
                      ? "Staff and salary"
                      : selectedAccount?.type === "home"
                        ? "Your tenants"
                        : "Apartment members"}
                </Text>
              </View>

              {canEdit && (
                <Pressable
                  style={({ pressed }) => [
                    styles.addButton,
                    pressed && styles.addButtonPressed,
                  ]}
                  onPress={() => handleAdd(activeTab)}
                >
                  <Ionicons name="add" size={18} color={COLORS.white} />
                  <Text style={styles.addButtonText}>
                    {getAddButtonLabel(activeTab, selectedAccount?.type)}
                  </Text>
                </Pressable>
              )}
            </View>

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
                    size={31}
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
                          isStaffTab ? "staff" : "members"
                        }`
                      : `No ${getTabLabel(
                          activeTab,
                          selectedAccount?.type,
                        ).toLowerCase()} yet`}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeSearch
                    ? `No ${getTabLabel(
                        activeTab,
                        selectedAccount?.type,
                      ).toLowerCase()} match "${activeSearch}". Try a different name or number.`
                    : isFilterActive
                      ? `No ${getTabLabel(
                          activeTab,
                          selectedAccount?.type,
                        ).toLowerCase()} with "${filterLabel}" status for this month.`
                      : isExpenseTab
                        ? "Add your first expense to start tracking property spending."
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
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={styles.clearFiltersText}>
                      Clear search & filter
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View>
                {visibleGroupedCards.map((card) => {
                  const isSelf = !isExpenseTab && myUserId === card.user_id;
                  const primaryRecord = card.records[0];

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
                      <View style={styles.memberTop}>
                        <View
                          style={[
                            styles.memberAvatar,
                            isStaffTab && styles.memberAvatarStaff,
                            isExpenseTab && styles.memberAvatarExpense,
                          ]}
                        >
                          {isExpenseTab ? (
                            <Ionicons
                              name="wallet-outline"
                              size={19}
                              color={COLORS.white}
                            />
                          ) : card.photo_url ? (
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

                            {!isExpenseTab && (
                              <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>
                                  {card.records.length}{" "}
                                  {card.records.length === 1
                                    ? isStaffTab
                                      ? "role"
                                      : "flat"
                                    : isStaffTab
                                      ? "roles"
                                      : "flats"}
                                </Text>
                              </View>
                            )}
                          </View>

                          {!isExpenseTab && card.phone ? (
                            <View style={styles.phoneRow}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.phonePill,
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
                                  size={12}
                                  color={COLORS.primary}
                                />
                                <Text style={styles.phonePillText}>
                                  {formatPhoneForDisplay(card.phone)}
                                </Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>

                        {canEdit && (
                          <Ionicons
                            name="chevron-forward"
                            size={17}
                            color={COLORS.muted}
                          />
                        )}
                      </View>

                      {!isExpenseTab ? (
                        <View style={styles.recordsList}>
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

                            const recordTitle = isApartmentTab
                              ? `${record.wing ? `${record.wing} · ` : ""}${
                                  record.flatNumber
                                    ? `Flat ${record.flatNumber}`
                                    : "Apartment"
                                } · ${(record.role || "member").charAt(0).toUpperCase() + (record.role || "member").slice(1)}`
                              : `${(record.role || "staff").charAt(0).toUpperCase() + (record.role || "staff").slice(1)}`;

                            const recordSubtitle = isApartmentTab
                              ? `₹${record.maintenanceAmount || 0} /month`
                              : `₹${record.monthlySalary || 0} /month`;

                            return (
                              <Pressable
                                key={record.id}
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
                                  <Text
                                    style={styles.recordTitle}
                                    numberOfLines={1}
                                  >
                                    {recordTitle}
                                  </Text>
                                  <Text style={styles.recordSubtitle}>
                                    {recordSubtitle}
                                  </Text>
                                </View>

                                {showFinancialInfo ? (
                                  <View
                                    style={[
                                      styles.paymentBadge,
                                      isPaidThisMonth
                                        ? styles.paymentBadgePaid
                                        : styles.paymentBadgeDue,
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.paymentDot,
                                        isPaidThisMonth
                                          ? styles.paymentDotPaid
                                          : styles.paymentDotDue,
                                      ]}
                                    />
                                    <Text
                                      style={[
                                        styles.paymentBadgeText,
                                        isPaidThisMonth
                                          ? styles.paymentTextPaid
                                          : styles.paymentTextDue,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {isPaidThisMonth
                                        ? paidDateForMonth
                                          ? `Paid ₹${statusPaymentAmount} · ${formatBadgeDate(
                                              paidDateForMonth,
                                            )}`
                                          : `Paid ₹${statusPaymentAmount}`
                                        : `Due ₹${statusPaymentAmount}`}
                                    </Text>
                                  </View>
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Pressable>
        </ScrollView>
      </View>

      <MonthYearPickerModal
        visible={showMonthPicker}
        value={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onSelect={setSelectedMonth}
      />

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
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.paymentHeaderInfo}>
                  <Text style={styles.paymentTitle}>Payment Details</Text>
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
                    <Text style={styles.paymentMonthLabel}>PAYMENT FOR</Text>
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
                      {selectedStatus === "paid" ? "PAID" : "DUE"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>Payment Status</Text>

                <View style={styles.statusRadioRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.statusRadioOption,
                      selectedStatus === "paid" &&
                        styles.statusRadioOptionSelected,
                      selectedStatus === "paid" && styles.statusRadioOptionPaid,
                      pressed && styles.statusRadioOptionPressed,
                    ]}
                    onPress={() => setSelectedStatus("paid")}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        selectedStatus === "paid" && styles.radioOuterSelected,
                      ]}
                    >
                      {selectedStatus === "paid" && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                    <View style={styles.statusRadioContent}>
                      <View
                        style={[
                          styles.statusRadioIcon,
                          styles.statusRadioIconPaid,
                        ]}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={COLORS.success}
                        />
                      </View>
                      <Text
                        style={[
                          styles.statusRadioTitle,
                          selectedStatus === "paid" &&
                            styles.statusRadioTitlePaid,
                        ]}
                      >
                        Paid
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.statusRadioOption,
                      selectedStatus === "due" &&
                        styles.statusRadioOptionSelected,
                      selectedStatus === "due" && styles.statusRadioOptionDue,
                      pressed && styles.statusRadioOptionPressed,
                    ]}
                    onPress={() => setSelectedStatus("due")}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        selectedStatus === "due" && styles.radioOuterSelected,
                      ]}
                    >
                      {selectedStatus === "due" && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                    <View style={styles.statusRadioContent}>
                      <View
                        style={[
                          styles.statusRadioIcon,
                          styles.statusRadioIconDue,
                        ]}
                      >
                        <Ionicons name="time" size={18} color={COLORS.danger} />
                      </View>
                      <Text
                        style={[
                          styles.statusRadioTitle,
                          selectedStatus === "due" &&
                            styles.statusRadioTitleDue,
                        ]}
                      >
                        Due
                      </Text>
                    </View>
                  </Pressable>
                </View>

                <Text style={styles.sectionLabel}>
                  {isApartmentTab ? "Maintenance Amount" : "Monthly Salary"}
                </Text>

                <View style={styles.amountCard}>
                  <View style={styles.amountLeft}>
                    <Ionicons
                      name="cash-outline"
                      size={19}
                      color={COLORS.primary}
                    />
                    <Text style={styles.amountLabel}>
                      {isApartmentTab ? "Base amount" : "Monthly salary"}
                    </Text>
                  </View>
                  <Text style={styles.amountValue}>₹{baseSalary || 0}</Text>
                </View>

                {isStaffTab && attendanceAdjustedSalary != null ? (
                  <>
                    <Text style={styles.sectionLabel}>Attendance Adjusted</Text>
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
                          size={19}
                          color={COLORS.primary}
                        />
                        <Text
                          style={[
                            styles.amountLabel,
                            { color: COLORS.primaryDark, fontWeight: "700" },
                          ]}
                        >
                          Payable for this month
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.amountValue,
                          { color: COLORS.primaryDark },
                        ]}
                      >
                        ₹{attendanceAdjustedSalary}
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
                      size={16}
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
                      size={16}
                      color={showDeduction ? COLORS.danger : COLORS.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.modifierText,
                      showDeduction && styles.modifierTextRemove,
                    ]}
                  >
                    {showDeduction ? "Remove deduction" : "Less deduction"}
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
                      {selectedStatus === "paid" ? "NET PAID" : "AMOUNT TO PAY"}
                    </Text>
                    <Text style={styles.netAmountHint}>
                      Base + additions − deductions
                    </Text>
                  </View>
                  <Text style={styles.netAmountValue}>₹{netPaidAmount}</Text>
                </View>

                {selectedStatus === "paid" && (
                  <>
                    <Text style={styles.sectionLabel}>Paid Date</Text>
                    <Pressable
                      style={styles.dateSelector}
                      onPress={() => setShowPaidDatePicker(true)}
                    >
                      <View style={styles.dateIcon}>
                        <Ionicons
                          name="calendar-outline"
                          size={17}
                          color={COLORS.primary}
                        />
                      </View>
                      <Text style={styles.dateText}>
                        {formatFullDate(paidDate)}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
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
                    size={18}
                    color={COLORS.white}
                  />
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? "Saving..."
                      : selectedStatus === "paid"
                        ? "Save as Paid"
                        : "Save as Due"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      <DatePickerModal
        visible={showPaidDatePicker}
        value={paidDate}
        onClose={() => setShowPaidDatePicker(false)}
        onSelect={setPaidDate}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  innerContainer: { flex: 1 },
  scrollArea: { flex: 1 },
  pressedButton: { opacity: 0.7 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitleArea: { flex: 1, minWidth: 0, marginRight: 10 },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.secondary,
  },
  monthNavigation: { flexDirection: "row", alignItems: "center" },
  monthArrow: {
    width: 32,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
  },
  monthSelector: {
    height: 38,
    minWidth: 105,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
  },
  monthText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },

  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 3,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  tabActive: { backgroundColor: COLORS.primaryLight },
  tabPressed: { opacity: 0.7 },
  tabText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  tabTextActive: { color: COLORS.primary, fontWeight: "700" },

  searchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
    zIndex: 5,
  },
  searchBox: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
  searchClearButton: { paddingLeft: 6 },
  filterTrigger: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 6,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 90,
  },
  filterTriggerActive: {
    borderColor: COLORS.primarySoft,
    backgroundColor: COLORS.primaryLight,
  },
  filterTriggerText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  filterBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  filterDropdown: {
    position: "absolute",
    width: 180,
    paddingVertical: 6,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 20,
    elevation: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  filterDropdownTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: COLORS.muted,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 9,
  },
  filterOptionSelected: { backgroundColor: COLORS.primaryLight },
  filterOptionPressed: { opacity: 0.7 },
  filterOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  filterOptionTextSelected: { color: COLORS.primary, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingTop: 17 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  countArea: { flex: 1, minWidth: 0, marginRight: 10 },
  countTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: COLORS.text,
  },
  countSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.secondary,
  },
  addButton: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  addButtonPressed: { opacity: 0.8 },
  addButtonText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.white,
  },

  emptyCard: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
  },
  emptyIconStaff: { backgroundColor: COLORS.purpleLight },
  emptyIconExpense: { backgroundColor: COLORS.successLight },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  emptySubtitle: {
    maxWidth: 300,
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.secondary,
    textAlign: "center",
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  clearFiltersText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  memberCard: {
    padding: 13,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  memberCardPressed: { opacity: 0.76 },
  memberTop: { flexDirection: "row", alignItems: "center" },
  memberAvatar: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: COLORS.primary,
  },
  memberAvatarStaff: { backgroundColor: COLORS.purple },
  memberAvatarExpense: { backgroundColor: COLORS.success },
  memberPhoto: { width: "100%", height: "100%" },
  memberInitial: { fontSize: 16, fontWeight: "700", color: COLORS.white },
  memberInfo: { flex: 1, minWidth: 0 },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    minWidth: 0,
  },
  memberName: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: COLORS.text,
  },
  youBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    flexShrink: 0,
  },
  youBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    color: "#15803D",
    letterSpacing: 0.3,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    flexShrink: 0,
  },
  countBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  phoneRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  phonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    alignSelf: "flex-start",
  },
  phonePillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
  },

  recordsList: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: 6,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  recordRowPressed: { opacity: 0.75 },
  recordInfo: { flex: 1, minWidth: 0, marginRight: 8 },
  recordTitle: { fontSize: 12.5, fontWeight: "700", color: COLORS.text },
  recordSubtitle: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },

  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: "55%",
  },
  paymentBadgePaid: { backgroundColor: COLORS.successLight },
  paymentBadgeDue: { backgroundColor: COLORS.dangerLight },
  paymentDot: {
    width: 5,
    height: 5,
    marginRight: 5,
    borderRadius: 3,
  },
  paymentDotPaid: { backgroundColor: COLORS.success },
  paymentDotDue: { backgroundColor: COLORS.danger },
  paymentBadgeText: { fontSize: 10, fontWeight: "700", flexShrink: 1 },
  paymentTextPaid: { color: COLORS.success },
  paymentTextDue: { color: COLORS.danger },

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
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  noPropertySubtitle: {
    maxWidth: 310,
    marginTop: 8,
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.secondary,
    textAlign: "center",
  },
  createButton: {
    height: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginTop: 21,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  createButtonText: {
    marginLeft: 7,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.white,
  },

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
    maxWidth: 410,
    maxHeight: "91%",
    overflow: "hidden",
    borderRadius: 21,
    backgroundColor: COLORS.white,
  },
  paymentModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  paymentHeaderIcon: {
    width: 41,
    height: 41,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
  },
  paymentHeaderInfo: { flex: 1, minWidth: 0 },
  paymentTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: COLORS.text,
  },
  paymentMemberName: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.secondary,
  },
  closeModalButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  paymentScroll: { flexGrow: 0 },
  paymentScrollContent: { paddingHorizontal: 17, paddingTop: 14 },
  paymentMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
  },
  paymentMonthLabel: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: COLORS.muted,
  },
  paymentMonthText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusSmallBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },
  statusSmallBadgePaid: { backgroundColor: COLORS.successLight },
  statusSmallBadgeDue: { backgroundColor: COLORS.dangerLight },
  statusSmallText: { fontSize: 9, fontWeight: "700" },
  statusSmallTextPaid: { color: COLORS.success },
  statusSmallTextDue: { color: COLORS.danger },

  statusRadioRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  statusRadioOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  statusRadioOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  statusRadioOptionPaid: { borderColor: COLORS.successBorder },
  statusRadioOptionDue: { borderColor: COLORS.dangerBorder },
  statusRadioOptionPressed: { opacity: 0.7 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    flexShrink: 0,
  },
  radioOuterSelected: { borderColor: COLORS.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  statusRadioContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusRadioIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRadioIconPaid: { backgroundColor: COLORS.successLight },
  statusRadioIconDue: { backgroundColor: COLORS.dangerLight },
  statusRadioTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  statusRadioTitlePaid: { color: COLORS.success },
  statusRadioTitleDue: { color: COLORS.danger },

  sectionLabel: {
    marginTop: 16,
    marginBottom: 7,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: COLORS.textSoft,
  },
  amountCard: {
    minHeight: 59,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  amountLeft: { flexDirection: "row", alignItems: "center" },
  amountLabel: { marginLeft: 8, fontSize: 11, color: COLORS.secondary },
  amountValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: COLORS.text,
  },

  modifierButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
  },
  modifierIcon: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderRadius: 8,
  },
  modifierIconAdd: { backgroundColor: COLORS.primaryLight },
  modifierIconRemove: { backgroundColor: COLORS.dangerLight },
  modifierText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
  modifierTextRemove: { color: COLORS.danger },
  inputGroup: { marginTop: 1 },
  modalInput: {
    minHeight: 45,
    paddingHorizontal: 11,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    fontSize: 13,
    color: COLORS.text,
  },

  netAmountCard: {
    minHeight: 69,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 10,
    borderRadius: 13,
    backgroundColor: COLORS.text,
  },
  netAmountLabel: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#CBD5E1",
  },
  netAmountHint: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 14,
    color: "#94A3B8",
  },
  netAmountValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: COLORS.white,
  },

  dateSelector: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  dateIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    borderRadius: 9,
    backgroundColor: COLORS.primaryLight,
  },
  dateText: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.text },
  paymentBottomSpace: { height: 17 },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  cancelButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    marginRight: 7,
    borderRadius: 10,
  },
  cancelButtonPressed: { backgroundColor: COLORS.background },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  saveButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.success,
  },
  saveDueButton: { backgroundColor: COLORS.danger },
  saveButtonPressed: { opacity: 0.8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.white,
  },
});

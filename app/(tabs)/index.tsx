import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useGroups } from "../../hooks/useGroups";
import { useUserRole } from "../../hooks/useUserRole";
import { useMemberStore } from "../../store/memberStore";
import { useAuthStore } from "../../store/useAuthStore";
import {
  getPeopleSummary,
  getPeopleTransactions,
} from "../../utils/peopleTransactions";

/* ========================================================================== */
/* TYPES                                                                      */
/* ========================================================================== */

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
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
}

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

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

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* MOCK ATTENDANCE DATA                                                       */
/* Replace this with a real hook later — e.g. useAttendance(memberId, month)  */
/* -------------------------------------------------------------------------- */

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

    // Sundays are holidays
    if (date.getDay() === 0) {
      result[key] = { date: key, status: "holiday" };
      continue;
    }

    // Future dates → none
    if (isCurrentMonth && day > today.getDate()) {
      result[key] = { date: key, status: "none" };
      continue;
    }

    // Mock pattern: mostly present, occasional absent / half-day
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

/* ========================================================================== */
/* STAT CARD                                                                  */
/* ========================================================================== */

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

/* ========================================================================== */
/* QUICK ACTION CARD                                                          */
/* ========================================================================== */

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

/* ========================================================================== */
/* STAFF CARD                                                                 */
/* ========================================================================== */

function StaffCard({
  name,
  role,
  onPress,
}: {
  name: string;
  role: string;
  onPress: () => void;
}) {
  const roleColor = getRoleColor(role);
  const roleLabel = getRoleLabel(role);
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || "?";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.staffCard, pressed && styles.pressed]}
    >
      <View style={[styles.staffAvatar, { backgroundColor: `${roleColor}12` }]}>
        <Text style={[styles.staffInitial, { color: roleColor }]}>
          {initial}
        </Text>
      </View>
      <View style={styles.staffInfo}>
        <Text style={styles.staffName} numberOfLines={1}>
          {name || "Unnamed Staff"}
        </Text>
        <View style={styles.staffRoleRow}>
          <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
          <Text style={styles.staffRole}>{roleLabel}</Text>
        </View>
      </View>
      <View style={styles.staffArrow}>
        <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

/* ========================================================================== */
/* FINANCIAL CARD                                                             */
/* ========================================================================== */

function FinancialCard({
  title,
  amount,
  icon,
  color,
  background,
}: {
  title: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
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
      <Text style={styles.financialPeriod}>This month</Text>
    </View>
  );
}

/* ========================================================================== */
/* MEMBER PERSONAL CARD                                                       */
/* ========================================================================== */

function MemberPersonalCard({
  member,
  onEdit,
}: {
  member: any;
  onEdit: () => void;
}) {
  const memberName = member?.name || "Resident";
  const unit = member?.apartmentNumber || member?.unitNumber || "N/A";
  const maintenanceAmount = member?.maintenanceAmount || 0;

  return (
    <View style={styles.personalCard}>
      <View style={styles.personalHeader}>
        <View style={styles.personalAvatar}>
          <Text style={styles.personalInitial}>
            {memberName.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>
        <View style={styles.personalInfo}>
          <Text style={styles.personalName}>{memberName}</Text>
          <View style={styles.personalRoleRow}>
            <Ionicons name="home-outline" size={14} color="#64748B" />
            <Text style={styles.personalRole}>Apartment Owner</Text>
          </View>
        </View>
      </View>
      <View style={styles.personalDetails}>
        <View style={styles.personalDetailItem}>
          <Ionicons name="location-outline" size={16} color="#64748B" />
          <Text style={styles.personalDetailLabel}>Unit</Text>
          <Text style={styles.personalDetailValue}>{unit}</Text>
        </View>
        <View style={styles.personalDetailItem}>
          <Ionicons name="cash-outline" size={16} color="#64748B" />
          <Text style={styles.personalDetailLabel}>Maintenance</Text>
          <Text style={styles.personalDetailValue}>
            {formatCurrency(maintenanceAmount)}
          </Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.personalEditButton,
          pressed && styles.pressed,
        ]}
        onPress={onEdit}
      >
        <Ionicons name="create-outline" size={16} color="#2563EB" />
        <Text style={styles.personalEditText}>View My Details</Text>
      </Pressable>
    </View>
  );
}

/* ========================================================================== */
/* STAFF PERSONAL CARD                                                        */
/* ========================================================================== */

function StaffPersonalCard({
  staff,
  onEdit,
}: {
  staff: any;
  onEdit: () => void;
}) {
  const roleColor = getRoleColor(staff?.role);
  const roleLabel = getRoleLabel(staff?.role);

  return (
    <View style={styles.personalCard}>
      <View style={styles.personalHeader}>
        <View
          style={[styles.personalAvatar, { backgroundColor: `${roleColor}12` }]}
        >
          <Text style={[styles.personalInitial, { color: roleColor }]}>
            {staff?.name?.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>
        <View style={styles.personalInfo}>
          <Text style={styles.personalName}>{staff?.name || "Staff"}</Text>
          <View style={styles.personalRoleRow}>
            <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
            <Text style={styles.personalRole}>{roleLabel}</Text>
          </View>
        </View>
      </View>
      <View style={styles.personalDetails}>
        <View style={styles.personalDetailItem}>
          <Ionicons name="calendar-outline" size={16} color="#64748B" />
          <Text style={styles.personalDetailLabel}>Joined</Text>
          <Text style={styles.personalDetailValue}>
            {staff?.joinedDate || "N/A"}
          </Text>
        </View>
        <View style={styles.personalDetailItem}>
          <Ionicons name="cash-outline" size={16} color="#64748B" />
          <Text style={styles.personalDetailLabel}>Salary</Text>
          <Text style={styles.personalDetailValue}>
            {staff?.monthlySalary ? formatCurrency(staff.monthlySalary) : "N/A"}
          </Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.personalEditButton,
          pressed && styles.pressed,
        ]}
        onPress={onEdit}
      >
        <Ionicons name="create-outline" size={16} color="#2563EB" />
        <Text style={styles.personalEditText}>View My Details</Text>
      </Pressable>
    </View>
  );
}

/* ========================================================================== */
/* MONTH / YEAR PICKER MODAL                                                  */
/* ========================================================================== */

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

  // Sync draft when modal opens
  useEffect(() => {
    if (visible) {
      setDraftYear(year);
      setDraftMonth(month);
    }
  }, [visible, year, month]);

  // Auto-growing year range:
  //  - Always covers TODAY ± 10/+15 years (so it grows as real time moves)
  //  - Also always includes the currently selected year (±2/+5)
  //  - No hard cap, no manual updates needed
  const currentYear = new Date().getFullYear();
  const START_YEAR = Math.min(currentYear - 10, year - 2);
  const END_YEAR = Math.max(currentYear + 15, year + 5);

  const years: number[] = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) years.push(y);

  // Auto-scroll the year row to the selected year when opened
  useEffect(() => {
    if (!visible) return;
    const index = years.indexOf(draftYear);
    if (index < 0) return;

    const chipWidth = 72; // chip width + gap
    const offset = Math.max(0, index * chipWidth - 100);

    requestAnimationFrame(() => {
      yearScrollRef.current?.scrollTo({ x: offset, animated: false });
    });
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

/* ========================================================================== */
/* ATTENDANCE SLIDER + CALENDAR                                               */
/* ========================================================================== */

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

    // Leading blanks so the 1st lines up under the correct weekday
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
      {/* ---- SLIDER / MONTH NAVIGATION ---- */}
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

      {/* ---- QUICK LEGEND / SUMMARY ---- */}
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

      {/* ---- WEEKDAY HEADER ---- */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <View key={i} style={styles.weekCell}>
            <Text style={styles.weekText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* ---- CALENDAR GRID ---- */}
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

/* ========================================================================== */
/* HOME SCREEN                                                                */
/* ========================================================================== */

export default function HomeScreen() {
  const router = useRouter();

  const {
    accounts,
    selectedAccount,
    isLoading: accountsLoading,
  } = useAccounts();

  const { groups } = useGroups(selectedAccount?.id || null);
  const members = useMemberStore((state) => state.members);
  const { user } = useAuthStore();
  const { isAdmin, isMember, isStaff } = useUserRole();

  const [refreshing, setRefreshing] = useState(false);

  // Attendance state — shared by staff & member views
  const now = new Date();
  const [attYear, setAttYear] = useState(now.getFullYear());
  const [attMonth, setAttMonth] = useState(now.getMonth());

  const handleChangeAttendanceMonth = (y: number, m: number) => {
    setAttYear(y);
    setAttMonth(m);
  };

  /* ------------------------------------------------------------------------ */
  /* MATCH USER TO MEMBER / STAFF PROFILE                                     */
  /* ------------------------------------------------------------------------ */

  const matchedProfile = useMemo(() => {
    if (!user || !selectedAccount) return null;

    const accountGroupIds = new Set(groups.map((group) => group.id));
    const accountMembers = members.filter((member) =>
      accountGroupIds.has(member.groupId),
    );

    return (
      accountMembers.find(
        (member) =>
          member.phone === user.phone ||
          member.name === user.name ||
          (member as any).userId === user.id,
      ) || null
    );
  }, [user, selectedAccount, groups, members]);

  /* ------------------------------------------------------------------------ */
  /* DASHBOARD DATA - Only for admin                                          */
  /* ------------------------------------------------------------------------ */

  const dashboardData = useMemo(() => {
    const emptyData = {
      stats: {
        totalProperties: 0,
        totalStaff: 0,
        monthlyIncome: 0,
        monthlyExpense: 0,
      },
      recentStaff: [] as any[],
    };

    if (!isAdmin || !selectedAccount) return emptyData;

    try {
      const accountGroupIds = new Set(groups.map((group) => group.id));
      const accountMembers = members.filter((member) =>
        accountGroupIds.has(member.groupId),
      );

      const apartmentMembers = accountMembers.filter(
        (member) => "maintenanceAmount" in member,
      );

      const staffMembers = accountMembers.filter(
        (member) => "monthlySalary" in member,
      );

      const currentMonth = `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, "0")}`;

      const transactions = getPeopleTransactions(accountMembers, currentMonth);
      const financialSummary = getPeopleSummary(transactions);
      const recentStaff = [...staffMembers].reverse().slice(0, 5);

      return {
        stats: {
          totalProperties: apartmentMembers.length,
          totalStaff: staffMembers.length,
          monthlyIncome: Number(financialSummary.income) || 0,
          monthlyExpense: Number(financialSummary.expenses) || 0,
        },
        recentStaff,
      };
    } catch (error) {
      console.error("Error calculating dashboard data:", error);
      return emptyData;
    }
  }, [selectedAccount, groups, members, isAdmin]);

  const stats = dashboardData.stats;
  const recentStaff = dashboardData.recentStaff;

  const netBalance = stats.monthlyIncome - stats.monthlyExpense;
  const isPositiveBalance = netBalance >= 0;

  /* ------------------------------------------------------------------------ */
  /* REFRESH                                                                  */
  /* ------------------------------------------------------------------------ */

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      setRefreshing(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* ACTIONS                                                                  */
  /* ------------------------------------------------------------------------ */

  const handleQuickAction = (action: QuickAction) => {
    router.push({
      pathname: "/(tabs)/people",
      params: { tab: action.tab },
    });
  };

  const handleStaffPress = (staff: any) => {
    router.push({
      pathname: "/(modals)/edit-member",
      params: {
        memberId: staff.id,
        groupId: staff.groupId,
        groupType: "staff",
      },
    });
  };

  const handleMemberPress = (member: any) => {
    router.push({
      pathname: "/(modals)/edit-member",
      params: {
        memberId: member.id,
        groupId: member.groupId,
        groupType: "apartment",
      },
    });
  };

  /* ------------------------------------------------------------------------ */
  /* LOADING                                                                  */
  /* ------------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------------ */
  /* NO ACCOUNT                                                               */
  /* ------------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------------ */
  /* ACCOUNT TYPE                                                             */
  /* ------------------------------------------------------------------------ */

  const accountTypeLabel =
    selectedAccount.type === "apartment" ? "Apartment Community" : "Home";

  /* ======================================================================== */
  /* STAFF VIEW - Profile + Attendance                                       */
  /* ======================================================================== */

  if (isStaff) {
    const staffProfile =
      matchedProfile && "monthlySalary" in matchedProfile
        ? matchedProfile
        : null;

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
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.greeting}>{getGreeting()} 👋</Text>
                <Text style={styles.accountName} numberOfLines={1}>
                  {selectedAccount?.name || "My Property"}
                </Text>
                <View style={styles.accountTypeRow}>
                  <View style={styles.accountStatusDot} />
                  <Text style={styles.accountTypeText}>Staff Portal</Text>
                  <View style={styles.dotSeparator} />
                  <Text style={styles.monthText}>{getCurrentMonth()}</Text>
                </View>
              </View>
            </View>
          </View>

          {staffProfile ? (
            <StaffPersonalCard
              staff={staffProfile}
              onEdit={() => handleStaffPress(staffProfile)}
            />
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="person-outline" size={42} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No staff profile found</Text>
              <Text style={styles.emptySubtitle}>
                Please contact your administrator to set up your staff profile.
              </Text>
            </View>
          )}

          {/* ATTENDANCE - slider + calendar */}
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

          <View style={styles.footerMessage}>
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color="#94A3B8"
            />
            <Text style={styles.footerMessageText}>
              You are viewing your personal staff dashboard
            </Text>
          </View>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </View>
    );
  }

  /* ======================================================================== */
  /* MEMBER VIEW                                                              */
  /* ======================================================================== */

  if (isMember) {
    const memberProfile =
      matchedProfile && "maintenanceAmount" in matchedProfile
        ? matchedProfile
        : null;

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
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.greeting}>{getGreeting()} 👋</Text>
                <Text style={styles.accountName} numberOfLines={1}>
                  {selectedAccount?.name || "My Property"}
                </Text>
                <View style={styles.accountTypeRow}>
                  <View style={styles.accountStatusDot} />
                  <Text style={styles.accountTypeText}>Resident Portal</Text>
                  <View style={styles.dotSeparator} />
                  <Text style={styles.monthText}>{getCurrentMonth()}</Text>
                </View>
              </View>
            </View>
          </View>

          {memberProfile ? (
            <MemberPersonalCard
              member={memberProfile}
              onEdit={() => handleMemberPress(memberProfile)}
            />
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="home-outline" size={42} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No member profile found</Text>
              <Text style={styles.emptySubtitle}>
                Please contact your administrator to set up your member profile.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Society Overview</Text>
                <Text style={styles.sectionSubtitle}>
                  Your community at a glance
                </Text>
              </View>
            </View>
            <View style={styles.statsGrid}>
              <StatCard
                title="Members"
                value={stats.totalProperties}
                icon="people-outline"
                color="#2563EB"
                description="Active"
              />
              <StatCard
                title="Staff"
                value={stats.totalStaff}
                icon="briefcase-outline"
                color="#16A34A"
                description="Working"
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Society Finance</Text>
                <Text style={styles.sectionSubtitle}>
                  View-only · This month
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
                title="Income"
                amount={stats.monthlyIncome}
                icon="arrow-down-outline"
                color="#16A34A"
                background="#DCFCE7"
              />
              <FinancialCard
                title="Expenses"
                amount={stats.monthlyExpense}
                icon="arrow-up-outline"
                color="#EA580C"
                background="#FFEDD5"
              />
              <FinancialCard
                title="Net"
                amount={netBalance}
                icon={
                  isPositiveBalance ? "wallet-outline" : "alert-circle-outline"
                }
                color={isPositiveBalance ? "#2563EB" : "#DC2626"}
                background={isPositiveBalance ? "#DBEAFE" : "#FEE2E2"}
              />
            </View>
          </View>

          <View style={styles.footerMessage}>
            <Ionicons name="eye-outline" size={18} color="#94A3B8" />
            <Text style={styles.footerMessageText}>
              View-only access · Contact admin for changes
            </Text>
          </View>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </View>
    );
  }

  /* ======================================================================== */
  /* ADMIN VIEW                                                               */
  /* ======================================================================== */

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

        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <View>
              <Text style={styles.balanceLabel}>Net Balance</Text>
              <Text style={styles.balancePeriod}>{getCurrentMonth()}</Text>
            </View>
            <View
              style={[
                styles.balanceIcon,
                {
                  backgroundColor: isPositiveBalance ? "#DCFCE7" : "#FEE2E2",
                },
              ]}
            >
              <Ionicons
                name={
                  isPositiveBalance
                    ? "trending-up-outline"
                    : "trending-down-outline"
                }
                size={21}
                color={isPositiveBalance ? "#16A34A" : "#DC2626"}
              />
            </View>
          </View>
          <Text
            style={[
              styles.balanceAmount,
              { color: isPositiveBalance ? "#15803D" : "#DC2626" },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {isPositiveBalance ? "" : "-"}
            {formatCurrency(netBalance)}
          </Text>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceBottom}>
            <View style={styles.balanceMiniItem}>
              <View style={[styles.miniDot, { backgroundColor: "#16A34A" }]} />
              <View>
                <Text style={styles.miniLabel}>Income</Text>
                <Text style={styles.miniValue}>
                  {formatCurrency(stats.monthlyIncome)}
                </Text>
              </View>
            </View>
            <View style={styles.balanceMiniItem}>
              <View style={[styles.miniDot, { backgroundColor: "#EA580C" }]} />
              <View>
                <Text style={styles.miniLabel}>Expenses</Text>
                <Text style={styles.miniValue}>
                  {formatCurrency(stats.monthlyExpense)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.sectionSubtitle}>
                Your property at a glance
              </Text>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <StatCard
              title={
                selectedAccount.type === "apartment" ? "Members" : "Tenants"
              }
              value={stats.totalProperties}
              icon={
                selectedAccount.type === "apartment"
                  ? "people-outline"
                  : "home-outline"
              }
              color="#2563EB"
              description="Active"
            />
            <StatCard
              title="Staff"
              value={stats.totalStaff}
              icon="briefcase-outline"
              color="#16A34A"
              description="Working"
            />
          </View>
        </View>

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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Financial Summary</Text>
              <Text style={styles.sectionSubtitle}>This month's activity</Text>
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
              title="Income"
              amount={stats.monthlyIncome}
              icon="arrow-down-outline"
              color="#16A34A"
              background="#DCFCE7"
            />
            <FinancialCard
              title="Expenses"
              amount={stats.monthlyExpense}
              icon="arrow-up-outline"
              color="#EA580C"
              background="#FFEDD5"
            />
            <FinancialCard
              title="Net"
              amount={netBalance}
              icon={
                isPositiveBalance ? "wallet-outline" : "alert-circle-outline"
              }
              color={isPositiveBalance ? "#2563EB" : "#DC2626"}
              background={isPositiveBalance ? "#DBEAFE" : "#FEE2E2"}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Recent Staff</Text>
              <Text style={styles.sectionSubtitle}>Your property team</Text>
            </View>
            {recentStaff.length > 0 && (
              <Pressable
                style={styles.seeAllButton}
                onPress={() => router.push("/(tabs)/people")}
              >
                <Text style={styles.seeAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={15} color="#2563EB" />
              </Pressable>
            )}
          </View>
          {recentStaff.length === 0 ? (
            <View style={styles.staffEmptyCard}>
              <View style={styles.staffEmptyIcon}>
                <Ionicons name="people-outline" size={25} color="#94A3B8" />
              </View>
              <View style={styles.staffEmptyContent}>
                <Text style={styles.staffEmptyTitle}>No staff yet</Text>
                <Text style={styles.staffEmptyText}>
                  Add your first staff member to start managing your property
                  team.
                </Text>
              </View>
              <Pressable
                style={styles.staffEmptyButton}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/people",
                    params: { tab: "staff" },
                  })
                }
              >
                <Ionicons name="add" size={19} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.staffList}>
              {recentStaff.map((staff, index) => (
                <StaffCard
                  key={staff.id || `${staff.name}-${index}`}
                  name={staff.name || "Unnamed Staff"}
                  role={staff.role || "other"}
                  onPress={() => handleStaffPress(staff)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },

  /* LOADING */
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
  loadingSubtitle: {
    marginTop: 5,
    fontSize: 13,
    color: "#94A3B8",
  },

  /* HEADER */
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

  /* BALANCE */
  balanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    boxShadow: "0px 8px 18px rgba(15, 23, 42, 0.06)",
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
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  miniLabel: { fontSize: 11, color: "#94A3B8", marginBottom: 2 },
  miniValue: { fontSize: 13, fontWeight: "700", color: "#334155" },

  /* SECTIONS */
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

  /* STATS */
  statsGrid: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    minHeight: 135,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    boxShadow: "0px 4px 10px rgba(15, 23, 42, 0.035)",
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

  /* QUICK ACTIONS */
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

  /* FINANCIAL */
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

  /* STAFF */
  staffList: { gap: 9 },
  staffCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 68,
  },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  staffInitial: { fontSize: 17, fontWeight: "800" },
  staffInfo: { flex: 1 },
  staffName: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  staffRoleRow: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  roleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  staffRole: { fontSize: 11, color: "#64748B", fontWeight: "500" },
  staffArrow: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  staffEmptyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  staffEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  staffEmptyContent: { flex: 1 },
  staffEmptyTitle: { fontSize: 14, fontWeight: "700", color: "#334155" },
  staffEmptyText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#94A3B8",
    marginTop: 3,
  },
  staffEmptyButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  /* PERSONAL CARD (shared by member & staff views) */
  personalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    boxShadow: "0px 8px 18px rgba(15, 23, 42, 0.06)",
  },
  personalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  personalAvatar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  personalInitial: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2563EB",
  },
  personalInfo: { flex: 1 },
  personalName: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  personalRoleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  personalRole: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  personalDetails: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  personalDetailItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  personalDetailLabel: {
    fontSize: 11,
    color: "#94A3B8",
    marginLeft: 4,
  },
  personalDetailValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  personalEditButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    gap: 6,
  },
  personalEditText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },

  /* ATTENDANCE */
  attendanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    boxShadow: "0px 4px 12px rgba(15, 23, 42, 0.05)",
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
  sliderMonthText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
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
  weekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  weekText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
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
  dayBubbleToday: {
    borderWidth: 2,
    borderColor: "#2563EB",
  },
  dayText: {
    fontSize: 12,
    fontWeight: "700",
  },

  /* MONTH / YEAR PICKER */
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
  yearRow: {
    gap: 8,
    paddingVertical: 4,
  },
  yearChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    minWidth: 70,
    alignItems: "center",
  },
  yearChipActive: {
    backgroundColor: "#2563EB",
  },
  yearChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  yearChipTextActive: {
    color: "#FFFFFF",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthChip: {
    width: "31%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  monthChipActive: {
    backgroundColor: "#2563EB",
  },
  monthChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  monthChipTextActive: {
    color: "#FFFFFF",
  },
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

  /* FOOTER MESSAGE */
  footerMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  footerMessageText: { fontSize: 12, color: "#94A3B8" },

  /* EMPTY ACCOUNT */
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
    boxShadow: "0px 6px 10px rgba(37, 99, 235, 0.18)",
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

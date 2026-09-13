import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import MonthYearPickerModal from "../../components/MonthYearPickerModal";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { useUserRole } from "../../hooks/useUserRole";
import { generateBillPDF, savePDFToDevice } from "../../services/pdfGenerator";
import { useAttendanceStore } from "../../store/attendanceStore";
import { BillMemberType, useBillStore } from "../../store/billStore";
import { useMemberStore } from "../../store/memberStore";
import { GroupType } from "../../types";

/* ================================================================
   COLORS
================================================================ */

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

/* ================================================================
   TYPES
================================================================ */

type PaymentFilter = "all" | "paid" | "due";

/* ================================================================
   HELPERS
================================================================ */

const getTabLabel = (
  type: GroupType,
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
  type: GroupType,
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
  type: GroupType,
  accountType?: "apartment" | "home",
): string => {
  if (type === "apartment") {
    return accountType === "home" ? "Add Tenant" : "Add Member";
  }

  if (type === "staff") return "Add Staff";
  if (type === "expense") return "Add Transaction";

  return "Add";
};

const getTabIcon = (type: GroupType): keyof typeof Ionicons.glyphMap => {
  if (type === "apartment") return "business-outline";
  if (type === "staff") return "people-outline";
  if (type === "expense") return "wallet-outline";

  return "folder-outline";
};

const getDetailsForMonth = (member: any, month: string | null) => {
  if (!month || !member.detailsHistory?.length) {
    return member;
  }

  const applicableSnapshot = [...member.detailsHistory]
    .filter((snapshot: any) => snapshot.effectiveMonth <= month)
    .sort((first: any, second: any) =>
      second.effectiveMonth.localeCompare(first.effectiveMonth),
    )[0];

  return applicableSnapshot
    ? { ...member, ...applicableSnapshot.details }
    : member;
};

const getPaymentForMonth = (member: any, month: string | null) => {
  if (!month) {
    return { status: "due" as const };
  }

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
    };
  }

  return { status: "due" as const };
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

const formatFullDate = (dateStr: string) => {
  const parts = dateStr.split("-");

  const year = parts[0];
  const monthNum = parts[1];
  const day = parts[2] || "01";

  const date = new Date(`${year}-${monthNum}-${day}`);

  return date.toLocaleString("default", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const getCalculatedStaffSalary = (
  salary: number,
  month: string,
  statuses: Record<string, string>,
) => {
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();

  const paidDays = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1,
  ).filter((day) => {
    const date = `${month}-${String(day).padStart(2, "0")}`;

    const defaultStatus =
      new Date(`${date}T00:00:00`).getDay() % 6 === 0 ? "weekend" : "present";

    return (statuses[date] || defaultStatus) !== "absent";
  }).length;

  return Math.round((salary / daysInMonth) * paidDays);
};

const navigateMonth = (
  currentMonth: string | null,
  direction: "prev" | "next",
): string => {
  if (!currentMonth) {
    return new Date().toISOString().slice(0, 7);
  }

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

/* ================================================================
   SCREEN
================================================================ */

export default function PeopleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { tab, memberId } = useLocalSearchParams<{
    tab?: GroupType;
    memberId?: string;
  }>();

  const { selectedAccountId, selectedAccount } = useAccounts();

  const { groups, createGroup } = useGroups(selectedAccountId);

  const { getMembersByGroup, updateMember } = useMemberStore();

  const getAttendanceRecord = useAttendanceStore((state) => state.getRecord);

  const { getBillConfig, templates: billTemplates } = useBillStore();

  const { isAdmin, isMember, isStaff: isStaffRole } = useUserRole();

  const canEdit = isAdmin;
  const canSeeFinance = isAdmin || isMember;
  const canSeeExpenseTab = isAdmin;
  const canSeeMemberTab = true;
  const canSeeStaffTab = true;

  const visibleTabTypes: GroupType[] = [];
  if (canSeeMemberTab) visibleTabTypes.push("apartment");
  if (canSeeStaffTab) visibleTabTypes.push("staff");
  if (canSeeExpenseTab) visibleTabTypes.push("expense");

  const tabTypes: GroupType[] = ["apartment", "staff", "expense"];

  const [activeTab, setActiveTab] = useState<GroupType>("apartment");

  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    new Date().toISOString().slice(0, 7),
  );

  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [paymentMember, setPaymentMember] = useState<any>(null);

  const [selectedStatus, setSelectedStatus] = useState<"paid" | "due">("due");

  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

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

  const [searchQuery, setSearchQuery] = useState<Record<GroupType, string>>({
    apartment: "",
    staff: "",
    expense: "",
  });

  const [paymentFilter, setPaymentFilter] = useState<
    Record<GroupType, PaymentFilter>
  >({
    apartment: "all",
    staff: "all",
    expense: "all",
  });

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  /* ----------------------------------------------------------------
     FILTER DROPDOWN ANCHOR
  ---------------------------------------------------------------- */

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
      () => {
        // measureLayout failed; next open will retry.
      },
    );
  };

  const activeSearch = searchQuery[activeTab];
  const activeFilter = paymentFilter[activeTab];

  const setActiveSearch = (value: string) =>
    setSearchQuery((current) => ({ ...current, [activeTab]: value }));

  const setActiveFilter = (value: PaymentFilter) =>
    setPaymentFilter((current) => ({ ...current, [activeTab]: value }));

  useEffect(() => {
    if (tab === "apartment" || tab === "staff" || tab === "expense") {
      if (!visibleTabTypes.includes(tab)) {
        setActiveTab("apartment");
      } else {
        setActiveTab(tab);
      }
    }
  }, [tab]);

  // On tab change: reset filter/search for a fresh view + close dropdown
  useEffect(() => {
    setSearchQuery((current) => ({ ...current, [activeTab]: "" }));
    setPaymentFilter((current) => ({ ...current, [activeTab]: "all" }));
    setShowFilterDropdown(false);
  }, [activeTab]);

  // Re-measure the dropdown anchor whenever the layout might have shifted
  useEffect(() => {
    if (showFilterDropdown) {
      const id = requestAnimationFrame(() => measureSearchRow());
      return () => cancelAnimationFrame(id);
    }
  }, [showFilterDropdown]);

  const handleAdd = async (type: GroupType) => {
    if (!canEdit) return;

    const existingGroup = groups.find((group) => group.type === type);

    if (existingGroup) {
      router.push({
        pathname: "/(modals)/add-member",
        params: {
          groupId: existingGroup.id,
          groupType: type,
        },
      });

      return;
    }

    const defaultName =
      type === "apartment"
        ? selectedAccount?.type === "home"
          ? "Tenant List"
          : "Apartment Owners"
        : type === "staff"
          ? "Staff & Helpers"
          : "Utility Expenses";

    const newGroup = await createGroup({
      accountId: selectedAccountId || "",
      type,
      name: defaultName,
      expenseTypes:
        type === "apartment"
          ? ["maintenance", "electricity", "water"]
          : type === "staff"
            ? ["salary", "bonus", "advance"]
            : ["electricity", "water", "maintenance", "other"],
    });

    router.push({
      pathname: "/(modals)/add-member",
      params: {
        groupId: newGroup.id,
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

          <Text style={styles.noPropertyTitle}>
            {groups.length > 0 ? "Select a property" : "Create your property"}
          </Text>

          <Text style={styles.noPropertySubtitle}>
            {groups.length > 0
              ? "Choose a property before managing your members, staff or expenses."
              : "Create a property first to start managing your apartment or home."}
          </Text>

          {canEdit && (
            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                pressed && styles.pressedButton,
              ]}
              onPress={() =>
                router.push(
                  groups.length > 0
                    ? "/(modals)/switch-account"
                    : "/(modals)/add-account",
                )
              }
            >
              <Ionicons
                name={groups.length > 0 ? "swap-horizontal" : "add"}
                size={18}
                color={COLORS.white}
              />

              <Text style={styles.createButtonText}>
                {groups.length > 0 ? "Select Property" : "Create Property"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const activeGroups = groups.filter((group) => group.type === activeTab);

  const membersInActiveGroup = activeGroups.flatMap((group) =>
    getMembersByGroup(group.id),
  );

  const activeMembers = selectedMonth
    ? membersInActiveGroup
        .filter((member) => {
          const date =
            activeTab === "expense" && "dueDate" in member
              ? member.dueDate
              : member.createdAt;

          return activeTab === "expense"
            ? date?.slice(0, 7) === selectedMonth
            : (date?.slice(0, 7) ?? "") <= selectedMonth;
        })
        .map((member) => getDetailsForMonth(member, selectedMonth))
    : membersInActiveGroup;

  const isApartmentTab = activeTab === "apartment";
  const isStaffTab = activeTab === "staff";
  const isExpenseTab = activeTab === "expense";

  const showFinancialInfo =
    canSeeFinance && (isApartmentTab || isStaffTab || isExpenseTab);

  const hasMembersInActiveTab = activeMembers.length > 0;

  const visibleMembers = useMemo(() => {
    const month = selectedMonth || new Date().toISOString().slice(0, 7);

    return activeMembers.filter((member: any) => {
      if (!memberMatchesQuery(member, activeSearch)) return false;

      if (activeFilter === "all") return true;

      let status: "paid" | "due";
      if (isExpenseTab) {
        status = member.status === "paid" ? "paid" : "due";
      } else {
        const monthlyPayment = getPaymentForMonth(member, month);
        status = monthlyPayment.status === "paid" ? "paid" : "due";
      }

      return status === activeFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeMembers,
    activeSearch,
    activeFilter,
    activeTab,
    isExpenseTab,
    selectedMonth,
  ]);

  const paymentAmount = paymentMember
    ? isApartmentTab
      ? paymentMember.maintenanceAmount
      : (() => {
          const month = selectedMonth || new Date().toISOString().slice(0, 7);

          const record = getAttendanceRecord(paymentMember.id, month);

          return (
            record?.payableSalary ??
            getCalculatedStaffSalary(
              paymentMember.monthlySalary,
              month,
              record?.statuses || {},
            )
          );
        })()
    : 0;

  const netPaidAmount =
    paymentAmount +
    (showAdditionalAmount ? Number(additionalAmount) || 0 : 0) -
    (showDeduction ? Number(deductionAmount) || 0 : 0);

  const openPaymentModal = (member: any) => {
    if (!canEdit) return;

    const month = selectedMonth || new Date().toISOString().slice(0, 7);

    const monthlyPayment = getPaymentForMonth(member, month);

    setPaymentMember(member);
    setSelectedStatus(monthlyPayment.status === "paid" ? "paid" : "due");
    setPaidDate(
      monthlyPayment.paidDate ||
        (selectedMonth
          ? `${selectedMonth}-01`
          : new Date().toISOString().slice(0, 10)),
    );

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
    if (!memberId || (tab !== "apartment" && tab !== "staff")) {
      return;
    }

    if (!canEdit) return;

    const group = groups.find((currentGroup) => currentGroup.type === tab);

    const member = group
      ? getMembersByGroup(group.id).find(
          (currentMember) => currentMember.id === memberId,
        )
      : undefined;

    if (member) {
      openPaymentModal(member);
    }
  }, [groups, getMembersByGroup, memberId, tab, canEdit]);

  const handleSavePayment = () => {
    if (!paymentMember || !canEdit) return;

    setSaving(true);

    const month = selectedMonth || paidDate.slice(0, 7);

    const additionalAmt = showAdditionalAmount
      ? Number(additionalAmount) || 0
      : 0;
    const deductionAmt = showDeduction ? Number(deductionAmount) || 0 : 0;

    updateMember(paymentMember.id, {
      paymentStatus: selectedStatus,
      paidDate: selectedStatus === "paid" ? paidDate : undefined,

      additionalAmount: additionalAmt,
      additionalNote: showAdditionalAmount
        ? additionalNote.trim() || undefined
        : undefined,

      deductionAmount: deductionAmt,
      deductionNote: showDeduction
        ? deductionNote.trim() || undefined
        : undefined,

      monthlyPayments: {
        ...paymentMember.monthlyPayments,

        [month]: {
          status: selectedStatus,
          ...(selectedStatus === "paid"
            ? {
                paidDate,
              }
            : {}),

          additionalAmount: additionalAmt,
          additionalNote: showAdditionalAmount
            ? additionalNote.trim() || undefined
            : undefined,

          deductionAmount: deductionAmt,
          deductionNote: showDeduction
            ? deductionNote.trim() || undefined
            : undefined,

          netAmount: netPaidAmount,
        },
      },
    });

    setRefreshKey((previous) => previous + 1);

    setTimeout(() => {
      setSaving(false);
      setPaymentMember(null);
    }, 300);
  };

  const handleDownloadBill = async (member: any) => {
    if (generatingBill || !canEdit) return;

    try {
      setGeneratingBill(member.id);

      const month = selectedMonth || new Date().toISOString().slice(0, 7);
      const monthlyPayment = getPaymentForMonth(member, month);

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
        : (() => {
            const record = getAttendanceRecord(member.id, month);
            return (
              record?.payableSalary ??
              getCalculatedStaffSalary(
                member.monthlySalary || 0,
                month,
                record?.statuses || {},
              )
            );
          })();

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
        month: formatMonthLong(month),
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
      const fileName = `Bill-${safeName}-${month}.pdf`;

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

  // Extra bottom padding so the last member is always reachable while the
  // keyboard is open. On iOS, ScrollView's automaticallyAdjustKeyboardInsets
  // adds keyboard height on top of this; on Android the keyboard is resize-
  // based and this alone is enough.
  const listBottomPadding =
    Math.max(insets.bottom, 24) + (Platform.OS === "ios" ? 320 : 160);

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
        },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View ref={containerRef} style={styles.innerContainer}>
        {/* HEADER */}

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

        {/* TABS */}

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

        {/* SEARCH + FILTER ROW — only when members exist in this tab */}

        {hasMembersInActiveTab && (
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
                    ? "Search by expenses name"
                    : "Search by name or mobile number"
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

        {/* FILTER DROPDOWN PANEL */}

        {hasMembersInActiveTab && showFilterDropdown && (
          <>
            <Pressable
              style={styles.filterBackdrop}
              onPress={() => setShowFilterDropdown(false)}
            />

            <View
              style={[
                styles.filterDropdown,
                {
                  top: filterAnchor.top,
                  right: filterAnchor.right,
                },
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

        {/* CONTENT — ScrollView fills remaining space. Tapping anywhere on
            the list background dismisses the keyboard. */}

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
                    visibleMembers.length,
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

            {visibleMembers.length === 0 ? (
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
                {visibleMembers.map((member: any) => {
                  const month =
                    selectedMonth || new Date().toISOString().slice(0, 7);

                  const record = getAttendanceRecord(member.id, month);

                  const monthlyPayment = member.monthlyPayments?.[month];

                  const basePaymentAmount = isApartmentTab
                    ? member.maintenanceAmount || 0
                    : (() => {
                        if (monthlyPayment?.payableSalary) {
                          return monthlyPayment.payableSalary;
                        }

                        if (record?.payableSalary) {
                          return record.payableSalary;
                        }

                        return getCalculatedStaffSalary(
                          member.monthlySalary || 0,
                          month,
                          record?.statuses || {},
                        );
                      })();

                  const monthlyPaymentData = getPaymentForMonth(
                    member,
                    selectedMonth,
                  );

                  const statusPaymentAmount =
                    monthlyPaymentData.status === "paid"
                      ? basePaymentAmount +
                        (monthlyPaymentData.additionalAmount || 0) -
                        (monthlyPaymentData.deductionAmount || 0)
                      : basePaymentAmount;

                  const hasMatchingHistory = member.detailsHistory?.some(
                    (snapshot: any) =>
                      snapshot.changeSummary &&
                      snapshot.effectiveMonth === selectedMonth,
                  );

                  const isPaidThisMonth = monthlyPaymentData.status === "paid";

                  return (
                    <Pressable
                      key={`${member.id}-${refreshKey}`}
                      style={({ pressed }) => [
                        styles.memberCard,
                        pressed && styles.memberCardPressed,
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        if (canEdit) {
                          router.push({
                            pathname: "/(modals)/edit-member",
                            params: {
                              memberId: member.id,
                              groupId: member.groupId,
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
                          ) : member.photoUri ? (
                            <Image
                              source={{
                                uri: member.photoUri,
                              }}
                              style={styles.memberPhoto}
                            />
                          ) : (
                            <Text style={styles.memberInitial}>
                              {member.name?.charAt(0)?.toUpperCase() || "?"}
                            </Text>
                          )}
                        </View>

                        <View style={styles.memberInfo}>
                          <View style={styles.memberNameRow}>
                            <Text style={styles.memberName} numberOfLines={1}>
                              {isExpenseTab
                                ? member.category || member.name
                                : member.name}
                            </Text>

                            {member.role && (
                              <View style={styles.roleBadge}>
                                <Text style={styles.roleBadgeText}>
                                  {member.role.charAt(0).toUpperCase() +
                                    member.role.slice(1)}
                                </Text>
                              </View>
                            )}
                          </View>

                          {isApartmentTab && (
                            <Text
                              style={styles.memberSubtitle}
                              numberOfLines={1}
                            >
                              {member.wing ? `${member.wing} • ` : ""}
                              {member.flatNumber
                                ? `Flat ${member.flatNumber}`
                                : "Apartment member"}
                            </Text>
                          )}

                          {isStaffTab && (
                            <Text
                              style={styles.memberSubtitle}
                              numberOfLines={1}
                            >
                              {member.phone || "Staff member"}
                            </Text>
                          )}

                          {isExpenseTab && (
                            <Text
                              style={styles.memberSubtitle}
                              numberOfLines={1}
                            >
                              {member.dueDate
                                ? `Due ${formatFullDate(member.dueDate)}`
                                : "Property expense"}
                            </Text>
                          )}
                        </View>

                        {canEdit && (
                          <Ionicons
                            name="chevron-forward"
                            size={17}
                            color={COLORS.muted}
                          />
                        )}
                      </View>

                      <View style={styles.memberDetails}>
                        <View style={styles.detailItem}>
                          <Ionicons
                            name="cash-outline"
                            size={14}
                            color={COLORS.secondary}
                          />

                          <Text style={styles.detailText}>
                            {showFinancialInfo ? (
                              <>
                                {isApartmentTab &&
                                  `₹${member.maintenanceAmount || 0} /month`}

                                {isStaffTab &&
                                  `₹${member.monthlySalary || 0} /month`}

                                {isExpenseTab && `₹${member.amount || 0}`}
                              </>
                            ) : (
                              <>
                                {isApartmentTab &&
                                  "Maintenance tracked by admin"}

                                {isStaffTab && "Salary tracked by admin"}

                                {isExpenseTab && "Expense tracked by admin"}
                              </>
                            )}
                          </Text>
                        </View>

                        {showFinancialInfo &&
                          (isApartmentTab || isStaffTab) && (
                            <View
                              style={[
                                styles.paymentBadge,
                                monthlyPaymentData.status === "paid"
                                  ? styles.paymentBadgePaid
                                  : styles.paymentBadgeDue,
                              ]}
                            >
                              <View
                                style={[
                                  styles.paymentDot,
                                  monthlyPaymentData.status === "paid"
                                    ? styles.paymentDotPaid
                                    : styles.paymentDotDue,
                                ]}
                              />

                              <Text
                                style={[
                                  styles.paymentBadgeText,
                                  monthlyPaymentData.status === "paid"
                                    ? styles.paymentTextPaid
                                    : styles.paymentTextDue,
                                ]}
                              >
                                {monthlyPaymentData.status === "paid"
                                  ? `Paid ₹${statusPaymentAmount}`
                                  : `Due ₹${statusPaymentAmount}`}
                              </Text>
                            </View>
                          )}

                        {showFinancialInfo && isExpenseTab && member.status && (
                          <View
                            style={[
                              styles.paymentBadge,
                              member.status === "paid"
                                ? styles.paymentBadgePaid
                                : styles.paymentBadgeDue,
                            ]}
                          >
                            <View
                              style={[
                                styles.paymentDot,
                                member.status === "paid"
                                  ? styles.paymentDotPaid
                                  : styles.paymentDotDue,
                              ]}
                            />

                            <Text
                              style={[
                                styles.paymentBadgeText,
                                member.status === "paid"
                                  ? styles.paymentTextPaid
                                  : styles.paymentTextDue,
                              ]}
                            >
                              {member.status === "paid" ? "Paid" : "Due"}
                            </Text>
                          </View>
                        )}
                      </View>

                      {canEdit && (isApartmentTab || isStaffTab) && (
                        <View style={styles.actionButtons}>
                          {isStaffTab && (
                            <Pressable
                              style={({ pressed }) => [
                                styles.secondaryAction,
                                pressed && styles.actionPressed,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation();
                                Keyboard.dismiss();

                                router.push({
                                  pathname: "/(modals)/mark-attendance",
                                  params: {
                                    accountId: selectedAccountId || "",
                                    memberId: member.id,
                                    month: selectedMonth || "",
                                  },
                                });
                              }}
                            >
                              <Ionicons
                                name="calendar-outline"
                                size={15}
                                color={COLORS.primary}
                              />

                              <Text style={styles.secondaryActionText}>
                                Attendance
                              </Text>
                            </Pressable>
                          )}

                          <Pressable
                            style={({ pressed }) => [
                              styles.paymentAction,
                              pressed && styles.actionPressed,
                            ]}
                            onPress={(event) => {
                              event.stopPropagation();
                              Keyboard.dismiss();
                              openPaymentModal(member);
                            }}
                          >
                            <Ionicons
                              name="swap-horizontal-outline"
                              size={15}
                              color={COLORS.primary}
                            />

                            <Text style={styles.paymentActionText}>
                              Payment
                            </Text>
                          </Pressable>

                          {isPaidThisMonth && (
                            <Pressable
                              style={({ pressed }) => [
                                styles.downloadAction,
                                pressed && styles.actionPressed,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation();
                                Keyboard.dismiss();
                                handleDownloadBill(member);
                              }}
                              disabled={generatingBill === member.id}
                            >
                              {generatingBill === member.id ? (
                                <ActivityIndicator
                                  size="small"
                                  color={COLORS.primary}
                                />
                              ) : (
                                <>
                                  <Ionicons
                                    name="download-outline"
                                    size={14}
                                    color={COLORS.primary}
                                  />
                                  <Text style={styles.downloadActionText}>
                                    Bill
                                  </Text>
                                </>
                              )}
                            </Pressable>
                          )}
                        </View>
                      )}

                      {canEdit &&
                        (isApartmentTab || isStaffTab) &&
                        hasMatchingHistory && (
                          <View style={styles.historyNotice}>
                            <Ionicons
                              name="information-circle-outline"
                              size={14}
                              color={COLORS.secondary}
                            />

                            <Text style={styles.historyText}>
                              Payment details updated on{" "}
                              {formatFullDate(`${selectedMonth}-01`)}
                            </Text>
                          </View>
                        )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Pressable>
        </ScrollView>
      </View>

      {/* MONTH PICKER */}

      <MonthYearPickerModal
        visible={showMonthPicker}
        value={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onSelect={setSelectedMonth}
      />

      {/* PAYMENT MODAL — admin only */}

      {canEdit && (
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(paymentMember)}
          onRequestClose={() => {
            setPaymentMember(null);
          }}
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

                      <View>
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

                      <View>
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
                    </View>
                  </Pressable>
                </View>

                <Text style={styles.sectionLabel}>
                  {isApartmentTab ? "Maintenance Amount" : "Salary Amount"}
                </Text>

                <View style={styles.amountCard}>
                  <View style={styles.amountLeft}>
                    <Ionicons
                      name="cash-outline"
                      size={19}
                      color={COLORS.primary}
                    />

                    <Text style={styles.amountLabel}>Base amount</Text>
                  </View>

                  <Text style={styles.amountValue}>₹{paymentAmount || 0}</Text>
                </View>

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

      {/* DATE PICKER */}

      <DatePickerModal
        visible={showPaidDatePicker}
        value={paidDate}
        onClose={() => setShowPaidDatePicker(false)}
        onSelect={setPaidDate}
      />
    </KeyboardAvoidingView>
  );
}

/* ==================================================================
   STYLES
================================================================== */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  innerContainer: {
    flex: 1,
  },

  scrollArea: {
    flex: 1,
  },

  pressedButton: {
    opacity: 0.7,
  },

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

  headerTitleArea: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },

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

  monthNavigation: {
    flexDirection: "row",
    alignItems: "center",
  },

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

  tabActive: {
    backgroundColor: COLORS.primaryLight,
  },

  tabPressed: {
    opacity: 0.7,
  },

  tabText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  tabTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },

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

  searchIcon: {
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },

  searchClearButton: {
    paddingLeft: 6,
  },

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

  filterOptionSelected: {
    backgroundColor: COLORS.primaryLight,
  },

  filterOptionPressed: {
    opacity: 0.7,
  },

  filterOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  filterOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: "700",
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 17,
  },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },

  countArea: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },

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

  addButtonPressed: {
    opacity: 0.8,
  },

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

  emptyIconStaff: {
    backgroundColor: COLORS.purpleLight,
  },

  emptyIconExpense: {
    backgroundColor: COLORS.successLight,
  },

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

  clearFiltersText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  memberCard: {
    padding: 13,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  memberCardPressed: {
    opacity: 0.76,
  },

  memberTop: {
    flexDirection: "row",
    alignItems: "center",
  },

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

  memberAvatarStaff: {
    backgroundColor: COLORS.purple,
  },

  memberAvatarExpense: {
    backgroundColor: COLORS.success,
  },

  memberPhoto: {
    width: "100%",
    height: "100%",
  },

  memberInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.white,
  },

  memberInfo: {
    flex: 1,
    minWidth: 0,
  },

  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  memberName: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: COLORS.text,
  },

  roleBadge: {
    marginLeft: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: COLORS.purpleLight,
  },

  roleBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: COLORS.purple,
  },

  memberSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.secondary,
  },

  memberDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 35,
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },

  detailItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  detailText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },

  paymentBadgePaid: {
    backgroundColor: COLORS.successLight,
  },

  paymentBadgeDue: {
    backgroundColor: COLORS.dangerLight,
  },

  paymentDot: {
    width: 5,
    height: 5,
    marginRight: 5,
    borderRadius: 3,
  },

  paymentDotPaid: {
    backgroundColor: COLORS.success,
  },

  paymentDotDue: {
    backgroundColor: COLORS.danger,
  },

  paymentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },

  paymentTextPaid: {
    color: COLORS.success,
  },

  paymentTextDue: {
    color: COLORS.danger,
  },

  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 9,
    gap: 6,
  },

  secondaryAction: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },

  paymentAction: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },

  downloadAction: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },

  actionPressed: {
    opacity: 0.65,
  },

  secondaryActionText: {
    marginLeft: 5,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },

  paymentActionText: {
    marginLeft: 5,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },

  downloadActionText: {
    marginLeft: 5,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.success,
  },

  historyNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },

  historyText: {
    flex: 1,
    marginLeft: 5,
    fontSize: 10,
    lineHeight: 15,
    fontStyle: "italic",
    color: COLORS.secondary,
  },

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

  paymentHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },

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

  paymentScroll: {
    flexGrow: 0,
  },

  paymentScrollContent: {
    paddingHorizontal: 17,
    paddingTop: 14,
  },

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

  statusSmallBadgePaid: {
    backgroundColor: COLORS.successLight,
  },

  statusSmallBadgeDue: {
    backgroundColor: COLORS.dangerLight,
  },

  statusSmallText: {
    fontSize: 9,
    fontWeight: "700",
  },

  statusSmallTextPaid: {
    color: COLORS.success,
  },

  statusSmallTextDue: {
    color: COLORS.danger,
  },

  statusRadioRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },

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

  statusRadioOptionPaid: {
    borderColor: COLORS.successBorder,
  },

  statusRadioOptionDue: {
    borderColor: COLORS.dangerBorder,
  },

  statusRadioOptionPressed: {
    opacity: 0.7,
  },

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

  radioOuterSelected: {
    borderColor: COLORS.primary,
  },

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

  statusRadioIconPaid: {
    backgroundColor: COLORS.successLight,
  },

  statusRadioIconDue: {
    backgroundColor: COLORS.dangerLight,
  },

  statusRadioTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusRadioTitlePaid: {
    color: COLORS.success,
  },

  statusRadioTitleDue: {
    color: COLORS.danger,
  },

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

  amountLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  amountLabel: {
    marginLeft: 8,
    fontSize: 11,
    color: COLORS.secondary,
  },

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

  modifierIconAdd: {
    backgroundColor: COLORS.primaryLight,
  },

  modifierIconRemove: {
    backgroundColor: COLORS.dangerLight,
  },

  modifierText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },

  modifierTextRemove: {
    color: COLORS.danger,
  },

  inputGroup: {
    marginTop: 1,
  },

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

  dateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },

  paymentBottomSpace: {
    height: 17,
  },

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

  cancelButtonPressed: {
    backgroundColor: COLORS.background,
  },

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

  saveDueButton: {
    backgroundColor: COLORS.danger,
  },

  saveButtonPressed: {
    opacity: 0.8,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.white,
  },
});

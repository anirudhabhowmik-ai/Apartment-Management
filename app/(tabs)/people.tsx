import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import DatePickerModal from "../../components/DatePickerModal";
import MonthYearPickerModal from "../../components/MonthYearPickerModal";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { generateBillPDF, sharePDF } from "../../services/pdfGenerator";
import { useAttendanceStore } from "../../store/attendanceStore";
import { useBillStore } from "../../store/billStore";
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
  if (type === "expense") return "Expenses";

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
  if (type === "expense") return "Add Expense";

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

/* ================================================================
   SCREEN
================================================================ */

export default function PeopleScreen() {
  const router = useRouter();

  const { tab, memberId } = useLocalSearchParams<{
    tab?: GroupType;
    memberId?: string;
  }>();

  const { selectedAccountId, selectedAccount } = useAccounts();

  const { groups, createGroup } = useGroups(selectedAccountId);

  const { getMembersByGroup, updateMember } = useMemberStore();

  const getAttendanceRecord = useAttendanceStore((state) => state.getRecord);

  const tabTypes: GroupType[] = ["apartment", "staff", "expense"];

  const [activeTab, setActiveTab] = useState<GroupType>("apartment");

  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    new Date().toISOString().slice(0, 7),
  );

  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [paymentMember, setPaymentMember] = useState<any>(null);

  const [paymentStatus, setPaymentStatus] = useState<"paid" | "due">("due");

  const [showChangeStatusModal, setShowChangeStatusModal] = useState(false);

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

  // Download bill states
  const [generatingBill, setGeneratingBill] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "apartment" || tab === "staff" || tab === "expense") {
      setActiveTab(tab);
    }
  }, [tab]);

  /* ================================================================
     ADD
  ================================================================ */

  const handleAdd = async (type: GroupType) => {
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

  /* ================================================================
     NO PROPERTY
  ================================================================ */

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
        </View>
      </View>
    );
  }

  /* ================================================================
     DATA
  ================================================================ */

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

  const isApartment = activeTab === "apartment";
  const isStaff = activeTab === "staff";
  const isExpense = activeTab === "expense";

  /* ================================================================
     PAYMENT
  ================================================================ */

  const paymentAmount = paymentMember
    ? isApartment
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
    const month = selectedMonth || new Date().toISOString().slice(0, 7);

    const monthlyPayment = getPaymentForMonth(member, month);

    setPaymentMember(member);

    setPaymentStatus(monthlyPayment.status === "paid" ? "paid" : "due");

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

    setShowChangeStatusModal(false);
  };

  useEffect(() => {
    if (!memberId || (tab !== "apartment" && tab !== "staff")) {
      return;
    }

    const group = groups.find((currentGroup) => currentGroup.type === tab);

    const member = group
      ? getMembersByGroup(group.id).find(
          (currentMember) => currentMember.id === memberId,
        )
      : undefined;

    if (member) {
      openPaymentModal(member);
    }
  }, [groups, getMembersByGroup, memberId, tab]);

  const markPaymentAsPaid = () => {
    if (!paymentMember) return;

    const month = selectedMonth || paidDate.slice(0, 7);

    updateMember(paymentMember.id, {
      paymentStatus: "paid",
      paidDate,

      additionalAmount: showAdditionalAmount
        ? Number(additionalAmount) || 0
        : 0,

      additionalNote: showAdditionalAmount
        ? additionalNote.trim() || undefined
        : undefined,

      deductionAmount: showDeduction ? Number(deductionAmount) || 0 : 0,

      deductionNote: showDeduction
        ? deductionNote.trim() || undefined
        : undefined,

      monthlyPayments: {
        ...paymentMember.monthlyPayments,

        [month]: {
          status: "paid",
          paidDate,

          additionalAmount: showAdditionalAmount
            ? Number(additionalAmount) || 0
            : 0,

          additionalNote: showAdditionalAmount
            ? additionalNote.trim() || undefined
            : undefined,

          deductionAmount: showDeduction ? Number(deductionAmount) || 0 : 0,

          deductionNote: showDeduction
            ? deductionNote.trim() || undefined
            : undefined,
        },
      },
    });

    setPaymentStatus("paid");
    setShowChangeStatusModal(false);
    setRefreshKey((previous) => previous + 1);
  };

  const markPaymentAsDue = () => {
    if (!paymentMember) return;

    const month = selectedMonth || paidDate.slice(0, 7);

    updateMember(paymentMember.id, {
      paymentStatus: "due",
      paidDate: undefined,

      additionalAmount: showAdditionalAmount
        ? Number(additionalAmount) || 0
        : 0,

      additionalNote: showAdditionalAmount
        ? additionalNote.trim() || undefined
        : undefined,

      deductionAmount: showDeduction ? Number(deductionAmount) || 0 : 0,

      deductionNote: showDeduction
        ? deductionNote.trim() || undefined
        : undefined,

      monthlyPayments: {
        ...paymentMember.monthlyPayments,

        [month]: {
          status: "due",

          additionalAmount: showAdditionalAmount
            ? Number(additionalAmount) || 0
            : 0,

          additionalNote: showAdditionalAmount
            ? additionalNote.trim() || undefined
            : undefined,

          deductionAmount: showDeduction ? Number(deductionAmount) || 0 : 0,

          deductionNote: showDeduction
            ? deductionNote.trim() || undefined
            : undefined,
        },
      },
    });

    setPaymentStatus("due");
    setShowChangeStatusModal(false);
    setRefreshKey((previous) => previous + 1);
  };

  /* ================================================================
   DOWNLOAD BILL - FIXED for your Account type
=============================================================== */

  const handleDownloadBill = async (member: any) => {
    if (generatingBill) return;

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

      // Get the bill template from store
      const templates = useBillStore.getState().templates;
      const selectedTemplate = templates[0] || {
        id: "default",
        name: "Default",
        description: "Default template",
        colors: {
          primary: "#1a73e8",
          secondary: "#34a853",
          accent: "#fbbc04",
          background: "#ffffff",
          text: "#202124",
          headerBg: "#1a73e8",
          footerBg: "#f8f9fa",
        },
        fontFamily: "Roboto",
        logoPosition: "top-left" as const,
        showBorder: true,
        borderColor: "#e0e0e0",
        borderWidth: 1,
        borderRadius: 8,
        showWatermark: true,
        watermarkText: "Society Management",
      };

      // Calculate base amount
      const baseAmount = isApartment
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

      // Generate bill number
      const billNumber = `BILL-${member.id.slice(0, 4)}-${Date.now().toString().slice(-6)}`;

      // Get society name from account or use default
      const societyName = selectedAccount?.name || "Apartment Society";
      const address = selectedAccount?.address || "Society Address";

      // For phone and email, use defaults since Account type doesn't have these fields
      const contactNumber = "+91 9876543210"; // Default contact number
      const email = "society@example.com"; // Default email

      const billData = {
        billNumber,
        apartmentName: member.wing || "Apartment",
        address: address,
        societyName: societyName,
        contactNumber: contactNumber,
        email: email,
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
        signData: undefined,
        template: selectedTemplate,
        billType: isApartment ? ("maintenance" as const) : ("salary" as const),
        staffRole: isStaff ? member.role : undefined,
      };

      const pdfUri = await generateBillPDF(billData);
      await sharePDF(pdfUri, `Bill-${member.name}-${month}.pdf`);

      setGeneratingBill(null);
    } catch (error) {
      console.error("Error generating bill:", error);
      Alert.alert("Error", "Failed to generate bill. Please try again.");
      setGeneratingBill(null);
    }
  };

  /* ================================================================
     MONTH
  ================================================================ */

  const handlePrevMonth = () => {
    setSelectedMonth(navigateMonth(selectedMonth, "prev"));
  };

  const handleNextMonth = () => {
    setSelectedMonth(navigateMonth(selectedMonth, "next"));
  };

  /* ================================================================
     RENDER
  ================================================================ */

  return (
    <View style={styles.container}>
      {/* ==========================================================
          HEADER
      ========================================================== */}

      <View style={styles.header}>
        <View style={styles.headerTitleArea}>
          <Text style={styles.title}>Management</Text>

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
            <Ionicons name="chevron-forward" size={17} color={COLORS.primary} />
          </Pressable>
        </View>
      </View>

      {/* ==========================================================
          TABS
      ========================================================== */}

      <View style={styles.tabsContainer}>
        {tabTypes.map((type) => {
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

      {/* ==========================================================
          CONTENT
      ========================================================== */}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {/* LIST HEADER */}

        <View style={styles.listHeader}>
          <View style={styles.countArea}>
            <Text style={styles.countTitle}>
              {getCountLabel(
                activeTab,
                activeMembers.length,
                selectedAccount?.type,
              )}
            </Text>

            <Text style={styles.countSubtitle}>
              {isExpense
                ? "Property expenses"
                : isStaff
                  ? "Staff and salary"
                  : selectedAccount?.type === "home"
                    ? "Your tenants"
                    : "Apartment members"}
            </Text>
          </View>

          {/* ======================================================
              ONE ADD BUTTON — ALWAYS VISIBLE
          ====================================================== */}

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
        </View>

        {/* ========================================================
            EMPTY
        ======================================================== */}

        {activeMembers.length === 0 ? (
          <View style={styles.emptyCard}>
            <View
              style={[
                styles.emptyIcon,
                isStaff && styles.emptyIconStaff,
                isExpense && styles.emptyIconExpense,
              ]}
            >
              <Ionicons
                name={getTabIcon(activeTab)}
                size={31}
                color={
                  isStaff
                    ? COLORS.purple
                    : isExpense
                      ? COLORS.success
                      : COLORS.primary
                }
              />
            </View>

            <Text style={styles.emptyTitle}>
              No {getTabLabel(activeTab, selectedAccount?.type).toLowerCase()}{" "}
              yet
            </Text>

            <Text style={styles.emptySubtitle}>
              {isExpense
                ? "Add your first expense to start tracking property spending."
                : isStaff
                  ? "Add staff members to manage attendance and salary."
                  : selectedAccount?.type === "home"
                    ? "Add tenants to start managing your property."
                    : "Add apartment members to manage maintenance and payments."}
            </Text>
          </View>
        ) : (
          /* ========================================================
             MEMBER LIST
          ======================================================== */

          <View>
            {activeMembers.map((member: any) => {
              const month =
                selectedMonth || new Date().toISOString().slice(0, 7);

              const record = getAttendanceRecord(member.id, month);

              const monthlyPayment = member.monthlyPayments?.[month];

              const basePaymentAmount = isApartment
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
                  onPress={() =>
                    router.push({
                      pathname: "/(modals)/edit-member",
                      params: {
                        memberId: member.id,
                        groupId: member.groupId,
                        groupType: activeTab,
                      },
                    })
                  }
                >
                  {/* TOP */}

                  <View style={styles.memberTop}>
                    <View
                      style={[
                        styles.memberAvatar,
                        isStaff && styles.memberAvatarStaff,
                        isExpense && styles.memberAvatarExpense,
                      ]}
                    >
                      {isExpense ? (
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
                          {isExpense
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

                      {isApartment && (
                        <Text style={styles.memberSubtitle} numberOfLines={1}>
                          {member.wing ? `${member.wing} • ` : ""}
                          {member.flatNumber
                            ? `Flat ${member.flatNumber}`
                            : "Apartment member"}
                        </Text>
                      )}

                      {isStaff && (
                        <Text style={styles.memberSubtitle} numberOfLines={1}>
                          {member.phone || "Staff member"}
                        </Text>
                      )}

                      {isExpense && (
                        <Text style={styles.memberSubtitle} numberOfLines={1}>
                          {member.dueDate
                            ? `Due ${formatFullDate(member.dueDate)}`
                            : "Property expense"}
                        </Text>
                      )}
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={COLORS.muted}
                    />
                  </View>

                  {/* DETAILS */}

                  <View style={styles.memberDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons
                        name="cash-outline"
                        size={14}
                        color={COLORS.secondary}
                      />

                      <Text style={styles.detailText}>
                        {isApartment &&
                          `₹${member.maintenanceAmount || 0} /month`}

                        {isStaff && `₹${member.monthlySalary || 0} /month`}

                        {isExpense && `₹${member.amount || 0}`}
                      </Text>
                    </View>

                    {(isApartment || isStaff) && (
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

                    {isExpense && member.status && (
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

                  {/* ACTIONS */}

                  {(isApartment || isStaff) && (
                    <View style={styles.actionButtons}>
                      {isStaff && (
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryAction,
                            pressed && styles.actionPressed,
                          ]}
                          onPress={(event) => {
                            event.stopPropagation();

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
                          openPaymentModal(member);
                        }}
                      >
                        <Ionicons
                          name="swap-horizontal-outline"
                          size={15}
                          color={COLORS.primary}
                        />

                        <Text style={styles.paymentActionText}>Payment</Text>
                      </Pressable>

                      {/* ==================================================
                          DOWNLOAD BILL BUTTON - Only shows when PAID
                      ================================================== */}
                      {isPaidThisMonth && (
                        <Pressable
                          style={({ pressed }) => [
                            styles.downloadAction,
                            pressed && styles.actionPressed,
                          ]}
                          onPress={(event) => {
                            event.stopPropagation();
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

                  {/* HISTORY */}

                  {(isApartment || isStaff) && hasMatchingHistory && (
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
      </ScrollView>

      {/* ==========================================================
          MONTH PICKER
      ========================================================== */}

      <MonthYearPickerModal
        visible={showMonthPicker}
        value={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onSelect={setSelectedMonth}
      />

      {/* ==========================================================
          PAYMENT MODAL
      ========================================================== */}

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(paymentMember)}
        onRequestClose={() => {
          setShowChangeStatusModal(false);
          setPaymentMember(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            {/* HEADER */}

            <View style={styles.paymentModalHeader}>
              <View style={styles.paymentHeaderIcon}>
                <Ionicons
                  name={isApartment ? "home-outline" : "wallet-outline"}
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
                  setShowChangeStatusModal(false);
                  setPaymentMember(null);
                }}
              >
                <Ionicons name="close" size={20} color={COLORS.text} />
              </Pressable>
            </View>

            {/* CONTENT */}

            <ScrollView
              style={styles.paymentScroll}
              contentContainerStyle={styles.paymentScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* PAYMENT MONTH */}

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
                    paymentStatus === "paid"
                      ? styles.statusSmallBadgePaid
                      : styles.statusSmallBadgeDue,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusSmallText,
                      paymentStatus === "paid"
                        ? styles.statusSmallTextPaid
                        : styles.statusSmallTextDue,
                    ]}
                  >
                    {paymentStatus === "paid" ? "PAID" : "DUE"}
                  </Text>
                </View>
              </View>

              {/* STATUS */}

              <Text style={styles.sectionLabel}>Payment Status</Text>

              <Pressable
                style={({ pressed }) => [
                  styles.statusSelector,
                  pressed && styles.statusSelectorPressed,
                ]}
                onPress={() => setShowChangeStatusModal(true)}
              >
                <View
                  style={[
                    styles.statusSelectorIcon,
                    paymentStatus === "paid"
                      ? styles.statusSelectorIconPaid
                      : styles.statusSelectorIconDue,
                  ]}
                >
                  <Ionicons
                    name={
                      paymentStatus === "paid" ? "checkmark" : "time-outline"
                    }
                    size={18}
                    color={
                      paymentStatus === "paid" ? COLORS.success : COLORS.danger
                    }
                  />
                </View>

                <View style={styles.statusSelectorInfo}>
                  <Text style={styles.statusSelectorTitle}>
                    {paymentStatus === "paid"
                      ? "Payment received"
                      : "Payment pending"}
                  </Text>

                  <Text style={styles.statusSelectorSubtitle}>
                    Tap to change status
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.muted}
                />
              </Pressable>

              {/* BASE AMOUNT */}

              <Text style={styles.sectionLabel}>
                {isApartment ? "Maintenance Amount" : "Salary Amount"}
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

              {/* ADDITIONAL */}

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

              {/* DEDUCTION */}

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

              {/* NET */}

              <View style={styles.netAmountCard}>
                <View>
                  <Text style={styles.netAmountLabel}>
                    {paymentStatus === "paid" ? "NET PAID" : "AMOUNT TO PAY"}
                  </Text>

                  <Text style={styles.netAmountHint}>
                    Base + additions − deductions
                  </Text>
                </View>

                <Text style={styles.netAmountValue}>₹{netPaidAmount}</Text>
              </View>

              {/* PAID DATE */}

              {paymentStatus === "paid" && (
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

            {/* FOOTER */}

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.cancelButtonPressed,
                ]}
                onPress={() => {
                  setShowChangeStatusModal(false);
                  setPaymentMember(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  paymentStatus === "due" && styles.saveDueButton,
                  pressed && styles.saveButtonPressed,
                ]}
                onPress={
                  paymentStatus === "paid"
                    ? markPaymentAsPaid
                    : markPaymentAsDue
                }
              >
                <Ionicons
                  name={
                    paymentStatus === "paid"
                      ? "checkmark-circle-outline"
                      : "time-outline"
                  }
                  size={18}
                  color={COLORS.white}
                />

                <Text style={styles.saveButtonText}>
                  {paymentStatus === "paid" ? "Save as Paid" : "Save as Due"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==========================================================
          CHANGE STATUS MODAL
      ========================================================== */}

      <Modal
        transparent
        animationType="fade"
        visible={showChangeStatusModal}
        onRequestClose={() => setShowChangeStatusModal(false)}
      >
        <View style={styles.statusModalOverlay}>
          <View style={styles.statusModal}>
            <View style={styles.statusModalHeader}>
              <View style={styles.statusModalIcon}>
                <Ionicons
                  name="swap-vertical"
                  size={20}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.statusModalHeaderInfo}>
                <Text style={styles.statusModalTitle}>Payment Status</Text>

                <Text style={styles.statusModalSubtitle}>
                  Choose the current status
                </Text>
              </View>

              <Pressable
                style={styles.closeModalButton}
                onPress={() => setShowChangeStatusModal(false)}
              >
                <Ionicons name="close" size={20} color={COLORS.text} />
              </Pressable>
            </View>

            {/* PAID */}

            <Pressable
              style={({ pressed }) => [
                styles.statusOption,
                styles.statusOptionPaid,
                paymentStatus === "paid" && styles.statusOptionSelectedPaid,
                pressed && styles.statusOptionPressed,
              ]}
              onPress={markPaymentAsPaid}
            >
              <View
                style={[styles.statusOptionIcon, styles.statusOptionIconPaid]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={23}
                  color={COLORS.success}
                />
              </View>

              <View style={styles.statusOptionInfo}>
                <Text style={styles.statusOptionTitle}>Mark as Paid</Text>

                <Text style={styles.statusOptionSubtitle}>
                  Payment has been received
                </Text>
              </View>

              {paymentStatus === "paid" && (
                <View style={styles.statusSelectedCheck}>
                  <Ionicons name="checkmark" size={15} color={COLORS.white} />
                </View>
              )}
            </Pressable>

            {/* DUE */}

            <Pressable
              style={({ pressed }) => [
                styles.statusOption,
                styles.statusOptionDue,
                paymentStatus === "due" && styles.statusOptionSelectedDue,
                pressed && styles.statusOptionPressed,
              ]}
              onPress={markPaymentAsDue}
            >
              <View
                style={[styles.statusOptionIcon, styles.statusOptionIconDue]}
              >
                <Ionicons name="time" size={23} color={COLORS.danger} />
              </View>

              <View style={styles.statusOptionInfo}>
                <Text style={styles.statusOptionTitle}>Mark as Due</Text>

                <Text style={styles.statusOptionSubtitle}>
                  Payment is still pending
                </Text>
              </View>

              {paymentStatus === "due" && (
                <View
                  style={[
                    styles.statusSelectedCheck,
                    styles.statusSelectedCheckDue,
                  ]}
                >
                  <Ionicons name="checkmark" size={15} color={COLORS.white} />
                </View>
              )}
            </Pressable>

            <Pressable
              style={styles.statusCancelButton}
              onPress={() => setShowChangeStatusModal(false)}
            >
              <Text style={styles.statusCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ==========================================================
          DATE PICKER
      ========================================================== */}

      <DatePickerModal
        visible={showPaidDatePicker}
        value={paidDate}
        onClose={() => setShowPaidDatePicker(false)}
        onSelect={setPaidDate}
      />
    </View>
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

  pressedButton: {
    opacity: 0.7,
  },

  /* HEADER */

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

  /* TABS */

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

  /* LIST */

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 35,
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

  /* THIS IS THE ONLY ADD BUTTON */

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

  /* EMPTY */

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

  /* MEMBER CARD */

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

  /* DETAILS */

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

  /* ACTIONS */

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

  /* HISTORY */

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

  /* NO PROPERTY */

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

  /* PAYMENT MODAL */

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

  /* PAYMENT MONTH */

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

  /* PAYMENT STATUS */

  sectionLabel: {
    marginTop: 16,
    marginBottom: 7,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: COLORS.textSoft,
  },

  statusSelector: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },

  statusSelectorPressed: {
    opacity: 0.7,
    backgroundColor: COLORS.background,
  },

  statusSelectorIcon: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    borderRadius: 11,
  },

  statusSelectorIconPaid: {
    backgroundColor: COLORS.successLight,
  },

  statusSelectorIconDue: {
    backgroundColor: COLORS.dangerLight,
  },

  statusSelectorInfo: {
    flex: 1,
  },

  statusSelectorTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusSelectorSubtitle: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.secondary,
  },

  /* AMOUNT */

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

  /* MODIFIERS */

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

  /* NET */

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

  /* PAID DATE */

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

  /* PAYMENT FOOTER */

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

  saveButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.white,
  },

  /* STATUS MODAL */

  statusModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },

  statusModal: {
    width: "100%",
    maxWidth: 380,
    padding: 17,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },

  statusModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  statusModalIcon: {
    width: 41,
    height: 41,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
  },

  statusModalHeaderInfo: {
    flex: 1,
  },

  statusModalTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusModalSubtitle: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.secondary,
  },

  statusOption: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
    borderRadius: 13,
    borderWidth: 1,
  },

  statusOptionPaid: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },

  statusOptionDue: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },

  statusOptionSelectedPaid: {
    borderColor: COLORS.success,
  },

  statusOptionSelectedDue: {
    borderColor: COLORS.danger,
  },

  statusOptionPressed: {
    opacity: 0.7,
  },

  statusOptionIcon: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 13,
  },

  statusOptionIconPaid: {
    backgroundColor: "#DCFCE7",
  },

  statusOptionIconDue: {
    backgroundColor: "#FEE2E2",
  },

  statusOptionInfo: {
    flex: 1,
  },

  statusOptionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusOptionSubtitle: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.secondary,
  },

  statusSelectedCheck: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.success,
  },

  statusSelectedCheckDue: {
    backgroundColor: COLORS.danger,
  },

  statusCancelButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  statusCancelText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },
});

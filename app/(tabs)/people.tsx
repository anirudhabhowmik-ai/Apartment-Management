import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DatePickerModal from "../../components/DatePickerModal";
import MonthYearPickerModal from "../../components/MonthYearPickerModal";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { useAttendanceStore } from "../../store/attendanceStore";
import { useMemberStore } from "../../store/memberStore";
import { GroupType } from "../../types";

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

  return `${count} ${count === 1 ? singular : plural} added`;
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
  if (type === "expense") return "cash-outline";

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

// Helper function to navigate months
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

  useEffect(() => {
    if (tab === "apartment" || tab === "staff" || tab === "expense") {
      setActiveTab(tab);
    }
  }, [tab]);

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

  if (!selectedAccountId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color="#ccc" />

          <Text style={styles.emptyStateText}>
            {groups.length > 0
              ? "Select a property first"
              : "Create a property first"}
          </Text>

          <TouchableOpacity
            style={styles.createButton}
            onPress={() =>
              router.push(
                groups.length > 0
                  ? "/(modals)/switch-account"
                  : "/(modals)/add-account",
              )
            }
          >
            <Text style={styles.createButtonText}>
              {groups.length > 0 ? "Select Property" : "Create Property"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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

  const isApartment = activeTab === "apartment";
  const isStaff = activeTab === "staff";
  const isExpense = activeTab === "expense";

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
  };

  // Handle month navigation
  const handlePrevMonth = () => {
    setSelectedMonth(navigateMonth(selectedMonth, "prev"));
  };

  const handleNextMonth = () => {
    setSelectedMonth(navigateMonth(selectedMonth, "next"));
  };

  // Force refresh when coming back from attendance
  const refreshData = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}

      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>

        {/* Month Navigation with Slider */}
        <View style={styles.monthNavContainer}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={handlePrevMonth}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#1a73e8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.monthFilter}
            onPress={() => setShowMonthPicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color="#1a73e8" />

            <Text style={styles.monthFilterText}>
              {selectedMonth
                ? new Date(`${selectedMonth}-01T00:00:00`).toLocaleString(
                    "default",
                    {
                      month: "short",
                      year: "numeric",
                    },
                  )
                : "All months"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={handleNextMonth}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={20} color="#1a73e8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* TABS */}

      <View style={styles.tabBar}>
        {tabTypes.map((type) => {
          const isActive = activeTab === type;

          return (
            <TouchableOpacity
              key={type}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(type)}
            >
              <Ionicons
                name={getTabIcon(type)}
                size={16}
                color={isActive ? "#1a73e8" : "#888"}
              />

              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {getTabLabel(type, selectedAccount?.type)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* MEMBER LIST */}

      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.actionRow}>
          <Text style={styles.countLabel}>
            {getCountLabel(
              activeTab,
              activeMembers.length,
              selectedAccount?.type,
            )}
          </Text>

          <TouchableOpacity
            style={styles.addButtonSmall}
            onPress={() => handleAdd(activeTab)}
          >
            <Ionicons name="add" size={16} color="#fff" />

            <Text style={styles.addButtonSmallText}>
              {getAddButtonLabel(activeTab, selectedAccount?.type)}
            </Text>
          </TouchableOpacity>
        </View>

        {activeMembers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name={getTabIcon(activeTab)} size={40} color="#ccc" />

            <Text style={styles.emptyStateText}>
              No {getTabLabel(activeTab, selectedAccount?.type).toLowerCase()}{" "}
              added yet
            </Text>
          </View>
        ) : (
          <View style={styles.membersList}>
            {activeMembers.map((member: any) => {
              const month =
                selectedMonth || new Date().toISOString().slice(0, 7);
              const record = getAttendanceRecord(member.id, month);
              const monthlyPayment = member.monthlyPayments?.[month];

              // FIXED: Get base payment amount with priority:
              // 1. monthlyPayment.payableSalary (from attendance save)
              // 2. record.payableSalary (from attendance store)
              // 3. Calculated from statuses
              const basePaymentAmount = isApartment
                ? member.maintenanceAmount || 0
                : (() => {
                    // First check if there's a monthly payment with a payableSalary
                    if (monthlyPayment?.payableSalary) {
                      return monthlyPayment.payableSalary;
                    }

                    // Then check attendance record
                    if (record?.payableSalary) {
                      return record.payableSalary;
                    }

                    // Otherwise calculate based on statuses
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

              // Check if the details history matches the selected month
              const hasMatchingHistory = member.detailsHistory?.some(
                (snapshot: any) =>
                  snapshot.changeSummary &&
                  snapshot.effectiveMonth === selectedMonth,
              );

              return (
                // Full card is clickable -> Navigate to edit-member page
                <TouchableOpacity
                  key={`${member.id}-${refreshKey}`}
                  style={styles.memberPaymentCard}
                  activeOpacity={0.7}
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
                  <View style={styles.memberItem}>
                    <View
                      style={[
                        styles.memberIcon,
                        isExpense && styles.memberIconExpense,
                      ]}
                    >
                      {isExpense ? (
                        <Ionicons name="cash-outline" size={18} color="#fff" />
                      ) : member.photoUri ? (
                        <Image
                          source={{
                            uri: member.photoUri,
                          }}
                          style={styles.memberPhoto}
                        />
                      ) : (
                        <Text style={styles.memberInitial}>
                          {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </Text>
                      )}
                    </View>

                    <View style={styles.memberInfo}>
                      <View style={styles.memberTitleRow}>
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

                        {(isApartment || isStaff) &&
                          (monthlyPaymentData.status === "paid" ? (
                            <View
                              style={[
                                styles.statusBadge,
                                styles.statusPaid,
                                styles.inlineStatusBadge,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusBadgeText,
                                  styles.statusPaidText,
                                ]}
                              >
                                Paid ₹{statusPaymentAmount}
                              </Text>
                            </View>
                          ) : (
                            <View
                              style={[
                                styles.statusBadge,
                                styles.statusDue,
                                styles.inlineStatusBadge,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusBadgeText,
                                  styles.statusDueText,
                                ]}
                              >
                                Due ₹{statusPaymentAmount}
                              </Text>
                            </View>
                          ))}
                      </View>

                      {isApartment && (
                        <Text style={styles.memberSubtitle} numberOfLines={1}>
                          {member.wing ? `${member.wing} - ` : ""}
                          {member.flatNumber ? `Flat ${member.flatNumber}` : ""}
                          {member.maintenanceAmount
                            ? `  •  ₹${member.maintenanceAmount}/mo`
                            : ""}
                        </Text>
                      )}

                      {isStaff && (
                        <Text style={styles.memberSubtitle} numberOfLines={1}>
                          {member.phone || ""}
                          {member.monthlySalary
                            ? `  •  ₹${member.monthlySalary}/mo`
                            : ""}
                        </Text>
                      )}

                      {isExpense && (
                        <Text style={styles.memberSubtitle} numberOfLines={1}>
                          {member.amount ? `₹${member.amount}` : ""}
                          {member.dueDate ? `  •  Due ${member.dueDate}` : ""}
                        </Text>
                      )}
                    </View>

                    {isExpense && member.status && (
                      <View
                        style={[
                          styles.statusBadge,
                          member.status === "paid"
                            ? styles.statusPaid
                            : styles.statusDue,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            member.status === "paid"
                              ? styles.statusPaidText
                              : styles.statusDueText,
                          ]}
                        >
                          {member.status === "paid" ? "Paid" : "Due"}
                        </Text>
                      </View>
                    )}

                    <Ionicons name="chevron-forward" size={18} color="#ccc" />
                  </View>

                  {(isApartment || isStaff) && (
                    <View
                      style={[
                        styles.paymentActions,
                        isStaff && styles.staffActions,
                      ]}
                    >
                      {isStaff && (
                        <TouchableOpacity
                          style={[
                            styles.attendanceButton,
                            styles.rowActionButton,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
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
                            size={14}
                            color="#1a73e8"
                          />

                          <Text style={styles.attendanceButtonText}>
                            Attendance
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* CHANGE PAYMENT STATUS - Opens payment modal */}
                      <TouchableOpacity
                        style={[
                          styles.editPaymentButton,
                          isStaff && styles.rowActionButton,
                        ]}
                        onPress={(e) => {
                          e.stopPropagation();
                          openPaymentModal(member);
                        }}
                      >
                        <Ionicons
                          name="swap-horizontal-outline"
                          size={14}
                          color="#1a73e8"
                        />

                        <Text style={styles.editPaymentButtonText}>
                          Change Payment Status
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Keep original UI for Payment Details Updated */}
                  {(isApartment || isStaff) && hasMatchingHistory && (
                    <View style={styles.detailsHistory}>
                      {member.detailsHistory
                        .filter(
                          (snapshot: any) =>
                            snapshot.changeSummary &&
                            snapshot.effectiveMonth === selectedMonth,
                        )
                        .map((snapshot: any) => {
                          const fullDate =
                            snapshot.effectiveMonth.length === 7
                              ? `${snapshot.effectiveMonth}-01`
                              : snapshot.effectiveMonth;

                          return (
                            <Text
                              key={snapshot.effectiveMonth}
                              style={styles.detailsHistoryText}
                            >
                              Payment Details Updated at{" "}
                              {formatFullDate(fullDate)}
                            </Text>
                          );
                        })}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* MONTH PICKER */}

      <MonthYearPickerModal
        visible={showMonthPicker}
        value={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onSelect={setSelectedMonth}
      />

      {/* PAYMENT MODAL */}

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
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>Payment Details</Text>

                <Text style={styles.paymentMemberName} numberOfLines={1}>
                  {paymentMember?.name}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setPaymentMember(null)}
              >
                <Ionicons name="close" size={21} color="#666" />
              </TouchableOpacity>
            </View>

            {/* SCROLLABLE CONTENT */}

            <ScrollView
              style={styles.paymentScroll}
              contentContainerStyle={styles.paymentScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.paymentForRow}>
                <Text style={styles.paymentForLabel}>Payment for</Text>

                <Text style={styles.paymentForMonth}>
                  {formatMonth(selectedMonth || paidDate.slice(0, 7))}
                </Text>
              </View>

              {/* PAYMENT STATUS */}

              <Text style={styles.paymentLabel}>Payment Status</Text>

              <TouchableOpacity
                style={styles.changeStatusButton}
                onPress={() => setShowChangeStatusModal(true)}
                activeOpacity={0.75}
              >
                <View style={styles.changeStatusLeft}>
                  <View
                    style={[
                      styles.changeStatusIcon,
                      paymentStatus === "paid"
                        ? styles.changeStatusIconPaid
                        : styles.changeStatusIconDue,
                    ]}
                  >
                    <Ionicons
                      name={
                        paymentStatus === "paid" ? "checkmark-circle" : "time"
                      }
                      size={19}
                      color={paymentStatus === "paid" ? "#16803a" : "#dc2626"}
                    />
                  </View>

                  <View>
                    <Text style={styles.changeStatusTitle}>
                      Change Payment Status
                    </Text>

                    <Text
                      style={[
                        styles.changeStatusCurrent,
                        paymentStatus === "paid"
                          ? styles.statusPaidText
                          : styles.statusDueText,
                      ]}
                    >
                      Currently {paymentStatus === "paid" ? "Paid" : "Due"}
                    </Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={19} color="#999" />
              </TouchableOpacity>

              {/* AMOUNT */}

              <Text style={styles.paymentLabel}>
                {isApartment ? "Maintenance Amount" : "Salary Amount"}
              </Text>

              <View style={styles.amountDisplay}>
                <Text style={styles.amountText}>₹{paymentAmount || 0}</Text>
              </View>

              {/* ADDITIONAL AMOUNT - Available for BOTH Paid and Due */}
              <TouchableOpacity
                style={styles.additionalButton}
                onPress={() => {
                  setShowAdditionalAmount(!showAdditionalAmount);

                  if (showAdditionalAmount) {
                    setAdditionalAmount("");
                    setAdditionalNote("");
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    showAdditionalAmount
                      ? "remove-circle-outline"
                      : "add-circle-outline"
                  }
                  size={18}
                  color={showAdditionalAmount ? "#dc2626" : "#1a73e8"}
                />

                <Text
                  style={[
                    styles.additionalButtonText,
                    showAdditionalAmount && styles.removeAdditionalButtonText,
                  ]}
                >
                  {showAdditionalAmount
                    ? "Remove additional amount"
                    : "Add additional amount"}
                </Text>
              </TouchableOpacity>

              {showAdditionalAmount && (
                <>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Additional amount"
                    keyboardType="numeric"
                    value={additionalAmount}
                    onChangeText={(value) =>
                      setAdditionalAmount(value.replace(/[^0-9]/g, ""))
                    }
                  />

                  <TextInput
                    style={styles.modalInput}
                    placeholder="Note, e.g. bonus or event work"
                    value={additionalNote}
                    onChangeText={setAdditionalNote}
                  />
                </>
              )}

              {/* DEDUCTION - Available for BOTH Paid and Due */}
              <TouchableOpacity
                style={styles.additionalButton}
                onPress={() => {
                  setShowDeduction(!showDeduction);

                  if (showDeduction) {
                    setDeductionAmount("");
                    setDeductionNote("");
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={18}
                  color={showDeduction ? "#dc2626" : "#1a73e8"}
                />

                <Text
                  style={[
                    styles.additionalButtonText,
                    showDeduction && styles.removeAdditionalButtonText,
                  ]}
                >
                  {showDeduction ? "Remove deduction" : "Less deduction"}
                </Text>
              </TouchableOpacity>

              {showDeduction && (
                <>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Deduction amount"
                    keyboardType="numeric"
                    value={deductionAmount}
                    onChangeText={(value) =>
                      setDeductionAmount(value.replace(/[^0-9]/g, ""))
                    }
                  />

                  <TextInput
                    style={styles.modalInput}
                    placeholder="Note, e.g. advance or absence"
                    value={deductionNote}
                    onChangeText={setDeductionNote}
                  />
                </>
              )}

              {/* NET PAID - Available for BOTH Paid and Due */}
              <View style={styles.netPaidRow}>
                <Text style={styles.netPaidLabel}>
                  {paymentStatus === "paid" ? "Net Paid" : "Amount to Pay"}
                </Text>

                <Text style={styles.amountText}>₹{netPaidAmount}</Text>
              </View>

              {/* PAID DATE - Only shows when status is Paid */}
              {paymentStatus === "paid" && (
                <>
                  <Text style={styles.paymentLabel}>Paid Date</Text>

                  <TouchableOpacity
                    style={styles.dateSelector}
                    onPress={() => setShowPaidDatePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dateSelectorText}>{paidDate}</Text>

                    <Ionicons
                      name="calendar-outline"
                      size={19}
                      color="#1a73e8"
                    />
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.paymentScrollBottom} />
            </ScrollView>

            {/* FIXED ACTIONS */}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelPaymentButton}
                onPress={() => setPaymentMember(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelPaymentText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmPaymentButton,
                  paymentStatus === "due" && styles.confirmDueButton,
                ]}
                onPress={
                  paymentStatus === "paid"
                    ? markPaymentAsPaid
                    : markPaymentAsDue
                }
                activeOpacity={0.8}
              >
                <Ionicons
                  name={
                    paymentStatus === "paid"
                      ? "checkmark-circle-outline"
                      : "time-outline"
                  }
                  size={18}
                  color="#fff"
                />

                <Text style={styles.confirmPaymentText}>
                  {paymentStatus === "paid" ? "Save as Paid" : "Save as Due"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* CHANGE PAYMENT STATUS MODAL */}

        <Modal
          transparent
          animationType="fade"
          visible={showChangeStatusModal}
          onRequestClose={() => setShowChangeStatusModal(false)}
        >
          <View style={styles.statusModalOverlay}>
            <View style={styles.statusModal}>
              <View style={styles.statusModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusModalTitle}>
                    Change Payment Status
                  </Text>

                  <Text style={styles.statusModalSubtitle}>
                    Select the new payment status
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setShowChangeStatusModal(false)}
                >
                  <Ionicons name="close" size={21} color="#666" />
                </TouchableOpacity>
              </View>

              {/* MARK AS PAID */}

              <TouchableOpacity
                style={[styles.statusActionButton, styles.statusActionPaid]}
                onPress={markPaymentAsPaid}
                activeOpacity={0.75}
              >
                <View
                  style={[styles.statusActionIcon, styles.statusActionIconPaid]}
                >
                  <Ionicons name="checkmark-circle" size={23} color="#16803a" />
                </View>

                <View style={styles.statusActionInfo}>
                  <Text style={styles.statusActionTitle}>Mark as Paid</Text>

                  <Text style={styles.statusActionSubtitle}>
                    Payment has been received
                  </Text>
                </View>

                {paymentStatus === "paid" && (
                  <Ionicons name="checkmark" size={21} color="#16803a" />
                )}
              </TouchableOpacity>

              {/* MARK AS DUE */}

              <TouchableOpacity
                style={[styles.statusActionButton, styles.statusActionDue]}
                onPress={markPaymentAsDue}
                activeOpacity={0.75}
              >
                <View
                  style={[styles.statusActionIcon, styles.statusActionIconDue]}
                >
                  <Ionicons name="time" size={23} color="#dc2626" />
                </View>

                <View style={styles.statusActionInfo}>
                  <Text style={styles.statusActionTitle}>Mark as Due</Text>

                  <Text style={styles.statusActionSubtitle}>
                    Payment is still pending
                  </Text>
                </View>

                {paymentStatus === "due" && (
                  <Ionicons name="checkmark" size={21} color="#dc2626" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statusCancelButton}
                onPress={() => setShowChangeStatusModal(false)}
              >
                <Text style={styles.statusCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Modal>

      {/* DATE PICKER */}

      <DatePickerModal
        visible={showPaidDatePicker}
        value={paidDate}
        onClose={() => setShowPaidDatePicker(false)}
        onSelect={setPaidDate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f8fa",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },

  monthNavContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe7f8",
  },

  monthFilter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe7f8",
  },

  monthFilterText: {
    color: "#1a73e8",
    fontSize: 13,
    fontWeight: "600",
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: "#e7ebf3",
  },

  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 9,
  },

  tabActive: {
    backgroundColor: "#eaf3ff",
  },

  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
  },

  tabTextActive: {
    color: "#1a73e8",
  },

  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  countLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },

  addButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },

  addButtonSmallText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  membersList: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7ebf3",
    padding: 8,
  },

  memberPaymentCard: {
    marginBottom: 6,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#f9fafb",
  },

  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
  },

  memberIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  memberIconExpense: {
    backgroundColor: "#16a34a",
  },

  memberInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },

  memberPhoto: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },

  memberInfo: {
    flex: 1,
  },

  memberTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },

  memberName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
    flexShrink: 1,
  },

  memberSubtitle: {
    fontSize: 12,
    color: "#888",
  },

  roleBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4f46e5",
  },

  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },

  statusPaid: {
    backgroundColor: "#dcfce7",
  },

  statusDue: {
    backgroundColor: "#fee2e2",
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },

  statusPaidText: {
    color: "#16a34a",
  },

  statusDueText: {
    color: "#dc2626",
  },

  inlineStatusBadge: {
    marginRight: 0,
  },

  editPaymentButton: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    alignSelf: "flex-start",
    marginLeft: 60,
    marginTop: -6,
    marginBottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },

  editPaymentButtonText: {
    color: "#1a73e8",
    fontSize: 10,
    fontWeight: "700",
  },

  paymentActions: {
    alignSelf: "flex-start",
  },

  staffActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    marginLeft: 60,
    marginTop: -6,
  },

  rowActionButton: {
    marginBottom: 0,
    marginLeft: 0,
    marginTop: 0,
  },

  attendanceButton: {
    alignSelf: "flex-start",
    alignItems: "center",
    borderColor: "#9ec5fe",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    marginLeft: 60,
    marginTop: -6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },

  attendanceButtonText: {
    color: "#1a73e8",
    fontSize: 10,
    fontWeight: "700",
  },

  detailsHistory: {
    marginLeft: 50,
    marginTop: 4,
    marginBottom: 8,
  },

  detailsHistoryText: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
  },

  /* =========================
     PAYMENT MODAL
     ========================= */

  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },

  paymentModal: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
  },

  paymentModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },

  paymentTitle: {
    color: "#111",
    fontSize: 19,
    fontWeight: "700",
  },

  paymentMemberName: {
    color: "#666",
    fontSize: 13,
    marginTop: 3,
  },

  closeModalButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f5f7",
  },

  paymentScroll: {
    flexGrow: 0,
  },

  paymentScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  paymentScrollBottom: {
    height: 20,
  },

  paymentForRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },

  paymentForLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
  },

  paymentForMonth: {
    color: "#1a73e8",
    fontSize: 13,
    fontWeight: "700",
  },

  paymentLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 7,
  },

  amountDisplay: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: "#f4f8fe",
  },

  amountText: {
    color: "#111",
    fontSize: 17,
    fontWeight: "700",
  },

  /* CHANGE STATUS BUTTON */

  changeStatusButton: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#dbe3ee",
    borderRadius: 10,
    backgroundColor: "#fff",
  },

  changeStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  changeStatusIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  changeStatusIconPaid: {
    backgroundColor: "#dcfce7",
  },

  changeStatusIconDue: {
    backgroundColor: "#fee2e2",
  },

  changeStatusTitle: {
    color: "#222",
    fontSize: 14,
    fontWeight: "700",
  },

  changeStatusCurrent: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  /* ADDITIONAL / DEDUCTION */

  additionalButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    marginTop: 16,
    paddingVertical: 6,
  },

  additionalButtonText: {
    color: "#1a73e8",
    fontSize: 14,
    fontWeight: "600",
  },

  removeAdditionalButtonText: {
    color: "#dc2626",
  },

  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: "#dde3ea",
    borderRadius: 8,
    paddingHorizontal: 13,
    fontSize: 14,
    marginTop: 10,
    backgroundColor: "#fff",
  },

  /* NET */

  netPaidRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },

  netPaidLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
  },

  /* DATE */

  dateSelector: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#dde3ea",
    borderRadius: 8,
    paddingHorizontal: 13,
  },

  dateSelectorText: {
    color: "#333",
    fontSize: 14,
  },

  /* FIXED BOTTOM */

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    backgroundColor: "#fff",
  },

  cancelPaymentButton: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  cancelPaymentText: {
    color: "#555",
    fontWeight: "600",
  },

  confirmPaymentButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: "#16803a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  confirmDueButton: {
    backgroundColor: "#dc2626",
  },

  confirmPaymentText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  /* =========================
     CHANGE STATUS MODAL
     ========================= */

  statusModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },

  statusModal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },

  statusModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  statusModalTitle: {
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
  },

  statusModalSubtitle: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
  },

  statusActionButton: {
    minHeight: 70,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  statusActionPaid: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },

  statusActionDue: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },

  statusActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  statusActionIconPaid: {
    backgroundColor: "#dcfce7",
  },

  statusActionIconDue: {
    backgroundColor: "#fee2e2",
  },

  statusActionInfo: {
    flex: 1,
  },

  statusActionTitle: {
    color: "#222",
    fontSize: 14,
    fontWeight: "700",
  },

  statusActionSubtitle: {
    color: "#777",
    fontSize: 12,
    marginTop: 3,
  },

  statusCancelButton: {
    alignItems: "center",
    paddingVertical: 11,
    marginTop: 4,
  },

  statusCancelText: {
    color: "#555",
    fontSize: 14,
    fontWeight: "600",
  },

  /* EMPTY */

  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },

  emptyStateText: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 10,
  },

  createButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },

  createButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

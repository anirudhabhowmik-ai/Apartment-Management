import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DatePickerModal from "../../components/DatePickerModal";
import MonthYearPickerModal from "../../components/MonthYearPickerModal";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { useMemberStore } from "../../store/memberStore";
import { GroupType } from "../../types";

const getTabLabel = (
  type: GroupType,
  accountType?: "apartment" | "home",
): string => {
  if (type === "apartment") {
    return accountType === "home" ? "Tenant" : "Apartment";
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
    return accountType === "home" ? "Add Tenant" : "Add Owner";
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
  if (!month || !member.detailsHistory?.length) return member;

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
  if (!month) return { status: "due" as const };
  if (member.monthlyPayments?.[month]) return member.monthlyPayments[month];
  if (member.paidDate?.slice(0, 7) === month) {
    return {
      status: member.paymentStatus || "due",
      paidDate: member.paidDate,
      additionalAmount: member.additionalAmount,
      deductionAmount: member.deductionAmount,
    };
  }
  return { status: "due" as const };
};

const formatMonth = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleString("default", {
    month: "short",
    year: "numeric",
  });

export default function PeopleScreen() {
  const router = useRouter();
  const { tab, memberId } = useLocalSearchParams<{
    tab?: GroupType;
    memberId?: string;
  }>();
  const { selectedAccountId, selectedAccount } = useAccounts();
  const { groups, createGroup } = useGroups(selectedAccountId);
  const { getMembersByGroup, updateMember } = useMemberStore();

  const tabTypes: GroupType[] = ["apartment", "staff", "expense"];
  const [activeTab, setActiveTab] = useState<GroupType>("apartment");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    new Date().toISOString().slice(0, 7),
  );
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [paymentMember, setPaymentMember] = useState<any>(null);
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
        params: { groupId: existingGroup.id, groupType: type },
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
      params: { groupId: newGroup.id, groupType: type },
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
      : paymentMember.monthlySalary
    : 0;
  const netPaidAmount =
    paymentAmount +
    (showAdditionalAmount ? Number(additionalAmount) || 0 : 0) -
    (showDeduction ? Number(deductionAmount) || 0 : 0);

  const openPaymentModal = (member: any) => {
    setPaymentMember(member);
    setPaidDate(
      selectedMonth
        ? `${selectedMonth}-01`
        : new Date().toISOString().slice(0, 10),
    );
    setShowAdditionalAmount(false);
    setAdditionalAmount("");
    setAdditionalNote("");
    setShowDeduction(false);
    setDeductionAmount("");
    setDeductionNote("");
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

  const markAsPaid = () => {
    if (!paymentMember) return;
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
        [selectedMonth || paidDate.slice(0, 7)]: {
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
    setPaymentMember(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity
          style={styles.monthFilter}
          onPress={() => setShowMonthPicker(true)}
        >
          <Ionicons name="calendar-outline" size={18} color="#1a73e8" />
          <Text style={styles.monthFilterText}>
            {selectedMonth
              ? new Date(`${selectedMonth}-01T00:00:00`).toLocaleString(
                  "default",
                  { month: "short", year: "numeric" },
                )
              : "All months"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Bar (no count here anymore) */}
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

      <ScrollView contentContainerStyle={styles.listContent}>
        {/* Count on left, small Add button on right */}
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
              const basePaymentAmount = isApartment
                ? member.maintenanceAmount || 0
                : member.monthlySalary || 0;
              const monthlyPayment = getPaymentForMonth(member, selectedMonth);
              const statusPaymentAmount =
                monthlyPayment.status === "paid"
                  ? basePaymentAmount +
                    (monthlyPayment.additionalAmount || 0) -
                    (monthlyPayment.deductionAmount || 0)
                  : basePaymentAmount;

              return (
                <View key={member.id} style={styles.memberPaymentCard}>
                  <TouchableOpacity
                    key={member.id}
                    style={styles.memberItem}
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
                          source={{ uri: member.photoUri }}
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
                          (monthlyPayment.status === "paid" ? (
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
                  </TouchableOpacity>
                  {(isApartment || isStaff) &&
                  monthlyPayment.status !== "paid" ? (
                    <TouchableOpacity
                      style={styles.markPaidButton}
                      onPress={() => openPaymentModal(member)}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={14}
                        color="#16803a"
                      />
                      <Text style={styles.markPaidButtonText}>
                        Mark as Paid
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {(isApartment || isStaff) &&
                  monthlyPayment.status === "paid" ? (
                    <TouchableOpacity
                      style={styles.editPaymentButton}
                      onPress={() =>
                        router.push({
                          pathname: "/(modals)/mark-payment",
                          params: {
                            accountId: selectedAccountId || "",
                            memberId: member.id,
                            type: isApartment ? "maintenance" : "salary",
                            mode: "edit",
                            month: selectedMonth || "",
                          },
                        })
                      }
                    >
                      <Ionicons
                        name="create-outline"
                        size={14}
                        color="#1a73e8"
                      />
                      <Text style={styles.editPaymentButtonText}>
                        Edit Payment Details
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {(isApartment || isStaff) &&
                  member.detailsHistory?.some(
                    (snapshot: any) => snapshot.changeSummary,
                  ) ? (
                    <View style={styles.detailsHistory}>
                      {member.detailsHistory
                        .filter((snapshot: any) => snapshot.changeSummary)
                        .map((snapshot: any) => (
                          <Text
                            key={snapshot.effectiveMonth}
                            style={styles.detailsHistoryText}
                          >
                            {snapshot.changeSummary} from{" "}
                            {formatMonth(snapshot.effectiveMonth)}
                          </Text>
                        ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      <MonthYearPickerModal
        visible={showMonthPicker}
        value={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onSelect={setSelectedMonth}
      />
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(paymentMember)}
        onRequestClose={() => setPaymentMember(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            <Text style={styles.paymentTitle}>Mark as Paid</Text>
            <Text style={styles.paymentMemberName}>{paymentMember?.name}</Text>
            <View style={styles.paymentForRow}>
              <Text style={styles.paymentForLabel}>Paid for</Text>
              <Text style={styles.paymentForMonth}>
                {formatMonth(selectedMonth || paidDate.slice(0, 7))}
              </Text>
            </View>

            <Text style={styles.paymentLabel}>
              {isApartment ? "Maintenance Amount" : "Salary Amount"}
            </Text>
            <View style={styles.amountDisplay}>
              <Text style={styles.amountText}>₹{paymentAmount || 0}</Text>
            </View>

            <TouchableOpacity
              style={styles.additionalButton}
              onPress={() => {
                setShowAdditionalAmount(!showAdditionalAmount);
                if (showAdditionalAmount) {
                  setAdditionalAmount("");
                  setAdditionalNote("");
                }
              }}
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
            {showAdditionalAmount ? (
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
            ) : null}

            <TouchableOpacity
              style={styles.additionalButton}
              onPress={() => {
                setShowDeduction(!showDeduction);
                if (showDeduction) {
                  setDeductionAmount("");
                  setDeductionNote("");
                }
              }}
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
            {showDeduction ? (
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
            ) : null}

            <View style={styles.netPaidRow}>
              <Text style={styles.netPaidLabel}>Net Paid</Text>
              <Text style={styles.amountText}>₹{netPaidAmount}</Text>
            </View>

            <Text style={styles.paymentLabel}>Paid Date</Text>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setShowPaidDatePicker(true)}
            >
              <Text style={styles.dateSelectorText}>{paidDate}</Text>
              <Ionicons name="calendar-outline" size={19} color="#1a73e8" />
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelPaymentButton}
                onPress={() => setPaymentMember(null)}
              >
                <Text style={styles.cancelPaymentText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmPaymentButton}
                onPress={markAsPaid}
              >
                <Text style={styles.confirmPaymentText}>Confirm Payment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#111" },
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
  monthFilterText: { color: "#1a73e8", fontSize: 13, fontWeight: "600" },

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

  listContent: { padding: 16, paddingBottom: 40 },

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
  memberInfo: { flex: 1 },
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
  memberSubtitle: { fontSize: 12, color: "#888" },
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
  statusPaid: { backgroundColor: "#dcfce7" },
  statusDue: { backgroundColor: "#fee2e2" },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  statusPaidText: { color: "#16a34a" },
  statusDueText: { color: "#dc2626" },
  inlineStatusBadge: { marginRight: 0 },
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
  markPaidButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#86d6a1",
    borderRadius: 8,
    marginLeft: 60,
    marginTop: -6,
    marginBottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "#f0fdf4",
  },
  markPaidButtonText: { color: "#16803a", fontSize: 10, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  paymentModal: {
    width: "100%",
    maxWidth: 380,
    padding: 20,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  paymentTitle: { color: "#111", fontSize: 19, fontWeight: "700" },
  paymentMemberName: { color: "#666", fontSize: 14, marginTop: 4 },
  paymentForRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  paymentForLabel: { color: "#555", fontSize: 13, fontWeight: "600" },
  paymentForMonth: { color: "#1a73e8", fontSize: 13, fontWeight: "700" },
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
  amountText: { color: "#111", fontSize: 17, fontWeight: "700" },
  detailsHistory: { marginLeft: 50, marginTop: 4 },
  detailsHistoryText: { color: "#666", fontSize: 12 },
  netPaidRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  netPaidLabel: { color: "#555", fontSize: 13, fontWeight: "600" },
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
  dateSelectorText: { color: "#333", fontSize: 14 },
  additionalButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    marginTop: 16,
    paddingVertical: 6,
  },
  additionalButtonText: { color: "#1a73e8", fontSize: 14, fontWeight: "600" },
  removeAdditionalButtonText: { color: "#dc2626" },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: "#dde3ea",
    borderRadius: 8,
    paddingHorizontal: 13,
    fontSize: 14,
    marginTop: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
  },
  cancelPaymentButton: { paddingHorizontal: 14, paddingVertical: 11 },
  cancelPaymentText: { color: "#555", fontWeight: "600" },
  confirmPaymentButton: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 7,
    backgroundColor: "#16803a",
  },
  confirmPaymentText: { color: "#fff", fontWeight: "700" },

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

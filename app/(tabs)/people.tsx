import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

export default function PeopleScreen() {
  const router = useRouter();
  const { selectedAccountId, selectedAccount } = useAccounts();
  const { groups, createGroup } = useGroups(selectedAccountId);
  const { getMembersByGroup } = useMemberStore();

  const tabTypes: GroupType[] = ["apartment", "staff", "expense"];
  const [activeTab, setActiveTab] = useState<GroupType>("apartment");

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
  const activeMembers = activeGroups.flatMap((group) =>
    getMembersByGroup(group.id),
  );

  const isApartment = activeTab === "apartment";
  const isStaff = activeTab === "staff";
  const isExpense = activeTab === "expense";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
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
            {activeMembers.map((member: any) => (
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
                  ) : (
                    <Text style={styles.memberInitial}>
                      {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>

                <View style={styles.memberInfo}>
                  <View style={styles.memberTitleRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {isExpense ? member.category || member.name : member.name}
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
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#111" },

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

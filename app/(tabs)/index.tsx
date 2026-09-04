import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { useMemberStore } from "../../store/memberStore";
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

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

const QUICK_ACTIONS: QuickAction[] = [
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

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

function formatCurrency(amount: number) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return `₹${Math.abs(safeAmount).toLocaleString("en-IN")}`;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good Morning";
  }

  if (hour < 17) {
    return "Good Afternoon";
  }

  return "Good Evening";
}

function getCurrentMonth() {
  return new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getRoleColor(role?: string) {
  if (!role) {
    return ROLE_COLORS.other;
  }

  return ROLE_COLORS[role.toLowerCase()] || ROLE_COLORS.other;
}

function getRoleLabel(role?: string) {
  if (!role) {
    return "Staff";
  }

  return ROLE_LABELS[role.toLowerCase()] || role;
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
        style={[
          styles.statIconContainer,
          {
            backgroundColor: `${color}12`,
          },
        ]}
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
          {
            backgroundColor: `${action.color}12`,
          },
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
          {
            backgroundColor: `${action.color}10`,
          },
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
      <View
        style={[
          styles.staffAvatar,
          {
            backgroundColor: `${roleColor}12`,
          },
        ]}
      >
        <Text
          style={[
            styles.staffInitial,
            {
              color: roleColor,
            },
          ]}
        >
          {initial}
        </Text>
      </View>

      <View style={styles.staffInfo}>
        <Text style={styles.staffName} numberOfLines={1}>
          {name || "Unnamed Staff"}
        </Text>

        <View style={styles.staffRoleRow}>
          <View
            style={[
              styles.roleDot,
              {
                backgroundColor: roleColor,
              },
            ]}
          />

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
      <View
        style={[
          styles.financialIcon,
          {
            backgroundColor: background,
          },
        ]}
      >
        <Ionicons name={icon} size={17} color={color} />
      </View>

      <Text style={styles.financialLabel}>{title}</Text>

      <Text
        style={[
          styles.financialAmount,
          {
            color,
          },
        ]}
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

  const [refreshing, setRefreshing] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* DASHBOARD DATA                                                           */
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

    if (!selectedAccount) {
      return emptyData;
    }

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
  }, [selectedAccount, groups, members]);

  const stats = dashboardData.stats;
  const recentStaff = dashboardData.recentStaff;

  /* ------------------------------------------------------------------------ */
  /* NET BALANCE                                                              */
  /* ------------------------------------------------------------------------ */

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
  /* QUICK ACTION                                                             */
  /* ------------------------------------------------------------------------ */

  const handleQuickAction = (action: QuickAction) => {
    router.push({
      pathname: "/(tabs)/people",
      params: {
        tab: action.tab,
      },
    });
  };

  /* ------------------------------------------------------------------------ */
  /* STAFF                                                                    */
  /* ------------------------------------------------------------------------ */

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
                onPress={() => router.push("/(modals)/add-account")}
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
                onPress={() => router.push("/(modals)/add-account")}
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

  /* ------------------------------------------------------------------------ */
  /* MAIN DASHBOARD                                                           */
  /* ------------------------------------------------------------------------ */

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
        {/* ================================================================== */}
        {/* HEADER                                                             */}
        {/* ================================================================== */}

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

        {/* ================================================================== */}
        {/* NET BALANCE                                                        */}
        {/* ================================================================== */}

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
              {
                color: isPositiveBalance ? "#15803D" : "#DC2626",
              },
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
              <View
                style={[
                  styles.miniDot,
                  {
                    backgroundColor: "#16A34A",
                  },
                ]}
              />

              <View>
                <Text style={styles.miniLabel}>Income</Text>

                <Text style={styles.miniValue}>
                  {formatCurrency(stats.monthlyIncome)}
                </Text>
              </View>
            </View>

            <View style={styles.balanceMiniItem}>
              <View
                style={[
                  styles.miniDot,
                  {
                    backgroundColor: "#EA580C",
                  },
                ]}
              />

              <View>
                <Text style={styles.miniLabel}>Expenses</Text>

                <Text style={styles.miniValue}>
                  {formatCurrency(stats.monthlyExpense)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ================================================================== */}
        {/* OVERVIEW                                                           */}
        {/* ================================================================== */}

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

        {/* ================================================================== */}
        {/* QUICK ACTIONS                                                      */}
        {/* ================================================================== */}

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
            {QUICK_ACTIONS.map((action) => (
              <QuickActionCard
                key={action.id}
                action={action}
                onPress={() => handleQuickAction(action)}
              />
            ))}
          </View>
        </View>

        {/* ================================================================== */}
        {/* FINANCIAL SUMMARY                                                  */}
        {/* ================================================================== */}

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

        {/* ================================================================== */}
        {/* RECENT STAFF                                                       */}
        {/* ================================================================== */}

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
                    params: {
                      tab: "staff",
                    },
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

  /* ====================================================================== */
  /* LOADING                                                                */
  /* ====================================================================== */

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

  loadingSpinner: {
    marginTop: 22,
  },

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

  /* ====================================================================== */
  /* HEADER                                                                 */
  /* ====================================================================== */

  header: {
    marginBottom: 16,
  },

  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  headerTextContainer: {
    flex: 1,
  },

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

  monthText: {
    fontSize: 12,
    color: "#94A3B8",
  },

  /* ====================================================================== */
  /* BALANCE                                                                */
  /* ====================================================================== */

  balanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",

    shadowColor: "#0F172A",
    shadowOffset: {
      width: 0,
      height: 8,
    },
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

  balancePeriod: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 3,
  },

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

  /* ====================================================================== */
  /* SECTIONS                                                               */
  /* ====================================================================== */

  section: {
    marginBottom: 25,
  },

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

  /* ====================================================================== */
  /* STATS                                                                  */
  /* ====================================================================== */

  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },

  statCard: {
    flex: 1,
    minHeight: 135,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",

    shadowColor: "#0F172A",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 2,
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

  statDescription: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },

  /* ====================================================================== */
  /* QUICK ACTIONS                                                          */
  /* ====================================================================== */

  quickActions: {
    gap: 10,
  },

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

  quickActionContent: {
    flex: 1,
  },

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

  /* ====================================================================== */
  /* FINANCIAL                                                              */
  /* ====================================================================== */

  financialGrid: {
    flexDirection: "row",
    gap: 10,
  },

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

  /* ====================================================================== */
  /* STAFF                                                                  */
  /* ====================================================================== */

  staffList: {
    gap: 9,
  },

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

  staffInitial: {
    fontSize: 17,
    fontWeight: "800",
  },

  staffInfo: {
    flex: 1,
  },

  staffName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  staffRoleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },

  staffRole: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },

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

  staffEmptyContent: {
    flex: 1,
  },

  staffEmptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },

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

  /* ====================================================================== */
  /* EMPTY ACCOUNT                                                          */
  /* ====================================================================== */

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
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
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

  /* ====================================================================== */
  /* COMMON                                                                 */
  /* ====================================================================== */

  pressed: {
    opacity: 0.72,
  },

  bottomSpace: {
    height: 20,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { useMaintenance } from "../../hooks/useMaintenance";
import { usePayments } from "../../hooks/usePayments";
import { useMemberStore } from "../../store/memberStore";

// Quick Action Component
interface QuickAction {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: string;
  params?: Record<string, any>;
}

// ✅ Simplified Quick Actions - Only Add Staff and Add Expenses
const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add_staff",
    title: "Add Staff",
    icon: "person-add-outline",
    color: "#4CAF50",
    route: "/(modals)/add-member",
  },
  {
    id: "add_expense",
    title: "Add Expense",
    icon: "cash-outline",
    color: "#1a73e8",
    route: "/(modals)/record-payment",
    params: { category: "expense" },
  },
];

// Stat Card Component Props
interface StatCardProps {
  title: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  subtitle?: string;
  onPress?: () => void;
}

function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
  onPress,
}: StatCardProps) {
  return (
    <TouchableOpacity
      style={[styles.statCard, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.statHeader}>
        <View style={[styles.statIcon, { backgroundColor: color + "20" }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </TouchableOpacity>
  );
}

// ✅ Staff Card for Recent Staff
function StaffCard({
  name,
  role,
  onPress,
}: {
  name: string;
  role: string;
  onPress?: () => void;
}) {
  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      sweeper: "#9C27B0",
      security: "#F44336",
      maintenance: "#FF9800",
      maid: "#4CAF50",
      driver: "#2196F3",
      cook: "#795548",
      gardener: "#8BC34A",
      other: "#757575",
    };
    return colors[role] || "#666";
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      sweeper: "Sweeper",
      security: "Security",
      maintenance: "Maintenance",
      maid: "Maid",
      driver: "Driver",
      cook: "Cook",
      gardener: "Gardener",
      other: "Staff",
    };
    return labels[role] || role;
  };

  return (
    <TouchableOpacity style={styles.staffCard} onPress={onPress}>
      <View
        style={[
          styles.staffAvatar,
          { backgroundColor: getRoleColor(role) + "20" },
        ]}
      >
        <Text style={[styles.staffInitial, { color: getRoleColor(role) }]}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.staffInfo}>
        <Text style={styles.staffName}>{name}</Text>
        <Text style={styles.staffRole}>{getRoleLabel(role)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();

  const {
    accounts,
    selectedAccount,
    isLoading: accountsLoading,
  } = useAccounts();

  // ✅ Only using groups if needed - removed unused staffGroups
  const { groups } = useGroups(selectedAccount?.id || null);
  const { tasks } = useMaintenance(selectedAccount?.id);
  const { payments, getPendingPayments, getMonthlySummary } = usePayments(
    selectedAccount?.id,
  );

  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalProperties: 0, // apartments for apartment account, tenants for home account
    totalStaff: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
  });
  const [recentStaff, setRecentStaff] = useState<any[]>([]);

  // Load data when current account changes
  useEffect(() => {
    if (selectedAccount) {
      loadDashboardData();
    }
  }, [selectedAccount, payments, tasks, groups]);

  const loadDashboardData = async () => {
    try {
      // Get monthly summary
      const monthlySummary = getMonthlySummary?.();

      // Get apartment/tenant count from members in apartment group
      const apartmentGroup = groups.find((g) => g.type === "apartment");
      const { getMembersByGroup } = useMemberStore.getState();
      const apartmentMembers = apartmentGroup
        ? getMembersByGroup(apartmentGroup.id)
        : [];
      const apartmentCount = apartmentMembers.length;

      // ✅ TODO: Get actual staff count from members
      // For now using mock data
      const mockStaff = [
        { name: "Ramesh Singh", role: "security" },
        { name: "Lakshmi Bai", role: "sweeper" },
        { name: "Anita Devi", role: "maid" },
        { name: "Suresh Kumar", role: "driver" },
      ];

      setStats({
        totalProperties: apartmentCount,
        totalStaff: mockStaff.length, // Will be replaced with actual data
        monthlyIncome: monthlySummary?.totalIncome || 0,
        monthlyExpense: monthlySummary?.totalExpense || 0,
      });

      setRecentStaff(mockStaff);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.route) {
      router.push({
        pathname: action.route as any,
        params: {
          ...action.params,
          accountId: selectedAccount?.id || "",
        },
      });
    }
  };

  const handleStaffPress = (staff: any) => {
    router.push({
      pathname: "/(modals)/edit-member",
      params: {
        memberId: staff.id || "",
        groupId: "",
      },
    });
  };

  const handleStatPress = (statType: string) => {
    switch (statType) {
      case "properties":
        // Navigate to People tab to see apartments/tenants
        router.push("/(tabs)/people");
        break;
      case "staff":
        router.push("/(tabs)/people");
        break;
      default:
        break;
    }
  };

  if (accountsLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
          <Text style={styles.loadingText}>Loading your homes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.emptyStateContainer}>
            <Ionicons name="business-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Property Selected</Text>
            <Text style={styles.emptySubtitle}>
              {accounts.length > 0
                ? "Select a property to continue"
                : "Create a property to get started"}
            </Text>
            <TouchableOpacity
              style={styles.createPropertyButton}
              onPress={() =>
                router.push(
                  accounts.length > 0
                    ? "/(modals)/switch-account"
                    : "/(modals)/add-account",
                )
              }
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.createPropertyText}>
                {accounts.length > 0 ? "Select Property" : "Create Property"}
              </Text>
            </TouchableOpacity>
            {accounts.length > 0 && (
              <TouchableOpacity
                style={styles.switchPropertyButton}
                onPress={() => router.push("/(modals)/switch-account")}
              >
                <Text style={styles.switchPropertyText}>Switch Property</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header - Simple Greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}! 👋</Text>
            <Text style={styles.subGreeting}>
              Welcome back to your dashboard
            </Text>
          </View>
        </View>

        {/* ✅ Stats Grid - Dynamic based on account type */}
        <View style={styles.statsGrid}>
          <StatCard
            title={
              selectedAccount?.type === "apartment" ? "Apartments" : "Tenants"
            }
            value={stats.totalProperties}
            icon={
              selectedAccount?.type === "apartment"
                ? "business-outline"
                : "home-outline"
            }
            color="#1a73e8"
            onPress={() => handleStatPress("properties")}
          />
          <StatCard
            title="Staff"
            value={stats.totalStaff}
            icon="people-outline"
            color="#4CAF50"
            onPress={() => handleStatPress("staff")}
          />
        </View>

        {/* ✅ Quick Actions - Only Add Staff and Add Expenses */}
        <View style={styles.quickActionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.quickActionItem}
                onPress={() => handleQuickAction(action)}
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: action.color + "15" },
                  ]}
                >
                  <Ionicons name={action.icon} size={28} color={action.color} />
                </View>
                <Text style={styles.quickActionTitle}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ✅ Financial Summary */}
        <View style={styles.financialSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Financial Summary</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/finance")}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.financialCards}>
            <View style={styles.financialCard}>
              <Text style={styles.financialLabel}>Income</Text>
              <Text style={[styles.financialAmount, styles.incomeText]}>
                ₹{stats.monthlyIncome.toLocaleString()}
              </Text>
              <Text style={styles.financialPeriod}>This Month</Text>
            </View>
            <View style={styles.financialCard}>
              <Text style={styles.financialLabel}>Expenses</Text>
              <Text style={[styles.financialAmount, styles.expenseText]}>
                ₹{stats.monthlyExpense.toLocaleString()}
              </Text>
              <Text style={styles.financialPeriod}>This Month</Text>
            </View>
            <View style={styles.financialCard}>
              <Text style={styles.financialLabel}>Net</Text>
              <Text style={[styles.financialAmount, styles.netText]}>
                ₹{(stats.monthlyIncome - stats.monthlyExpense).toLocaleString()}
              </Text>
              <Text style={styles.financialPeriod}>This Month</Text>
            </View>
          </View>
        </View>

        {/* ✅ Staff List - Quick View */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Staff</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/people")}>
              <Text style={styles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          {recentStaff.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No staff added yet</Text>
            </View>
          ) : (
            recentStaff.map((staff, index) => (
              <StaffCard
                key={index}
                name={staff.name}
                role={staff.role}
                onPress={() => handleStaffPress(staff)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 14,
  },
  // Header
  header: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },
  subGreeting: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  // Stats
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  statTitle: {
    fontSize: 13,
    color: "#666",
  },
  statSubtitle: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  // Quick Actions
  quickActionsSection: {
    marginBottom: 20,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  quickActionTitle: {
    fontSize: 13,
    color: "#333",
    textAlign: "center",
    fontWeight: "500",
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  seeAllText: {
    fontSize: 14,
    color: "#1a73e8",
    fontWeight: "600",
  },
  // Financial
  financialSection: {
    marginBottom: 20,
  },
  financialCards: {
    flexDirection: "row",
    gap: 12,
  },
  financialCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  financialLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  financialAmount: {
    fontSize: 18,
    fontWeight: "700",
  },
  incomeText: {
    color: "#4CAF50",
  },
  expenseText: {
    color: "#F44336",
  },
  netText: {
    color: "#1a73e8",
  },
  financialPeriod: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
  },
  // Staff
  staffCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  staffInitial: {
    fontSize: 18,
    fontWeight: "600",
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  staffRole: {
    fontSize: 12,
    color: "#666",
    marginTop: 1,
  },
  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  createPropertyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
  },
  createPropertyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchPropertyButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  switchPropertyText: {
    color: "#1a73e8",
    fontSize: 14,
    fontWeight: "500",
  },
  emptyState: {
    padding: 30,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
  },
});

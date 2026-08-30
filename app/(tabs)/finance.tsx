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
  View
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { usePayments } from "../../hooks/usePayments";
import {
  getPaymentCategoryColor,
  getPaymentStatusColor,
  Payment,
  PaymentCategory,
  PaymentStatus,
  PaymentSummary,
} from "../../types/payment";

// Quick filter options
type FilterType = "all" | "income" | "expense" | "pending";

// ✅ Define income and expense categories for filtering
const INCOME_CATEGORIES: PaymentCategory[] = ["rent", "maintenance"];
const EXPENSE_CATEGORIES: PaymentCategory[] = [
  "salary",
  "electricity",
  "water",
  "other",
];

// Transaction Item Component
function TransactionItem({ payment }: { payment: Payment }) {
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      salary: "Salary",
      rent: "Rent",
      maintenance: "Maintenance",
      electricity: "Electricity",
      water: "Water",
      other: "Other",
    };
    return labels[category] || category;
  };

  const getIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      salary: "cash-outline",
      rent: "home-outline",
      maintenance: "construct-outline",
      electricity: "flash-outline",
      water: "water-outline",
      other: "receipt-outline",
    };
    return icons[category] || "receipt-outline";
  };

  const getStatusIcon = (
    status: PaymentStatus,
  ): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "paid":
        return "checkmark-circle";
      case "due":
        return "time-outline";
      case "overdue":
        return "alert-circle";
      default:
        return "time-outline";
    }
  };

  const color = getPaymentCategoryColor(payment.category);
  const statusColor = getPaymentStatusColor(payment.status);
  const icon = getIcon(payment.category);
  const statusIcon = getStatusIcon(payment.status);

  // ✅ Determine if this is income or expense
  const isIncome = INCOME_CATEGORIES.includes(
    payment.category as PaymentCategory,
  );

  return (
    <View style={styles.transactionItem}>
      <View style={[styles.transactionIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle}>
          {getCategoryLabel(payment.category)}
        </Text>
        <Text style={styles.transactionDescription}>
          {payment.description ||
            `Due: ${new Date(payment.dueDate).toLocaleDateString()}`}
        </Text>
        {payment.category === "electricity" && "units" in payment && (
          <Text style={styles.transactionMeta}>
            ⚡ {payment.units} units • {payment.billNumber || "No bill number"}
          </Text>
        )}
        {payment.category === "salary" && "memberId" in payment && (
          <Text style={styles.transactionMeta}>
            👤 Member ID: {payment.memberId}
          </Text>
        )}
        {payment.category === "maintenance" && "flatNumber" in payment && (
          <Text style={styles.transactionMeta}>
            🏠 Flat {payment.flatNumber}
          </Text>
        )}
      </View>
      <View style={styles.transactionRight}>
        <Text
          style={[
            styles.transactionAmount,
            isIncome ? styles.incomeText : styles.expenseText,
          ]}
        >
          {isIncome ? "+" : "-"}₹{payment.amount}
        </Text>
        <View
          style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
        >
          <Ionicons name={statusIcon} size={12} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Summary Card Component
function SummaryCard({
  title,
  amount,
  icon,
  color,
  trend,
}: {
  title: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <View style={[styles.summaryCard, { borderLeftColor: color }]}>
      <View style={styles.summaryHeader}>
        <View style={[styles.summaryIcon, { backgroundColor: color + "20" }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        {trend && (
          <View
            style={[
              styles.trendBadge,
              { backgroundColor: trend.positive ? "#4CAF5020" : "#F4433620" },
            ]}
          >
            <Ionicons
              name={trend.positive ? "arrow-up" : "arrow-down"}
              size={12}
              color={trend.positive ? "#4CAF50" : "#F44336"}
            />
            <Text
              style={[
                styles.trendText,
                { color: trend.positive ? "#4CAF50" : "#F44336" },
              ]}
            >
              {trend.value}%
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.summaryAmount, { color }]}>
        ₹{amount.toLocaleString()}
      </Text>
      <Text style={styles.summaryTitle}>{title}</Text>
    </View>
  );
}

export default function FinanceScreen() {
  const router = useRouter();
  const {
    selectedAccount,
    accounts,
    isLoading: accountsLoading,
  } = useAccounts();
  const { payments, getPendingPayments, getMonthlySummary, isLoading } =
    usePayments(selectedAccount?.id);

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [pendingBills, setPendingBills] = useState<Payment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    if (selectedAccount) {
      loadFinanceData();
    }
  }, [selectedAccount, payments, filter, selectedMonth]);

  const loadFinanceData = () => {
    // Get all payments for the account
    const accountPayments = payments || [];

    // ✅ Apply filter - Type-safe
    let filtered: Payment[] = [];

    switch (filter) {
      case "all":
        filtered = accountPayments;
        break;
      case "income":
        filtered = accountPayments.filter((p: Payment) =>
          INCOME_CATEGORIES.includes(p.category as PaymentCategory),
        );
        break;
      case "expense":
        filtered = accountPayments.filter((p: Payment) =>
          EXPENSE_CATEGORIES.includes(p.category as PaymentCategory),
        );
        break;
      case "pending":
        filtered = accountPayments.filter(
          (p: Payment) => p.status === "due" || p.status === "overdue",
        );
        break;
      default:
        filtered = accountPayments;
    }

    setFilteredPayments(filtered);

    // Get summary
    const monthStr = selectedMonth.toISOString().slice(0, 7);
    const monthlySummary = getMonthlySummary?.(monthStr);
    if (monthlySummary) {
      setSummary(monthlySummary);
    }

    // Get pending bills
    const pending = getPendingPayments?.() || [];
    setPendingBills(pending);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    loadFinanceData();
    setRefreshing(false);
  };

  const handleMonthChange = (direction: "prev" | "next") => {
    const newDate = new Date(selectedMonth);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedMonth(newDate);
  };

  const handleRecordPayment = () => {
    router.push({
      pathname: "/(modals)/record-payment",
      params: {
        accountId: selectedAccount?.id || "",
      },
    });
  };

  const handlePaymentPress = (payment: Payment) => {
    router.push({
      pathname: "/(modals)/record-payment",
      params: {
        paymentId: payment.id,
        accountId: selectedAccount?.id || "",
        mode: "edit",
      },
    });
  };

  if (accountsLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
          <Text style={styles.loadingText}>Loading finances...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Property Selected</Text>
          <Text style={styles.emptySubtitle}>
            {accounts.length > 0
              ? "Select a property to view finances"
              : "Create a property to view finances"}
          </Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() =>
              router.push(
                accounts.length > 0 ? "/(modals)/switch-account" : "/(modals)/add-account",
              )
            }
          >
            <Text style={styles.selectButtonText}>
              {accounts.length > 0 ? "Select Property" : "Create Property"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() => handleMonthChange("prev")}
            style={styles.monthNavButton}
          >
            <Ionicons name="chevron-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {selectedMonth.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </Text>
          <TouchableOpacity
            onPress={() => handleMonthChange("next")}
            style={styles.monthNavButton}
          >
            <Ionicons name="chevron-forward" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        {summary && (
          <View style={styles.summaryGrid}>
            <SummaryCard
              title="Income"
              amount={summary.totalIncome}
              icon="trending-up"
              color="#4CAF50"
              trend={{ value: 12, positive: true }}
            />
            <SummaryCard
              title="Expenses"
              amount={summary.totalExpense}
              icon="trending-down"
              color="#F44336"
              trend={{ value: 5, positive: false }}
            />
            <SummaryCard
              title="Net"
              amount={summary.net}
              icon="calculator"
              color={summary.net >= 0 ? "#1a73e8" : "#F44336"}
              trend={{
                value: summary.net >= 0 ? 8 : -8,
                positive: summary.net >= 0,
              }}
            />
          </View>
        )}

        {/* Filters */}
        <View style={styles.filterContainer}>
          {(["all", "income", "expense", "pending"] as FilterType[]).map(
            (filterType) => (
              <TouchableOpacity
                key={filterType}
                style={[
                  styles.filterChip,
                  filter === filterType && styles.filterChipActive,
                ]}
                onPress={() => setFilter(filterType)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === filterType && styles.filterChipTextActive,
                  ]}
                >
                  {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </View>

        {/* Transactions List */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            <Text style={styles.transactionCount}>
              {filteredPayments.length} items
            </Text>
          </View>
          {filteredPayments.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <Ionicons name="receipt-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>No transactions found</Text>
            </View>
          ) : (
            filteredPayments.map((payment) => (
              <TouchableOpacity
                key={payment.id}
                onPress={() => handlePaymentPress(payment)}
                activeOpacity={0.7}
              >
                <TransactionItem payment={payment} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Pending Bills Summary */}
        {pendingBills.length > 0 && (
          <View style={styles.pendingSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>⚠️ Pending Bills</Text>
              <Text style={styles.pendingCount}>
                {pendingBills.length} bills
              </Text>
            </View>
            {pendingBills.slice(0, 3).map((bill) => (
              <TouchableOpacity
                key={bill.id}
                style={styles.pendingBill}
                onPress={() => handlePaymentPress(bill)}
              >
                <View style={styles.pendingBillLeft}>
                  <Ionicons
                    name="receipt-outline"
                    size={20}
                    color={bill.status === "overdue" ? "#F44336" : "#FF9800"}
                  />
                  <View>
                    <Text style={styles.pendingBillTitle}>{bill.category}</Text>
                    <Text style={styles.pendingBillDue}>
                      Due: {new Date(bill.dueDate).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingBillRight}>
                  <Text style={styles.pendingBillAmount}>₹{bill.amount}</Text>
                  <View
                    style={[
                      styles.pendingBillStatus,
                      {
                        backgroundColor:
                          bill.status === "overdue" ? "#F4433620" : "#FF980020",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pendingBillStatusText,
                        {
                          color:
                            bill.status === "overdue" ? "#F44336" : "#FF9800",
                        },
                      ]}
                    >
                      {bill.status === "overdue" ? "Overdue" : "Pending"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            {pendingBills.length > 3 && (
              <TouchableOpacity
                style={styles.viewAllBills}
                onPress={() => setFilter("pending")}
              >
                <Text style={styles.viewAllBillsText}>
                  View all {pendingBills.length} pending bills
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRecordPayment}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Record Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
          >
            <Ionicons name="bar-chart" size={20} color="#1a73e8" />
            <Text style={styles.actionButtonTextSecondary}>Reports</Text>
          </TouchableOpacity>
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
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
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
  selectButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  selectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Month Selector
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  monthNavButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  // Summary
  summaryGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
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
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 2,
  },
  trendText: {
    fontSize: 10,
    fontWeight: "600",
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: "700",
  },
  summaryTitle: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  // Filters
  filterContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  filterChipActive: {
    backgroundColor: "#1a73e8",
    borderColor: "#1a73e8",
  },
  filterChipText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  // Transactions
  transactionsSection: {
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
  transactionCount: {
    fontSize: 13,
    color: "#666",
  },
  transactionItem: {
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
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  transactionDescription: {
    fontSize: 12,
    color: "#666",
    marginTop: 1,
  },
  transactionMeta: {
    fontSize: 11,
    color: "#999",
    marginTop: 1,
  },
  transactionRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: "600",
  },
  incomeText: {
    color: "#4CAF50",
  },
  expenseText: {
    color: "#F44336",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // Pending Bills
  pendingSection: {
    marginBottom: 20,
  },
  pendingCount: {
    fontSize: 13,
    color: "#666",
  },
  pendingBill: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  pendingBillLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pendingBillTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  pendingBillDue: {
    fontSize: 12,
    color: "#999",
  },
  pendingBillRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  pendingBillAmount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },
  pendingBillStatus: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  pendingBillStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  viewAllBills: {
    padding: 12,
    alignItems: "center",
  },
  viewAllBillsText: {
    fontSize: 14,
    color: "#1a73e8",
    fontWeight: "500",
  },
  // Action Buttons
  actionContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#1a73e8",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  actionButtonTextSecondary: {
    color: "#1a73e8",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyTransactions: {
    padding: 40,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },
});

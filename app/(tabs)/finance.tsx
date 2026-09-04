import { downloadFinanceReportPdf } from "@/services/financeReportPdf";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";

import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { useFinanceBalanceStore } from "../../store/financeBalanceStore";
import { useMemberStore } from "../../store/memberStore";

import {
  getPaymentCategoryColor,
  getPaymentStatusColor,
  PaymentCategory,
  PaymentStatus,
} from "../../types/payment";

import {
  getPeopleSummary,
  getPeopleTransactions,
  PeopleTransaction,
} from "../../utils/peopleTransactions";

// ============================================================
// TYPES
// ============================================================

type FilterType = "all" | "income" | "expense" | "pending";

// ============================================================
// HELPERS
// ============================================================

const getCategoryLabel = (category: string) =>
  ({
    salary: "Salary",
    maintenance: "Maintenance",
    electricity: "Electricity",
    water: "Water",
    other: "Other",
  })[category] || category;

const escapeHtml = (value: string | number | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const INCOME_CATEGORIES: PaymentCategory[] = ["maintenance"];

const EXPENSE_CATEGORIES: PaymentCategory[] = [
  "salary",
  "electricity",
  "water",
  "other",
];

// ============================================================
// TRANSACTION ITEM
// ============================================================

function TransactionItem({ payment }: { payment: PeopleTransaction }) {
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      salary: "Salary",
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

  const isIncome = INCOME_CATEGORIES.includes(
    payment.category as PaymentCategory,
  );

  return (
    <View style={styles.transactionItem}>
      <View
        style={[
          styles.transactionIcon,
          {
            backgroundColor: `${color}15`,
          },
        ]}
      >
        <Ionicons name={icon} size={21} color={color} />
      </View>

      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle} numberOfLines={1}>
          {getCategoryLabel(payment.category)}
        </Text>

        <Text style={styles.transactionDescription} numberOfLines={1}>
          {payment.description ||
            `Due: ${new Date(payment.dueDate).toLocaleDateString()}`}
        </Text>

        {payment.category === "salary" && "memberId" in payment && (
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={11} color="#8A94A6" />

            <Text style={styles.transactionMeta}>
              {payment.memberRole
                ? payment.memberRole.charAt(0).toUpperCase() +
                  payment.memberRole.slice(1)
                : "Staff"}
            </Text>
          </View>
        )}

        {payment.category === "maintenance" && "flatNumber" in payment && (
          <View style={styles.metaRow}>
            <Ionicons name="home-outline" size={11} color="#8A94A6" />

            <Text style={styles.transactionMeta}>
              {payment.wing ? `${payment.wing} Wing • ` : ""}
              Flat {payment.flatNumber}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.transactionRight}>
        <Text
          style={[
            styles.transactionAmount,
            payment.status === "due"
              ? { color: statusColor }
              : isIncome
                ? styles.incomeText
                : styles.expenseText,
          ]}
        >
          {isIncome ? "+" : "-"}₹{payment.amount}
        </Text>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: `${statusColor}12`,
            },
          ]}
        >
          <Ionicons name={statusIcon} size={11} color={statusColor} />

          <Text
            style={[
              styles.statusText,
              {
                color: statusColor,
              },
            ]}
          >
            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  title,
  amount,
  icon,
  color,
  backgroundColor,
}: {
  title: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View
        style={[
          styles.summaryIcon,
          {
            backgroundColor,
          },
        ]}
      >
        <Ionicons name={icon} size={17} color={color} />
      </View>

      <Text
        style={[
          styles.summaryAmount,
          {
            color,
          },
        ]}
      >
        ₹{amount.toLocaleString("en-IN")}
      </Text>

      <Text style={styles.summaryTitle}>{title}</Text>
    </View>
  );
}

// ============================================================
// FINANCE SCREEN
// ============================================================

export default function FinanceScreen() {
  const router = useRouter();

  const {
    selectedAccount,
    accounts,
    isLoading: accountsLoading,
  } = useAccounts();

  const { groups } = useGroups(selectedAccount?.id || null);

  const members = useMemberStore((state) => state.members);

  const openingBalances = useFinanceBalanceStore(
    (state) => state.openingBalances,
  );

  const setOpeningBalance = useFinanceBalanceStore(
    (state) => state.setOpeningBalance,
  );

  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState<FilterType>("all");

  const [filteredPayments, setFilteredPayments] = useState<PeopleTransaction[]>(
    [],
  );

  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    net: 0,
  });

  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const [showReportOptions, setShowReportOptions] = useState(false);

  const [showOpeningBalanceEditor, setShowOpeningBalanceEditor] =
    useState(false);

  const [openingBalanceInput, setOpeningBalanceInput] = useState("");

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  const getSelectedMonthTransactions = () => {
    const accountGroupIds = new Set(groups.map((group) => group.id));

    const accountMembers = members.filter((member) =>
      accountGroupIds.has(member.groupId),
    );

    const monthKey = `${selectedMonth.getFullYear()}-${String(
      selectedMonth.getMonth() + 1,
    ).padStart(2, "0")}`;

    return {
      monthKey,
      transactions: getPeopleTransactions(accountMembers, monthKey),
    };
  };

  const getMonthKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const accountGroupIds = new Set(groups.map((group) => group.id));

  const accountMembers = members.filter((member) =>
    accountGroupIds.has(member.groupId),
  );

  const selectedMonthKey = getMonthKey(selectedMonth);

  const firstTrackedMonth = selectedAccount
    ? selectedAccount.createdAt.slice(0, 7)
    : selectedMonthKey;

  const previousMonthNets: number[] = [];

  const cursor = new Date(`${firstTrackedMonth}-01T00:00:00`);

  while (getMonthKey(cursor) < selectedMonthKey) {
    previousMonthNets.push(
      getPeopleSummary(
        getPeopleTransactions(accountMembers, getMonthKey(cursor)),
      ).net,
    );

    cursor.setMonth(cursor.getMonth() + 1);
  }

  const initialOpeningBalance = selectedAccount
    ? openingBalances[selectedAccount.id] || 0
    : 0;

  const carriedForwardBalance =
    initialOpeningBalance +
    previousMonthNets.reduce((total, monthNet) => total + monthNet, 0);

  const totalSavings = carriedForwardBalance + summary.net;

  // ============================================================
  // OPENING BALANCE
  // ============================================================

  const openOpeningBalanceEditor = () => {
    setOpeningBalanceInput(
      initialOpeningBalance ? initialOpeningBalance.toString() : "",
    );

    setShowOpeningBalanceEditor(true);
  };

  const saveOpeningBalance = () => {
    if (!selectedAccount) return;

    setOpeningBalance(selectedAccount.id, Number(openingBalanceInput) || 0);

    setShowOpeningBalanceEditor(false);
  };

  // ============================================================
  // LOAD FINANCE
  // ============================================================

  useEffect(() => {
    if (selectedAccount) {
      loadFinanceData();
    }
  }, [selectedAccount, groups, members, filter, selectedMonth]);

  const loadFinanceData = () => {
    const { transactions: accountPayments } = getSelectedMonthTransactions();

    let filtered: PeopleTransaction[] = [];

    switch (filter) {
      case "all":
        filtered = accountPayments;
        break;

      case "income":
        filtered = accountPayments.filter((p) =>
          INCOME_CATEGORIES.includes(p.category as PaymentCategory),
        );
        break;

      case "expense":
        filtered = accountPayments.filter((p) =>
          EXPENSE_CATEGORIES.includes(p.category as PaymentCategory),
        );
        break;

      case "pending":
        filtered = accountPayments.filter(
          (p) => p.status === "due" || p.status === "overdue",
        );
        break;

      default:
        filtered = accountPayments;
    }

    setFilteredPayments((currentPayments) =>
      currentPayments.length === filtered.length &&
      currentPayments.every(
        (payment, index) => payment.id === filtered[index].id,
      )
        ? currentPayments
        : filtered,
    );

    const peopleSummary = getPeopleSummary(accountPayments);

    setSummary((currentSummary) =>
      currentSummary.totalIncome === peopleSummary.income &&
      currentSummary.totalExpense === peopleSummary.expenses &&
      currentSummary.net === peopleSummary.net
        ? currentSummary
        : {
            totalIncome: peopleSummary.income,
            totalExpense: peopleSummary.expenses,
            net: peopleSummary.net,
          },
    );
  };

  // ============================================================
  // REFRESH
  // ============================================================

  const onRefresh = async () => {
    setRefreshing(true);

    loadFinanceData();

    setRefreshing(false);
  };

  // ============================================================
  // MONTH
  // ============================================================

  const handleMonthChange = (direction: "prev" | "next") => {
    const newDate = new Date(selectedMonth);

    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }

    setSelectedMonth(newDate);
  };

  // ============================================================
  // REPORT DATA
  // ============================================================

  const getReportData = () => {
    const { monthKey, transactions } = getSelectedMonthTransactions();

    const reportSummary = getPeopleSummary(transactions);

    return {
      monthKey,
      reportSummary,
      transactions,
    };
  };

  // ============================================================
  // EXCEL
  // ============================================================

  const handleDownloadExcel = async () => {
    const { monthKey, reportSummary, transactions } = getReportData();

    const maintenance = transactions.filter(
      (transaction) => transaction.category === "maintenance",
    );

    const staff = transactions.filter(
      (transaction) => transaction.category === "salary",
    );

    const expenses = transactions.filter(
      (transaction) =>
        transaction.category !== "maintenance" &&
        transaction.category !== "salary",
    );

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["AI Khata Finance Report"],
      ["Property", selectedAccount?.name || ""],
      ["Billing month", monthKey],
      [],
      ["Income", reportSummary.income],
      ["Expenses", reportSummary.expenses],
      ["Net", reportSummary.net],
      [],
      ["Maintenance"],
      ["Wing", "Flat Number", "Owner Name", "Phone", "Amount", "Status"],
      ...maintenance.map((transaction) => [
        transaction.wing || "",
        transaction.flatNumber || "",
        transaction.memberName || "",
        transaction.phone || "",
        transaction.amount,
        transaction.status.charAt(0).toUpperCase() +
          transaction.status.slice(1),
      ]),
      [],
      ["Staff"],
      ["Staff Name", "Phone", "Role", "Paid Amount", "Status"],
      ...staff.map((transaction) => [
        transaction.memberName || transaction.description || "",
        transaction.phone || "",
        transaction.memberRole
          ? transaction.memberRole.charAt(0).toUpperCase() +
            transaction.memberRole.slice(1)
          : "Staff",
        transaction.amount,
        transaction.status.charAt(0).toUpperCase() +
          transaction.status.slice(1),
      ]),
      [],
      ["Expenses"],
      ["Expense", "Amount", "Due Date", "Status"],
      ...expenses.map((transaction) => [
        transaction.description || getCategoryLabel(transaction.category),
        transaction.amount,
        transaction.dueDate,
        transaction.status.charAt(0).toUpperCase() +
          transaction.status.slice(1),
      ]),
    ]);

    worksheet["!merges"] = [
      XLSX.utils.decode_range("A1:F1"),
      XLSX.utils.decode_range("A9:F9"),
      XLSX.utils.decode_range(
        `A${12 + maintenance.length}:E${12 + maintenance.length}`,
      ),
      XLSX.utils.decode_range(
        `A${15 + maintenance.length + staff.length}:D${
          15 + maintenance.length + staff.length
        }`,
      ),
    ];

    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Finance Report");

    const data = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileName = `ai-khata-finance-${monthKey}.xlsx`;

    try {
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );

        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;

        link.click();

        URL.revokeObjectURL(url);

        return;
      }

      const file = new File(Paths.cache, fileName);

      file.create({
        overwrite: true,
      });

      file.write(new Uint8Array(data));

      await Sharing.shareAsync(file.uri, {
        dialogTitle: `Excel report for ${monthKey}`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    } catch {
      Alert.alert(
        "Report unavailable",
        "Unable to generate the Excel report. Please try again.",
      );
    }
  };

  // ============================================================
  // PDF
  // ============================================================

  const handleDownloadPdf = async () => {
    const { monthKey, reportSummary, transactions } = getReportData();

    try {
      await downloadFinanceReportPdf({
        propertyName: selectedAccount?.name || "Property",
        month: monthKey,
        income: reportSummary.income,
        expenses: reportSummary.expenses,
        net: reportSummary.net,
        transactions,
      });

      setShowReportOptions(false);
    } catch {
      Alert.alert(
        "Report unavailable",
        "Unable to generate the PDF report. Please try again.",
      );
    }
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (accountsLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIcon}>
            <Ionicons name="wallet-outline" size={28} color="#2563EB" />
          </View>

          <ActivityIndicator size="small" color="#2563EB" />

          <Text style={styles.loadingText}>Loading finances...</Text>
        </View>
      </View>
    );
  }

  // ============================================================
  // NO ACCOUNT
  // ============================================================

  if (!selectedAccount) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="wallet-outline" size={38} color="#2563EB" />
          </View>

          <Text style={styles.emptyTitle}>No Property Selected</Text>

          <Text style={styles.emptySubtitle}>
            {accounts.length > 0
              ? "Select a property to view its financial overview."
              : "Create a property to start managing finances."}
          </Text>

          <TouchableOpacity
            style={styles.selectButton}
            onPress={() =>
              router.push(
                accounts.length > 0
                  ? "/(modals)/switch-account"
                  : "/(modals)/add-account",
              )
            }
          >
            <Ionicons
              name={accounts.length > 0 ? "business-outline" : "add"}
              size={18}
              color="#fff"
            />

            <Text style={styles.selectButtonText}>
              {accounts.length > 0 ? "Select Property" : "Create Property"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // MAIN UI
  // ============================================================

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerEyebrow}>FINANCE</Text>

            <Text style={styles.headerTitle}>Money Overview</Text>

            <View style={styles.propertyRow}>
              <Ionicons name="business-outline" size={13} color="#64748B" />

              <Text style={styles.propertyName} numberOfLines={1}>
                {selectedAccount.name}
              </Text>
            </View>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons name="wallet" size={21} color="#2563EB" />
          </View>
        </View>

        {/* BALANCE HERO */}

        <View style={styles.balanceHero}>
          <View style={styles.heroCircleOne} />
          <View style={styles.heroCircleTwo} />

          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroSmallLabel}>
                Start With Opening Balance
              </Text>

              <Text
                style={[
                  styles.heroAmount,
                  totalSavings < 0 && styles.heroNegative,
                ]}
              >
                ₹{totalSavings.toLocaleString("en-IN")}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.heroEditButton}
              onPress={openOpeningBalanceEditor}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />

              <Text style={styles.heroEditText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroBottomRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Carried Forward</Text>

              <Text style={styles.heroMetricValue}>
                ₹{carriedForwardBalance.toLocaleString("en-IN")}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>This Month</Text>

              <Text
                style={[
                  styles.heroMetricValue,
                  summary.net < 0 && styles.heroNegativeSmall,
                ]}
              >
                {summary.net >= 0 ? "+" : "-"}₹
                {Math.abs(summary.net).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </View>

        {/* MONTH */}

        <View style={styles.monthCard}>
          <View style={styles.monthLeft}>
            <View style={styles.calendarIcon}>
              <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            </View>

            <View>
              <Text style={styles.monthCaption}>BILLING MONTH</Text>

              <Text style={styles.monthText}>
                {selectedMonth.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>
          </View>

          <View style={styles.monthActions}>
            <TouchableOpacity
              onPress={() => handleMonthChange("prev")}
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-back" size={19} color="#334155" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleMonthChange("next")}
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-forward" size={19} color="#334155" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => setShowReportOptions(true)}
            >
              <Ionicons name="document-text-outline" size={16} color="#fff" />

              <Text style={styles.reportButtonText}>Report</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SUMMARY */}

        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>Monthly Summary</Text>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard
            title="Income"
            amount={summary.totalIncome}
            icon="arrow-down"
            color="#16A34A"
            backgroundColor="#ECFDF3"
          />

          <SummaryCard
            title="Expenses"
            amount={summary.totalExpense}
            icon="arrow-up"
            color="#DC2626"
            backgroundColor="#FEF2F2"
          />

          <View style={styles.summaryCardLastWrapper}>
            <SummaryCard
              title="Net"
              amount={Math.abs(summary.net)}
              icon="calculator-outline"
              color={summary.net >= 0 ? "#2563EB" : "#DC2626"}
              backgroundColor={summary.net >= 0 ? "#EFF6FF" : "#FEF2F2"}
            />
          </View>
        </View>

        {/* FILTER HEADER */}

        <View style={styles.filterHeader}>
          <Text style={styles.sectionLabel}>Transactions</Text>

          <Text style={styles.transactionCountTop}>
            {filteredPayments.length} records
          </Text>
        </View>

        {/* FILTERS */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {(
            [
              {
                type: "all",
                label: "All",
                icon: "apps-outline",
              },
              {
                type: "income",
                label: "Income",
                icon: "trending-up-outline",
              },
              {
                type: "expense",
                label: "Expense",
                icon: "trending-down-outline",
              },
              {
                type: "pending",
                label: "Pending",
                icon: "time-outline",
              },
            ] as {
              type: FilterType;
              label: string;
              icon: keyof typeof Ionicons.glyphMap;
            }[]
          ).map((item) => {
            const active = filter === item.type;

            return (
              <TouchableOpacity
                key={item.type}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item.type)}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? "#fff" : "#64748B"}
                />

                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* TRANSACTIONS */}

        <View style={styles.transactionsSection}>
          {filteredPayments.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <View style={styles.emptyTransactionIcon}>
                <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
              </View>

              <Text style={styles.emptyTransactionTitle}>No transactions</Text>

              <Text style={styles.emptyText}>
                No transactions match this filter for the selected month.
              </Text>
            </View>
          ) : (
            filteredPayments.map((payment) => (
              <TransactionItem key={payment.id} payment={payment} />
            ))
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* REPORT MODAL */}

      <Modal
        transparent
        animationType="slide"
        visible={showReportOptions}
        onRequestClose={() => setShowReportOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Download Report</Text>

                <Text style={styles.sheetSubtitle}>
                  Choose a format for{" "}
                  {selectedMonth.toLocaleString("default", {
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={() => setShowReportOptions(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* EXCEL */}

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => {
                setShowReportOptions(false);
                handleDownloadExcel();
              }}
            >
              <View
                style={[
                  styles.reportOptionIcon,
                  {
                    backgroundColor: "#ECFDF3",
                  },
                ]}
              >
                <Ionicons name="grid-outline" size={22} color="#16A34A" />
              </View>

              <View style={styles.reportOptionInfo}>
                <Text style={styles.reportOptionTitle}>Excel Report</Text>

                <Text style={styles.reportOptionSubtitle}>
                  Detailed spreadsheet with transactions
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={19} color="#94A3B8" />
            </TouchableOpacity>

            {/* PDF */}

            <TouchableOpacity
              style={styles.reportOption}
              onPress={handleDownloadPdf}
            >
              <View
                style={[
                  styles.reportOptionIcon,
                  {
                    backgroundColor: "#FEF2F2",
                  },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color="#DC2626"
                />
              </View>

              <View style={styles.reportOptionInfo}>
                <Text style={styles.reportOptionTitle}>PDF Report</Text>

                <Text style={styles.reportOptionSubtitle}>
                  Share a clean financial summary
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={19} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowReportOptions(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* OPENING BALANCE MODAL */}

      <Modal
        transparent
        animationType="slide"
        visible={showOpeningBalanceEditor}
        onRequestClose={() => setShowOpeningBalanceEditor(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Opening Balance</Text>

                <Text style={styles.sheetSubtitle}>
                  Set the starting balance for this property.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={() => setShowOpeningBalanceEditor(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Starting balance</Text>

            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>₹</Text>

              <TextInput
                autoFocus
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                style={styles.openingBalanceInput}
                value={openingBalanceInput}
                onChangeText={(value) =>
                  setOpeningBalanceInput(value.replace(/[^0-9]/g, ""))
                }
              />
            </View>

            <Text style={styles.inputHint}>
              This balance will be carried forward to future months
              automatically.
            </Text>

            <View style={styles.openingBalanceActions}>
              <TouchableOpacity
                style={styles.cancelOutlineButton}
                onPress={() => setShowOpeningBalanceEditor(false)}
              >
                <Text style={styles.cancelOutlineText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveOpeningBalanceButton}
                onPress={saveOpeningBalance}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />

                <Text style={styles.saveOpeningBalanceText}>Save Balance</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// STYLES
//
// IMPORTANT:
// `as any` here is intentional.
//
// React Native's current TypeScript definitions can sometimes
// infer StyleSheet entries as ViewStyle | TextStyle | ImageStyle
// when they are later used in style arrays.
//
// This does NOT change runtime styling or finance logic.
// It only prevents those incorrect overload errors.
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 30,
  },

  bottomPadding: {
    height: 30,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerEyebrow: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 3,
  },

  headerTitle: {
    color: "#111827",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  propertyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  propertyName: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 5,
    maxWidth: 230,
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },

  // HERO

  balanceHero: {
    backgroundColor: "#2563EB",
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    overflow: "hidden",
  },

  heroCircleOne: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -85,
    top: -90,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  heroCircleTwo: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    left: -70,
    bottom: -65,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  heroSmallLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heroAmount: {
    color: "#fff",
    fontSize: 31,
    fontWeight: "800",
    marginTop: 5,
    letterSpacing: -0.8,
  },

  heroNegative: {
    color: "#FECACA",
  },

  heroEditButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  heroEditText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginVertical: 17,
  },

  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  heroMetric: {
    flex: 1,
  },

  heroMetricDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 16,
  },

  heroMetricLabel: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 10,
    fontWeight: "500",
  },

  heroMetricValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },

  heroNegativeSmall: {
    color: "#FECACA",
  },

  // MONTH

  monthCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 12,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  monthLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  calendarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  monthCaption: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  monthText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },

  monthActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
  },

  reportButton: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 11,
    marginLeft: 7,
  },

  reportButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  // SECTION

  sectionLabelRow: {
    marginBottom: 10,
  },

  sectionLabel: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },

  // SUMMARY

  summaryGrid: {
    flexDirection: "row",
    marginBottom: 22,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 17,
    padding: 13,
    marginRight: 9,
    minHeight: 105,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  summaryCardLastWrapper: {
    flex: 1,
  },

  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },

  summaryAmount: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  summaryTitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },

  // FILTER

  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  transactionCountTop: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },

  filterContainer: {
    paddingRight: 8,
    marginBottom: 14,
  },

  filterChip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },

  filterChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },

  filterChipText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  filterChipTextActive: {
    color: "#fff",
  },

  // TRANSACTIONS

  transactionsSection: {
    marginBottom: 20,
  },

  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 17,
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  transactionIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  transactionInfo: {
    flex: 1,
    minWidth: 0,
  },

  transactionTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },

  transactionDescription: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },

  transactionMeta: {
    color: "#94A3B8",
    fontSize: 9,
    marginLeft: 4,
  },

  transactionRight: {
    alignItems: "flex-end",
    marginLeft: 8,
  },

  transactionAmount: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  incomeText: {
    color: "#16A34A",
  },

  expenseText: {
    color: "#DC2626",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: 5,
  },

  statusText: {
    fontSize: 8,
    fontWeight: "800",
    marginLeft: 3,
  },

  // EMPTY TRANSACTIONS

  emptyTransactions: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 25,
    paddingVertical: 38,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  emptyTransactionIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  emptyTransactionTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },

  emptyText: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 5,
  },

  // LOADING

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 9,
  },

  // NO ACCOUNT

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },

  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  emptyTitle: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },

  emptySubtitle: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },

  selectButton: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingHorizontal: 22,
  },

  selectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 7,
  },

  // MODAL

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },

  bottomSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },

  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 10,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 20,
  },

  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },

  sheetTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },

  sheetSubtitle: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 280,
  },

  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  // REPORT OPTIONS

  reportOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  reportOptionIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  reportOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },

  reportOptionTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
  },

  reportOptionSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },

  cancelButton: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    marginTop: 6,
  },

  cancelButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },

  // OPENING BALANCE

  inputLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },

  amountInputContainer: {
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 14,
  },

  currencySymbol: {
    color: "#2563EB",
    fontSize: 20,
    fontWeight: "800",
    marginRight: 8,
  },

  openingBalanceInput: {
    flex: 1,
    height: 52,
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    padding: 0,
  },

  inputHint: {
    color: "#94A3B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
    marginBottom: 20,
  },

  openingBalanceActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  cancelOutlineButton: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },

  cancelOutlineText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },

  saveOpeningBalanceButton: {
    flex: 1.35,
    height: 48,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    marginLeft: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  saveOpeningBalanceText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
}) as any;

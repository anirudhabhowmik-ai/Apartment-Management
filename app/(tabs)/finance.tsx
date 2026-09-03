import { downloadFinanceReportPdf } from "@/services/financeReportPdf";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
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
import { SafeAreaView } from "react-native-safe-area-context";
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

// Quick filter options
type FilterType = "all" | "income" | "expense" | "pending";

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

// ✅ Define income and expense categories for filtering
const INCOME_CATEGORIES: PaymentCategory[] = ["maintenance"];
const EXPENSE_CATEGORIES: PaymentCategory[] = [
  "salary",
  "electricity",
  "water",
  "other",
];

// Transaction Item Component
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
        {payment.category === "salary" && "memberId" in payment && (
          <Text style={styles.transactionMeta}>
            👤{" "}
            {payment.memberRole
              ? payment.memberRole.charAt(0).toUpperCase() +
                payment.memberRole.slice(1)
              : "Staff"}
          </Text>
        )}
        {payment.category === "maintenance" && "flatNumber" in payment && (
          <Text style={styles.transactionMeta}>
            🏠 {payment.wing ? `${payment.wing} Wing • ` : ""}Flat{" "}
            {payment.flatNumber}
          </Text>
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

  useEffect(() => {
    if (selectedAccount) {
      loadFinanceData();
    }
  }, [selectedAccount, groups, members, filter, selectedMonth]);

  const loadFinanceData = () => {
    const { transactions: accountPayments } = getSelectedMonthTransactions();

    // ✅ Apply filter - Type-safe
    let filtered: PeopleTransaction[] = [];

    switch (filter) {
      case "all":
        filtered = accountPayments;
        break;
      case "income":
        filtered = accountPayments.filter((p) =>
          INCOME_CATEGORIES.includes(p.category),
        );
        break;
      case "expense":
        filtered = accountPayments.filter((p) =>
          EXPENSE_CATEGORIES.includes(p.category),
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

  const getReportData = () => {
    const { monthKey, transactions } = getSelectedMonthTransactions();
    const reportSummary = getPeopleSummary(transactions);
    return { monthKey, reportSummary, transactions };
  };

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
        `A${15 + maintenance.length + staff.length}:D${15 + maintenance.length + staff.length}`,
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
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
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
      file.create({ overwrite: true });
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

  const handleDownloadPdfLegacy = async () => {
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
    const maintenanceRows = transactions
      .filter((transaction) => transaction.category === "maintenance")
      .map(
        (transaction) =>
          `<tr><td>${escapeHtml(transaction.wing)}</td><td>${escapeHtml(transaction.flatNumber)}</td><td>${escapeHtml(transaction.memberName)}</td><td>${escapeHtml(transaction.phone)}</td><td>Rs. ${transaction.amount}</td><td>${escapeHtml(transaction.status)}</td></tr>`,
      )
      .join("");
    const staffRows = transactions
      .filter((transaction) => transaction.category === "salary")
      .map(
        (transaction) =>
          `<tr><td>${escapeHtml(transaction.memberName)}</td><td>${escapeHtml(transaction.phone)}</td><td>${escapeHtml(transaction.memberRole)}</td><td>Rs. ${transaction.amount}</td><td>${escapeHtml(transaction.status)}</td></tr>`,
      )
      .join("");
    const expenseRows = transactions
      .filter(
        (transaction) =>
          transaction.category !== "maintenance" &&
          transaction.category !== "salary",
      )
      .map(
        (transaction) =>
          `<tr><td>${escapeHtml(transaction.description || getCategoryLabel(transaction.category))}</td><td>Rs. ${transaction.amount}</td><td>${transaction.dueDate}</td><td>${escapeHtml(transaction.status)}</td></tr>`,
      )
      .join("");
    const section = (title: string, headers: string[], rows: string) =>
      `<h2>${title}</h2><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">No entries</td></tr>`}</tbody></table>`;
    const html = `<!DOCTYPE html><html><head><style>@page{margin:28px}body{color:#172033;font:12px Arial,sans-serif}h1{color:#1769e0;font-size:24px;margin:0 0 6px}h2{font-size:15px;margin:22px 0 8px}.meta{color:#526072;margin-bottom:20px}.summary{display:flex;gap:12px;margin-bottom:22px}.summary div{background:#f3f7fd;border-left:3px solid #1769e0;padding:10px;width:30%}.summary strong{display:block;font-size:16px;margin-top:4px}table{border-collapse:collapse;width:100%}th{background:#1769e0;color:#fff;text-align:left}td,th{border:1px solid #dbe3ee;padding:8px}tr:nth-child(even){background:#f8fafc}</style></head><body><h1>AI Khata Finance Report</h1><div class="meta">${escapeHtml(selectedAccount?.name)} | Billing month: ${monthKey}</div><div class="summary"><div>Income<strong>Rs. ${reportSummary.income}</strong></div><div>Expenses<strong>Rs. ${reportSummary.expenses}</strong></div><div>Net<strong>Rs. ${reportSummary.net}</strong></div></div>${section("Maintenance", ["Wing", "Flat Number", "Owner Name", "Phone", "Amount", "Status"], maintenanceRows)}${section("Staff", ["Staff Name", "Phone", "Role", "Paid Amount", "Status"], staffRows)}${section("Expenses", ["Expense", "Amount", "Due Date", "Status"], expenseRows)}</body></html>`;

    try {
      if (Platform.OS === "web") {
        const jsPDF: any = null;
        const autoTable: any = () => undefined;
        const document = new jsPDF({
          format: "a4",
          orientation: "landscape",
          unit: "pt",
        });
        document.setFontSize(20);
        document.text("AI Khata Finance Report", 40, 42);
        document.setFontSize(11);
        document.text(
          `${selectedAccount?.name || "Property"} | Billing month: ${monthKey}`,
          40,
          64,
        );
        document.text(
          `Income: Rs. ${reportSummary.income}    Expenses: Rs. ${reportSummary.expenses}    Net: Rs. ${reportSummary.net}`,
          40,
          84,
        );
        autoTable(document, {
          head: [["Maintenance", "", "", "", "", ""]],
          body: [
            ["Wing", "Flat Number", "Owner Name", "Phone", "Amount", "Status"],
            ...maintenance.map((transaction) => [
              transaction.wing || "",
              transaction.flatNumber || "",
              transaction.memberName || "",
              transaction.phone || "",
              `Rs. ${transaction.amount}`,
              transaction.status,
            ]),
          ],
          margin: { left: 40, right: 40, top: 102 },
          styles: { fontSize: 9 },
          headStyles: { fillColor: [23, 105, 224] },
        });
        autoTable(document, {
          head: [["Staff", "", "", "", ""]],
          body: [
            ["Staff Name", "Phone", "Role", "Paid Amount", "Status"],
            ...staff.map((transaction) => [
              transaction.memberName || transaction.description || "",
              transaction.phone || "",
              transaction.memberRole || "Staff",
              `Rs. ${transaction.amount}`,
              transaction.status,
            ]),
          ],
          margin: { left: 40, right: 40 },
          startY: (document as any).lastAutoTable.finalY + 20,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [22, 128, 58] },
        });
        autoTable(document, {
          head: [["Expenses", "", "", ""]],
          body: [
            ["Expense", "Amount", "Due Date", "Status"],
            ...expenses.map((transaction) => [
              transaction.description || getCategoryLabel(transaction.category),
              `Rs. ${transaction.amount}`,
              transaction.dueDate,
              transaction.status,
            ]),
          ],
          margin: { left: 40, right: 40 },
          startY: (document as any).lastAutoTable.finalY + 20,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [220, 38, 38] },
        });
        document.save(`ai-khata-finance-${monthKey}.pdf`);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
      }
    } catch {
      Alert.alert(
        "Report unavailable",
        "Unable to generate the PDF report. Please try again.",
      );
    }
  };

  if (accountsLoading) {
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
                accounts.length > 0
                  ? "/(modals)/switch-account"
                  : "/(modals)/add-account",
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
        <View style={styles.balancePanel}>
          <View>
            <Text style={styles.balanceLabel}>Opening Balance</Text>
            <Text style={styles.balanceAmount}>
              ₹{carriedForwardBalance.toLocaleString()}
            </Text>
            <Text style={styles.balanceHint}>
              Carried forward to{" "}
              {selectedMonth.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Edit opening balance"
            style={styles.balanceEditButton}
            onPress={openOpeningBalanceEditor}
          >
            <Ionicons name="create-outline" size={18} color="#1a73e8" />
          </TouchableOpacity>
          <View style={styles.totalSavingsDivider} />
          <View>
            <Text style={styles.balanceLabel}>Total Savings</Text>
            <Text
              style={[
                styles.totalSavingsAmount,
                totalSavings < 0 && styles.negativeSavings,
              ]}
            >
              ₹{totalSavings.toLocaleString()}
            </Text>
            <Text style={styles.balanceHint}>
              Opening + paid net for this month
            </Text>
          </View>
        </View>

        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <View style={styles.monthNavigation}>
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
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => setShowReportOptions(true)}
          >
            <Ionicons name="bar-chart" size={18} color="#1a73e8" />
            <Text style={styles.reportButtonText}>Generate Report</Text>
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
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
              <TransactionItem key={payment.id} payment={payment} />
            ))
          )}
        </View>
      </ScrollView>
      <Modal
        transparent
        animationType="fade"
        visible={showReportOptions}
        onRequestClose={() => setShowReportOptions(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModal}>
            <Text style={styles.reportModalTitle}>Download Report</Text>
            <Text style={styles.reportModalSubtitle}>
              Choose a format for the selected month.
            </Text>
            <TouchableOpacity
              style={styles.reportFormatButton}
              onPress={() => {
                setShowReportOptions(false);
                handleDownloadExcel();
              }}
            >
              <Ionicons name="grid-outline" size={20} color="#16803a" />
              <Text style={styles.reportFormatText}>Download Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportFormatButton}
              onPress={() => {
                handleDownloadPdf();
              }}
            >
              <Ionicons
                name="document-text-outline"
                size={20}
                color="#dc2626"
              />
              <Text style={styles.reportFormatText}>Download PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReportOptions(false)}>
              <Text style={styles.reportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        animationType="fade"
        visible={showOpeningBalanceEditor}
        onRequestClose={() => setShowOpeningBalanceEditor(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModal}>
            <Text style={styles.reportModalTitle}>Set Opening Balance</Text>
            <Text style={styles.reportModalSubtitle}>
              Enter the balance you had before using AI Khata. Future months
              carry it forward automatically.
            </Text>
            <TextInput
              autoFocus
              keyboardType="numeric"
              placeholder="0"
              style={styles.openingBalanceInput}
              value={openingBalanceInput}
              onChangeText={(value) =>
                setOpeningBalanceInput(value.replace(/[^0-9]/g, ""))
              }
            />
            <View style={styles.openingBalanceActions}>
              <TouchableOpacity
                onPress={() => setShowOpeningBalanceEditor(false)}
              >
                <Text style={styles.reportCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveOpeningBalanceButton}
                onPress={saveOpeningBalance}
              >
                <Text style={styles.saveOpeningBalanceText}>Save Balance</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  monthNavigation: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  monthNavButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1a73e8",
  },
  reportButtonText: {
    color: "#1a73e8",
    fontSize: 12,
    fontWeight: "600",
  },
  reportModalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  reportModal: {
    backgroundColor: "#fff",
    borderRadius: 8,
    maxWidth: 360,
    padding: 20,
    width: "100%",
  },
  reportModalTitle: { color: "#111", fontSize: 19, fontWeight: "700" },
  reportModalSubtitle: { color: "#666", fontSize: 13, marginTop: 6 },
  reportFormatButton: {
    alignItems: "center",
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  reportFormatText: { color: "#222", fontSize: 15, fontWeight: "600" },
  reportCancelText: {
    color: "#1a73e8",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 18,
    textAlign: "right",
  },
  balancePanel: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe7f8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 16,
    padding: 16,
  },
  balanceLabel: { color: "#555", fontSize: 13, fontWeight: "600" },
  balanceAmount: {
    color: "#1a73e8",
    fontSize: 21,
    fontWeight: "700",
    marginTop: 5,
  },
  totalSavingsAmount: {
    color: "#16803a",
    fontSize: 21,
    fontWeight: "700",
    marginTop: 5,
  },
  negativeSavings: { color: "#dc2626" },
  balanceHint: { color: "#777", fontSize: 11, marginTop: 4 },
  balanceEditButton: { marginLeft: 10, padding: 8 },
  totalSavingsDivider: {
    backgroundColor: "#e5e7eb",
    height: 48,
    marginHorizontal: 16,
    width: 1,
  },
  openingBalanceInput: {
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 17,
    height: 48,
    marginTop: 18,
    paddingHorizontal: 12,
  },
  openingBalanceActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  saveOpeningBalanceButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 7,
    marginLeft: 18,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  saveOpeningBalanceText: { color: "#fff", fontSize: 14, fontWeight: "700" },
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

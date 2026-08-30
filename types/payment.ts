export type PaymentCategory =
  | "maintenance" // flat owner -> apartment
  | "rent" // individual home rent
  | "electricity"
  | "water"
  | "salary" // paid to staff
  | "other";

export type PaymentStatus = "paid" | "due" | "overdue";

export interface BasePayment {
  id: string;
  accountId: string;
  category: PaymentCategory;
  amount: number;
  dueDate: string; // ISO date
  paidDate?: string;
  status: PaymentStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePayment extends BasePayment {
  category: "maintenance";
  memberId: string; // flat owner id
  flatNumber: string;
  month: string; // "2026-08"
}

export interface RentPayment extends BasePayment {
  category: "rent";
  month: string;
  tenantName?: string;
  propertyAddress?: string;
}

export interface BillPayment extends BasePayment {
  category: "electricity" | "water";
  billNumber?: string;
  units?: number; // for electricity
  provider?: string; // electricity board, water department
}

export interface SalaryPayment extends BasePayment {
  category: "salary";
  memberId: string; // staff id
  month: string;
  presentDays?: number; // pulled from attendance for calculation
  baseSalary?: number; // original salary before deductions
  deductions?: number;
  advances?: number;
  netPayable?: number;
}

export type Payment =
  | MaintenancePayment
  | RentPayment
  | BillPayment
  | SalaryPayment;

// Input types for creating/updating payments
export interface AddPaymentInput {
  accountId: string;
  category: PaymentCategory;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  paidDate?: string;
  description?: string;
  // Maintenance specific
  memberId?: string;
  flatNumber?: string;
  month?: string;
  // Rent specific
  tenantName?: string;
  propertyAddress?: string;
  // Bill specific
  billNumber?: string;
  units?: number;
  provider?: string;
  // Salary specific
  presentDays?: number;
  baseSalary?: number;
  deductions?: number;
  advances?: number;
  netPayable?: number;
}

export interface UpdatePaymentInput {
  category?: PaymentCategory;
  amount?: number;
  dueDate?: string;
  status?: PaymentStatus;
  paidDate?: string;
  description?: string;
  // Maintenance specific
  memberId?: string;
  flatNumber?: string;
  month?: string;
  // Rent specific
  tenantName?: string;
  propertyAddress?: string;
  // Bill specific
  billNumber?: string;
  units?: number;
  provider?: string;
  // Salary specific
  presentDays?: number;
  baseSalary?: number;
  deductions?: number;
  advances?: number;
  netPayable?: number;
}

export interface PaymentSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  totalPaid: number;
  totalDue: number;
  totalOverdue: number;
  byCategory: {
    maintenance: number;
    rent: number;
    electricity: number;
    water: number;
    salary: number;
    other: number;
  };
  byStatus: {
    paid: number;
    due: number;
    overdue: number;
  };
  month: string;
  year: number;
}

// Helper type for payment with category-specific fields
export type PaymentWithCategory<T extends PaymentCategory> = Extract<
  Payment,
  { category: T }
>;

// Type guard functions
export function isMaintenancePayment(
  payment: Payment,
): payment is MaintenancePayment {
  return payment.category === "maintenance";
}

export function isRentPayment(payment: Payment): payment is RentPayment {
  return payment.category === "rent";
}

export function isBillPayment(payment: Payment): payment is BillPayment {
  return payment.category === "electricity" || payment.category === "water";
}

export function isSalaryPayment(payment: Payment): payment is SalaryPayment {
  return payment.category === "salary";
}

// Payment category metadata
export const PAYMENT_CATEGORY_META: Record<
  PaymentCategory,
  {
    label: string;
    icon: string;
    color: string;
    isIncome: boolean;
    isExpense: boolean;
  }
> = {
  maintenance: {
    label: "Maintenance",
    icon: "construct-outline",
    color: "#FF9800",
    isIncome: true,
    isExpense: false,
  },
  rent: {
    label: "Rent",
    icon: "home-outline",
    color: "#2196F3",
    isIncome: true,
    isExpense: false,
  },
  electricity: {
    label: "Electricity",
    icon: "flash-outline",
    color: "#F44336",
    isIncome: false,
    isExpense: true,
  },
  water: {
    label: "Water",
    icon: "water-outline",
    color: "#00BCD4",
    isIncome: false,
    isExpense: true,
  },
  salary: {
    label: "Salary",
    icon: "cash-outline",
    color: "#4CAF50",
    isIncome: false,
    isExpense: true,
  },
  other: {
    label: "Other",
    icon: "receipt-outline",
    color: "#9E9E9E",
    isIncome: false,
    isExpense: true,
  },
};

// Payment status metadata
export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  {
    label: string;
    color: string;
    icon: string;
  }
> = {
  paid: {
    label: "Paid",
    color: "#4CAF50",
    icon: "checkmark-circle",
  },
  due: {
    label: "Due",
    color: "#FF9800",
    icon: "time-outline",
  },
  overdue: {
    label: "Overdue",
    color: "#F44336",
    icon: "alert-circle",
  },
};

// Helper function to get category label
export function getPaymentCategoryLabel(category: PaymentCategory): string {
  return PAYMENT_CATEGORY_META[category].label;
}

// Helper function to get category icon
export function getPaymentCategoryIcon(category: PaymentCategory): string {
  return PAYMENT_CATEGORY_META[category].icon;
}

// Helper function to get category color
export function getPaymentCategoryColor(category: PaymentCategory): string {
  return PAYMENT_CATEGORY_META[category].color;
}

// Helper function to check if category is income
export function isIncomeCategory(category: PaymentCategory): boolean {
  return PAYMENT_CATEGORY_META[category].isIncome;
}

// Helper function to check if category is expense
export function isExpenseCategory(category: PaymentCategory): boolean {
  return PAYMENT_CATEGORY_META[category].isExpense;
}

// Helper function to get status label
export function getPaymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_META[status].label;
}

// Helper function to get status color
export function getPaymentStatusColor(status: PaymentStatus): string {
  return PAYMENT_STATUS_META[status].color;
}

// Helper function to format currency
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// Helper function to get month name
export function getMonthName(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

// Helper function to get current month
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Helper function to format date
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Helper function to get days until due
export function getDaysUntilDue(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Helper function to get status based on due date
export function getStatusFromDueDate(dueDate: string): PaymentStatus {
  const daysUntilDue = getDaysUntilDue(dueDate);
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= 3) return "due";
  return "paid";
}

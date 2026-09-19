// types/member.ts

// NEW: Transaction type for income/expense distinction
export type TransactionKind = "expense" | "income";

export type MemberRole = string;

export interface BillAttachment {
  uri: string;
  name: string;
  mimeType?: string | null;
}

export interface MemberDetailsSnapshot {
  effectiveMonth: string;
  details: Partial<Member>;
  changeSummary?: string;
}

export interface MonthlyPayment {
  status: "paid" | "due";
  paidDate?: string;

  additionalAmount?: number;
  additionalNote?: string;

  deductionAmount?: number;
  deductionNote?: string;

  // Final amount:
  // base amount + additional amount - deduction
  netAmount?: number;
}

export interface BaseMember {
  id: string;
  groupId: string;
  name: string;
  phone: string;
  role: MemberRole;

  photoUri?: string;

  paymentStatus?: "paid" | "due";
  paidDate?: string;

  additionalAmount?: number;
  additionalNote?: string;

  deductionAmount?: number;
  deductionNote?: string;

  monthlyPayments?: Record<string, MonthlyPayment>;

  detailsHistory?: MemberDetailsSnapshot[];

  createdAt: string;
  updatedAt: string;
}

export interface FlatOwner extends BaseMember {
  role: "owner" | "secretary" | "tenant";

  wing?: string;

  flatNumber: string;

  /**
   * Pre-computed display value for the "Unit" field on the Home card.
   * Example: "A · 204" or just "204" when wing is missing.
   * Populated by mapRowToMember in hooks/useManagement.ts.
   */
  unit?: string;

  areaSqft?: number;

  parkingAvailable: boolean;

  maintenanceAmount: number;

  maintenancePaid?: boolean;
}

export interface Staff extends BaseMember {
  role: "sweeper" | "security" | "maintenance";

  monthlySalary: number;

  /**
   * Date the staff member joined, in YYYY-MM-DD form.
   * Sourced from the server's `joined_date` column when present, otherwise
   * falls back to `created_at`. Populated by mapRowToMember in
   * hooks/useManagement.ts.
   */
  joinedDate?: string;
}

// UPDATED: ExpenseEntry now supports both expense and income
export interface ExpenseEntry extends BaseMember {
  // Updated role to include both expense and income categories
  role: // Expense categories
    | "electricity"
    | "water"
    | "maintenance"
    | "other"
    // Income categories
    | "hall_rent"
    | "parking_rent"
    | "advertisement"
    | "interest"
    | "other_income"
    // Keep string for custom values
    | string;

  amount: number;

  // NEW: Transaction type to distinguish income from expense
  transactionType?: TransactionKind;

  dueDate?: string;

  status?: "paid" | "due";

  reminderEnabled?: boolean;

  description?: string;

  billUri?: string;

  billName?: string;

  billAttachments?: BillAttachment[];
}

export type Member = FlatOwner | Staff | ExpenseEntry;

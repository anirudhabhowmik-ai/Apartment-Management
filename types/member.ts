// types/member.ts

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

  netAmount?: number;
}

export interface BaseMember {
  id: string;

  /**
   * FK to `users.id`. Every member / staff row links to exactly one
   * user, which is where name / phone / photo live. Rows created
   * before the identity split may briefly have `userId = null` until
   * the backfill picks them up.
   */
  userId?: string | null;

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

  unit?: string;

  areaSqft?: number;

  parkingAvailable: boolean;

  maintenanceAmount: number;

  maintenancePaid?: boolean;
}

export interface Staff extends BaseMember {
  role: "sweeper" | "security" | "maintenance";

  monthlySalary: number;

  joinedDate?: string;
}

export interface ExpenseEntry extends BaseMember {
  role:
    | "electricity"
    | "water"
    | "maintenance"
    | "other"
    | "hall_rent"
    | "parking_rent"
    | "advertisement"
    | "interest"
    | "other_income"
    | string;

  amount: number;

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

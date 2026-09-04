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

  areaSqft?: number;

  parkingAvailable: boolean;

  maintenanceAmount: number;

  maintenancePaid?: boolean;
}

export interface Staff extends BaseMember {
  role: "sweeper" | "security" | "maintenance";

  monthlySalary: number;
}

export interface ExpenseEntry extends BaseMember {
  role: "electricity" | "water" | "maintenance" | "other";

  amount: number;

  dueDate?: string;

  status?: "paid" | "due";

  reminderEnabled?: boolean;

  description?: string;

  billUri?: string;

  billName?: string;

  billAttachments?: BillAttachment[];
}

export type Member = FlatOwner | Staff | ExpenseEntry;

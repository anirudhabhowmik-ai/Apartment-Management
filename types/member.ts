export type MemberRole = string;

export interface BillAttachment {
  uri: string;
  name: string;
  mimeType?: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface FlatOwner extends BaseMember {
  role: "owner" | "secretary" | "tenant";
  wing?: string; // Building section like A, B, C Wing
  flatNumber: string;
  areaSqft?: number;
  parkingAvailable: boolean;
  maintenanceAmount: number; // monthly maintenance for this flat
  maintenancePaid?: boolean; // whether this month's maintenance is paid
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

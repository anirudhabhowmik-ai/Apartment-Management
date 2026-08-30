export type MemberRole =
  | "owner"
  | "secretary"
  | "tenant"
  | "sweeper"
  | "security"
  | "maintenance"
  | "electricity"
  | "water"
  | "other";

export interface BaseMember {
  id: string;
  groupId: string;
  name: string;
  phone: string;
  role: MemberRole;
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
  description?: string;
}

export type Member = FlatOwner | Staff | ExpenseEntry;

export type GroupType = "apartment" | "staff" | "expense";

export interface BaseGroup {
  id: string;
  accountId: string; // belongs to which apartment/home
  type: GroupType;
  name: string;
  expenseTypes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApartmentGroup extends BaseGroup {
  type: "apartment";
}

export interface StaffGroup extends BaseGroup {
  type: "staff";
}

export interface ExpenseGroup extends BaseGroup {
  type: "expense";
  expenseTypes: string[];
}

export type Group = ApartmentGroup | StaffGroup | ExpenseGroup;

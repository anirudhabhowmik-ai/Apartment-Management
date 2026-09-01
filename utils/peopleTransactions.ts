import { Member } from "../types";
import { PaymentCategory, PaymentStatus } from "../types/payment";

const expenseCategories: PaymentCategory[] = ["electricity", "water", "other"];

export interface PeopleTransaction {
  id: string;
  category: PaymentCategory;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  description?: string;
  memberId?: string;
  memberName?: string;
  phone?: string;
  memberRole?: string;
  wing?: string;
  flatNumber?: string;
}

const getPaymentForMonth = (member: Member, month: string) => {
  if (member.monthlyPayments?.[month]) return member.monthlyPayments[month];
  if (member.paidDate?.slice(0, 7) === month) {
    return {
      status: member.paymentStatus ?? "due",
      additionalAmount: member.additionalAmount,
      deductionAmount: member.deductionAmount,
    };
  }
  return { status: "due" as const };
};

export const getPeopleTransactions = (
  members: Member[],
  month: string,
): PeopleTransaction[] =>
  members.flatMap<PeopleTransaction>((member) => {
    if (member.createdAt.slice(0, 7) > month) return [];

    if ("maintenanceAmount" in member) {
      const payment = getPaymentForMonth(member, month);
      return [
        {
          id: `${member.id}:${month}`,
          category: "maintenance" as const,
          amount:
            member.maintenanceAmount +
            (payment.additionalAmount || 0) -
            (payment.deductionAmount || 0),
          dueDate: `${month}-01`,
          status: payment.status,
          memberId: member.id,
          memberName: member.name,
          phone: member.phone,
          wing: member.wing,
          flatNumber: member.flatNumber,
        },
      ];
    }

    if ("monthlySalary" in member) {
      const payment = getPaymentForMonth(member, month);
      return [
        {
          id: `${member.id}:${month}`,
          category: "salary" as const,
          amount:
            member.monthlySalary +
            (payment.additionalAmount || 0) -
            (payment.deductionAmount || 0),
          dueDate: `${month}-01`,
          status: payment.status,
          memberId: member.id,
          memberName: member.name,
          phone: member.phone,
          memberRole: member.role,
          description: member.name,
        },
      ];
    }

    if ("amount" in member && member.dueDate?.slice(0, 7) === month) {
      const category = expenseCategories.includes(
        member.role as PaymentCategory,
      )
        ? (member.role as PaymentCategory)
        : "other";
      return [
        {
          id: member.id,
          category,
          amount: member.amount,
          dueDate: member.dueDate,
          status: member.status || "due",
          description: member.description || member.name,
        },
      ];
    }

    return [];
  });

export const getPeopleSummary = (transactions: PeopleTransaction[]) => {
  const income = transactions
    .filter(
      (transaction) =>
        transaction.category === "maintenance" && transaction.status === "paid",
    )
    .reduce((total, transaction) => total + transaction.amount, 0);
  const expenses = transactions
    .filter(
      (transaction) =>
        transaction.category !== "maintenance" && transaction.status === "paid",
    )
    .reduce((total, transaction) => total + transaction.amount, 0);

  return { income, expenses, net: income - expenses };
};

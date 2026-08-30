import { create } from "zustand";
import { Payment, PaymentCategory, PaymentStatus } from "../types/payment";

interface PaymentStore {
  payments: Payment[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setPayments: (payments: Payment[]) => void;
  addPayment: (payment: Payment) => void;
  updatePayment: (id: string, updates: Partial<Payment>) => void;
  deletePayment: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selectors
  getPaymentsByAccount: (accountId: string) => Payment[];
  getPaymentsByCategory: (category: PaymentCategory) => Payment[];
  getPaymentsByStatus: (status: PaymentStatus) => Payment[];
  getPendingPayments: () => Payment[];
  getPaymentsByDateRange: (startDate: string, endDate: string) => Payment[];
  getPaymentsByMonth: (month: string) => Payment[];
  getPaymentSummary: (accountId: string) => {
    totalIncome: number;
    totalExpense: number;
    totalPaid: number;
    totalDue: number;
    totalOverdue: number;
    byCategory: Record<PaymentCategory, number>;
  };
}

export const usePaymentStore = create<PaymentStore>((set, get) => ({
  payments: [],
  isLoading: false,
  error: null,

  setPayments: (payments) => set({ payments }),

  addPayment: (payment) =>
    set((state) => ({
      payments: [payment, ...state.payments],
    })),

  updatePayment: (id, updates) =>
    set((state: any) => ({
      payments: state.payments.map((p: any) =>
        p.id === id
          ? { ...p, ...updates, updatedAt: new Date().toISOString() }
          : p,
      ),
    })),

  deletePayment: (id) =>
    set((state) => ({
      payments: state.payments.filter((p) => p.id !== id),
    })),

  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  getPaymentsByAccount: (accountId) => {
    return get().payments.filter((p) => p.accountId === accountId);
  },

  getPaymentsByCategory: (category) => {
    return get().payments.filter((p) => p.category === category);
  },

  getPaymentsByStatus: (status) => {
    return get().payments.filter((p) => p.status === status);
  },

  getPendingPayments: () => {
    return get().payments.filter(
      (p) => p.status === "due" || p.status === "overdue",
    );
  },

  getPaymentsByDateRange: (startDate, endDate) => {
    return get().payments.filter(
      (p) => p.dueDate >= startDate && p.dueDate <= endDate,
    );
  },

  getPaymentsByMonth: (month) => {
    return get().payments.filter((p) => {
      // Check if payment has month field (maintenance, rent, salary)
      if ("month" in p && p.month) {
        return p.month === month;
      }
      // For bills, check dueDate
      const dueMonth = new Date(p.dueDate).toISOString().slice(0, 7);
      return dueMonth === month;
    });
  },

  getPaymentSummary: (accountId) => {
    const accountPayments = get().payments.filter(
      (p) => p.accountId === accountId,
    );

    const incomeCategories: PaymentCategory[] = ["rent", "maintenance"];
    const expenseCategories: PaymentCategory[] = [
      "salary",
      "electricity",
      "water",
      "other",
    ];

    const totalIncome = accountPayments
      .filter(
        (p) => incomeCategories.includes(p.category) && p.status === "paid",
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const totalExpense = accountPayments
      .filter(
        (p) => expenseCategories.includes(p.category) && p.status === "paid",
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const totalPaid = accountPayments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0);

    const totalDue = accountPayments
      .filter((p) => p.status === "due")
      .reduce((sum, p) => sum + p.amount, 0);

    const totalOverdue = accountPayments
      .filter((p) => p.status === "overdue")
      .reduce((sum, p) => sum + p.amount, 0);

    const byCategory: Record<PaymentCategory, number> = {
      maintenance: 0,
      rent: 0,
      electricity: 0,
      water: 0,
      salary: 0,
      other: 0,
    };

    accountPayments.forEach((p) => {
      byCategory[p.category] = (byCategory[p.category] || 0) + p.amount;
    });

    return {
      totalIncome,
      totalExpense,
      totalPaid,
      totalDue,
      totalOverdue,
      byCategory,
    };
  },
}));

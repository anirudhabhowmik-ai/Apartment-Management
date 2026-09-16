// hooks/usePayments.ts
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect } from "react";
import { usePaymentStore } from "../store/paymentStore";
import {
  AddPaymentInput,
  BillPayment,
  MaintenancePayment,
  Payment,
  PaymentCategory,
  PaymentStatus,
  PaymentSummary,
  RentPayment,
  SalaryPayment,
  UpdatePaymentInput,
} from "../types/payment";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("auth_token");
  } catch {
    return null;
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.message ?? `Request failed (${res.status})`,
    );
    err.status = res.status;
    err.code = data?.code;
    err.body = data;
    err.path = path;
    err.method = options.method ?? "GET";
    console.error(
      `[usePayments] ${err.method} ${path} → ${res.status}`,
      JSON.stringify(data),
    );
    throw err;
  }

  return data as T;
}

function safeNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const truncated = Math.trunc(n);
  if (truncated <= 0) return null;
  return truncated;
}

function toNullableNote(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

export interface UpsertPaymentPayload {
  status: "paid" | "due";
  paidDate?: string | null;
  additionalAmount?: number | null;
  additionalNote?: string | null;
  deductionAmount?: number | null;
  deductionNote?: string | null;
}

function sanitizeUpsertPayload(
  payload: UpsertPaymentPayload,
): UpsertPaymentPayload {
  return {
    status: payload.status === "due" ? "due" : "paid",
    paidDate:
      payload.paidDate && typeof payload.paidDate === "string"
        ? payload.paidDate
        : null,
    additionalAmount: toNullableAmount(payload.additionalAmount),
    additionalNote: toNullableNote(payload.additionalNote),
    deductionAmount: toNullableAmount(payload.deductionAmount),
    deductionNote: toNullableNote(payload.deductionNote),
  };
}

async function fetchPayments(accountId: string): Promise<Payment[]> {
  const now = new Date().toISOString();
  return [
    {
      id: "p1",
      accountId,
      category: "salary",
      amount: 12000,
      dueDate: new Date(2026, 8, 1).toISOString(),
      paidDate: new Date(2026, 8, 1).toISOString(),
      status: "paid",
      createdAt: now,
      updatedAt: now,
      memberId: "m3",
      month: "2026-08",
      presentDays: 26,
    } as SalaryPayment,
    {
      id: "p2",
      accountId,
      category: "electricity",
      amount: 3200,
      dueDate: new Date(2026, 8, 15).toISOString(),
      status: "due",
      createdAt: now,
      updatedAt: now,
      billNumber: "EB-2026-08-001",
      units: 450,
    } as BillPayment,
    {
      id: "p3",
      accountId,
      category: "maintenance",
      amount: 2500,
      dueDate: new Date(2026, 8, 10).toISOString(),
      status: "due",
      createdAt: now,
      updatedAt: now,
      memberId: "m1",
      flatNumber: "101",
      month: "2026-08",
    } as MaintenancePayment,
  ];
}

async function createPaymentApi(input: AddPaymentInput): Promise<Payment> {
  const now: string = new Date().toISOString();
  const basePayment = {
    id: `pay_${Date.now()}`,
    accountId: input.accountId,
    category: input.category,
    amount: input.amount,
    dueDate: input.dueDate,
    status: input.status,
    paidDate: input.paidDate,
    createdAt: now,
    updatedAt: now,
  };

  switch (input.category) {
    case "maintenance":
      return {
        ...basePayment,
        category: "maintenance",
        memberId: input.memberId!,
        flatNumber: input.flatNumber!,
        month: input.month!,
      } as MaintenancePayment;
    case "rent":
      return {
        ...basePayment,
        category: "rent",
        month: input.month!,
      } as RentPayment;
    case "electricity":
    case "water":
      return {
        ...basePayment,
        category: input.category,
        billNumber: input.billNumber,
        units: input.units,
      } as BillPayment;
    case "salary":
      return {
        ...basePayment,
        category: "salary",
        memberId: input.memberId!,
        month: input.month!,
        presentDays: input.presentDays,
      } as SalaryPayment;
    default:
      return basePayment as Payment;
  }
}

async function updatePaymentApi(
  id: string,
  updates: Partial<Payment>,
): Promise<Payment> {
  return {
    id,
    ...updates,
    updatedAt: new Date().toISOString(),
  } as Payment;
}

async function deletePaymentApi(id: string): Promise<void> {
  console.log("Deleting payment:", id);
}

export function usePayments(accountId?: string) {
  const {
    payments,
    isLoading,
    error,
    setPayments,
    addPayment,
    updatePayment,
    deletePayment,
    setIsLoading,
    setError,
    getPaymentsByAccount,
    getPaymentsByCategory,
    getPaymentsByStatus,
    getPendingPayments,
    getPaymentsByDateRange,
    getPaymentsByMonth,
    getPaymentSummary,
  } = usePaymentStore();

  useEffect(() => {
    if (!accountId) return;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const data: Payment[] = await fetchPayments(accountId);
        setPayments(data);
      } catch (error: any) {
        setError(error.message || "Failed to load payments");
        console.error("Error fetching payments:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [accountId, setPayments, setIsLoading, setError]);

  const upsertMemberPayment = useCallback(
    async (
      memberId: string,
      month: string,
      payload: UpsertPaymentPayload,
    ): Promise<any> => {
      if (!accountId) throw new Error("No account selected");
      setIsLoading(true);
      setError(null);
      try {
        const clean = sanitizeUpsertPayload(payload);
        const row = await apiRequest<any>(
          `/management/${accountId}/members/${memberId}/payments/${month}`,
          { method: "PUT", body: JSON.stringify(clean) },
        );
        return row;
      } catch (error: any) {
        setError(error.message || "Failed to save member payment");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [accountId, setIsLoading, setError],
  );

  const upsertStaffPayment = useCallback(
    async (
      staffId: string,
      month: string,
      payload: UpsertPaymentPayload,
    ): Promise<any> => {
      if (!accountId) throw new Error("No account selected");
      setIsLoading(true);
      setError(null);
      try {
        const clean = sanitizeUpsertPayload(payload);
        const row = await apiRequest<any>(
          `/management/${accountId}/staff/${staffId}/payments/${month}`,
          { method: "PUT", body: JSON.stringify(clean) },
        );
        return row;
      } catch (error: any) {
        setError(error.message || "Failed to save staff payment");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [accountId, setIsLoading, setError],
  );

  const addNewPayment = useCallback(
    async (input: AddPaymentInput): Promise<Payment> => {
      try {
        setIsLoading(true);
        setError(null);
        const newPayment: Payment = await createPaymentApi(input);
        addPayment(newPayment);
        return newPayment;
      } catch (error: any) {
        setError(error.message || "Failed to add payment");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [addPayment, setIsLoading, setError],
  );

  const editPayment = useCallback(
    async (id: string, input: UpdatePaymentInput): Promise<Payment> => {
      try {
        setIsLoading(true);
        setError(null);
        const updatedPayment: Payment = await updatePaymentApi(
          id,
          input as any,
        );
        updatePayment(id, updatedPayment);
        return updatedPayment;
      } catch (error: any) {
        setError(error.message || "Failed to update payment");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updatePayment, setIsLoading, setError],
  );

  const removePayment = useCallback(
    async (id: string): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);
        await deletePaymentApi(id);
        deletePayment(id);
      } catch (error: any) {
        setError(error.message || "Failed to delete payment");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [deletePayment, setIsLoading, setError],
  );

  const markAsPaid = useCallback(
    async (id: string): Promise<Payment> => {
      try {
        setIsLoading(true);
        setError(null);
        const paidDate: string = new Date().toISOString();
        const updatedPayment: Payment = await updatePaymentApi(id, {
          status: "paid" as PaymentStatus,
          paidDate,
        });
        updatePayment(id, updatedPayment);
        return updatedPayment;
      } catch (error: any) {
        setError(error.message || "Failed to mark payment as paid");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updatePayment, setIsLoading, setError],
  );

  const getPaymentById = useCallback(
    <T extends Payment = Payment>(id: string): T | undefined => {
      return payments.find((payment: Payment) => payment.id === id) as
        | T
        | undefined;
    },
    [payments],
  );

  const getPaymentsByCategoryFilter = useCallback(
    (category: PaymentCategory): Payment[] => {
      return getPaymentsByCategory(category);
    },
    [getPaymentsByCategory],
  );

  const getPaymentsByStatusFilter = useCallback(
    (status: PaymentStatus): Payment[] => {
      return getPaymentsByStatus(status);
    },
    [getPaymentsByStatus],
  );

  const getPendingPaymentsFilter = useCallback((): Payment[] => {
    return getPendingPayments();
  }, [getPendingPayments]);

  const getPaymentsByDateRangeFilter = useCallback(
    (startDate: string, endDate: string): Payment[] => {
      return getPaymentsByDateRange(startDate, endDate);
    },
    [getPaymentsByDateRange],
  );

  const getPaymentsByMonthFilter = useCallback(
    (month: string): Payment[] => {
      return getPaymentsByMonth(month);
    },
    [getPaymentsByMonth],
  );

  const getMonthlySummary = useCallback(
    (month?: string): PaymentSummary => {
      const targetMonth: string = month ?? new Date().toISOString().slice(0, 7);
      const monthlyPayments: Payment[] = getPaymentsByMonth(targetMonth);

      const incomeCategories: PaymentCategory[] = ["rent", "maintenance"];
      const expenseCategories: PaymentCategory[] = [
        "salary",
        "electricity",
        "water",
        "other",
      ];

      const totalIncome: number = monthlyPayments
        .filter(
          (payment: Payment) =>
            incomeCategories.includes(payment.category) &&
            payment.status === "paid",
        )
        .reduce((sum: number, payment: Payment) => sum + payment.amount, 0);

      const totalExpense: number = monthlyPayments
        .filter(
          (payment: Payment) =>
            expenseCategories.includes(payment.category) &&
            payment.status === "paid",
        )
        .reduce((sum: number, payment: Payment) => sum + payment.amount, 0);

      const totalPaid: number = monthlyPayments
        .filter((payment: Payment) => payment.status === "paid")
        .reduce((sum: number, payment: Payment) => sum + payment.amount, 0);

      const totalDue: number = monthlyPayments
        .filter((payment: Payment) => payment.status === "due")
        .reduce((sum: number, payment: Payment) => sum + payment.amount, 0);

      const totalOverdue: number = monthlyPayments
        .filter((payment: Payment) => payment.status === "overdue")
        .reduce((sum: number, payment: Payment) => sum + payment.amount, 0);

      const byCategory: Record<PaymentCategory, number> = {
        maintenance: 0,
        rent: 0,
        electricity: 0,
        water: 0,
        salary: 0,
        other: 0,
      };

      const byStatus: Record<PaymentStatus, number> = {
        paid: 0,
        due: 0,
        overdue: 0,
      };

      monthlyPayments.forEach((payment: Payment) => {
        byCategory[payment.category] =
          (byCategory[payment.category] || 0) + payment.amount;
        byStatus[payment.status] =
          (byStatus[payment.status] || 0) + payment.amount;
      });

      const [yearStr, monthNumStr] = targetMonth.split("-");
      const year: number = parseInt(yearStr, 10);
      const monthName: string = new Date(
        year,
        parseInt(monthNumStr, 10) - 1,
        1,
      ).toLocaleString("default", { month: "long" });

      return {
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
        totalPaid,
        totalDue,
        totalOverdue,
        byCategory,
        byStatus,
        month: monthName,
        year,
      };
    },
    [getPaymentsByMonth],
  );

  const getAccountPaymentSummary = useCallback((): PaymentSummary | null => {
    if (!accountId) return null;
    const summary = getPaymentSummary(accountId);
    if (!summary) return null;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const [yearStr, monthNumStr] = currentMonth.split("-");
    const year: number = parseInt(yearStr, 10);
    const monthName: string = new Date(
      year,
      parseInt(monthNumStr, 10) - 1,
      1,
    ).toLocaleString("default", { month: "long" });

    const byStatus: Record<PaymentStatus, number> = {
      paid: summary.totalPaid,
      due: summary.totalDue,
      overdue: summary.totalOverdue,
    };

    return {
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      net: summary.totalIncome - summary.totalExpense,
      totalPaid: summary.totalPaid,
      totalDue: summary.totalDue,
      totalOverdue: summary.totalOverdue,
      byCategory: summary.byCategory,
      byStatus,
      month: monthName,
      year,
    };
  }, [accountId, getPaymentSummary]);

  return {
    payments: accountId ? getPaymentsByAccount(accountId) : [],
    isLoading,
    error,

    upsertMemberPayment,
    upsertStaffPayment,

    addNewPayment,
    editPayment,
    removePayment,
    markAsPaid,

    getPaymentById,
    getPaymentsByCategory: getPaymentsByCategoryFilter,
    getPaymentsByStatus: getPaymentsByStatusFilter,
    getPendingPayments: getPendingPaymentsFilter,
    getPaymentsByDateRange: getPaymentsByDateRangeFilter,
    getPaymentsByMonth: getPaymentsByMonthFilter,
    getMonthlySummary,
    getPaymentSummary: getAccountPaymentSummary,
  };
}

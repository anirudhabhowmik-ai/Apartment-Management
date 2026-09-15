// hooks/useManagement.ts
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import {
  ExpenseEntry,
  FlatOwner,
  ManagementType,
  Member,
  Staff,
} from "../types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// ---------------------------------------------------------------------------
// Stable empty array
// ---------------------------------------------------------------------------
const EMPTY_MEMBERS: Member[] = [];

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------
async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("auth_token");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------
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
    throw err;
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Endpoint segment per type
// ---------------------------------------------------------------------------
function endpointFor(type: ManagementType): string {
  switch (type) {
    case "apartment":
      return "members";
    case "staff":
      return "staff";
    case "expense":
      return "expenses";
  }
}

// ---------------------------------------------------------------------------
// Timezone-safe date-only normalizer for server values.
// ---------------------------------------------------------------------------
function serverDateToLocalDateString(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return undefined;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const d = new Date(s);
    if (isNaN(d.getTime())) {
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : undefined;
    }
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${dd}`;
  }

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return undefined;
    const y = raw.getFullYear();
    const mo = String(raw.getMonth() + 1).padStart(2, "0");
    const dd = String(raw.getDate()).padStart(2, "0");
    return `${y}-${mo}-${dd}`;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Write path: local "YYYY-MM-DD" → ISO timestamp anchored at LOCAL noon.
// ---------------------------------------------------------------------------
function localDateStringToServerISO(local: unknown): string | null {
  if (local === null || local === undefined) return null;
  if (typeof local !== "string") return null;

  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const localNoon = new Date(y, mo, d, 12, 0, 0, 0);
  if (isNaN(localNoon.getTime())) return null;
  return localNoon.toISOString();
}

// ---------------------------------------------------------------------------
// server row → frontend Member
// ---------------------------------------------------------------------------
function mapRowToMember(
  row: any,
  accountId: string,
  kind: ManagementType,
): Member {
  const segment = endpointFor(kind);
  const groupId = `${accountId}:${segment}`;

  const base = {
    id: row.id,
    groupId,
    name: row.name ?? "",
    phone: row.phone ?? "",
    photoUri: row.photo_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // ── payment-related fields (mapped for every kind) ──
    paymentStatus: row.payment_status ?? row.status ?? undefined,
    paidDate: row.paid_date ?? undefined,
    additionalAmount: row.additional_amount ?? undefined,
    additionalNote: row.additional_note ?? undefined,
    deductionAmount: row.deduction_amount ?? undefined,
    deductionNote: row.deduction_note ?? undefined,
    monthlyPayments: row.monthly_payments ?? undefined,
    detailsHistory: undefined,
  };

  if (kind === "apartment") {
    return {
      ...base,
      role: row.role,
      wing: row.wing ?? undefined,
      flatNumber: row.flat_number,
      areaSqft: row.area_sqft ?? undefined,
      parkingAvailable: !!row.parking_available,
      maintenanceAmount: Number(row.maintenance_amount ?? 0),
    } as FlatOwner;
  }

  if (kind === "staff") {
    return {
      ...base,
      role: row.role,
      monthlySalary: Number(row.monthly_salary ?? 0),
    } as Staff;
  }

  // ── expense ──
  return {
    ...base,
    role: row.category ?? row.role ?? "other",
    name: row.title ?? row.name ?? "",
    amount: Number(row.amount ?? 0),
    transactionType: row.transaction_type ?? "expense",
    dueDate: serverDateToLocalDateString(row.expense_date),
    status: row.status ?? "paid",
    reminderEnabled: !!row.reminder_enabled,
    description: row.description ?? undefined,
    billAttachments: row.bill_attachments ?? [],
  } as ExpenseEntry;
}

// ---------------------------------------------------------------------------
// frontend input → server body
// ---------------------------------------------------------------------------
function toServerBody(input: any, kind: ManagementType): Record<string, any> {
  const body: Record<string, any> = {};

  // ── common fields ──
  if (input.name !== undefined) body.name = input.name;
  if (input.phone !== undefined)
    body.phone = input.phone ? String(input.phone).replace(/^\+?91/, "") : null;
  if (input.role !== undefined) body.role = input.role;
  if (input.photoUri !== undefined) body.photo_url = input.photoUri ?? null;

  // ── payment fields (shared by apartment + staff) ──
  if (kind === "apartment" || kind === "staff") {
    if (input.paymentStatus !== undefined)
      body.payment_status = input.paymentStatus ?? null;
    if (input.paidDate !== undefined) body.paid_date = input.paidDate ?? null;
    if (input.additionalAmount !== undefined)
      body.additional_amount = input.additionalAmount ?? 0;
    if (input.additionalNote !== undefined)
      body.additional_note = input.additionalNote ?? null;
    if (input.deductionAmount !== undefined)
      body.deduction_amount = input.deductionAmount ?? 0;
    if (input.deductionNote !== undefined)
      body.deduction_note = input.deductionNote ?? null;
    if (input.monthlyPayments !== undefined)
      body.monthly_payments = input.monthlyPayments ?? null;
  }

  if (kind === "apartment") {
    if (input.wing !== undefined) body.wing = input.wing ?? null;
    if (input.flatNumber !== undefined) body.flat_number = input.flatNumber;
    if (input.areaSqft !== undefined) body.area_sqft = input.areaSqft ?? null;
    if (input.parkingAvailable !== undefined)
      body.parking_available = input.parkingAvailable ?? false;
    if (input.maintenanceAmount !== undefined)
      body.maintenance_amount = input.maintenanceAmount ?? 0;
  }

  if (kind === "staff") {
    if (input.monthlySalary !== undefined)
      body.monthly_salary = input.monthlySalary ?? 0;
  }

  if (kind === "expense") {
    if (input.role !== undefined) body.category = input.role;
    if (input.name !== undefined) body.title = input.name;
    if (input.amount !== undefined) body.amount = input.amount ?? 0;
    if (input.transactionType !== undefined)
      body.transaction_type = input.transactionType ?? "expense";
    if (input.status !== undefined) body.status = input.status ?? "paid";
    if (input.reminderEnabled !== undefined)
      body.reminder_enabled = !!input.reminderEnabled;
    if (input.description !== undefined)
      body.description = input.description ?? null;
    if (input.billAttachments !== undefined)
      body.bill_attachments = input.billAttachments ?? [];

    if (input.dueDate !== undefined) {
      body.expense_date = localDateStringToServerISO(input.dueDate);
    }
  }

  return body;
}

// ---------------------------------------------------------------------------
// Types for phone visibility
// ---------------------------------------------------------------------------
export interface PhoneVisibilityRow {
  user_id: string;
  name: string;
  role: "owner" | "admin" | "member" | "staff" | string;
  person_type: "member" | "staff" | "unknown" | string;
  member_id: string | null;
  staff_id: string | null;
  enabled: boolean;
  locked: boolean;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Shared Zustand store
// ---------------------------------------------------------------------------
interface ManagementState {
  byKindAndAccount: Record<ManagementType, Record<string, Member[]>>;
  setItems: (kind: ManagementType, accountId: string, items: Member[]) => void;
  appendItem: (kind: ManagementType, accountId: string, item: Member) => void;
  replaceItem: (
    kind: ManagementType,
    accountId: string,
    id: string,
    item: Member,
  ) => void;
  removeItem: (kind: ManagementType, accountId: string, id: string) => void;
  clearAccount: (accountId: string) => void;
}

export const useManagementStore = create<ManagementState>((set) => ({
  byKindAndAccount: {
    apartment: {},
    staff: {},
    expense: {},
  },

  setItems: (kind, accountId, items) =>
    set((s) => ({
      byKindAndAccount: {
        ...s.byKindAndAccount,
        [kind]: {
          ...s.byKindAndAccount[kind],
          [accountId]: items,
        },
      },
    })),

  appendItem: (kind, accountId, item) =>
    set((s) => {
      const existing = s.byKindAndAccount[kind][accountId] ?? [];
      return {
        byKindAndAccount: {
          ...s.byKindAndAccount,
          [kind]: {
            ...s.byKindAndAccount[kind],
            [accountId]: [...existing, item],
          },
        },
      };
    }),

  replaceItem: (kind, accountId, id, item) =>
    set((s) => {
      const existing = s.byKindAndAccount[kind][accountId] ?? [];
      return {
        byKindAndAccount: {
          ...s.byKindAndAccount,
          [kind]: {
            ...s.byKindAndAccount[kind],
            [accountId]: existing.map((m) => (m.id === id ? item : m)),
          },
        },
      };
    }),

  removeItem: (kind, accountId, id) =>
    set((s) => {
      const existing = s.byKindAndAccount[kind][accountId] ?? [];
      return {
        byKindAndAccount: {
          ...s.byKindAndAccount,
          [kind]: {
            ...s.byKindAndAccount[kind],
            [accountId]: existing.filter((m) => m.id !== id),
          },
        },
      };
    }),

  clearAccount: (accountId) =>
    set((s) => ({
      byKindAndAccount: {
        apartment: { ...s.byKindAndAccount.apartment, [accountId]: [] },
        staff: { ...s.byKindAndAccount.staff, [accountId]: [] },
        expense: { ...s.byKindAndAccount.expense, [accountId]: [] },
      },
    })),
}));

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------
function createManagementHook(kind: ManagementType) {
  return function useManagement(accountId: string | null) {
    const segment = endpointFor(kind);

    const items = useManagementStore((s) => {
      if (!accountId) return EMPTY_MEMBERS;
      return s.byKindAndAccount[kind][accountId] ?? EMPTY_MEMBERS;
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
      if (!accountId) return;
      setIsLoading(true);
      setError(null);
      try {
        const rows = await apiRequest<any[]>(
          `/management/${accountId}/${segment}`,
        );
        useManagementStore.getState().setItems(
          kind,
          accountId,
          rows.map((r) => mapRowToMember(r, accountId, kind)),
        );
      } catch (e: any) {
        console.error(`[useManagement:${kind}] refresh failed:`, e);
        setError(e?.message ?? "Failed to load");
      } finally {
        setIsLoading(false);
      }
    }, [accountId, segment]);

    useEffect(() => {
      refresh();
    }, [refresh]);

    const add = useCallback(
      async (input: any) => {
        if (!accountId) throw new Error("No account selected");
        const body = toServerBody(input, kind);
        const row = await apiRequest<any>(
          `/management/${accountId}/${segment}`,
          { method: "POST", body: JSON.stringify(body) },
        );
        const created = mapRowToMember(row, accountId, kind);
        useManagementStore.getState().appendItem(kind, accountId, created);
        return created;
      },
      [accountId, segment],
    );

    const update = useCallback(
      async (id: string, input: any) => {
        if (!accountId) throw new Error("No account selected");
        const body = toServerBody(input, kind);

        // Strip undefined values — the server rejects empty payloads.
        for (const k of Object.keys(body)) {
          if (body[k] === undefined) delete body[k];
        }

        if (Object.keys(body).length === 0) {
          throw new Error("No permitted fields to update");
        }

        const row = await apiRequest<any>(
          `/management/${accountId}/${segment}/${id}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
        const updated = mapRowToMember(row, accountId, kind);
        useManagementStore.getState().replaceItem(kind, accountId, id, updated);
        return updated;
      },
      [accountId, segment],
    );

    const remove = useCallback(
      async (id: string) => {
        if (!accountId) throw new Error("No account selected");
        await apiRequest(`/management/${accountId}/${segment}/${id}`, {
          method: "DELETE",
        });
        useManagementStore.getState().removeItem(kind, accountId, id);
      },
      [accountId, segment],
    );

    const getById = useCallback(
      (id: string) => items.find((m) => m.id === id),
      [items],
    );

    const fetchPhoneVisibility = useCallback(
      async (memberId: string): Promise<PhoneVisibilityRow[]> => {
        if (!accountId) throw new Error("No account selected");
        const rows = await apiRequest<PhoneVisibilityRow[]>(
          `/management/${accountId}/members/${memberId}/phone-visibility`,
        );
        return rows;
      },
      [accountId],
    );

    const savePhoneVisibility = useCallback(
      async (memberId: string, viewerUserIds: string[]) => {
        if (!accountId) throw new Error("No account selected");
        await apiRequest(
          `/management/${accountId}/members/${memberId}/phone-visibility`,
          {
            method: "PUT",
            body: JSON.stringify({ viewer_user_ids: viewerUserIds }),
          },
        );
      },
      [accountId],
    );

    return {
      items,
      isLoading,
      error,
      refresh,
      add,
      update,
      remove,
      getById,
      fetchPhoneVisibility,
      savePhoneVisibility,
    };
  };
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------
export const useMembers = createManagementHook("apartment");
export const useStaff = createManagementHook("staff");
export const useExpenses = createManagementHook("expense");

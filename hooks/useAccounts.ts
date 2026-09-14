// hooks/useAccounts.ts
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect } from "react";
import { useAccountStore } from "../store/accountStore";
import { useAuthStore } from "../store/useAuthStore";
import { Account, AccountType } from "../types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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
// Server row → Account mapper
// ---------------------------------------------------------------------------
function mapRowToAccount(r: any, fallbackOwnerId: string): Account {
  const now = new Date().toISOString();
  const ownerId = r.created_by ?? r.createdBy ?? fallbackOwnerId;
  const createdAt = r.created_at ?? r.createdAt ?? now;
  const updatedAt = r.updated_at ?? r.updatedAt ?? createdAt;
  const photoUri = r.photo_url ?? r.photoUrl ?? undefined;

  const base = {
    id: r.id,
    ownerId,
    name: r.name,
    photoUri,
    createdAt,
    updatedAt,
  };

  if (r.type === "apartment") {
    return {
      ...base,
      type: "apartment",
      secretaryId: ownerId,
    } as Account;
  }

  return {
    ...base,
    type: "home",
    isRented: false,
  } as Account;
}

// ---------------------------------------------------------------------------
// GET /accounts
// ---------------------------------------------------------------------------
async function fetchAccountsForUser(userId: string): Promise<Account[]> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/accounts`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const bodyText = await res.text();
    const err: any = new Error(`Failed to load accounts (${res.status})`);
    err.status = res.status;
    err.body = bodyText;
    console.error("[useAccounts] GET /accounts failed:", res.status, bodyText);
    throw err;
  }
  const rows = (await res.json()) as any[];
  return rows.map((r) => mapRowToAccount(r, userId));
}

// ---------------------------------------------------------------------------
// Photo upload — SKIPPED FOR NOW
// ---------------------------------------------------------------------------
// Backend route POST /uploads/account-photo isn't built yet. The RN FormData
// shape used here also triggers "Unsupported FormDataPart implementation" on
// some setups. Until both are fixed, we just return the local URI so the
// account still gets created.
//
// When you build the backend upload route, replace the body of this function
// with a real fetch to `${BASE_URL}/uploads/account-photo`.
// ---------------------------------------------------------------------------
async function uploadAccountPhoto(localUri: string): Promise<string> {
  console.log(
    "[uploadAccountPhoto] skipping upload — returning local URI:",
    localUri,
  );
  return localUri;
}

// ---------------------------------------------------------------------------
// POST /accounts
// ---------------------------------------------------------------------------
async function createAccountApi(
  userId: string,
  type: AccountType,
  name: string,
  photoUri?: string,
): Promise<Account> {
  const token = await getToken();

  let photoUrl: string | undefined;
  if (photoUri) {
    photoUrl = await uploadAccountPhoto(photoUri);
  }

  const res = await fetch(`${BASE_URL}/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      name: name.trim(),
      type,
      photo_url: photoUrl,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(
      body?.message ?? `Request failed (${res.status})`,
    );
    err.status = res.status;
    throw err;
  }

  const row = await res.json();
  return mapRowToAccount(row, userId);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAccounts() {
  const user = useAuthStore((s) => s.user);

  const {
    accounts,
    selectedAccountId,
    isLoading,
    setAccounts,
    addAccount,
    updateAccount,
    selectAccount,
    setIsLoading,
    getSelectedAccount,
  } = useAccountStore();

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await fetchAccountsForUser(user.id);
      setAccounts(data);
    } catch (e) {
      console.error("[useAccounts] refresh failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user, setAccounts, setIsLoading]);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const createAccount = useCallback(
    async (type: AccountType, name: string, photoUri?: string) => {
      if (!user) {
        console.error("No user logged in");
        return null;
      }
      const newAccount = await createAccountApi(user.id, type, name, photoUri);
      addAccount(newAccount);
      return newAccount;
    },
    [user, addAccount],
  );

  const editAccount = useCallback(
    async (id: string, updates: { name?: string; photoUri?: string }) => {
      updateAccount(id, { ...updates, updatedAt: new Date().toISOString() });
    },
    [updateAccount],
  );

  return {
    accounts,
    selectedAccount: getSelectedAccount(),
    selectedAccountId,
    isLoading,
    selectAccount,
    createAccount,
    editAccount,
    refresh,
  };
}

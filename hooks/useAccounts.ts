// hooks/useAccounts.ts
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { useAccountStore } from "../store/accountStore";
import { useAuthStore } from "../store/useAuthStore";
import { Account, AccountType } from "../types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

interface FetchAccountsResult {
  accounts: Account[];
  lastAccountId: string | null;
}

const inflightByUserId: Record<
  string,
  Promise<FetchAccountsResult> | undefined
> = {};
const loadedUserIds = new Set<string>();

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("auth_token");
  } catch {
    return null;
  }
}

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
    role: r.role,
    createdAt,
    updatedAt,
  };

  if (r.type === "apartment") {
    return { ...base, type: "apartment", secretaryId: ownerId } as Account;
  }

  return { ...base, type: "home", isRented: false } as Account;
}

async function doFetchAccounts(userId: string): Promise<FetchAccountsResult> {
  const token = await getToken();
  if (!token) return { accounts: [], lastAccountId: null };

  const res = await fetch(`${BASE_URL}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const bodyText = await res.text();
    console.error("[doFetchAccounts] HTTP", res.status, bodyText);
    const err: any = new Error(`Failed to load accounts (${res.status})`);
    err.status = res.status;
    err.body = bodyText;
    throw err;
  }

  const body = await res.json();

  const rows: any[] = Array.isArray(body) ? body : (body.accounts ?? []);
  const lastAccountId: string | null = Array.isArray(body)
    ? null
    : (body.lastAccountId ?? null);

  return {
    accounts: rows.map((r) => mapRowToAccount(r, userId)),
    lastAccountId,
  };
}

async function fetchAccountsDeduped(
  userId: string,
  force = false,
): Promise<FetchAccountsResult> {
  if (!force && loadedUserIds.has(userId)) {
    const state = useAccountStore.getState();
    return {
      accounts: state.accounts,
      lastAccountId: state.selectedAccountId,
    };
  }

  const existing = inflightByUserId[userId];
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await doFetchAccounts(userId);

      const current = useAccountStore.getState().selectedAccountId;
      const serverPick = result.lastAccountId;

      const shouldAdoptServerPick =
        !current &&
        serverPick &&
        result.accounts.some((a) => a.id === serverPick);

      if (shouldAdoptServerPick) {
        useAccountStore.setState({ selectedAccountId: serverPick });
      }

      useAccountStore.getState().setAccounts(result.accounts);

      if (current && !result.accounts.some((a) => a.id === current)) {
        useAccountStore.getState().selectAccount(null, { persist: false });
      }

      loadedUserIds.add(userId);
      return result;
    } finally {
      delete inflightByUserId[userId];
    }
  })();

  inflightByUserId[userId] = promise;
  return promise;
}

/**
 * Encode a device-local file:// URI as a base64 data: URI so it can be
 * stored in the database and rendered anywhere (any device, any cache
 * state).
 */
async function uploadAccountPhoto(localUri: string): Promise<string> {
  console.log(
    "[uploadAccountPhoto] ENTER, localUri =",
    localUri ? localUri.slice(0, 80) : "(empty)",
  );

  if (localUri.startsWith("data:") || /^https?:\/\//i.test(localUri)) {
    console.log("[uploadAccountPhoto] already portable, skipping encode");
    return localUri;
  }

  try {
    console.log("[uploadAccountPhoto] reading file as base64...");
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log("[uploadAccountPhoto] base64 length =", base64.length);

    const lower = localUri.toLowerCase();
    const mime = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";

    const dataUri = `data:${mime};base64,${base64}`;
    console.log(
      "[uploadAccountPhoto] returning data: URI, length =",
      dataUri.length,
    );
    return dataUri;
  } catch (error) {
    console.error("[uploadAccountPhoto] failed to encode image:", error);
    return localUri;
  }
}

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
    console.error("[createAccountApi] HTTP", res.status, body);
    const err: any = new Error(
      body?.message ?? body?.code ?? `Request failed (${res.status})`,
    );
    err.status = res.status;
    err.code = body?.code;
    err.body = body;
    throw err;
  }

  const row = await res.json();
  return mapRowToAccount(row, userId);
}

async function updateAccountApi(
  accountId: string,
  updates: { name?: string; photo_url?: string | null },
): Promise<any> {
  const token = await getToken();

  console.log(
    "[updateAccountApi] PATCH /accounts/" + accountId,
    "body keys =",
    Object.keys(updates),
  );

  const res = await fetch(`${BASE_URL}/accounts/${accountId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(updates),
  });

  console.log("[updateAccountApi] HTTP status =", res.status);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[updateAccountApi] HTTP", res.status, body);
    const err: any = new Error(
      body?.message ?? body?.code ?? `Request failed (${res.status})`,
    );
    err.status = res.status;
    err.code = body?.code;
    err.body = body;
    throw err;
  }

  return res.json();
}

export function useAccounts() {
  const user = useAuthStore((s) => s.user);

  const accounts = useAccountStore((s) => s.accounts);
  const selectedAccountId = useAccountStore((s) => s.selectedAccountId);
  const isLoading = useAccountStore((s) => s.isLoading);
  const hasHydrated = useAccountStore((s) => s.hasHydrated);
  const addAccount = useAccountStore((s) => s.addAccount);
  const updateAccount = useAccountStore((s) => s.updateAccount);
  const selectAccount = useAccountStore((s) => s.selectAccount);
  const setIsLoading = useAccountStore((s) => s.setIsLoading);
  const getSelectedAccount = useAccountStore((s) => s.getSelectedAccount);

  const [hasLoaded, setHasLoaded] = useState(
    user?.id ? loadedUserIds.has(user.id) : false,
  );

  const refresh = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    setIsLoading(true);
    try {
      await fetchAccountsDeduped(uid, true);
    } catch (e) {
      console.error("[useAccounts] refresh failed:", e);
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [user?.id, setIsLoading]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid || !hasHydrated) {
      setHasLoaded(false);
      return;
    }

    let cancelled = false;

    if (loadedUserIds.has(uid)) {
      setHasLoaded(true);
      return;
    }

    setHasLoaded(false);
    setIsLoading(true);

    fetchAccountsDeduped(uid)
      .then(() => {
        if (cancelled) return;
        setHasLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[useAccounts] initial load failed:", e);
        setHasLoaded(true);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hasHydrated]);

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
      console.log(
        "[editAccount] called. id =",
        id,
        "has photo =",
        !!updates.photoUri,
      );

      let photoUrl = updates.photoUri;
      if (
        photoUrl &&
        !photoUrl.startsWith("data:") &&
        !/^https?:\/\//i.test(photoUrl)
      ) {
        photoUrl = await uploadAccountPhoto(photoUrl);
      }

      const serverPayload: { name?: string; photo_url?: string | null } = {};
      if (updates.name !== undefined) serverPayload.name = updates.name;
      if (updates.photoUri !== undefined) {
        serverPayload.photo_url = photoUrl ?? null;
      }

      try {
        console.log(
          "[editAccount] PATCH payload, photo_url starts with:",
          serverPayload.photo_url
            ? serverPayload.photo_url.slice(0, 40)
            : "(none)",
        );
        await updateAccountApi(id, serverPayload);
        console.log("[editAccount] PATCH succeeded");
      } catch (e) {
        console.error("[useAccounts] editAccount server sync failed:", e);
      }

      updateAccount(id, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(photoUrl !== undefined ? { photoUri: photoUrl } : {}),
        updatedAt: new Date().toISOString(),
      });
    },
    [updateAccount],
  );

  return {
    accounts,
    selectedAccount: getSelectedAccount(),
    selectedAccountId,
    isLoading,
    hasLoaded,
    hasHydrated,
    selectAccount,
    createAccount,
    editAccount,
    refresh,
  };
}

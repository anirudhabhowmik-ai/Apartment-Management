// hooks/useAccounts.ts
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useAccountStore } from "../store/accountStore";
import { useAuthStore } from "../store/useAuthStore";
import { Account, AccountType } from "../types";
import { onAccessLoss } from "./useManagement";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

interface FetchAccountsResult {
  accounts: Account[];
  lastAccountId: string | null;
}

const inflightByUserId: Record<
  string,
  Promise<FetchAccountsResult> | undefined
> = {};

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("auth_token");
  } catch {
    return null;
  }
}

async function encodePhotoForServer(localUri: string): Promise<string> {
  if (!localUri) return localUri;
  if (localUri.startsWith("data:") || /^https?:\/\//i.test(localUri)) {
    return localUri;
  }
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const lower = localUri.toLowerCase();
  const mime = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${base64}`;
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
  const existing = inflightByUserId[userId];
  if (existing && !force) return existing;

  const promise = (async () => {
    try {
      const result = await doFetchAccounts(userId);

      useAccountStore.getState().setLoadedForUserId(userId);

      const current = useAccountStore.getState().selectedAccountId;
      const serverPick = result.lastAccountId;

      const shouldAdoptServerPick =
        !current &&
        serverPick &&
        result.accounts.some((a) => a.id === serverPick);

      if (shouldAdoptServerPick) {
        useAccountStore.setState({ selectedAccountId: serverPick });
      }

      useAccountStore.getState().reconcileAccounts(result.accounts);

      return result;
    } finally {
      delete inflightByUserId[userId];
    }
  })();

  inflightByUserId[userId] = promise;
  return promise;
}

async function uploadAccountPhoto(localUri: string): Promise<string> {
  return encodePhotoForServer(localUri);
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

  const res = await fetch(`${BASE_URL}/accounts/${accountId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(updates),
  });

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
  const loadedForUserId = useAccountStore((s) => s.loadedForUserId);
  const addAccount = useAccountStore((s) => s.addAccount);
  const updateAccount = useAccountStore((s) => s.updateAccount);
  const selectAccount = useAccountStore((s) => s.selectAccount);
  const setIsLoading = useAccountStore((s) => s.setIsLoading);
  const getSelectedAccount = useAccountStore((s) => s.getSelectedAccount);

  const hasLoaded = !!user?.id && loadedForUserId === user.id;

  const refresh = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    setIsLoading(true);
    try {
      await fetchAccountsDeduped(uid, true);
    } catch (e) {
      console.error("[useAccounts] refresh failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, setIsLoading]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid || !hasHydrated) return;

    let cancelled = false;

    // Always fetch on launch. Previously we skipped when the store was
    // already hydrated for this user, which left stale photos cached
    // across app restarts.
    setIsLoading(true);

    fetchAccountsDeduped(uid, true)
      .catch((e) => {
        if (cancelled) return;
        console.error("[useAccounts] initial load failed:", e);
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

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const unsubscribe = onAccessLoss(() => {
      fetchAccountsDeduped(uid, true).catch((e) => {
        console.warn("[useAccounts] access-loss refetch failed:", e);
      });
    });

    return unsubscribe;
  }, [user?.id]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        fetchAccountsDeduped(uid, true).catch(() => {});
      }
    });

    return () => sub.remove();
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

      const serverRow = await updateAccountApi(id, serverPayload);

      const merged: Partial<Account> = {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(photoUrl !== undefined ? { photoUri: photoUrl } : {}),
        updatedAt: serverRow?.updated_at ?? new Date().toISOString(),
      };

      updateAccount(id, merged);
      return merged;
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

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

      // Mark the account list as loaded for THIS user id. This drives
      // the derived `hasLoaded` value returned by the hook, which
      // resets when the user changes (or on logout).
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

      // reconcileAccounts():
      //  - stores the fresh list
      //  - keeps the current selection if it still exists
      //  - falls back to first remaining account if the selection vanished
      //  - clears selection to null if there are no accounts left
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
  if (localUri.startsWith("data:") || /^https?:\/\//i.test(localUri)) {
    return localUri;
  }

  try {
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

  // Derived — true only when the accounts have been fetched for the
  // CURRENT user id, in this session. Resets automatically on logout
  // (accountStore.reset clears loadedForUserId) and on user switch.
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

    // Already loaded for this user this session? Skip the fetch.
    if (useAccountStore.getState().loadedForUserId === uid) {
      return;
    }

    setIsLoading(true);

    fetchAccountsDeduped(uid)
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

  // Reconcile when any account-scoped request reports "no access".
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

  // Reconcile when the app returns to the foreground.
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

      try {
        await updateAccountApi(id, serverPayload);
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

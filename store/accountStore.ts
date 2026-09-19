// store/accountStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Account } from "../types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

interface AccountState {
  accounts: Account[];
  selectedAccountId: string | null;
  isAccountSwitcherOpen: boolean;
  isLoading: boolean;
  /** True once AsyncStorage has been read and state restored. */
  hasHydrated: boolean;

  setAccounts: (accounts: Account[]) => void;
  reconcileAccounts: (freshAccounts: Account[]) => boolean;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  selectAccount: (id: string | null, opts?: { persist?: boolean }) => void;
  setAccountSwitcherOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setHasHydrated: (v: boolean) => void;
  getSelectedAccount: () => Account | null;
}

// ---------------------------------------------------------------------------
// Fire-and-forget PATCH so the server remembers the selection.
// The DB is the source of truth; local storage is just a cache.
// ---------------------------------------------------------------------------
async function persistLastAccountToServer(accountId: string | null) {
  try {
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token) {
      console.warn("[accountStore] no token, skipping persist");
      return;
    }

    console.log("[accountStore] PATCH last-account →", accountId);

    const res = await fetch(`${BASE_URL}/accounts/me/last-account`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId }),
    });

    console.log("[accountStore] PATCH status:", res.status);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[accountStore] PATCH failed:", res.status, text);
    }
  } catch (e) {
    console.error("[accountStore] failed to persist last account:", e);
  }
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: [],
      selectedAccountId: null,
      isAccountSwitcherOpen: false,
      isLoading: true,
      hasHydrated: false,

      setAccounts: (accounts) => {
        const { selectedAccountId, hasHydrated } = get();

        console.log("[store] setAccounts", {
          hasHydrated,
          selectedAccountId,
          incomingIds: accounts.map((a) => a.id),
        });

        // Hydration not done yet — just store the list.
        if (!hasHydrated) {
          set({ accounts });
          return;
        }

        // Keep the current selection if it still exists.
        if (
          selectedAccountId &&
          accounts.some((a) => a.id === selectedAccountId)
        ) {
          set({ accounts });
          return;
        }

        // No local selection — fall back to the first account.
        if (!selectedAccountId && accounts.length > 0) {
          const firstId = accounts[0].id;
          set({ accounts, selectedAccountId: firstId });
          persistLastAccountToServer(firstId);
          return;
        }

        // Selection refers to an account that no longer exists → reset.
        set({ accounts, selectedAccountId: null });
      },

      /**
       * Reconcile the locally-cached account list against a fresh list
       * from the server. Drops any locally-cached account that is no
       * longer returned by the backend (e.g. because the user's admin
       * access was revoked).
       *
       * Returns `true` if the previously-selected account was dropped,
       * so callers can redirect the user.
       */
      reconcileAccounts: (freshAccounts) => {
        const { accounts: oldAccounts, selectedAccountId } = get();

        const freshIds = new Set(freshAccounts.map((a) => a.id));

        const lostIds = oldAccounts
          .map((a) => a.id)
          .filter((id) => !freshIds.has(id));

        const lostSelection =
          !!selectedAccountId && !freshIds.has(selectedAccountId);

        const nextSelectedId = lostSelection
          ? (freshAccounts[0]?.id ?? null)
          : selectedAccountId;

        set({
          accounts: freshAccounts,
          selectedAccountId: nextSelectedId,
        });

        if (lostSelection) {
          persistLastAccountToServer(nextSelectedId);
        }

        if (lostIds.length > 0) {
          console.log("[accountStore] reconcile: lost accounts", lostIds);
        }

        return lostSelection;
      },

      addAccount: (account) => {
        set((state) => ({
          accounts: [...state.accounts, account],
          selectedAccountId: account.id,
        }));
        persistLastAccountToServer(account.id);
      },

      updateAccount: (id, updates) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? ({ ...a, ...updates } as Account) : a,
          ),
        })),

      removeAccount: (id) =>
        set((state) => {
          const remaining = state.accounts.filter((a) => a.id !== id);
          const wasSelected = state.selectedAccountId === id;
          const nextId = wasSelected
            ? (remaining[0]?.id ?? null)
            : state.selectedAccountId;

          if (wasSelected) {
            persistLastAccountToServer(nextId);
          }

          return {
            accounts: remaining,
            selectedAccountId: nextId,
          };
        }),

      selectAccount: (id, opts) => {
        set({ selectedAccountId: id });

        // Skip the network echo when restoring from the server at cold start.
        if (opts?.persist !== false) {
          persistLastAccountToServer(id);
        }
      },

      setAccountSwitcherOpen: (isAccountSwitcherOpen) =>
        set({ isAccountSwitcherOpen }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      getSelectedAccount: () => {
        const { accounts, selectedAccountId } = get();
        return accounts.find((a) => a.id === selectedAccountId) ?? null;
      },
    }),
    {
      name: "account-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        selectedAccountId: state.selectedAccountId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        state?.setIsLoading(false);
      },
    },
  ),
);

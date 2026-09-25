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
  hasHydrated: boolean;
  loadedForUserId: string | null;

  /** Optional callback registered by the tab layout to trigger a role sync. */
  requestRoleSync: (() => void) | null;

  setAccounts: (accounts: Account[]) => void;
  reconcileAccounts: (freshAccounts: Account[]) => boolean;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  selectAccount: (id: string | null, opts?: { persist?: boolean }) => void;
  setAccountSwitcherOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setHasHydrated: (v: boolean) => void;
  setLoadedForUserId: (id: string | null) => void;
  reset: () => void;
  getSelectedAccount: () => Account | null;
  setAccountRole: (accountId: string, role: string | null) => void;

  /** Registers the role-sync callback. Called once by the tab layout. */
  setRequestRoleSync: (fn: (() => void) | null) => void;
}

async function persistLastAccountToServer(accountId: string | null) {
  try {
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token) return;

    await fetch(`${BASE_URL}/accounts/me/last-account`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId }),
    }).catch(() => undefined);
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
      loadedForUserId: null,
      requestRoleSync: null,

      setAccounts: (accounts) => {
        const { selectedAccountId, hasHydrated } = get();
        if (!hasHydrated) {
          set({ accounts });
          return;
        }
        if (
          selectedAccountId &&
          accounts.some((a) => a.id === selectedAccountId)
        ) {
          set({ accounts });
          return;
        }
        set({ accounts, selectedAccountId: null });
      },

      reconcileAccounts: (freshAccounts) => {
        const { accounts: oldAccounts, selectedAccountId } = get();
        const freshIds = new Set(freshAccounts.map((a) => a.id));
        const oldIds = new Set(oldAccounts.map((a) => a.id));

        const idsEqual =
          freshIds.size === oldIds.size &&
          [...freshIds].every((id) => oldIds.has(id));

        const dataEqual =
          idsEqual &&
          freshAccounts.every((fresh) => {
            const old = oldAccounts.find((a) => a.id === fresh.id);
            if (!old) return false;
            return (
              old.name === fresh.name &&
              old.photoUri === fresh.photoUri &&
              old.type === fresh.type &&
              old.ownerId === fresh.ownerId &&
              (old as any).role === (fresh as any).role
            );
          });

        const lostSelection =
          !!selectedAccountId && !freshIds.has(selectedAccountId);
        const nextSelectedId = lostSelection ? null : selectedAccountId;

        if (dataEqual && nextSelectedId === selectedAccountId) return false;

        set({
          accounts: freshAccounts,
          selectedAccountId: nextSelectedId,
        });

        if (lostSelection) persistLastAccountToServer(null);
        return lostSelection;
      },

      addAccount: (account) => {
        set((state) => ({
          accounts: [...state.accounts, account],
          selectedAccountId: state.selectedAccountId ?? account.id,
        }));
        if (!get().selectedAccountId) {
          persistLastAccountToServer(account.id);
        }
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
          const nextId = wasSelected ? null : state.selectedAccountId;
          if (wasSelected) persistLastAccountToServer(null);
          return {
            accounts: remaining,
            selectedAccountId: nextId,
          };
        }),

      selectAccount: (id, opts) => {
        set({ selectedAccountId: id });
        if (opts?.persist !== false) persistLastAccountToServer(id);
      },

      setAccountSwitcherOpen: (isAccountSwitcherOpen) =>
        set({ isAccountSwitcherOpen }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      setLoadedForUserId: (loadedForUserId) => set({ loadedForUserId }),

      reset: () =>
        set({
          accounts: [],
          selectedAccountId: null,
          isAccountSwitcherOpen: false,
          isLoading: false,
          loadedForUserId: null,
        }),

      getSelectedAccount: () => {
        const { accounts, selectedAccountId } = get();
        return accounts.find((a) => a.id === selectedAccountId) ?? null;
      },

      setAccountRole: (accountId, role) => {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === accountId ? ({ ...a, role } as Account) : a,
          ),
        }));
      },

      setRequestRoleSync: (fn) => set({ requestRoleSync: fn }),
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

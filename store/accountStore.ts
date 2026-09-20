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

      setAccounts: (accounts) => {
        const { selectedAccountId, hasHydrated } = get();

        if (!hasHydrated) {
          set({ accounts });
          return;
        }

        // Keep the current selection if it still exists in the fresh list.
        if (
          selectedAccountId &&
          accounts.some((a) => a.id === selectedAccountId)
        ) {
          set({ accounts });
          return;
        }

        // Do NOT auto-select accounts[0] here. The selection is decided
        // by fetchAccountsDeduped, which honors the server's
        // last_account_id. If the server has no preference, selection
        // stays null and the UI routes the user to select-account.
        set({ accounts, selectedAccountId: null });
      },

      reconcileAccounts: (freshAccounts) => {
        const { accounts: oldAccounts, selectedAccountId } = get();

        const freshIds = new Set(freshAccounts.map((a) => a.id));
        const oldIds = new Set(oldAccounts.map((a) => a.id));

        const idsEqual =
          freshIds.size === oldIds.size &&
          [...freshIds].every((id) => oldIds.has(id));

        const lostSelection =
          !!selectedAccountId && !freshIds.has(selectedAccountId);

        // If the selection no longer exists, clear it. Don't silently
        // jump to a different account — that hides the select-account
        // screen and misleads the user about which account they're in.
        const nextSelectedId = lostSelection ? null : selectedAccountId;

        if (idsEqual && nextSelectedId === selectedAccountId) {
          return false;
        }

        set({
          accounts: freshAccounts,
          selectedAccountId: nextSelectedId,
        });

        if (lostSelection) {
          persistLastAccountToServer(null);
        }

        return lostSelection;
      },

      addAccount: (account) => {
        // Keep the previously-selected account; only auto-select the
        // new one if there was no selection to begin with. This makes
        // creating an account from the switcher non-disruptive.
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
          // Clear the selection rather than jump to remaining[0]. The
          // user will be routed to select-account by the tabs layout.
          const nextId = wasSelected ? null : state.selectedAccountId;

          if (wasSelected) {
            persistLastAccountToServer(null);
          }

          return {
            accounts: remaining,
            selectedAccountId: nextId,
          };
        }),

      selectAccount: (id, opts) => {
        set({ selectedAccountId: id });
        if (opts?.persist !== false) {
          persistLastAccountToServer(id);
        }
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

// store/accountStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Account } from "../types";

interface AccountState {
  accounts: Account[];
  selectedAccountId: string | null;
  isAccountSwitcherOpen: boolean;
  isLoading: boolean;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  selectAccount: (id: string) => void;
  setAccountSwitcherOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  getSelectedAccount: () => Account | null;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: [],
      selectedAccountId: null,
      isAccountSwitcherOpen: false,
      isLoading: true,

      setAccounts: (accounts) => {
        const { selectedAccountId } = get();

        // Keep the currently-selected account if it still exists.
        const stillExists = accounts.some((a) => a.id === selectedAccountId);

        if (selectedAccountId && stillExists) {
          // Just refresh the list, keep the selection.
          set({ accounts });
        } else if (accounts.length > 0) {
          // Selection is gone (or never set) — fall back to first account.
          set({ accounts, selectedAccountId: accounts[0].id });
        } else {
          set({ accounts, selectedAccountId: null });
        }
      },

      addAccount: (account) =>
        set((state) => ({
          accounts: [...state.accounts, account],
          selectedAccountId: account.id, // auto-switch to newly created account
        })),

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
          return {
            accounts: remaining,
            selectedAccountId: wasSelected
              ? (remaining[0]?.id ?? null)
              : state.selectedAccountId,
          };
        }),

      selectAccount: (id) => set({ selectedAccountId: id }),

      setAccountSwitcherOpen: (isAccountSwitcherOpen) =>
        set({ isAccountSwitcherOpen }),

      setIsLoading: (isLoading) => set({ isLoading }),

      getSelectedAccount: () => {
        const { accounts, selectedAccountId } = get();
        return accounts.find((a) => a.id === selectedAccountId) ?? null;
      },
    }),
    {
      name: "account-store",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the accounts list and selection — not transient UI state.
      partialize: (state) => ({
        accounts: state.accounts,
        selectedAccountId: state.selectedAccountId,
      }),
    },
  ),
);

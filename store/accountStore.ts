import { create } from "zustand";
import { Account } from "../types";

interface AccountState {
  accounts: Account[];
  selectedAccountId: string | null;
  isLoading: boolean;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  selectAccount: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  getSelectedAccount: () => Account | null;
}

export const useAccountStore = create<AccountState>((set: any, get: any) => ({
  accounts: [],
  selectedAccountId: null,
  isLoading: false,

  setAccounts: (accounts: any) => {
    set({ accounts });
    // auto-select first account if none selected yet
    const { selectedAccountId } = get();
    if (!selectedAccountId && accounts.length > 0) {
      set({ selectedAccountId: accounts[0].id });
    }
  },

  addAccount: (account: any) =>
    set((state: any) => ({
      accounts: [...state.accounts, account],
      selectedAccountId: account.id, // auto-switch to newly created account
    })),

  updateAccount: (id: any, updates: any) =>
    set((state: any) => ({
      accounts: state.accounts.map((a: any) =>
        a.id === id ? ({ ...a, ...updates } as Account) : a,
      ),
    })),

  removeAccount: (id: any) =>
    set((state: any) => {
      const remaining = state.accounts.filter((a: any) => a.id !== id);
      const wasSelected = state.selectedAccountId === id;
      return {
        accounts: remaining,
        selectedAccountId: wasSelected
          ? (remaining[0]?.id ?? null)
          : state.selectedAccountId,
      };
    }),

  selectAccount: (id: any) => set({ selectedAccountId: id }),

  setIsLoading: (isLoading: any) => set({ isLoading }),

  getSelectedAccount: () => {
    const { accounts, selectedAccountId } = get();
    return accounts.find((a: any) => a.id === selectedAccountId) ?? null;
  },
}));

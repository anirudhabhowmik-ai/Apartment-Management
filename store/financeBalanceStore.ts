import { create } from "zustand";

interface FinanceBalanceState {
  openingBalances: Record<string, number>;
  setOpeningBalance: (accountId: string, amount: number) => void;
}

export const useFinanceBalanceStore = create<FinanceBalanceState>((set) => ({
  openingBalances: {},
  setOpeningBalance: (accountId, amount) =>
    set((state) => ({
      openingBalances: { ...state.openingBalances, [accountId]: amount },
    })),
}));

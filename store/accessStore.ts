import { create } from "zustand";
import { AccountAccessGrant } from "../types/access";

interface AccessState {
  grants: AccountAccessGrant[];
  addGrant: (grant: AccountAccessGrant) => void;
  getGrantsByAccount: (accountId: string) => AccountAccessGrant[];
  getPendingGrantsByPhone: (phone: string) => AccountAccessGrant[];
  acceptGrant: (id: string) => void;
}

export const useAccessStore = create<AccessState>((set, get) => ({
  grants: [],
  addGrant: (grant) => set((state) => ({ grants: [...state.grants, grant] })),
  getGrantsByAccount: (accountId) =>
    get().grants.filter((grant) => grant.accountId === accountId),
  getPendingGrantsByPhone: (phone) =>
    get().grants.filter((grant) => grant.phone === phone && !grant.acceptedAt),
  acceptGrant: (id) =>
    set((state) => ({
      grants: state.grants.map((grant) =>
        grant.id === id
          ? { ...grant, acceptedAt: new Date().toISOString() }
          : grant,
      ),
    })),
}));

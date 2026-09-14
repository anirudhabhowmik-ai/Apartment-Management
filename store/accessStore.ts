// store/AccessStore.ts

import { create } from "zustand";

import { AccountAccessGrant, AccountAccessRole } from "../types/access";

interface AccessState {
  grants: AccountAccessGrant[];

  accountRoles: Record<string, AccountAccessRole>;

  addGrant: (grant: AccountAccessGrant) => void;

  getGrantsByAccount: (accountId: string) => AccountAccessGrant[];

  getPendingGrantsByPhone: (phone: string) => AccountAccessGrant[];

  acceptGrant: (id: string) => void;

  removeGrant: (id: string) => void;

  grantAccountRole: (accountId: string, role: AccountAccessRole) => void;

  removeAccountRole: (accountId: string) => void;

  getAccountRole: (accountId: string) => AccountAccessRole | undefined;

  clearAccess: () => void;
}

export const useAccessStore = create<AccessState>((set, get) => ({
  grants: [],

  accountRoles: {},

  // ---------------------------------------
  // GRANTS
  // ---------------------------------------

  addGrant: (grant) =>
    set((state) => ({
      grants: [...state.grants, grant],
    })),

  getGrantsByAccount: (accountId) =>
    get().grants.filter((grant) => grant.accountId === accountId),

  getPendingGrantsByPhone: (phone) =>
    get().grants.filter((grant) => grant.phone === phone && !grant.acceptedAt),

  acceptGrant: (id) =>
    set((state) => ({
      grants: state.grants.map((grant) =>
        grant.id === id
          ? {
              ...grant,
              acceptedAt: new Date().toISOString(),
            }
          : grant,
      ),
    })),

  removeGrant: (id) =>
    set((state) => ({
      grants: state.grants.filter((grant) => grant.id !== id),
    })),

  // ---------------------------------------
  // ACCOUNT ROLES
  // ---------------------------------------

  grantAccountRole: (accountId, role) =>
    set((state) => ({
      accountRoles: {
        ...state.accountRoles,
        [accountId]: role,
      },
    })),

  removeAccountRole: (accountId) =>
    set((state) => {
      const { [accountId]: removed, ...remainingRoles } = state.accountRoles;

      return {
        accountRoles: remainingRoles,
      };
    }),

  getAccountRole: (accountId) => get().accountRoles[accountId],

  // ---------------------------------------
  // CLEAR ACCESS ON LOGOUT
  // ---------------------------------------

  clearAccess: () =>
    set({
      grants: [],
      accountRoles: {},
    }),
}));

// store/useAuthStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { AccountAccessRole } from "../types/access";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  accountRoles?: Record<string, AccountAccessRole>;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  pendingPhone: string | null; // holds phone between login -> otp-verify, never in URL
  setUser: (user: AuthUser | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPendingPhone: (phone: string | null) => void;
  grantAccountRole: (accountId: string, role: AccountAccessRole) => void;
  removeAccountRole: (accountId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      pendingPhone: null,

      setUser: (user) => {
        set({ user });
      },

      setIsLoading: (isLoading) => set({ isLoading }),

      setPendingPhone: (pendingPhone) => set({ pendingPhone }),

      grantAccountRole: (accountId, role) => {
        const { user } = get();
        if (!user) {
          return;
        }

        const updatedAccountRoles = {
          ...(user.accountRoles || {}),
          [accountId]: role,
        };

        const updatedUser = {
          ...user,
          accountRoles: updatedAccountRoles,
        };

        set({ user: updatedUser });

        const finalUser = get().user;
        console.log(
          "✅ Final user after set:",
          JSON.stringify(finalUser, null, 2),
        );
      },

      removeAccountRole: (accountId) => {
        const { user } = get();
        if (!user || !user.accountRoles) return;

        const { [accountId]: removed, ...remainingRoles } = user.accountRoles;
        set({
          user: {
            ...user,
            accountRoles: remainingRoles,
          },
        });
      },

      logout: () => {
        set({ user: null });
      },
    }),
    {
      name: "auth-storage", // unique name for storage
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// store/useAuthStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  accountRoles?: Record<string, "admin" | "member_visibility">;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  pendingPhone: string | null; // holds phone between login -> otp-verify, never in URL
  setUser: (user: AuthUser | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPendingPhone: (phone: string | null) => void;
  grantAccountRole: (
    accountId: string,
    role: "admin" | "member_visibility",
  ) => void;
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
        console.log("======= setUser =======");
        console.log("Setting user:", user);
        set({ user });
        console.log("======= setUser END =======");
      },

      setIsLoading: (isLoading) => set({ isLoading }),

      setPendingPhone: (pendingPhone) => set({ pendingPhone }),

      grantAccountRole: (accountId, role) => {
        console.log("======= 🔐 grantAccountRole CALLED =======");
        console.log("📌 accountId:", accountId);
        console.log("📌 role:", role);

        const { user } = get();
        if (!user) {
          console.log("❌ No user found, cannot grant role");
          return;
        }

        console.log("👤 Current user:", JSON.stringify(user, null, 2));
        console.log("📋 Current accountRoles:", user.accountRoles);

        const updatedAccountRoles = {
          ...(user.accountRoles || {}),
          [accountId]: role,
        };

        console.log("📝 Updated accountRoles:", updatedAccountRoles);

        const updatedUser = {
          ...user,
          accountRoles: updatedAccountRoles,
        };

        console.log("👤 Updated user:", JSON.stringify(updatedUser, null, 2));

        set({ user: updatedUser });

        const finalUser = get().user;
        console.log(
          "✅ Final user after set:",
          JSON.stringify(finalUser, null, 2),
        );
        console.log("======= 🔐 grantAccountRole END =======");
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
        console.log("======= logout =======");
        set({ user: null });
        console.log("======= logout END =======");
      },
    }),
    {
      name: "auth-storage", // unique name for storage
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

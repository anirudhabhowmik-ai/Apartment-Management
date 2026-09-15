// store/useAuthStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  phone: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  pendingPhone: string | null;

  setUser: (user: AuthUser | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPendingPhone: (phone: string | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      pendingPhone: null,

      setUser: (user) => {
        set({ user });
      },

      setIsLoading: (isLoading) => {
        set({ isLoading });
      },

      setPendingPhone: (pendingPhone) => {
        set({ pendingPhone });
      },

      logout: async () => {
        try {
          await SecureStore.deleteItemAsync("auth_token");
        } catch (error) {
          console.error("Logout: failed to clear token:", error);
        }

        // Also clear the selected account so the next login starts fresh.
        try {
          await SecureStore.deleteItemAsync("selected_account_id");
        } catch {
          // ignore
        }

        set({
          user: null,
          pendingPhone: null,
        });
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist what we need. `isLoading` should always start false.
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
);

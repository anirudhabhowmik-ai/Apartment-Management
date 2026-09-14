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

          set({
            user: null,
            pendingPhone: null,
          });
        } catch (error) {
          console.error("Logout error:", error);

          // Clear local auth state even if SecureStore fails
          set({
            user: null,
            pendingPhone: null,
          });

          throw error;
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

import { create } from "zustand";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  pendingPhone: string | null; // holds phone between login -> otp-verify, never in URL
  setUser: (user: AuthUser | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPendingPhone: (phone: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  pendingPhone: null,
  setUser: (user) => set({ user }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setPendingPhone: (pendingPhone) => set({ pendingPhone }),
  logout: () => set({ user: null }),
}));

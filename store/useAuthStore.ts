// store/useAuthStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

// ============================================================
// USER-SCOPED STORAGE REGISTRY
// ============================================================

const USER_SCOPED_SECURE_KEYS = [
  "auth_token",
  "refresh_token",
  "access_token",
  "selected_account_id",
];

const USER_SCOPED_ASYNC_KEYS = [
  "auth-storage", // zustand persist key for this store
  "account-store", // zustand persist key for useAccountStore
];

export interface AuthUser {
  id: string;
  phone: string;
  name?: string | null;
  photoUrl?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  pendingPhone: string | null;

  setUser: (user: AuthUser | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPendingPhone: (phone: string | null) => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: {
    name?: string | null;
    photoUrl?: string | null;
  }) => Promise<void>;
  logout: (opts?: { revokeAllSessions?: boolean }) => Promise<void>;
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function clearAllAuthStorage(): Promise<void> {
  try {
    await Promise.all(
      USER_SCOPED_SECURE_KEYS.map((key) =>
        SecureStore.deleteItemAsync(key).catch(() => undefined),
      ),
    );
  } catch (e) {
    console.warn("[auth] SecureStore cleanup failed:", e);
  }

  try {
    await AsyncStorage.multiRemove(USER_SCOPED_ASYNC_KEYS);
  } catch (e) {
    console.warn("[auth] AsyncStorage cleanup failed:", e);
  }
}

async function clearRuntimeCaches(): Promise<void> {
  try {
    const { Image } = require("expo-image");
    if (Image?.clearDiskCache) await Image.clearDiskCache();
    if (Image?.clearMemoryCache) await Image.clearMemoryCache();
  } catch {
    // expo-image not installed — ignore
  }

  try {
    const { queryClient } = require("../lib/queryClient");
    if (queryClient?.clear) queryClient.clear();
  } catch {
    // no query client — ignore
  }
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

      setIsLoading: (isLoading) => {
        set({ isLoading });
      },

      setPendingPhone: (pendingPhone) => {
        set({ pendingPhone });
      },

      refreshProfile: async () => {
        try {
          const token = await getAuthToken();
          if (!token || !API_BASE_URL) return;

          const res = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;

          const data: any = await res.json();
          const u = data?.user;
          if (!u) return;

          set({
            user: {
              id: u.id,
              phone: u.phone,
              name: u.name ?? null,
              photoUrl: u.photoUrl ?? null,
              isActive: u.isActive,
              lastLoginAt: u.lastLoginAt ?? null,
            },
          });
        } catch (e) {
          console.warn("[auth] refreshProfile failed:", e);
        }
      },

      updateProfile: async (patch) => {
        const token = await getAuthToken();
        if (!token || !API_BASE_URL) {
          throw new Error("Not signed in.");
        }

        const body: Record<string, any> = {};
        if (Object.prototype.hasOwnProperty.call(patch, "name")) {
          body.name = patch.name;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "photoUrl")) {
          body.photo_url = patch.photoUrl;
        }

        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          throw new Error(data?.message || "Failed to update profile.");
        }

        const u = data?.user;
        if (u) {
          set({
            user: {
              id: u.id,
              phone: u.phone,
              name: u.name ?? null,
              photoUrl: u.photoUrl ?? null,
              isActive: u.isActive,
              lastLoginAt: u.lastLoginAt ?? null,
            },
          });
        }
      },

      logout: async (opts) => {
        // 1) Best-effort server-side logout.
        try {
          const token = await getAuthToken();
          if (token && API_BASE_URL) {
            await fetch(`${API_BASE_URL}/auth/logout`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                revokeAllSessions: opts?.revokeAllSessions ?? false,
              }),
            }).catch(() => undefined);
          }
        } catch (e) {
          console.warn("[auth] server logout failed:", e);
        }

        // 2) Wipe every user-scoped key from device storage.
        await clearAllAuthStorage();

        // 3) Clear non-key runtime caches (image, query, etc.).
        await clearRuntimeCaches();

        // 4) Reset in-memory auth state. Setting user: null FIRST
        //    means any component that reacts to auth state (like
        //    TabsLayout) sees "no user" before it sees an empty
        //    account store — preventing the "flash then redirect"
        //    behavior after a phone change.
        set({
          user: null,
          pendingPhone: null,
        });

        // 4b) Reset the account store in-memory + its loadedForUserId
        //     marker, so the next login starts with hasLoaded = false
        //     and does not inherit this session's accounts.
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { useAccountStore } = require("./accountStore");
          useAccountStore.getState().reset();
        } catch (e) {
          console.warn("[auth] failed to reset account store on logout:", e);
        }

        // 5) Explicitly purge the persisted zustand entry.
        try {
          await useAuthStore.persist.clearStorage();
        } catch (e) {
          console.warn("[auth] persist.clearStorage failed:", e);
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
);

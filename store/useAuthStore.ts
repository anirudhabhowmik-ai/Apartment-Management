// store/useAuthStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

// ============================================================
// USER-SCOPED STORAGE REGISTRY
// ------------------------------------------------------------
// Every key your app writes for a logged-in user goes here.
// When you add a new user-scoped cache anywhere in the app,
// add its key to ONE of these lists. Both normal logout and
// phone-change logout will clear it automatically.
// ============================================================

const USER_SCOPED_SECURE_KEYS = [
  "auth_token",
  "refresh_token",
  "access_token",
  "selected_account_id",
  // add future user-scoped SecureStore keys here:
  // "biometric_unlock",
  // "user_pin",
];

const USER_SCOPED_ASYNC_KEYS = [
  "auth-storage", // zustand persist key for this store
  // add future user-scoped AsyncStorage keys here:
  // "react-query-cache",
  // "swr-cache",
  // "user_draft_message",
  // "user_saved_addresses",
  // "user_last_viewed_screen",
];

export interface AuthUser {
  id: string;
  phone: string;
  name: string | null;
  photoUrl: string | null;
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

/**
 * Wipe every user-scoped key from device storage.
 * Never throws — one failing key cannot abort the whole sign-out.
 */
async function clearAllAuthStorage(): Promise<void> {
  // 1) SecureStore
  try {
    await Promise.all(
      USER_SCOPED_SECURE_KEYS.map((key) =>
        SecureStore.deleteItemAsync(key).catch(() => undefined),
      ),
    );
  } catch (e) {
    console.warn("[auth] SecureStore cleanup failed:", e);
  }

  // 2) AsyncStorage
  try {
    await AsyncStorage.multiRemove(USER_SCOPED_ASYNC_KEYS);
  } catch (e) {
    console.warn("[auth] AsyncStorage cleanup failed:", e);
  }
}

/**
 * Best-effort cleanup of non-key-based caches.
 * Each block is wrapped so a missing module never breaks logout.
 */
async function clearRuntimeCaches(): Promise<void> {
  // Image cache (expo-image)
  try {
    const { Image } = require("expo-image");
    if (Image?.clearDiskCache) await Image.clearDiskCache();
    if (Image?.clearMemoryCache) await Image.clearMemoryCache();
  } catch {
    // expo-image not installed — ignore
  }

  // React Query (if you use it)
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
        //    For phone-change, pass { revokeAllSessions: true }.
        //    Never blocks local sign-out.
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

        // 4) Reset in-memory state. This also writes { user: null }
        //    to AsyncStorage via persist, overwriting stale snapshots.
        set({
          user: null,
          pendingPhone: null,
        });

        // 5) Explicitly purge the persisted zustand entry. Guarantees
        //    no stale user rehydrates on next launch, even if the
        //    persist write in step 4 was interrupted.
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

// hooks/useNotifications.ts
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/api\/?$/, "");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface NotificationItem {
  id: string;
  account_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

interface UseNotificationsOptions {
  /** Only fetch notifications for this account. Omit for all accounts. */
  accountId?: string;
  /** Auto-fetch on mount + when accountId changes. Default: true */
  autoFetch?: boolean;
  /** Poll interval in ms. Omit to disable polling. */
  pollIntervalMs?: number;
}

interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// SecureStore helper
// ---------------------------------------------------------------------------
async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("auth_token");
  } catch (err) {
    console.warn("[useNotifications] SecureStore read failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useNotifications(
  options: UseNotificationsOptions = {},
): UseNotificationsResult {
  const { accountId, autoFetch = true, pollIntervalMs } = options;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard so multiple mounts don't stomp on each other
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Fetch list
  // -------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      if (mountedRef.current) {
        setNotifications([]);
        setUnreadCount(0);
        setError(null);
      }
      return;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const url = new URL(`${API_URL}/api/notifications`);
      if (accountId) url.searchParams.set("accountId", accountId);
      url.searchParams.set("limit", "30");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Request failed (${res.status})`);
      }

      const data = await res.json();
      if (!mountedRef.current) return;

      setNotifications(
        Array.isArray(data.notifications) ? data.notifications : [],
      );
      setUnreadCount(
        typeof data.unreadCount === "number" ? data.unreadCount : 0,
      );
      setError(null);
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.warn("[useNotifications] refresh failed:", err?.message);
      setError(err?.message || "Failed to load notifications");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [accountId]);

  // -------------------------------------------------------------------------
  // Mark one as read (optimistic)
  // -------------------------------------------------------------------------
  const markRead = useCallback(
    async (id: string) => {
      const token = await getAuthToken();
      if (!token) return;

      // Optimistic
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && !n.read_at
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        await fetch(`${API_URL}/api/notifications/${id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.warn("[useNotifications] markRead failed:", err);
        // Roll back on failure
        refresh().catch(() => {});
      }
    },
    [refresh],
  );

  // -------------------------------------------------------------------------
  // Mark all as read
  // -------------------------------------------------------------------------
  const markAllRead = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;

    const now = new Date().toISOString();
    const previous = notifications;
    const previousUnread = unreadCount;

    // Optimistic
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    );
    setUnreadCount(0);

    try {
      const url = new URL(`${API_URL}/api/notifications/read-all`);
      if (accountId) url.searchParams.set("accountId", accountId);

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
    } catch (err: any) {
      console.warn("[useNotifications] markAllRead failed:", err?.message);
      // Roll back
      setNotifications(previous);
      setUnreadCount(previousUnread);
    }
  }, [accountId, notifications, unreadCount]);

  // -------------------------------------------------------------------------
  // Dismiss (soft-delete)
  // -------------------------------------------------------------------------
  const dismiss = useCallback(
    async (id: string) => {
      const token = await getAuthToken();
      if (!token) return;

      const previous = notifications;
      const previousUnread = unreadCount;
      const target = notifications.find((n) => n.id === id);

      // Optimistic
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.read_at) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }

      try {
        const res = await fetch(`${API_URL}/api/notifications/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
      } catch (err: any) {
        console.warn("[useNotifications] dismiss failed:", err?.message);
        setNotifications(previous);
        setUnreadCount(previousUnread);
      }
    },
    [notifications, unreadCount],
  );

  // -------------------------------------------------------------------------
  // Auto-fetch on mount + accountId change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!autoFetch) return;
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, autoFetch]);

  // -------------------------------------------------------------------------
  // Refresh when app returns to foreground
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refresh().catch(() => {});
    });
    return () => sub.remove();
  }, [refresh]);

  // -------------------------------------------------------------------------
  // Optional polling
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;
    const handle = setInterval(() => {
      refresh().catch(() => {});
    }, pollIntervalMs);
    return () => clearInterval(handle);
  }, [pollIntervalMs, refresh]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markRead,
    markAllRead,
    dismiss,
  };
}

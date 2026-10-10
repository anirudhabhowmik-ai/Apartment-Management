// utils/pendingPassTab.ts
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE_KEY = "pending_pass_tab";

/**
 * SecureStore only accepts keys with [A-Za-z0-9._-].
 * Account IDs can contain anything (emails, IDs with `@`, spaces, etc.),
 * so we sanitize before building the key.
 */
function safeKey(accountId?: string | null): string {
  const raw = String(accountId ?? "").trim();
  if (!raw) return BASE_KEY;
  const sanitized = raw.replace(/[^A-Za-z0-9._-]/g, "");
  if (!sanitized) return BASE_KEY;
  return `${BASE_KEY}_${sanitized}`;
}

/* Web fallback — SecureStore has no real web implementation. */
async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("[pendingPassTab] localStorage set failed:", e);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("[pendingPassTab] localStorage get failed:", e);
    }
    return null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("[pendingPassTab] localStorage remove failed:", e);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/* ------------------------------------------------------------------------- */
/* Public API                                                                */
/* ------------------------------------------------------------------------- */

export type PendingPassTab = "passes" | "qr";

export async function setPendingPassTab(
  tab: PendingPassTab,
  accountId?: string | null,
): Promise<void> {
  try {
    await setItem(safeKey(accountId), tab);
  } catch (e) {
    console.warn("[pendingPassTab] set failed:", e);
  }
}

export async function consumePendingPassTab(
  accountId?: string | null,
): Promise<PendingPassTab | null> {
  const key = safeKey(accountId);
  try {
    const v = await getItem(key);
    if (v) {
      try {
        await deleteItem(key);
      } catch {
        // best-effort delete; ignore failures
      }
    }
    if (v === "passes" || v === "qr") return v;
    return null;
  } catch (e) {
    console.warn("[pendingPassTab] read failed:", e);
    return null;
  }
}

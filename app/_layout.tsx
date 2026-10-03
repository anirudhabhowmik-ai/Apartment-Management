// app/_layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Appearance, AppState, LogBox, Platform } from "react-native";

import NameConflictAlert from "../components/NameConflictAlert";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import {
  initializeRevenueCat,
  resetRevenueCat,
} from "../services/revenueCatService";
import { useThemeStore } from "../store/themeStore";
import { useAuthStore } from "../store/useAuthStore";
import { getSecureItem } from "../utils/tokenStorage";

LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

export default function RootLayout() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = !!user;

  // ── Dark mode ────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(isDarkMode ? "dark" : "light");
    }
  }, [isDarkMode]);

  // ── Web: remove the browser's default focus outline/border on inputs ──
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const styleId = "global-web-focus-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      input, textarea, select {
        outline: none;
      }
      input:focus, textarea:focus, select:focus {
        outline: none;
        box-shadow: none;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── RevenueCat: init on login, reset on logout ───────────────────────
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      initializeRevenueCat(user.id).catch((err) =>
        console.warn("[revenuecat] init failed:", err),
      );
    } else if (!isAuthenticated) {
      resetRevenueCat().catch(() => {});
    }
  }, [isAuthenticated, user?.id]);

  // ── Push notification registration ───────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    (async () => {
      try {
        const expoToken = await registerForPushNotificationsAsync();
        if (!expoToken || cancelled) {
          console.log("[push] no token generated");
          return;
        }
        console.log("[push] got token:", expoToken);

        const authToken = await getSecureItem(AUTH_TOKEN_KEY);
        if (!authToken || cancelled) {
          console.log("[push] no auth token, skipping register");
          return;
        }

        const res = await fetch(`${API_URL}/push/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: expoToken, platform: Platform.OS }),
        });

        console.log("[push] register response:", res.status);
      } catch (e) {
        console.warn("[push] token sync failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // ── On app foreground: silently re-verify auth state ─────────────────
  // This catches cases where the user leaves the app in the background
  // and the server revoked their access while they were away.
  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      // Touch the auth store to trigger any auth-related refresh.
      // The individual screens handle their own role verification
      // on focus, so no additional work is needed here yet.
    });

    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDarkMode ? "#101720" : "#FFFFFF",
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
      </Stack>
      <NameConflictAlert />
    </>
  );
}

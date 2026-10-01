// app/_layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Appearance, LogBox, Platform } from "react-native";

import NameConflictAlert from "../components/NameConflictAlert";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import {
  initializeRevenueCat,
  resetRevenueCat,
} from "../services/revenueCatService";
import { useAuthStore } from "../store/useAuthStore";
import { getSecureItem } from "../utils/tokenStorage";
import { useThemeStore } from "../store/themeStore";

LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

export default function RootLayout() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = !!user;

  // ── RevenueCat: init on login, reset on logout ─────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(isDarkMode ? "dark" : "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      initializeRevenueCat(user.id).catch((err) =>
        console.warn("[revenuecat] init failed:", err),
      );
    } else if (!isAuthenticated) {
      resetRevenueCat().catch(() => {});
    }
  }, [isAuthenticated, user?.id]);

  // ── Push notification registration (existing) ──────────────────────────
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

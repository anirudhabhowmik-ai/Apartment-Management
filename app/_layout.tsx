// app/_layout.tsx
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";

import NameConflictAlert from "../components/NameConflictAlert";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import { useAuthStore } from "../store/useAuthStore";

LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

export default function RootLayout() {
  // Only register the device once the user is authenticated.
  // If your store uses a different field (e.g. `session`), adjust the
  // selector below.
  const isAuthenticated = useAuthStore((s) => !!s.user);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Ask Expo for the device push token.
        const expoToken = await registerForPushNotificationsAsync();
        if (!expoToken || cancelled) {
          console.log("[push] no token generated");
          return;
        }
        console.log("[push] got token:", expoToken);

        // 2. Grab the auth token so we can call the backend.
        const authToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        if (!authToken || cancelled) {
          console.log("[push] no auth token, skipping register");
          return;
        }

        // 3. Send the Expo token to the backend so it can push to this device.
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
      </Stack>
      <NameConflictAlert />
    </>
  );
}

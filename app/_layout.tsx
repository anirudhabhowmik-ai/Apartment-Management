import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import AccountGate from "../components/AccountGate";
import { registerForPushNotificationsAsync } from "../services/notificationService";

// Silence expo-router's pre-mount deep-link warning.
// See: expo-router/build/fork/useLinking.native.js — this fires on cold start
// before the root navigator has mounted. Harmless, safe to ignore.
LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return (
    <AccountGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
      </Stack>
    </AccountGate>
  );
}

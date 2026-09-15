import { Stack } from "expo-router";
import { useEffect } from "react";
import AccountGate from "../components/AccountGate";
import { registerForPushNotificationsAsync } from "../services/notificationService";

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

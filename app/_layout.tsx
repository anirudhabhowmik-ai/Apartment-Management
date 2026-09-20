// app/_layout.tsx
import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import NameConflictAlert from "../components/NameConflictAlert";
import { registerForPushNotificationsAsync } from "../services/notificationService";

LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

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

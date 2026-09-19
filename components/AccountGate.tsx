import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAccountStore } from "../store/accountStore";
import { useAuthStore } from "../store/useAuthStore";

export default function AccountGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const segments = useSegments();

  const user = useAuthStore((s) => s.user);

  const accounts = useAccountStore((s) => s.accounts);
  const selectedAccountId = useAccountStore((s) => s.selectedAccountId);
  const hasHydrated = useAccountStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!user) return;
    if (!hasHydrated) return;

    const path = segments.join("/");
    const inAuthGroup = segments[0] === "(auth)";
    const inAddAccount = path.includes("add-account");
    const inSelectAccount = path.includes("select-account");

    if (accounts.length === 0) {
      if (!inAddAccount && !inAuthGroup) {
        router.replace("/(modals)/add-account");
      }
      return;
    }

    if (!selectedAccountId) {
      if (!inSelectAccount && !inAuthGroup) {
        router.replace("/(modals)/select-account");
      }
      return;
    }

    if (inAddAccount || inSelectAccount) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts.length, selectedAccountId, hasHydrated, segments]);

  if (user && !hasHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading your accounts…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 12,
  },
});

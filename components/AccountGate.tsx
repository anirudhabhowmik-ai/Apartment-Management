import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAccounts } from "../hooks/useAccounts";
import { useAuthStore } from "../store/useAuthStore";

export default function AccountGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const segments = useSegments();

  const user = useAuthStore((s) => s.user);

  const { accounts, selectedAccountId, isLoading, hasLoaded } = useAccounts();

  useEffect(() => {
    if (!user) {
      // Not logged in — send to login. Don't gate here; let the app's
      // normal auth flow take over.
      return;
    }

    if (!hasLoaded || isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAddAccount = segments.join("/").includes("add-account");
    const inSelectAccount = segments.join("/").includes("select-account");

    // User is authenticated but has zero accounts → force Add Account.
    if (accounts.length === 0) {
      if (!inAddAccount && !inAuthGroup) {
        router.replace("/(modals)/add-account");
      }
      return;
    }

    // User has accounts but none selected → force Select Account.
    if (!selectedAccountId) {
      if (!inSelectAccount && !inAuthGroup) {
        router.replace("/(modals)/select-account");
      }
      return;
    }

    // User has accounts + a valid selection. If they're stuck on
    // add-account or select-account, push them back to the tabs.
    if (inAddAccount || inSelectAccount) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts.length, selectedAccountId, hasLoaded, isLoading]);

  // Show a spinner while we don't yet know which screen to show.
  if (user && (!hasLoaded || isLoading)) {
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

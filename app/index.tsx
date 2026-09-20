// app/index.tsx
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAccounts } from "../hooks/useAccounts";
import { useAuth } from "../hooks/useAuth";

export default function Index() {
  const { user, isLoading: authLoading } = useAuth();
  const { accounts, hasLoaded, isLoading: accountsLoading } = useAccounts();

  // Wait for authentication to finish restoring.
  if (authLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Not logged in → login.
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // Wait until the account list has been fetched at least once.
  // Without `hasLoaded`, this screen redirects to add-account during
  // the brief window after login when the store is still empty.
  if (!hasLoaded || accountsLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // No accounts at all → create one.
  if (accounts.length === 0) {
    return <Redirect href="/(modals)/add-account" />;
  }

  // Has accounts → go to the tabs. The tabs layout will route to
  // select-account if no account is currently selected.
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
});

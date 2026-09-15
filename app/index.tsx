import { Redirect } from "expo-router";
import { useAccounts } from "../hooks/useAccounts";
import { useAuth } from "../hooks/useAuth";

export default function Index() {
  const { user, isLoading: authLoading } = useAuth();

  const { accounts, isLoading: accountsLoading } = useAccounts();

  // Wait for authentication to finish restoring
  if (authLoading) {
    return null;
  }

  // Not logged in → login
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // Wait for accounts API to finish
  if (accountsLoading) {
    return null;
  }

  // No account → create/join account
  if (accounts.length === 0) {
    return <Redirect href="/(modals)/add-account" />;
  }

  // Has account → app
  return <Redirect href="/(tabs)" />;
}

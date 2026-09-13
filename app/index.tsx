import { Redirect } from "expo-router";
import { useAccounts } from "../hooks/useAccounts";
import { useAuth } from "../hooks/useAuth";

export default function Index() {
  const { user, isLoading } = useAuth();
  const { accounts } = useAccounts();

  if (isLoading) {
    return null; // or a loading spinner
  }

  // Not logged in → login
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in but hasn't created/joined any account yet → finish setup
  if (accounts.length === 0) {
    return <Redirect href="/(modals)/add-account" />;
  }

  // Logged in with at least one account → go to app
  return <Redirect href="/(tabs)" />;
}

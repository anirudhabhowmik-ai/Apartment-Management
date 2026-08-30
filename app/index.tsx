import { Redirect } from "expo-router";
import { useAuth } from "../hooks/useAuth";

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null; // or a loading spinner
  }

  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/login" />;
}

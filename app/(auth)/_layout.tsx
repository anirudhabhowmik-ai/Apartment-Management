import { Stack } from "expo-router";
import Head from "expo-router/head";

export default function AuthLayout() {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="otp-verify" />
      </Stack>
    </>
  );
}

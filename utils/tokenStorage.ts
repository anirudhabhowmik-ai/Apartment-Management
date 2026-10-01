// utils/tokenStorage.ts
// Cross-platform secure token storage.
//
//  • Native (iOS/Android): expo-secure-store → encrypted keychain / keystore
//  • Web:                  AsyncStorage      → browser localStorage
//
// Web cannot use SecureStore because expo-secure-store has no web
// implementation (it is backed by native OS APIs that don't exist in a
// browser). AsyncStorage is the standard replacement on web.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const AUTH_TOKEN_KEY = "auth_token";

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// Convenience wrappers for the auth token specifically
export const setAuthToken = (v: string) => setSecureItem(AUTH_TOKEN_KEY, v);
export const getAuthToken = () => getSecureItem(AUTH_TOKEN_KEY);
export const deleteAuthToken = () => deleteSecureItem(AUTH_TOKEN_KEY);

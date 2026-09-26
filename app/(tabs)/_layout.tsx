// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AccountSwitcherHost,
  AccountSwitcherTrigger,
} from "../../components/AccountSwitcher";
import { useAccounts } from "../../hooks/useAccounts";
import { useUserRole } from "../../hooks/useUserRole";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/api\/?$/, "");

const COLORS = {
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  background: "#F8FAFC",
  white: "#FFFFFF",
  text: "#0F172A",
  secondary: "#64748B",
  muted: "#94A3B8",
  border: "#E2E8F0",
  danger: "#DC2626",
  warning: "#D97706",
  warningLight: "#FFF7ED",
  success: "#16A34A",
  successLight: "#F0FDF4",
};

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  createdAt: string;
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const authUser = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { selectedAccount, accounts, hasLoaded, isLoading, refresh } =
    useAccounts();
  const { isAdmin, isMember, isStaff } = useUserRole();

  const [showNotifications, setShowNotifications] = useState(false);

  // No real notification source yet — empty feed.
  // Will be replaced by `useNotifications(selectedAccount?.id)` later.
  const notifications: NotificationItem[] = [];
  const notificationCount = notifications.length;

  const hasRedirectedRef = useRef<"add" | "select" | null>(null);
  const lastRefreshRef = useRef<number>(0);

  // -------------------------------------------------------------------------
  // Inline role-sync. Fetches the caller's role for the selected account
  // and pushes it into the store if it changed. No polling.
  // -------------------------------------------------------------------------
  const syncMyRole = useCallback(async () => {
    const store = useAccountStore.getState();
    const accountId = store.selectedAccountId;
    if (!accountId) return;

    try {
      const token = await SecureStore.getItemAsync("auth_token");
      if (!token) return;

      const res = await fetch(`${API_URL}/api/accounts/${accountId}/my-role`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      const newRole: string | null = data?.role ?? null;

      const current = store.getSelectedAccount();
      if (!current) return;
      if ((current as any).role === newRole) return;

      useAccountStore.getState().setAccountRole(accountId, newRole);
    } catch {
      // ignore transient errors
    }
  }, []);

  // -------------------------------------------------------------------------
  // Register the sync function on the store so any other screen can trigger
  // it after a role-changing action (accept invite, withdraw admin, etc.).
  // -------------------------------------------------------------------------
  useEffect(() => {
    useAccountStore.getState().setRequestRoleSync(() => {
      syncMyRole().catch(() => {});
    });
    return () => {
      useAccountStore.getState().setRequestRoleSync(null);
    };
  }, [syncMyRole]);

  // -------------------------------------------------------------------------
  // Sync on tab focus (throttled to 1.5 s).
  // -------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) return;
      lastRefreshRef.current = now;
      refresh();
      refreshProfile?.().catch(() => {});
      syncMyRole();
    }, [refresh, refreshProfile, syncMyRole]),
  );

  // -------------------------------------------------------------------------
  // Sync on app foreground.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) return;
      lastRefreshRef.current = now;
      refresh();
      refreshProfile?.().catch(() => {});
      syncMyRole();
    });
    return () => sub.remove();
  }, [refresh, refreshProfile, syncMyRole]);

  // -------------------------------------------------------------------------
  // Redirects to add/select-account modal.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!authUser) return;
    if (!hasLoaded || isLoading) return;

    if (accounts.length === 0) {
      if (hasRedirectedRef.current === "add") return;
      hasRedirectedRef.current = "add";
      router.replace("/(modals)/add-account");
      return;
    }

    if (!selectedAccount?.id) {
      if (hasRedirectedRef.current === "select") return;
      hasRedirectedRef.current = "select";
      router.replace("/(modals)/select-account");
      return;
    }

    hasRedirectedRef.current = null;
  }, [
    authUser,
    accounts.length,
    selectedAccount?.id,
    hasLoaded,
    isLoading,
    router,
  ]);

  const canSeeFinance = isAdmin || isMember;
  const canSeeCalendar = isAdmin || isMember;
  const canSeeManagement = isAdmin || isMember || isStaff;

  const peopleTabTitle = isAdmin
    ? "Management"
    : isMember || isStaff
      ? "Residents"
      : "Management";

  const peopleTabIcon = (focused: boolean): keyof typeof Ionicons.glyphMap => {
    if (isAdmin) return focused ? "briefcase" : "briefcase-outline";
    if (isMember || isStaff) {
      return focused ? "business" : "business-outline";
    }
    return focused ? "briefcase" : "briefcase-outline";
  };

  const bottomInset = insets.bottom;

  return (
    <>
      <Tabs
        screenOptions={{
          headerTitle: () => (
            <View style={styles.accountSwitcherContainer}>
              <AccountSwitcherTrigger />
            </View>
          ),
          headerTitleAlign: "left",
          headerStyle: {
            backgroundColor: COLORS.white,
            elevation: 0,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          },
          headerShadowVisible: false,
          headerRight: () => (
            <View style={styles.notificationMenu}>
              <TouchableOpacity
                onPress={() => setShowNotifications((v) => !v)}
                style={styles.notificationButton}
                activeOpacity={0.7}
              >
                <View style={styles.notificationIconWrapper}>
                  <Ionicons
                    name="notifications-outline"
                    size={23}
                    color={COLORS.text}
                  />
                  {notificationCount > 0 && (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationCount}>
                        {notificationCount > 99 ? "99+" : notificationCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <Modal
                transparent
                visible={showNotifications}
                animationType="fade"
                onRequestClose={() => setShowNotifications(false)}
              >
                <Pressable
                  style={styles.notificationBackdrop}
                  onPress={() => setShowNotifications(false)}
                >
                  <Pressable
                    style={styles.notificationPopover}
                    onPress={(event) => event.stopPropagation()}
                  >
                    <View style={styles.notificationHeader}>
                      <View style={styles.notificationHeaderTextContainer}>
                        <Text style={styles.notificationHeaderTitle}>
                          Notifications
                        </Text>
                        <Text style={styles.notificationHeaderSubtitle}>
                          {notificationCount === 0
                            ? "Everything is up to date"
                            : `${notificationCount} item${
                                notificationCount === 1 ? "" : "s"
                              } need your attention`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.closeNotificationButton}
                        onPress={() => setShowNotifications(false)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="close"
                          size={19}
                          color={COLORS.secondary}
                        />
                      </TouchableOpacity>
                    </View>

                    {notificationCount === 0 ? (
                      <View style={styles.emptyNotifications}>
                        <View style={styles.emptyNotificationIcon}>
                          <Ionicons
                            name="notifications-off-outline"
                            size={30}
                            color={COLORS.secondary}
                          />
                        </View>
                        <Text style={styles.emptyNotificationsTitle}>
                          No notifications yet
                        </Text>
                        <Text style={styles.emptyNotificationsText}>
                          You'll see updates here when payments, events,
                          notices, or role changes happen in this account.
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.notificationScrollContent}
                      >
                        {notifications.map((n) => (
                          <View key={n.id} style={styles.notificationItem}>
                            <View
                              style={[
                                styles.notificationItemIcon,
                                styles.taskIcon,
                              ]}
                            >
                              <Ionicons
                                name="notifications-outline"
                                size={18}
                                color={COLORS.primary}
                              />
                            </View>
                            <View style={styles.notificationContent}>
                              <Text
                                style={styles.notificationTitle}
                                numberOfLines={1}
                              >
                                {n.title}
                              </Text>
                              <View style={styles.notificationMeta}>
                                <Ionicons
                                  name="time-outline"
                                  size={12}
                                  color={COLORS.secondary}
                                />
                                <Text style={styles.notificationDetail}>
                                  {new Date(n.createdAt).toLocaleDateString()}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </Pressable>
                </Pressable>
              </Modal>
            </View>
          ),
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarStyle: {
            height: 64 + bottomInset,
            paddingTop: 5,
            paddingBottom: bottomInset + 5,
            paddingHorizontal: 8,
            backgroundColor: COLORS.white,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            ...(Platform.OS === "android" ? { elevation: 0 } : {}),
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "600",
            marginTop: 1,
          },
          tabBarItemStyle: {
            height: 44,
            marginHorizontal: 0,
            padding: 0,
            backgroundColor: "transparent",
            borderRadius: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <View
                style={[
                  styles.tabIconContainer,
                  focused && styles.tabIconContainerActive,
                ]}
              >
                <Ionicons
                  name={focused ? "home" : "home-outline"}
                  color={color}
                  size={22}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Calendar",
            href: canSeeCalendar ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={[
                  styles.tabIconContainer,
                  focused && styles.tabIconContainerActive,
                ]}
              >
                <Ionicons
                  name={focused ? "calendar" : "calendar-outline"}
                  color={color}
                  size={22}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="finance"
          options={{
            title: "Finance",
            href: canSeeFinance ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={[
                  styles.tabIconContainer,
                  focused && styles.tabIconContainerActive,
                ]}
              >
                <Ionicons
                  name={focused ? "wallet" : "wallet-outline"}
                  color={color}
                  size={22}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="people"
          options={{
            title: peopleTabTitle,
            href: canSeeManagement ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={[
                  styles.tabIconContainer,
                  focused && styles.tabIconContainerActive,
                ]}
              >
                <Ionicons
                  name={peopleTabIcon(focused)}
                  color={color}
                  size={22}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <View
                style={[
                  styles.tabIconContainer,
                  focused && styles.tabIconContainerActive,
                ]}
              >
                <Ionicons
                  name={focused ? "person" : "person-outline"}
                  color={color}
                  size={22}
                />
              </View>
            ),
          }}
        />
      </Tabs>

      <AccountSwitcherHost />
    </>
  );
}

const styles = StyleSheet.create({
  accountSwitcherContainer: {
    flex: 1,
    maxWidth: 280,
    justifyContent: "center",
  },
  notificationMenu: { position: "relative", zIndex: 100 },
  notificationButton: { marginRight: 12, padding: 5 },
  notificationIconWrapper: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  notificationBadge: {
    position: "absolute",
    top: -2,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  notificationCount: { color: COLORS.white, fontSize: 9, fontWeight: "700" },
  notificationBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.12)",
  },
  notificationPopover: {
    position: "absolute",
    top: Platform.OS === "ios" ? 94 : 60,
    right: 12,
    width: 350,
    maxWidth: "calc(100% - 24px)" as any,
    maxHeight: 430,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  notificationHeaderTextContainer: { flex: 1 },
  notificationHeaderTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
  },
  notificationHeaderSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 3,
  },
  closeNotificationButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  notificationScrollContent: { paddingBottom: 4 },
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  notificationItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  paymentIcon: { backgroundColor: COLORS.warningLight },
  taskIcon: { backgroundColor: COLORS.primaryLight },
  notificationContent: { flex: 1, minWidth: 0 },
  notificationTitle: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  notificationMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  notificationDetail: { color: COLORS.secondary, fontSize: 11, marginLeft: 4 },
  dismissButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  emptyNotifications: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  emptyNotificationIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyNotificationsTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  emptyNotificationsText: {
    color: COLORS.secondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 5,
  },
  tabIconContainer: {
    width: 38,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  tabIconContainerActive: { backgroundColor: COLORS.primaryLight },
}) as any;

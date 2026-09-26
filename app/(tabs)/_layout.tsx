// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
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
import {
  NotificationItem,
  useNotifications,
} from "../../hooks/useNotifications";
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
  purple: "#7C3AED",
  purpleLight: "#F5F3FF",
};

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

function iconForNotification(n: NotificationItem): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  const key = `${n.entity_type}.${n.action}`;

  if (key.startsWith("member.payment") || key.startsWith("staff.payment")) {
    return {
      name: "receipt-outline",
      color: COLORS.warning,
      bg: COLORS.warningLight,
    };
  }
  if (key === "calendar_event.create") {
    const isNotice = n.data?.metadata?.kind === "a notice";
    return isNotice
      ? {
          name: "megaphone-outline",
          color: COLORS.purple,
          bg: COLORS.purpleLight,
        }
      : {
          name: "calendar-outline",
          color: COLORS.primary,
          bg: COLORS.primaryLight,
        };
  }
  if (key === "calendar_event.approve") {
    return {
      name: "checkmark-circle-outline",
      color: COLORS.success,
      bg: COLORS.successLight,
    };
  }
  if (key === "calendar_event.reject") {
    return {
      name: "close-circle-outline",
      color: COLORS.danger,
      bg: "#FEF2F2",
    };
  }
  if (key === "calendar_event.delete") {
    return { name: "trash-outline", color: COLORS.danger, bg: "#FEF2F2" };
  }
  if (key.startsWith("invitation.")) {
    return {
      name: "mail-outline",
      color: COLORS.primary,
      bg: COLORS.primaryLight,
    };
  }
  if (key.startsWith("account_member.")) {
    return {
      name: "shield-checkmark-outline",
      color: COLORS.primary,
      bg: COLORS.primaryLight,
    };
  }
  if (key === "account.transfer_ownership") {
    return {
      name: "swap-horizontal-outline",
      color: COLORS.warning,
      bg: COLORS.warningLight,
    };
  }
  if (key.startsWith("expense.")) {
    return {
      name: "cash-outline",
      color: COLORS.success,
      bg: COLORS.successLight,
    };
  }
  return {
    name: "notifications-outline",
    color: COLORS.primary,
    bg: COLORS.primaryLight,
  };
}

// ---------------------------------------------------------------------------

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const authUser = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { selectedAccount, accounts, hasLoaded, isLoading, refresh } =
    useAccounts();
  const { isAdmin, isMember, isStaff } = useUserRole();

  const [showNotifications, setShowNotifications] = useState(false);
  const [tabsFocused, setTabsFocused] = useState(true);

  // Measured position of the bell so the popover appears right below it in
  // every environment (Expo Go, dev build, production APK).
  const bellRef = useRef<View>(null);
  const [bellBottomY, setBellBottomY] = useState<number | null>(null);

  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    refresh: refreshNotifications,
    markRead,
    markAllRead,
    dismiss,
  } = useNotifications({
    accountId: selectedAccount?.id,
    pollIntervalMs: tabsFocused ? 10000 : undefined,
  });

  const notificationCount = unreadCount;

  // ── Bell + badge animations ────────────────────────────────────────────────
  const bellRing = useRef(new Animated.Value(0)).current;
  const badgePop = useRef(new Animated.Value(1)).current;
  const lastUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastUnreadRef.current === null) {
      lastUnreadRef.current = unreadCount;
      return;
    }

    if (unreadCount > lastUnreadRef.current) {
      bellRing.setValue(0);
      Animated.timing(bellRing, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      badgePop.setValue(1);
      Animated.sequence([
        Animated.timing(badgePop, {
          toValue: 1.5,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(badgePop, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }

    lastUnreadRef.current = unreadCount;
  }, [unreadCount, bellRing, badgePop]);

  // ── Role sync ──────────────────────────────────────────────────────────────
  const hasRedirectedRef = useRef<"add" | "select" | null>(null);
  const lastRefreshRef = useRef<number>(0);
  const accessLostRef = useRef<boolean>(false);

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

      const prevRole = (current as any).role ?? null;
      if (prevRole === newRole) return;

      const lostAccess = !!prevRole && !newRole;
      if (lostAccess && !accessLostRef.current) {
        accessLostRef.current = true;
        Alert.alert(
          "Access removed",
          "Your access to this property has been removed.",
          [{ text: "OK" }],
        );
      }

      if (newRole) accessLostRef.current = false;

      useAccountStore.getState().setAccountRole(accountId, newRole);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    useAccountStore.getState().setRequestRoleSync(() => {
      syncMyRole().catch(() => {});
    });
    return () => {
      useAccountStore.getState().setRequestRoleSync(null);
    };
  }, [syncMyRole]);

  useEffect(() => {
    if (!tabsFocused) return;
    if (!selectedAccount?.id) return;

    const handle = setInterval(() => {
      syncMyRole().catch(() => {});
    }, 30000);

    return () => clearInterval(handle);
  }, [tabsFocused, selectedAccount?.id, syncMyRole]);

  useFocusEffect(
    useCallback(() => {
      setTabsFocused(true);
      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) {
        return () => setTabsFocused(false);
      }
      lastRefreshRef.current = now;
      refresh();
      refreshProfile?.().catch(() => {});
      syncMyRole();
      refreshNotifications().catch(() => {});
      return () => setTabsFocused(false);
    }, [refresh, refreshProfile, syncMyRole, refreshNotifications]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setTabsFocused(false);
        return;
      }
      setTabsFocused(true);
      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) return;
      lastRefreshRef.current = now;
      refresh();
      refreshProfile?.().catch(() => {});
      syncMyRole();
      refreshNotifications().catch(() => {});
    });
    return () => sub.remove();
  }, [refresh, refreshProfile, syncMyRole, refreshNotifications]);

  useEffect(() => {
    if (!showNotifications) return;
    refreshNotifications().catch(() => {});
  }, [showNotifications, refreshNotifications]);

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

  const bellRotate = bellRing.interpolate({
    inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
    outputRange: [
      "0deg",
      "-25deg",
      "25deg",
      "-25deg",
      "25deg",
      "-15deg",
      "0deg",
    ],
  });

  // The popover top offset.
  //   • Preferred: the measured bottom of the bell (works in every build).
  //   • Fallback: safe-area top + 56 (typical header height).
  const popoverTop = bellBottomY ?? insets.top + 56;

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
            <View style={styles.notificationMenu} ref={bellRef}>
              <TouchableOpacity
                onPress={() => {
                  // Measure the bell BEFORE opening the popover so we know
                  // exactly where to place it.
                  bellRef.current?.measureInWindow((_x, y, _width, height) => {
                    setBellBottomY(y + height + 8);
                  });
                  setShowNotifications((v) => !v);
                }}
                style={styles.notificationButton}
                activeOpacity={0.7}
              >
                <View style={styles.notificationIconWrapper}>
                  <Animated.View
                    style={{ transform: [{ rotate: bellRotate }] }}
                  >
                    <Ionicons
                      name="notifications-outline"
                      size={23}
                      color={COLORS.text}
                    />
                  </Animated.View>
                  {notificationCount > 0 && (
                    <Animated.View
                      style={[
                        styles.notificationBadge,
                        { transform: [{ scale: badgePop }] },
                      ]}
                    >
                      <Text style={styles.notificationCount}>
                        {notificationCount > 99 ? "99+" : notificationCount}
                      </Text>
                    </Animated.View>
                  )}
                </View>
              </TouchableOpacity>

              <Modal
                transparent
                visible={showNotifications}
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setShowNotifications(false)}
              >
                <Pressable
                  style={styles.notificationBackdrop}
                  onPress={() => setShowNotifications(false)}
                >
                  <Pressable
                    style={[styles.notificationPopover, { top: popoverTop }]}
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
                            : `${notificationCount} unread`}
                        </Text>
                      </View>

                      {notifications.length > 0 && unreadCount > 0 && (
                        <TouchableOpacity
                          onPress={() => {
                            markAllRead().catch(() => {});
                          }}
                          activeOpacity={0.7}
                          style={styles.markAllReadButton}
                        >
                          <Text style={styles.markAllReadText}>
                            Mark all read
                          </Text>
                        </TouchableOpacity>
                      )}

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

                    {notificationsLoading && notifications.length === 0 ? (
                      <View style={styles.loadingNotifications}>
                        <ActivityIndicator color={COLORS.primary} />
                      </View>
                    ) : notifications.length === 0 ? (
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
                        {notifications.map((n) => {
                          const icon = iconForNotification(n);
                          const isUnread = !n.read_at;
                          return (
                            <Pressable
                              key={n.id}
                              onPress={() => {
                                if (isUnread) {
                                  markRead(n.id).catch(() => {});
                                }
                              }}
                              style={({ pressed }) => [
                                styles.notificationItem,
                                isUnread && styles.notificationItemUnread,
                                pressed && styles.notificationItemPressed,
                              ]}
                            >
                              <View
                                style={[
                                  styles.notificationItemIcon,
                                  { backgroundColor: icon.bg },
                                ]}
                              >
                                <Ionicons
                                  name={icon.name}
                                  size={18}
                                  color={icon.color}
                                />
                              </View>

                              <View style={styles.notificationContent}>
                                <Text
                                  style={styles.notificationTitle}
                                  numberOfLines={1}
                                >
                                  {n.title}
                                </Text>
                                {!!n.body && (
                                  <Text
                                    style={styles.notificationBody}
                                    numberOfLines={2}
                                  >
                                    {n.body}
                                  </Text>
                                )}
                                <View style={styles.notificationMeta}>
                                  <Ionicons
                                    name="time-outline"
                                    size={11}
                                    color={COLORS.secondary}
                                  />
                                  <Text style={styles.notificationDetail}>
                                    {timeAgo(n.created_at)}
                                  </Text>
                                </View>
                              </View>

                              {isUnread && <View style={styles.unreadDot} />}

                              <TouchableOpacity
                                style={styles.dismissButton}
                                onPress={(e) => {
                                  e.stopPropagation?.();
                                  dismiss(n.id).catch(() => {});
                                }}
                                activeOpacity={0.7}
                                hitSlop={6}
                              >
                                <Ionicons
                                  name="close"
                                  size={16}
                                  color={COLORS.secondary}
                                />
                              </TouchableOpacity>
                            </Pressable>
                          );
                        })}
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
    // `top` is supplied at runtime via the popover's computed offset.
    right: 12,
    width: 350,
    maxWidth: "calc(100% - 24px)" as any,
    maxHeight: 460,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    // Subtle shadow so it reads as a floating panel above the screen.
    ...(Platform.OS === "android" ? { elevation: 12 } : {}),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
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
  markAllReadButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    marginRight: 6,
  },
  markAllReadText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: COLORS.primary,
  },
  closeNotificationButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationScrollContent: { paddingBottom: 4 },
  notificationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: COLORS.white,
  },
  notificationItemUnread: {
    backgroundColor: "#F8FAFC",
  },
  notificationItemPressed: {
    backgroundColor: "#EFF6FF",
  },
  notificationItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  notificationContent: { flex: 1, minWidth: 0 },
  notificationTitle: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
  },
  notificationBody: {
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  notificationMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  notificationDetail: { color: COLORS.secondary, fontSize: 11, marginLeft: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
    marginLeft: 6,
  },
  dismissButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    marginTop: 2,
  },
  loadingNotifications: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
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

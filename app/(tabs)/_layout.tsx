import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useState } from "react";
import {
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

import AccountSwitcher from "../../components/AccountSwitcher";
import { useAccounts } from "../../hooks/useAccounts";
import { useMaintenance } from "../../hooks/useMaintenance";
import { usePayments } from "../../hooks/usePayments";

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

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  const { selectedAccount } = useAccounts();
  const { getPendingPayments } = usePayments(selectedAccount?.id);
  const { tasks } = useMaintenance(selectedAccount?.id);

  const [showNotifications, setShowNotifications] = useState(false);

  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<
    string[]
  >([]);

  /*
   * =========================================================
   * NOTIFICATIONS
   * =========================================================
   */

  const pendingPayments = (getPendingPayments?.() || []).filter(
    (payment) => !dismissedNotificationIds.includes(`payment-${payment.id}`),
  );

  const pendingTasks = tasks.filter(
    (task) =>
      task.status === "pending" &&
      !dismissedNotificationIds.includes(`task-${task.id}`),
  );

  const notificationCount = pendingPayments.length + pendingTasks.length;

  const dismissNotification = (notificationId: string) => {
    setDismissedNotificationIds((currentIds) => [
      ...currentIds,
      notificationId,
    ]);
  };

  const bottomInset = insets.bottom;

  return (
    <Tabs
      screenOptions={{
        /*
         * =====================================================
         * HEADER
         * =====================================================
         */

        headerTitle: () => (
          <View style={styles.accountSwitcherContainer}>
            <AccountSwitcher />
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

        /*
         * =====================================================
         * NOTIFICATIONS
         * =====================================================
         */

        headerRight: () => (
          <View style={styles.notificationMenu}>
            <TouchableOpacity
              onPress={() => setShowNotifications((visible) => !visible)}
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
                  {/* Notification Header */}

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

                  {/* Empty State */}

                  {notificationCount === 0 ? (
                    <View style={styles.emptyNotifications}>
                      <View style={styles.emptyNotificationIcon}>
                        <Ionicons
                          name="checkmark-circle"
                          size={30}
                          color={COLORS.success}
                        />
                      </View>

                      <Text style={styles.emptyNotificationsTitle}>
                        You're all caught up
                      </Text>

                      <Text style={styles.emptyNotificationsText}>
                        There are no pending payments or maintenance tasks.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.notificationScrollContent}
                    >
                      {/* Payments */}

                      {pendingPayments.map((payment) => (
                        <View
                          key={`payment-${payment.id}`}
                          style={styles.notificationItem}
                        >
                          <View
                            style={[
                              styles.notificationItemIcon,
                              styles.paymentIcon,
                            ]}
                          >
                            <Ionicons
                              name="receipt-outline"
                              size={18}
                              color={COLORS.warning}
                            />
                          </View>

                          <View style={styles.notificationContent}>
                            <Text
                              style={styles.notificationTitle}
                              numberOfLines={1}
                            >
                              {payment.description ||
                                `${payment.category} payment`}
                            </Text>

                            <View style={styles.notificationMeta}>
                              <Ionicons
                                name="calendar-outline"
                                size={12}
                                color={COLORS.secondary}
                              />

                              <Text style={styles.notificationDetail}>
                                Due{" "}
                                {new Date(payment.dueDate).toLocaleDateString()}
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.dismissButton}
                            onPress={() =>
                              dismissNotification(`payment-${payment.id}`)
                            }
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="close"
                              size={17}
                              color={COLORS.secondary}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}

                      {/* Maintenance Tasks */}

                      {pendingTasks.map((task) => (
                        <View
                          key={`task-${task.id}`}
                          style={styles.notificationItem}
                        >
                          <View
                            style={[
                              styles.notificationItemIcon,
                              styles.taskIcon,
                            ]}
                          >
                            <Ionicons
                              name="construct-outline"
                              size={18}
                              color={COLORS.primary}
                            />
                          </View>

                          <View style={styles.notificationContent}>
                            <Text
                              style={styles.notificationTitle}
                              numberOfLines={1}
                            >
                              {task.title}
                            </Text>

                            <View style={styles.notificationMeta}>
                              <Ionicons
                                name="calendar-outline"
                                size={12}
                                color={COLORS.secondary}
                              />

                              <Text style={styles.notificationDetail}>
                                Scheduled{" "}
                                {new Date(task.date).toLocaleDateString()}
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.dismissButton}
                            onPress={() =>
                              dismissNotification(`task-${task.id}`)
                            }
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="close"
                              size={17}
                              color={COLORS.secondary}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        ),

        /*
         * =====================================================
         * TAB COLORS
         * =====================================================
         */

        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,

        /*
         * =====================================================
         * BOTTOM TAB BAR
         * =====================================================
         */

        tabBarStyle: {
          height: 64 + bottomInset,

          paddingTop: 5,
          paddingBottom: bottomInset + 5,

          paddingHorizontal: 8,

          backgroundColor: COLORS.white,

          borderTopWidth: 1,
          borderTopColor: COLORS.border,

          ...(Platform.OS === "android"
            ? {
                elevation: 0,
              }
            : {}),
        },

        /*
         * =====================================================
         * TAB LABEL
         * =====================================================
         */

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",

          marginTop: 1,
        },

        /*
         * =====================================================
         * TAB ITEM
         *
         * IMPORTANT:
         *
         * No large borderRadius.
         * No background color.
         * This prevents the large grey tab area.
         * =====================================================
         */

        tabBarItemStyle: {
          height: 44,

          marginHorizontal: 0,

          padding: 0,

          backgroundColor: "transparent",

          borderRadius: 0,
        },
      }}
    >
      {/* =====================================================
          HOME
          ===================================================== */}

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

      {/* =====================================================
          CALENDAR
          ===================================================== */}

      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",

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

      {/* =====================================================
          FINANCE
          ===================================================== */}

      <Tabs.Screen
        name="finance"
        options={{
          title: "Finance",

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

      {/* =====================================================
          MANAGEMENT
          ===================================================== */}

      <Tabs.Screen
        name="people"
        options={{
          title: "Management",

          tabBarIcon: ({ color, focused }) => (
            <View
              style={[
                styles.tabIconContainer,
                focused && styles.tabIconContainerActive,
              ]}
            >
              <Ionicons
                name={focused ? "briefcase" : "briefcase-outline"}
                color={color}
                size={22}
              />
            </View>
          ),
        }}
      />

      {/* =====================================================
          PROFILE
          ===================================================== */}

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
  );
}

const styles = StyleSheet.create({
  /*
   * =========================================================
   * HEADER
   * =========================================================
   */

  accountSwitcherContainer: {
    flex: 1,

    maxWidth: 280,
  },

  notificationMenu: {
    position: "relative",

    zIndex: 100,
  },

  notificationButton: {
    marginRight: 12,

    padding: 5,
  },

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

  notificationCount: {
    color: COLORS.white,

    fontSize: 9,
    fontWeight: "700",
  },

  /*
   * =========================================================
   * NOTIFICATION POPUP
   * =========================================================
   */

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

  notificationHeaderTextContainer: {
    flex: 1,
  },

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

  notificationScrollContent: {
    paddingBottom: 4,
  },

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

  paymentIcon: {
    backgroundColor: COLORS.warningLight,
  },

  taskIcon: {
    backgroundColor: COLORS.primaryLight,
  },

  notificationContent: {
    flex: 1,

    minWidth: 0,
  },

  notificationTitle: {
    color: COLORS.text,

    fontSize: 13,

    fontWeight: "600",
  },

  notificationMeta: {
    flexDirection: "row",

    alignItems: "center",

    marginTop: 5,
  },

  notificationDetail: {
    color: COLORS.secondary,

    fontSize: 11,

    marginLeft: 4,
  },

  dismissButton: {
    width: 30,
    height: 30,

    borderRadius: 15,

    alignItems: "center",
    justifyContent: "center",

    marginLeft: 6,
  },

  /*
   * =========================================================
   * EMPTY NOTIFICATIONS
   * =========================================================
   */

  emptyNotifications: {
    alignItems: "center",

    paddingHorizontal: 24,
    paddingVertical: 34,
  },

  emptyNotificationIcon: {
    width: 64,
    height: 64,

    borderRadius: 32,

    backgroundColor: COLORS.successLight,

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

  /*
   * =========================================================
   * TAB ICON
   * =========================================================
   */

  tabIconContainer: {
    width: 38,
    height: 28,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "transparent",
  },

  tabIconContainerActive: {
    backgroundColor: COLORS.primaryLight,
  },
}) as any;

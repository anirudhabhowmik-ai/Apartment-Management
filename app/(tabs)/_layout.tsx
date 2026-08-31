import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import AccountSwitcher from "../../components/AccountSwitcher";
import { useAccounts } from "../../hooks/useAccounts";
import { useMaintenance } from "../../hooks/useMaintenance";
import { usePayments } from "../../hooks/usePayments";

export default function TabsLayout() {
  const { selectedAccount } = useAccounts();
  const { getPendingPayments } = usePayments(selectedAccount?.id);
  const { tasks } = useMaintenance(selectedAccount?.id);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<
    string[]
  >([]);

  const pendingPayments = (getPendingPayments?.() || []).filter(
    (payment) => !dismissedNotificationIds.includes(`payment-${payment.id}`),
  );
  const pendingTasks = tasks.filter(
    (task) =>
      task.status === "pending" &&
      !dismissedNotificationIds.includes(`task-${task.id}`),
  );
  const notificationCount = pendingPayments.length + pendingTasks.length;

  const dismissNotification = (notificationId: string) =>
    setDismissedNotificationIds((currentIds) => [
      ...currentIds,
      notificationId,
    ]);

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <AccountSwitcher />,
        headerTitleAlign: "left",
        tabBarActiveTintColor: "#1a73e8",
        headerRight: () => (
          <View style={styles.notificationMenu}>
            <TouchableOpacity
              onPress={() => setShowNotifications((visible) => !visible)}
              style={styles.notificationButton}
              activeOpacity={0.7}
            >
              <View style={styles.notificationIconWrapper}>
                <Ionicons name="notifications-outline" size={24} color="#333" />
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
                  {notificationCount === 0 ? (
                    <View style={styles.emptyNotifications}>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={28}
                        color="#22a553"
                      />
                      <Text style={styles.emptyNotificationsText}>
                        You're all caught up
                      </Text>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false}>
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
                              color="#d97706"
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
                            <Text style={styles.notificationDetail}>
                              Due{" "}
                              {new Date(payment.dueDate).toLocaleDateString()}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.dismissButton}
                            onPress={() =>
                              dismissNotification(`payment-${payment.id}`)
                            }
                          >
                            <Ionicons name="close" size={18} color="#777" />
                          </TouchableOpacity>
                        </View>
                      ))}
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
                              color="#1a73e8"
                            />
                          </View>
                          <View style={styles.notificationContent}>
                            <Text
                              style={styles.notificationTitle}
                              numberOfLines={1}
                            >
                              {task.title}
                            </Text>
                            <Text style={styles.notificationDetail}>
                              Scheduled{" "}
                              {new Date(task.date).toLocaleDateString()}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.dismissButton}
                            onPress={() =>
                              dismissNotification(`task-${task.id}`)
                            }
                          >
                            <Ionicons name="close" size={18} color="#777" />
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
        headerStyle: {
          backgroundColor: "#fff",
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: "#f0f0f0",
        },
        tabBarStyle: {
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#f0f0f0",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: "Finance",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "wallet" : "wallet-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: "People",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  notificationButton: {
    marginRight: 16,
    padding: 4,
  },
  notificationMenu: {
    position: "relative",
    zIndex: 10,
  },
  notificationIconWrapper: {
    position: "relative",
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: -2,
    right: -6,
    backgroundColor: "#F44336",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  notificationCount: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  notificationBackdrop: {
    flex: 1,
  },
  notificationPopover: {
    backgroundColor: "#fff",
    borderColor: "#e5e7eb",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 8,
    maxHeight: 360,
    position: "absolute",
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    top: 52,
    width: 340,
    zIndex: 20,
  },
  notificationItem: {
    alignItems: "center",
    borderBottomColor: "#eef0f3",
    borderBottomWidth: 1,
    flexDirection: "row",
    padding: 12,
  },
  notificationItemIcon: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginRight: 10,
    width: 32,
  },
  paymentIcon: { backgroundColor: "#fff3df" },
  taskIcon: { backgroundColor: "#e8f0fe" },
  notificationContent: { flex: 1 },
  notificationTitle: {
    color: "#222",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  notificationDetail: { color: "#777", fontSize: 11, marginTop: 2 },
  dismissButton: { padding: 5 },
  emptyNotifications: { alignItems: "center", padding: 28 },
  emptyNotificationsText: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
});

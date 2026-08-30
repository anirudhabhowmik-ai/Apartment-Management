import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AccountSwitcher from "../../components/AccountSwitcher";
import { useAccounts } from "../../hooks/useAccounts";
import { useMaintenance } from "../../hooks/useMaintenance";
import { usePayments } from "../../hooks/usePayments";

export default function TabsLayout() {
  const router = useRouter();
  const { selectedAccount } = useAccounts();
  const { getPendingPayments } = usePayments(selectedAccount?.id);
  const { tasks } = useMaintenance(selectedAccount?.id);

  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (selectedAccount) {
      const pendingPayments = getPendingPayments?.() || [];
      const pendingTasks = tasks?.filter((t) => t.status === "pending") || [];
      setNotificationCount(pendingPayments.length + pendingTasks.length);
    }
  }, [selectedAccount, getPendingPayments, tasks]);

  const handleNotificationPress = () => {
    router.push("/(tabs)/profile");
  };

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <AccountSwitcher />,
        headerTitleAlign: "left",
        tabBarActiveTintColor: "#1a73e8",
        // ✅ Add headerRight with notification bell
        headerRight: () => (
          <TouchableOpacity
            onPress={handleNotificationPress}
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
});

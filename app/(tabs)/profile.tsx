import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { useAuthStore } from "../../store/useAuthStore";

interface MenuItem {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  showArrow?: boolean;
  badge?: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { accounts, selectedAccount } = useAccounts();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            // TODO: Implement delete account logic
            Alert.alert(
              "Account Deleted",
              "Your account has been deleted successfully.",
            );
          },
        },
      ],
    );
  };

  const handleAddAdmin = () => {
    router.push({
      pathname: "/(modals)/add-admin",
      params: { accountId: selectedAccount?.id || "" },
    });
  };

  const handleSwitchAccount = () => {
    router.push("/(modals)/switch-account");
  };

  const menuItems: MenuItem[] = [
    {
      id: "switch_account",
      title: "Switch Account",
      icon: "swap-horizontal-outline",
      color: "#1a73e8",
      onPress: handleSwitchAccount,
    },
    {
      id: "add_admin",
      title: "Add Admin",
      icon: "person-add-outline",
      color: "#4CAF50",
      onPress: handleAddAdmin,
    },
    {
      id: "notifications",
      title: "Notifications",
      icon: "notifications-outline",
      color: "#FF9800",
      onPress: () => setNotifications(!notifications),
      showArrow: false,
    },
    {
      id: "dark_mode",
      title: "Dark Mode",
      icon: "moon-outline",
      color: "#607D8B",
      onPress: () => setDarkMode(!darkMode),
      showArrow: false,
    },
    {
      id: "delete_account",
      title: "Delete Account",
      icon: "trash-outline",
      color: "#F44336",
      onPress: handleDeleteAccount,
    },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name ? getInitials(user.name) : "U"}
              </Text>
            </View>
            <TouchableOpacity style={styles.editAvatarButton}>
              <Ionicons name="camera-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{user?.name || "User"}</Text>
          <Text style={styles.userPhone}>
            {user?.phone || "+91 9876543210"}
          </Text>
          <View style={styles.accountBadge}>
            <Text style={styles.accountBadgeText}>
              {selectedAccount?.name || "No Account Selected"}
            </Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Account Settings</Text>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View
                  style={[
                    styles.menuIcon,
                    { backgroundColor: item.color + "15" },
                  ]}
                >
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={styles.menuItemTitle}>{item.title}</Text>
              </View>
              <View style={styles.menuItemRight}>
                {item.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
                {item.id === "notifications" && (
                  <Switch
                    value={notifications}
                    onValueChange={setNotifications}
                    trackColor={{ false: "#e0e0e0", true: "#1a73e8" }}
                    thumbColor={notifications ? "#fff" : "#fff"}
                  />
                )}
                {item.id === "dark_mode" && (
                  <Switch
                    value={darkMode}
                    onValueChange={setDarkMode}
                    trackColor={{ false: "#e0e0e0", true: "#1a73e8" }}
                    thumbColor={darkMode ? "#fff" : "#fff"}
                  />
                )}
                {item.showArrow !== false &&
                  item.id !== "notifications" &&
                  item.id !== "dark_mode" && (
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#F44336" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // Profile Header
  profileHeader: {
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 16,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
  },
  editAvatarButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#1a73e8",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  accountBadge: {
    backgroundColor: "#e8f0fe",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  accountBadgeText: {
    fontSize: 13,
    color: "#1a73e8",
    fontWeight: "500",
  },
  // Menu Section
  menuSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingVertical: 10,
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemTitle: {
    fontSize: 15,
    color: "#111",
    fontWeight: "500",
  },
  menuItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    backgroundColor: "#F44336",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  // Logout Button
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FFCDD2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F44336",
  },
  // Version
  versionText: {
    textAlign: "center",
    fontSize: 12,
    color: "#bbb",
    marginTop: 20,
  },
});

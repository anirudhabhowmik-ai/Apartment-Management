// app/(modals)/select-account.tsx

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccounts } from "../../hooks/useAccounts";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";

export default function SelectAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { accounts } = useAccounts();

  const selectAccount = useAccountStore((s) => s.selectAccount);
  const selectedAccountId = useAccountStore((s) => s.selectedAccountId);
  const setAccounts = useAccountStore((s) => s.setAccounts);

  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (accounts.length === 0) {
      router.replace("/(modals)/add-account");
    }
  }, [accounts.length, router]);

  const handleSelectAccount = (accountId: string) => {
    selectAccount(accountId);
    router.replace("/(tabs)");
  };

  const handleCreateNew = () => {
    router.push("/(modals)/add-account");
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logout();
      setAccounts([]);
      router.replace("/(auth)/login");
    } catch (e) {
      console.error("Logout failed:", e);
      setLoggingOut(false);
    }
  };

  if (accounts.length === 0) {
    return <View style={styles.container} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Header */}
        {/* ------------------------------------------------------------------ */}

        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={30} color="#1a73e8" />
          </View>

          <Text style={styles.welcomeTitle}>Welcome back!</Text>

          <Text style={styles.welcomeSubtitle}>
            {user?.phone ? `+91 ${user.phone.replace("+91", "")}` : ""}
          </Text>

          <Text style={styles.welcomeHint}>
            Choose an account to continue or create a new one
          </Text>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Accounts list */}
        {/* ------------------------------------------------------------------ */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Accounts</Text>

          {accounts.map((account) => {
            const isSelected = account.id === selectedAccountId;

            return (
              <TouchableOpacity
                key={account.id}
                style={[
                  styles.accountCard,
                  isSelected && styles.accountCardSelected,
                ]}
                onPress={() => handleSelectAccount(account.id)}
                activeOpacity={0.8}
              >
                {/* Account icon */}
                <View style={styles.accountIconWrap}>
                  {account.photoUri ? (
                    <Image
                      source={{ uri: account.photoUri }}
                      style={styles.accountImage}
                    />
                  ) : (
                    <Ionicons
                      name={account.type === "apartment" ? "business" : "home"}
                      size={22}
                      color="#1a73e8"
                    />
                  )}
                </View>

                {/* Account information */}
                <View style={styles.accountInfo}>
                  {/* Account name */}
                  <Text style={styles.accountName} numberOfLines={1}>
                    {account.name}
                  </Text>

                  {/* Account type */}
                  <Text style={styles.accountType}>
                    {account.type === "apartment"
                      ? "Apartment Society"
                      : "Personal Home"}
                  </Text>

                  {/* Owner */}
                  <View style={styles.ownerRow}>
                    <Ionicons
                      name="shield-checkmark"
                      size={14}
                      color="#16a34a"
                    />

                    <Text style={styles.ownerText}>Owner</Text>
                  </View>
                </View>

                {/* Chevron */}
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Create new account */}
        {/* ------------------------------------------------------------------ */}

        <TouchableOpacity
          style={styles.createNewButton}
          onPress={handleCreateNew}
          activeOpacity={0.85}
        >
          <View style={styles.createNewIcon}>
            <Ionicons name="add" size={22} color="#1a73e8" />
          </View>

          <View style={styles.createNewTextWrap}>
            <Text style={styles.createNewTitle}>Create New Account</Text>

            <Text style={styles.createNewSubtitle}>
              Set up a new apartment, home, or join via invitation
            </Text>
          </View>

          <Ionicons name="arrow-forward" size={18} color="#1a73e8" />
        </TouchableOpacity>

        {/* Footer note */}
        <Text style={styles.footerNote}>
          You can switch between accounts anytime from the account switcher
        </Text>

        {/* ------------------------------------------------------------------ */}
        {/* Logout */}
        {/* ------------------------------------------------------------------ */}

        <View style={styles.logoutSection}>
          <View style={styles.logoutDivider} />

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={loggingOut}
            activeOpacity={0.8}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color="#dc2626" />

                <Text style={styles.logoutButtonText}>Log out</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.logoutHint}>
            You can log in again anytime with your phone number.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // --------------------------------------------------------------------------
  // Container
  // --------------------------------------------------------------------------

  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  // --------------------------------------------------------------------------
  // Header
  // --------------------------------------------------------------------------

  header: {
    alignItems: "center",
    marginBottom: 28,
    marginTop: 12,
  },

  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e8f0fe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  welcomeTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },

  welcomeSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
    marginBottom: 6,
  },

  welcomeHint: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 18,
  },

  // --------------------------------------------------------------------------
  // Accounts
  // --------------------------------------------------------------------------

  section: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
  },

  accountCardSelected: {
    borderColor: "#1a73e8",
    backgroundColor: "#f0f7ff",
  },

  accountIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },

  accountImage: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },

  accountInfo: {
    flex: 1,
  },

  accountName: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },

  // Account type:
  // Apartment Society / Personal Home
  accountType: {
    fontSize: 12.5,
    color: "#64748b",
    fontWeight: "500",
    marginBottom: 6,
  },

  // --------------------------------------------------------------------------
  // Owner
  // --------------------------------------------------------------------------

  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  ownerText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#16a34a",
  },

  // --------------------------------------------------------------------------
  // Chevron
  // --------------------------------------------------------------------------

  chevronWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  // --------------------------------------------------------------------------
  // Create New Account
  // --------------------------------------------------------------------------

  createNewButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    marginBottom: 18,
  },

  createNewIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  createNewTextWrap: {
    flex: 1,
  },

  createNewTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a73e8",
    marginBottom: 2,
  },

  createNewSubtitle: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },

  // --------------------------------------------------------------------------
  // Footer
  // --------------------------------------------------------------------------

  footerNote: {
    fontSize: 11.5,
    color: "#94a3b8",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 16,
  },

  // --------------------------------------------------------------------------
  // Logout
  // --------------------------------------------------------------------------

  logoutSection: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 12,
  },

  logoutDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#e2e8f0",
    marginBottom: 16,
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#fecaca",
    minWidth: 140,
  },

  logoutButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#dc2626",
  },

  logoutHint: {
    fontSize: 11.5,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 7,
  },
});

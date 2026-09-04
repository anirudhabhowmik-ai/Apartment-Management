import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccounts } from "../../hooks/useAccounts";

const COLORS = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primaryLight: "#EFF6FF",
  primarySoft: "#DBEAFE",

  background: "#F8FAFC",
  white: "#FFFFFF",

  text: "#0F172A",
  secondary: "#64748B",
  muted: "#94A3B8",

  border: "#E2E8F0",
  borderLight: "#F1F5F9",

  success: "#16A34A",
  successLight: "#F0FDF4",

  danger: "#DC2626",
};

export default function SwitchAccountScreen() {
  const router = useRouter();

  const { accounts, selectedAccount, selectAccount } = useAccounts();

  const [loading, setLoading] = useState(false);

  const handleSelectAccount = async (accountId: string) => {
    if (loading) return;

    if (accountId === selectedAccount?.id) {
      router.back();
      return;
    }

    setLoading(true);

    try {
      selectAccount(accountId);

      setTimeout(() => {
        router.back();
      }, 300);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    router.push("/(modals)/add-account");
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.content}>
        {/* =========================================================
            HEADER
        ========================================================= */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons
                name="swap-horizontal"
                size={21}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Switch Account</Text>

              <Text style={styles.subtitle}>Select a property to manage</Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Ionicons name="close" size={21} color={COLORS.text} />
          </Pressable>
        </View>

        {/* =========================================================
            CURRENT ACCOUNT
        ========================================================= */}
        {selectedAccount && accounts.length > 0 && (
          <View style={styles.currentSection}>
            <Text style={styles.currentLabel}>CURRENT ACCOUNT</Text>

            <View style={styles.currentCard}>
              <View style={styles.currentIcon}>
                <Ionicons
                  name={
                    selectedAccount.type === "apartment" ? "business" : "home"
                  }
                  size={22}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.currentInfo}>
                <Text
                  style={styles.currentName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {selectedAccount.name}
                </Text>

                <View style={styles.currentTypeRow}>
                  <View style={styles.currentDot} />

                  <Text style={styles.currentType}>
                    {selectedAccount.type === "apartment"
                      ? "Apartment"
                      : "Home"}
                  </Text>
                </View>
              </View>

              <View style={styles.activeBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={COLORS.success}
                />

                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            </View>
          </View>
        )}

        {/* =========================================================
            CONTENT
        ========================================================= */}
        {accounts.length === 0 ? (
          /* =======================================================
             EMPTY STATE
          ======================================================= */
          <View style={styles.emptyState}>
            <View style={styles.emptyIllustration}>
              <View style={styles.emptyIllustrationCircle}>
                <Ionicons
                  name="business-outline"
                  size={42}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.emptyPlus}>
                <Ionicons name="add" size={16} color={COLORS.white} />
              </View>
            </View>

            <Text style={styles.emptyTitle}>No properties yet</Text>

            <Text style={styles.emptySubtitle}>
              Add your apartment or home to start managing members, payments,
              expenses and other property details.
            </Text>

            <Pressable
              onPress={handleAddNew}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <View style={styles.primaryButtonIcon}>
                <Ionicons name="add" size={20} color={COLORS.white} />
              </View>

              <Text style={styles.primaryButtonText}>
                Create Your First Property
              </Text>
            </Pressable>
          </View>
        ) : (
          /* =======================================================
             ACCOUNT LIST
          ======================================================= */
          <View style={styles.listWrapper}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Your properties</Text>

                <Text style={styles.sectionSubtitle}>
                  {accounts.length === 1
                    ? "1 property available"
                    : `${accounts.length} properties available`}
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countText}>{accounts.length}</Text>
              </View>
            </View>

            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedAccount?.id;

                return (
                  <Pressable
                    onPress={() => handleSelectAccount(item.id)}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.accountCard,
                      isSelected && styles.accountCardSelected,
                      pressed && styles.accountCardPressed,
                    ]}
                  >
                    {/* Account Icon */}
                    <View
                      style={[
                        styles.accountIcon,
                        isSelected && styles.accountIconSelected,
                      ]}
                    >
                      <Ionicons
                        name={item.type === "apartment" ? "business" : "home"}
                        size={22}
                        color={isSelected ? COLORS.primary : COLORS.secondary}
                      />
                    </View>

                    {/* Account Info */}
                    <View style={styles.accountInfo}>
                      <Text
                        style={[
                          styles.accountName,
                          isSelected && styles.accountNameSelected,
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.name}
                      </Text>

                      <View style={styles.accountTypeRow}>
                        <View
                          style={[
                            styles.typeDot,
                            isSelected && styles.typeDotSelected,
                          ]}
                        />

                        <Text style={styles.accountType}>
                          {item.type === "apartment" ? "Apartment" : "Home"}
                        </Text>
                      </View>
                    </View>

                    {/* Selected State */}
                    {isSelected ? (
                      <View style={styles.selectedIndicator}>
                        <Ionicons
                          name="checkmark"
                          size={17}
                          color={COLORS.white}
                        />
                      </View>
                    ) : (
                      <View style={styles.unselectedIndicator}>
                        <Ionicons
                          name="chevron-forward"
                          size={17}
                          color={COLORS.muted}
                        />
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />

            {/* =====================================================
                ADD NEW PROPERTY
            ===================================================== */}
            <Pressable
              onPress={handleAddNew}
              disabled={loading}
              style={({ pressed }) => [
                styles.addPropertyButton,
                pressed && styles.addPropertyButtonPressed,
              ]}
            >
              <View style={styles.addPropertyIcon}>
                <Ionicons name="add" size={22} color={COLORS.primary} />
              </View>

              <View style={styles.addPropertyInfo}>
                <Text style={styles.addPropertyTitle}>Add New Property</Text>

                <Text style={styles.addPropertySubtitle}>
                  Create or join another apartment
                </Text>
              </View>

              <View style={styles.addPropertyArrow}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.primary}
                />
              </View>
            </Pressable>
          </View>
        )}
      </View>

      {/* =========================================================
          LOADING OVERLAY
      ========================================================= */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingIcon}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>

            <View>
              <Text style={styles.loadingTitle}>Switching account</Text>

              <Text style={styles.loadingSubtitle}>
                Please wait a moment...
              </Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ===============================================================
  // CONTAINER
  // ===============================================================

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    flex: 1,
  },

  // ===============================================================
  // HEADER
  // ===============================================================

  header: {
    flexDirection: "row",

    // Keeps the whole header content vertically centered
    alignItems: "center",

    justifyContent: "space-between",

    // Fixed minimum height gives equal visual space
    // above and below the apartment/header area
    minHeight: 82,

    paddingHorizontal: 20,
    paddingVertical: 12,

    backgroundColor: COLORS.white,

    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },

  headerLeft: {
    flexDirection: "row",

    // Centers icon + text vertically
    alignItems: "center",

    flex: 1,
    minWidth: 0,
  },

  headerIcon: {
    width: 44,
    height: 44,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primaryLight,

    marginRight: 12,
  },

  headerTextContainer: {
    flex: 1,
    minWidth: 0,

    // Keeps title/subtitle block centered
    // inside the header height
    justifyContent: "center",
  },

  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.4,
  },

  subtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.secondary,
  },

  closeButton: {
    width: 40,
    height: 40,

    borderRadius: 13,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.background,

    marginLeft: 12,
  },

  closeButtonPressed: {
    opacity: 0.65,
    backgroundColor: COLORS.borderLight,
  },

  // ===============================================================
  // CURRENT ACCOUNT
  // ===============================================================

  currentSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },

  currentLabel: {
    marginBottom: 9,

    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1,

    color: COLORS.muted,
  },

  currentCard: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 76,

    paddingHorizontal: 13,
    paddingVertical: 12,

    borderRadius: 17,

    borderWidth: 1,
    borderColor: COLORS.primarySoft,

    backgroundColor: COLORS.primaryLight,
  },

  currentIcon: {
    width: 48,
    height: 48,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.white,

    marginRight: 12,
  },

  currentInfo: {
    flex: 1,
    minWidth: 0,
  },

  currentName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: COLORS.text,
  },

  currentTypeRow: {
    flexDirection: "row",
    alignItems: "center",

    marginTop: 5,
  },

  currentDot: {
    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor: COLORS.primary,

    marginRight: 6,
  },

  currentType: {
    fontSize: 12,
    color: COLORS.secondary,
  },

  activeBadge: {
    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 9,
    paddingVertical: 6,

    borderRadius: 9,

    backgroundColor: COLORS.successLight,

    marginLeft: 8,
  },

  activeBadgeText: {
    marginLeft: 4,

    fontSize: 10,
    fontWeight: "700",

    color: COLORS.success,
  },

  // ===============================================================
  // LIST
  // ===============================================================

  listWrapper: {
    flex: 1,

    paddingHorizontal: 20,
    paddingTop: 22,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: COLORS.text,
  },

  sectionSubtitle: {
    marginTop: 2,

    fontSize: 12,
    lineHeight: 17,

    color: COLORS.secondary,
  },

  countBadge: {
    minWidth: 30,
    height: 30,

    paddingHorizontal: 8,

    borderRadius: 15,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primaryLight,

    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },

  countText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  listContent: {
    paddingBottom: 8,
  },

  // ===============================================================
  // ACCOUNT CARD
  // ===============================================================

  accountCard: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 78,

    paddingHorizontal: 13,
    paddingVertical: 13,

    marginBottom: 10,

    borderRadius: 17,

    borderWidth: 1,
    borderColor: COLORS.border,

    backgroundColor: COLORS.white,
  },

  accountCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },

  accountCardPressed: {
    opacity: 0.72,
  },

  accountIcon: {
    width: 48,
    height: 48,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.background,

    marginRight: 13,
  },

  accountIconSelected: {
    backgroundColor: COLORS.white,
  },

  accountInfo: {
    flex: 1,
    minWidth: 0,
  },

  accountName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",

    color: COLORS.text,

    marginBottom: 5,
  },

  accountNameSelected: {
    color: COLORS.primaryDark,
  },

  accountTypeRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  typeDot: {
    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor: COLORS.muted,

    marginRight: 6,
  },

  typeDotSelected: {
    backgroundColor: COLORS.primary,
  },

  accountType: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.secondary,
  },

  // ===============================================================
  // SELECTION
  // ===============================================================

  selectedIndicator: {
    width: 30,
    height: 30,

    borderRadius: 15,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primary,

    marginLeft: 10,
  },

  unselectedIndicator: {
    width: 30,
    height: 30,

    borderRadius: 15,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.background,

    marginLeft: 10,
  },

  // ===============================================================
  // ADD PROPERTY
  // ===============================================================

  addPropertyButton: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 74,

    paddingHorizontal: 13,

    marginTop: 5,
    marginBottom: 14,

    borderRadius: 17,

    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#93C5FD",

    backgroundColor: COLORS.white,
  },

  addPropertyButtonPressed: {
    opacity: 0.7,
    backgroundColor: COLORS.primaryLight,
  },

  addPropertyIcon: {
    width: 44,
    height: 44,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primaryLight,

    marginRight: 12,
  },

  addPropertyInfo: {
    flex: 1,
    minWidth: 0,
  },

  addPropertyTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: COLORS.text,
  },

  addPropertySubtitle: {
    marginTop: 3,

    fontSize: 12,
    lineHeight: 17,

    color: COLORS.secondary,
  },

  addPropertyArrow: {
    width: 32,
    height: 32,

    borderRadius: 10,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primaryLight,

    marginLeft: 8,
  },

  // ===============================================================
  // EMPTY STATE
  // ===============================================================

  emptyState: {
    flex: 1,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 28,
    paddingBottom: 40,
  },

  emptyIllustration: {
    position: "relative",

    marginBottom: 22,
  },

  emptyIllustrationCircle: {
    width: 94,
    height: 94,

    borderRadius: 31,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primaryLight,

    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },

  emptyPlus: {
    position: "absolute",

    right: -4,
    bottom: -3,

    width: 31,
    height: 31,

    borderRadius: 16,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primary,

    borderWidth: 3,
    borderColor: COLORS.background,
  },

  emptyTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",

    color: COLORS.text,

    marginBottom: 9,
  },

  emptySubtitle: {
    maxWidth: 330,

    fontSize: 14,
    lineHeight: 21,

    color: COLORS.secondary,

    textAlign: "center",

    marginBottom: 27,
  },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    minHeight: 53,

    paddingHorizontal: 18,

    borderRadius: 15,

    backgroundColor: COLORS.primary,
  },

  primaryButtonPressed: {
    opacity: 0.8,
  },

  primaryButtonIcon: {
    width: 27,
    height: 27,

    borderRadius: 8,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 8,

    backgroundColor: "rgba(255,255,255,0.15)",
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
  },

  // ===============================================================
  // LOADING
  // ===============================================================

  loadingOverlay: {
    ...StyleSheet.absoluteFill,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "rgba(248, 250, 252, 0.68)",
  },

  loadingCard: {
    flexDirection: "row",
    alignItems: "center",

    minWidth: 220,

    paddingHorizontal: 16,
    paddingVertical: 14,

    borderRadius: 16,

    backgroundColor: COLORS.white,

    borderWidth: 1,
    borderColor: COLORS.border,
  },

  loadingIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primaryLight,

    marginRight: 11,
  },

  loadingTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",

    color: COLORS.text,
  },

  loadingSubtitle: {
    marginTop: 2,

    fontSize: 11,
    lineHeight: 16,

    color: COLORS.secondary,
  },
});

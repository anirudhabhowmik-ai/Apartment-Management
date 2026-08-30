import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";

export default function SwitchAccountScreen() {
  const router = useRouter();
  const { accounts, selectedAccount, selectAccount } = useAccounts();
  const [loading, setLoading] = useState(false);

  const handleSelectAccount = async (accountId: string) => {
    setLoading(true);
    try {
      selectAccount(accountId);
      // Give a brief moment for the state to update, then dismiss modal
      setTimeout(() => {
        router.back();
      }, 300);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    // Push to add-account modal while keeping this modal in the stack
    // When user creates account from here, they should return to this modal, not home
    router.push("/(modals)/add-account");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Your Accounts</Text>
        <View style={styles.backButton} />
      </View>

      {accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No accounts yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first apartment or home account
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedAccount?.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.accountItem,
                    isSelected && styles.accountItemSelected,
                  ]}
                  onPress={() => handleSelectAccount(item.id)}
                  disabled={loading}
                >
                  <View style={styles.accountIcon}>
                    <Ionicons
                      name={item.type === "apartment" ? "business" : "home"}
                      size={24}
                      color="#1a73e8"
                    />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{item.name}</Text>
                    <Text style={styles.accountType}>
                      {item.type === "apartment" ? "Apartment" : "Home"}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color="#1a73e8"
                    />
                  )}
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add New Account</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e7ebf3",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  accountItemSelected: {
    borderColor: "#1a73e8",
    backgroundColor: "#f0f6ff",
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f0f6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  accountType: {
    fontSize: 13,
    color: "#888",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    height: 52,
    marginTop: 16,
    marginBottom: 12,
    gap: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

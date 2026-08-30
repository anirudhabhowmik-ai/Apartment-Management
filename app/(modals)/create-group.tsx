import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { GroupType } from "../../types/group";

interface ExpenseType {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const GROUP_TYPES: {
  type: GroupType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
}[] = [
  {
    type: "apartment",
    label: "Apartment Group",
    icon: "business-outline",
    color: "#2196F3",
    description: "Apartment owners • Maintenance • Electricity • Water",
  },
  {
    type: "staff",
    label: "Staff Group",
    icon: "people-outline",
    color: "#4CAF50",
    description: "Staff • Salary • Attendance • Bonuses",
  },
  {
    type: "expense",
    label: "Expense Group",
    icon: "cash-outline",
    color: "#FF9800",
    description: "Electricity • Water • Maintenance • Other bills",
  },
];

const EXPENSE_TYPES: Record<GroupType, ExpenseType[]> = {
  apartment: [
    {
      id: "maintenance",
      label: "Maintenance",
      icon: "construct-outline",
      color: "#FF9800",
    },
    {
      id: "electricity",
      label: "Electricity",
      icon: "flash-outline",
      color: "#F44336",
    },
    { id: "water", label: "Water", icon: "water-outline", color: "#00BCD4" },
    { id: "other", label: "Other", icon: "receipt-outline", color: "#9E9E9E" },
  ],
  staff: [
    { id: "salary", label: "Salary", icon: "cash-outline", color: "#4CAF50" },
    { id: "bonus", label: "Bonus", icon: "gift-outline", color: "#FF9800" },
    { id: "advance", label: "Advance", icon: "card-outline", color: "#2196F3" },
  ],
  expense: [
    {
      id: "electricity",
      label: "Electricity",
      icon: "flash-outline",
      color: "#F44336",
    },
    { id: "water", label: "Water", icon: "water-outline", color: "#00BCD4" },
    {
      id: "maintenance",
      label: "Maintenance",
      icon: "construct-outline",
      color: "#FF9800",
    },
    { id: "other", label: "Other", icon: "receipt-outline", color: "#9E9E9E" },
  ],
};

export default function CreateGroupScreen() {
  const router = useRouter();
  const { accountId, defaultType } = useLocalSearchParams<{
    accountId: string;
    defaultType?: GroupType;
  }>();
  const { createGroup } = useGroups(accountId);
  const { selectedAccount } = useAccounts();

  const [selectedType, setSelectedType] = useState<GroupType | null>(
    defaultType || null,
  );
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setError("");

    if (!selectedType) {
      setError("Please select a group type");
      return;
    }

    if (!groupName.trim()) {
      setError("Please enter a group name");
      return;
    }

    const finalAccountId = accountId || selectedAccount?.id;
    if (!finalAccountId) {
      setError("No account selected");
      return;
    }

    setLoading(true);
    try {
      const newGroup = await createGroup({
        accountId: finalAccountId,
        type: selectedType,
        name: groupName.trim(),
        expenseTypes: EXPENSE_TYPES[selectedType].map((e) => e.id),
      });

      router.push({
        pathname: "/(modals)/add-member",
        params: {
          groupId: newGroup.id,
          groupType: selectedType,
        },
      });
    } catch (error: any) {
      setError(error.message || "Failed to create group");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Create Group</Text>
        <Text style={styles.subtitle}>
          Organize members and track expenses by group type
        </Text>

        <Text style={styles.sectionLabel}>Group Type</Text>
        <View style={styles.typeGrid}>
          {GROUP_TYPES.map((type) => (
            <TouchableOpacity
              key={type.type}
              style={[
                styles.typeCard,
                selectedType === type.type && styles.typeCardSelected,
                {
                  borderColor:
                    selectedType === type.type ? type.color : "#e0e0e0",
                },
              ]}
              onPress={() => {
                setSelectedType(type.type);
                setError("");
              }}
            >
              <View
                style={[
                  styles.typeIcon,
                  { backgroundColor: type.color + "20" },
                ]}
              >
                <Ionicons name={type.icon} size={28} color={type.color} />
              </View>
              <Text style={styles.typeLabel}>{type.label}</Text>
              <Text style={styles.typeDescription}>{type.description}</Text>

              <View style={styles.expenseTags}>
                {EXPENSE_TYPES[type.type].map((expense) => (
                  <View
                    key={expense.id}
                    style={[
                      styles.expenseTag,
                      { backgroundColor: expense.color + "15" },
                    ]}
                  >
                    <Ionicons
                      name={expense.icon}
                      size={12}
                      color={expense.color}
                    />
                    <Text
                      style={[styles.expenseTagText, { color: expense.color }]}
                    >
                      {expense.label}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Group Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Tower A - Apartment Owners"
          value={groupName}
          onChangeText={setGroupName}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creating..." : "Create Group"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 12,
    marginTop: 16,
  },
  typeGrid: {
    gap: 12,
  },
  typeCard: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#fafafa",
    borderColor: "#e0e0e0",
  },
  typeCardSelected: {
    backgroundColor: "#f5f8ff",
    borderWidth: 2,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 13,
    color: "#666",
    marginBottom: 10,
  },
  expenseTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  expenseTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  expenseTagText: {
    fontSize: 11,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  error: {
    color: "#e53935",
    marginTop: 16,
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  buttonDisabled: {
    backgroundColor: "#a0c4f0",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

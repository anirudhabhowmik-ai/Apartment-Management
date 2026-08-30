import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useMembers } from "../../hooks/useMembers";
import { GroupType, MemberRole } from "../../types";

interface RoleOption {
  role: MemberRole;
  label: string;
}

const FLAT_ROLES: RoleOption[] = [
  { role: "owner", label: "Owner" },
  { role: "secretary", label: "Secretary" },
  { role: "tenant", label: "Tenant" },
];

const SERVANT_ROLES: RoleOption[] = [
  { role: "sweeper", label: "Sweeper" },
  { role: "security", label: "Security" },
  { role: "maintenance", label: "Maintenance" },
];

const EXPENSE_ROLES: RoleOption[] = [
  { role: "electricity", label: "Electricity" },
  { role: "water", label: "Water" },
  { role: "maintenance", label: "Maintenance" },
  { role: "other", label: "Other" },
];

export default function EditMemberScreen() {
  const router = useRouter();
  const { memberId, groupId, groupType } = useLocalSearchParams<{
    memberId: string;
    groupId: string;
    groupType: GroupType;
  }>();

  const { getMemberById, editMember, deleteMember } = useMembers(
    groupId ?? null,
  );
  const member = getMemberById(memberId);

  const roleOptions =
    groupType === "apartment"
      ? FLAT_ROLES
      : groupType === "staff"
        ? SERVANT_ROLES
        : EXPENSE_ROLES;

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole | null>(null);
  const [wing, setWing] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [areaSqft, setAreaSqft] = useState<string>("");
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [maintenanceAmount, setMaintenanceAmount] = useState("");
  const [maintenancePaid, setMaintenancePaid] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load member data
  useEffect(() => {
    if (member) {
      setName(member.name);
      setPhone(member.phone.replace("+91", ""));
      setRole(member.role);

      if (groupType === "apartment" && "flatNumber" in member) {
        setWing(member.wing || "");
        setFlatNumber(member.flatNumber || "");
        setAreaSqft(member.areaSqft?.toString() || "");
        setParkingAvailable(member.parkingAvailable || false);
        setMaintenanceAmount(member.maintenanceAmount?.toString() || "");
        setMaintenancePaid(member.maintenancePaid ?? false);
      }

      if (groupType === "staff" && "monthlySalary" in member) {
        setMonthlySalary(member.monthlySalary?.toString() || "");
      }

      if (groupType === "expense" && "amount" in member) {
        setExpenseAmount(member.amount?.toString() || "");
        setDueDate(member.dueDate || "");
        setExpenseDescription(member.description || "");
      }
    }
  }, [member]);

  const handleUpdate = async () => {
    setError("");

    // Validation
    if (!name.trim()) {
      setError("Please enter name");
      return;
    }

    if (phone.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    if (!role) {
      setError("Please select a role");
      return;
    }

    if (groupType === "apartment") {
      if (!flatNumber.trim()) {
        setError("Please enter flat number");
        return;
      }
      if (!maintenanceAmount.trim() || isNaN(Number(maintenanceAmount))) {
        setError("Please enter a valid maintenance amount");
        return;
      }
    }

    if (groupType === "staff") {
      if (!monthlySalary.trim() || isNaN(Number(monthlySalary))) {
        setError("Please enter a valid monthly salary");
        return;
      }
    }

    if (groupType === "expense") {
      if (!expenseAmount.trim() || isNaN(Number(expenseAmount))) {
        setError("Please enter a valid expense amount");
        return;
      }
    }

    setLoading(true);
    try {
      const updateData: any = {
        name: name.trim(),
        phone: `+91${phone}`,
        role,
      };

      if (groupType === "apartment") {
        if (wing && wing.trim()) {
          updateData.wing = wing.trim();
        }
        updateData.flatNumber = flatNumber.trim();
        if (areaSqft && !isNaN(Number(areaSqft))) {
          updateData.areaSqft = Number(areaSqft);
        }
        updateData.parkingAvailable = parkingAvailable;
        updateData.maintenanceAmount = Number(maintenanceAmount);
        updateData.maintenancePaid = maintenancePaid;
      }

      if (groupType === "staff") {
        updateData.monthlySalary = Number(monthlySalary);
      }

      if (groupType === "expense") {
        updateData.amount = Number(expenseAmount);
        updateData.dueDate = dueDate || undefined;
        updateData.description = expenseDescription.trim() || undefined;
      }

      await editMember(memberId, updateData);
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to update member");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Member",
      `Are you sure you want to delete ${name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteMember(memberId);
              router.back();
            } catch (e: any) {
              setError(e.message || "Failed to delete member");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  if (!member) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="person-outline" size={48} color="#ccc" />
          <Text style={styles.errorText}>Member not found</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit Member</Text>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={24} color="#e53935" />
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>Full Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ramesh Kumar"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>Phone Number *</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.prefix}>+91</Text>
          <TextInput
            style={styles.phoneInput}
            placeholder="9876543210"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
          />
        </View>

        <Text style={styles.inputLabel}>Role *</Text>
        <View style={styles.roleRow}>
          {roleOptions.map((option) => (
            <TouchableOpacity
              key={option.role}
              style={[
                styles.roleChip,
                role === option.role && styles.roleChipSelected,
              ]}
              onPress={() => setRole(option.role)}
            >
              <Text
                style={[
                  styles.roleChipText,
                  role === option.role && styles.roleChipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {groupType === "apartment" && (
          <>
            <Text style={styles.sectionLabel}>Flat Details</Text>

            <Text style={styles.inputLabel}>Wing / Section — optional</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. A Wing, B Wing, Tower 1"
              value={wing}
              onChangeText={setWing}
            />

            <Text style={styles.inputLabel}>Flat Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. A-204"
              value={flatNumber}
              onChangeText={setFlatNumber}
            />

            <Text style={styles.inputLabel}>Area (sq. ft.) — optional</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1200"
              keyboardType="numeric"
              value={areaSqft}
              onChangeText={setAreaSqft}
            />

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>Parking Available</Text>
              <Switch
                value={parkingAvailable}
                onValueChange={setParkingAvailable}
                trackColor={{ false: "#767577", true: "#1a73e8" }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>Maintenance Paid</Text>
              <Switch
                value={maintenancePaid}
                onValueChange={setMaintenancePaid}
                trackColor={{ false: "#767577", true: "#1a73e8" }}
              />
            </View>

            <Text style={styles.inputLabel}>Monthly Maintenance (₹) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2500"
              keyboardType="numeric"
              value={maintenanceAmount}
              onChangeText={setMaintenanceAmount}
            />
          </>
        )}

        {groupType === "staff" && (
          <>
            <Text style={styles.sectionLabel}>Employment Details</Text>

            <Text style={styles.inputLabel}>Monthly Salary (₹) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 5000"
              keyboardType="numeric"
              value={monthlySalary}
              onChangeText={setMonthlySalary}
            />
          </>
        )}

        {groupType === "expense" && (
          <>
            <Text style={styles.sectionLabel}>Expense Details</Text>

            <Text style={styles.inputLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 4200"
              keyboardType="numeric"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />

            <Text style={styles.inputLabel}>Due Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={dueDate}
              onChangeText={setDueDate}
            />

            <Text style={styles.inputLabel}>Note</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Water bill for this month"
              value={expenseDescription}
              onChangeText={setExpenseDescription}
              multiline
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleUpdate}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Updating..." : "Update Member"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  scrollContent: { padding: 24, paddingBottom: 60 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "700" },
  deleteButton: {
    padding: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a73e8",
    marginTop: 24,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 8,
    marginTop: 16,
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
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  prefix: { fontSize: 15, marginRight: 8, color: "#333" },
  phoneInput: { flex: 1, height: 50, fontSize: 15 },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  roleChip: {
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  roleChipSelected: {
    borderColor: "#1a73e8",
    backgroundColor: "#f0f6ff",
  },
  roleChipText: {
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },
  roleChipTextSelected: {
    color: "#1a73e8",
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 8,
  },
  error: {
    color: "#e53935",
    marginTop: 16,
    fontSize: 13,
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#e53935",
    marginBottom: 16,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
    width: "100%",
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

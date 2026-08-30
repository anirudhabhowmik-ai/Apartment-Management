import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
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
import { GroupType } from "../../types/group";
import { MemberRole } from "../../types/member";

interface RoleOption {
  role: MemberRole;
  label: string;
}

const APARTMENT_ROLES: RoleOption[] = [
  { role: "owner", label: "Owner" },
  { role: "secretary", label: "Secretary" },
  { role: "tenant", label: "Tenant" },
];

const STAFF_ROLES: RoleOption[] = [
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

export default function AddMemberScreen() {
  const router = useRouter();
  const { groupId, groupType } = useLocalSearchParams<{
    groupId: string;
    groupType: GroupType;
  }>();

  const { addNewMember } = useMembers(groupId ?? null);

  const roleOptions =
    groupType === "apartment"
      ? APARTMENT_ROLES
      : groupType === "staff"
        ? STAFF_ROLES
        : EXPENSE_ROLES;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole | null>(null);

  // Apartment-specific
  const [wing, setWing] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [areaSqft, setAreaSqft] = useState<string>("");
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [maintenanceAmount, setMaintenanceAmount] = useState("");

  // Staff-specific
  const [monthlySalary, setMonthlySalary] = useState("");

  // Expense-specific
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Permission to access photos is required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleAdd = async () => {
    setError("");

    if (!name.trim() || phone.length !== 10 || !role) {
      setError("Please fill in name, valid phone and role");
      return;
    }

    if (
      groupType === "apartment" &&
      (!flatNumber.trim() || !maintenanceAmount.trim())
    ) {
      setError("Please enter apartment number and maintenance amount");
      return;
    }

    if (groupType === "staff" && !monthlySalary.trim()) {
      setError("Please enter monthly salary");
      return;
    }

    if (groupType === "expense" && !expenseAmount.trim()) {
      setError("Please enter an expense amount");
      return;
    }

    if (!groupId || !groupType) {
      setError("Missing group information. Please try again.");
      return;
    }

    setLoading(true);
    try {
      await addNewMember({
        groupId,
        groupType,
        name: name.trim(),
        phone: `+91${phone}`,
        role,
        // NOTE: photoUri is captured here but useMembers.ts's AddMemberInput
        // needs a matching field added to actually persist it — let me know
        // if you want that hook updated next.
        photoUri: photoUri ?? undefined,
        wing:
          groupType === "apartment" && wing.trim() ? wing.trim() : undefined,
        flatNumber: groupType === "apartment" ? flatNumber.trim() : undefined,
        areaSqft:
          groupType === "apartment" && areaSqft ? Number(areaSqft) : undefined,
        parkingAvailable:
          groupType === "apartment" ? parkingAvailable : undefined,
        maintenanceAmount:
          groupType === "apartment" ? Number(maintenanceAmount) : undefined,
        monthlySalary:
          groupType === "staff" ? Number(monthlySalary) : undefined,
        amount: groupType === "expense" ? Number(expenseAmount) : undefined,
        dueDate: groupType === "expense" ? dueDate : undefined,
        description:
          groupType === "expense"
            ? expenseDescription.trim() || undefined
            : undefined,
      } as any);
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to add member. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getGroupTypeLabel = (type: GroupType): string => {
    switch (type) {
      case "apartment":
        return "Apartment";
      case "staff":
        return "Staff";
      case "expense":
        return "Expense";
      default:
        return "Member";
    }
  };

  const getButtonText = (type: GroupType): string => {
    switch (type) {
      case "apartment":
        return "Add Apartment Owner";
      case "staff":
        return "Add Staff";
      case "expense":
        return "Add Expense";
      default:
        return "Add Member";
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          Add {getGroupTypeLabel(groupType)} Member
        </Text>
        <Text style={styles.subtitle}>
          {groupType === "apartment"
            ? "Add a new apartment owner"
            : groupType === "staff"
              ? "Add a new staff member"
              : "Add an expense category entry"}
        </Text>

        {groupType !== "expense" && (
          <View style={styles.photoSection}>
            <TouchableOpacity
              style={styles.photoCircle}
              onPress={handlePickPhoto}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoImage} />
              ) : (
                <Ionicons name="camera-outline" size={24} color="#888" />
              )}
            </TouchableOpacity>
            <Text style={styles.photoLabel}>
              {photoUri ? "Change Photo" : "Add Photo (optional)"}
            </Text>
          </View>
        )}

        <Text style={styles.inputLabel}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ramesh Kumar"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>Phone Number</Text>
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

        <Text style={styles.inputLabel}>Role</Text>
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
            <Text style={styles.sectionLabel}>Apartment Details</Text>

            <Text style={styles.inputLabel}>Wing / Section — optional</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. A Wing, B Wing, Tower 1"
              value={wing}
              onChangeText={setWing}
            />

            <Text style={styles.inputLabel}>Apartment Number</Text>
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
              />
            </View>

            <Text style={styles.inputLabel}>Monthly Maintenance (₹)</Text>
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
            <Text style={styles.sectionLabel}>Staff Details</Text>

            <Text style={styles.inputLabel}>Monthly Salary (₹)</Text>
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

            <Text style={styles.inputLabel}>Amount (₹)</Text>
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
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
            />

            <Text style={styles.inputLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Electricity bill for April"
              value={expenseDescription}
              onChangeText={setExpenseDescription}
              multiline
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={styles.button}
          onPress={handleAdd}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Adding..." : getButtonText(groupType)}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, marginTop: 12 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  photoSection: {
    alignItems: "center",
    marginBottom: 8,
  },
  photoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f0f0f0",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  photoLabel: {
    fontSize: 12,
    color: "#1a73e8",
    fontWeight: "600",
    marginTop: 8,
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
  },
  textArea: {
    height: 90,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  prefix: { fontSize: 15, marginRight: 8, color: "#333" },
  phoneInput: { flex: 1, height: 50, fontSize: 15 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roleChip: {
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  roleChipSelected: { borderColor: "#1a73e8", backgroundColor: "#f0f6ff" },
  roleChipText: { fontSize: 13, color: "#555", fontWeight: "500" },
  roleChipTextSelected: { color: "#1a73e8", fontWeight: "700" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  error: { color: "#e53935", marginTop: 16, fontSize: 13 },
  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

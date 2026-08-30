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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Name is required";
    }

    if (!phone || phone.length === 0) {
      errors.phone = "Phone number is missing";
    } else if (phone.length !== 10) {
      errors.phone = "Phone number must be 10 digits";
    }

    if (!role) {
      errors.role = "Please select a role";
    }

    if (groupType === "apartment") {
      if (!flatNumber.trim()) {
        errors.flatNumber = "Apartment number is required";
      }
      if (!maintenanceAmount.trim()) {
        errors.maintenanceAmount = "Maintenance amount is required";
      } else if (isNaN(Number(maintenanceAmount))) {
        errors.maintenanceAmount = "Maintenance amount must be a number";
      }
    }

    if (groupType === "staff") {
      if (!monthlySalary.trim()) {
        errors.monthlySalary = "Monthly salary is required";
      } else if (isNaN(Number(monthlySalary))) {
        errors.monthlySalary = "Monthly salary must be a number";
      }
    }

    if (groupType === "expense") {
      if (!expenseAmount.trim()) {
        errors.expenseAmount = "Expense amount is required";
      } else if (isNaN(Number(expenseAmount))) {
        errors.expenseAmount = "Expense amount must be a number";
      }
    }

    if (!groupId || !groupType) {
      errors.group = "Missing group information. Please try again.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix all the errors");
      return;
    }
    setFieldErrors({});

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

        <Text
          style={[
            styles.inputLabel,
            fieldErrors.name && styles.inputLabelError,
          ]}
        >
          Full Name *
        </Text>
        <TextInput
          style={[styles.input, fieldErrors.name && styles.inputError]}
          placeholder="e.g. Ramesh Kumar"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (fieldErrors.name) {
              setFieldErrors({ ...fieldErrors, name: "" });
            }
          }}
        />
        {fieldErrors.name ? (
          <Text style={styles.fieldError}>{fieldErrors.name}</Text>
        ) : null}

        <Text
          style={[
            styles.inputLabel,
            fieldErrors.phone && styles.inputLabelError,
          ]}
        >
          Phone Number *
        </Text>
        <View
          style={[styles.phoneRow, fieldErrors.phone && styles.phoneRowError]}
        >
          <Text style={styles.prefix}>+91</Text>
          <TextInput
            style={styles.phoneInput}
            placeholder="9876543210"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={(t) => {
              setPhone(t.replace(/[^0-9]/g, ""));
              if (fieldErrors.phone) {
                setFieldErrors({ ...fieldErrors, phone: "" });
              }
            }}
          />
        </View>
        {fieldErrors.phone ? (
          <Text style={styles.fieldError}>{fieldErrors.phone}</Text>
        ) : null}

        <Text
          style={[
            styles.inputLabel,
            fieldErrors.role && styles.inputLabelError,
          ]}
        >
          Role *
        </Text>
        <View style={styles.roleRow}>
          {roleOptions.map((option) => (
            <TouchableOpacity
              key={option.role}
              style={[
                styles.roleChip,
                role === option.role && styles.roleChipSelected,
              ]}
              onPress={() => {
                setRole(option.role);
                if (fieldErrors.role) {
                  setFieldErrors({ ...fieldErrors, role: "" });
                }
              }}
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
        {fieldErrors.role ? (
          <Text style={styles.fieldError}>{fieldErrors.role}</Text>
        ) : null}

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

            <Text
              style={[
                styles.inputLabel,
                fieldErrors.flatNumber && styles.inputLabelError,
              ]}
            >
              Apartment Number *
            </Text>
            <TextInput
              style={[
                styles.input,
                fieldErrors.flatNumber && styles.inputError,
              ]}
              placeholder="e.g. A-204"
              value={flatNumber}
              onChangeText={(text) => {
                setFlatNumber(text);
                if (fieldErrors.flatNumber) {
                  setFieldErrors({ ...fieldErrors, flatNumber: "" });
                }
              }}
            />
            {fieldErrors.flatNumber ? (
              <Text style={styles.fieldError}>{fieldErrors.flatNumber}</Text>
            ) : null}

            <Text style={styles.inputLabel}>Area (sq. ft.) — optional</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1200"
              keyboardType="numeric"
              value={areaSqft}
              onChangeText={(text) => setAreaSqft(text.replace(/[^0-9]/g, ""))}
            />

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>Parking Available</Text>
              <Switch
                value={parkingAvailable}
                onValueChange={setParkingAvailable}
              />
            </View>

            <Text
              style={[
                styles.inputLabel,
                fieldErrors.maintenanceAmount && styles.inputLabelError,
              ]}
            >
              Monthly Maintenance (₹) *
            </Text>
            <TextInput
              style={[
                styles.input,
                fieldErrors.maintenanceAmount && styles.inputError,
              ]}
              placeholder="e.g. 2500"
              keyboardType="numeric"
              value={maintenanceAmount}
              onChangeText={(text) => {
                setMaintenanceAmount(text.replace(/[^0-9]/g, ""));
                if (fieldErrors.maintenanceAmount) {
                  setFieldErrors({ ...fieldErrors, maintenanceAmount: "" });
                }
              }}
            />
            {fieldErrors.maintenanceAmount ? (
              <Text style={styles.fieldError}>
                {fieldErrors.maintenanceAmount}
              </Text>
            ) : null}
          </>
        )}

        {groupType === "staff" && (
          <>
            <Text style={styles.sectionLabel}>Staff Details</Text>

            <Text
              style={[
                styles.inputLabel,
                fieldErrors.monthlySalary && styles.inputLabelError,
              ]}
            >
              Monthly Salary (₹) *
            </Text>
            <TextInput
              style={[
                styles.input,
                fieldErrors.monthlySalary && styles.inputError,
              ]}
              placeholder="e.g. 5000"
              keyboardType="numeric"
              value={monthlySalary}
              onChangeText={(text) => {
                setMonthlySalary(text.replace(/[^0-9]/g, ""));
                if (fieldErrors.monthlySalary) {
                  setFieldErrors({ ...fieldErrors, monthlySalary: "" });
                }
              }}
            />
            {fieldErrors.monthlySalary ? (
              <Text style={styles.fieldError}>{fieldErrors.monthlySalary}</Text>
            ) : null}
          </>
        )}

        {groupType === "expense" && (
          <>
            <Text style={styles.sectionLabel}>Expense Details</Text>

            <Text
              style={[
                styles.inputLabel,
                fieldErrors.expenseAmount && styles.inputLabelError,
              ]}
            >
              Amount (₹) *
            </Text>
            <TextInput
              style={[
                styles.input,
                fieldErrors.expenseAmount && styles.inputError,
              ]}
              placeholder="e.g. 4200"
              keyboardType="numeric"
              value={expenseAmount}
              onChangeText={(text) => {
                setExpenseAmount(text.replace(/[^0-9]/g, ""));
                if (fieldErrors.expenseAmount) {
                  setFieldErrors({ ...fieldErrors, expenseAmount: "" });
                }
              }}
            />
            {fieldErrors.expenseAmount ? (
              <Text style={styles.fieldError}>{fieldErrors.expenseAmount}</Text>
            ) : null}

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
    borderColor: "#e8e8e8",
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 14,
    fontSize: 15,
    outlineWidth: 0,
    outlineStyle: "none",
    outlineColor: "transparent",
    boxShadow: "none",
  } as any,
  textArea: {
    height: 90,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 10,
    paddingHorizontal: 14,
    outlineWidth: 0,
    outlineStyle: "none",
    outlineColor: "transparent",
    boxShadow: "none",
  } as any,
  prefix: { fontSize: 15, marginRight: 8, color: "#333" },
  phoneInput: {
    flex: 1,
    height: 50,
    fontSize: 15,
    outlineWidth: 0,
    outlineStyle: "none",
    outlineColor: "transparent",
    boxShadow: "none",
  } as any,
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
  error: {
    color: "#e53935",
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "#ffebee",
    padding: 12,
    borderRadius: 8,
    fontWeight: "500",
  },
  fieldError: {
    color: "#e53935",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    fontWeight: "500",
  },
  inputLabelError: {
    color: "#e53935",
  },
  inputError: {
    borderColor: "#e53935",
    borderWidth: 1.5,
  },
  phoneRowError: {
    borderColor: "#e53935",
    borderWidth: 1.5,
  },
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

import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import DatePickerModal from "../../components/DatePickerModal";
import { useMembers } from "../../hooks/useMembers";
import { BillAttachment, GroupType, MemberRole } from "../../types";

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
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRole, setCustomRole] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [wing, setWing] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [areaSqft, setAreaSqft] = useState<string>("");
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [maintenanceAmount, setMaintenanceAmount] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<"paid" | "due">("paid");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [billAttachments, setBillAttachments] = useState<BillAttachment[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  // Load member data
  useEffect(() => {
    const loadMemberData = () => {
      if (!member) return;

      setName(member.name);
      setPhone(member.phone.replace("+91", ""));
      setRole(member.role);
      setPhotoUri(member.photoUri || null);
      if (!roleOptions.some((option) => option.role === member.role)) {
        setIsCustomRole(true);
        setCustomRole(member.role);
      }

      if (groupType === "apartment" && "flatNumber" in member) {
        setWing(member.wing || "");
        setFlatNumber(member.flatNumber || "");
        setAreaSqft(member.areaSqft?.toString() || "");
        setParkingAvailable(member.parkingAvailable || false);
        setMaintenanceAmount(member.maintenanceAmount?.toString() || "");
      }

      if (groupType === "staff" && "monthlySalary" in member) {
        setMonthlySalary(member.monthlySalary?.toString() || "");
      }

      if (groupType === "expense" && "amount" in member) {
        setExpenseAmount(member.amount?.toString() || "");
        setExpenseStatus(member.status || "paid");
        setReminderEnabled(member.reminderEnabled || false);
        setDueDate(member.dueDate || "");
        setExpenseDescription(member.description || "");
        setBillAttachments(
          member.billAttachments ||
            (member.billUri
              ? [
                  {
                    uri: member.billUri,
                    name: member.billName || "Bill attachment",
                  },
                ]
              : []),
        );
      }
    };

    loadMemberData();
  }, []);

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const handlePickBill = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setBillAttachments((currentAttachments) => [
        ...currentAttachments,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName || "Bill image",
          mimeType: asset.mimeType,
        })),
      ]);
    }
  };

  const handleUpdate = async () => {
    setError("");
    const errors: Record<string, string> = {};

    // Validation
    if (!name.trim()) {
      errors.name = "Name is required";
    }

    if (groupType !== "expense") {
      if (!phone || phone.length === 0) {
        errors.phone = "Phone number is missing";
      } else if (phone.length !== 10) {
        errors.phone = "Phone number must be 10 digits";
      }

      if (!role) {
        errors.role = "Please select a role";
      }
    }

    if (groupType === "apartment") {
      if (!flatNumber.trim()) {
        errors.flatNumber = "Flat number is required";
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

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix all the errors");
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const updateData: any = {
        name: name.trim(),
        phone: groupType === "expense" ? "" : `+91${phone}`,
        role: groupType === "expense" ? "expense" : role,
        photoUri: photoUri ?? undefined,
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
      }

      if (groupType === "staff") {
        updateData.monthlySalary = Number(monthlySalary);
      }

      if (groupType === "expense") {
        updateData.amount = Number(expenseAmount);
        updateData.status = expenseStatus;
        updateData.reminderEnabled =
          expenseStatus === "due" ? reminderEnabled : false;
        updateData.dueDate = dueDate || undefined;
        updateData.description = expenseDescription.trim() || undefined;
        updateData.billAttachments = billAttachments;
      }

      await editMember(memberId, updateData);
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to update member");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirmation(true);
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);
      setError("");
      setFieldErrors({});
      await deleteMember(memberId);
      setShowDeleteConfirmation(false);
      router.back();
    } catch (e: any) {
      console.error("Delete error:", e);
      setError(e.message || "Failed to delete member. Please try again.");
      setLoading(false);
    }
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
      <Stack.Screen
        options={{
          title: groupType === "expense" ? "Edit Expenses" : "Edit Member",
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {groupType === "expense" ? "Edit Expenses" : "Edit Member"}
          </Text>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={24} color="#e53935" />
          </TouchableOpacity>
        </View>

        {groupType !== "expense" ? (
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
        ) : null}

        {groupType !== "expense" && (
          <>
            <Text
              style={[
                styles.inputLabel,
                fieldErrors.name && styles.inputLabelError,
              ]}
            >
              {groupType === "expense" ? "Expense Name *" : "Full Name *"}
            </Text>
            <TextInput
              style={[styles.input, fieldErrors.name && styles.inputError]}
              placeholder={
                groupType === "expense"
                  ? "e.g. Water bill, Lift repair"
                  : "e.g. Ramesh Kumar"
              }
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
              style={[
                styles.phoneRow,
                fieldErrors.phone && styles.phoneRowError,
              ]}
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
                    setIsCustomRole(false);
                    setCustomRole("");
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
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  isCustomRole && styles.roleChipSelected,
                ]}
                onPress={() => {
                  setIsCustomRole(true);
                  setRole(customRole.trim() || null);
                }}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    isCustomRole && styles.roleChipTextSelected,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>
            {isCustomRole ? (
              <TextInput
                style={[styles.input, styles.customRoleInput]}
                placeholder="Enter custom role"
                value={customRole}
                onChangeText={(text) => {
                  setCustomRole(text);
                  setRole(text.trim() || null);
                  if (fieldErrors.role) {
                    setFieldErrors({ ...fieldErrors, role: "" });
                  }
                }}
              />
            ) : null}
            {fieldErrors.role ? (
              <Text style={styles.fieldError}>{fieldErrors.role}</Text>
            ) : null}
          </>
        )}

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

            <Text
              style={[
                styles.inputLabel,
                fieldErrors.flatNumber && styles.inputLabelError,
              ]}
            >
              Flat Number *
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
                trackColor={{ false: "#767577", true: "#1a73e8" }}
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
            <Text style={styles.sectionLabel}>Employment Details</Text>

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
                fieldErrors.name && styles.inputLabelError,
              ]}
            >
              Expense Name *
            </Text>
            <TextInput
              style={[styles.input, fieldErrors.name && styles.inputError]}
              placeholder="e.g. Water bill, Lift repair"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (fieldErrors.name)
                  setFieldErrors({ ...fieldErrors, name: "" });
              }}
            />
            {fieldErrors.name ? (
              <Text style={styles.fieldError}>{fieldErrors.name}</Text>
            ) : null}

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

            <Text style={styles.inputLabel}>Payment Status</Text>
            <View style={styles.statusRow}>
              <TouchableOpacity
                style={[
                  styles.statusOption,
                  expenseStatus === "paid" && styles.statusOptionPaid,
                ]}
                onPress={() => {
                  setExpenseStatus("paid");
                  setReminderEnabled(false);
                }}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={expenseStatus === "paid" ? "#16803a" : "#666"}
                />
                <Text
                  style={[
                    styles.statusOptionText,
                    expenseStatus === "paid" && styles.statusOptionTextPaid,
                  ]}
                >
                  Paid
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusOption,
                  expenseStatus === "due" && styles.statusOptionDue,
                ]}
                onPress={() => setExpenseStatus("due")}
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={expenseStatus === "due" ? "#b45f00" : "#666"}
                />
                <Text
                  style={[
                    styles.statusOptionText,
                    expenseStatus === "due" && styles.statusOptionTextDue,
                  ]}
                >
                  Due
                </Text>
              </TouchableOpacity>
            </View>
            {expenseStatus === "due" ? (
              <View style={styles.reminderRow}>
                <View>
                  <Text style={styles.reminderTitle}>Set Reminder</Text>
                  <Text style={styles.reminderSubtitle}>
                    Get notified on the expense date
                  </Text>
                </View>
                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{ false: "#c9c9c9", true: "#86b9f4" }}
                />
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Expense Date</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={dueDate ? styles.dateText : styles.datePlaceholder}>
                {dueDate || "Select date"}
              </Text>
              <Ionicons name="calendar-outline" size={20} color="#1a73e8" />
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Bill Attachment (optional)</Text>
            {billAttachments.length ? (
              <View style={styles.attachmentList}>
                {billAttachments.map((attachment, index) => (
                  <View
                    key={`${attachment.uri}-${index}`}
                    style={styles.attachmentRow}
                  >
                    <Ionicons name="image-outline" size={20} color="#1a73e8" />
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {attachment.name}
                    </Text>
                    <TouchableOpacity
                      style={styles.attachmentAction}
                      onPress={() => Linking.openURL(attachment.uri)}
                    >
                      <Ionicons
                        name="download-outline"
                        size={20}
                        color="#1a73e8"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.attachmentAction}
                      onPress={() =>
                        setBillAttachments((currentAttachments) =>
                          currentAttachments.filter(
                            (_, attachmentIndex) => attachmentIndex !== index,
                          ),
                        )
                      }
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#e53935"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.attachButton}
              onPress={handlePickBill}
            >
              <Ionicons name="attach-outline" size={20} color="#1a73e8" />
              <Text style={styles.attachButtonText}>
                {billAttachments.length
                  ? "Add more attachments"
                  : "Add bill attachments"}
              </Text>
            </TouchableOpacity>

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

        {error && (error !== "Please fix all the errors" || hasFieldErrors) ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

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
      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={setDueDate}
      />
      <Modal
        transparent
        animationType="fade"
        visible={showDeleteConfirmation}
        onRequestClose={() => setShowDeleteConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmationModal}>
            <Text style={styles.confirmationTitle}>Delete Member?</Text>
            <Text style={styles.confirmationMessage}>
              Are you sure you want to delete {name}? This action cannot be
              undone.
            </Text>
            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowDeleteConfirmation(false)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmDeleteButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={confirmDelete}
                disabled={loading}
              >
                <Text style={styles.confirmDeleteButtonText}>
                  {loading ? "Deleting..." : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  photoSection: { alignItems: "center", marginBottom: 8 },
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
  photoImage: { width: 80, height: 80, borderRadius: 40 },
  photoLabel: {
    fontSize: 12,
    color: "#1a73e8",
    fontWeight: "600",
    marginTop: 8,
  },
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
    borderColor: "#e8e8e8",
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: "#fff",
    outlineWidth: 0,
    outlineStyle: "none",
    outlineColor: "transparent",
    boxShadow: "none",
  } as any,
  textArea: {
    height: 100,
    textAlignVertical: "top" as const,
    paddingTop: 12,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
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
  roleChipTextSelected: {
    color: "#1a73e8",
    fontWeight: "700",
  },
  customRoleInput: { marginTop: 10 },
  statusRow: { flexDirection: "row", gap: 10 },
  statusOption: {
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#dedede",
    borderRadius: 8,
  },
  statusOptionPaid: { borderColor: "#4caf70", backgroundColor: "#f0f9f2" },
  statusOptionDue: { borderColor: "#ed9b40", backgroundColor: "#fff7ed" },
  statusOptionText: { color: "#555", fontSize: 14, fontWeight: "600" },
  statusOptionTextPaid: { color: "#16803a" },
  statusOptionTextDue: { color: "#b45f00" },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: "#fff7ed",
  },
  reminderTitle: { color: "#333", fontSize: 14, fontWeight: "600" },
  reminderSubtitle: { color: "#777", fontSize: 12, marginTop: 2 },
  dateInput: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  dateText: { color: "#333", fontSize: 15 },
  datePlaceholder: { color: "#999", fontSize: 15 },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#1a73e8",
    borderRadius: 8,
  },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#7eaff0",
    borderRadius: 8,
    marginTop: 8,
  },
  attachButtonText: { color: "#1a73e8", fontWeight: "600" },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d8e7fb",
    borderRadius: 8,
    backgroundColor: "#f5f9ff",
  },
  attachmentList: {
    borderWidth: 1,
    borderColor: "#e2e9f4",
    borderRadius: 8,
    overflow: "hidden",
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f8fbff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e9f4",
  },
  attachmentName: { flex: 1, color: "#333", fontSize: 14 },
  attachmentAction: { padding: 4 },
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
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    padding: 24,
  },
  confirmationModal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 24,
  },
  confirmationTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
  confirmationMessage: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    marginTop: 12,
  },
  confirmationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    minWidth: 88,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#555",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmDeleteButton: {
    minWidth: 88,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e53935",
    borderRadius: 6,
  },
  confirmDeleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

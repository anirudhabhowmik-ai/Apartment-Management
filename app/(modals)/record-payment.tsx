import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
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
import { useMembers } from "../../hooks/useMembers";
import { usePayments } from "../../hooks/usePayments";
import { PaymentCategory, PaymentStatus } from "../../types/payment";

type PaymentTypeOption = {
  value: PaymentCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const PAYMENT_TYPES: PaymentTypeOption[] = [
  { value: "salary", label: "Salary", icon: "cash-outline", color: "#4CAF50" },
  { value: "rent", label: "Rent", icon: "home-outline", color: "#2196F3" },
  {
    value: "maintenance",
    label: "Maintenance",
    icon: "construct-outline",
    color: "#FF9800",
  },
  {
    value: "electricity",
    label: "Electricity",
    icon: "flash-outline",
    color: "#F44336",
  },
  { value: "water", label: "Water", icon: "water-outline", color: "#00BCD4" },
  { value: "other", label: "Other", icon: "receipt-outline", color: "#9E9E9E" },
];

const STATUS_OPTIONS: { value: PaymentStatus; label: string; color: string }[] =
  [
    { value: "paid", label: "Paid", color: "#4CAF50" },
    { value: "due", label: "Due", color: "#FF9800" },
    { value: "overdue", label: "Overdue", color: "#F44336" },
  ];

export default function RecordPaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    accountId: string;
    category?: PaymentCategory;
    paymentId?: string;
    memberId?: string;
    flatId?: string;
    amount?: string;
    description?: string;
    taskId?: string;
    mode?: "edit" | "add";
  }>();

  const { selectedAccount } = useAccounts();
  const {
    payments,
    addNewPayment,
    editPayment,
    removePayment,
    markAsPaid,
    getPaymentById,
  } = usePayments(params.accountId || selectedAccount?.id);

  const { groups } = useGroups(params.accountId || selectedAccount?.id || null);
  const { members } = useMembers(groups[0]?.id || null);

  const existingPayment = params.paymentId
    ? getPaymentById(params.paymentId)
    : null;
  const isEditing = params.mode === "edit" && existingPayment;

  // Form state
  const [category, setCategory] = useState<PaymentCategory>(
    params.category || "other",
  );
  const [amount, setAmount] = useState(params.amount || "");
  const [status, setStatus] = useState<PaymentStatus>("due");
  const [description, setDescription] = useState(params.description || "");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");

  // Salary specific
  const [selectedMemberId, setSelectedMemberId] = useState(
    params.memberId || "",
  );
  const [month, setMonth] = useState("");
  const [presentDays, setPresentDays] = useState("");

  // Maintenance specific
  const [flatNumber, setFlatNumber] = useState(params.flatId || "");

  // Bill specific
  const [billNumber, setBillNumber] = useState("");
  const [units, setUnits] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Get members based on category
  const getFilteredMembers = () => {
    if (category === "salary") {
      // Get staff members from staff groups
      const servantGroups = groups.filter((g) => g.type === "staff");
      const servantMemberIds = servantGroups.flatMap((g) =>
        members.filter((m) => m.groupId === g.id).map((m) => m.id),
      );
      return members.filter((m) => servantMemberIds.includes(m.id));
    }
    if (category === "maintenance") {
      // Get apartment owners from apartment groups
      const flatGroups = groups.filter((g) => g.type === "apartment");
      const flatMemberIds = flatGroups.flatMap((g) =>
        members.filter((m) => m.groupId === g.id).map((m) => m.id),
      );
      return members.filter((m) => flatMemberIds.includes(m.id));
    }
    return [];
  };

  const filteredMembers = getFilteredMembers();

  // Load existing payment data for editing
  useEffect(() => {
    if (existingPayment) {
      setCategory(existingPayment.category);
      setAmount(existingPayment.amount.toString());
      setStatus(existingPayment.status);
      setDescription(existingPayment.description || "");
      setDueDate(existingPayment.dueDate);
      setPaidDate(existingPayment.paidDate || "");

      // Load specific fields based on category
      if (
        existingPayment.category === "salary" &&
        "memberId" in existingPayment
      ) {
        setSelectedMemberId(existingPayment.memberId);
        setMonth(existingPayment.month);
        setPresentDays(existingPayment.presentDays?.toString() || "");
      } else if (
        existingPayment.category === "maintenance" &&
        "flatNumber" in existingPayment
      ) {
        setFlatNumber(existingPayment.flatNumber);
        setMonth(existingPayment.month);
      } else if (
        existingPayment.category === "rent" &&
        "month" in existingPayment
      ) {
        setMonth(existingPayment.month);
      } else if (
        (existingPayment.category === "electricity" ||
          existingPayment.category === "water") &&
        "billNumber" in existingPayment
      ) {
        setBillNumber(existingPayment.billNumber || "");
        setUnits(existingPayment.units?.toString() || "");
      }
    } else {
      // Set defaults for new payment
      const today = new Date();
      setDueDate(today.toISOString());
      setMonth(today.toISOString().slice(0, 7)); // YYYY-MM
    }
  }, [existingPayment]);

  const handleSubmit = async () => {
    setError("");

    // Validate
    const accountId = params.accountId || selectedAccount?.id;
    if (!accountId) {
      setError("No property selected");
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!dueDate) {
      setError("Please select a due date");
      return;
    }

    // Category specific validation
    if (category === "salary" && !selectedMemberId) {
      setError("Please select a staff member");
      return;
    }

    if (category === "maintenance" && !flatNumber.trim()) {
      setError("Please enter flat number");
      return;
    }

    setLoading(true);
    try {
      const paymentData: any = {
        accountId,
        category,
        amount: Number(amount),
        dueDate,
        status,
        paidDate:
          status === "paid" ? paidDate || new Date().toISOString() : undefined,
        description: description.trim() || undefined,
      };

      // Add category-specific fields
      if (category === "salary") {
        paymentData.memberId = selectedMemberId;
        paymentData.month = month;
        paymentData.presentDays = presentDays ? Number(presentDays) : undefined;
      } else if (category === "maintenance") {
        paymentData.memberId = selectedMemberId || undefined;
        paymentData.flatNumber = flatNumber.trim();
        paymentData.month = month;
      } else if (category === "rent") {
        paymentData.month = month;
      } else if (category === "electricity" || category === "water") {
        paymentData.billNumber = billNumber.trim() || undefined;
        paymentData.units = units ? Number(units) : undefined;
      }

      if (isEditing && params.paymentId) {
        await editPayment(params.paymentId, paymentData);
      } else {
        await addNewPayment(paymentData);
      }
      router.back();
    } catch (error: any) {
      setError(error.message || "Failed to save payment");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!params.paymentId) return;

    try {
      setLoading(true);
      await markAsPaid(params.paymentId);
      router.back();
    } catch (error: any) {
      setError(error.message || "Failed to mark as paid");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!params.paymentId) return;

    Alert.alert(
      "Delete Payment",
      "Are you sure you want to delete this payment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await removePayment(params.paymentId!);
              router.back();
            } catch (error: any) {
              setError(error.message || "Failed to delete payment");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const renderMemberSelector = () => {
    const membersList = getFilteredMembers();

    if (membersList.length === 0) {
      return (
        <View style={styles.emptyMembers}>
          <Text style={styles.emptyMembersText}>
            No {category === "salary" ? "staff" : "flat owners"} found. Please
            add one first.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.memberSelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {membersList.map((member) => (
            <TouchableOpacity
              key={member.id}
              style={[
                styles.memberChip,
                selectedMemberId === member.id && styles.memberChipSelected,
              ]}
              onPress={() => setSelectedMemberId(member.id)}
            >
              <Text style={styles.memberChipText}>{member.name}</Text>
              {category === "salary" && "monthlySalary" in member && (
                <Text style={styles.memberChipSalary}>
                  ₹{member.monthlySalary}
                </Text>
              )}
              {category === "maintenance" && "flatNumber" in member && (
                <Text style={styles.memberChipFlat}>{member.flatNumber}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEditing ? "Edit Payment" : "Record Payment"}
          </Text>
          {isEditing && (
            <TouchableOpacity
              onPress={handleDelete}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={24} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>

        {/* Payment Type */}
        <Text style={styles.inputLabel}>Payment Type *</Text>
        <View style={styles.typeGrid}>
          {PAYMENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.typeChip,
                category === type.value && styles.typeChipSelected,
                { borderColor: type.color },
              ]}
              onPress={() => {
                setCategory(type.value);
                setSelectedMemberId("");
                setFlatNumber("");
              }}
            >
              <Ionicons
                name={type.icon}
                size={20}
                color={category === type.value ? type.color : "#666"}
              />
              <Text
                style={[
                  styles.typeChipText,
                  category === type.value && {
                    color: type.color,
                    fontWeight: "700",
                  },
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Member Selector (for Salary & Maintenance) */}
        {(category === "salary" || category === "maintenance") && (
          <>
            <Text style={styles.inputLabel}>
              {category === "salary" ? "Select Staff *" : "Select Flat Owner"}
            </Text>
            {renderMemberSelector()}
          </>
        )}

        {/* Flat Number (for Maintenance) */}
        {category === "maintenance" && (
          <>
            <Text style={styles.inputLabel}>Flat Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. A-204"
              value={flatNumber}
              onChangeText={setFlatNumber}
            />
          </>
        )}

        {/* Amount */}
        <Text style={styles.inputLabel}>Amount (₹) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter amount"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        {/* Description */}
        <Text style={styles.inputLabel}>Description</Text>
        <TextInput
          style={styles.input}
          placeholder="Add description..."
          value={description}
          onChangeText={setDescription}
        />

        {/* Month (for Salary, Rent, Maintenance) */}
        {(category === "salary" ||
          category === "rent" ||
          category === "maintenance") && (
          <>
            <Text style={styles.inputLabel}>Month</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2026-08"
              value={month}
              onChangeText={setMonth}
            />
          </>
        )}

        {/* Bill Number & Units (for Electricity & Water) */}
        {(category === "electricity" || category === "water") && (
          <>
            <Text style={styles.inputLabel}>Bill Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter bill number"
              value={billNumber}
              onChangeText={setBillNumber}
            />

            <Text style={styles.inputLabel}>Units Consumed</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter units"
              keyboardType="numeric"
              value={units}
              onChangeText={setUnits}
            />
          </>
        )}

        {/* Present Days (for Salary) */}
        {category === "salary" && (
          <>
            <Text style={styles.inputLabel}>Present Days</Text>
            <TextInput
              style={styles.input}
              placeholder="Days present this month"
              keyboardType="numeric"
              value={presentDays}
              onChangeText={setPresentDays}
            />
          </>
        )}

        {/* Status */}
        <Text style={styles.inputLabel}>Status *</Text>
        <View style={styles.statusContainer}>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.statusChip,
                status === opt.value && styles.statusChipSelected,
                { borderColor: opt.color },
              ]}
              onPress={() => setStatus(opt.value)}
            >
              <View
                style={[styles.statusDot, { backgroundColor: opt.color }]}
              />
              <Text
                style={[
                  styles.statusChipText,
                  status === opt.value && {
                    color: opt.color,
                    fontWeight: "700",
                  },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Due Date */}
        <Text style={styles.inputLabel}>Due Date *</Text>
        <TouchableOpacity
          style={styles.dateInput}
          onPress={() => {
            const today = new Date().toISOString();
            setDueDate(today);
          }}
        >
          <Ionicons name="calendar-outline" size={20} color="#666" />
          <Text style={styles.dateText}>
            {dueDate ? new Date(dueDate).toLocaleDateString() : "Select Date"}
          </Text>
        </TouchableOpacity>

        {/* Paid Date (if status is paid) */}
        {status === "paid" && (
          <>
            <Text style={styles.inputLabel}>Paid Date</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => {
                const today = new Date().toISOString();
                setPaidDate(today);
              }}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#4CAF50"
              />
              <Text style={styles.dateText}>
                {paidDate ? new Date(paidDate).toLocaleDateString() : "Today"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        {isEditing && status !== "paid" && (
          <TouchableOpacity
            style={[styles.markPaidButton, loading && styles.buttonDisabled]}
            onPress={handleMarkAsPaid}
            disabled={loading}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.markPaidText}>Mark as Paid</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading
              ? "Saving..."
              : isEditing
                ? "Update Payment"
                : "Record Payment"}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },
  deleteButton: {
    padding: 8,
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
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderColor: "#e0e0e0",
  },
  typeChipSelected: {
    backgroundColor: "#f0f6ff",
    borderWidth: 2,
  },
  typeChipText: {
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },
  memberSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  memberChipSelected: {
    backgroundColor: "#e8f0fe",
    borderColor: "#1a73e8",
  },
  memberChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
  },
  memberChipSalary: {
    fontSize: 11,
    color: "#4CAF50",
    fontWeight: "600",
  },
  memberChipFlat: {
    fontSize: 11,
    color: "#666",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  emptyMembers: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  emptyMembersText: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
  statusContainer: {
    flexDirection: "row",
    gap: 10,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderColor: "#e0e0e0",
  },
  statusChipSelected: {
    backgroundColor: "#f0f6ff",
    borderWidth: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusChipText: {
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 14,
    gap: 12,
    backgroundColor: "#fff",
  },
  dateText: {
    fontSize: 15,
    color: "#333",
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
  markPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    height: 48,
    marginTop: 16,
    gap: 8,
  },
  markPaidText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});

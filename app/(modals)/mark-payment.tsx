import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import DatePickerModal from "../../components/DatePickerModal";
import { usePayments } from "../../hooks/usePayments";
import { useMemberStore } from "../../store/memberStore";

export default function MarkPaymentScreen() {
  const router = useRouter();
  const { accountId, paymentId, memberId, type, mode } = useLocalSearchParams<{
    accountId: string;
    paymentId?: string;
    memberId: string;
    type: "maintenance" | "salary";
    mode?: "edit";
  }>();
  const member = useMemberStore((state) =>
    state.members.find((currentMember) => currentMember.id === memberId),
  );
  const updateMember = useMemberStore((state) => state.updateMember);
  const { editPayment, markAsPaid } = usePayments(accountId);
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAdditionalAmount, setShowAdditionalAmount] = useState(false);
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [additionalNote, setAdditionalNote] = useState("");

  const amount =
    type === "maintenance" ? member?.maintenanceAmount : member?.monthlySalary;
  const isEditing = mode === "edit";

  useEffect(() => {
    if (!member) return;
    setPaidDate(member.paidDate || new Date().toISOString().slice(0, 10));
    setAdditionalAmount(member.additionalAmount?.toString() || "");
    setAdditionalNote(member.additionalNote || "");
    setShowAdditionalAmount(
      Boolean(member.additionalAmount || member.additionalNote),
    );
  }, [member]);

  const handleConfirm = async () => {
    if (!memberId) return;

    if (paymentId) {
      if (isEditing) {
        await editPayment(paymentId, {
          status: "paid",
          paidDate: new Date(`${paidDate}T00:00:00`).toISOString(),
        });
      } else {
        await markAsPaid(paymentId);
      }
    }
    updateMember(memberId, {
      paymentStatus: "paid",
      paidDate,
      additionalAmount: showAdditionalAmount
        ? Number(additionalAmount) || 0
        : 0,
      additionalNote: showAdditionalAmount
        ? additionalNote.trim() || undefined
        : undefined,
    });
    router.back();
  };

  const handleMarkAsDue = async () => {
    if (!memberId) return;

    if (paymentId) {
      await editPayment(paymentId, { status: "due", paidDate: undefined });
    }
    updateMember(memberId, {
      paymentStatus: "due",
      paidDate: undefined,
      additionalAmount: undefined,
      additionalNote: undefined,
    });
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: isEditing ? "Edit Payment Details" : "Mark as Paid" }}
      />
      <Text style={styles.memberName}>{member?.name || "Member"}</Text>

      <Text style={styles.label}>
        {type === "maintenance" ? "Maintenance Amount" : "Salary Amount"}
      </Text>
      <View style={styles.amountDisplay}>
        <Text style={styles.amount}>₹{amount || 0}</Text>
      </View>

      <TouchableOpacity
        style={styles.additionalButton}
        onPress={() => setShowAdditionalAmount((visible) => !visible)}
      >
        <Ionicons
          name={
            showAdditionalAmount
              ? "remove-circle-outline"
              : "add-circle-outline"
          }
          size={18}
          color={showAdditionalAmount ? "#dc2626" : "#1a73e8"}
        />
        <Text
          style={[
            styles.additionalButtonText,
            showAdditionalAmount && styles.removeAdditionalButtonText,
          ]}
        >
          {showAdditionalAmount
            ? "Remove additional amount"
            : "Add additional amount"}
        </Text>
      </TouchableOpacity>

      {showAdditionalAmount && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Additional amount"
            keyboardType="numeric"
            value={additionalAmount}
            onChangeText={(value) =>
              setAdditionalAmount(value.replace(/[^0-9]/g, ""))
            }
          />
          <TextInput
            style={styles.input}
            placeholder="Note, e.g. bonus or event work"
            value={additionalNote}
            onChangeText={setAdditionalNote}
          />
        </>
      )}

      <Text style={styles.label}>Paid Date</Text>
      <TouchableOpacity
        style={styles.dateSelector}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateText}>{paidDate}</Text>
        <Ionicons name="calendar-outline" size={19} color="#1a73e8" />
      </TouchableOpacity>

      <View style={styles.actions}>
        {isEditing && (
          <TouchableOpacity style={styles.dueButton} onPress={handleMarkAsDue}>
            <Text style={styles.dueText}>Mark as Due</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmText}>
            {isEditing ? "Save Details" : "Confirm Payment"}
          </Text>
        </TouchableOpacity>
      </View>

      <DatePickerModal
        visible={showDatePicker}
        value={paidDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={setPaidDate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  memberName: { color: "#555", fontSize: 14 },
  label: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
  },
  amountDisplay: { backgroundColor: "#f3f7fd", borderRadius: 10, padding: 14 },
  amount: { color: "#111", fontSize: 17, fontWeight: "700" },
  additionalButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  additionalButtonText: { color: "#1a73e8", fontSize: 14, fontWeight: "500" },
  removeAdditionalButtonText: { color: "#dc2626" },
  input: {
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    height: 48,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  dateSelector: {
    alignItems: "center",
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  dateText: { color: "#333", fontSize: 14 },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 22,
  },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 12 },
  cancelText: { color: "#333", fontSize: 14, fontWeight: "600" },
  dueButton: { paddingHorizontal: 10, paddingVertical: 12 },
  dueText: { color: "#dc2626", fontSize: 14, fontWeight: "700" },
  confirmButton: {
    backgroundColor: "#16803a",
    borderRadius: 7,
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

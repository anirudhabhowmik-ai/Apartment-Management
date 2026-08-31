import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import DatePickerModal from "../../components/DatePickerModal";
import { usePayments } from "../../hooks/usePayments";
import { BillAttachment } from "../../types/member";
import { PaymentStatus } from "../../types/payment";

export default function EditExpenseScreen() {
  const router = useRouter();
  const { accountId, paymentId } = useLocalSearchParams<{
    accountId: string;
    paymentId: string;
  }>();
  const { getPaymentById, editPayment } = usePayments(accountId);
  const payment = getPaymentById(paymentId);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"paid" | "due">("due");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [billAttachments, setBillAttachments] = useState<BillAttachment[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setName(payment.description || payment.category);
    setAmount(payment.amount.toString());
    setStatus(payment.status === "paid" ? "paid" : "due");
    setDueDate(payment.dueDate.slice(0, 10));
    setNote(payment.description || "");
    setBillAttachments(payment.billAttachments || []);
  }, [payment]);

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

  const handleSave = async () => {
    if (!payment || !amount || Number(amount) <= 0) return;

    await editPayment(payment.id, {
      amount: Number(amount),
      description: note.trim() || name.trim() || undefined,
      status: status as PaymentStatus,
      billAttachments,
      dueDate: dueDate
        ? new Date(`${dueDate}T00:00:00`).toISOString()
        : payment.dueDate,
      paidDate:
        status === "paid"
          ? payment.paidDate || new Date().toISOString()
          : undefined,
    });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>EXPENSE DETAILS</Text>

      <Text style={styles.label}>Expense Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Amount (₹) *</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={amount}
        onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ""))}
      />

      <Text style={styles.label}>Payment Status</Text>
      <View style={styles.statusRow}>
        {(["paid", "due"] as const).map((option) => {
          const selected = status === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.statusButton,
                selected &&
                  (option === "paid" ? styles.statusPaid : styles.statusDue),
              ]}
              onPress={() => setStatus(option)}
            >
              <Ionicons
                name={
                  option === "paid"
                    ? "checkmark-circle-outline"
                    : "time-outline"
                }
                size={18}
                color={
                  selected
                    ? option === "paid"
                      ? "#16803a"
                      : "#d97706"
                    : "#666"
                }
              />
              <Text
                style={[
                  styles.statusText,
                  selected && {
                    color: option === "paid" ? "#16803a" : "#d97706",
                  },
                ]}
              >
                {option === "paid" ? "Paid" : "Due"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Expense Date</Text>
      <TouchableOpacity
        style={styles.dateInput}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateText}>{dueDate}</Text>
        <Ionicons name="calendar-outline" size={19} color="#1a73e8" />
      </TouchableOpacity>

      <Text style={styles.label}>Bill Attachment (optional)</Text>
      {billAttachments.length > 0 && (
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
              <TouchableOpacity onPress={() => Linking.openURL(attachment.uri)}>
                <Ionicons name="download-outline" size={20} color="#1a73e8" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setBillAttachments((items) =>
                    items.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Ionicons name="trash-outline" size={20} color="#e53935" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity style={styles.attachButton} onPress={handlePickBill}>
        <Ionicons name="attach-outline" size={20} color="#1a73e8" />
        <Text style={styles.attachButtonText}>
          {billAttachments.length
            ? "Add more attachments"
            : "Add bill attachments"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        multiline
        placeholder="Add a note"
        value={note}
        onChangeText={setNote}
      />

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>Update Expense</Text>
      </TouchableOpacity>

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={setDueDate}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", flexGrow: 1, padding: 24 },
  sectionLabel: {
    color: "#1a73e8",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 22,
  },
  label: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderColor: "#ddd",
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    height: 50,
    paddingHorizontal: 14,
  },
  statusRow: { flexDirection: "row", gap: 10 },
  statusButton: {
    alignItems: "center",
    borderColor: "#ddd",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 13,
  },
  statusPaid: { backgroundColor: "#effaf2", borderColor: "#22a553" },
  statusDue: { backgroundColor: "#fff7ed", borderColor: "#f59e0b" },
  statusText: { color: "#555", fontSize: 14, fontWeight: "600" },
  dateInput: {
    alignItems: "center",
    borderColor: "#ddd",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    height: 50,
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  dateText: { color: "#333", fontSize: 15 },
  attachButton: {
    alignItems: "center",
    borderColor: "#7eaff0",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    height: 44,
  },
  attachButtonText: { color: "#1a73e8", fontSize: 14, fontWeight: "600" },
  attachmentList: {
    borderColor: "#e2e9f4",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  attachmentRow: {
    alignItems: "center",
    backgroundColor: "#f8fbff",
    borderBottomColor: "#e2e9f4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachmentName: { color: "#333", flex: 1, fontSize: 14 },
  noteInput: { height: 90, paddingTop: 14, textAlignVertical: "top" },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    marginTop: 30,
    paddingVertical: 15,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

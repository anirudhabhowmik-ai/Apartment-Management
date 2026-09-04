import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DatePickerModal from "../../components/DatePickerModal";
import { usePayments } from "../../hooks/usePayments";
import { useAttendanceStore } from "../../store/attendanceStore";
import { useMemberStore } from "../../store/memberStore";

const formatMonth = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

const getCalculatedStaffSalary = (
  salary: number,
  month: string,
  statuses: Record<string, string>,
) => {
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();

  const paidDays = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1,
  ).filter((day) => {
    const date = `${month}-${String(day).padStart(2, "0")}`;

    const defaultStatus =
      new Date(`${date}T00:00:00`).getDay() % 6 === 0 ? "weekend" : "present";

    return (statuses[date] || defaultStatus) !== "absent";
  }).length;

  return Math.round((salary / daysInMonth) * paidDays);
};

export default function MarkPaymentScreen() {
  const router = useRouter();

  const { accountId, paymentId, memberId, type, mode, month } =
    useLocalSearchParams<{
      accountId: string;
      paymentId?: string;
      memberId: string;
      type: "maintenance" | "salary";
      mode?: "edit";
      month?: string;
    }>();

  const member = useMemberStore((state) =>
    state.members.find((currentMember) => currentMember.id === memberId),
  );

  const updateMember = useMemberStore((state) => state.updateMember);

  const getAttendanceRecord = useAttendanceStore((state) => state.getRecord);

  const { editPayment, markAsPaid } = usePayments(accountId);

  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const [showDatePicker, setShowDatePicker] = useState(false);

  const [showAdditionalAmount, setShowAdditionalAmount] = useState(false);

  const [additionalAmount, setAdditionalAmount] = useState("");

  const [additionalNote, setAdditionalNote] = useState("");

  const [showDeduction, setShowDeduction] = useState(false);

  const [deductionAmount, setDeductionAmount] = useState("");

  const [deductionNote, setDeductionNote] = useState("");

  /*
   * New payment starts as Due.
   */
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "due">("due");

  const [showStatusOptions, setShowStatusOptions] = useState(false);

  const [saving, setSaving] = useState(false);

  const paymentMonth = month || new Date().toISOString().slice(0, 7);

  /*
   * Attendance is only required for salary.
   */
  const attendanceRecord = member
    ? getAttendanceRecord(member.id, paymentMonth)
    : undefined;

  /*
   * Original/base amount.
   */
  const amount =
    type === "maintenance"
      ? member && "maintenanceAmount" in member
        ? member.maintenanceAmount
        : 0
      : member && "monthlySalary" in member
        ? (attendanceRecord?.payableSalary ??
          getCalculatedStaffSalary(
            member.monthlySalary,
            paymentMonth,
            attendanceRecord?.statuses || {},
          ))
        : 0;

  const isEditing = mode === "edit";

  /*
   * Additional amount.
   */
  const additionalValue = showAdditionalAmount
    ? Number(additionalAmount) || 0
    : 0;

  /*
   * Deduction amount.
   */
  const deductionValue = showDeduction ? Number(deductionAmount) || 0 : 0;

  /*
   * FINAL AMOUNT.
   *
   * This works for both Due and Paid.
   *
   * Base Amount
   * + Additional Amount
   * - Deduction
   */
  const netPaidAmount = (amount || 0) + additionalValue - deductionValue;

  /*
   * Load existing payment for the selected month.
   */
  useEffect(() => {
    if (!member) return;

    const paymentForMonth =
      member.monthlyPayments?.[paymentMonth] ||
      (member.paidDate?.slice(0, 7) === paymentMonth
        ? {
            status: member.paymentStatus,
            paidDate: member.paidDate,
            additionalAmount: member.additionalAmount,
            additionalNote: member.additionalNote,
            deductionAmount: member.deductionAmount,
            deductionNote: member.deductionNote,
          }
        : undefined);

    /*
     * If there is no existing payment,
     * status remains Due.
     */
    setPaymentStatus(paymentForMonth?.status === "paid" ? "paid" : "due");

    setPaidDate(paymentForMonth?.paidDate || `${paymentMonth}-01`);

    setAdditionalAmount(paymentForMonth?.additionalAmount?.toString() || "");

    setAdditionalNote(paymentForMonth?.additionalNote || "");

    setShowAdditionalAmount(
      Boolean(
        paymentForMonth?.additionalAmount || paymentForMonth?.additionalNote,
      ),
    );

    setDeductionAmount(paymentForMonth?.deductionAmount?.toString() || "");

    setDeductionNote(paymentForMonth?.deductionNote || "");

    setShowDeduction(
      Boolean(
        paymentForMonth?.deductionAmount || paymentForMonth?.deductionNote,
      ),
    );
  }, [member, paymentMonth]);

  /*
   * Change status.
   */
  const selectPaymentStatus = (status: "paid" | "due") => {
    setPaymentStatus(status);
    setShowStatusOptions(false);

    if (status === "paid" && !paidDate) {
      setPaidDate(new Date().toISOString().slice(0, 10));
    }
  };

  /*
   * SAVE PAYMENT
   */
  const handleSave = async () => {
    if (!memberId || !member) {
      return;
    }

    if (saving) {
      return;
    }

    try {
      setSaving(true);

      /*
       * Update payment record if we have a paymentId.
       */
      if (paymentId) {
        if (paymentStatus === "paid") {
          if (isEditing) {
            await editPayment(paymentId, {
              status: "paid",
              paidDate: new Date(`${paidDate}T00:00:00`).toISOString(),
            });
          } else {
            await markAsPaid(paymentId);
          }
        } else {
          /*
           * Existing payment becomes Due.
           */
          await editPayment(paymentId, {
            status: "due",
            paidDate: undefined,
          });
        }
      }

      /*
       * Save everything to the member.
       *
       * IMPORTANT:
       * Additional and deduction are saved even
       * when the payment status is Due.
       */
      updateMember(memberId, {
        paymentStatus,

        /*
         * Paid date only exists when Paid.
         */
        paidDate: paymentStatus === "paid" ? paidDate : undefined,

        /*
         * Additional amount.
         */
        additionalAmount: showAdditionalAmount ? additionalValue : 0,

        additionalNote: showAdditionalAmount
          ? additionalNote.trim() || undefined
          : undefined,

        /*
         * Deduction.
         */
        deductionAmount: showDeduction ? deductionValue : 0,

        deductionNote: showDeduction
          ? deductionNote.trim() || undefined
          : undefined,

        /*
         * Month-specific payment.
         */
        monthlyPayments: {
          ...(member.monthlyPayments || {}),

          [paymentMonth]: {
            status: paymentStatus,

            /*
             * Only save paid date for Paid.
             */
            ...(paymentStatus === "paid"
              ? {
                  paidDate,
                }
              : {}),

            /*
             * Save additional amount even
             * when status is Due.
             */
            additionalAmount: showAdditionalAmount ? additionalValue : 0,

            additionalNote: showAdditionalAmount
              ? additionalNote.trim() || undefined
              : undefined,

            /*
             * Save deduction even
             * when status is Due.
             */
            deductionAmount: showDeduction ? deductionValue : 0,

            deductionNote: showDeduction
              ? deductionNote.trim() || undefined
              : undefined,

            /*
             * Save the FINAL amount.
             *
             * Example:
             *
             * ₦2000 + ₦300 - ₦100 = ₦2200
             */
            netAmount: netPaidAmount,
          },
        },
      });

      /*
       * Go back after successful save.
       */
      router.back();
    } catch (error) {
      console.error("Failed to save payment:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Payment Details" : "Payment Details",
        }}
      />

      <View style={styles.modalCard}>
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.memberName}>{member?.name || "Member"}</Text>

          <View style={styles.paymentForRow}>
            <Text style={styles.paymentForLabel}>Payment for</Text>

            <Text style={styles.paymentForMonth}>
              {formatMonth(paymentMonth)}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          bounces
        >
          {/* BASE AMOUNT */}
          <Text style={styles.label}>
            {type === "maintenance" ? "Maintenance Amount" : "Salary Amount"}
          </Text>

          <View style={styles.amountDisplay}>
            <Text style={styles.amount}>₦{amount || 0}</Text>
          </View>

          {/* PAYMENT STATUS */}
          <Text style={styles.label}>Payment Status</Text>

          <TouchableOpacity
            style={[
              styles.statusSelector,
              paymentStatus === "paid" ? styles.statusPaid : styles.statusDue,
            ]}
            onPress={() => setShowStatusOptions((visible) => !visible)}
            activeOpacity={0.7}
          >
            <View style={styles.statusSelectorLeft}>
              <Ionicons
                name={paymentStatus === "paid" ? "checkmark-circle" : "time"}
                size={21}
                color={paymentStatus === "paid" ? "#16803a" : "#dc2626"}
              />

              <Text
                style={[
                  styles.statusSelectorText,
                  paymentStatus === "paid"
                    ? styles.statusPaidText
                    : styles.statusDueText,
                ]}
              >
                {paymentStatus === "paid" ? "Paid" : "Due"}
              </Text>
            </View>

            <Ionicons
              name={showStatusOptions ? "chevron-up" : "chevron-down"}
              size={19}
              color="#666"
            />
          </TouchableOpacity>

          {/* STATUS OPTIONS */}
          {showStatusOptions && (
            <View style={styles.statusOptions}>
              {/* PAID */}
              <TouchableOpacity
                style={[
                  styles.statusOption,
                  paymentStatus === "paid" && styles.statusOptionSelected,
                ]}
                onPress={() => selectPaymentStatus("paid")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#16803a"
                />

                <View style={styles.statusOptionInfo}>
                  <Text style={styles.statusOptionTitle}>Paid</Text>

                  <Text style={styles.statusOptionSubtitle}>
                    Payment has been received
                  </Text>
                </View>

                {paymentStatus === "paid" && (
                  <Ionicons name="checkmark" size={20} color="#16803a" />
                )}
              </TouchableOpacity>

              {/* DUE */}
              <TouchableOpacity
                style={[
                  styles.statusOption,
                  paymentStatus === "due" && styles.statusOptionSelected,
                ]}
                onPress={() => selectPaymentStatus("due")}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={20} color="#dc2626" />

                <View style={styles.statusOptionInfo}>
                  <Text style={styles.statusOptionTitle}>Due</Text>

                  <Text style={styles.statusOptionSubtitle}>
                    Payment is still pending
                  </Text>
                </View>

                {paymentStatus === "due" && (
                  <Ionicons name="checkmark" size={20} color="#dc2626" />
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* 
            ADDITIONAL AMOUNT - ALWAYS VISIBLE 
            This section appears for BOTH "Paid" and "Due" statuses
          */}
          <TouchableOpacity
            style={styles.additionalButton}
            onPress={() => setShowAdditionalAmount((visible) => !visible)}
            activeOpacity={0.7}
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
            <View style={styles.expandedSection}>
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
            </View>
          )}

          {/* 
            DEDUCTION - ALWAYS VISIBLE 
            This section appears for BOTH "Paid" and "Due" statuses
          */}
          <TouchableOpacity
            style={styles.additionalButton}
            onPress={() => setShowDeduction((visible) => !visible)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="remove-circle-outline"
              size={18}
              color={showDeduction ? "#dc2626" : "#1a73e8"}
            />

            <Text
              style={[
                styles.additionalButtonText,
                showDeduction && styles.removeAdditionalButtonText,
              ]}
            >
              {showDeduction ? "Remove deduction" : "Less deduction"}
            </Text>
          </TouchableOpacity>

          {showDeduction && (
            <View style={styles.expandedSection}>
              <TextInput
                style={styles.input}
                placeholder="Deduction amount"
                keyboardType="numeric"
                value={deductionAmount}
                onChangeText={(value) =>
                  setDeductionAmount(value.replace(/[^0-9]/g, ""))
                }
              />

              <TextInput
                style={styles.input}
                placeholder="Note, e.g. advance or absence"
                value={deductionNote}
                onChangeText={setDeductionNote}
              />
            </View>
          )}

          {/* FINAL AMOUNT */}
          <View style={styles.netAmountCard}>
            <View>
              <Text style={styles.netPaidLabel}>
                {paymentStatus === "due"
                  ? "Amount to Pay"
                  : "Total Amount Received"}
              </Text>

              <Text style={styles.netAmountHint}>
                {paymentStatus === "due"
                  ? "Flat owner needs to pay this amount"
                  : "Total amount received"}
              </Text>
            </View>

            <Text style={styles.netAmount}>₦{netPaidAmount}</Text>
          </View>

          {/* PAID DATE - Only shows when status is Paid */}
          {paymentStatus === "paid" && (
            <>
              <Text style={styles.label}>Paid Date</Text>

              <TouchableOpacity
                style={styles.dateSelector}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateText}>{paidDate}</Text>

                <Ionicons name="calendar-outline" size={19} color="#1a73e8" />
              </TouchableOpacity>
            </>
          )}

          <View style={styles.scrollBottomSpace} />
        </ScrollView>

        {/* BOTTOM BUTTONS */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveButton,
              paymentStatus === "due" && styles.saveDueButton,
              saving && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Ionicons
              name={
                paymentStatus === "paid"
                  ? "checkmark-circle-outline"
                  : "time-outline"
              }
              size={19}
              color="#fff"
            />

            <Text style={styles.saveButtonText}>
              {saving
                ? "Saving..."
                : paymentStatus === "paid"
                  ? "Save as Paid"
                  : "Save as Due"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DATE PICKER */}
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
  screen: {
    flex: 1,
    backgroundColor: "transparent",
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },

  modalCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: "#fff",
  },

  memberName: {
    color: "#555",
    fontSize: 14,
  },

  paymentForRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },

  paymentForLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
  },

  paymentForMonth: {
    color: "#1a73e8",
    fontSize: 13,
    fontWeight: "700",
  },

  scrollView: {
    flex: 1,
    backgroundColor: "#fff",
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  label: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 8,
  },

  amountDisplay: {
    backgroundColor: "#f3f7fd",
    borderRadius: 10,
    padding: 14,
  },

  amount: {
    color: "#111",
    fontSize: 17,
    fontWeight: "700",
  },

  statusSelector: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
  },

  statusPaid: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },

  statusDue: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },

  statusSelectorLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },

  statusSelectorText: {
    fontSize: 15,
    fontWeight: "700",
  },

  statusPaidText: {
    color: "#16803a",
  },

  statusDueText: {
    color: "#dc2626",
  },

  statusOptions: {
    backgroundColor: "#fff",
    borderColor: "#dbe3ee",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 6,
    overflow: "hidden",
  },

  statusOption: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 60,
    paddingHorizontal: 14,
  },

  statusOptionSelected: {
    backgroundColor: "#f8fafc",
  },

  statusOptionInfo: {
    flex: 1,
    marginLeft: 10,
  },

  statusOptionTitle: {
    color: "#222",
    fontSize: 14,
    fontWeight: "700",
  },

  statusOptionSubtitle: {
    color: "#777",
    fontSize: 12,
    marginTop: 3,
  },

  additionalButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },

  additionalButtonText: {
    color: "#1a73e8",
    fontSize: 14,
    fontWeight: "500",
  },

  removeAdditionalButtonText: {
    color: "#dc2626",
  },

  expandedSection: {
    width: "100%",
  },

  input: {
    backgroundColor: "#fff",
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    height: 48,
    marginTop: 10,
    paddingHorizontal: 12,
  },

  /*
   * Final amount card.
   */
  netAmountCard: {
    alignItems: "center",
    backgroundColor: "#f3f7fd",
    borderColor: "#dbe7f5",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  netPaidLabel: {
    color: "#333",
    fontSize: 14,
    fontWeight: "700",
  },

  netAmountHint: {
    color: "#777",
    fontSize: 11,
    marginTop: 4,
    maxWidth: 210,
  },

  netAmount: {
    color: "#111",
    fontSize: 20,
    fontWeight: "800",
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

  dateText: {
    color: "#333",
    fontSize: 14,
  },

  bottomActions: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopColor: "#eeeeee",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },

  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  cancelText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },

  saveButton: {
    alignItems: "center",
    backgroundColor: "#16803a",
    borderRadius: 8,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  saveDueButton: {
    backgroundColor: "#dc2626",
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  scrollBottomSpace: {
    height: 24,
  },
});

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

  // Current saved status
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "due">("due");

  // Selected status (temporary, changes when user selects)
  const [selectedStatus, setSelectedStatus] = useState<"paid" | "due">("due");

  const [showStatusOptions, setShowStatusOptions] = useState(false);

  const [saving, setSaving] = useState(false);

  const paymentMonth = month || new Date().toISOString().slice(0, 7);

  const attendanceRecord = member
    ? getAttendanceRecord(member.id, paymentMonth)
    : undefined;

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

  const additionalValue = showAdditionalAmount
    ? Number(additionalAmount) || 0
    : 0;

  const deductionValue = showDeduction ? Number(deductionAmount) || 0 : 0;

  const netPaidAmount = (amount || 0) + additionalValue - deductionValue;

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

    const existingStatus = paymentForMonth?.status === "paid" ? "paid" : "due";
    setPaymentStatus(existingStatus);
    setSelectedStatus(existingStatus);
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

  const selectPaymentStatus = (status: "paid" | "due") => {
    setSelectedStatus(status);
    setShowStatusOptions(false);
  };

  const handleSave = async () => {
    if (!memberId || !member) {
      return;
    }

    if (saving) {
      return;
    }

    const finalStatus = selectedStatus;

    try {
      setSaving(true);

      if (paymentId) {
        if (finalStatus === "paid") {
          if (isEditing) {
            await editPayment(paymentId, {
              status: "paid",
              paidDate: new Date(`${paidDate}T00:00:00`).toISOString(),
            });
          } else {
            await markAsPaid(paymentId);
          }
        } else {
          await editPayment(paymentId, {
            status: "due",
            paidDate: undefined,
          });
        }
      }

      updateMember(memberId, {
        paymentStatus: finalStatus,
        paidDate: finalStatus === "paid" ? paidDate : undefined,
        additionalAmount: showAdditionalAmount ? additionalValue : 0,
        additionalNote: showAdditionalAmount
          ? additionalNote.trim() || undefined
          : undefined,
        deductionAmount: showDeduction ? deductionValue : 0,
        deductionNote: showDeduction
          ? deductionNote.trim() || undefined
          : undefined,
        monthlyPayments: {
          ...(member.monthlyPayments || {}),
          [paymentMonth]: {
            status: finalStatus,
            ...(finalStatus === "paid"
              ? {
                  paidDate,
                }
              : {}),
            additionalAmount: showAdditionalAmount ? additionalValue : 0,
            additionalNote: showAdditionalAmount
              ? additionalNote.trim() || undefined
              : undefined,
            deductionAmount: showDeduction ? deductionValue : 0,
            deductionNote: showDeduction
              ? deductionNote.trim() || undefined
              : undefined,
            netAmount: netPaidAmount,
          },
        },
      });

      setPaymentStatus(finalStatus);

      router.back();
    } catch (error) {
      console.error("Failed to save payment:", error);
    } finally {
      setSaving(false);
    }
  };

  // Get status display info
  const getStatusInfo = (status: "paid" | "due") => {
    if (status === "paid") {
      return {
        label: "Paid",
        icon: "checkmark-circle",
        color: "#16a34a",
        bgColor: "#dcfce7",
        borderColor: "#86efac",
        textColor: "#15803d",
      };
    }
    return {
      label: "Due",
      icon: "time",
      color: "#dc2626",
      bgColor: "#fef2f2",
      borderColor: "#fca5a5",
      textColor: "#dc2626",
    };
  };

  const currentStatusInfo = getStatusInfo(paymentStatus);
  const selectedStatusInfo = getStatusInfo(selectedStatus);

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
            <Text style={styles.amount}>₹{amount || 0}</Text>
          </View>

          {/* PAYMENT STATUS - Improved UI */}
          <Text style={styles.label}>Payment Status</Text>

          <TouchableOpacity
            style={[
              styles.statusSelector,
              {
                backgroundColor: currentStatusInfo.bgColor,
                borderColor: currentStatusInfo.borderColor,
              },
            ]}
            onPress={() => setShowStatusOptions((visible) => !visible)}
            activeOpacity={0.7}
          >
            <View style={styles.statusSelectorLeft}>
              <View
                style={[
                  styles.statusIconContainer,
                  { backgroundColor: currentStatusInfo.color },
                ]}
              >
                <Ionicons
                  name={currentStatusInfo.icon as any}
                  size={16}
                  color="#fff"
                />
              </View>

              <Text
                style={[
                  styles.statusSelectorText,
                  { color: currentStatusInfo.textColor },
                ]}
              >
                {currentStatusInfo.label}
              </Text>
            </View>

            <View style={styles.statusSelectorRight}>
              <Text style={styles.statusChangeHint}>
                {selectedStatus !== paymentStatus ? "• Pending change" : ""}
              </Text>
              <Ionicons
                name={showStatusOptions ? "chevron-up" : "chevron-down"}
                size={20}
                color="#94a3b8"
              />
            </View>
          </TouchableOpacity>

          {/* STATUS OPTIONS - Improved UI */}
          {showStatusOptions && (
            <View style={styles.statusOptions}>
              <TouchableOpacity
                style={[
                  styles.statusOption,
                  selectedStatus === "paid" && styles.statusOptionSelected,
                ]}
                onPress={() => selectPaymentStatus("paid")}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioOuter,
                    selectedStatus === "paid" && styles.radioOuterSelected,
                  ]}
                >
                  {selectedStatus === "paid" && (
                    <View style={styles.radioInner} />
                  )}
                </View>

                <View style={styles.statusOptionContent}>
                  <View style={styles.statusOptionIconWrapper}>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#16a34a"
                    />
                  </View>
                  <View style={styles.statusOptionInfo}>
                    <Text
                      style={[
                        styles.statusOptionTitle,
                        selectedStatus === "paid" &&
                          styles.statusOptionTitlePaid,
                      ]}
                    >
                      Paid
                    </Text>
                    <Text style={styles.statusOptionSubtitle}>
                      Payment has been received
                    </Text>
                  </View>
                </View>

                {selectedStatus === "paid" && (
                  <Ionicons name="checkmark" size={18} color="#16a34a" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusOption,
                  selectedStatus === "due" && styles.statusOptionSelected,
                ]}
                onPress={() => selectPaymentStatus("due")}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioOuter,
                    selectedStatus === "due" && styles.radioOuterSelected,
                  ]}
                >
                  {selectedStatus === "due" && (
                    <View style={styles.radioInner} />
                  )}
                </View>

                <View style={styles.statusOptionContent}>
                  <View style={styles.statusOptionIconWrapper}>
                    <Ionicons name="time" size={20} color="#dc2626" />
                  </View>
                  <View style={styles.statusOptionInfo}>
                    <Text
                      style={[
                        styles.statusOptionTitle,
                        selectedStatus === "due" && styles.statusOptionTitleDue,
                      ]}
                    >
                      Due
                    </Text>
                    <Text style={styles.statusOptionSubtitle}>
                      Payment is still pending
                    </Text>
                  </View>
                </View>

                {selectedStatus === "due" && (
                  <Ionicons name="checkmark" size={18} color="#dc2626" />
                )}
              </TouchableOpacity>

              {/* Status change indicator */}
              {selectedStatus !== paymentStatus && (
                <View style={styles.statusChangeIndicator}>
                  <Ionicons
                    name="information-circle"
                    size={16}
                    color="#2563eb"
                  />
                  <Text style={styles.statusChangeIndicatorText}>
                    Status will change to "{selectedStatusInfo.label}" when you
                    save
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ADDITIONAL AMOUNT */}
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
              color={showAdditionalAmount ? "#dc2626" : "#2563EB"}
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

          {/* DEDUCTION */}
          <TouchableOpacity
            style={styles.additionalButton}
            onPress={() => setShowDeduction((visible) => !visible)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="remove-circle-outline"
              size={18}
              color={showDeduction ? "#dc2626" : "#2563EB"}
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
                {selectedStatus === "due"
                  ? "Amount to Pay"
                  : "Total Amount Received"}
              </Text>

              <Text style={styles.netAmountHint}>
                {selectedStatus === "due"
                  ? "Member needs to pay this amount"
                  : "Total amount received"}
              </Text>
            </View>

            <Text style={styles.netAmount}>₹{netPaidAmount}</Text>
          </View>

          {/* PAID DATE */}
          {selectedStatus === "paid" && (
            <>
              <Text style={styles.label}>Paid Date</Text>

              <TouchableOpacity
                style={styles.dateSelector}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateText}>{paidDate}</Text>

                <Ionicons name="calendar-outline" size={19} color="#2563EB" />
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
              selectedStatus === "due" && styles.saveDueButton,
              saving && styles.saveButtonDisabled,
              selectedStatus !== paymentStatus && styles.saveButtonHighlight,
            ]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Ionicons
              name={
                selectedStatus === "paid"
                  ? "checkmark-circle-outline"
                  : "time-outline"
              }
              size={19}
              color="#fff"
            />

            <Text style={styles.saveButtonText}>
              {saving
                ? "Saving..."
                : selectedStatus === "paid"
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

  // Status Selector - Improved
  statusSelector: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 16,
  },

  statusSelectorLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },

  statusSelectorRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  statusSelectorText: {
    fontSize: 16,
    fontWeight: "700",
  },

  statusChangeHint: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "600",
  },

  // Status Options - Improved
  statusOptions: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },

  statusOption: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  statusOptionSelected: {
    backgroundColor: "#f8fafc",
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },

  radioOuterSelected: {
    borderColor: "#2563eb",
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
  },

  statusOptionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  statusOptionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "#f1f5f9",
  },

  statusOptionInfo: {
    flex: 1,
  },

  statusOptionTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
  },

  statusOptionTitlePaid: {
    color: "#15803d",
  },

  statusOptionTitleDue: {
    color: "#dc2626",
  },

  statusOptionSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },

  statusChangeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    backgroundColor: "#f0f7ff",
  },

  statusChangeIndicatorText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },

  additionalButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },

  additionalButtonText: {
    color: "#2563EB",
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
    borderColor: "#e2e8f0",
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    height: 48,
    marginTop: 10,
    paddingHorizontal: 12,
  },

  netAmountCard: {
    alignItems: "center",
    backgroundColor: "#f3f7fd",
    borderColor: "#dbe7f5",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  netPaidLabel: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },

  netAmountHint: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 4,
    maxWidth: 210,
  },

  netAmount: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "800",
  },

  dateSelector: {
    alignItems: "center",
    borderColor: "#e2e8f0",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },

  dateText: {
    color: "#0f172a",
    fontSize: 14,
  },

  bottomActions: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopColor: "#f1f5f9",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },

  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  cancelText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },

  saveButton: {
    alignItems: "center",
    backgroundColor: "#16a34a",
    borderRadius: 10,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginLeft: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 140,
  },

  saveDueButton: {
    backgroundColor: "#dc2626",
  },

  saveButtonHighlight: {
    borderWidth: 2,
    borderColor: "#2563eb",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
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

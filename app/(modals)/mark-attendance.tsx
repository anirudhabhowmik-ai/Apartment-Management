import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useStaff } from "../../hooks/useManagement";
import { useAccountStore } from "../../store/accountStore";
import { useAttendanceStore } from "../../store/attendanceStore";
import type { AttendanceStatus } from "../../types";

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS: AttendanceStatus[] = [
  "present",
  "absent",
  "holiday",
  "weekend",
];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function pickParam(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return typeof raw === "string" ? raw : "";
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

function getDateKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Local-time weekday (0=Sun, 6=Sat). Never uses `new Date(string)`. */
function getWeekday(month: string, day: number): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, day).getDay();
}

function getDefaultStatus(month: string, day: number): AttendanceStatus {
  const weekday = getWeekday(month, day);
  return weekday === 0 || weekday === 6 ? "weekend" : "present";
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */

export default function MarkAttendanceScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    memberId?: string | string[];
    month?: string | string[];
  }>();

  const memberId = pickParam(params.memberId);
  const monthParam = pickParam(params.month);

  const attendanceMonth = useMemo(() => {
    if (/^\d{4}-\d{2}$/.test(monthParam)) return monthParam;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [monthParam]);

  const accountId = useAccountStore((state) => state.selectedAccountId);

  const { getById } = useStaff(accountId ?? null);
  const member = memberId ? getById(memberId) : undefined;

  const getRecord = useAttendanceStore((state) => state.getRecord);
  const saveRecord = useAttendanceStore((state) => state.saveRecord);

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    {},
  );
  const [selectedDay, setSelectedDay] = useState(1);
  const [payableSalary, setPayableSalary] = useState("");
  const [saving, setSaving] = useState(false);

  const totalDays = useMemo(
    () => daysInMonth(attendanceMonth),
    [attendanceMonth],
  );

  const baseSalary =
    member && "monthlySalary" in member ? Number(member.monthlySalary) || 0 : 0;

  const getStatus = (day: number): AttendanceStatus => {
    const key = getDateKey(attendanceMonth, day);
    return statuses[key] ?? getDefaultStatus(attendanceMonth, day);
  };

  const paidDays = useMemo(() => {
    let count = 0;
    for (let day = 1; day <= totalDays; day++) {
      if (getStatus(day) !== "absent") count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, attendanceMonth, totalDays]);

  const calculatedSalary = useMemo(() => {
    if (totalDays <= 0) return 0;
    return Math.round((baseSalary / totalDays) * paidDays);
  }, [baseSalary, totalDays, paidDays]);

  /* ---------------------------------------------------------------- */
  /* Load existing record when screen opens or month/id changes       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!memberId) return;
    const record = getRecord(memberId, attendanceMonth);
    setStatuses(record?.statuses ?? {});
    setPayableSalary(
      record?.payableSalary != null ? String(record.payableSalary) : "",
    );
    setSelectedDay(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceMonth, memberId]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  const setDayStatus = (status: AttendanceStatus) => {
    setStatuses((current) => ({
      ...current,
      [getDateKey(attendanceMonth, selectedDay)]: status,
    }));
  };

  const fillAllDays = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    for (let day = 1; day <= totalDays; day++) {
      next[getDateKey(attendanceMonth, day)] = status;
    }
    setStatuses(next);
  };

  const handleSave = () => {
    if (!memberId || !member) {
      Alert.alert("Missing staff", "This staff member could not be found.");
      return;
    }

    try {
      setSaving(true);
      saveRecord({
        memberId,
        month: attendanceMonth,
        statuses,
        payableSalary: payableSalary ? Number(payableSalary) : undefined,
      });
      router.back();
    } catch (error: any) {
      console.error("Failed to save attendance:", error);
      Alert.alert(
        "Save failed",
        error?.message ?? "Could not save attendance. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  if (!member) {
    return (
      <View style={styles.missingWrap}>
        <Stack.Screen options={{ title: "Staff Attendance" }} />
        <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
        <Text style={styles.missingTitle}>Staff not found</Text>
        <Text style={styles.missingSubtitle}>
          This staff member may have been removed.
        </Text>
        <TouchableOpacity
          style={styles.missingButton}
          onPress={() => router.back()}
        >
          <Text style={styles.missingButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Staff Attendance" }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.monthTitle}>{formatMonth(attendanceMonth)}</Text>

        {/* SUMMARY */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Paid days</Text>
            <Text style={styles.summaryValue}>
              {paidDays} / {totalDays}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Calculated salary</Text>
            <Text style={styles.summaryValue}>₹{calculatedSalary}</Text>
          </View>
        </View>

        {/* QUICK ACTIONS */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => fillAllDays("present")}
            activeOpacity={0.75}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={16}
              color="#15803d"
            />
            <Text style={styles.quickActionText}>All present</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => fillAllDays("absent")}
            activeOpacity={0.75}
          >
            <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
            <Text style={styles.quickActionText}>All absent</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setStatuses({})}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh-outline" size={16} color="#2563eb" />
            <Text style={styles.quickActionText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* CALENDAR */}
        <Text style={styles.sectionLabel}>Select a day</Text>

        <View style={styles.calendar}>
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const status = getStatus(day);
            const selected = selectedDay === day;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.day,
                  styles[`day${status}`],
                  selected && styles.selectedDay,
                ]}
                onPress={() => setSelectedDay(day)}
                activeOpacity={0.75}
              >
                <Text style={styles.dayNumber}>{day}</Text>
                <Text style={styles.dayStatus}>
                  {status === "present"
                    ? "P"
                    : status === "absent"
                      ? "A"
                      : status === "holiday"
                        ? "H"
                        : "W"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SELECTED DAY */}
        <Text style={styles.sectionLabel}>
          Day {selectedDay} — {getStatus(selectedDay)}
        </Text>

        <View style={styles.statusOptions}>
          {STATUS_OPTIONS.map((status) => {
            const isActive = getStatus(selectedDay) === status;
            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusButton,
                  isActive && styles.statusButtonSelected,
                ]}
                onPress={() => setDayStatus(status)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    isActive && styles.statusButtonTextSelected,
                  ]}
                >
                  {status}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SALARY */}
        <Text style={styles.sectionLabel}>Payable salary</Text>

        <TextInput
          style={styles.salaryInput}
          keyboardType="numeric"
          placeholder={`₹${calculatedSalary}`}
          placeholderTextColor="#9ca3af"
          value={payableSalary}
          onChangeText={(value) =>
            setPayableSalary(value.replace(/[^0-9]/g, ""))
          }
        />

        <Text style={styles.helperText}>
          Leave empty to use the calculated salary.
        </Text>

        {/* SAVE */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={19}
                color="#fff"
              />
              <Text style={styles.saveButtonText}>Save Attendance</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: "#fff" },

  container: {
    backgroundColor: "#fff",
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },

  memberName: { color: "#555", fontSize: 14 },

  monthTitle: {
    color: "#111",
    fontSize: 21,
    fontWeight: "700",
    marginTop: 4,
  },

  summaryRow: {
    backgroundColor: "#f3f7fd",
    borderRadius: 8,
    flexDirection: "row",
    marginTop: 20,
    padding: 16,
  },
  summaryCol: { flex: 1 },
  summaryLabel: { color: "#666", fontSize: 12 },
  summaryValue: {
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  summaryDivider: {
    backgroundColor: "#dbe3ee",
    marginHorizontal: 14,
    width: 1,
  },

  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  quickActionBtn: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickActionText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },

  sectionLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 22,
    textTransform: "uppercase",
  },

  calendar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  day: {
    alignItems: "center",
    borderRadius: 8,
    height: 46,
    justifyContent: "center",
    width: "12.5%",
  },
  daypresent: { backgroundColor: "#dcfce7" },
  dayabsent: { backgroundColor: "#fee2e2" },
  dayholiday: { backgroundColor: "#fef3c7" },
  dayweekend: { backgroundColor: "#e0e7ff" },
  selectedDay: { borderColor: "#1a73e8", borderWidth: 2 },
  dayNumber: { color: "#222", fontSize: 14, fontWeight: "700" },
  dayStatus: { color: "#555", fontSize: 10, fontWeight: "700" },

  statusOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusButton: {
    borderColor: "#dbe3ee",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusButtonSelected: {
    backgroundColor: "#e8f1ff",
    borderColor: "#1a73e8",
  },
  statusButtonText: {
    color: "#333",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  statusButtonTextSelected: { color: "#1a73e8", fontWeight: "800" },

  salaryInput: {
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    height: 50,
    paddingHorizontal: 14,
    color: "#111",
  },

  helperText: { color: "#777", fontSize: 12, marginTop: 7 },

  saveButton: {
    alignItems: "center",
    backgroundColor: "#16803a",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 28,
    paddingVertical: 14,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  bottomSpace: { height: 80 },

  missingWrap: {
    alignItems: "center",
    backgroundColor: "#fff",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  missingTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  missingSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  missingButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  missingButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

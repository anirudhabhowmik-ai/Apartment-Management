import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useStaff } from "../../hooks/useManagement";
import { useAccountStore } from "../../store/accountStore";
import { useAttendanceStore } from "../../store/attendanceStore";
import type { AttendanceStatus } from "../../types";

// ---------------------------------------------------------------------------
// Inline fetch helpers
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const MANAGEMENT_PREFIX = "/management";

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");

  const token = await getAuthToken();
  const url = `${API_BASE_URL}${MANAGEMENT_PREFIX}${path}`;
  console.log("apiGet:", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.message || `Request failed with status ${res.status}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");

  const token = await getAuthToken();
  const url = `${API_BASE_URL}${MANAGEMENT_PREFIX}${path}`;
  console.log("apiPut:", url);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.message || `Request failed with status ${res.status}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

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

function getInitialSelectedDay(month: string): number {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
  if (month === currentMonth) return now.getDate();
  return 1;
}

export default function MarkAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  const saveRecordToStore = useAttendanceStore((state) => state.saveRecord);
  const getRecord = useAttendanceStore((state) => state.getRecord);

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    {},
  );
  const [selectedDay, setSelectedDay] = useState(() =>
    getInitialSelectedDay(attendanceMonth),
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // The inline-editable calculated salary.
  const [calculatedSalaryText, setCalculatedSalaryText] = useState("");
  const [manualOverride, setManualOverride] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

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

  const autoCalculatedSalary = useMemo(() => {
    if (totalDays <= 0) return 0;
    return Math.round((baseSalary / totalDays) * paidDays);
  }, [baseSalary, totalDays, paidDays]);

  const didInitialiseRef = useRef(false);

  // When the auto value changes and the user hasn't overridden, keep the
  // displayed text in sync.
  useEffect(() => {
    if (!didInitialiseRef.current) return;
    if (manualOverride) return;
    setCalculatedSalaryText(String(autoCalculatedSalary));
  }, [autoCalculatedSalary, manualOverride]);

  // Load attendance from server whenever staff / month / account changes.
  useEffect(() => {
    if (!memberId || !accountId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{
          statuses?: Record<string, AttendanceStatus>;
          calculated_salary?: number | string | null;
          calculatedSalary?: number | string | null;
        } | null>(
          `/${accountId}/staff/${memberId}/attendance/${attendanceMonth}`,
        );

        if (cancelled) return;

        const next: Record<string, AttendanceStatus> = data?.statuses ?? {};
        setStatuses(next);

        const rawCalc =
          data?.calculated_salary ?? data?.calculatedSalary ?? null;
        const serverCalc =
          rawCalc != null && Number.isFinite(Number(rawCalc))
            ? Number(rawCalc)
            : null;

        if (serverCalc != null) {
          setCalculatedSalaryText(String(serverCalc));
          setManualOverride(true);
        } else {
          const total = daysInMonth(attendanceMonth);
          let paid = 0;
          for (let d = 1; d <= total; d++) {
            const key = getDateKey(attendanceMonth, d);
            const status = next[key] ?? getDefaultStatus(attendanceMonth, d);
            if (status !== "absent") paid++;
          }
          const auto = total > 0 ? Math.round((baseSalary / total) * paid) : 0;
          setCalculatedSalaryText(String(auto));
          setManualOverride(false);
        }

        didInitialiseRef.current = true;
        setSelectedDay(getInitialSelectedDay(attendanceMonth));
        setEditing(false);
      } catch (error: any) {
        if (cancelled) return;
        console.error("Failed to load attendance:", error);
        const cached = getRecord(memberId, attendanceMonth);
        const fallback: Record<string, AttendanceStatus> =
          cached?.statuses ?? {};
        setStatuses(fallback);

        const total = daysInMonth(attendanceMonth);
        let paid = 0;
        for (let d = 1; d <= total; d++) {
          const key = getDateKey(attendanceMonth, d);
          const status = fallback[key] ?? getDefaultStatus(attendanceMonth, d);
          if (status !== "absent") paid++;
        }
        const auto = total > 0 ? Math.round((baseSalary / total) * paid) : 0;
        setCalculatedSalaryText(String(auto));
        setManualOverride(false);

        didInitialiseRef.current = true;
        setSelectedDay(getInitialSelectedDay(attendanceMonth));
        setEditing(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, memberId, attendanceMonth]);

  const invalidateOverride = () => {
    setManualOverride(false);
  };

  const setDayStatus = (status: AttendanceStatus) => {
    setStatuses((current) => ({
      ...current,
      [getDateKey(attendanceMonth, selectedDay)]: status,
    }));
    invalidateOverride();
    setEditing(false);
  };

  const fillAllDays = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    for (let day = 1; day <= totalDays; day++) {
      next[getDateKey(attendanceMonth, day)] = status;
    }
    setStatuses(next);
    invalidateOverride();
    setEditing(false);
  };

  const handleReset = () => {
    setStatuses({});
    invalidateOverride();
    setEditing(false);
  };

  const handleSalaryTextChange = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    setCalculatedSalaryText(digits);
    setManualOverride(true);
  };

  const numericCalculatedSalary = (() => {
    const n = Number(calculatedSalaryText);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : autoCalculatedSalary;
  })();

  const startEditingSalary = () => {
    setEditing(true);
    // Let the TextInput mount, then focus it.
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const stopEditingSalary = () => {
    setEditing(false);
  };

  const handleSave = useCallback(async () => {
    if (!memberId || !member || !accountId) {
      Alert.alert("Missing staff", "This staff member could not be found.");
      return;
    }

    try {
      setSaving(true);

      const body: Record<string, unknown> = { statuses };
      // Send the value when the user has overridden it OR when the current
      // text doesn't match the auto-computed amount (covers inline edits).
      if (manualOverride || numericCalculatedSalary !== autoCalculatedSalary) {
        body.calculated_salary = numericCalculatedSalary;
      }

      await apiPut(
        `/${accountId}/staff/${memberId}/attendance/${attendanceMonth}`,
        body,
      );

      saveRecordToStore({
        memberId,
        month: attendanceMonth,
        statuses,
      });

      router.back();
    } catch (error: any) {
      console.error("Failed to save attendance:", error);
      Alert.alert(
        "Save failed",
        error?.body?.message ??
          error?.message ??
          "Could not save attendance. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    accountId,
    attendanceMonth,
    autoCalculatedSalary,
    manualOverride,
    member,
    memberId,
    numericCalculatedSalary,
    router,
    saveRecordToStore,
    statuses,
  ]);

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

  if (loading) {
    return (
      <View style={styles.missingWrap}>
        <Stack.Screen options={{ title: "Staff Attendance" }} />
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.missingSubtitle}>Loading attendance…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flexOne}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen options={{ title: "Staff Attendance" }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 24) + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.monthTitle}>{formatMonth(attendanceMonth)}</Text>

        {/* Summary row with inline-editable calculated salary ---------- */}
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

            {editing ? (
              <TextInput
                ref={inputRef}
                style={styles.summaryValueInput}
                keyboardType="numeric"
                value={calculatedSalaryText}
                onChangeText={handleSalaryTextChange}
                onBlur={stopEditingSalary}
                returnKeyType="done"
                onSubmitEditing={stopEditingSalary}
                autoFocus
              />
            ) : (
              <TouchableOpacity
                onPress={startEditingSalary}
                activeOpacity={0.7}
                style={styles.summaryValueRow}
              >
                <Text style={styles.summaryValue}>
                  ₹{calculatedSalaryText || 0}
                </Text>
                <Ionicons
                  name="pencil-outline"
                  size={14}
                  color="#1a73e8"
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.calcHint}>
          {manualOverride
            ? "Custom amount set. Change a day status to revert to auto."
            : "Tap the amount above to edit it inline."}
        </Text>

        {/* -------------------------------------------------------------- */}

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
            onPress={handleReset}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh-outline" size={16} color="#2563eb" />
            <Text style={styles.quickActionText}>Reset</Text>
          </TouchableOpacity>
        </View>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1, backgroundColor: "#fff" },
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
  summaryValueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  summaryValue: {
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  summaryValueInput: {
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#1a73e8",
    minWidth: 80,
  },
  summaryDivider: {
    backgroundColor: "#dbe3ee",
    marginHorizontal: 14,
    width: 1,
  },
  calcHint: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
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

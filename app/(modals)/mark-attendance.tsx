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
import { useAttendanceStore } from "../../store/attendanceStore";
import { useMemberStore } from "../../store/memberStore";
import { AttendanceStatus } from "../../types";

const statusOptions: AttendanceStatus[] = [
  "present",
  "absent",
  "holiday",
  "weekend",
];

const formatMonth = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

const getDateKey = (month: string, day: number) =>
  `${month}-${String(day).padStart(2, "0")}`;

const getDefaultStatus = (month: string, day: number): AttendanceStatus => {
  const weekday = new Date(`${getDateKey(month, day)}T00:00:00`).getDay();

  return weekday === 0 || weekday === 6 ? "weekend" : "present";
};

export default function MarkAttendanceScreen() {
  const router = useRouter();

  const { memberId, month } = useLocalSearchParams<{
    memberId: string;
    month?: string;
  }>();

  const attendanceMonth = month || new Date().toISOString().slice(0, 7);

  const member = useMemberStore((state) =>
    state.members.find((currentMember) => currentMember.id === memberId),
  );

  const getRecord = useAttendanceStore((state) => state.getRecord);

  const saveRecord = useAttendanceStore((state) => state.saveRecord);

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    {},
  );

  const [selectedDay, setSelectedDay] = useState(1);
  const [payableSalary, setPayableSalary] = useState("");

  const daysInMonth = new Date(
    Number(attendanceMonth.slice(0, 4)),
    Number(attendanceMonth.slice(5, 7)),
    0,
  ).getDate();

  const baseSalary =
    member && "monthlySalary" in member ? member.monthlySalary : 0;

  const getStatus = (day: number) =>
    statuses[getDateKey(attendanceMonth, day)] ||
    getDefaultStatus(attendanceMonth, day);

  const paidDays = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1,
  ).filter((day) => getStatus(day) !== "absent").length;

  const calculatedSalary = Math.round((baseSalary / daysInMonth) * paidDays);

  useEffect(() => {
    const record = getRecord(memberId, attendanceMonth);

    setStatuses(record?.statuses || {});
    setPayableSalary(record?.payableSalary?.toString() || "");
  }, [attendanceMonth, getRecord, memberId]);

  const setDayStatus = (status: AttendanceStatus) => {
    setStatuses((currentStatuses) => ({
      ...currentStatuses,
      [getDateKey(attendanceMonth, selectedDay)]: status,
    }));
  };

  const handleSave = () => {
    saveRecord({
      memberId,
      month: attendanceMonth,
      statuses,
      payableSalary: payableSalary ? Number(payableSalary) : undefined,
    });

    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: "Staff Attendance" }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.memberName}>{member?.name || "Staff member"}</Text>

        <Text style={styles.monthTitle}>{formatMonth(attendanceMonth)}</Text>

        {/* SUMMARY */}

        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Paid days</Text>

            <Text style={styles.summaryValue}>
              {paidDays} / {daysInMonth}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View>
            <Text style={styles.summaryLabel}>Calculated salary</Text>

            <Text style={styles.summaryValue}>₹{calculatedSalary}</Text>
          </View>
        </View>

        {/* CALENDAR */}

        <Text style={styles.sectionLabel}>Select a day</Text>

        <View style={styles.calendar}>
          {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
            (day) => {
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
                  activeOpacity={0.7}
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
            },
          )}
        </View>

        {/* SELECTED DAY */}

        <Text style={styles.sectionLabel}>
          Day {selectedDay}: {getStatus(selectedDay)}
        </Text>

        <View style={styles.statusOptions}>
          {statusOptions.map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusButton,
                getStatus(selectedDay) === status &&
                  styles.statusButtonSelected,
              ]}
              onPress={() => setDayStatus(status)}
              activeOpacity={0.7}
            >
              <Text style={styles.statusButtonText}>{status}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* SALARY */}

        <Text style={styles.sectionLabel}>Payable salary</Text>

        <TextInput
          style={styles.salaryInput}
          keyboardType="numeric"
          placeholder={`₹${calculatedSalary}`}
          value={payableSalary}
          onChangeText={(value) =>
            setPayableSalary(value.replace(/[^0-9]/g, ""))
          }
        />

        <Text style={styles.helperText}>
          Leave empty to use the calculated salary.
        </Text>

        {/* SAVE BUTTON */}

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />

          <Text style={styles.saveButtonText}>Save Attendance</Text>
        </TouchableOpacity>

        {/* EXTRA BOTTOM SPACE */}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#fff",
  },

  container: {
    backgroundColor: "#fff",
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },

  memberName: {
    color: "#555",
    fontSize: 14,
  },

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

  summaryLabel: {
    color: "#666",
    fontSize: 12,
  },

  summaryValue: {
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },

  summaryDivider: {
    backgroundColor: "#dbe3ee",
    marginHorizontal: 22,
    width: 1,
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

  daypresent: {
    backgroundColor: "#dcfce7",
  },

  dayabsent: {
    backgroundColor: "#fee2e2",
  },

  dayholiday: {
    backgroundColor: "#fef3c7",
  },

  dayweekend: {
    backgroundColor: "#e0e7ff",
  },

  selectedDay: {
    borderColor: "#1a73e8",
    borderWidth: 2,
  },

  dayNumber: {
    color: "#222",
    fontSize: 14,
    fontWeight: "700",
  },

  dayStatus: {
    color: "#555",
    fontSize: 10,
    fontWeight: "700",
  },

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

  salaryInput: {
    borderColor: "#dbe3ee",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    height: 50,
    paddingHorizontal: 14,
  },

  helperText: {
    color: "#777",
    fontSize: 12,
    marginTop: 7,
  },

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

  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  bottomSpace: {
    height: 80,
  },
});

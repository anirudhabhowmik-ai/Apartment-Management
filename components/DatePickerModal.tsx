import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface DatePickerModalProps {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

export default function DatePickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: DatePickerModalProps) {
  const initialDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [displayedMonth, setDisplayedMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [yearStart, setYearStart] = useState(
    Math.floor(displayedMonth.getFullYear() / 12) * 12,
  );

  useEffect(() => {
    if (!visible) return;

    const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();
    const selectedMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1,
    );
    setDisplayedMonth(selectedMonth);
    setYearStart(Math.floor(selectedMonth.getFullYear() / 12) * 12);
    setShowYearPicker(false);
  }, [visible, value]);

  const firstDay = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells = Array.from({ length: firstDay + daysInMonth });

  const selectDate = (day: number) => {
    onSelect(
      formatDate(
        new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day),
      ),
    );
    onClose();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() =>
                setDisplayedMonth(
                  new Date(
                    displayedMonth.getFullYear(),
                    displayedMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
            >
              <Text style={styles.monthButton}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setYearStart(
                  Math.floor(displayedMonth.getFullYear() / 12) * 12,
                );
                setShowYearPicker(true);
              }}
            >
              <Text style={styles.monthTitle}>
                {displayedMonth.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setDisplayedMonth(
                  new Date(
                    displayedMonth.getFullYear(),
                    displayedMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
            >
              <Text style={styles.monthButton}>›</Text>
            </TouchableOpacity>
          </View>
          {showYearPicker ? (
            <>
              <View style={styles.yearNavigation}>
                <TouchableOpacity onPress={() => setYearStart(yearStart - 12)}>
                  <Text style={styles.yearNavigationText}>Earlier</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setYearStart(yearStart + 12)}>
                  <Text style={styles.yearNavigationText}>Later</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.years}>
                {Array.from(
                  { length: 12 },
                  (_, index) => yearStart + index,
                ).map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.year,
                      year === displayedMonth.getFullYear() &&
                        styles.selectedYear,
                    ]}
                    onPress={() => {
                      setDisplayedMonth(
                        new Date(year, displayedMonth.getMonth(), 1),
                      );
                      setShowYearPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.yearText,
                        year === displayedMonth.getFullYear() &&
                          styles.selectedDayText,
                      ]}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.weekdays}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <Text key={day} style={styles.weekday}>
                      {day}
                    </Text>
                  ),
                )}
              </View>
              <View style={styles.days}>
                {calendarCells.map((_, index) => {
                  const day = index - firstDay + 1;
                  if (day < 1)
                    return <View key={`blank-${index}`} style={styles.day} />;
                  const date = formatDate(
                    new Date(
                      displayedMonth.getFullYear(),
                      displayedMonth.getMonth(),
                      day,
                    ),
                  );
                  return (
                    <TouchableOpacity
                      key={date}
                      style={[styles.day, date === value && styles.selectedDay]}
                      onPress={() => selectDate(day)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          date === value && styles.selectedDayText,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  monthButton: {
    color: "#1a73e8",
    fontSize: 30,
    lineHeight: 32,
    paddingHorizontal: 8,
  },
  monthTitle: { color: "#222", fontSize: 16, fontWeight: "700" },
  yearNavigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  yearNavigationText: { color: "#1a73e8", fontSize: 13, fontWeight: "600" },
  years: { flexDirection: "row", flexWrap: "wrap" },
  year: {
    width: "25%",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 6,
  },
  yearText: { color: "#333", fontSize: 14 },
  selectedYear: { backgroundColor: "#1a73e8" },
  weekdays: { flexDirection: "row", marginBottom: 6 },
  weekday: {
    width: "14.285%",
    textAlign: "center",
    color: "#777",
    fontSize: 12,
    fontWeight: "600",
  },
  days: { flexDirection: "row", flexWrap: "wrap" },
  day: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  dayText: { color: "#333", fontSize: 14 },
  selectedDay: { backgroundColor: "#1a73e8" },
  selectedDayText: { color: "#fff", fontWeight: "700" },
  closeButton: {
    alignSelf: "flex-end",
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeButtonText: { color: "#1a73e8", fontWeight: "700" },
});

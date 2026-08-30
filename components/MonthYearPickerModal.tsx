import { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface MonthYearPickerModalProps {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onSelect: (month: string) => void;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function MonthYearPickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: MonthYearPickerModalProps) {
  const selectedDate = value ? new Date(`${value}-01T00:00:00`) : new Date();
  const [selectedYear, setSelectedYear] = useState(selectedDate.getFullYear());
  const [showYears, setShowYears] = useState(false);
  const [yearStart, setYearStart] = useState(
    Math.floor(selectedYear / 12) * 12,
  );

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity
            onPress={() => {
              setYearStart(Math.floor(selectedYear / 12) * 12);
              setShowYears(!showYears);
            }}
          >
            <Text style={styles.yearTitle}>{selectedYear}</Text>
          </TouchableOpacity>
          {showYears ? (
            <>
              <View style={styles.yearNavigation}>
                <TouchableOpacity onPress={() => setYearStart(yearStart - 12)}>
                  <Text style={styles.navigationText}>Earlier</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setYearStart(yearStart + 12)}>
                  <Text style={styles.navigationText}>Later</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.grid}>
                {Array.from(
                  { length: 12 },
                  (_, index) => yearStart + index,
                ).map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.year,
                      year === selectedYear && styles.selected,
                    ]}
                    onPress={() => {
                      setSelectedYear(year);
                      setShowYears(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.itemText,
                        year === selectedYear && styles.selectedText,
                      ]}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.grid}>
              {MONTHS.map((month, index) => {
                const monthValue = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
                return (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.month,
                      monthValue === value && styles.selected,
                    ]}
                    onPress={() => {
                      onSelect(monthValue);
                      onClose();
                    }}
                  >
                    <Text
                      style={[
                        styles.itemText,
                        monthValue === value && styles.selectedText,
                      ]}
                    >
                      {month}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    padding: 20,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  yearTitle: {
    alignSelf: "center",
    marginBottom: 18,
    color: "#222",
    fontSize: 18,
    fontWeight: "700",
  },
  yearNavigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navigationText: { color: "#1a73e8", fontSize: 13, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  month: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 6,
  },
  year: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 6,
  },
  itemText: { color: "#333", fontSize: 14 },
  selected: { backgroundColor: "#1a73e8" },
  selectedText: { color: "#fff", fontWeight: "700" },
  closeButton: { alignSelf: "flex-end", marginTop: 14, padding: 8 },
  closeText: { color: "#1a73e8", fontWeight: "700" },
});

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface DatePickerModalProps {
  visible: boolean;
  /** Expected format: "YYYY-MM-DD" (local date, no timezone) */
  value: string;
  onClose: () => void;
  /** Emits "YYYY-MM-DD" (local date, no timezone) */
  onSelect: (value: string) => void;
}

const MONTHS = [
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

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ── Safe parsers: NEVER use new Date(string) — it's UTC and shifts days. ──
function parseLocalDate(value: string): Date {
  if (!value) return new Date();
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? new Date() : dt;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export default function DatePickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: DatePickerModalProps) {
  const initial = useMemo(() => parseLocalDate(value), [value]);

  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date>(initial);

  useEffect(() => {
    if (visible) {
      const d = parseLocalDate(value);
      setSelected(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible, value]);

  const today = useMemo(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  }, []);

  const grid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const total = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isSelected = (day: number) =>
    selected.getFullYear() === viewYear &&
    selected.getMonth() === viewMonth &&
    selected.getDate() === day;

  const isToday = (day: number) =>
    today.y === viewYear && today.m === viewMonth && today.d === day;

  const handlePickDay = (day: number) => {
    const next = new Date(viewYear, viewMonth, day);
    setSelected(next);
  };

  const handleConfirm = () => {
    onSelect(formatLocalDate(selected));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={goPrevMonth}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color="#1e293b" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity
              style={styles.navButton}
              onPress={goNextMonth}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={20} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((day, idx) => {
              if (day === null) {
                return <View key={`e-${idx}`} style={styles.cell} />;
              }
              const sel = isSelected(day);
              const tod = isToday(day);
              return (
                <TouchableOpacity
                  key={`d-${day}`}
                  style={[styles.cell, sel && styles.cellSelected]}
                  onPress={() => handlePickDay(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.cellText,
                      tod && !sel && styles.cellTextToday,
                      sel && styles.cellTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.previewRow}>
            <Ionicons name="calendar-outline" size={16} color="#2563eb" />
            <Text style={styles.previewText}>{formatLocalDate(selected)}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },

  weekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    paddingVertical: 6,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    // ensure the highlight paints a true square within the cell
    alignSelf: "center",
  },
  cellSelected: {
    backgroundColor: "#2563eb",
  },
  cellText: {
    fontSize: 14,
    // pinned line height keeps the digit vertically centered on both
    // Android and iOS, so the blue highlight looks balanced
    lineHeight: 18,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    color: "#1e293b",
    fontWeight: "600",
  },
  cellTextToday: {
    color: "#2563eb",
    fontWeight: "800",
  },
  cellTextSelected: {
    color: "#fff",
    fontWeight: "800",
  },

  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
  },
  previewText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1d4ed8",
    letterSpacing: 0.3,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  confirmButton: {
    flex: 1.3,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  confirmText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});

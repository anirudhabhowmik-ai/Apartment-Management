import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import {
  CalendarEvent,
  CalendarEventType,
  RESOURCE_OPTIONS,
  ResourceOption,
  useCalendarStore,
} from "../../store/calendarStore";
import { useAuthStore } from "../../store/useAuthStore";

// ---------------------------------------------------------------------------
// Helper to get current account and user role
// ---------------------------------------------------------------------------
function useCurrentAccountAndRole() {
  const user = useAuthStore((s) => s.user);
  const selectedAccountId = useAccountStore((s) => s.selectedAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const grants = useAccessStore((s) => s.grants);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountId = selectedAccountId ?? "";

  const role: "admin" | "owner" = useMemo(() => {
    if (!selectedAccount) return "owner";

    if (selectedAccount.ownerId === user?.id) {
      return "admin";
    }

    const grant = grants.find(
      (g) => g.accountId === accountId && g.acceptedAt && g.role === "admin",
    );
    if (grant) {
      return "admin";
    }

    return "owner";
  }, [user, selectedAccount, accountId, grants]);

  return { user, accountId, role };
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
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

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date) {
  return toDateKey(a) === toDateKey(b);
}

function buildMonthGrid(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatSelectedDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const STATUS_META: Record<
  CalendarEvent["status"],
  { label: string; color: string; bg: string }
> = {
  approved: { label: "Approved", color: "#059669", bg: "#ecfdf5" },
  pending: { label: "Pending Approval", color: "#d97706", bg: "#fef3c7" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fef2f2" },
};

export default function CalendarScreen() {
  const { user, accountId, role } = useCurrentAccountAndRole();
  const events = useCalendarStore((s) => s.events);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const editEvent = useCalendarStore((s) => s.editEvent);
  const approveEvent = useCalendarStore((s) => s.approveEvent);
  const rejectEvent = useCalendarStore((s) => s.rejectEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeView, setActiveView] = useState<"calendar" | "approvals">(
    "calendar",
  );

  // Add/Edit Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CalendarEventType>("event");
  const [resource, setResource] = useState<ResourceOption | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [eventDate, setEventDate] = useState<string>("");
  const [formError, setFormError] = useState("");

  // Reject modal states
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Delete confirmation modal states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTitle, setDeletingTitle] = useState("");

  // View details modal
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);

  // Calendar date picker for editing
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState(new Date());

  const accountEvents = useMemo(
    () => events.filter((e) => e.accountId === accountId),
    [events, accountId],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    accountEvents.forEach((e) => {
      if (e.status === "rejected" && e.createdById !== user?.id) return;
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [accountEvents, user?.id]);

  // Get all dates that have bookings (approved or pending events)
  const bookedDates = useMemo(() => {
    const dates = new Set<string>();
    accountEvents.forEach((e) => {
      if (
        e.type === "event" &&
        (e.status === "approved" || e.status === "pending")
      ) {
        dates.add(e.date);
      }
    });
    return dates;
  }, [accountEvents]);

  const pendingApprovals = useMemo(
    () => accountEvents.filter((e) => e.status === "pending"),
    [accountEvents],
  );

  const gridCells = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const selectedDateEvents = useMemo(() => {
    const list = eventsByDate.get(toDateKey(selectedDate)) ?? [];
    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === "notice" ? -1 : 1;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
  }, [eventsByDate, selectedDate]);

  const goToMonth = (delta: number) => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  const openAddModal = () => {
    setEditingEvent(null);
    setTitle("");
    setDescription("");
    setType(role === "admin" ? "notice" : "event");
    setResource(null);
    setStartTime("");
    setEndTime("");
    setEventDate(toDateKey(selectedDate));
    setFormError("");
    setShowAddModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description || "");
    setType(event.type);
    setResource(event.resource || null);
    setStartTime(event.startTime || "");
    setEndTime(event.endTime || "");
    setEventDate(event.date);
    setFormError("");
    setShowAddModal(true);
  };

  const openDatePicker = () => {
    const currentDate = eventDate ? new Date(eventDate) : new Date();
    setTempSelectedDate(currentDate);
    setShowDatePicker(true);
  };

  const selectDateFromPicker = (date: Date) => {
    setEventDate(toDateKey(date));
    setShowDatePicker(false);
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setFormError("Please enter a title");
      return;
    }
    if (type === "event" && !resource) {
      setFormError("Please select a venue for this event");
      return;
    }

    if (editingEvent) {
      editEvent(editingEvent.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        resource: type === "event" ? (resource ?? undefined) : undefined,
        date: eventDate,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
      });
    } else {
      addEvent({
        accountId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        resource: type === "event" ? (resource ?? undefined) : undefined,
        date: eventDate,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        createdById: user?.id ?? "unknown",
        createdByName: user?.name ?? "You",
        createdByPhone: user?.phone,
        createdByRole: role,
      });
    }

    setShowAddModal(false);
    setEditingEvent(null);
  };

  const confirmReject = () => {
    if (rejectingId) {
      rejectEvent(rejectingId, rejectReason);
    }
    setRejectingId(null);
    setRejectReason("");
  };

  const confirmDelete = () => {
    if (deletingId) {
      deleteEvent(deletingId);
    }
    setDeletingId(null);
    setDeletingTitle("");
  };

  const canEdit = (item: CalendarEvent) => {
    return (
      role === "admin" ||
      (item.createdById === user?.id && item.status === "pending")
    );
  };

  const canDelete = (item: CalendarEvent) => {
    return (
      role === "admin" ||
      (item.createdById === user?.id && item.status !== "approved")
    );
  };

  // Check if a date has a booking
  const isDateBooked = (dateKey: string) => {
    return bookedDates.has(dateKey);
  };

  const renderEventCard = (
    item: CalendarEvent,
    context: "day" | "approvals",
  ) => {
    const meta = STATUS_META[item.status];
    const iconName =
      item.type === "notice"
        ? "megaphone"
        : item.resource === "Gym"
          ? "barbell"
          : item.resource === "Garden / Lawn"
            ? "leaf"
            : item.resource === "Parking Area"
              ? "car"
              : "calendar";
    const iconColor = item.type === "notice" ? "#1a73e8" : "#7c3aed";
    const iconBg = item.type === "notice" ? "#e8f0fe" : "#f3e8ff";

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.eventCard}
        onPress={() => setViewingEvent(item)}
        activeOpacity={0.8}
      >
        <View style={styles.eventCardHeader}>
          <View style={[styles.eventIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={20} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{item.title}</Text>
            <View style={styles.eventMetaRow}>
              {item.resource && (
                <View style={styles.resourcePill}>
                  <Ionicons name="location" size={10} color="#475569" />
                  <Text style={styles.resourcePillText}>{item.resource}</Text>
                </View>
              )}
              {(item.startTime || item.endTime) && (
                <View style={styles.resourcePill}>
                  <Ionicons name="time" size={10} color="#475569" />
                  <Text style={styles.resourcePillText}>
                    {item.startTime}
                    {item.startTime && item.endTime ? " - " : ""}
                    {item.endTime}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusBadgeText, { color: meta.color }]}>
              {meta.label}
            </Text>
          </View>
        </View>

        {item.description ? (
          <Text style={styles.eventDescription}>{item.description}</Text>
        ) : null}

        <View style={styles.eventFooterRow}>
          <Text style={styles.eventCreatedBy}>
            {item.createdByRole === "admin"
              ? "Posted by Secretary"
              : `Requested by ${item.createdByName}`}
          </Text>

          <View style={styles.eventActionsRow}>
            {context === "approvals" &&
              role === "admin" &&
              item.status === "pending" && (
                <>
                  <TouchableOpacity
                    style={styles.rejectSmallButton}
                    onPress={() => setRejectingId(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rejectSmallButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveSmallButton}
                    onPress={() => approveEvent(item.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={styles.approveSmallButtonText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}

            {context === "day" && (
              <>
                {canEdit(item) && (
                  <TouchableOpacity
                    style={styles.editSmallButton}
                    onPress={() => openEditModal(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil-outline" size={13} color="#2563eb" />
                  </TouchableOpacity>
                )}

                {canDelete(item) && (
                  <TouchableOpacity
                    style={styles.deleteSmallButton}
                    onPress={() => {
                      setDeletingId(item.id);
                      setDeletingTitle(item.title);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={13} color="#dc2626" />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {item.status === "rejected" && item.rejectionReason && (
          <View style={styles.rejectionReasonBox}>
            <Ionicons name="information-circle" size={13} color="#dc2626" />
            <Text style={styles.rejectionReasonText}>
              {item.rejectionReason}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>
            Society notices, events & bookings in one place
          </Text>
        </View>

        {role === "admin" && (
          <View style={styles.tabSwitcher}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeView === "calendar" && styles.tabButtonActive,
              ]}
              onPress={() => setActiveView("calendar")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="calendar"
                size={15}
                color={activeView === "calendar" ? "#1a73e8" : "#94a3b8"}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  activeView === "calendar" && styles.tabButtonTextActive,
                ]}
              >
                Calendar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeView === "approvals" && styles.tabButtonActive,
              ]}
              onPress={() => setActiveView("approvals")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="checkmark-done"
                size={15}
                color={activeView === "approvals" ? "#1a73e8" : "#94a3b8"}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  activeView === "approvals" && styles.tabButtonTextActive,
                ]}
              >
                Approvals
              </Text>
              {pendingApprovals.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {pendingApprovals.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {activeView === "calendar" ? (
          <>
            <View style={styles.monthNavRow}>
              <TouchableOpacity
                onPress={() => goToMonth(-1)}
                style={styles.monthNavButton}
              >
                <Ionicons name="chevron-back" size={20} color="#1a73e8" />
              </TouchableOpacity>
              <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
                <Text style={styles.monthLabel}>
                  {MONTH_NAMES[currentMonth.getMonth()]}{" "}
                  {currentMonth.getFullYear()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => goToMonth(1)}
                style={styles.monthNavButton}
              >
                <Ionicons name="chevron-forward" size={20} color="#1a73e8" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarCard}>
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((w, i) => (
                  <View key={`${w}_${i}`} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{w}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.gridWrap}>
                {gridCells.map((date, idx) => {
                  if (!date) {
                    return <View key={`blank_${idx}`} style={styles.dayCell} />;
                  }
                  const dateKey = toDateKey(date);
                  const dayEvents = eventsByDate.get(dateKey) ?? [];
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, new Date());
                  const isBooked = isDateBooked(dateKey);

                  const hasNotice = dayEvents.some((e) => e.type === "notice");
                  const hasApprovedEvent = dayEvents.some(
                    (e) => e.type === "event" && e.status === "approved",
                  );
                  const hasPendingEvent = dayEvents.some(
                    (e) => e.status === "pending",
                  );

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      style={styles.dayCell}
                      onPress={() => setSelectedDate(date)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isSelected && styles.dayCircleSelected,
                          !isSelected && isToday && styles.dayCircleToday,
                          isBooked && !isSelected && styles.dayCircleBooked,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNumber,
                            isSelected && styles.dayNumberSelected,
                            !isSelected && isToday && styles.dayNumberToday,
                            isBooked && !isSelected && styles.dayNumberBooked,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </View>
                      <View style={styles.dotsRow}>
                        {hasNotice && (
                          <View
                            style={[styles.dot, { backgroundColor: "#1a73e8" }]}
                          />
                        )}
                        {hasApprovedEvent && (
                          <View
                            style={[styles.dot, { backgroundColor: "#059669" }]}
                          />
                        )}
                        {hasPendingEvent && (
                          <View
                            style={[styles.dot, { backgroundColor: "#d97706" }]}
                          />
                        )}
                      </View>
                      {isBooked && (
                        <View style={styles.bookedIndicator}>
                          <Text style={styles.bookedIndicatorText}>•</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: "#1a73e8" }]} />
                <Text style={styles.legendText}>Notice</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: "#059669" }]} />
                <Text style={styles.legendText}>Approved Event</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: "#d97706" }]} />
                <Text style={styles.legendText}>Pending Approval</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendBookedDot,
                    { backgroundColor: "#fef3c7" },
                  ]}
                />
                <Text style={styles.legendText}>Booked Date</Text>
              </View>
            </View>

            <View style={styles.selectedDateSection}>
              <Text style={styles.selectedDateLabel}>
                {formatSelectedDate(selectedDate)}
              </Text>

              {selectedDateEvents.length === 0 ? (
                <View style={styles.emptyDayBox}>
                  <Ionicons name="calendar-outline" size={32} color="#cbd5e1" />
                  <Text style={styles.emptyDayText}>
                    Nothing scheduled for this day
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {selectedDateEvents.map((e) => renderEventCard(e, "day"))}
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={styles.selectedDateSection}>
            <Text style={styles.selectedDateLabel}>
              Pending Booking Requests
            </Text>
            {pendingApprovals.length === 0 ? (
              <View style={styles.emptyDayBox}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={32}
                  color="#cbd5e1"
                />
                <Text style={styles.emptyDayText}>No pending requests</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {[...pendingApprovals]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((e) => (
                    <View key={e.id}>
                      <Text style={styles.approvalDateLabel}>
                        {new Date(e.date).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                      {renderEventCard(e, "approvals")}
                    </View>
                  ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB Button */}
      {activeView === "calendar" && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openAddModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddModal(false);
          setEditingEvent(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setShowAddModal(false);
              setEditingEvent(null);
            }}
          />
          <View style={styles.addModalCard}>
            <View style={styles.modalHandle} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.addModalTitle}>
                {editingEvent
                  ? "Edit Event"
                  : role === "admin"
                    ? "Add to Calendar"
                    : "Request Event Booking"}
              </Text>

              {/* Date Picker Field */}
              <Text style={styles.fieldLabel}>Date *</Text>
              <TouchableOpacity
                style={styles.dateInputField}
                onPress={openDatePicker}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={20} color="#1a73e8" />
                <Text style={styles.dateInputText}>
                  {eventDate
                    ? new Date(eventDate).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Select date"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {role === "admin" && (
                <View style={styles.typeSwitcher}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      type === "notice" && styles.typeButtonActive,
                    ]}
                    onPress={() => setType("notice")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="megaphone"
                      size={15}
                      color={type === "notice" ? "#1a73e8" : "#94a3b8"}
                    />
                    <Text
                      style={[
                        styles.typeButtonText,
                        type === "notice" && styles.typeButtonTextActive,
                      ]}
                    >
                      Notice
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      type === "event" && styles.typeButtonActive,
                    ]}
                    onPress={() => setType("event")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="calendar"
                      size={15}
                      color={type === "event" ? "#1a73e8" : "#94a3b8"}
                    />
                    <Text
                      style={[
                        styles.typeButtonText,
                        type === "event" && styles.typeButtonTextActive,
                      ]}
                    >
                      Event
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder={
                  type === "notice"
                    ? "e.g. Water tank cleaning"
                    : "e.g. Birthday Party"
                }
                placeholderTextColor="#999"
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setFormError("");
                }}
              />

              {type === "event" && (
                <>
                  <Text style={styles.fieldLabel}>Venue</Text>
                  <View style={styles.resourceChipsRow}>
                    {RESOURCE_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.resourceChip,
                          resource === opt && styles.resourceChipActive,
                        ]}
                        onPress={() => {
                          setResource(opt);
                          setFormError("");
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.resourceChipText,
                            resource === opt && styles.resourceChipTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.timeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Start Time</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 6:00 PM"
                        placeholderTextColor="#999"
                        value={startTime}
                        onChangeText={setStartTime}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>End Time</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 9:00 PM"
                        placeholderTextColor="#999"
                        value={endTime}
                        onChangeText={setEndTime}
                      />
                    </View>
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Add any extra details..."
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              {formError ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color="#e53935" />
                  <Text style={styles.error}>{formError}</Text>
                </View>
              ) : null}

              {role === "owner" && type === "event" && !editingEvent && (
                <View style={styles.infoBox}>
                  <Ionicons
                    name="information-circle"
                    size={16}
                    color="#1a73e8"
                  />
                  <Text style={styles.infoBoxText}>
                    This request will be sent to your secretary for approval
                    before it's confirmed.
                  </Text>
                </View>
              )}

              <View style={styles.addModalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setShowAddModal(false);
                    setEditingEvent(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSubmitButton}
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalSubmitText}>
                    {editingEvent
                      ? "Save Changes"
                      : role === "admin"
                        ? "Add"
                        : "Request Booking"}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setShowDatePicker(false)}
        >
          <Pressable style={styles.datePickerCard} onPress={() => {}}>
            <Text style={styles.datePickerTitle}>Select Date</Text>

            {/* Mini calendar for date selection */}
            <View style={styles.miniCalendarHeader}>
              <TouchableOpacity
                onPress={() => {
                  const newDate = new Date(tempSelectedDate);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setTempSelectedDate(newDate);
                }}
                style={styles.miniNavButton}
              >
                <Ionicons name="chevron-back" size={20} color="#1a73e8" />
              </TouchableOpacity>
              <Text style={styles.miniMonthLabel}>
                {MONTH_NAMES[tempSelectedDate.getMonth()]}{" "}
                {tempSelectedDate.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const newDate = new Date(tempSelectedDate);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setTempSelectedDate(newDate);
                }}
                style={styles.miniNavButton}
              >
                <Ionicons name="chevron-forward" size={20} color="#1a73e8" />
              </TouchableOpacity>
            </View>

            <View style={styles.miniWeekdayRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={styles.miniWeekdayText}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.miniGridWrap}>
              {buildMonthGrid(tempSelectedDate).map((date, idx) => {
                if (!date) {
                  return (
                    <View key={`blank_${idx}`} style={styles.miniDayCell} />
                  );
                }
                const dateKey = toDateKey(date);
                const isSelected = dateKey === eventDate;
                const isToday = isSameDay(date, new Date());
                const isBooked = isDateBooked(dateKey);

                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={styles.miniDayCell}
                    onPress={() => selectDateFromPicker(date)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.miniDayCircle,
                        isSelected && styles.miniDayCircleSelected,
                        !isSelected && isToday && styles.miniDayCircleToday,
                        isBooked && !isSelected && styles.miniDayCircleBooked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniDayNumber,
                          isSelected && styles.miniDayNumberSelected,
                          !isSelected && isToday && styles.miniDayNumberToday,
                          isBooked && !isSelected && styles.miniDayNumberBooked,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                    {isBooked && (
                      <View style={styles.miniBookedIndicator}>
                        <Text style={styles.miniBookedIndicatorText}>•</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.datePickerActions}>
              <TouchableOpacity
                style={styles.datePickerCancelButton}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.datePickerConfirmButton}
                onPress={() => {
                  setEventDate(toDateKey(tempSelectedDate));
                  setShowDatePicker(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.datePickerConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* View Event Details Modal */}
      <Modal
        visible={viewingEvent !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingEvent(null)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setViewingEvent(null)}
        >
          <Pressable style={styles.modalCardCenter} onPress={() => {}}>
            {viewingEvent && (
              <>
                <View style={styles.viewHeader}>
                  <View style={styles.viewIconContainer}>
                    <Ionicons
                      name={
                        viewingEvent.type === "notice"
                          ? "megaphone"
                          : "calendar"
                      }
                      size={24}
                      color={
                        viewingEvent.type === "notice" ? "#1a73e8" : "#7c3aed"
                      }
                    />
                  </View>
                  <View style={styles.viewStatusBadge}>
                    <Text
                      style={[
                        styles.viewStatusText,
                        { color: STATUS_META[viewingEvent.status].color },
                      ]}
                    >
                      {STATUS_META[viewingEvent.status].label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.viewTitle}>{viewingEvent.title}</Text>

                {viewingEvent.resource && (
                  <View style={styles.viewDetailRow}>
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color="#64748b"
                    />
                    <Text style={styles.viewDetailText}>
                      {viewingEvent.resource}
                    </Text>
                  </View>
                )}

                <View style={styles.viewDetailRow}>
                  <Ionicons name="calendar-outline" size={18} color="#64748b" />
                  <Text style={styles.viewDetailText}>
                    {new Date(viewingEvent.date).toLocaleDateString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </View>

                {viewingEvent.startTime && (
                  <View style={styles.viewDetailRow}>
                    <Ionicons name="time-outline" size={18} color="#64748b" />
                    <Text style={styles.viewDetailText}>
                      {viewingEvent.startTime}
                      {viewingEvent.endTime ? ` - ${viewingEvent.endTime}` : ""}
                    </Text>
                  </View>
                )}

                {viewingEvent.description && (
                  <View style={styles.viewDescriptionBox}>
                    <Text style={styles.viewDescriptionLabel}>Description</Text>
                    <Text style={styles.viewDescriptionText}>
                      {viewingEvent.description}
                    </Text>
                  </View>
                )}

                <View style={styles.viewFooter}>
                  <Text style={styles.viewCreatedBy}>
                    {viewingEvent.createdByRole === "admin"
                      ? "Posted by Secretary"
                      : `Requested by ${viewingEvent.createdByName}`}
                  </Text>
                  {viewingEvent.createdAt && (
                    <Text style={styles.viewCreatedAt}>
                      {new Date(viewingEvent.createdAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>

                {viewingEvent.status === "rejected" &&
                  viewingEvent.rejectionReason && (
                    <View style={styles.rejectionReasonBox}>
                      <Ionicons
                        name="information-circle"
                        size={13}
                        color="#dc2626"
                      />
                      <Text style={styles.rejectionReasonText}>
                        {viewingEvent.rejectionReason}
                      </Text>
                    </View>
                  )}

                <TouchableOpacity
                  style={styles.viewCloseButton}
                  onPress={() => setViewingEvent(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewCloseButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reject reason modal */}
      <Modal
        visible={rejectingId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingId(null)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setRejectingId(null)}
        >
          <Pressable style={styles.modalCardCenter} onPress={() => {}}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="close-circle" size={36} color="#dc2626" />
            </View>
            <Text style={styles.modalTitle}>Reject this request?</Text>
            <Text style={styles.modalMessage}>
              Optionally let the owner know why, so they understand the
              decision.
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { width: "100%" }]}
              placeholder="Reason (optional)"
              placeholderTextColor="#999"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={2}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmReject}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={14} color="#ffffff" />
                <Text style={styles.modalConfirmText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={deletingId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeletingId(null)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setDeletingId(null)}
        >
          <Pressable style={styles.modalCardCenter} onPress={() => {}}>
            <View style={styles.deleteIconCircle}>
              <Ionicons name="trash-outline" size={32} color="#dc2626" />
            </View>
            <Text style={styles.modalTitle}>Delete "{deletingTitle}"?</Text>
            <Text style={styles.modalMessage}>
              This action cannot be undone. Are you sure you want to delete this
              item?
            </Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setDeletingId(null);
                  setDeletingTitle("");
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={confirmDelete}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#ffffff" />
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { padding: 16, paddingBottom: 100 },

  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  subtitle: { fontSize: 13.5, color: "#64748b" },

  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: "#eef1f6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: "#ffffff",
    boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.06)",
  },
  tabButtonText: { fontSize: 13.5, fontWeight: "700", color: "#94a3b8" },
  tabButtonTextActive: { color: "#1a73e8" },
  tabBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  monthNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  monthLabel: { fontSize: 16, fontWeight: "800", color: "#0f172a" },

  calendarCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
  },
  weekdayRow: { flexDirection: "row", marginBottom: 6 },
  weekdayCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
  weekdayText: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },

  gridWrap: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.85,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  dayCircleSelected: { backgroundColor: "#1a73e8" },
  dayCircleToday: { borderWidth: 1.5, borderColor: "#1a73e8" },
  dayCircleBooked: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  dayNumber: { fontSize: 13.5, fontWeight: "600", color: "#334155" },
  dayNumberSelected: { color: "#ffffff", fontWeight: "800" },
  dayNumberToday: { color: "#1a73e8", fontWeight: "800" },
  dayNumberBooked: { color: "#92400e" },
  dotsRow: { flexDirection: "row", gap: 3, marginTop: 4, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },

  bookedIndicator: {
    position: "absolute",
    bottom: 2,
    right: 4,
  },
  bookedIndicatorText: {
    fontSize: 8,
    color: "#f59e0b",
    fontWeight: "bold",
  },

  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontSize: 11.5, color: "#64748b", fontWeight: "600" },
  legendBookedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },

  selectedDateSection: { marginTop: 18 },
  selectedDateLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  approvalDateLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 6,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  emptyDayBox: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    gap: 8,
  },
  emptyDayText: { fontSize: 13, color: "#94a3b8" },

  eventCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
  },
  eventCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  eventIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  eventTitle: { fontSize: 14.5, fontWeight: "700", color: "#0f172a" },
  eventMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  resourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  resourcePillText: { fontSize: 10.5, color: "#475569", fontWeight: "600" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  eventDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginTop: 8,
  },
  eventFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  eventCreatedBy: { fontSize: 11, color: "#94a3b8", fontWeight: "600" },
  eventActionsRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  editSmallButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },

  rejectSmallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  rejectSmallButtonText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#dc2626",
  },
  approveSmallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#059669",
  },
  approveSmallButtonText: { fontSize: 11.5, fontWeight: "700", color: "#fff" },
  deleteSmallButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#fff5f5",
    justifyContent: "center",
    alignItems: "center",
  },
  rejectionReasonBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  rejectionReasonText: {
    fontSize: 11.5,
    color: "#b91c1c",
    flex: 1,
    lineHeight: 16,
  },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "0px 4px 10px rgba(26, 115, 232, 0.35)",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 14,
  },
  addModalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    maxHeight: SCREEN_WIDTH * 1.6,
  },
  addModalTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },

  dateInputField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    marginBottom: 12,
    gap: 10,
  },
  dateInputText: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
  },

  typeSwitcher: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  typeButtonActive: {
    backgroundColor: "#ffffff",
    boxShadow: "0px 1px 3px rgba(0,0,0,0.06)",
  },
  typeButtonText: { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  typeButtonTextActive: { color: "#1a73e8" },

  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14.5,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  textArea: { height: 80, textAlignVertical: "top" },

  resourceChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  resourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  resourceChipActive: { backgroundColor: "#eff6ff", borderColor: "#1a73e8" },
  resourceChipText: { fontSize: 12.5, fontWeight: "600", color: "#64748b" },
  resourceChipTextActive: { color: "#1a73e8" },

  timeRow: { flexDirection: "row", gap: 10 },

  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 6,
  },
  error: { color: "#dc2626", fontSize: 13, fontWeight: "500" },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  infoBoxText: { flex: 1, fontSize: 12, color: "#1a73e8", lineHeight: 16 },

  addModalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  modalSubmitButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#1a73e8",
  },
  modalSubmitText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },

  // Date Picker Modal Styles
  datePickerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 16,
  },
  miniCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  miniNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  miniMonthLabel: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  miniWeekdayRow: { flexDirection: "row", marginBottom: 6 },
  miniWeekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
  miniGridWrap: { flexDirection: "row", flexWrap: "wrap" },
  miniDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  miniDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  miniDayCircleSelected: { backgroundColor: "#1a73e8" },
  miniDayCircleToday: { borderWidth: 1.5, borderColor: "#1a73e8" },
  miniDayCircleBooked: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  miniDayNumber: { fontSize: 13, fontWeight: "600", color: "#334155" },
  miniDayNumberSelected: { color: "#ffffff", fontWeight: "700" },
  miniDayNumberToday: { color: "#1a73e8", fontWeight: "700" },
  miniDayNumberBooked: { color: "#92400e" },
  miniBookedIndicator: {
    position: "absolute",
    bottom: 1,
    right: 3,
  },
  miniBookedIndicatorText: {
    fontSize: 6,
    color: "#f59e0b",
    fontWeight: "bold",
  },
  datePickerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  datePickerCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  datePickerCancelText: { fontSize: 14, fontWeight: "600", color: "#475569" },
  datePickerConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1a73e8",
    alignItems: "center",
  },
  datePickerConfirmText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },

  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCardCenter: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 10,
    boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.15)",
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 6,
  },

  modalConfirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    gap: 6,
  },
  modalConfirmText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },

  deleteIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  deleteConfirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    gap: 6,
  },
  deleteConfirmText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },

  // View Event Modal Styles
  viewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  viewIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  viewStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  viewStatusText: { fontSize: 12, fontWeight: "700" },
  viewTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
  },
  viewDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 6,
  },
  viewDetailText: { fontSize: 14, color: "#334155", fontWeight: "500" },
  viewDescriptionBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  viewDescriptionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 4,
  },
  viewDescriptionText: { fontSize: 14, color: "#334155", lineHeight: 20 },
  viewFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  viewCreatedBy: { fontSize: 12, color: "#94a3b8", fontWeight: "600" },
  viewCreatedAt: { fontSize: 11, color: "#cbd5e1" },
  viewCloseButton: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    marginTop: 12,
  },
  viewCloseButtonText: { fontSize: 14, fontWeight: "700", color: "#475569" },
});

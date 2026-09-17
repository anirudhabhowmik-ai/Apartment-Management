import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUserRole } from "../../hooks/useUserRole";
import { useAccountStore } from "../../store/accountStore";
import {
  CalendarEvent,
  CalendarEventType,
  RESOURCE_OPTIONS,
  ResourceOption,
  useCalendarStore,
} from "../../store/calendarStore";
import { useAuthStore } from "../../store/useAuthStore";

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

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

const STATUS_META: Record<
  CalendarEvent["status"],
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  approved: {
    label: "Approved",
    color: "#059669",
    bg: "#ecfdf5",
    icon: "checkmark-circle",
  },
  pending: {
    label: "Pending",
    color: "#d97706",
    bg: "#fef3c7",
    icon: "time",
  },
  rejected: {
    label: "Rejected",
    color: "#dc2626",
    bg: "#fef2f2",
    icon: "close-circle",
  },
};

const ROLE_META: Record<string, { label: string; color: string; bg: string }> =
  {
    admin: { label: "Admin", color: "#1a73e8", bg: "#eff6ff" },
    owner: { label: "Owner", color: "#7c3aed", bg: "#f3e8ff" },
    member: { label: "Member", color: "#0891b2", bg: "#ecfeff" },
  };

const TYPE_META: Record<
  CalendarEventType,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  notice: {
    label: "Notice",
    color: "#1a73e8",
    bg: "#e8f0fe",
    icon: "megaphone",
  },
  event: {
    label: "Event",
    color: "#7c3aed",
    bg: "#f3e8ff",
    icon: "calendar",
  },
};

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

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

function formatDdMmYyyy(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatLongDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPhoneForDisplay(raw?: string | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return String(raw);
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

/* ========================================================================== */
/* SCREEN                                                                     */
/* ========================================================================== */

export default function CalendarScreen() {
  const { isAdmin, isMember, userMemberProfile } = useUserRole();

  const canApprove = isAdmin || (userMemberProfile as any)?.role === "owner";

  const user = useAuthStore((s) => s.user);
  const accountId = useAccountStore((s) => s.selectedAccountId) ?? "";

  const canOpenAddModal = isAdmin || isMember;

  const events = useCalendarStore((s) => s.events);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const editEvent = useCalendarStore((s) => s.editEvent);
  const approveEvent = useCalendarStore((s) => s.approveEvent);
  const rejectEvent = useCalendarStore((s) => s.rejectEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const respondToEvent = useCalendarStore((s) => s.respondToEvent);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeView, setActiveView] = useState<"calendar" | "approvals">(
    "calendar",
  );

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
  const [isImportant, setIsImportant] = useState(false);
  const [rsvpEnabled, setRsvpEnabled] = useState(false);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTitle, setDeletingTitle] = useState("");

  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [rsvpReasonMode, setRsvpReasonMode] = useState<
    null | "accept" | "reject"
  >(null);
  const [rsvpReason, setRsvpReason] = useState("");

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
      if (!!a.isImportant !== !!b.isImportant) return a.isImportant ? -1 : 1;
      if (a.type !== b.type) return a.type === "notice" ? -1 : 1;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
  }, [eventsByDate, selectedDate]);

  /* ------------------------------------------------------------------------ */
  /* NAVIGATION                                                               */
  /* ------------------------------------------------------------------------ */

  const goToMonth = (delta: number) => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  /* ------------------------------------------------------------------------ */
  /* ADD / EDIT                                                               */
  /* ------------------------------------------------------------------------ */

  const openAddModal = () => {
    if (!canOpenAddModal) return;

    setEditingEvent(null);
    setTitle("");
    setDescription("");
    setType(isAdmin ? "notice" : "event");
    setResource(null);
    setStartTime("");
    setEndTime("");
    setEventDate(toDateKey(selectedDate));
    setFormError("");
    setIsImportant(false);
    setRsvpEnabled(false);
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
    setIsImportant(!!event.isImportant);
    setRsvpEnabled(!!event.rsvpEnabled);
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

  const getPosterRole = (): "admin" | "owner" | "member" => {
    if (isAdmin) return "admin";
    const role = (userMemberProfile as any)?.role;
    if (role === "owner") return "owner";
    return "member";
  };

  const handleSubmit = () => {
    if (!canOpenAddModal) return;

    if (!title.trim()) {
      setFormError("Please enter a title");
      return;
    }
    if (type === "event" && !resource) {
      setFormError("Please select a venue for this event");
      return;
    }
    if (type === "notice" && !isAdmin) {
      setFormError("Only admins and owners can post notices");
      return;
    }

    const posterRole = getPosterRole();
    const posterName =
      posterRole === "member"
        ? userMemberProfile?.name || "Member"
        : posterRole === "owner"
          ? (userMemberProfile as any)?.name || "Owner"
          : "Admin";

    if (editingEvent) {
      editEvent(editingEvent.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        resource: type === "event" ? (resource ?? undefined) : undefined,
        date: eventDate,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        isImportant,
        rsvpEnabled,
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
        createdByName: posterName,
        createdByPhone: user?.phone,
        createdByRole: posterRole,
        isImportant,
        rsvpEnabled,
      });
    }

    setShowAddModal(false);
    setEditingEvent(null);
  };

  /* ------------------------------------------------------------------------ */
  /* APPROVE / REJECT / DELETE                                                */
  /* ------------------------------------------------------------------------ */

  const approverRole = isAdmin ? "admin" : "owner";
  const approverName = isAdmin
    ? "Admin"
    : (userMemberProfile as any)?.name || "Owner";

  const handleApprove = (id: string) => {
    approveEvent(id, {
      approvedById: user?.id ?? "unknown",
      approvedByName: approverName,
      approvedByPhone: user?.phone,
      approvedByRole: approverRole,
    });
  };

  const confirmReject = () => {
    if (rejectingId) {
      rejectEvent(rejectingId, rejectReason, {
        approvedById: user?.id ?? "unknown",
        approvedByName: approverName,
        approvedByPhone: user?.phone,
        approvedByRole: approverRole,
      });
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

  const canEdit = (item: CalendarEvent) =>
    isAdmin || (item.createdById === user?.id && item.status === "pending");

  const canDelete = (item: CalendarEvent) =>
    isAdmin || (item.createdById === user?.id && item.status !== "approved");

  const isDateBooked = (dateKey: string) => bookedDates.has(dateKey);

  /* ------------------------------------------------------------------------ */
  /* CONTACT ACTIONS                                                          */
  /* ------------------------------------------------------------------------ */

  const isOwnPost = (item: CalendarEvent) => item.createdById === user?.id;

  const callNumber = (raw?: string | null) => {
    if (!raw) return;
    const digits = String(raw).replace(/\D/g, "");
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    if (ten.length !== 10) {
      Alert.alert("Invalid number", "This phone number looks incomplete.");
      return;
    }
    Linking.openURL(`tel:+91${ten}`).catch(() => {
      Alert.alert("Cannot call", "Unable to open the phone dialer.");
    });
  };

  /* ------------------------------------------------------------------------ */
  /* RSVP RESPOND                                                             */
  /* ------------------------------------------------------------------------ */

  const openRsvpReason = (mode: "accept" | "reject") => {
    setRsvpReason("");
    setRsvpReasonMode(mode);
  };

  const confirmRsvp = () => {
    if (!viewingEvent || !rsvpReasonMode) return;

    respondToEvent(viewingEvent.id, {
      userId: user?.id ?? "unknown",
      name: userMemberProfile?.name || user?.phone || "User",
      phone: user?.phone,
      role: getPosterRole(),
      response: rsvpReasonMode,
      reason: rsvpReasonMode === "reject" ? rsvpReason : undefined,
      note: rsvpReasonMode === "accept" ? rsvpReason : undefined,
      at: new Date().toISOString(),
    });

    const updated = useCalendarStore
      .getState()
      .events.find((e) => e.id === viewingEvent.id);
    if (updated) setViewingEvent(updated);

    setRsvpReasonMode(null);
    setRsvpReason("");
  };

  /* ------------------------------------------------------------------------ */
  /* EVENT CARD                                                               */
  /* ------------------------------------------------------------------------ */

  const renderEventCard = (
    item: CalendarEvent,
    context: "day" | "approvals",
  ) => {
    const meta = STATUS_META[item.status];
    const roleMeta =
      ROLE_META[item.createdByRole ?? "member"] ?? ROLE_META.member;

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

    const own = isOwnPost(item);
    const acceptedCount =
      item.responses?.filter((r) => r.response === "accept").length ?? 0;
    const rejectedCount =
      item.responses?.filter((r) => r.response === "reject").length ?? 0;

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.eventCard,
          item.isImportant && styles.eventCardImportant,
        ]}
        onPress={() => setViewingEvent(item)}
        activeOpacity={0.85}
      >
        {/* Top row: icon + title + important + approved */}
        <View style={styles.cardTopRow}>
          <View style={[styles.eventIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={18} color={iconColor} />
          </View>

          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>

          {item.isImportant ? (
            <View style={styles.importantBadge}>
              <Ionicons name="flame" size={10} color="#b91c1c" />
              <Text style={styles.importantBadgeText}>Important</Text>
            </View>
          ) : null}

          <View
            style={[styles.approvedBadgeSmall, { backgroundColor: meta.bg }]}
          >
            <Ionicons name={meta.icon} size={11} color={meta.color} />
            <Text
              style={[styles.approvedBadgeSmallText, { color: meta.color }]}
            >
              {item.status === "approved" ? "Approved" : meta.label}
            </Text>
          </View>
        </View>

        {/* Poster row — role badge, tappable phone (not for own), date badge */}
        <View style={styles.metaRow}>
          <View style={[styles.roleBadge, { backgroundColor: roleMeta.bg }]}>
            <Text style={[styles.roleBadgeText, { color: roleMeta.color }]}>
              {roleMeta.label}
            </Text>
          </View>

          {item.createdByPhone ? (
            own ? (
              <Text style={styles.metaPhonePlain}>
                {formatPhoneForDisplay(item.createdByPhone)}
              </Text>
            ) : (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  callNumber(item.createdByPhone);
                }}
                style={styles.phonePill}
                activeOpacity={0.75}
                hitSlop={6}
              >
                <Ionicons name="call" size={10} color="#1a73e8" />
                <Text style={styles.phonePillText}>
                  {formatPhoneForDisplay(item.createdByPhone)}
                </Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>

        {/* Date badge — small, content-sized, follows the phone */}
        <View style={styles.dateBadge}>
          <Ionicons name="calendar-outline" size={11} color="#334155" />
          <Text style={styles.dateBadgeText}>{formatDdMmYyyy(item.date)}</Text>
        </View>

        {/* Schedule + RSVP counters */}
        <View style={styles.cardBottomRow}>
          <View style={styles.pillRow}>
            {(item.startTime || item.endTime) && (
              <View style={styles.pill}>
                <Ionicons name="time" size={10} color="#475569" />
                <Text style={styles.pillText}>
                  {item.startTime}
                  {item.startTime && item.endTime ? " - " : ""}
                  {item.endTime}
                </Text>
              </View>
            )}

            {item.resource && (
              <View style={styles.pill}>
                <Ionicons name="location" size={10} color="#475569" />
                <Text style={styles.pillText}>{item.resource}</Text>
              </View>
            )}
          </View>

          {item.rsvpEnabled && (acceptedCount > 0 || rejectedCount > 0) ? (
            <View style={styles.rsvpCountsRow}>
              <View style={styles.rsvpChip}>
                <Ionicons name="checkmark" size={10} color="#059669" />
                <Text style={styles.rsvpChipText}>{acceptedCount}</Text>
              </View>
              <View style={[styles.rsvpChip, styles.rsvpChipReject]}>
                <Ionicons name="close" size={10} color="#dc2626" />
                <Text style={[styles.rsvpChipText, { color: "#dc2626" }]}>
                  {rejectedCount}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Approvals actions (only in approvals tab) */}
        {context === "approvals" && canApprove && item.status === "pending" && (
          <View style={styles.approvalActionsRow}>
            <TouchableOpacity
              style={styles.rejectSmallButton}
              onPress={() => setRejectingId(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.rejectSmallButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approveSmallButton}
              onPress={() => handleApprove(item.id)}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={14} color="#fff" />
              <Text style={styles.approveSmallButtonText}>Approve</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Day context: View (left) + Edit/Delete (right) */}
        {context === "day" && (
          <View style={styles.footerActionsRow}>
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => setViewingEvent(item)}
              activeOpacity={0.75}
            >
              <Ionicons name="eye-outline" size={13} color="#1a73e8" />
              <Text style={styles.viewButtonText}>View</Text>
            </TouchableOpacity>

            <View style={styles.editDeleteGroup}>
              {canEdit(item) && (
                <TouchableOpacity
                  style={styles.editSmallButton}
                  onPress={() => openEditModal(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil-outline" size={13} color="#2563eb" />
                  <Text style={styles.editSmallButtonText}>Edit</Text>
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
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /* ------------------------------------------------------------------------ */
  /* VIEW MODAL RSVP HELPERS                                                  */
  /* ------------------------------------------------------------------------ */

  const myResponse = viewingEvent?.responses?.find(
    (r) => r.userId === user?.id,
  );

  const acceptedList =
    viewingEvent?.responses?.filter((r) => r.response === "accept") ?? [];
  const rejectedList =
    viewingEvent?.responses?.filter((r) => r.response === "reject") ?? [];

  const viewingTypeMeta = viewingEvent
    ? TYPE_META[viewingEvent.type]
    : TYPE_META.event;

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

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

        {canApprove && (
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
                <Text style={styles.legendText}>Pending</Text>
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
                        {formatDdMmYyyy(e.date)}
                      </Text>
                      {renderEventCard(e, "approvals")}
                    </View>
                  ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {activeView === "calendar" && canOpenAddModal && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openAddModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ----------------------------- Add/Edit Modal ------------------------ */}
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
                  : isAdmin
                    ? "Add to Calendar"
                    : "Request Event Booking"}
              </Text>

              <Text style={styles.fieldLabel}>Date *</Text>
              <TouchableOpacity
                style={styles.dateInputField}
                onPress={openDatePicker}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={20} color="#1a73e8" />
                <Text style={styles.dateInputText}>
                  {eventDate ? formatDdMmYyyy(eventDate) : "Select date"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {isAdmin && (
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

              {/* Importance */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleTexts}>
                  <Text style={styles.toggleTitle}>Mark as important</Text>
                  <Text style={styles.toggleSubtitle}>
                    Adds a flame badge on the card
                  </Text>
                </View>
                <Switch
                  value={isImportant}
                  onValueChange={setIsImportant}
                  trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
                  thumbColor={isImportant ? "#1a73e8" : "#f1f5f9"}
                />
              </View>

              {/* RSVP toggle — only for admin/owner */}
              {(isAdmin || (userMemberProfile as any)?.role === "owner") && (
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTexts}>
                    <Text style={styles.toggleTitle}>
                      Enable Accept / Reject
                    </Text>
                    <Text style={styles.toggleSubtitle}>
                      Members can accept or reject this with a reason
                    </Text>
                  </View>
                  <Switch
                    value={rsvpEnabled}
                    onValueChange={setRsvpEnabled}
                    trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
                    thumbColor={rsvpEnabled ? "#1a73e8" : "#f1f5f9"}
                  />
                </View>
              )}

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

              {isMember && type === "event" && !editingEvent && (
                <View style={styles.infoBox}>
                  <Ionicons
                    name="information-circle"
                    size={16}
                    color="#1a73e8"
                  />
                  <Text style={styles.infoBoxText}>
                    This request will be sent to your secretary or owner for
                    approval before it's confirmed.
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
                      : isAdmin
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

      {/* ----------------------------- Date Picker --------------------------- */}
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

      {/* ----------------------------- View Details Modal -------------------- */}
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
          <Pressable style={styles.viewModalCard} onPress={() => {}}>
            {viewingEvent && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                <TouchableOpacity
                  style={styles.viewCloseIcon}
                  onPress={() => setViewingEvent(null)}
                  hitSlop={10}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>

                <View style={styles.viewHeaderRow}>
                  <View
                    style={[
                      styles.roleBadge,
                      {
                        backgroundColor: (
                          ROLE_META[viewingEvent.createdByRole ?? "member"] ??
                          ROLE_META.member
                        ).bg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleBadgeText,
                        {
                          color: (
                            ROLE_META[viewingEvent.createdByRole ?? "member"] ??
                            ROLE_META.member
                          ).color,
                        },
                      ]}
                    >
                      {
                        (
                          ROLE_META[viewingEvent.createdByRole ?? "member"] ??
                          ROLE_META.member
                        ).label
                      }
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: viewingTypeMeta.bg },
                    ]}
                  >
                    <Ionicons
                      name={viewingTypeMeta.icon}
                      size={12}
                      color={viewingTypeMeta.color}
                    />
                    <Text
                      style={[
                        styles.typeBadgeText,
                        { color: viewingTypeMeta.color },
                      ]}
                    >
                      {viewingTypeMeta.label}
                    </Text>
                  </View>

                  {viewingEvent.isImportant ? (
                    <View style={styles.importantBadge}>
                      <Ionicons name="flame" size={10} color="#b91c1c" />
                      <Text style={styles.importantBadgeText}>Important</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.viewTitle}>{viewingEvent.title}</Text>

                {viewingEvent.description ? (
                  <View style={styles.viewSection}>
                    <Text style={styles.viewSectionLabel}>Description</Text>
                    <Text style={styles.viewDescriptionText}>
                      {viewingEvent.description}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.viewSection}>
                  <Text style={styles.viewSectionLabel}>Schedule</Text>

                  <View style={styles.viewDetailRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color="#64748b"
                    />
                    <Text style={styles.viewDetailText}>
                      {formatLongDate(viewingEvent.date)}
                    </Text>
                  </View>

                  {(viewingEvent.startTime || viewingEvent.endTime) && (
                    <View style={styles.viewDetailRow}>
                      <Ionicons name="time-outline" size={17} color="#64748b" />
                      <Text style={styles.viewDetailText}>
                        {viewingEvent.startTime}
                        {viewingEvent.startTime && viewingEvent.endTime
                          ? " – "
                          : ""}
                        {viewingEvent.endTime}
                      </Text>
                    </View>
                  )}

                  {viewingEvent.resource && (
                    <View style={styles.viewDetailRow}>
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color="#64748b"
                      />
                      <Text style={styles.viewDetailText}>
                        {viewingEvent.resource}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.viewSection}>
                  <Text style={styles.viewSectionLabel}>Posted by</Text>
                  <View style={styles.viewDetailRow}>
                    <Ionicons name="person-outline" size={17} color="#64748b" />
                    <Text style={styles.viewDetailText}>
                      {viewingEvent.createdByName || "Unknown"}
                    </Text>
                  </View>

                  {viewingEvent.createdByPhone ? (
                    <View style={styles.viewDetailRow}>
                      <Ionicons name="call-outline" size={17} color="#64748b" />
                      {isOwnPost(viewingEvent) ? (
                        <Text style={styles.viewDetailText}>
                          {formatPhoneForDisplay(viewingEvent.createdByPhone)}
                        </Text>
                      ) : (
                        <TouchableOpacity
                          onPress={() =>
                            callNumber(viewingEvent.createdByPhone)
                          }
                          activeOpacity={0.75}
                          hitSlop={6}
                        >
                          <Text
                            style={[
                              styles.viewDetailText,
                              styles.viewDetailLink,
                            ]}
                          >
                            {formatPhoneForDisplay(viewingEvent.createdByPhone)}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : null}

                  {viewingEvent.createdAt ? (
                    <View style={styles.viewDetailRow}>
                      <Ionicons name="time-outline" size={17} color="#64748b" />
                      <Text style={styles.viewDetailText}>
                        {formatDateTime(viewingEvent.createdAt)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {viewingEvent.status === "approved" &&
                  viewingEvent.approvedByPhone && (
                    <View style={styles.approvedBox}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#059669"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.approvedLabel}>
                          Approved by{" "}
                          {viewingEvent.approvedByRole
                            ? viewingEvent.approvedByRole
                            : ""}
                        </Text>
                        <Text style={styles.approvedPhone}>
                          {formatPhoneForDisplay(viewingEvent.approvedByPhone)}
                        </Text>
                      </View>
                    </View>
                  )}

                {viewingEvent.status === "rejected" &&
                  viewingEvent.rejectionReason && (
                    <View style={styles.viewSection}>
                      <Text style={styles.viewSectionLabel}>
                        Rejection Reason
                      </Text>
                      <View style={styles.rejectionReasonBox}>
                        <Ionicons
                          name="information-circle"
                          size={14}
                          color="#dc2626"
                        />
                        <Text style={styles.rejectionReasonText}>
                          {viewingEvent.rejectionReason}
                        </Text>
                      </View>
                    </View>
                  )}

                {viewingEvent.rsvpEnabled && (
                  <View style={styles.viewSection}>
                    <Text style={styles.viewSectionLabel}>Responses</Text>

                    {!isOwnPost(viewingEvent) ? (
                      myResponse ? (
                        <View style={styles.myResponseBox}>
                          <Ionicons
                            name={
                              myResponse.response === "accept"
                                ? "checkmark-circle"
                                : "close-circle"
                            }
                            size={18}
                            color={
                              myResponse.response === "accept"
                                ? "#059669"
                                : "#dc2626"
                            }
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.myResponseText,
                                {
                                  color:
                                    myResponse.response === "accept"
                                      ? "#059669"
                                      : "#dc2626",
                                },
                              ]}
                            >
                              You{" "}
                              {myResponse.response === "accept"
                                ? "accepted"
                                : "rejected"}
                            </Text>
                            {myResponse.reason || myResponse.note ? (
                              <Text style={styles.myResponseNote}>
                                “{myResponse.reason || myResponse.note}”
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ) : (
                        <View style={styles.rsvpButtonsRow}>
                          <TouchableOpacity
                            style={styles.rsvpAcceptButton}
                            onPress={() => openRsvpReason("accept")}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="checkmark" size={16} color="#fff" />
                            <Text style={styles.rsvpAcceptText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rsvpRejectButton}
                            onPress={() => openRsvpReason("reject")}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="close" size={16} color="#fff" />
                            <Text style={styles.rsvpRejectText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    ) : null}

                    <View style={styles.rsvpSummaryRow}>
                      <View style={styles.rsvpSummaryBox}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#059669"
                        />
                        <Text style={styles.rsvpSummaryCount}>
                          {acceptedList.length}
                        </Text>
                        <Text style={styles.rsvpSummaryLabel}>Accepted</Text>
                      </View>
                      <View style={styles.rsvpSummaryBox}>
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color="#dc2626"
                        />
                        <Text style={styles.rsvpSummaryCount}>
                          {rejectedList.length}
                        </Text>
                        <Text style={styles.rsvpSummaryLabel}>Rejected</Text>
                      </View>
                    </View>

                    {acceptedList.length > 0 && (
                      <View style={styles.responseListBox}>
                        <Text style={styles.responseListTitle}>
                          Accepted by
                        </Text>
                        {acceptedList.map((r) => (
                          <View
                            key={`${r.userId}-a`}
                            style={styles.responseRejectRow}
                          >
                            <View style={styles.responseRejectTop}>
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color="#059669"
                              />
                              <Text style={styles.responseRowName}>
                                {r.name}
                              </Text>
                              {r.phone ? (
                                <Text style={styles.responseRowPhone}>
                                  {formatPhoneForDisplay(r.phone)}
                                </Text>
                              ) : null}
                            </View>
                            {r.reason || r.note ? (
                              <Text style={styles.responseAcceptNote}>
                                “{r.reason || r.note}”
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    )}

                    {rejectedList.length > 0 && (
                      <View style={styles.responseListBox}>
                        <Text style={styles.responseListTitle}>
                          Rejected by
                        </Text>
                        {rejectedList.map((r) => (
                          <View
                            key={`${r.userId}-r`}
                            style={styles.responseRejectRow}
                          >
                            <View style={styles.responseRejectTop}>
                              <Ionicons
                                name="close-circle"
                                size={14}
                                color="#dc2626"
                              />
                              <Text style={styles.responseRowName}>
                                {r.name}
                              </Text>
                              {r.phone ? (
                                <Text style={styles.responseRowPhone}>
                                  {formatPhoneForDisplay(r.phone)}
                                </Text>
                              ) : null}
                            </View>
                            {r.reason || r.note ? (
                              <Text style={styles.responseRejectReason}>
                                “{r.reason || r.note}”
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ----------------------------- RSVP Reason Modal --------------------- */}
      <Modal
        visible={rsvpReasonMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRsvpReasonMode(null)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setRsvpReasonMode(null)}
        >
          <Pressable style={styles.modalCardCenter} onPress={() => {}}>
            <View
              style={[
                styles.modalIconCircle,
                {
                  backgroundColor:
                    rsvpReasonMode === "accept" ? "#ecfdf5" : "#fef2f2",
                },
              ]}
            >
              <Ionicons
                name={
                  rsvpReasonMode === "accept"
                    ? "checkmark-circle"
                    : "close-circle"
                }
                size={36}
                color={rsvpReasonMode === "accept" ? "#059669" : "#dc2626"}
              />
            </View>
            <Text style={styles.modalTitle}>
              {rsvpReasonMode === "accept" ? "Accept this?" : "Reject this?"}
            </Text>
            <Text style={styles.modalMessage}>
              {rsvpReasonMode === "accept"
                ? "You can optionally add a note for the organizer."
                : "Please let the organizer know why you are rejecting."}
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { width: "100%" }]}
              placeholder={
                rsvpReasonMode === "accept"
                  ? "Note (optional)"
                  : "Reason (optional)"
              }
              placeholderTextColor="#999"
              value={rsvpReason}
              onChangeText={setRsvpReason}
              multiline
              numberOfLines={2}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setRsvpReasonMode(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  {
                    backgroundColor:
                      rsvpReasonMode === "accept" ? "#059669" : "#dc2626",
                  },
                ]}
                onPress={confirmRsvp}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={rsvpReasonMode === "accept" ? "checkmark" : "close"}
                  size={14}
                  color="#ffffff"
                />
                <Text style={styles.modalConfirmText}>
                  {rsvpReasonMode === "accept" ? "Accept" : "Reject"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ----------------------------- Reject Modal (approval) --------------- */}
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
              Optionally let the member know why, so they understand the
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

      {/* ----------------------------- Delete Modal -------------------------- */}
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

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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

  bookedIndicator: { position: "absolute", bottom: 2, right: 4 },
  bookedIndicatorText: { fontSize: 8, color: "#f59e0b", fontWeight: "bold" },

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

  /* ---------------------------------------------------------------- */
  /* Event Card                                                       */
  /* ---------------------------------------------------------------- */
  eventCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 8,
  },
  eventCardImportant: {
    borderColor: "#fecaca",
    backgroundColor: "#fffbfb",
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0f172a",
  },

  /* Small, content-sized date badge */
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  dateBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.2,
  },

  approvedBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  approvedBadgeSmallText: { fontSize: 9.5, fontWeight: "800" },

  importantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  importantBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#b91c1c",
    letterSpacing: 0.2,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  roleBadgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
  metaName: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "700",
    flexShrink: 1,
  },
  metaPhonePlain: { fontSize: 11, color: "#64748b", fontWeight: "500" },
  phonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  phonePillText: { fontSize: 10.5, color: "#1a73e8", fontWeight: "700" },

  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillText: { fontSize: 10.5, color: "#475569", fontWeight: "600" },

  rsvpCountsRow: { flexDirection: "row", gap: 6 },
  rsvpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  rsvpChipReject: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  rsvpChipText: { fontSize: 10.5, fontWeight: "800", color: "#059669" },

  approvalActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
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

  /* Footer row — View (left) + Edit/Delete (right) */
  footerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  viewButtonText: { fontSize: 11.5, fontWeight: "700", color: "#1a73e8" },

  editDeleteGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editSmallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  },
  editSmallButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
  },
  deleteSmallButton: {
    width: 26,
    height: 26,
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
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },

  /* ---------------------------------------------------------------- */
  /* Add / Edit Modal                                                 */
  /* ---------------------------------------------------------------- */
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
    marginBottom: 6,
    gap: 10,
  },
  dateInputText: { flex: 1, fontSize: 14, color: "#0f172a" },

  typeSwitcher: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginTop: 10,
    marginBottom: 6,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  typeButtonText: { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  typeButtonTextActive: { color: "#1a73e8" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  toggleTexts: { flex: 1, paddingRight: 10 },
  toggleTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  toggleSubtitle: { fontSize: 11, color: "#94a3b8", marginTop: 2 },

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

  /* ---------------------------------------------------------------- */
  /* Date Picker                                                      */
  /* ---------------------------------------------------------------- */
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
  miniBookedIndicator: { position: "absolute", bottom: 1, right: 3 },
  miniBookedIndicatorText: {
    fontSize: 6,
    color: "#f59e0b",
    fontWeight: "bold",
  },
  datePickerActions: { flexDirection: "row", gap: 10, marginTop: 16 },
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

  /* ---------------------------------------------------------------- */
  /* Centered Modals                                                  */
  /* ---------------------------------------------------------------- */
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
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

  /* ---------------------------------------------------------------- */
  /* View Modal                                                       */
  /* ---------------------------------------------------------------- */
  viewModalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  viewCloseIcon: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  viewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingRight: 40,
    flexWrap: "wrap",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  viewTypeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  viewTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
  },
  viewSection: { width: "100%", marginBottom: 14 },
  viewSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  viewDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 5,
  },
  viewDetailText: {
    fontSize: 13.5,
    color: "#334155",
    fontWeight: "500",
    flex: 1,
  },
  viewDetailLink: {
    color: "#1a73e8",
    fontWeight: "700",
  },
  viewDescriptionText: {
    fontSize: 13.5,
    color: "#334155",
    lineHeight: 20,
  },

  approvedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    backgroundColor: "#ecfdf5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  approvedLabel: { fontSize: 11, color: "#065f46", fontWeight: "700" },
  approvedPhone: {
    fontSize: 13,
    color: "#065f46",
    fontWeight: "800",
    marginTop: 2,
  },

  rsvpButtonsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 10,
  },
  rsvpAcceptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#059669",
  },
  rsvpAcceptText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  rsvpRejectButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#dc2626",
  },
  rsvpRejectText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  myResponseBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  myResponseText: { fontSize: 13, fontWeight: "700" },
  myResponseNote: {
    fontSize: 12,
    color: "#475569",
    marginTop: 3,
    fontStyle: "italic",
    lineHeight: 16,
  },

  rsvpSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  rsvpSummaryBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  rsvpSummaryCount: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  rsvpSummaryLabel: { fontSize: 12, color: "#64748b", fontWeight: "600" },

  responseListBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  responseListTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  responseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  responseRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    flexShrink: 1,
  },
  responseRowPhone: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: "500",
  },
  responseRejectRow: {
    paddingVertical: 5,
    gap: 3,
  },
  responseRejectTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  responseRejectReason: {
    fontSize: 12,
    color: "#b91c1c",
    fontStyle: "italic",
    marginLeft: 20,
    lineHeight: 16,
  },
  responseAcceptNote: {
    fontSize: 12,
    color: "#065f46",
    fontStyle: "italic",
    marginLeft: 20,
    lineHeight: 16,
  },
});

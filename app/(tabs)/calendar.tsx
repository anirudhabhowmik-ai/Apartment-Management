import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
  calendarStore,
  RESOURCE_OPTIONS,
  type CalendarAttachment,
  type CalendarEvent,
  type CalendarEventStatus,
  type CalendarEventType,
  type ResourceOption,
} from "../../store/calendarStore";
import { useAuthStore } from "../../store/useAuthStore";

/* ========================================================================== */
/* TOKEN                                                                      */
/* ========================================================================== */

const AUTH_TOKEN_KEY = "auth_token";

function useAuthToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        if (!alive) return;
        setToken(v ?? null);
      } catch (e) {
        console.warn("[CalendarScreen] SecureStore read failed:", e);
        if (alive) setToken(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return token;
}

function useAuthUser(): any | null {
  const authState: any = useAuthStore();
  return authState?.user ?? null;
}

/* ========================================================================== */
/* TYPES                                                                      */
/* ========================================================================== */

type Role = "admin" | "owner" | "member";
type ActiveView = "calendar" | "approvals" | "myRequests";
type CardContext = "day" | "approvals" | "myRequests";
type RsvpMode = "accept" | "reject" | null;

type StatusMeta = {
  label: string;
  color: string;
  bg: string;
  icon: string;
};

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

const STATUS_META: Record<CalendarEventStatus, StatusMeta> = {
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

const ROLE_META: Record<Role, { label: string; color: string; bg: string }> = {
  admin: { label: "Admin", color: "#1a73e8", bg: "#eff6ff" },
  owner: { label: "Owner", color: "#7c3aed", bg: "#f3e8ff" },
  member: { label: "Member", color: "#0891b2", bg: "#ecfeff" },
};

const TYPE_META: Record<
  CalendarEventType,
  { label: string; color: string; bg: string; icon: string }
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

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
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

function formatSelectedDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDdMmYyyy(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatLongDate(dateStr?: string | null): string {
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

function formatDateTime(dateStr?: string | null): string {
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

/* ------------------------ TIME HELPERS ------------------------------------ */

function parseTimeToDate(timeStr?: string | null): Date {
  const base = new Date();
  base.setSeconds(0, 0);
  if (!timeStr) {
    base.setHours(18, 0, 0, 0);
    return base;
  }
  const s = String(timeStr).trim();

  const ampm = s.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([AaPp][Mm])$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPM = ampm[3].toLowerCase() === "pm";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    base.setHours(h, m, 0, 0);
    return base;
  }

  const hhmm = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) {
    base.setHours(parseInt(hhmm[1], 10), parseInt(hhmm[2], 10), 0, 0);
    return base;
  }

  const hh = s.match(/^(\d{1,2})$/);
  if (hh) {
    base.setHours(parseInt(hh[1], 10), 0, 0, 0);
    return base;
  }

  base.setHours(18, 0, 0, 0);
  return base;
}

function formatTimeFromDate(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)} ${ampm}`;
}

/* ------------------------ ATTACHMENT HELPERS ------------------------------ */

type AttachmentLike = { uri: string; name?: string; mimeType?: string };

function isImageAttachment(att: AttachmentLike): boolean {
  const mime = (att.mimeType ?? "").toLowerCase();
  const name = (att.name ?? "").toLowerCase();
  const uri = att.uri ?? "";
  if (mime.startsWith("image/")) return true;
  if (uri.startsWith("data:image/")) return true;
  if (/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name)) return true;
  if (
    /^https?:\/\//i.test(uri) &&
    /\.(png|jpe?g|gif|webp|bmp|heic|heif)(\?|$)/i.test(uri)
  ) {
    return true;
  }
  return false;
}

function fileIconFor(att: AttachmentLike): keyof typeof Ionicons.glyphMap {
  const mime = (att.mimeType ?? "").toLowerCase();
  const name = (att.name ?? att.uri ?? "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf"))
    return "document-text";
  if (mime.includes("word") || /\.(docx?)$/.test(name)) return "document-text";
  if (
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    /\.(xlsx?)$/.test(name)
  )
    return "grid";
  if (
    mime.includes("powerpoint") ||
    mime.includes("presentation") ||
    /\.(pptx?)$/.test(name)
  )
    return "easel";
  if (/\.(zip|rar|7z)$/.test(name)) return "archive";
  if (mime.startsWith("text/") || /\.(txt|csv)$/.test(name))
    return "document-outline";
  return "document-attach";
}

function fileKindLabel(att: AttachmentLike): string {
  const mime = (att.mimeType ?? "").toLowerCase();
  const name = (att.name ?? att.uri ?? "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (mime.includes("word") || /\.(docx?)$/.test(name)) return "Word";
  if (
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    /\.(xlsx?)$/.test(name)
  )
    return "Excel";
  if (
    mime.includes("powerpoint") ||
    mime.includes("presentation") ||
    /\.(pptx?)$/.test(name)
  )
    return "PowerPoint";
  if (/\.(zip|rar|7z)$/.test(name)) return "Archive";
  if (mime.startsWith("text/") || /\.(txt|csv)$/.test(name)) return "Text";
  return "File";
}

function extensionFromMime(mimeOrUri?: string | null): string {
  const s = String(mimeOrUri || "").toLowerCase();
  if (s.includes("image/png") || s.endsWith(".png")) return "png";
  if (s.includes("image/webp") || s.endsWith(".webp")) return "webp";
  if (s.includes("image/gif") || s.endsWith(".gif")) return "gif";
  if (s.includes("image/heic") || s.endsWith(".heic")) return "heic";
  if (s.includes("image/jpeg") || s.endsWith(".jpg")) return "jpg";
  if (s.includes("application/pdf") || s.endsWith(".pdf")) return "pdf";
  if (
    s.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ) ||
    s.endsWith(".xlsx")
  )
    return "xlsx";
  if (s.includes("application/vnd.ms-excel") || s.endsWith(".xls"))
    return "xls";
  if (
    s.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) ||
    s.endsWith(".docx")
  )
    return "docx";
  if (s.includes("application/msword") || s.endsWith(".doc")) return "doc";
  if (s.startsWith("text/") || s.endsWith(".txt")) return "txt";
  if (s.includes("csv") || s.endsWith(".csv")) return "csv";
  return "bin";
}

function mimeFromExtension(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

async function waitForReadableFile(
  uri: string,
  attempts = 6,
  delayMs = 200,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const info: any = await FileSystem.getInfoAsync(uri, {
        size: true,
      } as any);
      if (info && info.exists && (info.size ?? 0) > 0) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function assetToDataUri(uri: string, mimeType?: string): Promise<string> {
  if (!uri) throw new Error("Empty URI");
  if (uri.startsWith("data:") || /^https?:\/\//i.test(uri)) return uri;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mime = mimeType || "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}

async function shareDataUri(
  dataUri: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const match = dataUri.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) throw new Error("Invalid data URI");
  const base64 = match[2];

  const safeName = (fileName || "file").replace(/[^\w.\-]+/g, "_");
  const tempUri = `${FileSystem.cacheDirectory}${Date.now()}_${safeName}`;

  await FileSystem.writeAsStringAsync(tempUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(tempUri, {
      mimeType,
      dialogTitle: `Save ${safeName}`,
    });
    FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  } else {
    throw new Error("Sharing is not available on this device.");
  }
}

/* ========================================================================== */
/* SSR WRAPPER                                                                */
/* ========================================================================== */

export default function CalendarScreen() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (Platform.OS === "web" && !mounted) return null;
  return <CalendarScreenImpl />;
}

/* ========================================================================== */
/* SCREEN IMPLEMENTATION                                                      */
/* ========================================================================== */

function CalendarScreenImpl() {
  const { isAdmin, isMember, userMemberProfile } = useUserRole();
  const isOwner = (userMemberProfile as any)?.role === "owner";
  const isAdminOrOwner = isAdmin || isOwner;
  const isMemberOnly = !isAdminOrOwner && isMember;

  const canApprove = isAdminOrOwner;
  const canOpenAddModal = isAdmin || isMember;

  const token = useAuthToken();
  const user = useAuthUser();
  const accountId = useAccountStore((s: any) => s.selectedAccountId) ?? "";

  /* ------------------------------------------------------------------------ */
  /* STATE                                                                    */
  /* ------------------------------------------------------------------------ */

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dayFilter, setDayFilter] = useState<"all" | "day">("all");
  const [activeView, setActiveView] = useState<ActiveView>("calendar");

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
  const [attachments, setAttachments] = useState<CalendarAttachment[]>([]);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [encodingAttachment, setEncodingAttachment] = useState(false);

  const [timePickerMode, setTimePickerMode] = useState<"start" | "end" | null>(
    null,
  );
  const [timePickerValue, setTimePickerValue] = useState<Date>(new Date());

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTitle, setDeletingTitle] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [rsvpReasonMode, setRsvpReasonMode] = useState<RsvpMode>(null);
  const [rsvpReason, setRsvpReason] = useState("");
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date>(new Date());

  /* ------------------------------------------------------------------------ */
  /* DATA LOADING                                                             */
  /* ------------------------------------------------------------------------ */

  const monthKey = `${currentMonth.getFullYear()}-${pad(
    currentMonth.getMonth() + 1,
  )}`;

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!accountId) return;
      if (!token) return;
      const { silent = false } = opts;
      if (!silent) setLoading(true);
      try {
        const data = await calendarStore.loadEvents(
          accountId,
          { month: monthKey },
          token,
        );
        setEvents(Array.isArray(data) ? data : []);
      } catch (e: any) {
        const status = e?.status ? ` (${e.status})` : "";
        const code = e?.code ? ` [${e.code}]` : "";
        Alert.alert(
          "Calendar error",
          `${e?.message || "Failed to load events"}${status}${code}`,
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [accountId, monthKey, token],
  );

  useEffect(() => {
    if (token === undefined) return;
    if (token === null) return;
    load();
  }, [load, token]);

  useEffect(() => {
    if (!viewingEvent) return;
    const fresh = events.find((e) => e.id === viewingEvent.id);
    if (fresh && fresh !== viewingEvent) setViewingEvent(fresh);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------------------ */
  /* DERIVED                                                                  */
  /* ------------------------------------------------------------------------ */

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      if (e.status === "rejected" && e.createdById !== user?.id && !canApprove)
        return;
      if (e.status === "pending" && e.createdById !== user?.id && !canApprove)
        return;

      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [events, user?.id, canApprove]);

  const bookedDates = useMemo(() => {
    const dates = new Set<string>();
    events.forEach((e) => {
      if (
        e.type === "event" &&
        (e.status === "approved" || e.status === "pending")
      ) {
        dates.add(e.date);
      }
    });
    return dates;
  }, [events]);

  const pendingApprovals = useMemo(
    () => events.filter((e) => e.status === "pending"),
    [events],
  );

  const myRequests = useMemo(
    () => events.filter((e) => e.createdById === user?.id),
    [events, user?.id],
  );

  const gridCells = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const listEventsForDay = useMemo(() => {
    if (dayFilter === "all") {
      return [...events].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (!!a.isImportant !== !!b.isImportant) return a.isImportant ? -1 : 1;
        if (a.type !== b.type) return a.type === "notice" ? -1 : 1;
        return (a.startTime ?? "").localeCompare(b.startTime ?? "");
      });
    }
    const list = eventsByDate.get(toDateKey(selectedDate)) ?? [];
    return [...list].sort((a, b) => {
      if (!!a.isImportant !== !!b.isImportant) return a.isImportant ? -1 : 1;
      if (a.type !== b.type) return a.type === "notice" ? -1 : 1;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
  }, [dayFilter, events, eventsByDate, selectedDate]);

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
    setDayFilter("all");
  };

  const pickDay = (date: Date) => {
    setSelectedDate(date);
    setDayFilter("day");
  };

  const showAllDays = () => {
    setDayFilter("all");
  };

  /* ------------------------------------------------------------------------ */
  /* ADD / EDIT                                                               */
  /* ------------------------------------------------------------------------ */

  const resetForm = () => {
    setEditingEvent(null);
    setTitle("");
    setDescription("");
    setType("event");
    setResource(null);
    setStartTime("");
    setEndTime("");
    setEventDate(toDateKey(selectedDate));
    setFormError("");
    setIsImportant(false);
    setRsvpEnabled(false);
    setAttachments([]);
  };

  const openAddModal = () => {
    if (!canOpenAddModal) return;
    setEditingEvent(null);
    setTitle("");
    setDescription("");
    setType(isAdminOrOwner ? "notice" : "event");
    setResource(null);
    setStartTime("");
    setEndTime("");
    setEventDate(toDateKey(selectedDate));
    setFormError("");
    setIsImportant(false);
    setRsvpEnabled(false);
    setAttachments([]);
    setShowAddModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    if (!event) return;
    setEditingEvent(event);
    setTitle(event.title ?? "");
    setDescription(event.description ?? "");
    setType(event.type ?? "event");
    setResource(((event.resource as ResourceOption) ?? null) as any);
    setStartTime(event.startTime ?? "");
    setEndTime(event.endTime ?? "");
    setEventDate(event.date ?? toDateKey(selectedDate));
    setFormError("");
    setIsImportant(!!event.isImportant);
    setRsvpEnabled(!!event.rsvpEnabled);

    const raw = (event.attachments ?? []) as CalendarAttachment[];
    setAttachments(
      Array.isArray(raw)
        ? raw.filter(
            (a) => a && typeof a === "object" && typeof a.uri === "string",
          )
        : [],
    );

    (async () => {
      const needs = raw.some(
        (a) =>
          a &&
          typeof a.uri === "string" &&
          !a.uri.startsWith("data:") &&
          !/^https?:\/\//i.test(a.uri),
      );
      if (!needs) return;
      const fixed: CalendarAttachment[] = [];
      for (const a of raw) {
        if (
          !a ||
          typeof a.uri !== "string" ||
          a.uri.startsWith("data:") ||
          /^https?:\/\//i.test(a.uri)
        ) {
          fixed.push(a as CalendarAttachment);
          continue;
        }
        try {
          const ready = await waitForReadableFile(a.uri, 3, 150);
          if (!ready) {
            fixed.push(a);
            continue;
          }
          const dataUri = await assetToDataUri(a.uri, a.mimeType);
          fixed.push({ ...a, uri: dataUri });
        } catch {
          fixed.push(a);
        }
      }
      setAttachments(fixed);
    })();

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

  /* ------------------------------------------------------------------------ */
  /* TIME PICKER - FIXED for onValueChange type                               */
  /* ------------------------------------------------------------------------ */

  const openTimePicker = (mode: "start" | "end") => {
    const initial =
      mode === "start" ? parseTimeToDate(startTime) : parseTimeToDate(endTime);
    setTimePickerValue(initial);
    setTimePickerMode(mode);
  };

  // FIXED: onValueChange callback signature uses DateTimePickerChangeEvent
  // and the date parameter is required (not optional).
  const onTimePickerValueChange = (
    event: DateTimePickerChangeEvent,
    selected: Date,
  ) => {
    setTimePickerValue(selected);

    // On Android, the picker closes immediately after selection
    if (Platform.OS === "android") {
      const formatted = formatTimeFromDate(selected);
      if (timePickerMode === "start") setStartTime(formatted);
      else if (timePickerMode === "end") setEndTime(formatted);
      setTimePickerMode(null);
    }
  };

  const onTimePickerDismiss = () => {
    if (Platform.OS === "android") {
      setTimePickerMode(null);
    }
  };

  const confirmIosTime = () => {
    const formatted = formatTimeFromDate(timePickerValue);
    if (timePickerMode === "start") {
      setStartTime(formatted);
    } else if (timePickerMode === "end") {
      setEndTime(formatted);
    }
    setTimePickerMode(null);
  };

  /* ------------------------------------------------------------------------ */
  /* ATTACHMENTS                                                              */
  /* ------------------------------------------------------------------------ */

  const takeAttachmentPhoto = async () => {
    setShowPhotoOptions(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setFormError("Permission to access camera is required");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType || "image/jpeg";
        setEncodingAttachment(true);
        const ready = await waitForReadableFile(asset.uri);
        if (!ready) {
          setFormError("Could not read the captured photo. Please try again.");
          return;
        }
        const dataUri = await assetToDataUri(asset.uri, mimeType);
        setAttachments((cur) => [
          ...cur,
          {
            uri: dataUri,
            name: asset.fileName || "Photo",
            mimeType,
          },
        ]);
        setFormError("");
      }
    } catch (e: any) {
      console.warn("[CalendarScreen] takeAttachmentPhoto failed:", e);
      setFormError(e?.message || "Could not capture photo. Please try again.");
    } finally {
      setEncodingAttachment(false);
    }
  };

  const chooseAttachmentFromGallery = async () => {
    setShowPhotoOptions(false);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFormError("Permission to access photos is required");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
        allowsMultipleSelection: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        setEncodingAttachment(true);
        const encoded: CalendarAttachment[] = [];
        const failedNames: string[] = [];

        for (const asset of result.assets) {
          const mimeType = asset.mimeType || "image/jpeg";
          const displayName = asset.fileName || "Photo";

          const ready = await waitForReadableFile(asset.uri);
          if (!ready) {
            failedNames.push(displayName);
            continue;
          }
          try {
            const dataUri = await assetToDataUri(asset.uri, mimeType);
            encoded.push({ uri: dataUri, name: displayName, mimeType });
          } catch (e) {
            console.warn("[CalendarScreen] gallery asset read failed:", e);
            failedNames.push(displayName);
          }
        }

        setAttachments((cur) => [...cur, ...encoded]);
        if (failedNames.length > 0) {
          setFormError(
            `Couldn't attach: ${failedNames.join(", ")}. Try picking again.`,
          );
        } else {
          setFormError("");
        }
      }
    } catch (e: any) {
      console.warn("[calendar] chooseAttachmentFromGallery failed:", e);
      setFormError(e?.message || "Could not pick photos. Please try again.");
    } finally {
      setEncodingAttachment(false);
    }
  };

  const pickAttachmentDocument = async () => {
    setShowPhotoOptions(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain",
          "text/csv",
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      if (!result.assets || result.assets.length === 0) return;

      setEncodingAttachment(true);

      const encoded: CalendarAttachment[] = [];
      const failedNames: string[] = [];

      for (const asset of result.assets) {
        const displayName = asset.name || "Document";
        const mimeType =
          asset.mimeType ||
          mimeFromExtension(extensionFromMime(asset.name || asset.uri || "")) ||
          "application/octet-stream";

        const ready = await waitForReadableFile(asset.uri);
        if (!ready) {
          console.warn(
            "[CalendarScreen] DocumentPicker asset never became readable:",
            asset.uri,
          );
          failedNames.push(displayName);
          continue;
        }

        try {
          const dataUri = await assetToDataUri(asset.uri, mimeType);
          encoded.push({ uri: dataUri, name: displayName, mimeType });
        } catch (e) {
          console.warn("[CalendarScreen] document read failed:", e);
          failedNames.push(displayName);
        }
      }

      setAttachments((cur) => [...cur, ...encoded]);

      if (failedNames.length > 0) {
        setFormError(
          `Couldn't attach: ${failedNames.join(", ")}. Try picking again.`,
        );
      } else {
        setFormError("");
      }
    } catch (e: any) {
      console.warn("[CalendarScreen] pickAttachmentDocument failed:", e);
      setFormError(e?.message || "Could not pick document. Please try again.");
    } finally {
      setEncodingAttachment(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((cur) => cur.filter((_, i) => i !== index));
  };

  const openAttachment = async (att: CalendarAttachment) => {
    const uri = att.uri;
    if (!uri) return;

    const ext = extensionFromMime(att.mimeType || att.name || uri);
    const mime = att.mimeType || mimeFromExtension(ext);
    const rawName = att.name || `attachment.${ext}`;
    const fileName = /\.\w+$/.test(rawName) ? rawName : `${rawName}.${ext}`;

    if (uri.startsWith("data:")) {
      try {
        await shareDataUri(uri, fileName, mime);
      } catch (e: any) {
        console.warn("[CalendarScreen] shareDataUri failed:", e);
        Alert.alert(
          "Cannot open",
          e?.message || "Unable to open this attachment.",
        );
      }
      return;
    }

    if (uri.startsWith("file://") || uri.startsWith("content://")) {
      try {
        const ready = await waitForReadableFile(uri, 3, 150);
        if (!ready) {
          Alert.alert(
            "Cannot open",
            "This attachment's local file is no longer available on this device. Please re-upload it.",
          );
          return;
        }
        const dataUri = await assetToDataUri(uri, mime);
        await shareDataUri(dataUri, fileName, mime);
        return;
      } catch (e: any) {
        console.warn("[CalendarScreen] legacy attachment share failed:", e);
        Alert.alert(
          "Cannot open",
          "This attachment's local file is no longer available on this device. Please re-upload it.",
        );
        return;
      }
    }

    try {
      const supported = await Linking.canOpenURL(uri);
      if (!supported) {
        Alert.alert(
          "Cannot open",
          "This file type is not supported on your device.",
        );
        return;
      }
      await Linking.openURL(uri);
    } catch (e: any) {
      console.warn("[CalendarScreen] openAttachment failed:", e);
      Alert.alert(
        "Cannot open",
        e?.message || "Unable to open this attachment.",
      );
    }
  };

  /* ------------------------------------------------------------------------ */
  /* SUBMIT                                                                   */
  /* ------------------------------------------------------------------------ */

  const handleSubmit = async () => {
    if (!canOpenAddModal) return;
    if (submitting) return;

    if (!title.trim()) {
      setFormError("Please enter a title");
      return;
    }
    if (type === "event" && !resource) {
      setFormError("Please select a venue for this event");
      return;
    }
    if (type === "notice" && !isAdminOrOwner) {
      setFormError("Only admins and owners can post notices");
      return;
    }

    const payload: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      resource: type === "event" ? (resource ?? undefined) : undefined,
      date: eventDate,
      startTime: startTime.trim() || undefined,
      endTime: endTime.trim() || undefined,
      isImportant,
      rsvpEnabled,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    setSubmitting(true);
    try {
      if (editingEvent) {
        await calendarStore.editEvent(
          accountId,
          editingEvent.id,
          payload,
          token,
        );
      } else {
        await calendarStore.addEvent(accountId, payload, token);
      }
      setShowAddModal(false);
      resetForm();
      await load({ silent: true });
    } catch (e: any) {
      setFormError(e?.message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* APPROVE / REJECT / RESEND / DELETE                                       */
  /* ------------------------------------------------------------------------ */

  const handleApprove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await calendarStore.approveEvent(accountId, id, token);
      await load({ silent: true });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to approve");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    const id = rejectingId;
    const reason = rejectReason;
    if (!id || rejectSubmitting) return;

    setRejectSubmitting(true);
    try {
      await calendarStore.rejectEvent(accountId, id, reason, token);
      setRejectingId(null);
      setRejectReason("");
      await load({ silent: true });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to reject");
    } finally {
      setRejectSubmitting(false);
    }
  };

  const handleResend = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const updated = await calendarStore.resendEvent(accountId, id, token);
      setViewingEvent(updated);
      await load({ silent: true });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to resend");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const id = deletingId;
    if (!id || deleteSubmitting) return;

    setDeleteSubmitting(true);
    try {
      await calendarStore.deleteEvent(accountId, id, token);
      setDeletingId(null);
      setDeletingTitle("");
      await load({ silent: true });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to delete");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const canEdit = (item: CalendarEvent) =>
    isAdminOrOwner ||
    (item.createdById === user?.id && item.status === "pending");

  const canDelete = (item: CalendarEvent) =>
    isAdminOrOwner ||
    (item.createdById === user?.id && item.status !== "approved");

  const isDateBooked = (dateKey: string) => bookedDates.has(dateKey);

  /* ------------------------------------------------------------------------ */
  /* CONTACT                                                                  */
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
  /* RSVP                                                                     */
  /* ------------------------------------------------------------------------ */

  const openRsvpReason = (mode: "accept" | "reject") => {
    setRsvpReason("");
    setRsvpReasonMode(mode);
  };

  const confirmRsvp = async () => {
    if (!viewingEvent || !rsvpReasonMode || rsvpSubmitting) return;
    const mode = rsvpReasonMode;
    const note = rsvpReason;
    const id = viewingEvent.id;

    setRsvpSubmitting(true);
    try {
      const updated = await calendarStore.respondToEvent(
        accountId,
        id,
        {
          response: mode === "accept" ? "accept" : "reject",
          reason: mode === "reject" ? note : undefined,
          note: mode === "accept" ? note : undefined,
        },
        token,
      );
      setViewingEvent(updated);
      setRsvpReasonMode(null);
      setRsvpReason("");
      await load({ silent: true });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save response");
    } finally {
      setRsvpSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* EVENT CARD                                                               */
  /* ------------------------------------------------------------------------ */

  const renderEventCard = (item: CalendarEvent, context: CardContext) => {
    const meta = STATUS_META[item.status];
    const roleMeta =
      ROLE_META[(item.createdByRole as Role) ?? "member"] ?? ROLE_META.member;

    const iconName: string =
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

    const rowBusy = busyId === item.id;

    const hasApprover = Boolean(
      (item as any).approvedByPhone || (item as any).approvedById,
    );
    const showStatusBadge =
      (item.status === "approved" && hasApprover) ||
      (own && (item.status === "pending" || item.status === "rejected"));

    const attachmentCount = Array.isArray(item.attachments)
      ? item.attachments.length
      : 0;

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

          {showStatusBadge ? (
            <View
              style={[styles.approvedBadgeSmall, { backgroundColor: meta.bg }]}
            >
              <Ionicons name={meta.icon as any} size={11} color={meta.color} />
              <Text
                style={[styles.approvedBadgeSmallText, { color: meta.color }]}
              >
                {meta.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.roleBadge, { backgroundColor: roleMeta.bg }]}>
            <Text style={[styles.roleBadgeText, { color: roleMeta.color }]}>
              {roleMeta.label}
            </Text>
          </View>

          {own && (
            <View style={styles.youBadge}>
              <Ionicons name="person" size={9} color="#7c3aed" />
              <Text style={styles.youBadgeText}>You</Text>
            </View>
          )}

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

        <View style={styles.dateBadge}>
          <Ionicons name="calendar-outline" size={11} color="#334155" />
          <Text style={styles.dateBadgeText}>{formatDdMmYyyy(item.date)}</Text>
        </View>

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

            {attachmentCount > 0 && (
              <View style={styles.pill}>
                <Ionicons name="attach" size={10} color="#475569" />
                <Text style={styles.pillText}>
                  {attachmentCount} {attachmentCount === 1 ? "file" : "files"}
                </Text>
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

        {context === "approvals" && canApprove && item.status === "pending" && (
          <View style={styles.approvalActionsRow}>
            <TouchableOpacity
              style={[
                styles.rejectSmallButton,
                busyId !== null && { opacity: 0.6 },
              ]}
              onPress={() => setRejectingId(item.id)}
              activeOpacity={0.7}
              disabled={busyId !== null}
            >
              <Text style={styles.rejectSmallButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.approveSmallButton, rowBusy && { opacity: 0.7 }]}
              onPress={() => handleApprove(item.id)}
              activeOpacity={0.8}
              disabled={busyId !== null}
            >
              {rowBusy ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.approveSmallButtonText}>Approving…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={styles.approveSmallButtonText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {(context === "day" ||
          context === "myRequests" ||
          context === "approvals") && (
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
              {canEdit(item) && context !== "approvals" && (
                <TouchableOpacity
                  style={styles.editSmallButton}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openEditModal(item);
                  }}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Ionicons name="pencil-outline" size={13} color="#2563eb" />
                  <Text style={styles.editSmallButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
              {canDelete(item) && (
                <TouchableOpacity
                  style={styles.deleteSmallButton}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    setDeletingId(item.id);
                    setDeletingTitle(item.title);
                  }}
                  activeOpacity={0.7}
                  hitSlop={6}
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
  /* VIEW MODAL HELPERS                                                       */
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

  const viewingAttachments: CalendarAttachment[] = Array.isArray(
    viewingEvent?.attachments,
  )
    ? (viewingEvent!.attachments as CalendarAttachment[])
    : [];

  const viewingRoleMeta = viewingEvent
    ? (ROLE_META[(viewingEvent.createdByRole as Role) ?? "member"] ??
      ROLE_META.member)
    : ROLE_META.member;

  const viewingIsOwnPost = viewingEvent ? isOwnPost(viewingEvent) : false;

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

        {/* ---------------------------- Tabs ---------------------------- */}
        {isAdminOrOwner && (
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

        {isMemberOnly && (
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
                activeView === "myRequests" && styles.tabButtonActive,
              ]}
              onPress={() => setActiveView("myRequests")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="list"
                size={15}
                color={activeView === "myRequests" ? "#1a73e8" : "#94a3b8"}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  activeView === "myRequests" && styles.tabButtonTextActive,
                ]}
              >
                My Requests
              </Text>
              {myRequests.filter((e) => e.status === "pending").length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {myRequests.filter((e) => e.status === "pending").length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------------------- Content ---------------------------- */}
        {loading ? (
          <View style={styles.emptyDayBox}>
            <ActivityIndicator color="#1a73e8" />
            <Text style={styles.emptyDayText}>Loading…</Text>
          </View>
        ) : activeView === "calendar" ? (
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
                  const isSelected =
                    dayFilter === "day" && isSameDay(date, selectedDate);
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
                      onPress={() => pickDay(date)}
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
              <View style={styles.filterRowTop}>
                <Text style={styles.selectedDateLabel}>
                  {dayFilter === "all"
                    ? "All events this month"
                    : formatSelectedDate(selectedDate)}
                </Text>

                <View style={styles.dayFilterChips}>
                  <TouchableOpacity
                    style={[
                      styles.dayFilterChip,
                      dayFilter === "all" && styles.dayFilterChipActive,
                    ]}
                    onPress={showAllDays}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="apps-outline"
                      size={12}
                      color={dayFilter === "all" ? "#fff" : "#64748b"}
                    />
                    <Text
                      style={[
                        styles.dayFilterChipText,
                        dayFilter === "all" && styles.dayFilterChipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {dayFilter === "day" && (
                    <TouchableOpacity
                      style={[styles.dayFilterChip, styles.dayFilterChipActive]}
                      onPress={() => {}}
                      activeOpacity={1}
                    >
                      <Ionicons name="calendar" size={12} color="#fff" />
                      <Text
                        style={[
                          styles.dayFilterChipText,
                          styles.dayFilterChipTextActive,
                        ]}
                      >
                        Day
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {listEventsForDay.length === 0 ? (
                <View style={styles.emptyDayBox}>
                  <Ionicons name="calendar-outline" size={32} color="#cbd5e1" />
                  <Text style={styles.emptyDayText}>
                    {dayFilter === "all"
                      ? "No events in this month"
                      : "Nothing scheduled for this day"}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {listEventsForDay.map((e) => {
                    if (dayFilter === "all") {
                      return (
                        <View key={e.id}>
                          <Text style={styles.approvalDateLabel}>
                            {formatDdMmYyyy(e.date)}
                          </Text>
                          {renderEventCard(e, "day")}
                        </View>
                      );
                    }
                    return renderEventCard(e, "day");
                  })}
                </View>
              )}
            </View>
          </>
        ) : activeView === "approvals" ? (
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
        ) : (
          <View style={styles.selectedDateSection}>
            <Text style={styles.selectedDateLabel}>My Requests</Text>
            {myRequests.length === 0 ? (
              <View style={styles.emptyDayBox}>
                <Ionicons name="file-tray-outline" size={32} color="#cbd5e1" />
                <Text style={styles.emptyDayText}>
                  You haven't posted anything yet
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {[...myRequests]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e) => (
                    <View key={e.id}>
                      <Text style={styles.approvalDateLabel}>
                        {formatDdMmYyyy(e.date)}
                      </Text>
                      {renderEventCard(e, "myRequests")}
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
          disabled={submitting}
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
          if (submitting) return;
          setShowAddModal(false);
          resetForm();
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (submitting) return;
              setShowAddModal(false);
              resetForm();
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
                  : isAdminOrOwner
                    ? "Add to Calendar"
                    : "Request Event Booking"}
              </Text>

              <Text style={styles.fieldLabel}>Date *</Text>
              <TouchableOpacity
                style={styles.dateInputField}
                onPress={openDatePicker}
                activeOpacity={0.7}
                disabled={submitting}
              >
                <Ionicons name="calendar-outline" size={20} color="#1a73e8" />
                <Text style={styles.dateInputText}>
                  {eventDate ? formatDdMmYyyy(eventDate) : "Select date"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {isAdminOrOwner && (
                <View style={styles.typeSwitcher}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      type === "notice" && styles.typeButtonActive,
                    ]}
                    onPress={() => setType("notice")}
                    activeOpacity={0.8}
                    disabled={submitting}
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
                    disabled={submitting}
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
                editable={!submitting}
              />

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
                  disabled={submitting}
                />
              </View>

              {isAdminOrOwner && (
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTexts}>
                    <Text style={styles.toggleTitle}>
                      Enable Accept / Reject
                    </Text>
                    <Text style={styles.toggleSubtitle}>
                      Members can accept or reject with an optional note
                    </Text>
                  </View>
                  <Switch
                    value={rsvpEnabled}
                    onValueChange={setRsvpEnabled}
                    trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
                    thumbColor={rsvpEnabled ? "#1a73e8" : "#f1f5f9"}
                    disabled={submitting}
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
                          setResource(opt as ResourceOption);
                          setFormError("");
                        }}
                        activeOpacity={0.8}
                        disabled={submitting}
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
                      <TouchableOpacity
                        style={styles.dateInputField}
                        onPress={() => openTimePicker("start")}
                        activeOpacity={0.7}
                        disabled={submitting}
                      >
                        <Ionicons
                          name="time-outline"
                          size={20}
                          color="#1a73e8"
                        />
                        <Text style={styles.dateInputText}>
                          {startTime || "Select time"}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color="#94a3b8"
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>End Time</Text>
                      <TouchableOpacity
                        style={styles.dateInputField}
                        onPress={() => openTimePicker("end")}
                        activeOpacity={0.7}
                        disabled={submitting}
                      >
                        <Ionicons
                          name="time-outline"
                          size={20}
                          color="#1a73e8"
                        />
                        <Text style={styles.dateInputText}>
                          {endTime || "Select time"}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color="#94a3b8"
                        />
                      </TouchableOpacity>
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
                editable={!submitting}
              />

              <Text style={styles.fieldLabel}>Attachment (optional)</Text>

              {attachments.length > 0 && (
                <View style={styles.attachmentList}>
                  {attachments.map((att, index) => {
                    const isImg = isImageAttachment(att);
                    return (
                      <View
                        key={`${att.uri.slice(0, 40)}-${index}`}
                        style={styles.attachmentRow}
                      >
                        <View
                          style={[
                            styles.attachmentThumb,
                            isImg ? null : styles.attachmentFileIcon,
                          ]}
                        >
                          {isImg ? (
                            <Image
                              source={{ uri: att.uri }}
                              style={{ width: "100%", height: "100%" }}
                            />
                          ) : (
                            <Ionicons
                              name={fileIconFor(att)}
                              size={16}
                              color="#d97706"
                            />
                          )}
                        </View>

                        <View style={styles.attachmentMeta}>
                          <Text style={styles.attachmentName} numberOfLines={1}>
                            {att.name || "Attachment"}
                          </Text>
                          <Text style={styles.attachmentSub}>
                            {isImg ? "Image" : fileKindLabel(att)}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.attachmentRemove}
                          onPress={() => removeAttachment(index)}
                          activeOpacity={0.7}
                          disabled={submitting}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color="#dc2626"
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={styles.attachButton}
                onPress={() => setShowPhotoOptions(true)}
                activeOpacity={0.8}
                disabled={submitting || encodingAttachment}
              >
                <View style={styles.attachButtonIcon}>
                  {encodingAttachment ? (
                    <ActivityIndicator size="small" color="#1a73e8" />
                  ) : (
                    <Ionicons name="add" size={20} color="#1a73e8" />
                  )}
                </View>
                <View style={styles.attachButtonTextContainer}>
                  <Text style={styles.attachButtonTitle}>
                    {encodingAttachment
                      ? "Processing…"
                      : attachments.length > 0
                        ? "Add another attachment"
                        : "Attach photo, PDF or document"}
                  </Text>
                  <Text style={styles.attachButtonSubtitle}>
                    Camera, gallery, or files from device
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {formError ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color="#e53935" />
                  <Text style={styles.error}>{formError}</Text>
                </View>
              ) : null}

              {isMemberOnly && type === "event" && !editingEvent && (
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
                  style={[
                    styles.modalCancelButton,
                    submitting && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  activeOpacity={0.8}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSubmitButton,
                    submitting && { opacity: 0.75 },
                  ]}
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.modalSubmitText}>
                        {editingEvent ? "Saving…" : "Adding…"}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.modalSubmitText}>
                        {editingEvent
                          ? "Save Changes"
                          : isAdminOrOwner
                            ? "Add"
                            : "Request Booking"}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ------------------------ Time Picker (iOS) ------------------------- */}
      {Platform.OS === "ios" && timePickerMode !== null && (
        <Modal
          transparent
          animationType="fade"
          visible={timePickerMode !== null}
          onRequestClose={() => setTimePickerMode(null)}
        >
          <Pressable
            style={styles.modalBackdropCenter}
            onPress={() => setTimePickerMode(null)}
          >
            <Pressable style={styles.timePickerCard} onPress={() => {}}>
              <Text style={styles.timePickerTitle}>
                {timePickerMode === "start"
                  ? "Select Start Time"
                  : "Select End Time"}
              </Text>
              <DateTimePicker
                value={timePickerValue}
                mode="time"
                display="spinner"
                is24Hour={false}
                onValueChange={onTimePickerValueChange}
              />
              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setTimePickerMode(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSubmitButton}
                  onPress={confirmIosTime}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalSubmitText}>Done</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ------------------------ Time Picker (Android) --------------------- */}
      {Platform.OS === "android" && timePickerMode !== null && (
        <DateTimePicker
          value={timePickerValue}
          mode="time"
          display="default"
          is24Hour={false}
          onValueChange={onTimePickerValueChange}
          onDismiss={onTimePickerDismiss}
        />
      )}

      {/* ----------------------------- Photo Options ------------------------- */}
      <Modal
        visible={showPhotoOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoOptions(false)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setShowPhotoOptions(false)}
        >
          <Pressable style={styles.photoOptionsCard} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.photoOptionsTitle}>Add Attachment</Text>
            <Text style={styles.photoOptionsSubtitle}>
              Choose the type of file you want to attach
            </Text>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={takeAttachmentPhoto}
              activeOpacity={0.7}
            >
              <View style={styles.photoOptionIcon}>
                <Ionicons name="camera" size={24} color="#1a73e8" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Take Photo</Text>
                <Text style={styles.photoOptionDescription}>
                  Capture a photo using your camera
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={chooseAttachmentFromGallery}
              activeOpacity={0.7}
            >
              <View
                style={[styles.photoOptionIcon, { backgroundColor: "#ecfdf5" }]}
              >
                <Ionicons name="images" size={24} color="#059669" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Choose from Gallery</Text>
                <Text style={styles.photoOptionDescription}>
                  Select one or more images from your device
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={pickAttachmentDocument}
              activeOpacity={0.7}
            >
              <View
                style={[styles.photoOptionIcon, { backgroundColor: "#fef3c7" }]}
              >
                <Ionicons name="document-text" size={24} color="#d97706" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>
                  Choose Document / PDF
                </Text>
                <Text style={styles.photoOptionDescription}>
                  PDF, Word, Excel, PowerPoint or text files
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOptionsCancel}
              onPress={() => setShowPhotoOptions(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.photoOptionsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
        <View style={styles.modalOverlayCenter}>
          {viewingEvent && (
            <View style={styles.detailModal}>
              <View style={styles.detailHeader}>
                <View style={styles.viewHeaderRow}>
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: viewingRoleMeta.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleBadgeText,
                        { color: viewingRoleMeta.color },
                      ]}
                    >
                      {viewingRoleMeta.label}
                    </Text>
                  </View>

                  {viewingIsOwnPost && (
                    <View style={styles.youBadge}>
                      <Ionicons name="person" size={9} color="#7c3aed" />
                      <Text style={styles.youBadgeText}>You</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: viewingTypeMeta.bg },
                    ]}
                  >
                    <Ionicons
                      name={viewingTypeMeta.icon as any}
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

                <TouchableOpacity
                  style={styles.detailClose}
                  onPress={() => setViewingEvent(null)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
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

                {viewingAttachments.length > 0 && (
                  <View style={styles.viewSection}>
                    <Text style={styles.viewSectionLabel}>
                      Attachments ({viewingAttachments.length})
                    </Text>
                    <View style={styles.viewAttachmentList}>
                      {viewingAttachments.map((att, i) => {
                        const isImg = isImageAttachment(att);
                        return (
                          <View
                            key={`${att.uri.slice(0, 40)}-${i}`}
                            style={styles.viewAttachmentCard}
                          >
                            <View
                              style={[
                                styles.viewAttachmentThumb,
                                isImg ? null : styles.attachmentFileIcon,
                              ]}
                            >
                              {isImg ? (
                                <Image
                                  source={{ uri: att.uri }}
                                  style={{ width: "100%", height: "100%" }}
                                />
                              ) : (
                                <Ionicons
                                  name={fileIconFor(att)}
                                  size={16}
                                  color="#d97706"
                                />
                              )}
                            </View>

                            <View style={styles.viewAttachmentMeta}>
                              <Text
                                style={styles.viewAttachmentName}
                                numberOfLines={1}
                              >
                                {att.name || `Attachment ${i + 1}`}
                              </Text>
                              <Text style={styles.viewAttachmentSub}>
                                {isImg ? "Image" : fileKindLabel(att)}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.downloadButton}
                              onPress={() => openAttachment(att)}
                              activeOpacity={0.8}
                              hitSlop={6}
                            >
                              <Ionicons
                                name="download-outline"
                                size={14}
                                color="#fff"
                              />
                              <Text style={styles.downloadButtonText}>
                                Download
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={styles.viewSection}>
                  <Text style={styles.viewSectionLabel}>Posted by</Text>
                  <View style={styles.viewDetailRow}>
                    <Ionicons name="person-outline" size={17} color="#64748b" />
                    <Text style={styles.viewDetailText}>
                      {viewingEvent.createdByName || "Unknown"}
                      {viewingIsOwnPost ? " (You)" : ""}
                    </Text>
                  </View>

                  {viewingEvent.createdByPhone ? (
                    <View style={styles.viewDetailRow}>
                      <Ionicons name="call-outline" size={17} color="#64748b" />
                      {viewingIsOwnPost ? (
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
                  (viewingEvent.approvedByPhone ||
                    viewingEvent.approvedById) && (
                    <View style={styles.approvedBox}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#059669"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.approvedLabel}>
                          Approved by{" "}
                          {viewingEvent.approvedByName ||
                            (viewingEvent.approvedByRole
                              ? viewingEvent.approvedByRole
                              : "")}
                        </Text>
                        {viewingEvent.approvedByPhone ? (
                          <Text style={styles.approvedPhone}>
                            {formatPhoneForDisplay(
                              viewingEvent.approvedByPhone,
                            )}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  )}

                {viewingEvent.status === "pending" && canApprove && (
                  <View style={styles.viewSection}>
                    <Text style={styles.viewSectionLabel}>
                      Approval Required
                    </Text>
                    <View style={styles.pendingApprovalBox}>
                      <Ionicons name="time" size={16} color="#d97706" />
                      <Text style={styles.pendingApprovalText}>
                        This event is waiting for your approval.
                      </Text>
                    </View>
                    <View style={styles.approvalActionsRowLarge}>
                      <TouchableOpacity
                        style={styles.rejectLargeButton}
                        onPress={() => {
                          setRejectingId(viewingEvent.id);
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="close" size={16} color="#dc2626" />
                        <Text style={styles.rejectLargeButtonText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.approveLargeButton,
                          busyId === viewingEvent.id && { opacity: 0.7 },
                        ]}
                        onPress={() => handleApprove(viewingEvent.id)}
                        activeOpacity={0.85}
                        disabled={busyId === viewingEvent.id}
                      >
                        {busyId === viewingEvent.id ? (
                          <>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.approveLargeButtonText}>
                              Approving…
                            </Text>
                          </>
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={16} color="#fff" />
                            <Text style={styles.approveLargeButtonText}>
                              Approve
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {viewingEvent.status === "rejected" &&
                  (viewingIsOwnPost || canApprove) && (
                    <View style={styles.viewSection}>
                      <Text style={styles.viewSectionLabel}>Rejection</Text>

                      <View style={styles.rejectionReasonBox}>
                        <Ionicons
                          name="information-circle"
                          size={14}
                          color="#dc2626"
                        />
                        <Text style={styles.rejectionReasonText}>
                          {viewingEvent.rejectionReason ||
                            "No reason provided."}
                        </Text>
                      </View>

                      {viewingIsOwnPost ? (
                        <View style={styles.rejectActionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.resendButton,
                              busyId === viewingEvent.id && { opacity: 0.7 },
                            ]}
                            onPress={() => handleResend(viewingEvent.id)}
                            activeOpacity={0.85}
                            disabled={busyId === viewingEvent.id}
                          >
                            {busyId === viewingEvent.id ? (
                              <>
                                <ActivityIndicator size="small" color="#fff" />
                                <Text style={styles.resendButtonText}>
                                  Resending…
                                </Text>
                              </>
                            ) : (
                              <>
                                <Ionicons
                                  name="refresh"
                                  size={16}
                                  color="#fff"
                                />
                                <Text style={styles.resendButtonText}>
                                  Resend for approval
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.deleteInViewButton}
                            onPress={() => {
                              const id = viewingEvent.id;
                              const title = viewingEvent.title;
                              setViewingEvent(null);
                              setDeletingId(id);
                              setDeletingTitle(title);
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color="#dc2626"
                            />
                            <Text style={styles.deleteInViewText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  )}

                {viewingEvent.status === "approved" &&
                  viewingEvent.rsvpEnabled && (
                    <View style={styles.viewSection}>
                      <Text style={styles.viewSectionLabel}>Responses</Text>

                      {viewingIsOwnPost ? (
                        <>
                          {acceptedList.length === 0 &&
                          rejectedList.length === 0 ? (
                            <View style={styles.posterWaitingBox}>
                              <Ionicons
                                name="hourglass-outline"
                                size={16}
                                color="#64748b"
                              />
                              <Text style={styles.posterWaitingText}>
                                Waiting for members to respond…
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : myResponse ? (
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
                      )}

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

                {viewingEvent.status === "approved" &&
                  !viewingEvent.rsvpEnabled &&
                  !viewingIsOwnPost && (
                    <View style={styles.viewSection}>
                      <View style={styles.infoBox}>
                        <Ionicons
                          name="information-circle"
                          size={16}
                          color="#1a73e8"
                        />
                        <Text style={styles.infoBoxText}>
                          This event doesn't require RSVP.
                        </Text>
                      </View>
                    </View>
                  )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* ----------------------------- RSVP Reason Modal --------------------- */}
      <Modal
        visible={rsvpReasonMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (rsvpSubmitting) return;
          setRsvpReasonMode(null);
        }}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => {
            if (rsvpSubmitting) return;
            setRsvpReasonMode(null);
          }}
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
              editable={!rsvpSubmitting}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[
                  styles.modalCancelButton,
                  rsvpSubmitting && { opacity: 0.5 },
                ]}
                onPress={() => setRsvpReasonMode(null)}
                activeOpacity={0.8}
                disabled={rsvpSubmitting}
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
                  rsvpSubmitting && { opacity: 0.75 },
                ]}
                onPress={confirmRsvp}
                activeOpacity={0.8}
                disabled={rsvpSubmitting}
              >
                {rsvpSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.modalConfirmText}>
                      {rsvpReasonMode === "accept"
                        ? "Accepting…"
                        : "Rejecting…"}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={rsvpReasonMode === "accept" ? "checkmark" : "close"}
                      size={14}
                      color="#ffffff"
                    />
                    <Text style={styles.modalConfirmText}>
                      {rsvpReasonMode === "accept" ? "Accept" : "Reject"}
                    </Text>
                  </>
                )}
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
        onRequestClose={() => {
          if (rejectSubmitting) return;
          setRejectingId(null);
        }}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => {
            if (rejectSubmitting) return;
            setRejectingId(null);
          }}
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
              editable={!rejectSubmitting}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[
                  styles.modalCancelButton,
                  rejectSubmitting && { opacity: 0.5 },
                ]}
                onPress={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                activeOpacity={0.8}
                disabled={rejectSubmitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  rejectSubmitting && { opacity: 0.75 },
                ]}
                onPress={confirmReject}
                activeOpacity={0.8}
                disabled={rejectSubmitting}
              >
                {rejectSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.modalConfirmText}>Rejecting…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="close" size={14} color="#ffffff" />
                    <Text style={styles.modalConfirmText}>Reject</Text>
                  </>
                )}
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
        onRequestClose={() => {
          if (deleteSubmitting) return;
          setDeletingId(null);
        }}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => {
            if (deleteSubmitting) return;
            setDeletingId(null);
          }}
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
                style={[
                  styles.modalCancelButton,
                  deleteSubmitting && { opacity: 0.5 },
                ]}
                onPress={() => {
                  setDeletingId(null);
                  setDeletingTitle("");
                }}
                activeOpacity={0.8}
                disabled={deleteSubmitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteConfirmButton,
                  deleteSubmitting && { opacity: 0.75 },
                ]}
                onPress={confirmDelete}
                activeOpacity={0.8}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.deleteConfirmText}>Deleting…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={14} color="#ffffff" />
                    <Text style={styles.deleteConfirmText}>Delete</Text>
                  </>
                )}
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  tabButtonActive: { backgroundColor: "#ffffff" },
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
    flexShrink: 1,
  },
  filterRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  dayFilterChips: {
    flexDirection: "row",
    gap: 6,
  },
  dayFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  dayFilterChipActive: {
    backgroundColor: "#1a73e8",
    borderColor: "#1a73e8",
  },
  dayFilterChipText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#64748b",
  },
  dayFilterChipTextActive: { color: "#ffffff" },

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
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  eventCardImportant: {
    borderColor: "#fecaca",
    backgroundColor: "#fffbfb",
  },

  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eventIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: "700", color: "#0f172a" },

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
  roleBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  roleBadgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
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

  youBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "#f3e8ff",
    borderWidth: 1,
    borderColor: "#e9d5ff",
  },
  youBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#7c3aed",
    letterSpacing: 0.3,
  },

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
  rsvpChipReject: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
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

  editDeleteGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
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

  rejectActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  resendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1a73e8",
  },
  resendButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  deleteInViewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  deleteInViewText: { color: "#dc2626", fontSize: 14, fontWeight: "700" },

  pendingApprovalBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  pendingApprovalText: {
    fontSize: 13,
    color: "#92400e",
    fontWeight: "600",
    flex: 1,
  },
  approvalActionsRowLarge: {
    flexDirection: "row",
    gap: 10,
  },
  rejectLargeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  rejectLargeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#dc2626",
  },
  approveLargeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#059669",
  },
  approveLargeButtonText: { fontSize: 14, fontWeight: "700", color: "#fff" },

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
  typeButtonActive: { backgroundColor: "#ffffff" },
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

  timeRow: { flexDirection: "row", gap: 10, marginTop: 4 },

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

  attachmentList: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
  },
  attachmentRow: {
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fbff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0ecff",
  },
  attachmentThumb: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#eef6ff",
    overflow: "hidden",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentFileIcon: {
    backgroundColor: "#fef3c7",
  },
  attachmentMeta: { flex: 1, minWidth: 0 },
  attachmentName: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
  },
  attachmentSub: {
    fontSize: 10.5,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  attachmentRemove: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  attachButton: {
    minHeight: 64,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#93c5fd",
    borderRadius: 14,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fbff",
  },
  attachButtonIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  attachButtonTextContainer: { flex: 1 },
  attachButtonTitle: { fontSize: 13, fontWeight: "700", color: "#1a73e8" },
  attachButtonSubtitle: { fontSize: 10.5, color: "#64748b", marginTop: 3 },

  photoOptionsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 22,
    width: "100%",
    maxWidth: 420,
  },
  photoOptionsTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  photoOptionsSubtitle: {
    fontSize: 12.5,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 18,
  },
  photoOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  photoOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  photoOptionTextContainer: { flex: 1 },
  photoOptionTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  photoOptionDescription: { fontSize: 12, color: "#64748b", marginTop: 2 },
  photoOptionsCancel: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
  },
  photoOptionsCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },

  viewAttachmentList: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  viewAttachmentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  viewAttachmentThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  viewAttachmentMeta: { flex: 1, minWidth: 0 },
  viewAttachmentName: {
    fontSize: 12.5,
    color: "#334155",
    fontWeight: "700",
  },
  viewAttachmentSub: {
    fontSize: 10.5,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#1a73e8",
  },
  downloadButtonText: {
    color: "#ffffff",
    fontSize: 11.5,
    fontWeight: "700",
  },

  posterWaitingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    marginBottom: 10,
  },
  posterWaitingText: {
    fontSize: 12.5,
    color: "#64748b",
    fontWeight: "500",
  },

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

  timePickerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  timePickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 8,
  },

  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  modalOverlayCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.45)",
    paddingHorizontal: 20,
  },
  detailModal: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  detailClose: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  detailScroll: {
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  detailScrollContent: {
    padding: 20,
    paddingBottom: 32,
  },

  viewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flex: 1,
    paddingRight: 8,
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
  viewDetailLink: { color: "#1a73e8", fontWeight: "700" },
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

  rsvpSummaryRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
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
  responseRejectRow: { paddingVertical: 5, gap: 3 },
  responseRejectTop: { flexDirection: "row", alignItems: "center", gap: 6 },
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

  modalCardCenter: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 10,
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
});

// app/(modals)/pre-authorize.tsx
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSecureItem } from "../../utils/tokenStorage";

import { AppAlert } from "../../components/AppAlert";
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import DatePickerModal from "../../components/DatePickerModal";
import { useAccounts } from "../../hooks/useAccounts";
import { useMembers } from "../../hooks/useManagement";
import { useAuthStore } from "../../store/useAuthStore";
import { setPendingPassTab } from "../../utils/pendingPassTab";

const BLUE = "#2563EB";
const BLUE_LIGHT = "#EFF6FF";
const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const BACKGROUND = "#F8FAFC";
const RED = "#DC2626";
const AMBER = "#B45309";
const AMBER_BG = "#FEF3C7";
const AMBER_BORDER = "#FDE68A";
const GREEN = "#16A34A";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

interface CategoryOption {
  key: string;
  dbCategory: "delivery" | "helper" | "guest" | "cab" | "service" | "other";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  defaultDays: number;
  color: string;
  description: string;
}

interface VehicleRowState {
  plate: string;
  conflictMessage?: string | null;
  checking?: boolean;
}

interface SavedQr {
  id: string;
  code: string;
  visitorName: string;
  flatLabel: string;
  validUntil: string;
}

const NAMED_CATEGORIES: CategoryOption[] = [
  {
    key: "guest",
    dbCategory: "guest",
    label: "Guest",
    icon: "person-outline",
    defaultDays: 1,
    color: "#2563EB",
    description: "Family, friends",
  },
  {
    key: "maid",
    dbCategory: "helper",
    label: "Maid",
    icon: "construct-outline",
    defaultDays: 30,
    color: "#16A34A",
    description: "House help",
  },
  {
    key: "cook",
    dbCategory: "helper",
    label: "Cook",
    icon: "restaurant-outline",
    defaultDays: 30,
    color: "#EA580C",
    description: "Cook, chef",
  },
  {
    key: "driver",
    dbCategory: "helper",
    label: "Driver",
    icon: "car-outline",
    defaultDays: 30,
    color: "#7C3AED",
    description: "Personal driver",
  },
  {
    key: "teacher",
    dbCategory: "guest",
    label: "Teacher / Tutor",
    icon: "school-outline",
    defaultDays: 30,
    color: "#0891B2",
    description: "Tuition, coaching",
  },
  {
    key: "nurse",
    dbCategory: "helper",
    label: "Nurse / Caretaker",
    icon: "medkit-outline",
    defaultDays: 30,
    color: "#DC2626",
    description: "Attendant, nurse",
  },
  {
    key: "yoga",
    dbCategory: "guest",
    label: "Yoga / Fitness",
    icon: "barbell-outline",
    defaultDays: 30,
    color: "#059669",
    description: "Yoga, PT instructor",
  },
  {
    key: "petwalker",
    dbCategory: "helper",
    label: "Pet walker",
    icon: "paw-outline",
    defaultDays: 7,
    color: "#B45309",
    description: "Dog walker, groomer",
  },
  {
    key: "other_named",
    dbCategory: "guest",
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
    defaultDays: 1,
    color: "#64748B",
    description: "Anything else",
  },
];

const OPEN_CATEGORIES: CategoryOption[] = [
  {
    key: "delivery",
    dbCategory: "delivery",
    label: "Delivery",
    icon: "cube-outline",
    defaultDays: 3,
    color: "#EA580C",
    description: "Amazon, Swiggy, Blinkit",
  },
  {
    key: "cab",
    dbCategory: "cab",
    label: "Cab",
    icon: "car-outline",
    defaultDays: 1,
    color: "#7C3AED",
    description: "Uber, Ola, Rapido",
  },
  {
    key: "service",
    dbCategory: "service",
    label: "Service",
    icon: "hammer-outline",
    defaultDays: 3,
    color: "#0891B2",
    description: "Plumber, electrician",
  },
  {
    key: "other_open",
    dbCategory: "other",
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
    defaultDays: 1,
    color: "#64748B",
    description: "Anything else",
  },
];

type DurationKey = "1" | "3" | "7" | "30" | "custom";

const DURATION_OPTIONS: {
  key: DurationKey;
  label: string;
  days: number | null;
}[] = [
  { key: "1", label: "Today only", days: 1 },
  { key: "3", label: "Next 3 days", days: 3 },
  { key: "7", label: "Next 7 days", days: 7 },
  { key: "30", label: "Next 30 days", days: 30 },
  { key: "custom", label: "Custom range", days: null },
];

function normalizeAccountId(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

function pickString(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v.trim() : "";
}

function normalizePlate(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await getSecureItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

interface FlatOption {
  memberId: string;
  wing: string | null;
  flatNumber: string;
  unit: string;
}

function buildFlatOptions(
  members: any[],
  userId?: string | null,
): FlatOption[] {
  if (!userId) return [];
  return members
    .filter((m: any) => m.userId === userId)
    .map((m: any) => {
      const wing = (m.wing ?? "").trim();
      const flat = (m.flatNumber ?? "").trim();
      const unit = wing && flat ? `${wing} · ${flat}` : flat || wing || "—";
      return { memberId: m.id, wing: wing || null, flatNumber: flat, unit };
    })
    .filter((f) => f.flatNumber || f.wing);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeDate(input: unknown): Date {
  if (input instanceof Date && !isNaN(input.getTime())) return input;
  if (typeof input === "string" || typeof input === "number") {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function formatDdMmYyyy(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
}

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

async function checkVehicleConflict(opts: {
  accountId: string;
  plate: string;
  excludeId?: string | null;
  excludeType?: "authorization" | "invite" | null;
}): Promise<{ message: string; source: string } | null> {
  const plate = normalizePlate(opts.plate);
  if (!plate || plate.length < 5) return null;
  if (!opts.accountId) return null;
  const token = await getAuthToken();
  if (!token) return null;
  const qs = new URLSearchParams();
  qs.set("number", plate);
  if (opts.excludeId) qs.set("excludeId", opts.excludeId);
  if (opts.excludeType) qs.set("excludeType", opts.excludeType);
  try {
    const res = await fetch(
      `${API_BASE_URL}/management/${opts.accountId}/vehicles/check-conflict?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    if (data?.conflict === true && typeof data.message === "string") {
      return { message: data.message, source: data.source || "unknown" };
    }
    return null;
  } catch {
    return null;
  }
}

function PlatformTimePicker({
  value,
  onChangeSelected,
  onDismiss,
}: {
  value: Date;
  onChangeSelected: (d: Date) => void;
  onDismiss?: () => void;
}) {
  if (Platform.OS === "web") {
    const hh = pad(value.getHours());
    const mm = pad(value.getMinutes());
    const initial = `${hh}:${mm}`;

    return React.createElement("input", {
      type: "time",
      defaultValue: initial,
      autoFocus: true,
      onChange: (e: any) => {
        const raw = String(e?.target?.value ?? "");
        const parts = raw.split(":");
        if (parts.length < 2) return;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        const next = new Date(value);
        next.setHours(h, m, 0, 0);
        onChangeSelected(next);
      },
      style: {
        width: "100%",
        fontSize: 22,
        padding: 14,
        borderRadius: 12,
        border: "1px solid #cbd5e1",
        backgroundColor: "#ffffff",
        color: "#0f172a",
        textAlign: "center",
        outline: "none",
        marginTop: 12,
        marginBottom: 8,
        boxSizing: "border-box",
      },
    });
  }

  if (Platform.OS === "ios") {
    const handle = (event: DateTimePickerEvent, selected?: Date) => {
      if (event.type !== "set") return;
      if (!selected) return;
      onChangeSelected(selected);
    };
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="spinner"
        is24Hour={false}
        onChange={handle}
      />
    );
  }

  const handle = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "set" && selected) {
      onChangeSelected(selected);
    } else if (event.type === "dismissed") {
      onDismiss?.();
    }
  };
  return (
    <DateTimePicker
      value={value}
      mode="time"
      display="default"
      is24Hour={false}
      onChange={handle}
    />
  );
}

function CategoryDropdown({
  options,
  value,
  onChange,
  label,
}: {
  options: CategoryOption[];
  value: string;
  onChange: (opt: CategoryOption) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value) || options[0];

  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.dropdownTrigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.dropdownIcon,
            { backgroundColor: `${selected.color}15` },
          ]}
        >
          <Ionicons name={selected.icon} size={18} color={selected.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dropdownLabel}>{selected.label}</Text>
          <Text style={styles.dropdownDesc} numberOfLines={1}>
            {selected.description}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#94A3B8" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={styles.dropdownSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.dropdownSheetHeader}>
              <Text style={styles.dropdownSheetTitle}>{label}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                style={styles.dropdownSheetClose}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: 460 }}
              showsVerticalScrollIndicator={false}
            >
              {options.map((opt) => {
                const isSelected = opt.key === value;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.dropdownItem,
                      isSelected && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.dropdownItemIcon,
                        { backgroundColor: `${opt.color}15` },
                      ]}
                    >
                      <Ionicons name={opt.icon} size={18} color={opt.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dropdownItemLabel}>{opt.label}</Text>
                      <Text style={styles.dropdownItemDesc} numberOfLines={1}>
                        {opt.description}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={20} color={BLUE} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function PreAuthorizeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    accountId?: string | string[];
    mode?: string | string[];
    editId?: string | string[];
    editType?: string | string[];
  }>();
  const accountId = normalizeAccountId(params.accountId);
  const requestedMode = pickString(params.mode);
  const editId = pickString(params.editId);
  const editType = pickString(params.editType);
  const isEditMode =
    !!editId && (editType === "authorization" || editType === "invite");

  const { selectedAccount } = useAccounts();
  const { user } = useAuthStore();
  const effectiveAccountId = accountId || selectedAccount?.id || null;

  const membersHook = useMembers(effectiveAccountId);

  const residentFlats = useMemo(
    () => buildFlatOptions(membersHook.items, user?.id),
    [membersHook.items, user?.id],
  );

  const visibleCategories = useMemo<CategoryOption[]>(() => {
    if (requestedMode === "open") return OPEN_CATEGORIES;
    if (requestedMode === "named") return NAMED_CATEGORIES;
    return [...OPEN_CATEGORIES, ...NAMED_CATEGORIES];
  }, [requestedMode]);

  const isOpenMode = requestedMode === "open";

  const screenTitle = isEditMode
    ? editType === "authorization"
      ? "Edit Pass"
      : "Edit QR"
    : isOpenMode
      ? "Create a Pass"
      : "Generate QR / Secret";

  const heroTitle = isEditMode
    ? editType === "authorization"
      ? "Edit pass"
      : "Edit QR"
    : isOpenMode
      ? "Create a pass"
      : "Generate QR / Secret";

  const heroSubtitle = isEditMode
    ? "Update the details below and save."
    : isOpenMode
      ? "Let a delivery, cab or service in without ringing you every time."
      : "Create a QR + secret code for a specific person.";

  const [categoryKey, setCategoryKey] = useState<string>(
    visibleCategories[0]?.key ?? "delivery",
  );
  const [selectedFlatId, setSelectedFlatId] = useState<string | null>(null);
  const [durationKey, setDurationKey] = useState<DurationKey>("3");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [vehicleRows, setVehicleRows] = useState<VehicleRowState[]>([]);
  const [guestCount, setGuestCount] = useState("1");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [customStartDate, setCustomStartDate] = useState<string>(
    toISODateString(new Date()),
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    toISODateString(new Date()),
  );
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const [datePickerTarget, setDatePickerTarget] = useState<
    "start" | "end" | null
  >(null);

  const [timePickerMode, setTimePickerMode] = useState<"start" | "end" | null>(
    null,
  );
  const [timePickerValue, setTimePickerValue] = useState<Date>(new Date());
  const [timePickerKey, setTimePickerKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedQr, setSavedQr] = useState<SavedQr | null>(null);

  const qrImageRef = useRef<any>(null);

  const currentCategory = useMemo(
    () =>
      visibleCategories.find((c) => c.key === categoryKey) ||
      visibleCategories[0],
    [visibleCategories, categoryKey],
  );

  // ─── Pairing state (start/end must come together) ────────────────────
  const hasStartTime = !!startTime;
  const hasEndTime = !!endTime;
  const hasBothTimes = hasStartTime && hasEndTime;
  const hasOnlyOneTime = hasStartTime !== hasEndTime;
  const timePairingError = hasOnlyOneTime
    ? hasStartTime
      ? "Add an end time as well"
      : "Add a start time as well"
    : "";

  useEffect(() => {
    const existsAnywhere = [...OPEN_CATEGORIES, ...NAMED_CATEGORIES].some(
      (c) => c.key === categoryKey,
    );
    if (existsAnywhere) return;
    setCategoryKey(visibleCategories[0]?.key ?? "delivery");
  }, [visibleCategories, categoryKey]);

  useEffect(() => {
    if (residentFlats.length === 1)
      setSelectedFlatId(residentFlats[0].memberId);
  }, [residentFlats.length]);

  useEffect(() => {
    if (isEditMode) return;
    const match = visibleCategories.find((c) => c.key === categoryKey);
    if (!match) return;
    const d = DURATION_OPTIONS.find((o) => o.days === match.defaultDays);
    if (d) setDurationKey(d.key as DurationKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCategories, categoryKey, isEditMode]);

  useEffect(() => {
    if (isEditMode) return;
    if (durationKey !== "custom") return;
    const now = new Date();
    setCustomStartDate(toISODateString(now));
    setCustomEndDate(toISODateString(now));
  }, [durationKey, isEditMode]);

  const selectedFlat = useMemo(
    () => residentFlats.find((f) => f.memberId === selectedFlatId) || null,
    [residentFlats, selectedFlatId],
  );

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) setFieldErrors((c) => ({ ...c, [key]: "" }));
  };

  useEffect(() => {
    if (!isEditMode) return;
    if (!effectiveAccountId || !editId) return;
    let cancelled = false;

    (async () => {
      setLoadingExisting(true);
      try {
        const token = await getAuthToken();
        if (!token) return;

        const url =
          editType === "authorization"
            ? `${API_BASE_URL}/management/${effectiveAccountId}/gate-authorizations`
            : `${API_BASE_URL}/management/${effectiveAccountId}/gate-invites`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: any = await res.json();
        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.authorizations)
            ? data.authorizations
            : Array.isArray(data?.invites)
              ? data.invites
              : [];

        const target = rows.find((r) => String(r.id) === editId);
        if (!target || cancelled) return;

        if (editType === "authorization") {
          setVisitorName(target.visitor_name || "");
          setVisitorPhone(target.visitor_phone || "");
          setGuestCount(String(target.guest_count || 1));

          const allCats = [...OPEN_CATEGORIES, ...NAMED_CATEGORIES];
          const matched =
            visibleCategories.find((c) => c.dbCategory === target.category) ||
            visibleCategories.find((c) => c.key === target.category) ||
            allCats.find((c) => c.key === target.category) ||
            allCats.find((c) => c.dbCategory === target.category);
          if (matched) setCategoryKey(matched.key);
        } else {
          setVisitorName(target.guest_name || "");
          setVisitorPhone(target.guest_phone || "");
          setGuestCount(String(target.guest_count || 1));

          const rawName = String(target.guest_name ?? "");
          const labelMatch = rawName.match(/\(([^)]+)\)\s*$/);
          const labelFromName = labelMatch
            ? labelMatch[1].trim().toLowerCase()
            : null;

          const allCats = [...OPEN_CATEGORIES, ...NAMED_CATEGORIES];

          let catMatch = labelFromName
            ? visibleCategories.find(
                (c) => c.label.toLowerCase() === labelFromName,
              ) || allCats.find((c) => c.label.toLowerCase() === labelFromName)
            : null;

          if (!catMatch) {
            catMatch =
              visibleCategories.find((c) => c.key === target.purpose) ||
              visibleCategories.find((c) => c.dbCategory === target.purpose) ||
              allCats.find((c) => c.key === target.purpose) ||
              allCats.find((c) => c.dbCategory === target.purpose);
          }

          if (!catMatch) {
            catMatch =
              visibleCategories.find((c) => c.key === "guest") ||
              allCats.find((c) => c.key === "guest") ||
              visibleCategories[0];
          }
          if (catMatch) setCategoryKey(catMatch.key);

          if (labelMatch && typeof labelMatch.index === "number") {
            const stripped = rawName.slice(0, labelMatch.index).trim();
            setVisitorName(stripped);
          }
        }

        const rawVehicles: any[] = Array.isArray(target.vehicles)
          ? target.vehicles
          : [];
        if (rawVehicles.length > 0) {
          setVehicleRows(
            rawVehicles.map((v) => ({ plate: normalizePlate(v.number || "") })),
          );
        } else if (target.vehicle_number) {
          setVehicleRows([{ plate: normalizePlate(target.vehicle_number) }]);
        }

        if (target.member_id) {
          const f = residentFlats.find((r) => r.memberId === target.member_id);
          if (f) setSelectedFlatId(f.memberId);
          else {
            const fallback = residentFlats.find(
              (r) => r.flatNumber === String(target.flat_number || ""),
            );
            if (fallback) setSelectedFlatId(fallback.memberId);
          }
        } else {
          const fallback = residentFlats.find(
            (r) => r.flatNumber === String(target.flat_number || ""),
          );
          if (fallback) setSelectedFlatId(fallback.memberId);
        }

        const from = safeDate(target.valid_from);
        const until = safeDate(target.valid_until);
        const fromDate = toISODateString(from);
        const untilDate = toISODateString(until);

        setCustomStartDate(fromDate);
        setCustomEndDate(untilDate);

        // Only treat time as "explicitly set" when both are present and
        // they are not the full-day default (00:00 → 23:59:59 same day).
        const fromIsMidnight =
          from.getHours() === 0 &&
          from.getMinutes() === 0 &&
          from.getSeconds() === 0;
        const untilIsEndOfDay =
          until.getHours() === 23 && until.getMinutes() === 59;
        const sameDay = fromDate === untilDate;

        const lookLikeFullDay = fromIsMidnight && untilIsEndOfDay && sameDay;
        const startHasExplicitTime = !fromIsMidnight;
        const endHasExplicitTime = !untilIsEndOfDay;

        if (lookLikeFullDay) {
          setStartTime("");
          setEndTime("");
        } else {
          setStartTime(startHasExplicitTime ? formatTimeFromDate(from) : "");
          setEndTime(endHasExplicitTime ? formatTimeFromDate(until) : "");
        }

        const hasPhone = !!target.visitor_phone || !!target.guest_phone;
        if (
          hasPhone ||
          (!lookLikeFullDay && (startHasExplicitTime || endHasExplicitTime))
        ) {
          setShowAdvanced(true);
        }

        const diffDays = Math.round(
          (until.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
        );
        const fromToday = fromDate === toISODateString(new Date());
        if (fromToday) {
          if (diffDays === 1) setDurationKey("1");
          else if (diffDays === 3) setDurationKey("3");
          else if (diffDays === 7) setDurationKey("7");
          else if (diffDays === 30) setDurationKey("30");
          else setDurationKey("custom");
        } else {
          setDurationKey("custom");
        }
      } catch (e) {
        console.warn("[pre-authorize] load for edit failed:", e);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId, editType, effectiveAccountId]);

  const addVehicleRow = () => {
    setVehicleRows((cur) => (cur.length >= 5 ? cur : [...cur, { plate: "" }]));
  };

  const updateVehiclePlate = (index: number, value: string) => {
    setVehicleRows((cur) => {
      const next = [...cur];
      next[index] = {
        ...next[index],
        plate: normalizePlate(value),
        conflictMessage: undefined,
      };
      return next;
    });
  };

  const removeVehicleRow = (index: number) => {
    setVehicleRows((cur) => cur.filter((_, i) => i !== index));
  };

  const runVehicleCheckOnBlur = async (index: number) => {
    const row = vehicleRows[index];
    const plate = row?.plate ?? "";
    if (!plate || plate.length < 5) return;
    if (!effectiveAccountId) return;

    setVehicleRows((cur) => {
      const next = [...cur];
      if (next[index]) next[index] = { ...next[index], checking: true };
      return next;
    });

    const excludeId = isEditMode ? editId : null;
    const excludeType: "authorization" | "invite" | null = isEditMode
      ? editType === "authorization"
        ? "authorization"
        : "invite"
      : null;

    const conflict = await checkVehicleConflict({
      accountId: effectiveAccountId,
      plate,
      excludeId,
      excludeType,
    });

    if (conflict) {
      setVehicleRows((cur) => {
        const next = [...cur];
        if (next[index])
          next[index] = {
            ...next[index],
            checking: false,
            conflictMessage: conflict.message,
          };
        return next;
      });
      AppAlert.alert({
        title: "Vehicle conflict",
        message: conflict.message,
        tone: "warning",
      });
    } else {
      setVehicleRows((cur) => {
        const next = [...cur];
        if (next[index])
          next[index] = {
            ...next[index],
            checking: false,
            conflictMessage: null,
          };
        return next;
      });
    }
  };

  const openTimePicker = (mode: "start" | "end") => {
    const initial =
      mode === "start" ? parseTimeToDate(startTime) : parseTimeToDate(endTime);
    setTimePickerValue(initial);
    setTimePickerKey((k) => k + 1);
    setTimePickerMode(mode);
  };

  const handleTimeSelected = (selected: Date) => {
    setTimePickerValue(selected);
    if (Platform.OS === "android") {
      const formatted = formatTimeFromDate(selected);
      if (timePickerMode === "start") setStartTime(formatted);
      else if (timePickerMode === "end") setEndTime(formatted);
      setTimePickerMode(null);
    }
  };

  const onTimePickerDismiss = () => {
    if (Platform.OS === "android") setTimePickerMode(null);
  };

  const confirmIosTime = () => {
    const formatted = formatTimeFromDate(timePickerValue);
    if (timePickerMode === "start") setStartTime(formatted);
    else if (timePickerMode === "end") setEndTime(formatted);
    setTimePickerMode(null);
  };

  // ─────────────────────────────────────────────────────────────────────
  // Compute the exact validFrom / validUntil window that gets sent to the
  // server. Rules:
  //   • Custom range      → from = first date (@start if set),
  //                         until = last date @end (or 23:59:59)
  //   • Preset duration   → from = today @start (or 00:00),
  //                         until = today @end (or 23:59:59) + (days - 1)
  //                         When both times set: until = last day @end
  //                         When no times set:   full day(s) 00:00–23:59
  // ─────────────────────────────────────────────────────────────────────
  const computeValidWindow = (): { from: Date; until: Date } | null => {
    const parsedStart = startTime ? parseTimeToDate(startTime) : null;
    const parsedEnd = endTime ? parseTimeToDate(endTime) : null;

    if (durationKey === "custom") {
      const from = new Date(customStartDate + "T00:00:00");
      if (parsedStart) {
        from.setHours(parsedStart.getHours(), parsedStart.getMinutes(), 0, 0);
      }
      const until = new Date(customEndDate + "T00:00:00");
      if (parsedEnd) {
        until.setHours(parsedEnd.getHours(), parsedEnd.getMinutes(), 0, 0);
      } else {
        until.setHours(23, 59, 59, 999);
      }
      if (until.getTime() <= from.getTime()) return null;
      return { from, until };
    }

    const opt = DURATION_OPTIONS.find((o) => o.key === durationKey);
    if (!opt || opt.days == null) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const from = new Date(today);
    if (parsedStart) {
      from.setHours(parsedStart.getHours(), parsedStart.getMinutes(), 0, 0);
    }

    let until: Date;
    if (parsedEnd) {
      until = new Date(today);
      until.setDate(until.getDate() + opt.days - 1);
      until.setHours(parsedEnd.getHours(), parsedEnd.getMinutes(), 0, 0);
    } else {
      until = new Date(today);
      until.setDate(until.getDate() + opt.days - 1);
      until.setHours(23, 59, 59, 999);
    }

    if (until.getTime() <= from.getTime()) return null;
    return { from, until };
  };

  const navigateToMyPasses = async (tab: "passes" | "qr") => {
    try {
      await setPendingPassTab(tab);
    } catch (e) {
      console.warn("[pre-authorize] setPendingPassTab failed:", e);
    }

    try {
      const dismissTo = (router as any).dismissTo;
      if (typeof dismissTo === "function") {
        dismissTo.call(router, "/(modals)/my-passes");
        return;
      }
    } catch (e) {
      console.warn("[pre-authorize] dismissTo failed, falling back:", e);
    }

    try {
      const canGoBack = (router as any).canGoBack;
      if (typeof canGoBack !== "function" || canGoBack.call(router)) {
        router.back();
        return;
      }
    } catch {
      // fall through
    }

    const url = `/(modals)/my-passes?accountId=${encodeURIComponent(
      effectiveAccountId ?? "",
    )}`;
    try {
      router.replace(url as any);
    } catch (e) {
      console.error("[pre-authorize] navigation failed:", e);
    }
  };

  const goToMyPasses = async (targetTab?: "passes" | "qr") => {
    setSavedQr(null);
    const tab: "passes" | "qr" = targetTab ?? (isOpenMode ? "passes" : "qr");
    await navigateToMyPasses(tab);
  };

  const handleBackPress = async () => {
    const tab: "passes" | "qr" = isOpenMode ? "passes" : "qr";
    await navigateToMyPasses(tab);
  };

  const handleSave = async () => {
    setError("");
    setFieldErrors({});
    const errors: Record<string, string> = {};

    if (!effectiveAccountId) {
      setError("Missing account. Please reopen from the home tab.");
      return;
    }
    if (residentFlats.length === 0) {
      setError("You don't have a flat on this property.");
      return;
    }
    if (!selectedFlat) errors.flat = "Please select a flat";
    if (!isOpenMode && !visitorName.trim())
      errors.visitorName = "Name is required";

    if (durationKey === "custom") {
      const from = new Date(customStartDate + "T00:00:00");
      const until = new Date(customEndDate + "T00:00:00");

      if (until.getTime() < from.getTime()) {
        errors.duration = "End date must be after start date";
      } else if (until.getTime() === from.getTime()) {
        if (startTime && endTime) {
          if (
            parseTimeToDate(endTime).getTime() <=
            parseTimeToDate(startTime).getTime()
          ) {
            errors.duration = "End time must be after start time";
          }
        }
      }
    }

    // ─── Pairing rule: start & end time must come together ─────────────
    if (hasOnlyOneTime) {
      errors.time = hasStartTime
        ? "Add an end time as well"
        : "Add a start time as well";
    } else if (hasBothTimes) {
      const s = parseTimeToDate(startTime);
      const e = parseTimeToDate(endTime);
      // Only enforce ordering within the same day for non-custom windows;
      // for custom range ordering is already validated above.
      if (durationKey !== "custom" && e.getTime() <= s.getTime()) {
        errors.time = "End time must be after start time";
      }
    }

    const window = computeValidWindow();
    if (!window)
      errors.duration = errors.duration || "Please pick a valid window";

    const excludeId = isEditMode ? editId : null;
    const excludeType: "authorization" | "invite" | null = isEditMode
      ? editType === "authorization"
        ? "authorization"
        : "invite"
      : null;

    const conflicts: string[] = [];
    for (let i = 0; i < vehicleRows.length; i++) {
      const row = vehicleRows[i];
      const plate = normalizePlate(row.plate);
      if (!plate || plate.length < 5) continue;
      const conflict = await checkVehicleConflict({
        accountId: effectiveAccountId,
        plate,
        excludeId,
        excludeType,
      });
      if (conflict) {
        conflicts.push(conflict.message);
        setVehicleRows((cur) => {
          const next = [...cur];
          if (next[i])
            next[i] = { ...next[i], conflictMessage: conflict.message };
          return next;
        });
      }
    }

    if (conflicts.length > 0) {
      AppAlert.alert({
        title: "Vehicle conflict",
        message: conflicts[0],
        tone: "warning",
      });
      setFieldErrors({
        vehicles: "Remove the conflicting vehicle(s) before saving.",
      });
      setError("Please fix the highlighted fields");
      return;
    }

    const cleanedVehicles: Array<{ number: string; type: "car" }> = [];
    const seenPlates = new Set<string>();
    for (const row of vehicleRows) {
      const plate = normalizePlate(row.plate);
      if (!plate) continue;
      if (plate.length < 5 || plate.length > 15) {
        errors.vehicles = `"${plate}" doesn't look like a valid plate`;
        break;
      }
      if (seenPlates.has(plate)) {
        errors.vehicles = `Duplicate vehicle: ${plate}`;
        break;
      }
      seenPlates.add(plate);
      cleanedVehicles.push({ number: plate, type: "car" });
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields");
      // Auto-open advanced so the time error is visible
      if (errors.time) setShowAdvanced(true);
      return;
    }

    const trimmedName = visitorName.trim();
    const phoneRaw = visitorPhone.replace(/\D/g, "");
    const { from, until } = window!;

    if (isEditMode) {
      setSaving(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          setError("Session expired. Please log in again.");
          return;
        }

        const url =
          editType === "authorization"
            ? `${API_BASE_URL}/management/${effectiveAccountId}/gate-authorizations/${editId}`
            : `${API_BASE_URL}/management/${effectiveAccountId}/gate-invites/${editId}`;

        const isNamedNonOther =
          currentCategory.key !== "guest" &&
          currentCategory.key !== "other_open" &&
          currentCategory.key !== "other_named";

        const payload: Record<string, any> =
          editType === "authorization"
            ? {
                category: currentCategory.dbCategory,
                visitorName: trimmedName || null,
                visitorPhone: phoneRaw || null,
                vehicles: cleanedVehicles,
                vehicleNumber: cleanedVehicles[0]?.number || null,
                validFrom: from.toISOString(),
                validUntil: until.toISOString(),
                guestCount: Math.max(1, parseInt(guestCount || "1", 10) || 1),
              }
            : {
                purpose:
                  currentCategory.dbCategory === "helper"
                    ? "service"
                    : currentCategory.dbCategory === "guest"
                      ? "guest"
                      : currentCategory.dbCategory,
                guestName:
                  trimmedName && isNamedNonOther && !trimmedName.includes("(")
                    ? `${trimmedName} (${currentCategory.label})`
                    : trimmedName,
                guestPhone: phoneRaw || null,
                vehicles: cleanedVehicles,
                vehicleNumber: cleanedVehicles[0]?.number || null,
                validFrom: from.toISOString(),
                validUntil: until.toISOString(),
                guestCount: Math.max(1, parseInt(guestCount || "1", 10) || 1),
              };

        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          setError(
            data?.message ||
              `Failed to save changes (status ${res.status}). Please try again.`,
          );
          return;
        }

        const targetTab = editType === "authorization" ? "passes" : "qr";
        await goToMyPasses(targetTab);
      } catch (e: any) {
        console.error("[pre-authorize] edit save failed:", e);
        setError(e?.message || "Network error. Please try again.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (isOpenMode) {
      const payload: Record<string, any> = {
        category: currentCategory.dbCategory,
        memberId: selectedFlat!.memberId,
        wing: selectedFlat!.wing,
        flatNumber: selectedFlat!.flatNumber,
        validFrom: from.toISOString(),
        validUntil: until.toISOString(),
        guestCount: Math.max(1, parseInt(guestCount || "1", 10) || 1),
        vehicles: cleanedVehicles,
      };
      if (trimmedName) payload.visitorName = trimmedName;
      if (phoneRaw) payload.visitorPhone = phoneRaw;
      if (cleanedVehicles.length > 0)
        payload.vehicleNumber = cleanedVehicles[0].number;

      setSaving(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          setError("Session expired. Please log in again.");
          return;
        }

        const res = await fetch(
          `${API_BASE_URL}/management/${effectiveAccountId}/gate-authorizations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
        );

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          setError(
            data?.message ||
              `Failed to save pass (status ${res.status}). Please try again.`,
          );
          return;
        }

        await goToMyPasses("passes");
      } catch (e: any) {
        console.error("[pre-authorize] save pass failed:", e);
        setError(e?.message || "Network error. Please try again.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const isNamedNonOther =
      currentCategory.key !== "guest" &&
      currentCategory.key !== "other_open" &&
      currentCategory.key !== "other_named";

    const payload: Record<string, any> = {
      memberId: selectedFlat!.memberId,
      wing: selectedFlat!.wing,
      flatNumber: selectedFlat!.flatNumber,
      purpose: currentCategory.dbCategory === "helper" ? "service" : "guest",
      guestName: trimmedName,
      guestCount: Math.max(1, parseInt(guestCount || "1", 10) || 1),
      validFrom: from.toISOString(),
      validUntil: until.toISOString(),
      vehicles: cleanedVehicles,
    };
    if (cleanedVehicles.length > 0)
      payload.vehicleNumber = cleanedVehicles[0].number;
    if (phoneRaw) payload.guestPhone = phoneRaw;
    if (isNamedNonOther && !trimmedName.includes("(")) {
      payload.guestName = `${trimmedName} (${currentCategory.label})`;
    }

    setSaving(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Session expired. Please log in again.");
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/management/${effectiveAccountId}/gate-invites`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data?.id) {
        setError(
          data?.message ||
            `Failed to create invite (status ${res.status}). Please try again.`,
        );
        return;
      }

      setSavedQr({
        id: String(data.id),
        code: String(data.code || ""),
        visitorName: data.guest_name || trimmedName,
        flatLabel: selectedFlat!.unit,
        validUntil: data.valid_until || until.toISOString(),
      });
    } catch (e: any) {
      console.error("[pre-authorize] save invite failed:", e);
      setError(e?.message || "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const shareQr = async () => {
    if (!savedQr?.code) return;

    let filename: string | null = null;
    try {
      if (!qrImageRef.current?.toDataURL) {
        throw new Error("QR reference not ready");
      }

      const base64: string = await new Promise((resolve, reject) => {
        qrImageRef.current.toDataURL((data: string) => {
          if (data) resolve(data);
          else reject(new Error("QR image is empty"));
        });
      });

      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) throw new Error("Cache directory not available");

      filename = `${cacheDir}gate-qr-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(filename, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (e: any) {
      console.warn("[shareQr] could not generate QR image:", e);
      AppAlert.alert({
        title: "Could not generate QR",
        message: "Please screenshot the QR code and share it manually.",
        tone: "warning",
      });
      return;
    }

    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        await MediaLibrary.saveToLibraryAsync(filename);
        AppAlert.alert({
          title: "QR saved to your gallery",
          message:
            "Open Facebook Messenger (or any chat app), then attach the QR image from your photos.",
          tone: "success",
        });
        return;
      }
    } catch (e) {
      console.warn("[shareQr] media library save failed:", e);
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename, {
          mimeType: "image/png",
          dialogTitle: `Gate QR for ${savedQr.visitorName}`,
          UTI: "public.png",
        });
        return;
      }
    } catch (e) {
      console.warn("[shareQr] share sheet failed:", e);
    }

    try {
      const until = new Date(savedQr.validUntil).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      await Share.share({
        message:
          `${savedQr.visitorName} is invited to visit ${savedQr.flatLabel}.\n\n` +
          `Show this code at the gate: ${savedQr.code}\n` +
          `Valid until: ${until}`,
        title: "Gate QR",
      });
    } catch {}
  };

  const renderFlatPicker = () => {
    if (residentFlats.length === 0) {
      return (
        <View style={styles.emptyFlatCard}>
          <Ionicons name="alert-circle-outline" size={20} color={RED} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyFlatTitle}>No flat on this property</Text>
            <Text style={styles.emptyFlatText}>
              You need to be a member of this account to pre-authorize visitors.
            </Text>
          </View>
        </View>
      );
    }
    if (residentFlats.length === 1) {
      return (
        <View style={styles.autoFlatChip}>
          <Ionicons name="home-outline" size={16} color={BLUE} />
          <Text style={styles.autoFlatText}>
            Visiting{" "}
            <Text style={styles.autoFlatStrong}>{residentFlats[0].unit}</Text>
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.flatPickerRow}>
        {residentFlats.map((flat) => {
          const selected = selectedFlatId === flat.memberId;
          return (
            <TouchableOpacity
              key={flat.memberId}
              style={[styles.flatChip, selected && styles.flatChipSelected]}
              onPress={() => {
                setSelectedFlatId(flat.memberId);
                clearFieldError("flat");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="home-outline"
                size={14}
                color={selected ? "#fff" : BLUE}
              />
              <Text
                style={[
                  styles.flatChipText,
                  selected && styles.flatChipTextSelected,
                ]}
              >
                {flat.unit}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <DarkModeBoundary>
      <KeyboardAvoidingView
        style={[styles.container, { paddingBottom: insets.bottom }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
      >
        <Stack.Screen
          options={{
            title: screenTitle,
            headerBackTitle: "Back",
            headerLeft: () => (
              <TouchableOpacity
                onPress={handleBackPress}
                style={{
                  paddingLeft: 4,
                  paddingRight: 12,
                  paddingVertical: 4,
                }}
                hitSlop={10}
                accessibilityLabel="Back"
              >
                <Ionicons name="arrow-back" size={24} color={TEXT} />
              </TouchableOpacity>
            ),
          }}
        />

        {loadingExisting ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={BLUE} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 40 },
            ]}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name={
                    isEditMode
                      ? "create-outline"
                      : isOpenMode
                        ? "ticket-outline"
                        : "qr-code-outline"
                  }
                  size={26}
                  color={BLUE}
                />
              </View>
              <Text style={styles.heroTitle}>{heroTitle}</Text>
              <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text
                style={[
                  styles.inputLabel,
                  fieldErrors.flat ? styles.inputLabelError : undefined,
                ]}
              >
                {residentFlats.length > 1 ? "Visiting flat" : "Visiting"}
              </Text>
              {renderFlatPicker()}
              {fieldErrors.flat ? (
                <Text style={styles.fieldError}>{fieldErrors.flat}</Text>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <CategoryDropdown
                options={visibleCategories}
                value={categoryKey}
                onChange={(opt) => {
                  setCategoryKey(opt.key);
                  const d = DURATION_OPTIONS.find(
                    (o) => o.days === opt.defaultDays,
                  );
                  if (d) setDurationKey(d.key as DurationKey);
                }}
                label="Who is coming?"
              />
              {isEditMode ? (
                <Text style={styles.helperText}>
                  You can change between categories in this mode.
                </Text>
              ) : null}
            </View>

            {!isEditMode ? (
              <View
                style={[
                  styles.modeBanner,
                  isOpenMode ? styles.modeBannerOpen : styles.modeBannerNamed,
                ]}
              >
                <Ionicons
                  name={isOpenMode ? "shield-checkmark" : "qr-code-outline"}
                  size={18}
                  color={isOpenMode ? "#059669" : "#7C3AED"}
                />
                <Text
                  style={[
                    styles.modeBannerText,
                    { color: isOpenMode ? "#065F46" : "#5B21B6" },
                  ]}
                >
                  {isOpenMode
                    ? "Any visitor in this category can be let in by the guard. No QR needed."
                    : "This pass is tied to a specific person. A QR code and secret code will be generated."}
                </Text>
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text
                style={[
                  styles.inputLabel,
                  fieldErrors.visitorName ? styles.inputLabelError : undefined,
                ]}
              >
                {isOpenMode
                  ? "Name (optional)"
                  : currentCategory.label === "Guest"
                    ? "Guest name"
                    : `${currentCategory.label} name`}
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  fieldErrors.visitorName
                    ? styles.inputContainerError
                    : undefined,
                ]}
              >
                <Ionicons name="person-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Suresh Kumar"
                  placeholderTextColor="#A1AAB8"
                  value={visitorName}
                  onChangeText={(t) => {
                    setVisitorName(t);
                    clearFieldError("visitorName");
                  }}
                />
              </View>
              {fieldErrors.visitorName ? (
                <Text style={styles.fieldError}>{fieldErrors.visitorName}</Text>
              ) : isOpenMode ? (
                <Text style={styles.helperText}>
                  Optional. Leave blank if it's for anyone.
                </Text>
              ) : (
                <Text style={styles.helperText}>
                  Only this person will be allowed on this pass.
                </Text>
              )}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.inputLabel}>Number of people</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => {
                    const n = Math.max(1, parseInt(guestCount || "1", 10) - 1);
                    setGuestCount(String(n));
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="remove" size={18} color={BLUE} />
                </TouchableOpacity>
                <Text style={styles.counterValue}>{guestCount}</Text>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => {
                    const n = Math.min(20, parseInt(guestCount || "1", 10) + 1);
                    setGuestCount(String(n));
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={18} color={BLUE} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.inputLabel,
                    fieldErrors.vehicles ? styles.inputLabelError : undefined,
                  ]}
                >
                  Vehicles
                </Text>
                <Text style={styles.optionalText}>{vehicleRows.length}/5</Text>
              </View>

              {vehicleRows.length === 0 ? (
                <Text style={styles.vehiclesEmptyHint}>
                  Add any vehicle that might drop or pick up the visitors.
                </Text>
              ) : null}

              {vehicleRows.map((row, i) => {
                const hasConflict = !!row.conflictMessage;
                return (
                  <View key={`v-${i}`} style={{ marginBottom: 8 }}>
                    <View style={styles.vehicleRow}>
                      <View
                        style={[
                          styles.inputContainer,
                          { flex: 1 },
                          hasConflict && styles.inputContainerError,
                        ]}
                      >
                        <Ionicons
                          name="car-outline"
                          size={18}
                          color="#94A3B8"
                        />
                        <TextInput
                          style={[styles.textInput, { letterSpacing: 1.2 }]}
                          placeholder="e.g. KA01AB1234"
                          placeholderTextColor="#A1AAB8"
                          autoCapitalize="characters"
                          autoCorrect={false}
                          value={row.plate}
                          onChangeText={(t) => {
                            updateVehiclePlate(i, t);
                            clearFieldError("vehicles");
                          }}
                          onBlur={() => runVehicleCheckOnBlur(i)}
                        />
                        {row.checking ? (
                          <ActivityIndicator size="small" color={BLUE} />
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={styles.removeVehicleBtn}
                        onPress={() => removeVehicleRow(i)}
                        activeOpacity={0.75}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={22} color={RED} />
                      </TouchableOpacity>
                    </View>
                    {hasConflict ? (
                      <View style={styles.conflictHint}>
                        <Ionicons name="alert-circle" size={13} color={RED} />
                        <Text style={styles.conflictHintText}>
                          {row.conflictMessage}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {vehicleRows.length < 5 ? (
                <TouchableOpacity
                  style={styles.addVehicleBtn}
                  onPress={addVehicleRow}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle-outline" size={17} color={BLUE} />
                  <Text style={styles.addVehicleBtnText}>Add vehicle</Text>
                </TouchableOpacity>
              ) : null}

              {fieldErrors.vehicles ? (
                <Text style={styles.fieldError}>{fieldErrors.vehicles}</Text>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text
                style={[
                  styles.inputLabel,
                  fieldErrors.duration ? styles.inputLabelError : undefined,
                ]}
              >
                Valid for
              </Text>
              <View style={styles.durationGrid}>
                {DURATION_OPTIONS.map((opt) => {
                  const selected = durationKey === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.durationChip,
                        selected && styles.durationChipSelected,
                      ]}
                      onPress={() => setDurationKey(opt.key)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.durationChipText,
                          selected && styles.durationChipTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {durationKey === "custom" ? (
                <View style={styles.customRangeBlock}>
                  <Text style={styles.customRangeLabel}>Start date</Text>
                  <View style={styles.customRangeRow}>
                    <TouchableOpacity
                      style={[styles.dateBtn, { flex: 1 }]}
                      onPress={() => setDatePickerTarget("start")}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color={BLUE}
                      />
                      <Text style={styles.dateBtnText}>
                        {formatDdMmYyyy(customStartDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.customRangeLabel, { marginTop: 12 }]}>
                    End date
                  </Text>
                  <View style={styles.customRangeRow}>
                    <TouchableOpacity
                      style={[styles.dateBtn, { flex: 1 }]}
                      onPress={() => setDatePickerTarget("end")}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color={BLUE}
                      />
                      <Text style={styles.dateBtnText}>
                        {formatDdMmYyyy(customEndDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.helperText}>
                    Valid for the whole day by default. To limit to specific
                    hours, set start & end times in Advanced options below.
                  </Text>
                </View>
              ) : null}

              {hasBothTimes ? (
                <View style={styles.timeSummaryCard}>
                  <View style={styles.timeSummaryIcon}>
                    <Ionicons name="time-outline" size={18} color={BLUE} />
                  </View>
                  <View style={styles.timeSummaryTextWrap}>
                    <Text style={styles.timeSummaryLabel}>Time window</Text>
                    <Text style={styles.timeSummaryValue} numberOfLines={1}>
                      {startTime}
                      {"  →  "}
                      {endTime}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.timeSummaryClear}
                    onPress={() => {
                      setStartTime("");
                      setEndTime("");
                    }}
                    hitSlop={8}
                    activeOpacity={0.7}
                    accessibilityLabel="Clear time window"
                  >
                    <Ionicons name="close-circle" size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              ) : null}

              {hasOnlyOneTime ? (
                <View style={styles.timeWarningCard}>
                  <Ionicons name="alert-circle" size={16} color={AMBER} />
                  <Text style={styles.timeWarningText}>
                    {timePairingError}. Open Advanced options to add the missing
                    time.
                  </Text>
                </View>
              ) : null}

              {fieldErrors.duration ? (
                <Text style={styles.fieldError}>{fieldErrors.duration}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={16}
                color={BLUE}
              />
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? "Hide advanced options" : "Advanced options"}
              </Text>
            </TouchableOpacity>

            {showAdvanced ? (
              <View style={styles.advancedBlock}>
                <View style={styles.fieldBlock}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>Phone</Text>
                    <Text style={styles.optionalText}>Optional</Text>
                  </View>
                  <View style={styles.inputContainer}>
                    <View style={styles.countryCode}>
                      <Text style={styles.countryCodeText}>+91</Text>
                    </View>
                    <TextInput
                      style={styles.textInput}
                      placeholder="9876543210"
                      placeholderTextColor="#A1AAB8"
                      keyboardType="number-pad"
                      maxLength={10}
                      value={visitorPhone}
                      onChangeText={(t) =>
                        setVisitorPhone(t.replace(/[^0-9]/g, ""))
                      }
                    />
                  </View>
                </View>

                <View style={[styles.fieldBlock, { marginBottom: 0 }]}>
                  <View style={styles.labelRow}>
                    <Text
                      style={[
                        styles.inputLabel,
                        fieldErrors.time ? styles.inputLabelError : undefined,
                      ]}
                    >
                      Start & end time
                    </Text>
                    <Text style={styles.optionalText}>
                      Optional · Both or neither
                    </Text>
                  </View>

                  <View style={styles.timeRow}>
                    <View style={{ flex: 1 }}>
                      <View
                        style={[
                          styles.dateInputField,
                          hasOnlyOneTime &&
                            !startTime &&
                            styles.dateInputFieldWarn,
                        ]}
                      >
                        <Pressable
                          style={styles.timeTapArea}
                          onPress={() => openTimePicker("start")}
                          disabled={saving}
                          hitSlop={4}
                        >
                          <Ionicons
                            name="time-outline"
                            size={20}
                            color={BLUE}
                          />
                          <Text
                            style={[
                              styles.dateInputText,
                              !startTime && styles.dateInputPlaceholder,
                            ]}
                          >
                            {startTime || "Start time"}
                          </Text>
                        </Pressable>

                        {startTime ? (
                          <Pressable
                            onPress={() => setStartTime("")}
                            hitSlop={10}
                            style={styles.timeClearBtn}
                          >
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color="#94a3b8"
                            />
                          </Pressable>
                        ) : (
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color="#94a3b8"
                          />
                        )}
                      </View>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View
                        style={[
                          styles.dateInputField,
                          hasOnlyOneTime &&
                            !endTime &&
                            styles.dateInputFieldWarn,
                        ]}
                      >
                        <Pressable
                          style={styles.timeTapArea}
                          onPress={() => openTimePicker("end")}
                          disabled={saving}
                          hitSlop={4}
                        >
                          <Ionicons
                            name="time-outline"
                            size={20}
                            color={BLUE}
                          />
                          <Text
                            style={[
                              styles.dateInputText,
                              !endTime && styles.dateInputPlaceholder,
                            ]}
                          >
                            {endTime || "End time"}
                          </Text>
                        </Pressable>

                        {endTime ? (
                          <Pressable
                            onPress={() => setEndTime("")}
                            hitSlop={10}
                            style={styles.timeClearBtn}
                          >
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color="#94a3b8"
                            />
                          </Pressable>
                        ) : (
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color="#94a3b8"
                          />
                        )}
                      </View>
                    </View>
                  </View>

                  {hasOnlyOneTime ? (
                    <View style={styles.timeWarningCard}>
                      <Ionicons name="alert-circle" size={16} color={AMBER} />
                      <Text style={styles.timeWarningText}>
                        {timePairingError}. Both start and end time are required
                        together.
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.helperText}>
                      Leave both empty for a full day. If you set one, you must
                      set the other.
                    </Text>
                  )}
                </View>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle" size={18} color={RED} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={
                      isEditMode
                        ? "checkmark-circle-outline"
                        : isOpenMode
                          ? "checkmark-circle-outline"
                          : "qr-code-outline"
                    }
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.saveBtnText}>
                    {isEditMode
                      ? "Save changes"
                      : isOpenMode
                        ? "Save pass"
                        : "Generate QR code"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.bottomHint}>
              {isEditMode
                ? "Update the details above. The guard sees the new values immediately."
                : isOpenMode
                  ? "The guard sees this pass at the gate. Visitors are let in without ringing you."
                  : "You'll get a QR code to share with the visitor."}
            </Text>
          </ScrollView>
        )}

        <DatePickerModal
          visible={datePickerTarget !== null}
          value={datePickerTarget === "start" ? customStartDate : customEndDate}
          onClose={() => setDatePickerTarget(null)}
          onSelect={(next) => {
            if (datePickerTarget === "start") setCustomStartDate(next);
            else if (datePickerTarget === "end") setCustomEndDate(next);
            setDatePickerTarget(null);
          }}
        />

        {Platform.OS !== "android" && timePickerMode !== null && (
          <Modal
            key={`time-modal-${timePickerKey}`}
            transparent
            animationType="fade"
            visible={timePickerMode !== null}
            onRequestClose={() => setTimePickerMode(null)}
          >
            <View style={styles.modalBackdropCenter}>
              <View style={styles.timePickerCard}>
                <Text style={styles.timePickerTitle}>
                  {timePickerMode === "start"
                    ? "Select Start Time"
                    : "Select End Time"}
                </Text>
                <PlatformTimePicker
                  value={timePickerValue}
                  onChangeSelected={handleTimeSelected}
                />
                <View style={styles.timePickerButtons}>
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
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === "android" && timePickerMode !== null && (
          <PlatformTimePicker
            key={`android-time-${timePickerKey}`}
            value={timePickerValue}
            onChangeSelected={handleTimeSelected}
            onDismiss={onTimePickerDismiss}
          />
        )}

        <Modal
          visible={!!savedQr}
          transparent
          animationType="slide"
          onRequestClose={() => goToMyPasses("qr")}
        >
          <View style={styles.qrBackdrop}>
            <View
              style={[
                styles.qrSheet,
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}
            >
              <View style={styles.qrHandle} />
              {savedQr ? (
                <ScrollView
                  contentContainerStyle={styles.qrScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.qrHero}>
                    <View style={styles.qrHeroIcon}>
                      <Ionicons
                        name="checkmark-circle"
                        size={28}
                        color={GREEN}
                      />
                    </View>
                    <Text style={styles.qrTitle}>QR code created</Text>
                    <Text style={styles.qrSubtitle}>{savedQr.flatLabel}</Text>
                  </View>

                  <View style={styles.qrCard}>
                    <View style={styles.qrFrame}>
                      <QRCode
                        value={savedQr.code}
                        size={220}
                        backgroundColor="#ffffff"
                        color="#0F172A"
                        getRef={(c: any) => (qrImageRef.current = c)}
                      />
                    </View>
                  </View>

                  <View style={styles.qrSummary}>
                    <View style={styles.qrSummaryRow}>
                      <Text style={styles.qrSummaryLabel}>Person</Text>
                      <Text style={styles.qrSummaryValue}>
                        {savedQr.visitorName}
                      </Text>
                    </View>
                    <View style={styles.qrSummaryRow}>
                      <Text style={styles.qrSummaryLabel}>Code</Text>
                      <Text style={styles.qrSummaryValue}>{savedQr.code}</Text>
                    </View>
                    <View style={styles.qrSummaryRow}>
                      <Text style={styles.qrSummaryLabel}>Valid until</Text>
                      <Text style={styles.qrSummaryValue}>
                        {new Date(savedQr.validUntil).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.qrPrimaryBtn}
                    onPress={shareQr}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="share-outline" size={18} color="#fff" />
                    <Text style={styles.qrPrimaryBtnText}>Share QR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.qrDoneBtn}
                    onPress={() => goToMyPasses("qr")}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.qrDoneBtnText}>Done</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </DarkModeBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18, flexGrow: 1 },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { fontSize: 12.5, color: "#64748B", fontWeight: "600" },

  hero: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 18,
    alignItems: "center",
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: BLUE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 320,
  },

  fieldBlock: { marginBottom: 20 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inputLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  inputLabelError: { color: RED },
  optionalText: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },

  emptyFlatCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  emptyFlatTitle: { fontSize: 13, fontWeight: "800", color: "#B91C1C" },
  emptyFlatText: {
    fontSize: 11.5,
    color: "#B91C1C",
    marginTop: 3,
    lineHeight: 16,
  },

  autoFlatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  autoFlatText: { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  autoFlatStrong: { fontWeight: "800" },

  flatPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  flatChipSelected: { backgroundColor: BLUE, borderColor: BLUE },
  flatChipText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  flatChipTextSelected: { color: "#fff" },

  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 58,
  },
  dropdownIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownLabel: { fontSize: 14.5, fontWeight: "800", color: TEXT },
  dropdownDesc: { fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 2 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dropdownSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "80%",
  },
  dropdownSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  dropdownSheetTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  dropdownSheetClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 6,
  },
  dropdownItemActive: {
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  dropdownItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownItemLabel: { fontSize: 14, fontWeight: "800", color: TEXT },
  dropdownItemDesc: { fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 2 },

  modeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  modeBannerOpen: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  modeBannerNamed: { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" },
  modeBannerText: { flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 17 },

  inputContainer: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  inputContainerError: { borderColor: "#FCA5A5", backgroundColor: "#FFF7F7" },
  textInput: {
    flex: 1,
    minHeight: 50,
    fontSize: 15,
    color: TEXT,
    paddingHorizontal: 0,
  },
  countryCode: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  countryCodeText: { fontSize: 14, color: "#475569", fontWeight: "700" },
  helperText: { fontSize: 11, color: "#94A3B8", marginTop: 6 },
  fieldError: { fontSize: 11, color: RED, marginTop: 6, fontWeight: "600" },

  vehiclesEmptyHint: {
    fontSize: 11.5,
    color: "#94A3B8",
    marginBottom: 8,
    fontStyle: "italic",
  },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeVehicleBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  addVehicleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: BLUE_LIGHT,
    marginTop: 4,
  },
  addVehicleBtnText: { fontSize: 13, fontWeight: "800", color: BLUE },

  conflictHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    marginLeft: 4,
  },
  conflictHintText: { flex: 1, fontSize: 11, color: RED, fontWeight: "600" },

  durationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  durationChipSelected: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  durationChipText: { fontSize: 12.5, fontWeight: "700", color: "#475569" },
  durationChipTextSelected: { color: BLUE },

  // ─── Time window summary (both times set) ────────────────────────────
  timeSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  timeSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  timeSummaryTextWrap: { flex: 1, minWidth: 0 },
  timeSummaryLabel: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timeSummaryValue: {
    fontSize: 13.5,
    color: "#1D4ED8",
    fontWeight: "800",
    marginTop: 2,
  },
  timeSummaryClear: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── Time warning (only one of the two is set) ───────────────────────
  timeWarningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: AMBER_BG,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
  },
  timeWarningText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: AMBER,
    fontWeight: "600",
  },
  dateInputFieldWarn: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },

  customRangeBlock: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  customRangeLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  customRangeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  dateBtn: {
    flex: 1.3,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  dateBtnText: { fontSize: 13, fontWeight: "700", color: TEXT },

  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
  },
  advancedToggleText: { fontSize: 13, fontWeight: "800", color: BLUE },
  advancedBlock: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },

  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    minWidth: 26,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
  },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: "#B91C1C",
    fontWeight: "600",
    lineHeight: 17,
  },

  saveBtn: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  bottomHint: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 20,
  },

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
  timePickerButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
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
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: "center",
  },
  modalSubmitText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },

  dateInputField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    gap: 10,
  },
  dateInputText: { flex: 1, fontSize: 14, color: TEXT },
  dateInputPlaceholder: { color: "#A1AAB8" },

  timeTapArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  timeClearBtn: { paddingLeft: 4 },

  qrBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  qrSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "92%",
  },
  qrHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 12,
  },
  qrScroll: { paddingBottom: 8 },
  qrHero: { alignItems: "center", marginBottom: 16 },
  qrHeroIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  qrTitle: { fontSize: 18, fontWeight: "800", color: TEXT },
  qrSubtitle: { fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 4 },
  qrCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    alignItems: "center",
    marginBottom: 16,
  },
  qrFrame: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: BLUE_LIGHT,
  },
  qrSummary: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  qrSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  qrSummaryLabel: { fontSize: 12.5, color: "#64748B", fontWeight: "600" },
  qrSummaryValue: {
    fontSize: 13,
    color: TEXT,
    fontWeight: "800",
    maxWidth: "65%",
    textAlign: "right",
  },
  qrPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: BLUE,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  qrPrimaryBtnText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  qrDoneBtn: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 10,
  },
  qrDoneBtnText: { fontSize: 13, fontWeight: "800", color: "#64748B" },
});

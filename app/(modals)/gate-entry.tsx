// app/(modals)/gate-entry.tsx
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSecureItem } from "../../utils/tokenStorage";

import { AppAlert } from "../../components/AppAlert";
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import { useAccounts } from "../../hooks/useAccounts";
import { useAuthStore } from "../../store/useAuthStore";

const BLUE = "#2563EB";
const BLUE_LIGHT = "#EFF6FF";
const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const BACKGROUND = "#F8FAFC";
const RED = "#DC2626";
const GREEN = "#16A34A";
const AMBER = "#B45309";
const AMBER_LIGHT = "#FEF3C7";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const EDIT_WINDOW_MS = 5 * 60 * 1000;

type Mode = "choose" | "prepass" | "qr" | "manual";
type Purpose = "guest" | "delivery" | "cab" | "service" | "other";
type VehicleType = "car" | "bike" | "other";

interface GuestRow {
  name: string;
  phone: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
}
interface InviteInfo {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  purpose: string | null;
  guest_count: number;
  vehicle_number: string | null;
  vehicles: Array<{ number: string; type?: string }>;
  wing: string | null;
  flat_number: string;
  valid_from: string;
  valid_until: string;
  code: string;
  status: string;
}
interface AuthorizationInfo {
  id: string;
  category: string;
  pass_mode: "open" | "named";
  visitor_name: string | null;
  visitor_phone: string | null;
  vehicle_number: string | null;
  wing: string | null;
  flat_number: string;
  valid_from: string;
  valid_until: string;
  daily_from: string | null;
  daily_to: string | null;
  code: string | null;
  status: string;
}
interface GateEntry {
  id: string;
  vehicle_number: string;
  visitor_type: string;
  visitor_name: string | null;
  purpose: string | null;
  vehicle_type: string | null;
  wing: string | null;
  flat_number: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  direction: string;
  registered: boolean;
  rejected: boolean;
  scanned_at: string;
  status: string;
  invite_id?: string | null;
  authorization_id?: string | null;
  guests?: Array<{ name: string; phone: string | null; vehicle?: any }>;
  vehicles?: Array<{ number: string; type: string }>;
  // Optional fields the backend may return for attribution
  approved_by?: string | null;
  approved_by_name?: string | null;
  // Optional: flat owner (member) info if backend joins members/users
  member_name?: string | null;
  member_phone?: string | null;
}
interface PassSearchResult {
  id: string;
  kind: "authorization" | "invite";
  purpose: string | null;
  pass_mode?: string | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  vehicle_number: string | null;
  vehicles: Array<{ number: string; type?: string }>;
  guest_count: number;
  wing: string | null;
  flat_number: string;
  valid_from: string;
  valid_until: string;
  status: string;
  code: string | null;
  created_at: string;
  member_user_id: string | null;
  member_name: string | null;
  member_phone: string | null;
  used_count?: number;
}
interface FlatOption {
  member_id: string;
  wing: string | null;
  flat_number: string;
  resident_name: string | null;
  resident_phone: string | null;
}

type PrepassResult =
  | { kind: "invite"; invite: InviteInfo }
  | { kind: "authorization"; authorization: AuthorizationInfo }
  | { kind: "invalid"; reason: string; code: string }
  | null;

type RecentPassAction = {
  at: number;
  action: "in" | "reject";
  entryId: string | null;
  actorName: string | null;
  actorPhone: string | null;
  actorUserId: string | null;
  editCount: number;
};

const PURPOSES: {
  key: Purpose;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: "guest", label: "Guest", icon: "person-outline", color: BLUE },
  {
    key: "delivery",
    label: "Delivery",
    icon: "cube-outline",
    color: "#EA580C",
  },
  { key: "cab", label: "Cab", icon: "car-outline", color: "#7C3AED" },
  {
    key: "service",
    label: "Service",
    icon: "hammer-outline",
    color: "#0891B2",
  },
  {
    key: "other",
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
    color: "#64748B",
  },
];

const EMPTY_GUEST: GuestRow = {
  name: "",
  phone: "",
  vehicleNumber: "",
  vehicleType: "car",
};

function normalizeAccountId(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v.trim() : "";
}
function normalizePlate(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
function shortTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDateLabel(iso: string): string {
  const today = formatDateISO(new Date());
  const yesterday = formatDateISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function fallbackName(purpose?: string | null): string {
  const p = (purpose || "").toLowerCase();
  if (p === "delivery") return "Delivery";
  if (p === "service") return "Service";
  if (p === "cab") return "Cab";
  if (p === "helper") return "Helper";
  if (p === "guest") return "Guest";
  return "Guest";
}
function formatValidity(validFrom: string, validUntil: string): string {
  if (!validFrom || !validUntil) return "";
  const from = new Date(validFrom);
  const until = new Date(validUntil);
  if (isNaN(from.getTime()) || isNaN(until.getTime())) return "";

  const now = new Date();
  const fromToday = from.toDateString() === now.toDateString();
  const untilToday = until.toDateString() === now.toDateString();

  const timeStr = (d: Date) =>
    d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  const dateStr = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const fromH = from.getHours();
  const fromM = from.getMinutes();
  const fromS = from.getSeconds();
  const untilH = until.getHours();
  const untilM = until.getMinutes();

  const startsAtMidnight = fromH === 0 && fromM === 0 && fromS === 0;
  const endsAtEndOfDay = untilH === 23 && untilM >= 55;
  const isFullDay = startsAtMidnight && endsAtEndOfDay;

  if (isFullDay) {
    if (fromToday && untilToday) return "Today · Full day";
    if (fromToday) return `Today – ${dateStr(until)}`;
    return `${dateStr(from)} – ${dateStr(until)}`;
  }

  const fromPart = fromToday ? "Today" : dateStr(from);
  const untilPart = untilToday ? "Today" : dateStr(until);

  if (fromToday && untilToday) {
    return `Today · ${timeStr(from)} – ${timeStr(until)}`;
  }
  return `${fromPart} ${timeStr(from)} – ${untilPart} ${timeStr(until)}`;
}

function formatFlatLabel(wing?: string | null, flat?: string | null): string {
  if (!flat) return "";
  return wing ? `${wing}-${flat}` : flat;
}
function formatFullTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function formatPhone(raw?: string | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten ? `+91 ${ten}` : "";
}
async function getAuthToken(): Promise<string | null> {
  try {
    return await getSecureItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}
function isInvitedEntry(e: GateEntry | null | undefined): boolean {
  if (!e) return false;
  return !!(e.invite_id || e.authorization_id);
}
function isWithinEditWindow(e: GateEntry | null | undefined): boolean {
  if (!e) return false;
  const t = new Date(e.scanned_at).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= EDIT_WINDOW_MS;
}
function formatRemaining(e: GateEntry | null | undefined): string {
  if (!e) return "";
  const t = new Date(e.scanned_at).getTime();
  if (!Number.isFinite(t)) return "";
  const left = EDIT_WINDOW_MS - (Date.now() - t);
  if (left <= 0) return "Expired";
  const totalSec = Math.floor(left / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")} left`;
}

/* ─── Main screen ─────────────────────────────────────────────── */

export default function GateEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const paramAccountId = normalizeAccountId(params.accountId);
  const { selectedAccount } = useAccounts();
  const { user } = useAuthStore();
  const accountId = paramAccountId || selectedAccount?.id || null;

  const currentUserId = (user as any)?.id ?? null;
  const currentUserName = (user as any)?.name ?? null;
  const currentUserPhone = (user as any)?.phone ?? null;

  const [mode, setMode] = useState<Mode>("choose");
  const [prepassResult, setPrepassResult] = useState<PrepassResult>(null);

  const [plate, setPlate] = useState("");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  const [prepassFlat, setPrepassFlat] = useState<FlatOption | null>(null);
  const [prepassFlatPickerOpen, setPrepassFlatPickerOpen] = useState(false);
  const [passResultsModalOpen, setPassResultsModalOpen] = useState(false);

  const [residentQuery, setResidentQuery] = useState("");
  const [residentResults, setResidentResults] = useState<PassSearchResult[]>(
    [],
  );
  const [searchingPasses, setSearchingPasses] = useState(false);
  const [passActionBusy, setPassActionBusy] = useState<string | null>(null);

  const [recentPassActions, setRecentPassActions] = useState<
    Record<string, RecentPassAction>
  >({});

  const [flats, setFlats] = useState<FlatOption[]>([]);
  const [flatsLoading, setFlatsLoading] = useState(false);

  const [manualGuests, setManualGuests] = useState<GuestRow[]>([
    { ...EMPTY_GUEST },
  ]);
  const [manualPurpose, setManualPurpose] = useState<Purpose>("guest");
  const [manualWing, setManualWing] = useState("");
  const [manualFlat, setManualFlat] = useState("");
  const [manualFlatPickerOpen, setManualFlatPickerOpen] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [qrScanned, setQrScanned] = useState(false);

  const [selectedDate, setSelectedDate] = useState(formatDateISO(new Date()));
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editingEntry, setEditingEntry] = useState<GateEntry | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [editPurpose, setEditPurpose] = useState<Purpose>("guest");
  const [editWing, setEditWing] = useState("");
  const [editFlat, setEditFlat] = useState("");
  const [editFlatPickerOpen, setEditFlatPickerOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const [historyPass, setHistoryPass] = useState<PassSearchResult | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GateEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 100000), 1000);
    return () => clearInterval(id);
  }, []);

  const loadFlats = useCallback(async () => {
    if (!accountId) return;
    setFlatsLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-flats`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = await res.json();
      setFlats(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[gate] loadFlats failed:", e);
    } finally {
      setFlatsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadFlats();
  }, [loadFlats]);

  useEffect(() => {
    if (mode !== "prepass") {
      setResidentResults([]);
      setResidentQuery("");
      setPrepassFlat(null);
      setPassResultsModalOpen(false);
    }
  }, [mode]);

  const loadEntries = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!accountId) return;
      if (!opts.silent) setLoadingEntries(true);
      try {
        const token = await getAuthToken();
        if (!token) return;
        const url = `${API_BASE_URL}/management/${accountId}/gate-entries?date=${selectedDate}&limit=200`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setEntries([]);
          return;
        }
        const data: any = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("[gate] loadEntries failed:", e);
        setEntries([]);
      } finally {
        setLoadingEntries(false);
      }
    },
    [accountId, selectedDate],
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries({ silent: true });
    setRefreshing(false);
  }, [loadEntries]);

  const resetToIdle = useCallback(() => {
    setPrepassResult(null);
    setPlate("");
    setCode("");
    setMode("choose");
    setResidentQuery("");
    setResidentResults([]);
    setPrepassFlat(null);
    setPassResultsModalOpen(false);
    setManualGuests([{ ...EMPTY_GUEST }]);
    setManualPurpose("guest");
    setManualWing("");
    setManualFlat("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (historyPass) {
          setHistoryPass(null);
          return true;
        }
        if (passResultsModalOpen) {
          setPassResultsModalOpen(false);
          return true;
        }
        if (editingEntry) {
          setEditingEntry(null);
          return true;
        }
        if (prepassResult !== null) {
          setPrepassResult(null);
          setMode("choose");
          return true;
        }
        if (mode !== "choose") {
          setMode("choose");
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => sub.remove();
    }, [mode, prepassResult, editingEntry, historyPass, passResultsModalOpen]),
  );

  const handleHeaderBack = useCallback(() => {
    if (historyPass) {
      setHistoryPass(null);
      return;
    }
    if (passResultsModalOpen) {
      setPassResultsModalOpen(false);
      return;
    }
    if (editingEntry) {
      setEditingEntry(null);
      return;
    }
    if (prepassResult !== null) {
      setPrepassResult(null);
      setMode("choose");
      return;
    }
    if (mode !== "choose") {
      setMode("choose");
      return;
    }
    router.back();
  }, [
    mode,
    prepassResult,
    editingEntry,
    historyPass,
    passResultsModalOpen,
    router,
  ]);

  const updateGuest = (index: number, patch: Partial<GuestRow>) => {
    setManualGuests((cur) => {
      const next = [...cur];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };
  const addGuestRow = () => {
    setManualGuests((cur) =>
      cur.length >= 20 ? cur : [...cur, { ...EMPTY_GUEST }],
    );
  };
  const removeGuestRow = (index: number) => {
    setManualGuests((cur) =>
      cur.length <= 1 ? cur : cur.filter((_, i) => i !== index),
    );
  };

  const lookupCode = async (rawCode: string) => {
    if (!accountId) return;
    const trimmed = rawCode.trim();
    if (!trimmed) {
      AppAlert.alert({
        title: "Code required",
        message: "Enter the guest's secret code.",
        tone: "warning",
      });
      return;
    }
    setChecking(true);
    setPrepassResult(null);
    try {
      const token = await getAuthToken();
      if (!token) return;
      let result: PrepassResult = null;

      const inviteRes = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-invites/by-code/${encodeURIComponent(trimmed)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (inviteRes.ok) {
        const data = await inviteRes.json();
        if (data?.id) result = { kind: "invite", invite: data };
      }

      if (!result) {
        const authRes = await fetch(
          `${API_BASE_URL}/management/${accountId}/gate-authorizations/by-code/${encodeURIComponent(trimmed)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (authRes.ok) {
          const data = await authRes.json();
          if (data?.id) result = { kind: "authorization", authorization: data };
        } else if (authRes.status === 404) {
          result = { kind: "invalid", reason: "not_found", code: trimmed };
        } else if (authRes.status === 410) {
          result = { kind: "invalid", reason: "cancelled", code: trimmed };
        }
      }
      if (!result)
        result = { kind: "invalid", reason: "not_found", code: trimmed };
      setPrepassResult(result);
    } catch (e: any) {
      AppAlert.alert({
        title: "Lookup failed",
        message: e?.message || "Network error. Please try again.",
        tone: "danger",
      });
    } finally {
      setChecking(false);
    }
  };

  const lookupPlate = async () => {
    const number = normalizePlate(plate);
    if (!accountId) return;
    if (number.length < 5) {
      AppAlert.alert({
        title: "Invalid plate",
        message: "Enter at least 5 characters.",
        tone: "warning",
      });
      return;
    }
    setChecking(true);
    setPrepassResult(null);
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/vehicles/lookup?number=${number}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data: any = await res.json().catch(() => null);

      if (data?.found && data?.owner) {
        setPrepassResult({
          kind: "authorization",
          authorization: {
            id: data.owner.vehicle_id || "",
            category: "resident",
            pass_mode: "open",
            visitor_name: data.owner.owner_name || "Resident",
            visitor_phone: data.owner.owner_phone || null,
            vehicle_number: data.owner.vehicle_number,
            wing: data.owner.wing || null,
            flat_number: data.owner.flat_number || "",
            valid_from: new Date().toISOString(),
            valid_until: new Date(Date.now() + 86400000).toISOString(),
            daily_from: null,
            daily_to: null,
            code: null,
            status: "resident",
          },
        });
        return;
      }

      const invRes = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-invites?limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (invRes.ok) {
        const invs: any[] = await invRes.json();
        const match = Array.isArray(invs)
          ? invs.find((i) => {
              if (i.status !== "active") return false;
              if (i.vehicle_number === number) return true;
              if (Array.isArray(i.vehicles)) {
                return i.vehicles.some((v: any) => v?.number === number);
              }
              return false;
            })
          : null;
        if (match) {
          setPrepassResult({
            kind: "invite",
            invite: { ...match, vehicles: match.vehicles ?? [] },
          });
          return;
        }
      }

      AppAlert.alert({
        title: "No match found",
        message: `No registered vehicle or invite matches ${number}. Use Manual Entry to log a visitor.`,
        tone: "info",
        buttons: [
          { text: "Cancel", style: "cancel" },
          {
            text: "Manual entry",
            onPress: () => {
              setPlate("");
              setManualGuests([{ ...EMPTY_GUEST, vehicleNumber: number }]);
              setMode("manual");
            },
          },
        ],
      });
    } catch (e: any) {
      AppAlert.alert({
        title: "Lookup failed",
        message: e?.message || "Network error.",
        tone: "danger",
      });
    } finally {
      setChecking(false);
    }
  };

  const handleQrScanned = async ({ data }: { data: string }) => {
    if (qrScanned || !accountId) return;
    setQrScanned(true);
    try {
      const trimmed = String(data || "").trim();
      if (!trimmed) {
        setQrScanned(false);
        return;
      }
      await lookupCode(trimmed);
      setMode("prepass");
      setQrScanned(false);
    } catch (e: any) {
      AppAlert.alert({
        title: "QR scan failed",
        message: e?.message || "Please try again.",
        tone: "danger",
      });
      setQrScanned(false);
    }
  };

  const logPassAction = useCallback(
    async (
      kind: "invite" | "authorization",
      passId: string,
      action: "in" | "reject",
    ): Promise<{ ok: boolean; message?: string; entryId?: string | null }> => {
      if (!accountId || !passId)
        return { ok: false, message: "Missing pass id" };
      const token = await getAuthToken();
      if (!token) return { ok: false, message: "Not signed in" };
      try {
        const res = await fetch(
          `${API_BASE_URL}/management/${accountId}/gate-passes/action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ kind, passId, action }),
          },
        );
        if (!res.ok) {
          let msg = "Could not log entry.";
          try {
            const j = await res.json();
            msg = j?.message || msg;
          } catch {}
          return { ok: false, message: msg };
        }
        const data: any = await res.json().catch(() => null);
        return { ok: true, entryId: data?.entry_id ?? null };
      } catch (e: any) {
        return { ok: false, message: e?.message || "Network error" };
      }
    },
    [accountId],
  );

  const patchEntryStatus = useCallback(
    async (
      entryId: string,
      action: "in" | "reject",
    ): Promise<{ ok: boolean; message?: string }> => {
      if (!accountId || !entryId)
        return { ok: false, message: "Missing entry id" };
      const token = await getAuthToken();
      if (!token) return { ok: false, message: "Not signed in" };
      const nextStatus = action === "in" ? "approved" : "rejected";
      try {
        const res = await fetch(
          `${API_BASE_URL}/management/${accountId}/gate-entries/${entryId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: nextStatus }),
          },
        );
        if (!res.ok) {
          let msg = "Could not update decision.";
          try {
            const j = await res.json();
            msg = j?.message || msg;
          } catch {}
          return { ok: false, message: msg };
        }
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: e?.message || "Network error" };
      }
    },
    [accountId],
  );

  const searchPassesForFlat = useCallback(
    async (f: FlatOption) => {
      if (!accountId) return;
      setSearchingPasses(true);
      setResidentResults([]);
      try {
        const token = await getAuthToken();
        if (!token) return;
        const params = new URLSearchParams();
        params.set("flatNumber", f.flat_number);
        if (f.wing) params.set("wing", f.wing);
        const url = `${API_BASE_URL}/management/${accountId}/gate-passes/search?${params.toString()}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          let msg = "Search failed.";
          try {
            const j = await res.json();
            msg = j?.message || msg;
          } catch {}
          AppAlert.alert({ title: "Failed", message: msg, tone: "danger" });
          return;
        }
        const data = await res.json();
        const list: PassSearchResult[] = Array.isArray(data) ? data : [];
        setResidentResults(list);
      } catch (e: any) {
        AppAlert.alert({
          title: "Network error",
          message: e?.message || "Please try again.",
          tone: "danger",
        });
      } finally {
        setSearchingPasses(false);
      }
    },
    [accountId],
  );

  const onSelectPrepassFlat = useCallback(
    async (f: FlatOption) => {
      setPrepassFlat(f);
      setPrepassFlatPickerOpen(false);
      setPassResultsModalOpen(true);
      await searchPassesForFlat(f);
    },
    [searchPassesForFlat],
  );

  const refreshPassResults = useCallback(async () => {
    if (!prepassFlat) return;
    await searchPassesForFlat(prepassFlat);
  }, [prepassFlat, searchPassesForFlat]);

  const handlePassAction = async (
    pass: PassSearchResult,
    action: "in" | "reject",
  ) => {
    const key = `${pass.kind}:${pass.id}`;
    const recent = recentPassActions[key];
    const now = Date.now();
    const withinWindow = recent && now - recent.at < EDIT_WINDOW_MS;

    if (withinWindow && recent) {
      if (recent.action === action) {
        const remainingSec = Math.max(
          1,
          Math.ceil((EDIT_WINDOW_MS - (now - recent.at)) / 1000),
        );
        AppAlert.alert({
          title: "Already logged",
          message: `This pass was already ${
            action === "in" ? "allowed" : "rejected"
          }. Only one entry is recorded per 5-minute window. Try again in ${remainingSec}s.`,
          tone: "info",
        });
        return;
      }

      if (!recent.entryId) {
        AppAlert.alert({
          title: "Cannot change",
          message:
            "The original entry is not linked. Please wait for the window to expire and log again.",
          tone: "warning",
        });
        return;
      }

      setPassActionBusy(key);
      try {
        const patched = await patchEntryStatus(recent.entryId, action);
        if (!patched.ok) {
          AppAlert.alert({
            title: "Couldn't change decision",
            message: patched.message || "Please try again.",
            tone: "danger",
          });
          return;
        }
        setRecentPassActions((cur) => ({
          ...cur,
          [key]: {
            ...recent,
            at: now,
            action,
            editCount: recent.editCount + 1,
          },
        }));
        AppAlert.alert({
          title: action === "in" ? "Allowed" : "Rejected",
          message:
            action === "in"
              ? "Decision changed to Allow. Still counts as one entry."
              : "Decision changed to Reject. Still counts as one entry.",
          tone: action === "in" ? "success" : "warning",
        });
        await refreshPassResults();
        setTimeout(() => {
          void loadEntries({ silent: true });
        }, 300);
      } finally {
        setPassActionBusy(null);
      }
      return;
    }

    setPassActionBusy(key);
    try {
      const result = await logPassAction(pass.kind, pass.id, action);
      if (!result.ok) {
        AppAlert.alert({
          title: "Couldn't log entry",
          message:
            result.message ||
            "The pass may have been cancelled or removed. Pull down to refresh.",
          tone: "danger",
        });
        return;
      }
      setRecentPassActions((cur) => ({
        ...cur,
        [key]: {
          at: now,
          action,
          entryId: result.entryId ?? null,
          actorName: currentUserName,
          actorPhone: currentUserPhone,
          actorUserId: currentUserId,
          editCount: 0,
        },
      }));
      const label = pass.visitor_name || fallbackName(pass.purpose);
      AppAlert.alert({
        title: action === "in" ? "Allowed" : "Rejected",
        message:
          action === "in"
            ? `${label} may enter.`
            : `${label} will not be allowed in.`,
        tone: action === "in" ? "success" : "warning",
      });
      await refreshPassResults();
      setTimeout(() => {
        void loadEntries({ silent: true });
      }, 400);
    } finally {
      setPassActionBusy(null);
    }
  };

  const openHistory = async (pass: PassSearchResult) => {
    if (!accountId) return;
    setHistoryPass(pass);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const url = `${API_BASE_URL}/management/${accountId}/gate-passes/${pass.kind}/${pass.id}/history`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setHistoryEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[gate] openHistory failed:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const submitManualEntry = async (opts: { askResident: boolean }) => {
    const cleaned = manualGuests
      .map((g) => ({
        name: g.name.trim(),
        phone: g.phone.replace(/\D/g, ""),
        vehicleNumber: normalizePlate(g.vehicleNumber),
        vehicleType: g.vehicleType,
      }))
      .filter((g) => g.name.length > 0);

    if (cleaned.length === 0) {
      AppAlert.alert({
        title: "Name required",
        message: "Please enter at least one guest name.",
        tone: "warning",
      });
      return;
    }
    if (!manualFlat.trim()) {
      AppAlert.alert({
        title: "Flat required",
        message: "Please choose the flat they're visiting.",
        tone: "warning",
      });
      return;
    }
    if (!accountId) {
      AppAlert.alert({
        title: "Missing account",
        message: "Please reopen this screen from the app.",
        tone: "danger",
      });
      return;
    }

    const guestsPayload = cleaned.map((g) => ({
      name: g.name,
      phone: g.phone || undefined,
      vehicle: g.vehicleNumber
        ? { number: g.vehicleNumber, type: g.vehicleType }
        : undefined,
    }));

    try {
      const token = await getAuthToken();
      if (!token) {
        AppAlert.alert({
          title: "Not signed in",
          message: "Please log in again.",
          tone: "danger",
        });
        return;
      }
      const url = `${API_BASE_URL}/management/${accountId}/gate-entries`;
      const body = {
        mode: "manual",
        visitorType: "visitor",
        guests: guestsPayload,
        purpose: manualPurpose,
        direction: "in",
        wing: manualWing.trim() || null,
        flatNumber: manualFlat.trim(),
        autoApprove: !opts.askResident,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        let msg = "Could not log entry.";
        try {
          msg = JSON.parse(raw)?.message || msg;
        } catch {}
        AppAlert.alert({ title: "Failed", message: msg, tone: "danger" });
        return;
      }
      const label =
        cleaned.length === 1
          ? cleaned[0].name
          : `${cleaned[0].name} + ${cleaned.length - 1}`;
      AppAlert.alert({
        title: opts.askResident ? "Resident asked" : "Allowed",
        message: opts.askResident
          ? `${label} is waiting for resident approval.`
          : `${label} is now allowed to enter.`,
        tone: opts.askResident ? "info" : "success",
      });
      resetToIdle();
      setTimeout(() => {
        void loadEntries({ silent: true });
      }, 400);
    } catch (e: any) {
      AppAlert.alert({
        title: "Network error",
        message: e?.message || "Please try again.",
        tone: "danger",
      });
    }
  };

  const getPrepassKey = (
    result: PrepassResult,
  ): {
    key: string;
    kind: "invite" | "authorization";
    id: string;
    label: string;
  } | null => {
    if (!result) return null;
    if (result.kind === "invite") {
      return {
        key: `invite:${result.invite.id}`,
        kind: "invite",
        id: result.invite.id,
        label: result.invite.guest_name || fallbackName(result.invite.purpose),
      };
    }
    if (result.kind === "authorization") {
      return {
        key: `authorization:${result.authorization.id}`,
        kind: "authorization",
        id: result.authorization.id,
        label:
          result.authorization.visitor_name ||
          fallbackName(result.authorization.category),
      };
    }
    return null;
  };

  const allowPrepass = async () => {
    if (!prepassResult || !accountId) return;

    const info = getPrepassKey(prepassResult);
    if (!info) {
      resetToIdle();
      return;
    }
    const { key, id, label } = info;
    const now = Date.now();
    const recent = recentPassActions[key];
    const withinWindow = recent && now - recent.at < EDIT_WINDOW_MS;

    if (withinWindow && recent && recent.action === "in") {
      const remainingSec = Math.max(
        1,
        Math.ceil((EDIT_WINDOW_MS - (now - recent.at)) / 1000),
      );
      AppAlert.alert({
        title: "Already logged",
        message: `This pass was already allowed. Only one entry per 5-minute window. Try again in ${remainingSec}s.`,
        tone: "info",
      });
      return;
    }

    if (withinWindow && recent && recent.action !== "in" && recent.entryId) {
      const patched = await patchEntryStatus(recent.entryId, "in");
      if (!patched.ok) {
        AppAlert.alert({
          title: "Couldn't change decision",
          message: patched.message || "Please try again.",
          tone: "danger",
        });
        return;
      }
      setRecentPassActions((cur) => ({
        ...cur,
        [key]: {
          ...recent,
          at: now,
          action: "in",
          editCount: recent.editCount + 1,
        },
      }));
      AppAlert.alert({
        title: "Allowed",
        message: `${label} may enter. Still counts as one entry.`,
        tone: "success",
      });
      resetToIdle();
      setTimeout(() => {
        void loadEntries({ silent: true });
      }, 300);
      return;
    }

    if (prepassResult.kind === "invite") {
      const r = await logPassAction("invite", id, "in");
      if (!r.ok) {
        AppAlert.alert({
          title: "Could not log entry",
          message: r.message || "Please try again.",
          tone: "danger",
        });
        return;
      }
      setRecentPassActions((cur) => ({
        ...cur,
        [key]: {
          at: now,
          action: "in",
          entryId: r.entryId ?? null,
          actorName: currentUserName,
          actorPhone: currentUserPhone,
          actorUserId: currentUserId,
          editCount: 0,
        },
      }));
    } else if (prepassResult.kind === "authorization") {
      const a = prepassResult.authorization;
      if (a.status === "resident") {
        const token = await getAuthToken();
        if (token) {
          try {
            await fetch(
              `${API_BASE_URL}/management/${accountId}/gate-entries`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  mode: "manual",
                  visitorType: "resident",
                  visitorName: a.visitor_name || "Resident",
                  vehicleNumber: a.vehicle_number || undefined,
                  flatNumber: a.flat_number || undefined,
                  wing: a.wing || null,
                  purpose: "other",
                  direction: "in",
                  autoApprove: true,
                }),
              },
            );
          } catch {}
        }
      } else {
        const r = await logPassAction("authorization", id, "in");
        if (!r.ok) {
          AppAlert.alert({
            title: "Could not log entry",
            message: r.message || "Please try again.",
            tone: "danger",
          });
          return;
        }
        setRecentPassActions((cur) => ({
          ...cur,
          [key]: {
            at: now,
            action: "in",
            entryId: r.entryId ?? null,
            actorName: currentUserName,
            actorPhone: currentUserPhone,
            actorUserId: currentUserId,
            editCount: 0,
          },
        }));
      }
    }

    AppAlert.alert({
      title: "Allowed",
      message: `${label} may enter.`,
      tone: "success",
    });
    resetToIdle();
    setTimeout(() => {
      void loadEntries({ silent: true });
    }, 400);
  };

  const rejectPrepass = async () => {
    if (!prepassResult || !accountId) {
      resetToIdle();
      return;
    }

    const info = getPrepassKey(prepassResult);
    if (!info) {
      resetToIdle();
      return;
    }
    const { key, id, label } = info;
    const now = Date.now();
    const recent = recentPassActions[key];
    const withinWindow = recent && now - recent.at < EDIT_WINDOW_MS;

    if (withinWindow && recent && recent.action === "reject") {
      const remainingSec = Math.max(
        1,
        Math.ceil((EDIT_WINDOW_MS - (now - recent.at)) / 1000),
      );
      AppAlert.alert({
        title: "Already logged",
        message: `This pass was already rejected. Only one entry per 5-minute window. Try again in ${remainingSec}s.`,
        tone: "info",
      });
      return;
    }

    if (
      withinWindow &&
      recent &&
      recent.action !== "reject" &&
      recent.entryId
    ) {
      const patched = await patchEntryStatus(recent.entryId, "reject");
      if (!patched.ok) {
        AppAlert.alert({
          title: "Couldn't change decision",
          message: patched.message || "Please try again.",
          tone: "danger",
        });
        return;
      }
      setRecentPassActions((cur) => ({
        ...cur,
        [key]: {
          ...recent,
          at: now,
          action: "reject",
          editCount: recent.editCount + 1,
        },
      }));
      AppAlert.alert({
        title: "Rejected",
        message: `${label} will not be allowed in. Still counts as one entry.`,
        tone: "warning",
      });
      resetToIdle();
      setTimeout(() => {
        void loadEntries({ silent: true });
      }, 300);
      return;
    }

    if (prepassResult.kind === "invite") {
      const r = await logPassAction("invite", id, "reject");
      if (r.ok) {
        setRecentPassActions((cur) => ({
          ...cur,
          [key]: {
            at: now,
            action: "reject",
            entryId: r.entryId ?? null,
            actorName: currentUserName,
            actorPhone: currentUserPhone,
            actorUserId: currentUserId,
            editCount: 0,
          },
        }));
      }
    } else if (prepassResult.kind === "authorization") {
      const a = prepassResult.authorization;
      if (a.status !== "resident") {
        const r = await logPassAction("authorization", id, "reject");
        if (r.ok) {
          setRecentPassActions((cur) => ({
            ...cur,
            [key]: {
              at: now,
              action: "reject",
              entryId: r.entryId ?? null,
              actorName: currentUserName,
              actorPhone: currentUserPhone,
              actorUserId: currentUserId,
              editCount: 0,
            },
          }));
        }
      }
    }

    AppAlert.alert({
      title: "Rejected",
      message: `${label || "Visitor"} will not be allowed in.`,
      tone: "warning",
    });
    resetToIdle();
    setTimeout(() => {
      void loadEntries({ silent: true });
    }, 400);
  };

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDateISO(d));
  };
  const isToday = selectedDate === formatDateISO(new Date());

  const openEditEntry = (entry: GateEntry) => {
    if (!isWithinEditWindow(entry)) return;
    setEditingEntry(entry);
    setEditName(entry.visitor_name || "");
    setEditPhone((entry.owner_phone || "").replace(/\D/g, "").slice(-10));
    setEditVehicle(
      entry.vehicle_number && entry.vehicle_number !== "NO-VEHICLE"
        ? entry.vehicle_number
        : "",
    );
    setEditPurpose(
      (["guest", "delivery", "cab", "service", "other"] as Purpose[]).includes(
        (entry.purpose as Purpose) ?? "guest",
      )
        ? ((entry.purpose as Purpose) ?? "guest")
        : "guest",
    );
    setEditWing(entry.wing || "");
    setEditFlat(entry.flat_number || "");
  };

  const closeEditEntry = () => {
    if (editSaving) return;
    setEditingEntry(null);
  };

  const saveEditedEntry = async () => {
    if (!editingEntry || !accountId) return;
    if (!isWithinEditWindow(editingEntry)) {
      AppAlert.alert({
        title: "Edit window expired",
        message: "You can only edit a manual entry within 5 minutes.",
        tone: "warning",
      });
      return;
    }
    if (!editName.trim()) {
      AppAlert.alert({
        title: "Name required",
        message: "Please enter a name.",
        tone: "warning",
      });
      return;
    }
    if (!editFlat.trim()) {
      AppAlert.alert({
        title: "Flat required",
        message: "Please choose the flat they're visiting.",
        tone: "warning",
      });
      return;
    }
    setEditSaving(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const plate = normalizePlate(editVehicle);
      const body = {
        visitor_name: editName.trim(),
        visitor_phone: editPhone.replace(/\D/g, "") || null,
        purpose: editPurpose,
        wing: editWing.trim() || null,
        flatNumber: editFlat.trim(),
        direction: "in",
        guests: [
          {
            name: editName.trim(),
            phone: editPhone.replace(/\D/g, "") || undefined,
            vehicle: plate ? { number: plate, type: "car" } : undefined,
          },
        ],
      };
      const url = `${API_BASE_URL}/management/${accountId}/gate-entries/${editingEntry.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        let msg = "Could not save changes.";
        try {
          msg = JSON.parse(raw)?.message || msg;
        } catch {}
        AppAlert.alert({ title: "Failed", message: msg, tone: "danger" });
        return;
      }
      setEditingEntry(null);
      setTimeout(() => {
        void loadEntries({ silent: true });
      }, 300);
    } catch (e: any) {
      AppAlert.alert({
        title: "Network error",
        message: e?.message || "Please try again.",
        tone: "danger",
      });
    } finally {
      setEditSaving(false);
    }
  };

  const changeInvitedStatus = async (nextStatus: "approved" | "rejected") => {
    if (!editingEntry || !accountId) return;
    if (!isWithinEditWindow(editingEntry)) {
      AppAlert.alert({
        title: "Edit window expired",
        message: "You can only change invited entries within 5 minutes.",
        tone: "warning",
      });
      return;
    }
    setEditSaving(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const url = `${API_BASE_URL}/management/${accountId}/gate-entries/${editingEntry.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const raw = await res.text();
      if (!res.ok) {
        let msg = "Could not update status.";
        try {
          msg = JSON.parse(raw)?.message || msg;
        } catch {}
        AppAlert.alert({ title: "Failed", message: msg, tone: "danger" });
        return;
      }
      setEditingEntry(null);
      setTimeout(() => {
        void loadEntries({ silent: true });
      }, 300);
    } catch (e: any) {
      AppAlert.alert({
        title: "Network error",
        message: e?.message || "Please try again.",
        tone: "danger",
      });
    } finally {
      setEditSaving(false);
    }
  };

  const invitedEditOpen = isInvitedEntry(editingEntry);
  const editWindowExpired = !!editingEntry && !isWithinEditWindow(editingEntry);

  return (
    <DarkModeBoundary>
      <Stack.Screen
        options={{
          title: "Gate Entry",
          headerLeft: () => (
            <TouchableOpacity
              onPress={handleHeaderBack}
              style={{ padding: 6 }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color={BLUE} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BLUE}
            />
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {mode === "choose" && !prepassResult ? renderChoose() : null}
          {mode === "prepass" && !prepassResult ? renderPrepass() : null}
          {mode === "manual" && !prepassResult ? renderManual() : null}
          {prepassResult ? renderPrepassResult() : null}

          <View style={styles.logSection}>
            <View style={styles.logHeader}>
              <Text style={styles.logTitle}>Recent</Text>
              <View style={styles.dateNav}>
                <TouchableOpacity
                  onPress={() => shiftDate(-1)}
                  style={styles.dateArrow}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={16} color={BLUE} />
                </TouchableOpacity>
                <Text style={styles.dateLabel}>
                  {formatDateLabel(selectedDate)}
                </Text>
                <TouchableOpacity
                  onPress={() => shiftDate(1)}
                  style={styles.dateArrow}
                  activeOpacity={0.7}
                  disabled={isToday}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={isToday ? "#CBD5E1" : BLUE}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {loadingEntries && entries.length === 0 ? (
              <View style={styles.logEmpty}>
                <ActivityIndicator color={BLUE} />
              </View>
            ) : entries.length === 0 ? (
              <View style={styles.logEmpty}>
                <Ionicons name="time-outline" size={26} color="#94A3B8" />
                <Text style={styles.logEmptyText}>No entries for this day</Text>
              </View>
            ) : (
              <View style={styles.logList}>
                {entries.map((e) => {
                  const guestCount = Array.isArray(e.guests)
                    ? e.guests.length
                    : 1;
                  const vehicleCount = Array.isArray(e.vehicles)
                    ? e.vehicles.length
                    : e.vehicle_number
                      ? 1
                      : 0;
                  const pending = e.status === "pending_approval";
                  const invited = isInvitedEntry(e);
                  const canEdit = isWithinEditWindow(e);

                  // ── Flat owner info ───────────────────────────────────
                  const flatOwnerName = e.member_name || null;
                  const flatOwnerPhone = formatPhone(e.member_phone);

                  // ── Who allowed / rejected (attribution) ──────────────
                  const approvedById = e.approved_by || null;
                  const approvedByName = e.approved_by_name || null;
                  const isApprovedBySelf = !!(
                    approvedById &&
                    currentUserId &&
                    approvedById === currentUserId
                  );
                  const approverLabel = approvedByName
                    ? isApprovedBySelf
                      ? "You"
                      : approvedByName
                    : null;

                  // ── Title: flat · flat owner · purpose ────────────────
                  const purposeLabel = e.purpose
                    ? e.purpose.charAt(0).toUpperCase() + e.purpose.slice(1)
                    : null;
                  const flatLabel = e.flat_number
                    ? `${e.wing ? e.wing + "-" : ""}${e.flat_number}`
                    : null;
                  const titleParts = [
                    flatLabel,
                    flatOwnerName,
                    purposeLabel,
                  ].filter(Boolean);
                  const titleText = titleParts.length
                    ? titleParts.join(" · ")
                    : e.visitor_name ||
                      (e.purpose === "delivery" ? "Delivery" : "Guest");

                  // ── Sub-line: visitor · phone · Approved by · remaining ─
                  const subParts = [
                    e.visitor_name,
                    flatOwnerPhone || null,
                    approverLabel && !pending
                      ? `${
                          e.rejected ? "Rejected" : "Allowed"
                        } by ${approverLabel}`
                      : null,
                    invited && !pending && canEdit ? formatRemaining(e) : null,
                  ].filter(Boolean);
                  const subText = subParts.join(" · ");

                  const purposeIcon: keyof typeof Ionicons.glyphMap | null =
                    (() => {
                      const p = (e.purpose || "").toLowerCase();
                      if (p === "delivery") return "cube-outline";
                      if (p === "cab") return "car-outline";
                      if (p === "service") return "hammer-outline";
                      if (p === "guest") return "person-outline";
                      return null;
                    })();

                  const iconName: keyof typeof Ionicons.glyphMap = e.rejected
                    ? "close-circle"
                    : pending
                      ? "time-outline"
                      : e.visitor_type === "resident"
                        ? "car"
                        : (purposeIcon ??
                          (vehicleCount > 0 ? "car-outline" : "walk"));

                  return (
                    <View key={e.id} style={styles.logRow}>
                      <View style={styles.logRowLeft}>
                        <Ionicons
                          name={iconName}
                          size={16}
                          color={
                            e.rejected
                              ? RED
                              : pending
                                ? AMBER
                                : e.visitor_type === "resident"
                                  ? GREEN
                                  : BLUE
                          }
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.logRowTitle} numberOfLines={1}>
                            {titleText}
                          </Text>
                          {subText ? (
                            <Text style={styles.logRowSub} numberOfLines={1}>
                              {subText}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.logRowRight}>
                        <Text
                          style={[
                            styles.logDir,
                            {
                              color: e.rejected
                                ? RED
                                : pending
                                  ? AMBER
                                  : e.direction === "in"
                                    ? GREEN
                                    : AMBER,
                            },
                          ]}
                        >
                          {e.rejected
                            ? "REJ"
                            : pending
                              ? "PEND"
                              : e.direction === "in"
                                ? "IN"
                                : "OUT"}
                        </Text>
                        <Text style={styles.logTime}>
                          {shortTime(e.scanned_at)}
                        </Text>
                      </View>
                      {canEdit ? (
                        <TouchableOpacity
                          style={styles.logEditBtn}
                          onPress={() => openEditEntry(e)}
                          activeOpacity={0.7}
                          hitSlop={8}
                        >
                          <Ionicons
                            name="create-outline"
                            size={18}
                            color={BLUE}
                          />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.logEditBtnDisabled} />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        <Modal
          visible={mode === "qr"}
          animationType="slide"
          onRequestClose={() => setMode("prepass")}
        >
          <View style={styles.qrContainer}>
            {!permission?.granted ? (
              <View style={styles.qrPermWrap}>
                <Ionicons name="camera-outline" size={40} color={BLUE} />
                <Text style={styles.qrPermTitle}>Camera permission needed</Text>
                <Text style={styles.qrPermText}>
                  We need camera access to scan the guest's QR code.
                </Text>
                <TouchableOpacity
                  style={styles.qrPermBtn}
                  onPress={requestPermission}
                  activeOpacity={0.85}
                >
                  <Text style={styles.qrPermBtnText}>Grant permission</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={qrScanned ? undefined : handleQrScanned}
                />
                <View style={styles.qrOverlay} pointerEvents="none">
                  <View style={styles.qrFrame} />
                </View>
                <View
                  style={[styles.qrHeader, { paddingTop: insets.top + 12 }]}
                >
                  <TouchableOpacity
                    style={styles.qrClose}
                    onPress={() => setMode("prepass")}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.qrTitle}>Scan guest QR</Text>
                </View>
              </>
            )}
          </View>
        </Modal>

        <Modal
          visible={!!editingEntry}
          transparent
          animationType="slide"
          onRequestClose={closeEditEntry}
        >
          <View style={styles.editBackdrop}>
            <View
              style={[
                styles.editSheet,
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}
            >
              <View style={styles.editHandle} />
              {editingEntry ? (
                <ScrollView
                  contentContainerStyle={styles.editScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {invitedEditOpen ? (
                    <>
                      <View style={styles.editHeader}>
                        <View
                          style={[
                            styles.editBadge,
                            { backgroundColor: "#F5F3FF" },
                          ]}
                        >
                          <Ionicons
                            name="qr-code-outline"
                            size={22}
                            color="#7C3AED"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.editTitle}>
                            {editingEntry.visitor_name ||
                              fallbackName(editingEntry.purpose)}
                          </Text>
                          <Text style={styles.editSubtitle}>
                            Invited ·{" "}
                            {formatFlatLabel(
                              editingEntry.wing,
                              editingEntry.flat_number,
                            )}
                          </Text>
                        </View>
                      </View>
                      <WindowBanner
                        expired={editWindowExpired}
                        entry={editingEntry}
                        verb="Allow or Reject"
                      />
                      <View style={styles.editActionRow}>
                        <TouchableOpacity
                          style={[
                            styles.rejectBtn,
                            (editWindowExpired || editSaving) && {
                              opacity: 0.5,
                            },
                          ]}
                          onPress={() => changeInvitedStatus("rejected")}
                          disabled={editWindowExpired || editSaving}
                          activeOpacity={0.85}
                        >
                          {editSaving ? (
                            <ActivityIndicator size="small" color={RED} />
                          ) : (
                            <>
                              <Ionicons
                                name="close-circle-outline"
                                size={18}
                                color={RED}
                              />
                              <Text style={styles.rejectBtnText}>Reject</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.allowBtn,
                            (editWindowExpired || editSaving) && {
                              opacity: 0.5,
                            },
                          ]}
                          onPress={() => changeInvitedStatus("approved")}
                          disabled={editWindowExpired || editSaving}
                          activeOpacity={0.85}
                        >
                          {editSaving ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color="#fff"
                              />
                              <Text style={styles.allowBtnText}>Allow</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.ghostBtn, { marginTop: 10 }]}
                        onPress={closeEditEntry}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.ghostBtnText}>Close</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <View style={styles.editHeader}>
                        <View
                          style={[
                            styles.editBadge,
                            { backgroundColor: BLUE_LIGHT },
                          ]}
                        >
                          <Ionicons
                            name="create-outline"
                            size={22}
                            color={BLUE}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.editTitle}>Edit entry</Text>
                          <Text style={styles.editSubtitle}>
                            Update the details and save.
                          </Text>
                        </View>
                      </View>
                      <WindowBanner
                        expired={editWindowExpired}
                        entry={editingEntry}
                        verb="edit this entry"
                      />

                      <Text style={styles.inputLabel}>Name</Text>
                      <View style={styles.inputWrap}>
                        <Ionicons
                          name="person-outline"
                          size={18}
                          color="#94A3B8"
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Suresh Kumar"
                          placeholderTextColor="#A1AAB8"
                          value={editName}
                          onChangeText={setEditName}
                          editable={!editWindowExpired}
                        />
                      </View>

                      <Text style={styles.inputLabel}>Phone (optional)</Text>
                      <View style={styles.inputWrap}>
                        <Ionicons
                          name="call-outline"
                          size={18}
                          color="#94A3B8"
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="9876543210"
                          placeholderTextColor="#A1AAB8"
                          keyboardType="number-pad"
                          maxLength={10}
                          value={editPhone}
                          onChangeText={(t) =>
                            setEditPhone(t.replace(/\D/g, ""))
                          }
                          editable={!editWindowExpired}
                        />
                      </View>

                      <Text style={styles.inputLabel}>
                        Vehicle number (optional)
                      </Text>
                      <View style={styles.inputWrap}>
                        <Ionicons
                          name="car-outline"
                          size={18}
                          color="#94A3B8"
                        />
                        <TextInput
                          style={[styles.input, { letterSpacing: 1 }]}
                          placeholder="e.g. KA01AB1234"
                          placeholderTextColor="#A1AAB8"
                          autoCapitalize="characters"
                          autoCorrect={false}
                          value={editVehicle}
                          onChangeText={(t) =>
                            setEditVehicle(normalizePlate(t))
                          }
                          editable={!editWindowExpired}
                        />
                      </View>

                      <Text style={styles.inputLabel}>Purpose</Text>
                      <View style={styles.purposeRow}>
                        {PURPOSES.map((p) => {
                          const selected = editPurpose === p.key;
                          return (
                            <TouchableOpacity
                              key={p.key}
                              style={[
                                styles.purposeChip,
                                selected && {
                                  backgroundColor: p.color,
                                  borderColor: p.color,
                                },
                                editWindowExpired && { opacity: 0.5 },
                              ]}
                              onPress={() =>
                                !editWindowExpired && setEditPurpose(p.key)
                              }
                              disabled={editWindowExpired}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={p.icon}
                                size={14}
                                color={selected ? "#fff" : p.color}
                              />
                              <Text
                                style={[
                                  styles.purposeChipText,
                                  selected && { color: "#fff" },
                                ]}
                              >
                                {p.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text style={styles.inputLabel}>Flat</Text>
                      <TouchableOpacity
                        style={[styles.inputWrap, styles.flatPickerField]}
                        onPress={() =>
                          !editWindowExpired && setEditFlatPickerOpen(true)
                        }
                        activeOpacity={0.8}
                        disabled={editWindowExpired}
                      >
                        <Ionicons
                          name="home-outline"
                          size={18}
                          color="#94A3B8"
                        />
                        <Text
                          numberOfLines={1}
                          style={
                            editFlat
                              ? styles.flatPickerText
                              : styles.flatPickerPlaceholder
                          }
                        >
                          {editFlat
                            ? formatFlatLabel(editWing, editFlat)
                            : "Tap to choose flat"}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>

                      <View style={styles.editActionRow}>
                        <TouchableOpacity
                          style={[
                            styles.ghostBtn,
                            { flex: 1, marginTop: 0 },
                            editSaving && { opacity: 0.5 },
                          ]}
                          onPress={closeEditEntry}
                          disabled={editSaving}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.ghostBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.allowBtn,
                            (editSaving || editWindowExpired) && {
                              opacity: 0.5,
                            },
                          ]}
                          onPress={saveEditedEntry}
                          disabled={editSaving || editWindowExpired}
                          activeOpacity={0.85}
                        >
                          {editSaving ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color="#fff"
                              />
                              <Text style={styles.allowBtnText}>
                                Save changes
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>

        <FlatPickerModal
          visible={manualFlatPickerOpen}
          onClose={() => setManualFlatPickerOpen(false)}
          flats={flats}
          loading={flatsLoading}
          currentWing={manualWing}
          currentFlat={manualFlat}
          onSelect={(f) => {
            setManualWing(f.wing || "");
            setManualFlat(f.flat_number);
            setManualFlatPickerOpen(false);
          }}
        />

        <FlatPickerModal
          visible={editFlatPickerOpen}
          onClose={() => setEditFlatPickerOpen(false)}
          flats={flats}
          loading={flatsLoading}
          currentWing={editWing}
          currentFlat={editFlat}
          onSelect={(f) => {
            setEditWing(f.wing || "");
            setEditFlat(f.flat_number);
            setEditFlatPickerOpen(false);
          }}
        />

        <FlatPickerModal
          visible={prepassFlatPickerOpen}
          onClose={() => setPrepassFlatPickerOpen(false)}
          flats={flats}
          loading={flatsLoading}
          currentWing={prepassFlat?.wing || ""}
          currentFlat={prepassFlat?.flat_number || ""}
          onSelect={onSelectPrepassFlat}
        />

        <Modal
          visible={passResultsModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setPassResultsModalOpen(false)}
        >
          <View style={styles.editBackdrop}>
            <View
              style={[
                styles.editSheet,
                {
                  paddingBottom: Math.max(insets.bottom, 20) + 8,
                  maxHeight: "92%",
                },
              ]}
            >
              <View style={styles.editHandle} />

              <View style={styles.editHeader}>
                <View
                  style={[styles.editBadge, { backgroundColor: BLUE_LIGHT }]}
                >
                  <Ionicons name="key-outline" size={22} color={BLUE} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.editTitle} numberOfLines={1}>
                    {prepassFlat
                      ? formatFlatLabel(
                          prepassFlat.wing,
                          prepassFlat.flat_number,
                        )
                      : "Active passes"}
                  </Text>
                  <Text style={styles.editSubtitle} numberOfLines={1}>
                    {prepassFlat?.resident_name
                      ? `${prepassFlat.resident_name}${
                          prepassFlat.resident_phone
                            ? ` · ${formatPhone(prepassFlat.resident_phone)}`
                            : ""
                        } · `
                      : ""}
                    {searchingPasses
                      ? "Searching…"
                      : residentResults.length === 0
                        ? "No active passes"
                        : `${residentResults.length} active ${
                            residentResults.length === 1 ? "pass" : "passes"
                          }`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalIconBtn}
                  onPress={() =>
                    prepassFlat && searchPassesForFlat(prepassFlat)
                  }
                  disabled={searchingPasses}
                  activeOpacity={0.7}
                >
                  {searchingPasses ? (
                    <ActivityIndicator size="small" color={BLUE} />
                  ) : (
                    <Ionicons name="refresh" size={18} color={BLUE} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalIconBtn}
                  onPress={() => setPassResultsModalOpen(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ maxHeight: 560, marginTop: 6 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {searchingPasses && residentResults.length === 0 ? (
                  <View style={{ padding: 32, alignItems: "center" }}>
                    <ActivityIndicator color={BLUE} />
                    <Text
                      style={{
                        color: "#94A3B8",
                        fontSize: 12.5,
                        marginTop: 10,
                      }}
                    >
                      Looking for active passes…
                    </Text>
                  </View>
                ) : residentResults.length === 0 ? (
                  <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
                    <Ionicons name="key-outline" size={30} color="#CBD5E1" />
                    <Text
                      style={{
                        color: "#94A3B8",
                        fontSize: 12.5,
                        textAlign: "center",
                        maxWidth: 260,
                        lineHeight: 18,
                      }}
                    >
                      {prepassFlat
                        ? `${formatFlatLabel(prepassFlat.wing, prepassFlat.flat_number)} has no active passes right now.`
                        : "No active passes."}
                    </Text>
                    <Text style={{ color: "#CBD5E1", fontSize: 11 }}>
                      Pull the list or tap the refresh icon above.
                    </Text>
                  </View>
                ) : (
                  residentResults.map((pass) => {
                    const key = `${pass.kind}:${pass.id}`;
                    const busy = passActionBusy === key;
                    const validity = formatValidity(
                      pass.valid_from,
                      pass.valid_until,
                    );
                    const displayName =
                      pass.visitor_name || fallbackName(pass.purpose);

                    const recent = recentPassActions[key];
                    const withinWindow =
                      !!recent && Date.now() - recent.at < EDIT_WINDOW_MS;

                    // ── Used count: subtract local edits so a decision
                    //    change within 5 min still shows 1 use. ─────────
                    const serverUsed = pass.used_count || 0;
                    const localEdits =
                      withinWindow && recent ? recent.editCount : 0;
                    const displayUsed = Math.max(1, serverUsed - localEdits);

                    return (
                      <View key={key} style={styles.passResultCard}>
                        <View style={styles.passResultHeader}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={styles.passResultName}
                              numberOfLines={1}
                            >
                              {displayName}
                            </Text>

                            <Text
                              style={styles.passResultSub}
                              numberOfLines={2}
                            >
                              {[
                                pass.purpose
                                  ? pass.purpose.charAt(0).toUpperCase() +
                                    pass.purpose.slice(1)
                                  : null,
                                formatFlatLabel(pass.wing, pass.flat_number),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>

                            <Text
                              style={styles.passResultValidity}
                              numberOfLines={1}
                            >
                              {validity}
                            </Text>

                            {recent && withinWindow ? (
                              <View style={styles.alreadyLoggedBadge}>
                                <Ionicons
                                  name="information-circle"
                                  size={12}
                                  color={AMBER}
                                />
                                <Text style={styles.alreadyLoggedText}>
                                  Editable for{" "}
                                  {Math.max(
                                    0,
                                    Math.ceil(
                                      (EDIT_WINDOW_MS -
                                        (Date.now() - recent.at)) /
                                        1000,
                                    ),
                                  )}
                                  s · counts as 1 use
                                </Text>
                              </View>
                            ) : null}

                            <TouchableOpacity
                              style={styles.usedChip}
                              onPress={() => openHistory(pass)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name="repeat-outline"
                                size={12}
                                color={BLUE}
                              />
                              <Text style={styles.usedChipText}>
                                {displayUsed}{" "}
                                {displayUsed === 1 ? "use" : "uses"}
                              </Text>
                              <Ionicons
                                name="chevron-forward"
                                size={12}
                                color={BLUE}
                              />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.passResultBadge}>
                            <Text style={styles.passResultBadgeText}>
                              {pass.kind === "invite" ? "INVITE" : "PASS"}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.passResultActions}>
                          <TouchableOpacity
                            style={[
                              styles.rejectBtn,
                              busy && { opacity: 0.5 },
                              withinWindow &&
                                recent?.action === "reject" && {
                                  borderColor: RED,
                                  backgroundColor: "#FEE2E2",
                                },
                            ]}
                            onPress={() => handlePassAction(pass, "reject")}
                            disabled={busy}
                            activeOpacity={0.85}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={RED} />
                            ) : (
                              <>
                                <Ionicons
                                  name="close-circle-outline"
                                  size={18}
                                  color={RED}
                                />
                                <Text style={styles.rejectBtnText}>Reject</Text>
                              </>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.allowBtn,
                              busy && { opacity: 0.5 },
                              withinWindow &&
                                recent?.action === "in" && {
                                  backgroundColor: "#15803D",
                                },
                            ]}
                            onPress={() => handlePassAction(pass, "in")}
                            disabled={busy}
                            activeOpacity={0.85}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons
                                  name="checkmark-circle"
                                  size={18}
                                  color="#fff"
                                />
                                <Text style={styles.allowBtnText}>Allow</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!historyPass}
          transparent
          animationType="slide"
          onRequestClose={() => setHistoryPass(null)}
        >
          <View style={styles.editBackdrop}>
            <View
              style={[
                styles.editSheet,
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}
            >
              <View style={styles.editHandle} />
              {historyPass ? (
                <>
                  <View style={styles.editHeader}>
                    <View
                      style={[
                        styles.editBadge,
                        { backgroundColor: BLUE_LIGHT },
                      ]}
                    >
                      <Ionicons name="time-outline" size={22} color={BLUE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editTitle}>
                        {historyPass.visitor_name ||
                          fallbackName(historyPass.purpose)}
                      </Text>
                      <Text style={styles.editSubtitle}>
                        {formatFlatLabel(
                          historyPass.wing,
                          historyPass.flat_number,
                        )}
                        {" · "}
                        {historyPass.used_count || 0}{" "}
                        {(historyPass.used_count || 0) === 1 ? "use" : "uses"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setHistoryPass(null)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close" size={22} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={{ maxHeight: 460, marginTop: 8 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {historyLoading ? (
                      <View style={{ padding: 24, alignItems: "center" }}>
                        <ActivityIndicator color={BLUE} />
                      </View>
                    ) : historyEntries.length === 0 ? (
                      <View style={{ padding: 24, alignItems: "center" }}>
                        <Text style={{ color: "#94A3B8", fontSize: 12.5 }}>
                          No entries logged yet.
                        </Text>
                      </View>
                    ) : (
                      historyEntries.map((h) => (
                        <View key={h.id} style={styles.historyRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyTime}>
                              {formatFullTime(h.scanned_at)}
                            </Text>
                            <Text style={styles.historySub} numberOfLines={1}>
                              {[
                                h.direction === "in" ? "Entry" : "Exit",
                                h.vehicle_number &&
                                h.vehicle_number !== "NO-VEHICLE"
                                  ? h.vehicle_number
                                  : null,
                                h.guests && h.guests.length > 1
                                  ? `${h.guests.length} guests`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.historyBadge,
                              {
                                backgroundColor: h.rejected
                                  ? "#FEE2E2"
                                  : h.status === "pending_approval"
                                    ? AMBER_LIGHT
                                    : "#DCFCE7",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.historyBadgeText,
                                {
                                  color: h.rejected
                                    ? RED
                                    : h.status === "pending_approval"
                                      ? AMBER
                                      : GREEN,
                                },
                              ]}
                            >
                              {h.rejected
                                ? "REJECTED"
                                : h.status === "pending_approval"
                                  ? "PENDING"
                                  : "ALLOWED"}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    </DarkModeBoundary>
  );

  function renderChoose() {
    return (
      <View style={styles.chooseWrap}>
        <View style={styles.chooseHeader}>
          <View style={styles.chooseIcon}>
            <Ionicons name="shield-checkmark" size={26} color={BLUE} />
          </View>
          <Text style={styles.chooseTitle}>Who is at the gate?</Text>
          <Text style={styles.chooseSubtitle}>
            Search for a pre-approved pass, or log a new visitor.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.chooseCard}
          onPress={() => setMode("prepass")}
          activeOpacity={0.85}
        >
          <View
            style={[styles.chooseCardIcon, { backgroundColor: BLUE_LIGHT }]}
          >
            <Ionicons name="qr-code-outline" size={24} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chooseCardTitle}>Pre-Pass</Text>
            <Text style={styles.chooseCardSub}>QR · plate · code · flat</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chooseCard}
          onPress={() => setMode("manual")}
          activeOpacity={0.85}
        >
          <View
            style={[styles.chooseCardIcon, { backgroundColor: AMBER_LIGHT }]}
          >
            <Ionicons name="create-outline" size={24} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chooseCardTitle}>Manual Entry</Text>
            <Text style={styles.chooseCardSub}>
              Walk-in, delivery, group visit
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    );
  }

  function renderPrepass() {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setMode("choose")}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.cardTitle}>Search Pass</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.inputLabel}>Vehicle number</Text>
        <View style={styles.plateInputWrap}>
          <Ionicons name="car-outline" size={20} color="#94A3B8" />
          <TextInput
            style={styles.plateInput}
            placeholder="e.g. KA01AB1234"
            placeholderTextColor="#A1AAB8"
            autoCapitalize="characters"
            autoCorrect={false}
            value={plate}
            onChangeText={(t) => setPlate(normalizePlate(t))}
            onSubmitEditing={lookupPlate}
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, checking && { opacity: 0.7 }]}
          onPress={lookupPlate}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="search" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Search plate</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.inputLabel}>Secret code</Text>
        <View style={styles.codeInputWrap}>
          <Ionicons name="key-outline" size={20} color="#94A3B8" />
          <TextInput
            style={styles.codeInput}
            placeholder="e.g. gti_9f3a72c1b4d8e5"
            placeholderTextColor="#A1AAB8"
            autoCapitalize="none"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => lookupCode(code)}
          />
        </View>
        <TouchableOpacity
          style={[styles.secondaryBtn, checking && { opacity: 0.7 }]}
          onPress={() => lookupCode(code)}
          disabled={checking}
          activeOpacity={0.85}
        >
          <Ionicons name="key" size={18} color={BLUE} />
          <Text style={styles.secondaryBtnText}>Search code</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.qrBtn}
          onPress={() => setMode("qr")}
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={20} color={BLUE} />
          <Text style={styles.qrBtnText}>Scan guest QR</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.inputLabel}>Flat</Text>
        <TouchableOpacity
          style={[styles.inputWrap, styles.flatPickerField]}
          onPress={() => setPrepassFlatPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="home-outline" size={18} color="#94A3B8" />
          <Text
            numberOfLines={1}
            style={
              prepassFlat ? styles.flatPickerText : styles.flatPickerPlaceholder
            }
          >
            {prepassFlat
              ? `${formatFlatLabel(prepassFlat.wing, prepassFlat.flat_number)}${
                  prepassFlat.resident_name
                    ? ` · ${prepassFlat.resident_name}`
                    : ""
                }`
              : "Tap to choose flat"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#94A3B8" />
        </TouchableOpacity>

        {prepassFlat ? (
          <TouchableOpacity
            style={styles.viewPassesBtn}
            onPress={() => setPassResultsModalOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="key" size={16} color="#fff" />
            <Text style={styles.viewPassesBtnText} numberOfLines={1}>
              View passes for{" "}
              {formatFlatLabel(prepassFlat.wing, prepassFlat.flat_number)}
            </Text>
            {searchingPasses ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : residentResults.length > 0 ? (
              <View style={styles.viewPassesBadge}>
                <Text style={styles.viewPassesBadgeText}>
                  {residentResults.length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  function renderManual() {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setMode("choose")}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.cardTitle}>Manual Entry</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.inputLabel}>
          Who is visiting? ({manualGuests.length})
        </Text>

        {manualGuests.map((g, i) => {
          const isLead = i === 0;
          return (
            <View key={`g-${i}`} style={styles.guestCard}>
              <View style={styles.guestCardHeader}>
                <Text style={styles.guestCardTitle}>
                  {isLead ? "Group lead" : `Companion ${i}`}
                </Text>
                {!isLead ? (
                  <TouchableOpacity
                    onPress={() => removeGuestRow(i)}
                    hitSlop={10}
                  >
                    <Ionicons name="close-circle" size={20} color={RED} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  placeholder={isLead ? "e.g. Suresh Kumar" : "Companion name"}
                  placeholderTextColor="#A1AAB8"
                  value={g.name}
                  onChangeText={(t) => updateGuest(i, { name: t })}
                />
              </View>

              <View style={[styles.inputWrap, { marginTop: 8 }]}>
                <Ionicons name="call-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.input}
                  placeholder="Phone (optional)"
                  placeholderTextColor="#A1AAB8"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={g.phone}
                  onChangeText={(t) =>
                    updateGuest(i, { phone: t.replace(/\D/g, "") })
                  }
                />
              </View>

              <View style={[styles.inputWrap, { marginTop: 8 }]}>
                <Ionicons name="car-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={[styles.input, { letterSpacing: 1 }]}
                  placeholder="Vehicle number (optional)"
                  placeholderTextColor="#A1AAB8"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={g.vehicleNumber}
                  onChangeText={(t) =>
                    updateGuest(i, { vehicleNumber: normalizePlate(t) })
                  }
                />
                {g.vehicleNumber.length >= 5 ? (
                  <View style={styles.vehicleTypeToggle}>
                    {(["car", "bike", "other"] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => updateGuest(i, { vehicleType: t })}
                        style={[
                          styles.vehicleTypePill,
                          g.vehicleType === t && styles.vehicleTypePillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.vehicleTypePillText,
                            g.vehicleType === t &&
                              styles.vehicleTypePillTextActive,
                          ]}
                        >
                          {t === "bike" ? "2W" : t === "car" ? "4W" : "—"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        {manualGuests.length < 20 ? (
          <TouchableOpacity
            style={styles.addGuestBtn}
            onPress={addGuestRow}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color={BLUE} />
            <Text style={styles.addGuestBtnText}>Add another person</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.inputLabel}>Purpose</Text>
        <View style={styles.purposeRow}>
          {PURPOSES.map((p) => {
            const selected = manualPurpose === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.purposeChip,
                  selected && {
                    backgroundColor: p.color,
                    borderColor: p.color,
                  },
                ]}
                onPress={() => setManualPurpose(p.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={p.icon}
                  size={14}
                  color={selected ? "#fff" : p.color}
                />
                <Text
                  style={[
                    styles.purposeChipText,
                    selected && { color: "#fff" },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.inputLabel}>Flat</Text>
        <TouchableOpacity
          style={[styles.inputWrap, styles.flatPickerField]}
          onPress={() => setManualFlatPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="home-outline" size={18} color="#94A3B8" />
          <Text
            numberOfLines={1}
            style={
              manualFlat ? styles.flatPickerText : styles.flatPickerPlaceholder
            }
          >
            {manualFlat
              ? formatFlatLabel(manualWing, manualFlat)
              : "Tap to choose flat"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#94A3B8" />
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.askBtn}
            onPress={() => submitManualEntry({ askResident: true })}
            activeOpacity={0.85}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={AMBER}
            />
            <Text style={styles.askBtnText}>Ask Resident</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.allowBtn}
            onPress={() => submitManualEntry({ askResident: false })}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.allowBtnText}>Allow</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderPrepassResult() {
    if (!prepassResult) return null;

    if (prepassResult.kind === "invalid") {
      const reasonLabel =
        prepassResult.reason === "cancelled"
          ? "This pass was cancelled"
          : prepassResult.reason === "expired"
            ? "This pass has expired"
            : "No pass matches this code";
      return (
        <View style={styles.resultCard}>
          <View style={[styles.resultBadge, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="close-circle" size={28} color={RED} />
          </View>
          <Text style={styles.resultTitle}>Not valid</Text>
          <Text style={styles.resultSubtitle}>{reasonLabel}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={resetToIdle}
              activeOpacity={0.85}
            >
              <Text style={styles.ghostBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.allowBtn}
              onPress={() => {
                setManualGuests([{ ...EMPTY_GUEST }]);
                setMode("manual");
                setPrepassResult(null);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.allowBtnText}>Manual Entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (prepassResult.kind === "invite") {
      const inv = prepassResult.invite;
      const vehicles =
        Array.isArray(inv.vehicles) && inv.vehicles.length > 0
          ? inv.vehicles
          : inv.vehicle_number
            ? [{ number: inv.vehicle_number, type: "car" }]
            : [];
      const isDelivery = (inv.purpose || "").toLowerCase() === "delivery";
      const displayName = inv.guest_name || fallbackName(inv.purpose);
      return (
        <View style={styles.resultCard}>
          <View style={[styles.resultBadge, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="qr-code" size={28} color={BLUE} />
          </View>
          <Text style={styles.resultTitle}>Invited Guest</Text>
          <Text style={styles.resultPlate}>{displayName}</Text>
          <View style={styles.resultDetails}>
            <ResultRow
              label="Visiting"
              value={formatFlatLabel(inv.wing, inv.flat_number)}
            />
            {inv.purpose ? (
              <ResultRow label="Purpose" value={inv.purpose} />
            ) : null}
            {!isDelivery ? (
              <ResultRow label="Guests" value={String(inv.guest_count || 1)} />
            ) : null}
            <ResultRow
              label="Valid"
              value={formatValidity(inv.valid_from, inv.valid_until)}
            />
          </View>
          {vehicles.length > 0 ? (
            <View style={styles.vehiclesBlock}>
              <Text style={styles.vehiclesBlockLabel}>
                {vehicles.length === 1
                  ? "Vehicle"
                  : `Vehicles (${vehicles.length})`}
              </Text>
              <View style={styles.chipWrap}>
                {vehicles.map((v, i) => (
                  <View key={`v-${i}`} style={styles.chip}>
                    <Ionicons name="car-outline" size={11} color="#475569" />
                    <Text style={styles.chipText}>{v.number}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={rejectPrepass}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle-outline" size={18} color={RED} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.allowBtn}
              onPress={allowPrepass}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.allowBtnText}>Allow</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.ghostBtn, { marginTop: 10 }]}
            onPress={resetToIdle}
            activeOpacity={0.85}
          >
            <Text style={styles.ghostBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (prepassResult.kind !== "authorization") return null;

    const a = prepassResult.authorization;
    const isResident = a.status === "resident";
    const isOpenPass = a.pass_mode === "open" && !isResident;
    const isDelivery = (a.category || "").toLowerCase() === "delivery";
    const displayName = a.visitor_name || fallbackName(a.category);

    return (
      <View style={styles.resultCard}>
        <View
          style={[
            styles.resultBadge,
            {
              backgroundColor: isResident
                ? "#DCFCE7"
                : isOpenPass
                  ? "#DBEAFE"
                  : "#F5F3FF",
            },
          ]}
        >
          <Ionicons
            name={
              isResident ? "car" : isOpenPass ? "shield-checkmark" : "qr-code"
            }
            size={28}
            color={isResident ? GREEN : isOpenPass ? BLUE : "#7C3AED"}
          />
        </View>
        <Text style={styles.resultTitle}>
          {isResident
            ? "Registered Resident"
            : isOpenPass
              ? "Open Pass"
              : "Named Pass"}
        </Text>
        <Text style={styles.resultPlate}>{displayName}</Text>
        <View style={styles.resultDetails}>
          <ResultRow
            label="Flat"
            value={formatFlatLabel(a.wing, a.flat_number) || "—"}
          />
          {a.vehicle_number ? (
            <ResultRow label="Vehicle" value={a.vehicle_number} />
          ) : null}
          {!isResident && !isDelivery ? (
            <ResultRow
              label="Category"
              value={
                a.category
                  ? a.category.charAt(0).toUpperCase() + a.category.slice(1)
                  : "—"
              }
            />
          ) : null}
          {!isResident ? (
            <ResultRow
              label="Valid"
              value={formatValidity(a.valid_from, a.valid_until)}
            />
          ) : null}
        </View>
        {isResident ? (
          <TouchableOpacity
            style={[styles.ghostBtn, { width: "100%", marginTop: 14 }]}
            onPress={resetToIdle}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={16} color="#64748B" />
            <Text style={styles.ghostBtnText}>Close</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={rejectPrepass}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle-outline" size={18} color={RED} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.allowBtn}
              onPress={allowPrepass}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.allowBtnText}>Allow</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isResident ? (
          <TouchableOpacity
            style={[styles.ghostBtn, { marginTop: 10 }]}
            onPress={resetToIdle}
            activeOpacity={0.85}
          >
            <Text style={styles.ghostBtnText}>Close</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultRowLabel}>{label}</Text>
      <Text style={styles.resultRowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function WindowBanner({
  expired,
  entry,
  verb,
}: {
  expired: boolean;
  entry: GateEntry;
  verb: string;
}) {
  return (
    <View
      style={[
        styles.editWindowBanner,
        expired
          ? styles.editWindowBannerExpired
          : styles.editWindowBannerActive,
      ]}
    >
      <Ionicons
        name={expired ? "lock-closed" : "time-outline"}
        size={14}
        color={expired ? RED : AMBER}
      />
      <Text style={[styles.editWindowText, { color: expired ? RED : AMBER }]}>
        {expired
          ? "The 5-minute window has expired."
          : `You can ${verb} within 5 minutes · ${formatRemaining(entry)}`}
      </Text>
    </View>
  );
}

function FlatPickerModal({
  visible,
  onClose,
  flats,
  loading,
  currentWing,
  currentFlat,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  flats: FlatOption[];
  loading: boolean;
  currentWing: string;
  currentFlat: string;
  onSelect: (f: FlatOption) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flats;
    return flats.filter((f) => {
      const hay = [
        f.resident_name || "",
        f.flat_number || "",
        f.wing || "",
        f.resident_phone || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [flats, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.editBackdrop}>
        <View style={[styles.editSheet, { maxHeight: "88%" }]}>
          <View style={styles.editHandle} />
          <View style={styles.editHeader}>
            <View style={[styles.editBadge, { backgroundColor: BLUE_LIGHT }]}>
              <Ionicons name="home-outline" size={22} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.editTitle}>Choose flat</Text>
              <Text style={styles.editSubtitle}>
                Search by resident name, wing, or flat no.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={[styles.inputWrap, { marginTop: 12 }]}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={styles.input}
              placeholder="e.g. Rahul or A or 204"
              placeholderTextColor="#A1AAB8"
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>

          <ScrollView
            style={{ maxHeight: 440, marginTop: 10 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={BLUE} />
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#94A3B8", fontSize: 12.5 }}>
                  No flats match this search.
                </Text>
              </View>
            ) : (
              filtered.map((f) => {
                const isCurrent =
                  f.flat_number === currentFlat &&
                  (f.wing || "") === (currentWing || "");
                return (
                  <TouchableOpacity
                    key={f.member_id}
                    style={[
                      styles.flatOptionRow,
                      isCurrent && styles.flatOptionRowActive,
                    ]}
                    onPress={() => onSelect(f)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.flatBadge}>
                      <Text style={styles.flatBadgeText}>
                        {formatFlatLabel(f.wing, f.flat_number)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.flatOptionName} numberOfLines={1}>
                        {f.resident_name || "Resident"}
                      </Text>
                      {f.resident_phone ? (
                        <Text style={styles.flatOptionSub} numberOfLines={1}>
                          {f.resident_phone}
                        </Text>
                      ) : null}
                    </View>
                    {isCurrent ? (
                      <Ionicons name="checkmark" size={20} color={BLUE} />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#CBD5E1"
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  chooseWrap: { gap: 12, marginBottom: 20 },
  chooseHeader: { alignItems: "center", marginBottom: 16, paddingTop: 8 },
  chooseIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  chooseTitle: { fontSize: 20, fontWeight: "800", color: TEXT },
  chooseSubtitle: {
    fontSize: 12.5,
    color: TEXT_SECONDARY,
    marginTop: 6,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 18,
  },
  chooseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 84,
  },
  chooseCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chooseCardTitle: { fontSize: 15.5, fontWeight: "800", color: TEXT },
  chooseCardSub: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 3 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: TEXT },

  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    marginTop: 10,
  },
  plateInputWrap: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  plateInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: 2,
    paddingVertical: 0,
  },
  codeInputWrap: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  codeInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    letterSpacing: 1,
    paddingVertical: 0,
  },
  inputWrap: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  flatPickerField: { minHeight: 54, backgroundColor: "#F8FAFC" },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    paddingVertical: 0,
    minHeight: 48,
  },
  flatPickerText: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    fontWeight: "600",
    includeFontPadding: false,
  },
  flatPickerPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: "#A1AAB8",
    fontWeight: "500",
    includeFontPadding: false,
  },

  primaryBtn: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: BLUE,
    marginTop: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  secondaryBtn: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginTop: 14,
  },
  secondaryBtnText: { color: BLUE, fontSize: 14.5, fontWeight: "800" },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { fontSize: 11.5, color: "#94A3B8", fontWeight: "600" },

  qrBtn: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  qrBtnText: { color: BLUE, fontSize: 14.5, fontWeight: "800" },

  purposeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  purposeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  purposeChipText: { fontSize: 12.5, fontWeight: "700", color: "#475569" },

  guestCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 10,
  },
  guestCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  guestCardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  addGuestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: BLUE_LIGHT,
    marginBottom: 14,
  },
  addGuestBtnText: { fontSize: 13, fontWeight: "800", color: BLUE },
  vehicleTypeToggle: {
    flexDirection: "row",
    gap: 4,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
  },
  vehicleTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  vehicleTypePillActive: { backgroundColor: BLUE },
  vehicleTypePillText: { fontSize: 11, fontWeight: "800", color: "#64748B" },
  vehicleTypePillTextActive: { color: "#fff" },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  rejectBtn: {
    flex: 1,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    paddingHorizontal: 8,
  },
  rejectBtnText: { color: RED, fontSize: 14, fontWeight: "800", flexShrink: 1 },
  askBtn: {
    flex: 1,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: "#FFFBEB",
    borderWidth: 1.5,
    borderColor: "#FCD34D",
    paddingHorizontal: 8,
  },
  askBtnText: { color: AMBER, fontSize: 14, fontWeight: "800", flexShrink: 1 },
  allowBtn: {
    flex: 1.2,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    paddingHorizontal: 8,
  },
  allowBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    flexShrink: 1,
  },

  ghostBtn: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
  },
  ghostBtnText: { color: "#64748B", fontSize: 13, fontWeight: "800" },

  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  resultBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  resultSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 6,
    textAlign: "center",
  },
  resultPlate: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: 1,
    marginTop: 6,
    textAlign: "center",
  },
  resultDetails: { width: "100%", marginTop: 16, gap: 8 },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  resultRowLabel: { fontSize: 12.5, color: "#64748B", fontWeight: "600" },
  resultRowValue: {
    fontSize: 13.5,
    fontWeight: "800",
    color: TEXT,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "62%",
  },

  vehiclesBlock: { width: "100%", marginTop: 14 },
  vehiclesBlockLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipText: { fontSize: 12, fontWeight: "700", color: "#334155" },

  logSection: { marginTop: 8 },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  logTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  dateNav: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabel: { fontSize: 12.5, fontWeight: "800", color: TEXT },

  logEmpty: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  logEmptyText: { fontSize: 12.5, color: "#94A3B8", fontWeight: "600" },

  logList: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  logRowTitle: { fontSize: 13.5, fontWeight: "800", color: TEXT },
  logRowSub: { fontSize: 11.5, color: "#94A3B8", marginTop: 2 },
  logRowRight: { alignItems: "flex-end", gap: 2 },
  logDir: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5 },
  logTime: { fontSize: 10.5, color: "#94A3B8" },
  logEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  logEditBtnDisabled: { width: 32, height: 32 },

  viewPassesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  viewPassesBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    flexShrink: 1,
  },
  viewPassesBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  viewPassesBadgeText: { color: BLUE, fontSize: 11, fontWeight: "800" },

  passResultsWrap: { marginTop: 14, gap: 10 },
  passResultsTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  passResultCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  passResultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  passResultName: { fontSize: 14, fontWeight: "800", color: TEXT },
  passResultSub: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 16,
  },
  passResultValidity: {
    fontSize: 11.5,
    color: "#1D4ED8",
    fontWeight: "700",
    marginTop: 4,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  ownerText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0F766E",
  },
  actorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
  },
  actorText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  passResultChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  passResultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  passResultBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: BLUE,
    letterSpacing: 0.5,
  },
  passResultActions: { flexDirection: "row", gap: 8 },

  usedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  usedChipText: { fontSize: 11, fontWeight: "800", color: BLUE },

  alreadyLoggedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: AMBER_LIGHT,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  alreadyLoggedText: {
    fontSize: 11,
    fontWeight: "800",
    color: AMBER,
  },

  passRefreshRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  passRefreshText: { fontSize: 12, fontWeight: "700", color: BLUE },

  flatOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  flatOptionRowActive: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  flatBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  flatBadgeText: { fontSize: 12, fontWeight: "800", color: "#334155" },
  flatOptionName: { fontSize: 14, fontWeight: "800", color: TEXT },
  flatOptionSub: { fontSize: 11.5, color: "#64748B", marginTop: 2 },

  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  historyTime: { fontSize: 13, fontWeight: "800", color: TEXT },
  historySub: { fontSize: 11.5, color: "#64748B", marginTop: 2 },
  historyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  qrContainer: { flex: 1, backgroundColor: "#000" },
  qrHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  qrClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  qrOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFrame: {
    width: Dimensions.get("window").width * 0.7,
    height: Dimensions.get("window").width * 0.7,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  qrPermWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    backgroundColor: "#fff",
  },
  qrPermTitle: { fontSize: 17, fontWeight: "800", color: TEXT },
  qrPermText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 19,
  },
  qrPermBtn: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: BLUE,
  },
  qrPermBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  editBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  editSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "92%",
  },
  editHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 12,
  },
  editScroll: { paddingBottom: 8 },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  editBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  editTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  editSubtitle: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  editActionRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  editWindowBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    marginTop: 12,
  },
  editWindowBannerActive: { backgroundColor: "#FEF3C7" },
  editWindowBannerExpired: { backgroundColor: "#FEE2E2" },
  editWindowText: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  modalIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
});

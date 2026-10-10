// app/(modals)/my-passes.tsx
import { Ionicons } from "@expo/vector-icons";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSecureItem } from "../../utils/tokenStorage";

import { AppAlert } from "../../components/AppAlert";
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import { useAccounts } from "../../hooks/useAccounts";
import { consumePendingPassTab } from "../../utils/pendingPassTab";

const BLUE = "#2563EB";
const BLUE_LIGHT = "#EFF6FF";
const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const BACKGROUND = "#F8FAFC";
const RED = "#DC2626";
const GREEN = "#16A34A";
const AMBER = "#B45309";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const SHARE_BASE_URL = "https://apartmentmanage.com/g/";

type TabKey = "passes" | "qr";

type PassCategory =
  | "delivery"
  | "helper"
  | "guest"
  | "cab"
  | "service"
  | "other";
type PassMode = "open" | "named";

type InvitePurpose = "guest" | "delivery" | "cab" | "service" | "other";
type PassStatus = "active" | "expired" | "cancelled";
type InviteStatus = "active" | "used" | "expired" | "cancelled";

interface AuthorizationRow {
  id: string;
  category: PassCategory;
  pass_mode: PassMode;
  visitor_name: string | null;
  visitor_phone: string | null;
  vehicle_number: string | null;
  vehicles?: Array<{ number: string; type?: string }> | null;
  wing: string | null;
  flat_number: string;
  guest_count: number;
  valid_from: string;
  valid_until: string;
  used_count: number;
  code: string | null;
  status: PassStatus;
  created_at: string;
}

interface InviteRow {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  purpose: InvitePurpose;
  guest_count: number;
  vehicle_number: string | null;
  vehicles?: Array<{ number: string; type?: string }> | null;
  wing: string | null;
  flat_number: string;
  valid_from: string;
  valid_until: string;
  code: string;
  status: InviteStatus;
  used_at: string | null;
  created_at: string;
}

const CATEGORY_META: Record<
  PassCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  delivery: { label: "Delivery", icon: "cube-outline", color: "#EA580C" },
  helper: { label: "Helper", icon: "construct-outline", color: "#16A34A" },
  guest: { label: "Guest", icon: "person-outline", color: "#2563EB" },
  cab: { label: "Cab", icon: "car-outline", color: "#7C3AED" },
  service: { label: "Service", icon: "hammer-outline", color: "#0891B2" },
  other: {
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
    color: "#64748B",
  },
};

const PURPOSE_META: Record<
  InvitePurpose,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  guest: { label: "Guest", icon: "person-outline", color: "#2563EB" },
  delivery: { label: "Delivery", icon: "cube-outline", color: "#EA580C" },
  cab: { label: "Cab", icon: "car-outline", color: "#7C3AED" },
  service: { label: "Service", icon: "hammer-outline", color: "#0891B2" },
  other: {
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
    color: "#64748B",
  },
};

function normalizeAccountId(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await getSecureItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function formatUnit(wing?: string | null, flat?: string | null): string {
  const w = (wing ?? "").trim();
  const f = (flat ?? "").trim();
  if (w && f) return `${w} · ${f}`;
  return f || w || "—";
}

function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ─────────────────────────────────────────────────────────────────────────
// Format the pass validity window for display.
//
// Rules:
//   • Full-day window (00:00 → 23:59 on one day, or multi-day) → date only.
//   • Start + end times present on same day  → "Today · 5:00 PM – 9:00 PM"
//   • Start + end times present, spans days  → "Today 5:00 PM – 12 Oct 9:00 AM"
//   • Custom range, no times                 → "12 Oct – 15 Oct"
// ─────────────────────────────────────────────────────────────────────────
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
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });

  const fromH = from.getHours();
  const fromM = from.getMinutes();
  const fromS = from.getSeconds();
  const untilH = until.getHours();
  const untilM = until.getMinutes();

  const startsAtMidnight = fromH === 0 && fromM === 0 && fromS === 0;
  const endsAtEndOfDay = untilH === 23 && untilM >= 55;
  const isFullDay = startsAtMidnight && endsAtEndOfDay;

  // ── Full-day window (no explicit start/end times) ─────────────────
  if (isFullDay) {
    if (fromToday && untilToday) return "Today · Full day";
    if (fromToday) return `Today – ${dateStr(until)}`;
    return `${dateStr(from)} – ${dateStr(until)}`;
  }

  // ── Times are present → show them ─────────────────────────────────
  const fromPart = fromToday ? "Today" : dateStr(from);
  const untilPart = untilToday ? "Today" : dateStr(until);

  if (fromToday && untilToday) {
    return `Today · ${timeStr(from)} – ${timeStr(until)}`;
  }

  return `${fromPart} ${timeStr(from)} – ${untilPart} ${timeStr(until)}`;
}

function computeEffectiveStatus<
  T extends { status: string; valid_until?: string },
>(row: T): string {
  if (row.status === "cancelled" || row.status === "used") return row.status;
  if (row.valid_until) {
    const until = new Date(row.valid_until);
    if (!isNaN(until.getTime()) && until.getTime() < Date.now()) {
      return "expired";
    }
  }
  return row.status;
}

interface QrTarget {
  code: string;
  title: string;
  subtitle: string;
  validUntil: string;
}

export default function MyPassesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const paramAccountId = normalizeAccountId(params.accountId);
  const { selectedAccount } = useAccounts();
  const accountId = paramAccountId || selectedAccount?.id || null;

  const [tab, setTab] = useState<TabKey>("passes");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [passes, setPasses] = useState<AuthorizationRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState("");

  const [detailPass, setDetailPass] = useState<AuthorizationRow | null>(null);
  const [detailInvite, setDetailInvite] = useState<InviteRow | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!accountId) {
        setPasses([]);
        setInvites([]);
        setLoading(false);
        return;
      }

      if (!opts.silent) setLoading(true);
      setError("");

      try {
        const token = await getAuthToken();
        if (!token) {
          setError("Session expired. Please log in again.");
          return;
        }

        const [passRes, inviteRes] = await Promise.all([
          fetch(`${API_BASE_URL}/management/${accountId}/gate-authorizations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/management/${accountId}/gate-invites`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        let passData: any = null;
        let inviteData: any = null;
        try {
          passData = await passRes.json();
        } catch {
          passData = null;
        }
        try {
          inviteData = await inviteRes.json();
        } catch {
          inviteData = null;
        }

        setPasses(
          Array.isArray(passData)
            ? passData
            : Array.isArray(passData?.authorizations)
              ? passData.authorizations
              : [],
        );
        setInvites(
          Array.isArray(inviteData)
            ? inviteData
            : Array.isArray(inviteData?.invites)
              ? inviteData.invites
              : [],
        );
      } catch (e: any) {
        console.error("[my-passes] load failed:", e);
        setError(e?.message || "Failed to load. Pull down to retry.");
      } finally {
        setLoading(false);
      }
    },
    [accountId],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const pending = await consumePendingPassTab();
          if (!cancelled && pending) {
            setTab(pending);
          }
        } catch (e) {
          console.warn("[my-passes] pending tab read failed:", e);
        }
        if (!cancelled) {
          load({ silent: true });
        }
      })();

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const passesSorted = useMemo(() => {
    const withStatus = passes.map((p) => ({
      ...p,
      effectiveStatus: computeEffectiveStatus(p) as PassStatus,
    }));
    const active = withStatus
      .filter((p) => p.effectiveStatus === "active")
      .sort((a, b) => {
        const byCreated =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byCreated !== 0) return byCreated;
        return (
          new Date(b.valid_until).getTime() - new Date(a.valid_until).getTime()
        );
      });
    const past = withStatus
      .filter((p) => p.effectiveStatus !== "active")
      .sort((a, b) => {
        const byCreated =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byCreated !== 0) return byCreated;
        return (
          new Date(b.valid_until).getTime() - new Date(a.valid_until).getTime()
        );
      });
    return { active, past };
  }, [passes]);

  const invitesSorted = useMemo(() => {
    const withStatus = invites.map((i) => ({
      ...i,
      effectiveStatus: computeEffectiveStatus(i) as InviteStatus,
    }));
    const active = withStatus
      .filter((i) => i.effectiveStatus === "active")
      .sort((a, b) => {
        const byCreated =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byCreated !== 0) return byCreated;
        return (
          new Date(b.valid_until).getTime() - new Date(a.valid_until).getTime()
        );
      });
    const past = withStatus
      .filter((i) => i.effectiveStatus !== "active")
      .sort((a, b) => {
        const byCreated =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byCreated !== 0) return byCreated;
        return (
          new Date(b.valid_until).getTime() - new Date(a.valid_until).getTime()
        );
      });
    return { active, past };
  }, [invites]);

  const openCreate = () => {
    if (!accountId) return;
    router.replace({
      pathname: "/(modals)/pre-authorize",
      params: {
        accountId,
        mode: tab === "passes" ? "open" : "named",
      },
    });
  };

  // ── Cancel pass — use AppAlert on all platforms ─────────
  const handleCancelPass = (pass: AuthorizationRow) => {
    AppAlert.alert({
      title: "Cancel this pass?",
      message: "The guard will no longer accept visitors covered by this pass.",
      tone: "warning",
      buttons: [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel pass",
          style: "destructive",
          onPress: () => doCancelPass(pass.id),
        },
      ],
    });
  };

  const doCancelPass = async (id: string) => {
    if (!accountId) return;
    setCancellingId(id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-authorizations/${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        AppAlert.alert({
          title: "Failed",
          message: data?.message || "Could not cancel the pass.",
          tone: "danger",
        });
        return;
      }
      setDetailPass(null);
      await load({ silent: true });
    } catch (e: any) {
      AppAlert.alert({
        title: "Failed",
        message: e?.message || "Could not cancel the pass.",
        tone: "danger",
      });
    } finally {
      setCancellingId(null);
    }
  };

  // ── Cancel QR (invite) — use AppAlert on all platforms ──
  const handleCancelInvite = (invite: InviteRow) => {
    AppAlert.alert({
      title: "Cancel this QR code?",
      message: "The QR will stop working immediately.",
      tone: "warning",
      buttons: [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel QR",
          style: "destructive",
          onPress: () => doCancelInvite(invite.id),
        },
      ],
    });
  };

  const doCancelInvite = async (id: string) => {
    if (!accountId) return;
    setCancellingId(id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-invites/${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        AppAlert.alert({
          title: "Failed",
          message: data?.message || "Could not cancel the QR.",
          tone: "danger",
        });
        return;
      }
      setDetailInvite(null);
      await load({ silent: true });
    } catch (e: any) {
      AppAlert.alert({
        title: "Failed",
        message: e?.message || "Could not cancel the QR.",
        tone: "danger",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const openEditPass = (pass: AuthorizationRow) => {
    setDetailPass(null);
    router.replace({
      pathname: "/(modals)/pre-authorize",
      params: {
        accountId: accountId ?? "",
        mode: pass.pass_mode === "named" ? "named" : "open",
        editId: pass.id,
        editType: "authorization",
      },
    });
  };

  const openEditInvite = (invite: InviteRow) => {
    setDetailInvite(null);
    router.replace({
      pathname: "/(modals)/pre-authorize",
      params: {
        accountId: accountId ?? "",
        mode: "named",
        editId: invite.id,
        editType: "invite",
      },
    });
  };

  const openQrForInvite = (invite: InviteRow) => {
    setQrTarget({
      code: invite.code,
      title: invite.guest_name,
      subtitle: `${PURPOSE_META[invite.purpose].label} · ${formatUnit(
        invite.wing,
        invite.flat_number,
      )}`,
      validUntil: invite.valid_until,
    });
  };

  const openQrForPass = (pass: AuthorizationRow) => {
    if (!pass.code) return;
    setQrTarget({
      code: pass.code,
      title: pass.visitor_name || CATEGORY_META[pass.category].label,
      subtitle: `${CATEGORY_META[pass.category].label} · ${formatUnit(
        pass.wing,
        pass.flat_number,
      )}`,
      validUntil: pass.valid_until,
    });
  };

  const shareQrLink = async () => {
    if (!qrTarget) return;
    const until = new Date(qrTarget.validUntil).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    const message =
      `${qrTarget.title} is invited to visit.\n\n` +
      `Show this code at the gate: ${qrTarget.code}\n` +
      `Valid until: ${until}\n\n` +
      `Or open: ${SHARE_BASE_URL}${qrTarget.code}`;
    try {
      await Share.share({ message, title: "Gate pass" });
    } catch {}
  };

  const renderPassCard = (
    pass: AuthorizationRow & { effectiveStatus: PassStatus },
  ) => {
    const meta = CATEGORY_META[pass.category];
    const isActive = pass.effectiveStatus === "active";
    const isExpired = pass.effectiveStatus === "expired";
    const isNamed = pass.pass_mode === "named";
    const validity = formatValidity(pass.valid_from, pass.valid_until);

    return (
      <Pressable
        key={pass.id}
        onPress={() => setDetailPass(pass)}
        style={({ pressed }) => [
          styles.passCard,
          !isActive && styles.passCardInactive,
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.passHeader}>
          <View
            style={[
              styles.passIcon,
              { backgroundColor: isActive ? `${meta.color}15` : "#F1F5F9" },
            ]}
          >
            <Ionicons
              name={meta.icon}
              size={20}
              color={isActive ? meta.color : "#94A3B8"}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.passTitleRow}>
              <Text style={styles.passTitle} numberOfLines={1}>
                {meta.label}
                {pass.visitor_name ? ` · ${pass.visitor_name}` : ""}
              </Text>
              <View
                style={[
                  styles.passStatusPill,
                  isActive
                    ? styles.passStatusPillActive
                    : isExpired
                      ? styles.passStatusPillExpired
                      : styles.passStatusPillCancelled,
                ]}
              >
                <Text
                  style={[
                    styles.passStatusPillText,
                    isActive
                      ? { color: GREEN }
                      : isExpired
                        ? { color: AMBER }
                        : { color: "#64748B" },
                  ]}
                >
                  {isActive ? "ACTIVE" : isExpired ? "EXPIRED" : "CANCELLED"}
                </Text>
              </View>
              <View
                style={[
                  styles.modePill,
                  isNamed ? styles.modePillNamed : styles.modePillOpen,
                ]}
              >
                <Ionicons
                  name={isNamed ? "qr-code-outline" : "shield-checkmark"}
                  size={10}
                  color={isNamed ? "#6D28D9" : "#065F46"}
                />
                <Text
                  style={[
                    styles.modePillText,
                    { color: isNamed ? "#6D28D9" : "#065F46" },
                  ]}
                >
                  {isNamed ? "NAMED" : "OPEN"}
                </Text>
              </View>
            </View>
            <Text style={styles.passSubtitle} numberOfLines={1}>
              {formatUnit(pass.wing, pass.flat_number)}
            </Text>
            <Text style={styles.passValidity} numberOfLines={1}>
              {validity}
            </Text>
          </View>
        </View>

        <View style={styles.passFooter}>
          <Text style={styles.passFooterLeft} numberOfLines={1}>
            {pass.used_count > 0
              ? `Used ${pass.used_count} time${pass.used_count === 1 ? "" : "s"}`
              : "Not used yet"}
          </Text>
          {isActive ? (
            <View style={styles.inviteActions}>
              {isNamed && pass.code ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openQrForPass(pass);
                  }}
                  style={styles.qrBtnSmall}
                  activeOpacity={0.75}
                >
                  <Ionicons name="qr-code-outline" size={14} color={BLUE} />
                  <Text style={styles.qrBtnSmallText}>Show QR</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  openEditPass(pass);
                }}
                style={styles.editBtnSmall}
                activeOpacity={0.75}
              >
                <Ionicons name="create-outline" size={14} color={BLUE} />
                <Text style={styles.editBtnSmallText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleCancelPass(pass);
                }}
                style={styles.cancelBtnSmall}
                activeOpacity={0.75}
                disabled={cancellingId === pass.id}
              >
                {cancellingId === pass.id ? (
                  <ActivityIndicator size="small" color={RED} />
                ) : (
                  <>
                    <Ionicons
                      name="close-circle-outline"
                      size={14}
                      color={RED}
                    />
                    <Text style={styles.cancelBtnSmallText}>Cancel</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderQrCard = (
    invite: InviteRow & { effectiveStatus: InviteStatus },
  ) => {
    const meta = PURPOSE_META[invite.purpose];
    const isActive = invite.effectiveStatus === "active";
    const isUsed = invite.effectiveStatus === "used";
    const isExpired = invite.effectiveStatus === "expired";

    const validity = formatValidity(invite.valid_from, invite.valid_until);
    const vehicleCount = Array.isArray(invite.vehicles)
      ? invite.vehicles.length
      : invite.vehicle_number
        ? 1
        : 0;

    return (
      <Pressable
        key={invite.id}
        onPress={() => setDetailInvite(invite)}
        style={({ pressed }) => [
          styles.passCard,
          !isActive && styles.passCardInactive,
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.passHeader}>
          <View
            style={[
              styles.passIcon,
              { backgroundColor: isActive ? `${meta.color}15` : "#F1F5F9" },
            ]}
          >
            <Ionicons
              name={meta.icon}
              size={20}
              color={isActive ? meta.color : "#94A3B8"}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.passTitleRow}>
              <Text style={styles.passTitle} numberOfLines={1}>
                {invite.guest_name}
              </Text>
              <View
                style={[
                  styles.passStatusPill,
                  isActive
                    ? styles.passStatusPillActive
                    : isUsed
                      ? styles.passStatusPillUsed
                      : isExpired
                        ? styles.passStatusPillExpired
                        : styles.passStatusPillCancelled,
                ]}
              >
                <Text
                  style={[
                    styles.passStatusPillText,
                    isActive
                      ? { color: GREEN }
                      : isUsed
                        ? { color: BLUE }
                        : isExpired
                          ? { color: AMBER }
                          : { color: "#64748B" },
                  ]}
                >
                  {isActive
                    ? "ACTIVE"
                    : isUsed
                      ? "USED"
                      : isExpired
                        ? "EXPIRED"
                        : "CANCELLED"}
                </Text>
              </View>
            </View>
            <Text style={styles.passSubtitle} numberOfLines={1}>
              {meta.label} · {formatUnit(invite.wing, invite.flat_number)}
              {vehicleCount > 0
                ? `  ·  ${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"}`
                : ""}
            </Text>
            <Text style={styles.passValidity} numberOfLines={1}>
              {validity}
            </Text>
          </View>
        </View>

        <View style={styles.passFooter}>
          <Text style={styles.passFooterLeft} numberOfLines={1}>
            {isUsed && invite.used_at
              ? `Used ${formatShortDateTime(invite.used_at)}`
              : `Created ${formatShortDateTime(invite.created_at)}`}
          </Text>
          {isActive ? (
            <View style={styles.inviteActions}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  openQrForInvite(invite);
                }}
                style={styles.qrBtnSmall}
                activeOpacity={0.75}
              >
                <Ionicons name="qr-code-outline" size={14} color={BLUE} />
                <Text style={styles.qrBtnSmallText}>Show QR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  openEditInvite(invite);
                }}
                style={styles.editBtnSmall}
                activeOpacity={0.75}
              >
                <Ionicons name="create-outline" size={14} color={BLUE} />
                <Text style={styles.editBtnSmallText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleCancelInvite(invite);
                }}
                style={styles.cancelBtnSmall}
                activeOpacity={0.75}
                disabled={cancellingId === invite.id}
              >
                {cancellingId === invite.id ? (
                  <ActivityIndicator size="small" color={RED} />
                ) : (
                  <>
                    <Ionicons
                      name="close-circle-outline"
                      size={14}
                      color={RED}
                    />
                    <Text style={styles.cancelBtnSmallText}>Cancel</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderEmpty = (kind: TabKey) => {
    const isPass = kind === "passes";
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={isPass ? "ticket-outline" : "qr-code-outline"}
            size={28}
            color="#94A3B8"
          />
        </View>
        <Text style={styles.emptyTitle}>
          {isPass ? "No passes yet" : "No QR codes yet"}
        </Text>
        <Text style={styles.emptyText}>
          {isPass
            ? "Tap the + button to pre-authorize a delivery, cab or service."
            : "Tap the + button to create a QR code for a guest, maid or teacher."}
        </Text>
      </View>
    );
  };

  const renderPassesTab = () => {
    const { active, past } = passesSorted;
    if (active.length === 0 && past.length === 0) return renderEmpty("passes");

    return (
      <>
        {active.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Active</Text>
            {active.map(renderPassCard)}
          </View>
        ) : null}
        {past.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Past</Text>
            {past.map(renderPassCard)}
          </View>
        ) : null}
      </>
    );
  };

  const renderQrTab = () => {
    const { active, past } = invitesSorted;
    if (active.length === 0 && past.length === 0) return renderEmpty("qr");

    return (
      <>
        {active.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Active</Text>
            {active.map(renderQrCard)}
          </View>
        ) : null}
        {past.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Past</Text>
            {past.map(renderQrCard)}
          </View>
        ) : null}
      </>
    );
  };

  return (
    <DarkModeBoundary>
      <Stack.Screen
        options={{
          title: "My Pass",
          headerBackTitle: "Back",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                try {
                  if (typeof (router as any).canDismiss === "function") {
                    if ((router as any).canDismiss()) {
                      router.dismissAll();
                      return;
                    }
                  } else if (typeof (router as any).dismissAll === "function") {
                    router.dismissAll();
                    return;
                  }
                } catch {
                  // ignore and fall through
                }
                router.back();
              }}
              style={{ paddingLeft: 8, paddingRight: 12, paddingVertical: 4 }}
              hitSlop={10}
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={24} color={TEXT} />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        {/* Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === "passes" && styles.tabActive]}
            onPress={() => setTab("passes")}
            activeOpacity={0.85}
          >
            <Ionicons
              name="ticket-outline"
              size={16}
              color={tab === "passes" ? BLUE : "#64748B"}
            />
            <Text
              style={[styles.tabText, tab === "passes" && styles.tabTextActive]}
            >
              Passes
            </Text>
            {passesSorted.active.length > 0 ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {passesSorted.active.length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, tab === "qr" && styles.tabActive]}
            onPress={() => setTab("qr")}
            activeOpacity={0.85}
          >
            <Ionicons
              name="qr-code-outline"
              size={16}
              color={tab === "qr" ? BLUE : "#64748B"}
            />
            <Text
              style={[styles.tabText, tab === "qr" && styles.tabTextActive]}
            >
              QR Code
            </Text>
            {invitesSorted.active.length > 0 ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {invitesSorted.active.length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BLUE}
              colors={[BLUE]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BLUE} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={18} color={RED} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : tab === "passes" ? (
            renderPassesTab()
          ) : (
            renderQrTab()
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom, 20) + 16 }]}
          onPress={openCreate}
          activeOpacity={0.85}
          accessibilityLabel={
            tab === "passes" ? "Create a pass" : "Create QR code"
          }
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Pass detail modal (read-only) */}
      <Modal
        visible={!!detailPass}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailPass(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDetailPass(null)}
        >
          <Pressable style={styles.detailCard} onPress={() => {}}>
            {detailPass ? (
              <>
                <View style={styles.detailHeader}>
                  <View
                    style={[
                      styles.detailIcon,
                      {
                        backgroundColor: `${CATEGORY_META[detailPass.category].color}15`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={CATEGORY_META[detailPass.category].icon}
                      size={22}
                      color={CATEGORY_META[detailPass.category].color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailTitle}>
                      {CATEGORY_META[detailPass.category].label}
                      {detailPass.visitor_name
                        ? ` · ${detailPass.visitor_name}`
                        : ""}
                    </Text>
                    <Text style={styles.detailSub}>
                      {formatUnit(detailPass.wing, detailPass.flat_number)} ·{" "}
                      {detailPass.pass_mode === "named"
                        ? "Named pass"
                        : "Open pass"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.detailClose}
                    onPress={() => setDetailPass(null)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailRows}>
                  <DetailRow
                    icon="calendar-outline"
                    label="Valid until"
                    value={formatValidity(
                      detailPass.valid_from,
                      detailPass.valid_until,
                    )}
                  />
                  <DetailRow
                    icon="person-outline"
                    label="Guests"
                    value={String(detailPass.guest_count || 1)}
                  />
                  {detailPass.visitor_phone ? (
                    <DetailRow
                      icon="call-outline"
                      label="Phone"
                      value={`+91 ${detailPass.visitor_phone}`}
                    />
                  ) : null}

                  {Array.isArray(detailPass.vehicles) &&
                  detailPass.vehicles.length > 0 ? (
                    detailPass.vehicles.map((v, i) => (
                      <DetailRow
                        key={`pv-${i}`}
                        icon="car-outline"
                        label={i === 0 ? "Vehicle" : `Vehicle ${i + 1}`}
                        value={v.number}
                      />
                    ))
                  ) : detailPass.vehicle_number ? (
                    <DetailRow
                      icon="car-outline"
                      label="Vehicle"
                      value={detailPass.vehicle_number}
                    />
                  ) : null}

                  <DetailRow
                    icon="repeat-outline"
                    label="Used"
                    value={`${detailPass.used_count} time${
                      detailPass.used_count === 1 ? "" : "s"
                    }`}
                  />
                </View>

                <View style={styles.detailActions}>
                  <TouchableOpacity
                    style={styles.detailCancelBtn}
                    onPress={() => setDetailPass(null)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.detailCancelText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* QR / invite detail modal (read-only) */}
      <Modal
        visible={!!detailInvite}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailInvite(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDetailInvite(null)}
        >
          <Pressable style={styles.detailCard} onPress={() => {}}>
            {detailInvite ? (
              <>
                <View style={styles.detailHeader}>
                  <View
                    style={[
                      styles.detailIcon,
                      {
                        backgroundColor: `${PURPOSE_META[detailInvite.purpose].color}15`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={PURPOSE_META[detailInvite.purpose].icon}
                      size={22}
                      color={PURPOSE_META[detailInvite.purpose].color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailTitle} numberOfLines={1}>
                      {detailInvite.guest_name}
                    </Text>
                    <Text style={styles.detailSub}>
                      {PURPOSE_META[detailInvite.purpose].label} ·{" "}
                      {formatUnit(detailInvite.wing, detailInvite.flat_number)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.detailClose}
                    onPress={() => setDetailInvite(null)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailRows}>
                  <DetailRow
                    icon="calendar-outline"
                    label="Valid"
                    value={formatValidity(
                      detailInvite.valid_from,
                      detailInvite.valid_until,
                    )}
                  />
                  <DetailRow
                    icon="person-outline"
                    label="Guests"
                    value={String(detailInvite.guest_count || 1)}
                  />
                  {detailInvite.guest_phone ? (
                    <DetailRow
                      icon="call-outline"
                      label="Phone"
                      value={`+91 ${detailInvite.guest_phone}`}
                    />
                  ) : null}

                  {Array.isArray(detailInvite.vehicles) &&
                  detailInvite.vehicles.length > 0 ? (
                    detailInvite.vehicles.map((v, i) => (
                      <DetailRow
                        key={`iv-${i}`}
                        icon="car-outline"
                        label={i === 0 ? "Vehicle" : `Vehicle ${i + 1}`}
                        value={v.number}
                      />
                    ))
                  ) : detailInvite.vehicle_number ? (
                    <DetailRow
                      icon="car-outline"
                      label="Vehicle"
                      value={detailInvite.vehicle_number}
                    />
                  ) : null}

                  {detailInvite.used_at ? (
                    <DetailRow
                      icon="checkmark-done-outline"
                      label="Used"
                      value={new Date(detailInvite.used_at).toLocaleString(
                        "en-IN",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        },
                      )}
                    />
                  ) : null}
                </View>

                <View style={styles.detailActions}>
                  <TouchableOpacity
                    style={styles.detailCancelBtn}
                    onPress={() => setDetailInvite(null)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.detailCancelText}>Close</Text>
                  </TouchableOpacity>
                  {computeEffectiveStatus(detailInvite) === "active" ? (
                    <TouchableOpacity
                      style={styles.detailPrimaryBtn}
                      onPress={() => {
                        const inv = detailInvite;
                        setDetailInvite(null);
                        openQrForInvite(inv);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="qr-code-outline" size={16} color="#fff" />
                      <Text style={styles.detailPrimaryText}>Show QR</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* QR modal */}
      <Modal
        visible={!!qrTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setQrTarget(null)}
      >
        <View style={styles.qrBackdrop}>
          <View
            style={[
              styles.qrSheet,
              { paddingBottom: Math.max(insets.bottom, 20) + 8 },
            ]}
          >
            <View style={styles.qrHandle} />
            {qrTarget ? (
              <ScrollView
                contentContainerStyle={styles.qrScroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.qrHero}>
                  <View style={styles.qrHeroIcon}>
                    <Ionicons name="qr-code" size={28} color={BLUE} />
                  </View>
                  <Text style={styles.qrTitle}>{qrTarget.title}</Text>
                  <Text style={styles.qrSubtitle}>{qrTarget.subtitle}</Text>
                </View>

                <View style={styles.qrCard}>
                  <View style={styles.qrFrame}>
                    <QRCode
                      value={qrTarget.code}
                      size={220}
                      backgroundColor="#ffffff"
                      color="#0F172A"
                    />
                  </View>
                </View>

                <View style={styles.qrSummary}>
                  <View style={styles.qrSummaryRow}>
                    <Text style={styles.qrSummaryLabel}>Code</Text>
                    <Text style={styles.qrSummaryValue}>{qrTarget.code}</Text>
                  </View>
                  <View style={styles.qrSummaryRow}>
                    <Text style={styles.qrSummaryLabel}>Valid until</Text>
                    <Text style={styles.qrSummaryValue}>
                      {new Date(qrTarget.validUntil).toLocaleString("en-IN", {
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
                  onPress={shareQrLink}
                  activeOpacity={0.85}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.qrPrimaryBtnText}>Share QR</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.qrDoneBtn}
                  onPress={() => setQrTarget(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.qrDoneBtnText}>Done</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </DarkModeBoundary>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailRowIcon}>
        <Ionicons name={icon} size={15} color="#64748B" />
      </View>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, flexGrow: 1 },

  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
    backgroundColor: BACKGROUND,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  tabActive: { backgroundColor: BLUE_LIGHT, borderColor: BLUE },
  tabText: { fontSize: 13.5, fontWeight: "700", color: "#64748B" },
  tabTextActive: { color: BLUE },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { fontSize: 10.5, color: "#fff", fontWeight: "800" },

  loadingWrap: { paddingTop: 40, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 12.5, color: "#64748B", fontWeight: "600" },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 12.5, color: "#B91C1C", fontWeight: "600" },

  group: { marginTop: 12 },
  groupLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },

  passCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
  },
  passCardInactive: { opacity: 0.72 },
  passHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  passIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  passTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  passTitle: { fontSize: 14.5, fontWeight: "800", color: TEXT, flexShrink: 1 },
  passStatusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  passStatusPillActive: { backgroundColor: "#DCFCE7" },
  passStatusPillUsed: { backgroundColor: "#DBEAFE" },
  passStatusPillExpired: { backgroundColor: "#FEF3C7" },
  passStatusPillCancelled: { backgroundColor: "#F1F5F9" },
  passStatusPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  modePillOpen: { backgroundColor: "#ECFDF5" },
  modePillNamed: { backgroundColor: "#F5F3FF" },
  modePillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  passSubtitle: { fontSize: 12, color: "#475569", marginTop: 4 },
  passValidity: { fontSize: 11.5, color: "#94A3B8", marginTop: 3 },

  passFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 8,
  },
  passFooterLeft: { flex: 1, fontSize: 11.5, color: "#64748B" },

  inviteActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  qrBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  qrBtnSmallText: { fontSize: 11.5, fontWeight: "800", color: BLUE },

  editBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  editBtnSmallText: { fontSize: 11.5, fontWeight: "800", color: BLUE },

  cancelBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  cancelBtnSmallText: { fontSize: 11.5, fontWeight: "800", color: RED },

  emptyWrap: { paddingTop: 30, alignItems: "center", paddingHorizontal: 20 },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: TEXT },
  emptyText: {
    fontSize: 12.5,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 320,
  },

  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  detailCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  detailIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: { fontSize: 15.5, fontWeight: "800", color: TEXT },
  detailSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  detailClose: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  detailRows: { gap: 8 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  detailRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  detailRowLabel: { fontSize: 12.5, color: "#64748B", flex: 1 },
  detailRowValue: {
    fontSize: 13,
    color: TEXT,
    fontWeight: "700",
    maxWidth: "55%",
  },

  detailActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  detailCancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  detailCancelText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  detailPrimaryBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: BLUE,
  },
  detailPrimaryText: { fontSize: 13, fontWeight: "800", color: "#fff" },

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
    backgroundColor: BLUE_LIGHT,
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

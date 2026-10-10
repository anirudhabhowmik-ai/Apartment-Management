// app/(modals)/gate-approvals.tsx
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSecureItem } from "../../utils/tokenStorage";

import { AppAlert } from "../../components/AppAlert";
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import { useAccounts } from "../../hooks/useAccounts";
import { useMembers } from "../../hooks/useManagement";
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

interface GateEntry {
  id: string;
  vehicle_number: string;
  visitor_type: string;
  visitor_name: string | null;
  visitor_phone: string | null;
  purpose: string | null;
  vehicle_type: string | null;
  wing: string | null;
  flat_number: string | null;
  owner_name: string | null;
  direction: string;
  rejected: boolean;
  scanned_at: string;
  status: string;
  guests?: Array<{ name: string; phone: string | null; vehicle?: any }>;
  vehicles?: Array<{ number: string; type: string }>;
}

interface FlatRef {
  wing: string | null;
  flatNumber: string;
}

function normalizeAccountId(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v.trim() : "";
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await getSecureItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function shortTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function purposeMeta(purpose?: string | null): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
} {
  const p = String(purpose ?? "").toLowerCase();
  switch (p) {
    case "delivery":
      return { label: "Delivery", icon: "cube-outline", color: "#EA580C" };
    case "cab":
      return { label: "Cab", icon: "car-outline", color: "#7C3AED" };
    case "service":
      return { label: "Service", icon: "hammer-outline", color: "#0891B2" };
    case "guest":
      return { label: "Guest", icon: "person-outline", color: BLUE };
    case "other":
      return {
        label: "Other",
        icon: "ellipsis-horizontal-circle-outline",
        color: "#64748B",
      };
    default:
      return { label: "Visitor", icon: "walk-outline", color: BLUE };
  }
}

function buildFlatRefs(members: any[], userId?: string | null): FlatRef[] {
  if (!userId) return [];
  return members
    .filter((m: any) => m.userId === userId)
    .map((m: any) => ({
      wing: (m.wing ?? "").trim() || null,
      flatNumber: (m.flatNumber ?? "").trim(),
    }))
    .filter((f) => f.flatNumber || f.wing);
}

export default function GateApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const paramAccountId = normalizeAccountId(params.accountId);
  const { selectedAccount } = useAccounts();
  const accountId = paramAccountId || selectedAccount?.id || null;

  const { user } = useAuthStore();
  const membersHook = useMembers(accountId);

  const myFlats = useMemo(
    () => buildFlatRefs(membersHook.items, user?.id),
    [membersHook.items, user?.id],
  );

  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!accountId) {
        setEntries([]);
        setLoading(false);
        return;
      }
      if (!opts.silent) setLoading(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          setEntries([]);
          return;
        }
        const res = await fetch(
          `${API_BASE_URL}/management/${accountId}/gate-entries?status=pending_approval&limit=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          setEntries([]);
          return;
        }
        const data: any = await res.json();
        const rows: GateEntry[] = Array.isArray(data) ? data : [];

        // Client-side scoping: only show entries whose flat_number matches
        // one of the resident's flats (defense-in-depth; the backend may not
        // filter by flat for non-admin roles).
        const scopeSet = new Set(
          myFlats
            .filter((f) => f.flatNumber)
            .map((f) => `${f.wing ?? ""}::${f.flatNumber}`),
        );

        const filtered =
          scopeSet.size > 0
            ? rows.filter((r) => {
                const key = `${r.wing ?? ""}::${r.flat_number ?? ""}`;
                const flatOnly = r.flat_number ?? "";
                return (
                  scopeSet.has(key) ||
                  myFlats.some((f) => f.flatNumber === flatOnly)
                );
              })
            : rows;

        // Keep only still-pending
        setEntries(filtered.filter((r) => r.status === "pending_approval"));
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [accountId, myFlats],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  // ── Approve ──────────────────────────────────────────────
  const approve = (entry: GateEntry) => {
    AppAlert.alert({
      title: "Allow this visitor?",
      message: `${entry.visitor_name || "Visitor"} will be allowed to enter your flat.`,
      tone: "success",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Allow", onPress: () => doApprove(entry) },
      ],
    });
  };

  const doApprove = async (entry: GateEntry) => {
    if (!accountId) return;
    setBusyId(entry.id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-entries/${entry.id}/approve`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        AppAlert.alert({
          title: "Failed",
          message: err?.message || "Could not approve. Please try again.",
          tone: "danger",
        });
        return;
      }
      AppAlert.alert({
        title: "Allowed",
        message: `${entry.visitor_name || "Visitor"} is now allowed to enter.`,
        tone: "success",
      });
      setEntries((cur) => cur.filter((e) => e.id !== entry.id));
    } catch (e: any) {
      AppAlert.alert({
        title: "Network error",
        message: e?.message || "Please try again.",
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  };

  // ── Reject ───────────────────────────────────────────────
  const reject = (entry: GateEntry) => {
    AppAlert.alert({
      title: "Reject this visitor?",
      message: `${entry.visitor_name || "Visitor"} will not be allowed in.`,
      tone: "warning",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => doReject(entry),
        },
      ],
    });
  };

  const doReject = async (entry: GateEntry) => {
    if (!accountId) return;
    setBusyId(entry.id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-entries/${entry.id}/reject`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        AppAlert.alert({
          title: "Failed",
          message: err?.message || "Could not reject. Please try again.",
          tone: "danger",
        });
        return;
      }
      AppAlert.alert({
        title: "Rejected",
        message: `${entry.visitor_name || "Visitor"} was not allowed in.`,
        tone: "warning",
      });
      setEntries((cur) => cur.filter((e) => e.id !== entry.id));
    } catch (e: any) {
      AppAlert.alert({
        title: "Network error",
        message: e?.message || "Please try again.",
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  };

  const total = entries.length;

  const header = useMemo(() => {
    if (total === 0) return "No pending requests";
    return total === 1
      ? "1 visitor waiting at the gate"
      : `${total} visitors waiting at the gate`;
  }, [total]);

  // ── Render ───────────────────────────────────────────────
  const renderEntry = (entry: GateEntry) => {
    const purpose = purposeMeta(entry.purpose);
    const guestCount = Array.isArray(entry.guests) ? entry.guests.length : 0;
    const vehicleCount = Array.isArray(entry.vehicles)
      ? entry.vehicles.length
      : entry.vehicle_number
        ? 1
        : 0;

    const leadName = entry.visitor_name || "Visitor";
    const moreLabel = guestCount > 1 ? ` + ${guestCount - 1} more` : "";
    const isBusy = busyId === entry.id;

    return (
      <View key={entry.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View
            style={[styles.cardIcon, { backgroundColor: `${purpose.color}15` }]}
          >
            <Ionicons name={purpose.icon} size={20} color={purpose.color} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {leadName}
              {moreLabel}
            </Text>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {[
                purpose.label,
                entry.wing && entry.flat_number
                  ? `${entry.wing} · ${entry.flat_number}`
                  : entry.flat_number,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          </View>
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={11} color={AMBER} />
            <Text style={styles.timeBadgeText}>
              {shortTime(entry.scanned_at)}
            </Text>
          </View>
        </View>

        {Array.isArray(entry.guests) && entry.guests.length > 1 ? (
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>
              Guests ({entry.guests.length})
            </Text>
            <View style={styles.chipWrap}>
              {entry.guests.map((g, i) => (
                <View key={`g-${i}`} style={styles.chip}>
                  <Ionicons name="person" size={11} color="#475569" />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {g.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {vehicleCount > 0 ? (
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>
              {vehicleCount === 1 ? "Vehicle" : `Vehicles (${vehicleCount})`}
            </Text>
            <View style={styles.chipWrap}>
              {Array.isArray(entry.vehicles) && entry.vehicles.length > 0 ? (
                entry.vehicles.map((v, i) => (
                  <View key={`v-${i}`} style={styles.chip}>
                    <Ionicons name="car-outline" size={11} color="#475569" />
                    <Text style={styles.chipText}>{v.number}</Text>
                  </View>
                ))
              ) : entry.vehicle_number ? (
                <View style={styles.chip}>
                  <Ionicons name="car-outline" size={11} color="#475569" />
                  <Text style={styles.chipText}>{entry.vehicle_number}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {entry.visitor_phone ? (
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>+91 {entry.visitor_phone}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.rejectBtn, isBusy && { opacity: 0.6 }]}
            onPress={() => reject(entry)}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={18} color={RED} />
            <Text style={styles.rejectBtnText} numberOfLines={1}>
              Reject
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.allowBtn, isBusy && { opacity: 0.7 }]}
            onPress={() => approve(entry)}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {isBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.allowBtnText} numberOfLines={1}>
                  Allow
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <DarkModeBoundary>
      <Stack.Screen
        options={{ title: "My Approval", headerBackTitle: "Back" }}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
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
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark" size={26} color={BLUE} />
            </View>
            <Text style={styles.heroTitle}>Visitors waiting</Text>
            <Text style={styles.heroSubtitle}>{header}</Text>
          </View>

          {loading && entries.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BLUE} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="checkmark-done-circle-outline"
                  size={30}
                  color="#94A3B8"
                />
              </View>
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptyText}>
                When the guard logs a visitor at the gate, you'll see their
                request here to allow or reject.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>{entries.map(renderEntry)}</View>
          )}
        </ScrollView>
      </View>
    </DarkModeBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, flexGrow: 1 },

  hero: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    alignItems: "center",
  },
  heroIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
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
    marginTop: 6,
    textAlign: "center",
  },

  loadingWrap: { paddingTop: 40, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 12.5, color: "#64748B", fontWeight: "600" },

  emptyWrap: {
    paddingTop: 30,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 15.5, fontWeight: "800", color: TEXT },
  emptyText: {
    fontSize: 12.5,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 320,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
  },
  cardSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 3,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: AMBER_LIGHT,
  },
  timeBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: AMBER,
  },

  detailBlock: { marginBottom: 10 },
  detailLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 13,
    color: TEXT,
    fontWeight: "700",
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
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    flexShrink: 1,
  },

  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  rejectBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 13,
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#FECACA",
    paddingHorizontal: 8,
  },
  rejectBtnText: {
    color: RED,
    fontSize: 13.5,
    fontWeight: "800",
    flexShrink: 1,
  },
  allowBtn: {
    flex: 1.3,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 13,
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
    paddingHorizontal: 8,
  },
  allowBtnText: {
    color: "#fff",
    fontSize: 13.5,
    fontWeight: "800",
    flexShrink: 1,
  },
});

// app/(modals)/invite-qr.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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

const BLUE = "#2563EB";
const BLUE_LIGHT = "#EFF6FF";
const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const BACKGROUND = "#F8FAFC";
const RED = "#DC2626";
const GREEN = "#16A34A";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

// Deep-link base used in the share message.
const SHARE_BASE_URL = "https://khata.app/g/";

interface InviteVehicle {
  number: string;
  type?: string;
}

interface InviteRow {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  purpose: "guest" | "delivery" | "cab" | "service" | "other";
  guest_count: number;
  vehicle_number: string | null;
  vehicles?: InviteVehicle[] | null;
  wing: string | null;
  flat_number: string;
  valid_from: string;
  valid_until: string;
  code: string;
  status: "active" | "used" | "expired" | "cancelled";
  used_at: string | null;
  created_at: string;
}

function normalizeAccountId(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

function pickString(raw: string | string[] | undefined): string {
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

function formatUnit(wing?: string | null, flat?: string | null): string {
  const w = (wing ?? "").trim();
  const f = (flat ?? "").trim();
  if (w && f) return `${w} · ${f}`;
  return f || w || "—";
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

  if (fromToday && untilToday) return `Today · until ${timeStr(until)}`;

  const d = until.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  if (fromToday) return `Today – ${d}`;
  return `${from.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })} – ${d}`;
}

// Short display version (8 hex chars from gti_xxxxx…)
function shortCode(code: string): string {
  const stripped = code.replace(/^gti_/i, "").toUpperCase();
  return stripped.slice(0, 8);
}

function vehicleTypeLabel(t?: string): string {
  const s = String(t ?? "").toLowerCase();
  if (s === "bike") return "2W";
  if (s === "car") return "4W";
  return "—";
}

export default function InviteQrScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    accountId?: string | string[];
    inviteId?: string | string[];
  }>();

  const paramAccountId = normalizeAccountId(params.accountId);
  const inviteId = pickString(params.inviteId);

  const { selectedAccount } = useAccounts();
  const accountId = paramAccountId || selectedAccount?.id || null;

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadInvite = useCallback(async () => {
    if (!accountId || !inviteId) {
      setError("Missing invite reference.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Session expired. Please log in again.");
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-invites/${inviteId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
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
            "Could not load this invite. It may have been cancelled.",
        );
        return;
      }

      setInvite(data as InviteRow);
    } catch (e: any) {
      console.error("[invite-qr] load failed:", e);
      setError(e?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accountId, inviteId]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  const isActive = useMemo(() => {
    if (!invite) return false;
    if (invite.status !== "active") return false;
    const until = new Date(invite.valid_until);
    if (!isNaN(until.getTime()) && until.getTime() < Date.now()) return false;
    return true;
  }, [invite]);

  const displayCode = useMemo(
    () => (invite?.code ? shortCode(invite.code) : ""),
    [invite],
  );

  // Full vehicles list, with fallback to legacy `vehicle_number`
  const vehicleList = useMemo<InviteVehicle[]>(() => {
    if (!invite) return [];
    const fromArr = Array.isArray(invite.vehicles)
      ? invite.vehicles.filter((v) => v && typeof v.number === "string")
      : [];
    if (fromArr.length > 0) return fromArr;
    if (invite.vehicle_number) {
      return [{ number: invite.vehicle_number, type: "car" }];
    }
    return [];
  }, [invite]);

  const shareLink = useMemo(
    () => (invite?.code ? `${SHARE_BASE_URL}${invite.code}` : ""),
    [invite],
  );

  const handleCopyCode = async () => {
    if (!invite?.code) return;
    try {
      await Clipboard.setStringAsync(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      AppAlert.alert({
        title: "Copy failed",
        message: "Could not copy to clipboard.",
        tone: "danger",
      });
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await Clipboard.setStringAsync(shareLink);
      AppAlert.alert({
        title: "Copied",
        message: "Invite link copied to clipboard.",
        tone: "success",
      });
    } catch {
      AppAlert.alert({
        title: "Copy failed",
        message: "Could not copy to clipboard.",
        tone: "danger",
      });
    }
  };

  const handleShare = async () => {
    if (!invite) return;

    const unit = formatUnit(invite.wing, invite.flat_number);
    const validity = formatValidity(invite.valid_from, invite.valid_until);

    const vehicleLine = vehicleList.length
      ? vehicleList.map((v) => `• ${v.number}`).join("\n")
      : "—";

    const message =
      `You're invited to visit ${unit}.\n\n` +
      `Guest: ${invite.guest_name}\n` +
      (invite.guest_count > 1 ? `Guests: ${invite.guest_count}\n` : "") +
      (validity ? `Valid: ${validity}\n` : "") +
      `\nVehicles:\n${vehicleLine}\n` +
      `\nShow the QR at the gate. If the camera can't read it, tell the guard this code: ${invite.code}\n` +
      (shareLink ? `\nOr open: ${shareLink}\n` : "");

    try {
      if (Platform.OS === "web") {
        const nav: any = typeof navigator !== "undefined" ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: "Gate invite", text: message });
        } else {
          await Clipboard.setStringAsync(message);
          AppAlert.alert({
            title: "Copied",
            message: "Invite details copied to clipboard.",
            tone: "success",
          });
        }
        return;
      }

      await Share.share({
        message,
        title: "Gate invite",
      });
    } catch (e: any) {
      if (e?.message && !/dismiss/i.test(e.message)) {
        console.warn("[invite-qr] share failed:", e);
      }
    }
  };

  const handleCall = () => {
    if (!invite?.guest_phone) return;
    const digits = String(invite.guest_phone).replace(/\D/g, "");
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    if (ten.length !== 10) return;
    const { Linking } = require("react-native");
    Linking.openURL(`tel:+91${ten}`).catch(() => {});
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <DarkModeBoundary>
      <Stack.Screen options={{ title: "Invite QR", headerBackTitle: "Back" }} />
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centerWrap}>
              <ActivityIndicator color={BLUE} />
              <Text style={styles.centerText}>Loading invite…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={20} color={RED} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={loadInvite}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : invite ? (
            <>
              {/* Status chip */}
              <View
                style={[
                  styles.statusChip,
                  isActive ? styles.statusActive : styles.statusInactive,
                ]}
              >
                <Ionicons
                  name={isActive ? "checkmark-circle" : "time-outline"}
                  size={15}
                  color={isActive ? GREEN : "#B45309"}
                />
                <Text
                  style={[
                    styles.statusChipText,
                    isActive ? { color: GREEN } : { color: "#B45309" },
                  ]}
                >
                  {isActive
                    ? "Active · guest can enter"
                    : invite.status === "used"
                      ? "Already used"
                      : invite.status === "expired"
                        ? "Expired"
                        : "Cancelled"}
                </Text>
              </View>

              {/* QR card */}
              <View style={styles.qrCard}>
                <View
                  style={[styles.qrFrame, !isActive && styles.qrFrameInactive]}
                >
                  <QRCode
                    value={invite.code}
                    size={230}
                    backgroundColor="#ffffff"
                    color="#0F172A"
                  />
                </View>

                {!isActive ? (
                  <View style={styles.qrOverlayNote}>
                    <Text style={styles.qrOverlayNoteText}>
                      {invite.status === "used"
                        ? `Used ${new Date(invite.used_at || "").toLocaleString(
                            "en-IN",
                          )}`
                        : invite.status === "expired"
                          ? "This invite has expired"
                          : "This invite was cancelled"}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Short code */}
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>Short code</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeValue} selectable>
                    {displayCode}
                  </Text>
                  <TouchableOpacity
                    style={styles.codeCopyBtn}
                    onPress={handleCopyCode}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={copied ? "checkmark" : "copy-outline"}
                      size={16}
                      color={copied ? GREEN : BLUE}
                    />
                    <Text
                      style={[styles.codeCopyText, copied && { color: GREEN }]}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.codeHint}>
                  Use this if the camera can't read the QR.
                </Text>
              </View>

              {/* Invite summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Guest</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {invite.guest_name}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Visiting</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {formatUnit(invite.wing, invite.flat_number)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Guests</Text>
                  <Text style={styles.summaryValue}>{invite.guest_count}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Valid</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {formatValidity(invite.valid_from, invite.valid_until)}
                  </Text>
                </View>
              </View>

              {/* Vehicles — multiple */}
              <View style={styles.vehiclesCard}>
                <Text style={styles.vehiclesLabel}>
                  {vehicleList.length === 1
                    ? "Vehicle"
                    : `Vehicles (${vehicleList.length})`}
                </Text>

                {vehicleList.length === 0 ? (
                  <Text style={styles.vehiclesEmpty}>
                    No vehicle registered for this invite.
                  </Text>
                ) : (
                  <View style={styles.vehiclesList}>
                    {vehicleList.map((v, i) => (
                      <View key={`v-${i}`} style={styles.vehicleRow}>
                        <View style={styles.vehicleIconWrap}>
                          <Ionicons
                            name={
                              v.type === "bike"
                                ? "bicycle-outline"
                                : "car-outline"
                            }
                            size={16}
                            color={BLUE}
                          />
                        </View>
                        <Text style={styles.vehiclePlate}>{v.number}</Text>
                        <View style={styles.vehicleTypeBadge}>
                          <Text style={styles.vehicleTypeBadgeText}>
                            {vehicleTypeLabel(v.type)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Actions */}
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleShare}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  Share on WhatsApp / anywhere
                </Text>
              </TouchableOpacity>

              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={handleCopyLink}
                  activeOpacity={0.85}
                >
                  <Ionicons name="link-outline" size={17} color={BLUE} />
                  <Text style={styles.secondaryBtnText}>Copy link</Text>
                </TouchableOpacity>

                {invite.guest_phone ? (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={handleCall}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="call-outline" size={17} color={BLUE} />
                    <Text style={styles.secondaryBtnText}>Call guest</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={styles.bottomHint}>
                Share this with the guest. They show it at the gate — the guard
                scans it and lets them in. Valid for multiple entries and exits
                during the window.
              </Text>

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={handleClose}
                activeOpacity={0.85}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      </View>
    </DarkModeBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, flexGrow: 1 },

  centerWrap: { paddingTop: 60, alignItems: "center", gap: 12 },
  centerText: { fontSize: 13, color: "#64748B", fontWeight: "600" },

  errorCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    gap: 12,
    marginTop: 30,
  },
  errorText: {
    fontSize: 13,
    color: "#B91C1C",
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: BLUE,
  },
  retryBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },

  statusChip: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 14,
  },
  statusActive: { backgroundColor: "#DCFCE7" },
  statusInactive: { backgroundColor: "#FEF3C7" },
  statusChipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },

  qrCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  qrFrame: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: BLUE_LIGHT,
  },
  qrFrameInactive: { opacity: 0.35 },
  qrOverlayNote: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
  },
  qrOverlayNoteText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B45309",
    textAlign: "center",
  },

  codeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  codeLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: 4,
    flex: 1,
  },
  codeCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  codeCopyText: { fontSize: 12, fontWeight: "800", color: BLUE },
  codeHint: { fontSize: 11, color: "#94A3B8", marginTop: 8 },

  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: { fontSize: 12.5, color: "#64748B", fontWeight: "600" },
  summaryValue: {
    fontSize: 13.5,
    color: TEXT,
    fontWeight: "800",
    maxWidth: "60%",
    textAlign: "right",
  },

  vehiclesCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  vehiclesLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  vehiclesEmpty: {
    fontSize: 12.5,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  vehiclesList: {
    gap: 8,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  vehicleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  vehiclePlate: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: 1,
  },
  vehicleTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#E0E7FF",
  },
  vehicleTypeBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#3730A3",
    letterSpacing: 0.3,
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: BLUE,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 14.5, fontWeight: "800", color: "#fff" },

  secondaryRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "800", color: BLUE },

  bottomHint: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 14,
    lineHeight: 16,
    paddingHorizontal: 20,
  },

  doneBtn: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 11,
    marginTop: 18,
  },
  doneBtnText: { fontSize: 13, fontWeight: "800", color: "#64748B" },
});

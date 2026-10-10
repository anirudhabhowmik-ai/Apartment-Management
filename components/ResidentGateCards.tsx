// components/ResidentGateCards.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getSecureItem } from "../utils/tokenStorage";

const TEXT = "#111827";
const TEXT_SECONDARY = "#6B7280";
const BORDER = "#E5E7EB";
const RED = "#DC2626";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";

async function getAuthToken(): Promise<string | null> {
  try {
    return await getSecureItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function ResidentGateCards({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loadingPending, setLoadingPending] = useState<boolean>(false);

  const loadPendingCount = useCallback(async () => {
    if (!accountId) return;
    setLoadingPending(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/management/${accountId}/gate-entries?status=pending_approval&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setPendingCount(0);
        return;
      }
      const data: any = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setPendingCount(rows.length);
    } catch {
      setPendingCount(0);
    } finally {
      setLoadingPending(false);
    }
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      loadPendingCount();
    }, [loadPendingCount]),
  );

  const go = (pathname: string, extra?: Record<string, any>) => {
    router.push({ pathname, params: { accountId, ...(extra ?? {}) } });
  };

  return (
    <View style={styles.wrap}>
      {/* ── Row: My Pass + My Approval ── */}
      <View style={styles.row}>
        <Pressable
          onPress={() => go("/(modals)/my-passes", { tab: "passes" })}
          style={({ pressed }) => [
            styles.smallCard,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.smallIcon, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="list-outline" size={20} color="#059669" />
          </View>
          <Text style={styles.smallTitle}>My Pass</Text>
          <Text style={styles.smallSubtitle}>Active & past</Text>
        </Pressable>

        <Pressable
          onPress={() => go("/(modals)/gate-approvals")}
          style={({ pressed }) => [
            styles.smallCard,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.smallIcon, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="checkmark-done-outline" size={20} color="#B45309" />
          </View>
          <View style={styles.smallTitleRow}>
            <Text style={styles.smallTitle}>My Approval</Text>
            {loadingPending ? (
              <ActivityIndicator size="small" color="#B45309" />
            ) : pendingCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {pendingCount > 99 ? "99+" : String(pendingCount)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.smallSubtitle}>
            {pendingCount > 0
              ? `${pendingCount} waiting at gate`
              : "No pending requests"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },

  row: { flexDirection: "row", gap: 10 },
  smallCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    minHeight: 116,
  },
  smallIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  smallTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  smallTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: TEXT,
    flexShrink: 1,
  },
  smallSubtitle: {
    fontSize: 11.5,
    color: TEXT_SECONDARY,
    marginTop: 3,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
});

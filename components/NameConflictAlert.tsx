// components/NameConflictAlert.tsx
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export interface NameConflictPayload {
  phone: string; // 10-digit
  existing_name: string; // e.g. "ABC"
}

interface ShowOptions extends NameConflictPayload {
  // Optional context: "member" | "staff" | "admin". Defaults to "member".
  role?: "member" | "staff" | "admin";
}

// ---------------------------------------------------------------------------
// Imperative handle stored at module scope so a single component instance
// can be driven from anywhere via `confirmNameConflict(...)`.
//
// Lifecycle:
//   1. Caller: await confirmNameConflict({...})      -> modal opens
//   2. User taps Rename                              -> promise resolves true,
//                                                       modal stays open,
//                                                       caller sets busy
//   3. Caller: setNameConflictBusy(true)             -> spinner on Rename
//   4. Caller finishes save                          -> closeNameConflict()
//                                                       modal closes
//
//   Or, on Cancel / backdrop tap:
//      promise resolves false, modal closes immediately.
// ---------------------------------------------------------------------------
type Resolver = (confirmed: boolean) => void;

let presentResolver: Resolver | null = null;
let presentPayload: ShowOptions | null = null;
let presentBusy = false;
let notifyChange: (() => void) | null = null;

/**
 * Show the alert. Resolves:
 *   true  → user pressed "Rename" (modal stays open; caller must
 *           call `closeNameConflict()` when done)
 *   false → user pressed Cancel or dismissed the modal (modal closes)
 */
export function confirmNameConflict(opts: ShowOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    presentResolver = resolve;
    presentPayload = opts;
    presentBusy = false;
    notifyChange?.();
  });
}

/** Internal: called when the user acts on the modal. */
function settle(confirmed: boolean) {
  const r = presentResolver;

  if (confirmed) {
    // Keep the modal open. Clear the resolver so it can't be called
    // twice, but leave presentPayload so the modal remains visible
    // until closeNameConflict() is called.
    presentResolver = null;
    presentBusy = true;
    notifyChange?.();
    r?.(true);
    return;
  }

  // Cancel / dismiss → resolve false and close right away.
  presentResolver = null;
  presentPayload = null;
  presentBusy = false;
  notifyChange?.();
  r?.(false);
}

/**
 * Dismiss the modal after a confirmed action completes.
 * Safe to call at any time; no-op if nothing is presented.
 */
export function closeNameConflict() {
  presentResolver = null;
  presentPayload = null;
  presentBusy = false;
  notifyChange?.();
}

/** Internal: lets the host set a "busy" flag while the confirmed request is in flight. */
export function setNameConflictBusy(busy: boolean) {
  presentBusy = busy;
  notifyChange?.();
}

// ---------------------------------------------------------------------------
// Component — mount once near the root of your app.
// ---------------------------------------------------------------------------
export default function NameConflictAlert() {
  const [, forceRender] = useState(0);
  const modalKeyRef = useRef(0);

  notifyChange = useCallback(() => {
    forceRender((n) => n + 1);
  }, []);

  const visible = presentPayload !== null;
  const payload = presentPayload;

  if (visible) modalKeyRef.current += 1;

  if (!payload) return null;

  const phoneDisplay = payload.phone ? `+91${payload.phone}` : "This number";
  const existing = payload.existing_name || "another person";

  return (
    <Modal
      key={modalKeyRef.current}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (presentBusy) return;
        settle(false);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning" size={30} color="#D97706" />
          </View>

          <Text style={styles.title}>This number is already in use</Text>

          <View style={styles.numberRow}>
            <View style={styles.numberPill}>
              <Ionicons name="call-outline" size={13} color="#B45309" />
              <Text style={styles.numberPillText}>{phoneDisplay}</Text>
            </View>
            <Text style={styles.numberRowText}>already belongs to</Text>
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>
              {existing}
            </Text>
            <Text style={styles.nameSuffixText}>on this account</Text>
          </View>

          <View style={styles.ruleBox}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="#1D4ED8"
            />
            <Text style={styles.ruleText}>
              One number, one name. If you continue, the name will be updated
              everywhere this number appears on this account — member, staff,
              and any pending invitations.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={() => settle(false)}
              activeOpacity={0.8}
              disabled={presentBusy}
            >
              <Text style={styles.cancelText}>Keep name</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn]}
              onPress={() => settle(true)}
              activeOpacity={0.85}
              disabled={presentBusy}
            >
              {presentBusy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={17}
                    color="#FFFFFF"
                  />
                  <Text style={styles.confirmText}>Rename</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footnote}>
            Keep name leaves it unchanged. Rename updates this number
            everywhere.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    flexWrap: "wrap",
    gap: 6,
  },
  numberPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  numberPillText: {
    color: "#B45309",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  numberRowText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "500",
  },
  nameRow: {
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  nameText: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  nameSuffixText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  ruleBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
    width: "100%",
  },
  ruleText: {
    flex: 1,
    color: "#1E3A8A",
    fontSize: 12.5,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 20,
  },
  btn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  cancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  cancelText: {
    color: "#475569",
    fontSize: 14.5,
    fontWeight: "700",
  },
  confirmBtn: {
    backgroundColor: "#D97706",
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  footnote: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
    maxWidth: 320,
    lineHeight: 16,
  },
});

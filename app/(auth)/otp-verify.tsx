import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import { recoverAccount, sendOtp, verifyOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";
import { setSecureItem } from "../../utils/tokenStorage";

const { width: screenWidth } = Dimensions.get("window");

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

const getOtpBoxSize = () => {
  const horizontalPadding = 48;
  const extraMargin = 40;
  const gap = 8;

  const totalGap = gap * (OTP_LENGTH - 1);

  const availableWidth = screenWidth - horizontalPadding - extraMargin;

  const boxSize = Math.min(48, (availableWidth - totalGap) / OTP_LENGTH);

  return {
    width: Math.max(38, boxSize),
    height: Math.max(46, boxSize * 1.2),
  };
};

// ================================================================
// Inline AppAlert
// ================================================================

type AlertVariant = "info" | "success" | "warning" | "error" | "question";

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertState {
  visible: boolean;
  variant: AlertVariant;
  title: string;
  message?: string;
  bullets?: { icon: "checkmark" | "close"; text: string }[];
  buttons: AlertButton[];
}

const EMPTY_ALERT: AlertState = {
  visible: false,
  variant: "info",
  title: "",
  message: undefined,
  bullets: undefined,
  buttons: [],
};

function AppAlert({
  state,
  onDismiss,
}: {
  state: AlertState;
  onDismiss: () => void;
}) {
  const { variant, title, message, bullets, buttons } = state;

  const meta: Record<
    AlertVariant,
    { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
  > = {
    info: { icon: "information-circle", color: "#2563EB", bg: "#EFF6FF" },
    success: { icon: "checkmark-circle", color: "#16A34A", bg: "#F0FDF4" },
    warning: { icon: "warning", color: "#D97706", bg: "#FEF3C7" },
    error: { icon: "close-circle", color: "#DC2626", bg: "#FEF2F2" },
    question: { icon: "help-circle", color: "#7C3AED", bg: "#F5F3FF" },
  };

  const m = meta[variant];

  const handlePress = (btn: AlertButton) => {
    onDismiss();
    if (btn.onPress) setTimeout(btn.onPress, 0);
  };

  const hasTwo = buttons.length === 2;
  const isStacked = buttons.length > 2;

  return (
    <DarkModeBoundary>
      <Modal
        transparent
        visible={state.visible}
        animationType="fade"
        onRequestClose={onDismiss}
        statusBarTranslucent
      >
        <Pressable style={alertStyles.backdrop} onPress={onDismiss}>
          <Pressable
            style={alertStyles.card}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[alertStyles.iconCircle, { backgroundColor: m.bg }]}>
              <Ionicons name={m.icon} size={30} color={m.color} />
            </View>

            <Text style={alertStyles.title}>{title}</Text>

            {message ? (
              <Text style={alertStyles.message}>{message}</Text>
            ) : null}

            {bullets && bullets.length > 0 ? (
              <View style={alertStyles.bulletsContainer}>
                {bullets.map((b, idx) => (
                  <View key={idx} style={alertStyles.bulletRow}>
                    <Ionicons
                      name={
                        b.icon === "checkmark"
                          ? "checkmark-circle"
                          : "close-circle"
                      }
                      size={16}
                      color={b.icon === "checkmark" ? "#16A34A" : "#DC2626"}
                    />
                    <Text style={alertStyles.bulletText}>{b.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View
              style={[
                alertStyles.actions,
                isStacked && alertStyles.actionsStacked,
              ]}
            >
              {buttons.map((btn, idx) => {
                const isDestructive = btn.style === "destructive";
                const isCancel = btn.style === "cancel";
                const isPrimary = !isDestructive && !isCancel;

                return (
                  <Pressable
                    key={`${btn.text}-${idx}`}
                    onPress={() => handlePress(btn)}
                    style={({ pressed }) => [
                      alertStyles.button,
                      hasTwo && alertStyles.buttonHalf,
                      isStacked && alertStyles.buttonFull,
                      isCancel && alertStyles.buttonCancel,
                      isDestructive && alertStyles.buttonDestructive,
                      isPrimary && alertStyles.buttonPrimary,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                      style={[
                        alertStyles.buttonText,
                        isCancel && alertStyles.buttonTextCancel,
                        isDestructive && alertStyles.buttonTextDestructive,
                        isPrimary && alertStyles.buttonTextPrimary,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DarkModeBoundary>
  );
}

const alertStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: "center",
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  message: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 340,
  },
  bulletsContainer: {
    width: "100%",
    marginTop: 14,
    marginBottom: 2,
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: "#334155",
  },
  actions: {
    flexDirection: "row",
    width: "100%",
    marginTop: 20,
    justifyContent: "center",
    gap: 10,
  },
  actionsStacked: { flexDirection: "column", gap: 8 },
  button: {
    minHeight: 48,
    minWidth: 110,
    paddingHorizontal: 16,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  buttonHalf: { flex: 1, minWidth: 0, flexShrink: 1 },
  buttonFull: { width: "100%" },
  buttonCancel: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  buttonDestructive: { backgroundColor: "#DC2626" },
  buttonPrimary: { backgroundColor: "#2563EB" },
  buttonText: {
    fontSize: 13.5,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  buttonTextCancel: { color: "#475569" },
  buttonTextDestructive: { color: "#FFFFFF" },
  buttonTextPrimary: { color: "#FFFFFF" },
});

// ================================================================
// SCREEN
// ================================================================

export default function OtpVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const setUser = useAuthStore((s) => s.setUser);
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const inputRefs = useRef<Array<TextInput | null>>([]);
  const otpRef = useRef<string[]>(Array(OTP_LENGTH).fill(""));

  // Last 6-digit code entered — used for account recovery
  const lastCodeRef = useRef<string>("");

  // Recovery token issued by the backend when it detects a deleted account
  const lastRecoveryTokenRef = useRef<string | null>(null);

  // Alert state
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT);

  const showAlert = (
    opts: Omit<AlertState, "visible"> & { visible?: boolean },
  ) => {
    setAlertState({ ...opts, visible: true });
  };
  const dismissAlert = () => setAlertState(EMPTY_ALERT);

  const otpBoxSize = getOtpBoxSize();

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendTimer((current) => current - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendTimer]);

  const clearOtp = () => {
    const emptyOtp = Array(OTP_LENGTH).fill("");

    setOtp(emptyOtp);
    otpRef.current = emptyOtp;

    inputRefs.current[0]?.focus();
  };

  const completeLogin = async (
    userId: string,
    token: string,
    returnedPhone?: string,
  ) => {
    if (!pendingPhone) {
      setError("Session expired. Please start again.");
      return;
    }

    await setSecureItem("auth_token", token);

    const phone = returnedPhone || `+91${pendingPhone}`;

    setUser({
      id: userId,
      phone,
    });

    setPendingPhone(null);

    // --- GOOGLE ADS CONVERSION TRACKING ---
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const gtag = (window as any).gtag;
      if (typeof gtag === "function") {
        gtag("event", "conversion", {
          send_to: "AW-674352071/hjvxCIub95idFMeXx8EC",
        });
        console.log("Google Ads Sign-up Conversion Fired!");
      }
    }
    // ---------------------------------------

    router.replace("/(tabs)/home");
  };

  const handleVerifyDirect = async (otpArray: string[]) => {
    if (loading) {
      return;
    }

    if (!pendingPhone) {
      setError("Session expired. Please start again.");
      return;
    }

    const code = otpArray.join("");
    lastCodeRef.current = code;

    if (code.length !== OTP_LENGTH) {
      setError("Please enter the complete OTP");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await verifyOtp(`+91${pendingPhone}`, code);

      // ── Special case: account was deleted → offer recovery ──
      if (!result.success && result.code === "account_deleted") {
        // Save the recovery token so handleRecover can use it
        lastRecoveryTokenRef.current = result.recoveryToken ?? null;

        setLoading(false);
        showAlert({
          variant: "warning",
          title: "Account Found — Deleted",
          message:
            `The number +91 ${pendingPhone} was used for an account ` +
            `that has been deleted.\n\nDo you want to recover it?`,
          bullets: [
            { icon: "checkmark", text: "Your login with this number" },
            { icon: "close", text: "Your old properties and data" },
            { icon: "close", text: "Your memberships and records" },
          ],
          buttons: [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                lastRecoveryTokenRef.current = null;
                clearOtp();
              },
            },
            {
              text: "Recover",
              onPress: () => {
                handleRecover();
              },
            },
          ],
        });
        return;
      }

      if (result.success && result.userId && result.token) {
        await completeLogin(result.userId, result.token, result.phone);
        return;
      }

      setError(result.message || "Invalid OTP, please try again");
      clearOtp();
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("Unable to verify OTP. Please try again.");
      clearOtp();
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async () => {
    const recoveryToken = lastRecoveryTokenRef.current;

    if (!recoveryToken) {
      setError("Recovery session expired. Please start again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await recoverAccount(recoveryToken);

      if (result.success && result.userId && result.token) {
        lastRecoveryTokenRef.current = null;
        showAlert({
          variant: "success",
          title: "Welcome Back",
          message:
            "Your account has been recovered. You're starting with a " +
            "fresh account — no old properties or data.",
          buttons: [
            {
              text: "Let's Go",
              onPress: async () => {
                await completeLogin(
                  result.userId!,
                  result.token!,
                  result.phone,
                );
              },
            },
          ],
        });
        return;
      }

      showAlert({
        variant: "error",
        title: "Couldn't Recover",
        message:
          result.message ||
          "Something went wrong while trying to recover your account. " +
            "Please try again in a moment.",
        buttons: [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              lastRecoveryTokenRef.current = null;
              clearOtp();
            },
          },
          {
            text: "Try Again",
            onPress: () => {
              handleRecover();
            },
          },
        ],
      });
    } catch (error) {
      console.error("recoverAccount error:", error);
      showAlert({
        variant: "error",
        title: "Couldn't Recover",
        message: "Network error. Please try again.",
        buttons: [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              lastRecoveryTokenRef.current = null;
              clearOtp();
            },
          },
          {
            text: "Try Again",
            onPress: () => {
              handleRecover();
            },
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, "");

    if (digit.length > 1) {
      return;
    }

    const newOtp = [...otp];

    newOtp[index] = digit;

    setOtp(newOtp);
    otpRef.current = newOtp;

    setError("");

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (
      digit &&
      index === OTP_LENGTH - 1 &&
      newOtp.every((value) => value !== "")
    ) {
      setTimeout(() => {
        handleVerifyDirect(newOtp);
      }, 300);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    await handleVerifyDirect(otpRef.current);
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !pendingPhone || loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await sendOtp(`+91${pendingPhone}`);

      if (!result.success) {
        setError(result.message || "Unable to resend OTP.");
        return;
      }

      setResendTimer(RESEND_SECONDS);
      clearOtp();
    } catch (error) {
      console.error("Resend OTP error:", error);
      setError("Unable to resend OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!pendingPhone) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <DarkModeBoundary>
      <KeyboardAvoidingView
        style={[
          styles.container,
          {
            paddingBottom: insets.bottom,
          },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[
            styles.screenContent,
            {
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>

            <View style={styles.headerContent}>
              <View style={styles.logoCircle}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={32}
                  color="#1a73e8"
                />
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Verify OTP</Text>

            <Text style={styles.cardSubtitle}>
              Enter the 6-digit code sent to
            </Text>

            <View style={styles.phoneContainer}>
              <Ionicons name="call-outline" size={18} color="#1a73e8" />

              <Text style={styles.phoneText}>+91 {pendingPhone}</Text>
            </View>

            <View style={styles.otpContainer}>
              <View style={styles.otpRow}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    style={[
                      styles.otpBox,
                      {
                        width: otpBoxSize.width,
                        height: otpBoxSize.height,
                        fontSize: Math.min(22, otpBoxSize.width * 0.5),
                      },
                      focusedIndex === index && styles.otpBoxFocused,
                      digit && styles.otpBoxFilled,
                      error && styles.otpBoxError,
                    ]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    selectionColor="#1a73e8"
                    editable={!loading}
                  />
                ))}
              </View>
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#e53935"
                />

                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {loading ? "Verifying..." : "Verify & Continue"}
              </Text>

              {!loading && (
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#fff"
                  style={styles.buttonIcon}
                />
              )}
            </TouchableOpacity>

            <View style={styles.resendContainer}>
              <Text style={styles.resendLabel}>Didn't receive the code?</Text>

              <TouchableOpacity
                onPress={handleResend}
                disabled={resendTimer > 0 || loading}
                style={styles.resendButton}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.resendText,
                    resendTimer > 0 && styles.resendTextDisabled,
                  ]}
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <View style={styles.footerItem}>
                <View style={styles.footerIcon}>
                  <Ionicons name="lock-closed-outline" size={16} color="#888" />
                </View>

                <Text style={styles.footerText}>Secure & Encrypted</Text>
              </View>

              <View style={styles.footerDivider} />

              <View style={styles.footerItem}>
                <View style={styles.footerIcon}>
                  <Ionicons name="time-outline" size={16} color="#888" />
                </View>

                <Text style={styles.footerText}>OTP expires in 5 min</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <AppAlert state={alertState} onDismiss={dismissAlert} />
      </KeyboardAvoidingView>
    </DarkModeBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },

  screenScroll: {
    flex: 1,
  },

  screenContent: {
    flexGrow: 1,
  },

  header: {
    paddingTop: Platform.OS === "ios" ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    boxShadow: "0px 2px 10px rgba(0, 0, 0, 0.05)",
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f5f7fa",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },

  headerContent: {
    alignItems: "center",
  },

  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e8f0fe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },

  card: {
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 20,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.08)",
  },

  cardTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
  },

  cardSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },

  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "#f0f6ff",
    borderRadius: 20,
    alignSelf: "flex-start",
  },

  phoneText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a73e8",
  },

  otpContainer: {
    marginBottom: 24,
    alignItems: "center",
    width: "100%",
  },

  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },

  otpBox: {
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    textAlign: "center",
    fontWeight: "600",
    color: "#1a1a1a",
    backgroundColor: "#fafafa",

    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
        } as any)
      : {}),
  },

  otpBoxFocused: {
    borderColor: "#1a73e8",
    backgroundColor: "#fff",
    boxShadow: "0px 0px 8px rgba(26, 115, 232, 0.2)",
  },

  otpBoxFilled: {
    borderColor: "#4caf50",
    backgroundColor: "#f0f9f2",
  },

  otpBoxError: {
    borderColor: "#e53935",
    backgroundColor: "#ffebee",
  },

  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#ffebee",
    borderRadius: 8,
  },

  error: {
    color: "#e53935",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    height: 56,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    boxShadow: "0px 4px 12px rgba(26, 115, 232, 0.3)",
  },

  buttonDisabled: {
    backgroundColor: "#a0c4f0",
    opacity: 0.7,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  buttonIcon: {
    marginLeft: 8,
  },

  resendContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 8,
    flexWrap: "wrap",
  },

  resendLabel: {
    fontSize: 14,
    color: "#666",
  },

  resendButton: {
    paddingVertical: 4,
  },

  resendText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
  },

  resendTextDisabled: {
    color: "#999",
  },

  footer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    flexWrap: "wrap",
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)",
  },

  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    maxWidth: "48%",
    gap: 6,
  },

  footerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  footerText: {
    fontSize: 11,
    color: "#888",
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "center",
  },

  footerDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d0d0d0",
    marginHorizontal: 10,
    flexShrink: 0,
  },
});

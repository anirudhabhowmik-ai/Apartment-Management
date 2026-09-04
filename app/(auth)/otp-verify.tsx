import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sendOtp, verifyOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

const { width: screenWidth } = Dimensions.get("window");

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

// Calculate OTP box size based on screen width
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

  const otpBoxSize = getOtpBoxSize();

  // Focus first OTP box when screen opens
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendTimer((current) => current - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendTimer]);

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

    // Move to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Automatically verify when all 6 digits are entered
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

  const handleVerifyDirect = async (otpArray: string[]) => {
    if (!pendingPhone) {
      setError("Session expired. Please start again.");
      return;
    }

    const code = otpArray.join("");

    if (code.length !== OTP_LENGTH) {
      setError("Please enter the complete OTP");
      return;
    }

    setLoading(true);

    const result = await verifyOtp(`+91${pendingPhone}`, code);

    setLoading(false);

    if (result.success && result.userId) {
      const phone = `+91${pendingPhone}`;

      setUser({
        id: result.userId,
        phone,
      });

      setPendingPhone(null);

      router.replace("/(modals)/add-account");
    } else {
      setError(result.message || "Invalid OTP, please try again");

      const emptyOtp = Array(OTP_LENGTH).fill("");

      setOtp(emptyOtp);
      otpRef.current = emptyOtp;

      inputRefs.current[0]?.focus();
    }
  };

  const handleVerify = async () => {
    if (!pendingPhone) {
      setError("Session expired. Please start again.");
      return;
    }

    const code = otp.join("");

    if (code.length !== OTP_LENGTH) {
      setError("Please enter the complete OTP");
      return;
    }

    setLoading(true);

    const result = await verifyOtp(`+91${pendingPhone}`, code);

    setLoading(false);

    if (result.success && result.userId) {
      const phone = `+91${pendingPhone}`;

      setUser({
        id: result.userId,
        phone,
      });

      setPendingPhone(null);

      router.replace("/(modals)/add-account");
    } else {
      setError(result.message || "Invalid OTP, please try again");

      const emptyOtp = Array(OTP_LENGTH).fill("");

      setOtp(emptyOtp);
      otpRef.current = emptyOtp;

      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !pendingPhone) {
      return;
    }

    setResendTimer(RESEND_SECONDS);

    const emptyOtp = Array(OTP_LENGTH).fill("");

    setOtp(emptyOtp);
    otpRef.current = emptyOtp;

    setError("");

    await sendOtp(`+91${pendingPhone}`);

    inputRefs.current[0]?.focus();
  };

  if (!pendingPhone) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
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
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
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

      {/* OTP CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Verify OTP</Text>

        <Text style={styles.cardSubtitle}>Enter the 6-digit code sent to</Text>

        {/* PHONE */}
        <View style={styles.phoneContainer}>
          <Ionicons name="call-outline" size={18} color="#1a73e8" />

          <Text style={styles.phoneText}>+91 {pendingPhone}</Text>
        </View>

        {/* OTP INPUTS */}
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

        {/* ERROR */}
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={18} color="#e53935" />

            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        {/* VERIFY BUTTON */}
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

        {/* RESEND */}
        <View style={styles.resendContainer}>
          <Text style={styles.resendLabel}>Didn't receive the code?</Text>

          <TouchableOpacity
            onPress={handleResend}
            disabled={resendTimer > 0}
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

      {/* FOOTER */}
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
    </KeyboardAvoidingView>
  );
}

// ================================================================
// STYLES - All shadow* replaced with boxShadow
// ================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },

  /* HEADER */
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

  /* CARD */
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

  /* PHONE */
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

  /* OTP */
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

  /* ERROR */
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

  /* BUTTON */
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

  /* RESEND */
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

  /* FOOTER */
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

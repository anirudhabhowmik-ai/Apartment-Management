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
import { sendOtp, verifyOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

const { width } = Dimensions.get("window");
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpVerifyScreen() {
  const router = useRouter();
  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const setUser = useAuthStore((s) => s.setUser);
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    // Auto-focus first input
    if (inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, "");
    if (digit.length > 1) return;

    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError("");

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are filled
    if (digit && index === OTP_LENGTH - 1 && newOtp.every((d) => d !== "")) {
      setTimeout(() => handleVerify(), 300);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
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
      setUser({ id: result.userId, phone });
      setPendingPhone(null);
      router.replace("/(modals)/add-account");
    } else {
      setError(result.message || "Invalid OTP, please try again");
      // Clear OTP on error
      setOtp(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !pendingPhone) return;
    setResendTimer(RESEND_SECONDS);
    setOtp(Array(OTP_LENGTH).fill(""));
    setError("");
    await sendOtp(`+91${pendingPhone}`);
    inputRefs.current[0]?.focus();
  };

  if (!pendingPhone) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
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
        <Text style={styles.cardSubtitle}>Enter the 6-digit code sent to</Text>
        <View style={styles.phoneContainer}>
          <Ionicons name="call-outline" size={18} color="#1a73e8" />
          <Text style={styles.phoneText}>+91 {pendingPhone}</Text>
        </View>

        <View style={styles.otpContainer}>
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <View key={index} style={styles.otpBoxWrapper}>
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpBox,
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
                />
                {index < OTP_LENGTH - 1 && <View style={styles.otpDivider} />}
              </View>
            ))}
          </View>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={18} color="#e53935" />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
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
            disabled={resendTimer > 0}
            style={styles.resendButton}
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
            <Ionicons name="lock-closed-outline" size={16} color="#888" />
            <Text style={styles.footerText}>Secure & Encrypted</Text>
          </View>
          <View style={styles.footerDot} />
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={16} color="#888" />
            <Text style={styles.footerText}>OTP expires in 5 min</Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
    }),
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
    flex: 1,
    margin: 20,
    marginTop: 30,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
    }),
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
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  otpBoxWrapper: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  otpBox: {
    width: 44,
    height: 56,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "600",
    color: "#1a1a1a",
    backgroundColor: "#fafafa",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  otpBoxFocused: {
    borderColor: "#1a73e8",
    backgroundColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#1a73e8",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  otpBoxFilled: {
    borderColor: "#4caf50",
    backgroundColor: "#f0f9f2",
  },
  otpBoxError: {
    borderColor: "#e53935",
    backgroundColor: "#ffebee",
  },
  otpDivider: {
    width: 8,
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
    ...Platform.select({
      ios: {
        shadowColor: "#1a73e8",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      web: {
        shadowColor: "#1a73e8",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
    }),
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
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
    }),
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d0d0d0",
    marginHorizontal: 12,
  },
});

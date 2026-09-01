import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
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
  const inputRefs = useRef<Array<TextInput | null>>([]);

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
      setPendingPhone(null); // clear temp phone, no longer needed
      router.replace("/(modals)/add-account");
    } else {
      setError(result.message || "Invalid OTP, please try again");
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !pendingPhone) return;
    setResendTimer(RESEND_SECONDS);
    setOtp(Array(OTP_LENGTH).fill(""));
    await sendOtp(`+91${pendingPhone}`);
  };

  if (!pendingPhone) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Verify OTP</Text>
      <Text style={styles.subtitle}>
        Enter the code sent to +91 {pendingPhone}
      </Text>

      <View style={styles.otpRow}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            style={styles.otpBox}
            keyboardType="number-pad"
            maxLength={1}
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.button}
        onPress={handleVerify}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Verifying..." : "Verify & Continue"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleResend}
        disabled={resendTimer > 0}
        style={styles.resendRow}
      >
        <Text style={styles.resendText}>
          {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : "Resend OTP"}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 32 },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    textAlign: "center",
    fontSize: 20,
  },
  error: { color: "#e53935", marginTop: 8, fontSize: 13 },
  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  resendRow: { marginTop: 20, alignItems: "center" },
  resendText: { color: "#1a73e8", fontSize: 14, fontWeight: "500" },
});

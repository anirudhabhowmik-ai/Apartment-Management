import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { sendOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

export default function LoginScreen() {
  const router = useRouter();
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSendOtp = async () => {
    setError("");

    if (phone.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setLoading(true);
    const result = await sendOtp(`+91${phone}`);
    setLoading(false);

    if (result.success) {
      setPendingPhone(phone); // stored in memory, never in the URL
      router.push("/(auth)/otp-verify");
    } else {
      setError(result.message || "Something went wrong");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>Enter your phone number to continue</Text>

      <View style={[styles.inputRow, isFocused && styles.inputRowFocused]}>
        <Text style={styles.prefix}>+91</Text>
        <TextInput
          style={styles.input}
          placeholder="9876543210"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={10}
          value={phone}
          onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ""))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSendOtp}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Sending..." : "Send OTP"}
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  inputRowFocused: {
    borderColor: "#1a73e8",
  },
  prefix: { fontSize: 16, marginRight: 8, color: "#333" },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  error: { color: "#e53935", marginBottom: 8, fontSize: 13 },
  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

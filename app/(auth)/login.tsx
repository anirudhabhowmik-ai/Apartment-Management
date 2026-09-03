import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sendOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      setPendingPhone(phone);
      router.push("/(auth)/otp-verify");
    } else {
      setError(result.message || "Something went wrong");
    }
  };

  const pickContact = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Contact picker is only available on mobile devices. Please enter your phone number manually.",
        [{ text: "OK" }],
      );
      return;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your contacts to help you quickly add phone numbers.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => {} },
          ],
        );

        setError("Permission to access contacts is required");
        return;
      }

      const contact = await Contacts.presentContactPickerAsync();

      if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
        let phoneNumber = contact.phoneNumbers[0].number || "";

        phoneNumber = phoneNumber
          .replace(/[^0-9]/g, "")
          .replace(/^91/, "")
          .replace(/^0/, "");

        if (phoneNumber.length > 10) {
          phoneNumber = phoneNumber.slice(-10);
        }

        setPhone(phoneNumber);
        setError("");
      } else {
        setError("Selected contact doesn't have a phone number");
      }
    } catch (error) {
      console.error("Error picking contact:", error);

      if (
        error instanceof Error &&
        !error.message.toLowerCase().includes("cancelled")
      ) {
        setError("Failed to pick contact. Please try again.");
      }
    }
  };

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
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="business-outline" size={40} color="#1a73e8" />
          </View>
        </View>

        <Text style={styles.title}>Property Manager</Text>

        <Text style={styles.subtitle}>Manage your properties effortlessly</Text>
      </View>

      {/* LOGIN CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome Back</Text>

        <Text style={styles.cardSubtitle}>
          Sign in to manage your properties, tenants, and expenses
        </Text>

        {/* PHONE INPUT */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Phone Number</Text>

          <View style={[styles.inputRow, isFocused && styles.inputRowFocused]}>
            <View style={styles.countryCode}>
              <Text style={styles.prefix}>+91</Text>

              <View style={styles.divider} />
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter your phone number"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={10}
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ""))}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              returnKeyType="done"
            />

            <TouchableOpacity
              onPress={pickContact}
              style={styles.contactIcon}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={22} color="#1a73e8" />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* CONTINUE BUTTON */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSendOtp}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {loading ? "Sending..." : "Continue with OTP"}
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
      </View>

      {/* FEATURES FOOTER */}
      <View style={styles.footer}>
        <View style={styles.featureRow}>
          {/* PROPERTY */}
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons name="home-outline" size={20} color="#1a73e8" />
            </View>

            <Text style={styles.featureText} numberOfLines={2}>
              Manage{"\n"}Properties
            </Text>
          </View>

          {/* TENANTS */}
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons name="people-outline" size={20} color="#1a73e8" />
            </View>

            <Text style={styles.featureText} numberOfLines={2}>
              Tenant{"\n"}Management
            </Text>
          </View>

          {/* EXPENSES */}
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons name="cash-outline" size={20} color="#1a73e8" />
            </View>

            <Text style={styles.featureText} numberOfLines={2}>
              Track{"\n"}Expenses
            </Text>
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

  /* HEADER */
  header: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },

      android: {
        elevation: 4,
      },

      web: {
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
    }),
  },

  logoContainer: {
    marginBottom: 12,
  },

  logoCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#e8f0fe",
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -0.5,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
    fontWeight: "400",
  },

  /* LOGIN CARD */
  card: {
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 20,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 20,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 4,
        },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },

      android: {
        elevation: 8,
      },

      web: {
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 4,
        },
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
    marginBottom: 32,
    lineHeight: 20,
  },

  /* INPUT */
  inputWrapper: {
    marginBottom: 24,
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    backgroundColor: "#fafafa",
    height: 56,
    overflow: "hidden",
  },

  inputRowFocused: {
    borderColor: "#1a73e8",
    backgroundColor: "#fff",
  },

  countryCode: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 10,
  },

  prefix: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },

  divider: {
    width: 1.5,
    height: 24,
    backgroundColor: "#e0e0e0",
    marginLeft: 10,
  },

  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: "#1a1a1a",
    paddingHorizontal: 12,

    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
        } as any)
      : {}),
  },

  contactIcon: {
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f6ff",
    borderRadius: 8,
    marginRight: 4,
  },

  error: {
    color: "#e53935",
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
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

    ...Platform.select({
      ios: {
        shadowColor: "#1a73e8",
        shadowOffset: {
          width: 0,
          height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },

      android: {
        elevation: 6,
      },

      web: {
        shadowColor: "#1a73e8",
        shadowOffset: {
          width: 0,
          height: 4,
        },
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

  /* FOOTER */
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 16,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },

      android: {
        elevation: 2,
      },

      web: {
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
    }),
  },

  featureItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  featureText: {
    fontSize: 11,
    color: "#555",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 15,
  },
});

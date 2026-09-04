import { Ionicons } from "@expo/vector-icons";
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  requestPermissionsAsync,
} from "expo-contacts";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sendOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

// ================================================================
// REACT NATIVE WEB WARNING FILTER
// ================================================================
//
// React Native Web may currently emit this internal warning:
//
// "props.pointerEvents is deprecated. Use style.pointerEvents"
//
// The warning is generated inside react-native-web's internal
// touch/press implementation.
//
// We suppress ONLY this exact warning.
// All other warnings and errors remain visible.
// ================================================================

if (
  Platform.OS === "web" &&
  typeof console !== "undefined" &&
  !("__khataPointerWarningFiltered" in console)
) {
  const originalWarn = console.warn;

  console.warn = (...args: unknown[]) => {
    const message = args
      .map((arg) => {
        try {
          if (typeof arg === "string") {
            return arg;
          }

          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

    if (message.includes("props.pointerEvents is deprecated")) {
      return;
    }

    originalWarn(...args);
  };

  Object.defineProperty(console, "__khataPointerWarningFiltered", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: {
    number: string;
    label?: string;
  }[];
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  // ==============================================================
  // BLUR BROWSER FOCUS
  // ==============================================================
  //
  // When navigating on Web, Expo Router hides the current screen.
  // If a button/input still has browser focus, Chrome can report:
  //
  // "Blocked aria-hidden on an element because its descendant
  // retained focus."
  //
  // We remove the browser focus before navigation.
  // ==============================================================

  const blurWebFocus = () => {
    if (Platform.OS !== "web") {
      return;
    }

    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  };

  // ==============================================================
  // SEND OTP
  // ==============================================================

  const handleSendOtp = async () => {
    setError("");

    if (phone.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setLoading(true);

    try {
      const result = await sendOtp(`+91${phone}`);

      if (result.success) {
        // Save phone number before navigation.
        setPendingPhone(phone);

        // IMPORTANT:
        // Remove browser focus before Expo Router hides this page.
        blurWebFocus();

        if (Platform.OS === "web") {
          // Allow the browser to process blur before navigation.
          requestAnimationFrame(() => {
            router.push("/(auth)/otp-verify");
          });
        } else {
          router.push("/(auth)/otp-verify");
        }
      } else {
        setError(result.message || "Something went wrong");
      }
    } catch (error) {
      console.error("OTP error:", error);
      setError("Unable to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ==============================================================
  // PICK CONTACT
  // ==============================================================

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
      const { status } = await requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your contacts to help you quickly add phone numbers.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "OK",
            },
          ],
        );

        setError("Permission to access contacts is required");
        return;
      }

      const contacts = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        {
          sortOrder: ContactsSortOrder.GivenName,
        },
      );

      if (contacts.length === 0) {
        setError("No contacts found on your device");
        return;
      }

      const mappedContacts: ContactData[] = contacts
        .filter((contact) => contact.phones && contact.phones.length > 0)
        .map((contact) => ({
          id: contact.id,
          name: contact.fullName || "Unknown",
          phoneNumbers: contact.phones.map((phone) => ({
            number: phone.number || "",
            label: phone.label || undefined,
          })),
        }));

      if (mappedContacts.length === 0) {
        setError("No contacts with phone numbers found");
        return;
      }

      setContactSearch("");
      setContactsList(mappedContacts);
      setShowContactPicker(true);
      setError("");
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setError("Failed to fetch contacts. Please try again.");
    }
  };

  // ==============================================================
  // FILTER CONTACTS
  // ==============================================================

  const filteredContacts = contactsList.filter((contact) => {
    const search = contactSearch.toLowerCase().trim();

    if (!search) {
      return true;
    }

    const nameMatch = contact.name.toLowerCase().includes(search);

    const phoneMatch = contact.phoneNumbers.some((phone) =>
      phone.number.toLowerCase().includes(search),
    );

    return nameMatch || phoneMatch;
  });

  // ==============================================================
  // CLOSE CONTACT PICKER
  // ==============================================================

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);

    // Make sure Web doesn't retain focus inside the modal.
    blurWebFocus();
  };

  // ==============================================================
  // SELECT CONTACT
  // ==============================================================

  const selectContact = (contact: ContactData) => {
    if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      let phoneNumber = contact.phoneNumbers[0].number || "";

      // Remove spaces, +, -, brackets, etc.
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

      // Remove country code.
      phoneNumber = phoneNumber.replace(/^91/, "");

      // Remove leading zero.
      phoneNumber = phoneNumber.replace(/^0/, "");

      // If still longer than 10 digits, take last 10.
      if (phoneNumber.length > 10) {
        phoneNumber = phoneNumber.slice(-10);
      }

      if (phoneNumber.length !== 10) {
        setError(
          "Selected contact does not have a valid 10-digit phone number",
        );
        return;
      }

      setPhone(phoneNumber);
      setError("");

      setContactSearch("");
      setShowContactPicker(false);

      blurWebFocus();
    } else {
      setError("Selected contact doesn't have a phone number");
    }
  };

  // ==============================================================
  // CONTACT PICKER MODAL
  // ==============================================================

  const renderContactPickerModal = () => {
    if (!showContactPicker) {
      return null;
    }

    return (
      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={closeContactPicker}
      >
        <TouchableWithoutFeedback onPress={closeContactPicker}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContainer}>
                {/* ==================================================
                    MODAL HEADER
                ================================================== */}

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Contact</Text>

                  <Pressable
                    onPress={closeContactPicker}
                    style={({ pressed }) => [
                      styles.modalCloseButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="close" size={24} color="#333" />
                  </Pressable>
                </View>

                {/* ==================================================
                    SEARCH
                ================================================== */}

                <View style={styles.modalSearchContainer}>
                  <Ionicons name="search" size={20} color="#999" />

                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Search contacts..."
                    placeholderTextColor="#999"
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    autoFocus={false}
                    {...(Platform.OS === "web"
                      ? ({
                          outlineStyle: "none",
                        } as any)
                      : {})}
                  />

                  {contactSearch.length > 0 && (
                    <Pressable
                      onPress={() => setContactSearch("")}
                      style={({ pressed }) => [
                        styles.clearSearchButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="close-circle" size={20} color="#999" />
                    </Pressable>
                  )}
                </View>

                {/* ==================================================
                    CONTACT LIST
                ================================================== */}

                <View style={styles.contactListWrapper}>
                  <ScrollView
                    style={styles.contactListContainer}
                    contentContainerStyle={styles.contactListContent}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    scrollEnabled
                    bounces
                    alwaysBounceVertical
                    removeClippedSubviews={false}
                  >
                    {filteredContacts.length > 0 ? (
                      filteredContacts.map((contact) => (
                        <Pressable
                          key={contact.id}
                          style={({ pressed }) => [
                            styles.contactItem,
                            pressed && styles.contactItemPressed,
                          ]}
                          onPress={() => selectContact(contact)}
                        >
                          {/* AVATAR */}
                          <View style={styles.contactAvatar}>
                            <Text style={styles.contactAvatarText}>
                              {contact.name
                                ? contact.name.charAt(0).toUpperCase()
                                : "?"}
                            </Text>
                          </View>

                          {/* CONTACT INFO */}
                          <View style={styles.contactInfo}>
                            <Text style={styles.contactName} numberOfLines={1}>
                              {contact.name || "Unknown"}
                            </Text>

                            {contact.phoneNumbers &&
                              contact.phoneNumbers.length > 0 && (
                                <Text
                                  style={styles.contactPhone}
                                  numberOfLines={1}
                                >
                                  {contact.phoneNumbers[0].number}
                                </Text>
                              )}
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color="#ccc"
                          />
                        </Pressable>
                      ))
                    ) : (
                      <View style={styles.noContactsContainer}>
                        <View style={styles.noContactsIcon}>
                          <Ionicons
                            name="search-outline"
                            size={32}
                            color="#999"
                          />
                        </View>

                        <Text style={styles.noContactsTitle}>
                          No contacts found
                        </Text>

                        <Text style={styles.noContactsText}>
                          Try searching with a different name or phone number.
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>

                {/* ==================================================
                    MODAL FOOTER
                ================================================== */}

                <View style={styles.modalFooter}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalCancelButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={closeContactPicker}
                  >
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // ==============================================================
  // SCREEN
  // ==============================================================

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
      {/* ========================================================
          HEADER
      ======================================================== */}

      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="business-outline" size={40} color="#1a73e8" />
          </View>
        </View>

        <Text style={styles.title}>Property Manager</Text>

        <Text style={styles.subtitle}>Manage your properties effortlessly</Text>
      </View>

      {/* ========================================================
          LOGIN CARD
      ======================================================== */}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome Back</Text>

        <Text style={styles.cardSubtitle}>
          Sign in to manage your properties, tenants, and expenses
        </Text>

        {/* ======================================================
            PHONE INPUT
        ====================================================== */}

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Phone Number</Text>

          <View style={[styles.inputRow, isFocused && styles.inputRowFocused]}>
            {/* COUNTRY CODE */}

            <View style={styles.countryCode}>
              <Text style={styles.prefix}>+91</Text>

              <View style={styles.divider} />
            </View>

            {/* PHONE INPUT */}

            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={10}
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ""))}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              returnKeyType="done"
              {...(Platform.OS === "web"
                ? ({
                    outlineStyle: "none",
                  } as any)
                : {})}
            />

            {/* CONTACT BUTTON */}

            <Pressable
              onPress={pickContact}
              style={({ pressed }) => [
                styles.contactIcon,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="person-outline" size={22} color="#1a73e8" />
            </Pressable>
          </View>

          {/* ERROR */}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* ======================================================
            CONTINUE BUTTON
        ====================================================== */}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            loading && styles.buttonDisabled,
            pressed && !loading && styles.buttonPressed,
          ]}
          onPress={handleSendOtp}
          disabled={loading}
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
        </Pressable>
      </View>

      {/* ========================================================
          FEATURES FOOTER
      ======================================================== */}

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

      {/* ========================================================
          CONTACT PICKER
      ======================================================== */}

      {renderContactPickerModal()}
    </KeyboardAvoidingView>
  );
}

// =================================================================
// STYLES
// =================================================================

const styles = StyleSheet.create({
  // ==============================================================
  // CONTAINER
  // ==============================================================

  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },

  // ==============================================================
  // HEADER
  // ==============================================================

  header: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    boxShadow: "0px 2px 10px rgba(0, 0, 0, 0.05)",
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

  // ==============================================================
  // LOGIN CARD
  // ==============================================================

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
    marginBottom: 32,
    lineHeight: 20,
  },

  // ==============================================================
  // INPUT
  // ==============================================================

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

  // ==============================================================
  // BUTTON
  // ==============================================================

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

  buttonPressed: {
    opacity: 0.9,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  buttonIcon: {
    marginLeft: 8,
  },

  // ==============================================================
  // PRESSED STATE
  // ==============================================================

  pressed: {
    opacity: 0.7,
  },

  // ==============================================================
  // FOOTER
  // ==============================================================

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
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)",
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

  // ==============================================================
  // CONTACT MODAL
  // ==============================================================

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "85%",
    minHeight: "40%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
  },

  modalCloseButton: {
    padding: 4,
  },

  modalSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    minHeight: 46,
  },

  modalSearchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 15,
    color: "#1a1a1a",

    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
        } as any)
      : {}),
  },

  clearSearchButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },

  contactListWrapper: {
    flex: 1,
    minHeight: 200,
    maxHeight: 400,
  },

  contactListContainer: {
    flex: 1,
  },

  contactListContent: {
    paddingBottom: 8,
  },

  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },

  contactItemPressed: {
    opacity: 0.7,
    backgroundColor: "#fafafa",
  },

  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e8f0fe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  contactAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a73e8",
  },

  contactInfo: {
    flex: 1,
    marginRight: 8,
  },

  contactName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },

  contactPhone: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  noContactsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },

  noContactsIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  noContactsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },

  noContactsText: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    lineHeight: 19,
  },

  modalFooter: {
    paddingTop: 16,
    paddingBottom: 20,
  },

  modalCancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },

  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555",
  },
});

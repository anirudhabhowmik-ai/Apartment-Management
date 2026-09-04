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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sendOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

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

  // ============================================================
  // SEND OTP
  // ============================================================

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
        setPendingPhone(phone);
        router.push("/(auth)/otp-verify");
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

  // ============================================================
  // PICK CONTACT
  // ============================================================

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
      // Request permission
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

      // ========================================================
      // CURRENT EXPO CONTACTS API
      // ========================================================

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

      // Convert Expo contacts into our own format
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

      // Reset search whenever picker opens
      setContactSearch("");

      setContactsList(mappedContacts);
      setShowContactPicker(true);
      setError("");
    } catch (error) {
      console.error("Error fetching contacts:", error);

      setError("Failed to fetch contacts. Please try again.");
    }
  };

  // ============================================================
  // FILTER CONTACTS
  // ============================================================

  const filteredContacts = contactsList.filter((contact) => {
    const search = contactSearch.toLowerCase().trim();

    // Show everything if search is empty
    if (!search) {
      return true;
    }

    // Search by contact name
    const nameMatch = contact.name.toLowerCase().includes(search);

    // Search by phone number
    const phoneMatch = contact.phoneNumbers.some((phone) =>
      phone.number.toLowerCase().includes(search),
    );

    return nameMatch || phoneMatch;
  });

  // ============================================================
  // CLOSE CONTACT PICKER
  // ============================================================

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  // ============================================================
  // SELECT CONTACT
  // ============================================================

  const selectContact = (contact: ContactData) => {
    if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      let phoneNumber = contact.phoneNumbers[0].number || "";

      // Remove spaces, +, -, brackets etc.
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

      // Remove Indian country code
      phoneNumber = phoneNumber.replace(/^91/, "");

      // Remove leading zero
      phoneNumber = phoneNumber.replace(/^0/, "");

      // Keep last 10 digits
      if (phoneNumber.length > 10) {
        phoneNumber = phoneNumber.slice(-10);
      }

      // Validate
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
    } else {
      setError("Selected contact doesn't have a phone number");
    }
  };

  // ============================================================
  // CONTACT PICKER MODAL - Fixed with no extra bottom space
  // ============================================================

  const renderContactPickerModal = () => {
    if (!showContactPicker) {
      return null;
    }

    return (
      <Modal
        visible={showContactPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={closeContactPicker}
      >
        <TouchableWithoutFeedback onPress={closeContactPicker}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContainer}>
                {/* MODAL HEADER */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Contact</Text>

                  <TouchableOpacity
                    onPress={closeContactPicker}
                    style={styles.modalCloseButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>

                {/* SEARCH */}
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
                  />

                  {/* CLEAR SEARCH BUTTON */}
                  {contactSearch.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setContactSearch("")}
                      style={styles.clearSearchButton}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle" size={20} color="#999" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* CONTACT LIST - Fixed with proper scrolling */}
                <View style={styles.contactListWrapper}>
                  <ScrollView
                    style={styles.contactListContainer}
                    contentContainerStyle={styles.contactListContent}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                    scrollEnabled={true}
                    bounces={true}
                    alwaysBounceVertical={true}
                    removeClippedSubviews={false}
                  >
                    {filteredContacts.length > 0 ? (
                      filteredContacts.map((contact) => (
                        <TouchableOpacity
                          key={contact.id}
                          style={styles.contactItem}
                          onPress={() => selectContact(contact)}
                          activeOpacity={0.7}
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

                          {/* ARROW */}
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color="#ccc"
                          />
                        </TouchableOpacity>
                      ))
                    ) : (
                      // NO SEARCH RESULTS
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

                {/* CANCEL BUTTON */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={closeContactPicker}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // ============================================================
  // SCREEN
  // ============================================================

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
            />

            {/* CONTACT BUTTON */}
            <TouchableOpacity
              onPress={pickContact}
              style={styles.contactIcon}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={22} color="#1a73e8" />
            </TouchableOpacity>
          </View>

          {/* ERROR */}
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

      {/* CONTACT PICKER */}
      {renderContactPickerModal()}
    </KeyboardAvoidingView>
  );
}

// ================================================================
// STYLES
// ================================================================

const styles = StyleSheet.create({
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

  // ==============================================================
  // CONTACT MODAL - Fixed with no extra bottom space
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

  // SEARCH
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
  },

  clearSearchButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },

  // CONTACT LIST WRAPPER
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

  // NO CONTACTS
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

  // MODAL FOOTER
  modalFooter: {
    paddingTop: 16,
    paddingBottom: 20,
  },

  // CANCEL
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

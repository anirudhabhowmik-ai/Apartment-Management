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
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import { sendOtp } from "../../services/otpService";
import { useAuthStore } from "../../store/useAuthStore";

// ================================================================
// REACT NATIVE WEB WARNING FILTER
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

// ================================================================
// PUBLIC LEGAL URLS (GitHub Pages)
// ================================================================

const LEGAL_URLS = {
  privacy:
    "https://anirudhabhowmik-ai.github.io/apartment-management-legal/privacy.html",
  terms:
    "https://anirudhabhowmik-ai.github.io/apartment-management-legal/terms.html",
} as const;

// ================================================================
// APK DOWNLOAD URL
// ================================================================

const APK_DOWNLOAD_URL = "/apartment-manage.apk";

const openLegalUrl = async (type: "privacy" | "terms") => {
  const url = LEGAL_URLS[type];
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Unable to open link", url);
    }
  } catch {
    Alert.alert("Unable to open link", url);
  }
};

const handleDownloadApk = async () => {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = APK_DOWNLOAD_URL;
      return;
    }

    const supported = await Linking.canOpenURL(APK_DOWNLOAD_URL);
    if (supported) {
      await Linking.openURL(APK_DOWNLOAD_URL);
    } else {
      Alert.alert("Unable to open link", APK_DOWNLOAD_URL);
    }
  } catch {
    Alert.alert("Unable to download app", APK_DOWNLOAD_URL);
  }
};

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
        setPendingPhone(phone);

        blurWebFocus();

        if (Platform.OS === "web") {
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

    blurWebFocus();
  };

  // ==============================================================
  // SELECT CONTACT
  // ==============================================================

  const selectContact = (contact: ContactData) => {
    if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      let phoneNumber = contact.phoneNumbers[0].number || "";

      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
      phoneNumber = phoneNumber.replace(/^91/, "");
      phoneNumber = phoneNumber.replace(/^0/, "");

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
                          <View style={styles.contactAvatar}>
                            <Text style={styles.contactAvatarText}>
                              {contact.name
                                ? contact.name.charAt(0).toUpperCase()
                                : "?"}
                            </Text>
                          </View>

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
    <DarkModeBoundary>
      <KeyboardAvoidingView
        style={[
          styles.container,
          {
            paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
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
          {/* HEADER */}

          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Image
                  source={require("../../assets/images/logo-mark.png")}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text style={styles.title}>Property Manager</Text>

            <Text style={styles.subtitle}>
              Manage your properties effortlessly
            </Text>
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

              <View
                style={[styles.inputRow, isFocused && styles.inputRowFocused]}
              >
                <View style={styles.countryCode}>
                  <Text style={styles.prefix}>+91</Text>

                  <View style={styles.divider} />
                </View>

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

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            {/* CONTINUE BUTTON */}

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

            {/* ====================================================
                DOWNLOAD ANDROID APP (WEB ONLY)
            ==================================================== */}

            {Platform.OS === "web" && (
              <View style={styles.downloadSection}>
                {/* Image-based hero card */}
                <View style={styles.downloadHero}>
                  {/* Decorative background circles */}
                  <View style={styles.downloadHeroCircle1} />
                  <View style={styles.downloadHeroCircle2} />

                  <View style={styles.downloadContentRow}>
                    {/* LEFT: Text */}
                    <View style={styles.downloadTextCol}>
                      <View style={styles.downloadBadge}>
                        <Ionicons name="sparkles" size={10} color="#fff" />
                        <Text style={styles.downloadBadgeText}>
                          RECOMMENDED
                        </Text>
                      </View>

                      <Text style={styles.downloadHeroTitle}>Get the App</Text>

                      <Text style={styles.downloadHeroSubtitle}>
                        Faster login, instant notifications, and a smoother
                        experience.
                      </Text>
                    </View>

                    {/* RIGHT: Phone mockup image */}
                    <Image
                      source={require("../../assets/images/apkDownload.jfif")}
                      style={styles.downloadMockupImage}
                      resizeMode="contain"
                    />
                  </View>

                  {/* CTA Button */}
                  <Pressable
                    onPress={handleDownloadApk}
                    style={({ pressed }) => [
                      styles.downloadCta,
                      pressed && styles.downloadCtaPressed,
                    ]}
                  >
                    <Ionicons name="logo-android" size={20} color="#1a73e8" />
                    <Text style={styles.downloadCtaText}>
                      Download for Android
                    </Text>
                    <Ionicons
                      name="download-outline"
                      size={18}
                      color="#1a73e8"
                    />
                  </Pressable>

                  {/* Trust row */}
                  <View style={styles.downloadTrustRow}>
                    <View style={styles.downloadTrustItem}>
                      <Ionicons
                        name="shield-checkmark"
                        size={12}
                        color="#dbeafe"
                      />
                      <Text style={styles.downloadTrustText}>Safe</Text>
                    </View>

                    <View style={styles.downloadTrustDot} />

                    <View style={styles.downloadTrustItem}>
                      <Ionicons name="cube-outline" size={12} color="#dbeafe" />
                      <Text style={styles.downloadTrustText}>25 MB</Text>
                    </View>

                    <View style={styles.downloadTrustDot} />

                    <View style={styles.downloadTrustItem}>
                      <Ionicons
                        name="pricetag-outline"
                        size={12}
                        color="#dbeafe"
                      />
                      <Text style={styles.downloadTrustText}>v1.0.0</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* LEGAL CONSENT */}

            <View style={styles.legalRow}>
              <Text style={styles.legalText}>
                By continuing, you agree to our{" "}
              </Text>

              <Pressable
                onPress={() => openLegalUrl("terms")}
                hitSlop={6}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.legalLink}>Terms of Service</Text>
              </Pressable>

              <Text style={styles.legalText}> and </Text>

              <Pressable
                onPress={() => openLegalUrl("privacy")}
                hitSlop={6}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </Pressable>
            </View>
          </View>

          {/* FOOTER */}

          <View style={styles.footer}>
            <View style={styles.featureRow}>
              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name="home-outline" size={20} color="#1a73e8" />
                </View>

                <Text style={styles.featureText} numberOfLines={2}>
                  Manage{"\n"}Properties
                </Text>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name="people-outline" size={20} color="#1a73e8" />
                </View>

                <Text style={styles.featureText} numberOfLines={2}>
                  Tenant{"\n"}Management
                </Text>
              </View>

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
        </ScrollView>

        {renderContactPickerModal()}
      </KeyboardAvoidingView>
    </DarkModeBoundary>
  );
}

// =================================================================
// STYLES
// =================================================================

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

  // HEADER
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

  logoImage: {
    width: 44,
    height: 44,
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

  // LOGIN CARD
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

  // INPUT
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

  // BUTTON
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

  pressed: {
    opacity: 0.7,
  },

  // ==============================================================
  // DOWNLOAD SECTION (IMAGE-BASED)
  // ==============================================================

  downloadSection: {
    marginTop: 24,
  },

  downloadHero: {
    backgroundColor: "#1a73e8",
    borderRadius: 20,
    padding: 20,
    overflow: "hidden",
    position: "relative",
    boxShadow: "0px 10px 30px rgba(26, 115, 232, 0.35)",
  },

  downloadHeroCircle1: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -60,
    right: -50,
  },

  downloadHeroCircle2: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: -40,
    left: -30,
  },

  downloadContentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  downloadTextCol: {
    flex: 1,
    paddingRight: 8,
  },

  downloadBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 10,
    gap: 4,
  },

  downloadBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  downloadHeroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: -0.3,
  },

  downloadHeroSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    lineHeight: 17,
  },

  downloadMockupImage: {
    width: 100,
    height: 140,
  },

  downloadCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginBottom: 12,
    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
  },

  downloadCtaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },

  downloadCtaText: {
    color: "#1a73e8",
    fontSize: 15,
    fontWeight: "700",
  },

  downloadTrustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  downloadTrustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  downloadTrustText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: "600",
  },

  downloadTrustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.5)",
  },

  // LEGAL
  legalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },

  legalText: {
    fontSize: 12,
    color: "#8a8a8a",
    lineHeight: 18,
  },

  legalLink: {
    fontSize: 12,
    color: "#1a73e8",
    fontWeight: "600",
    lineHeight: 18,
  },

  // FOOTER
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

  // CONTACT MODAL
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

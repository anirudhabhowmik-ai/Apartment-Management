import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { sendOtp, verifyOtp } from "../../services/otpService";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";

interface MenuItem {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  showArrow?: boolean;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, setUser } = useAuthStore();
  const { selectedAccount, editAccount } = useAccounts();
  const setAccountSwitcherOpen = useAccountStore(
    (state) => state.setAccountSwitcherOpen,
  );
  const grants = useAccessStore((state) => state.grants);
  const removeGrant = useAccessStore((state) => state.removeGrant);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [invitationToDelete, setInvitationToDelete] = useState<string | null>(
    null,
  );

  const accountGrants = grants.filter(
    (grant) => grant.accountId === selectedAccount?.id,
  );
  const pendingInvitations = accountGrants.filter((grant) => !grant.acceptedAt);
  const acceptedAdmins = accountGrants.filter(
    (grant) => grant.acceptedAt && grant.role === "admin",
  );
  const visibleMembers = accountGrants.filter(
    (grant) => grant.acceptedAt && grant.role === "member_visibility",
  );

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            // Add your delete account logic here
            Alert.alert("Account deleted successfully");
          },
        },
      ],
    );
  };

  const confirmDeleteInvitation = () => {
    if (!invitationToDelete) return;
    removeGrant(invitationToDelete);
    setInvitationToDelete(null);
  };

  const handleChangePhoto = async () => {
    if (!selectedAccount) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please grant permission to access your photos.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await editAccount(selectedAccount.id, { photoUri: result.assets[0].uri });
    }
  };

  const startEditingName = () => {
    setPropertyName(selectedAccount?.name || "");
    setEditingName(true);
  };

  const savePropertyName = async () => {
    const trimmedName = propertyName.trim();
    if (!trimmedName || !selectedAccount) return;

    await editAccount(selectedAccount.id, { name: trimmedName });
    setEditingName(false);
  };

  const openPhoneEditor = () => {
    setPhone("");
    setPhoneOtp("");
    setPhoneError("");
    setPhoneOtpSent(false);
    setShowPhoneModal(true);
  };

  const handleSendPhoneOtp = async () => {
    if (phone.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number");
      return;
    }
    const result = await sendOtp(`+91${phone}`);
    if (result.success) {
      setPhoneOtpSent(true);
      setPhoneError("");
    } else {
      setPhoneError(result.message || "Unable to send OTP");
    }
  };

  const verifyPhoneOtp = async () => {
    const result = await verifyOtp(`+91${phone}`, phoneOtp);
    if (!result.success) {
      setPhoneError(result.message || "Invalid OTP");
      return;
    }
    if (user) {
      setUser({ ...user, phone: `+91${phone}` });
    }
    setShowPhoneModal(false);
  };

  const menuItems: MenuItem[] = [
    {
      id: "switch_account",
      title: "Switch Account",
      icon: "swap-horizontal-outline",
      color: "#1a73e8",
      onPress: () => setAccountSwitcherOpen(true),
    },
    {
      id: "add_admin",
      title: "Add Admin",
      icon: "shield-outline",
      color: "#7c3aed",
      onPress: () =>
        router.push({
          pathname: "/(modals)/grant-access",
          params: { accountId: selectedAccount?.id || "", role: "admin" },
        }),
    },
    {
      id: "invite_member",
      title: "Invite Member",
      icon: "person-add-outline",
      color: "#4CAF50",
      onPress: () =>
        router.push({
          pathname: "/(modals)/grant-access",
          params: {
            accountId: selectedAccount?.id || "",
            role: "member_visibility",
            memberType: "owner",
          },
        }),
    },
    {
      id: "invite_staff",
      title: "Invite Staff",
      icon: "people-outline",
      color: "#0891b2",
      onPress: () =>
        router.push({
          pathname: "/(modals)/grant-access",
          params: {
            accountId: selectedAccount?.id || "",
            role: "member_visibility",
            memberType: "staff",
          },
        }),
    },
    {
      id: "notifications",
      title: "Notifications",
      icon: "notifications-outline",
      color: "#FF9800",
      onPress: () => setNotifications((enabled) => !enabled),
      showArrow: false,
    },
    {
      id: "dark_mode",
      title: "Dark Mode",
      icon: "moon-outline",
      color: "#607D8B",
      onPress: () => setDarkMode((enabled) => !enabled),
      showArrow: false,
    },
    {
      id: "delete_account",
      title: "Delete Account",
      icon: "trash-outline",
      color: "#F44336",
      onPress: handleDeleteAccount,
    },
    {
      id: "privacy_policy",
      title: "Privacy Policy",
      icon: "shield-checkmark-outline",
      color: "#0891b2",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "Privacy Policy", type: "privacy" },
        }),
    },
    {
      id: "terms_conditions",
      title: "Terms & Conditions",
      icon: "document-text-outline",
      color: "#7c3aed",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "Terms & Conditions", type: "terms" },
        }),
    },
    {
      id: "about_us",
      title: "About Us",
      icon: "information-circle-outline",
      color: "#4CAF50",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "About Us", type: "about" },
        }),
    },
    {
      id: "help_support",
      title: "Help & Support",
      icon: "help-circle-outline",
      color: "#FF9800",
      onPress: () =>
        router.push({
          pathname: "/(modals)/legal-page",
          params: { title: "Help & Support", type: "support" },
        }),
    },
    {
      id: "rate_app",
      title: "Rate the App",
      icon: "star-outline",
      color: "#f59e0b",
      onPress: () => {
        // wire up to Linking.openURL(storeUrl) later
      },
    },
  ];

  const settingsSections = [
    { title: "Account", itemIds: ["switch_account", "delete_account"] },
    {
      title: "Access & Roles",
      itemIds: ["add_admin", "invite_member", "invite_staff"],
    },
    { title: "Preferences", itemIds: ["notifications", "dark_mode"] },
    {
      title: "Legal & Support",
      itemIds: [
        "privacy_policy",
        "terms_conditions",
        "about_us",
        "help_support",
        "rate_app",
      ],
    },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {selectedAccount?.photoUri ? (
              <Image
                source={{ uri: selectedAccount.photoUri }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {selectedAccount?.name
                    ? getInitials(selectedAccount.name)
                    : "A"}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={handleChangePhoto}
            >
              <Ionicons name="camera-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileDetailRow}>
            {editingName ? (
              <View style={styles.nameEditContainer}>
                <TextInput
                  style={styles.inlineNameInput}
                  value={propertyName}
                  onChangeText={setPropertyName}
                  autoFocus
                  onSubmitEditing={savePropertyName}
                />
                <TouchableOpacity
                  style={styles.saveButtonSmall}
                  onPress={savePropertyName}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameDisplayContainer}>
                <Text style={styles.userName}>
                  {selectedAccount?.name || "Apartment"}
                </Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={startEditingName}
                >
                  <Ionicons name="create-outline" size={14} color="#1a73e8" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.profileDetailRow}>
            <Text style={styles.userPhone}>
              {user?.phone || "+91 9876543210"}
            </Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={openPhoneEditor}
            >
              <Ionicons name="create-outline" size={14} color="#1a73e8" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#F44336" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {settingsSections.map((section) => {
          const items = menuItems.filter((item) =>
            section.itemIds.includes(item.id),
          );
          return (
            <View key={section.title} style={styles.menuSection}>
              <Text style={styles.menuSectionTitle}>{section.title}</Text>
              {items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.menuItem,
                    index === items.length - 1 && styles.menuItemLast,
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemLeft}>
                    <View
                      style={[
                        styles.menuIcon,
                        { backgroundColor: item.color + "15" },
                      ]}
                    >
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                  </View>
                  {item.id === "notifications" ? (
                    <Switch
                      value={notifications}
                      onValueChange={setNotifications}
                      trackColor={{ false: "#e0e0e0", true: "#1a73e8" }}
                    />
                  ) : item.id === "dark_mode" ? (
                    <Switch
                      value={darkMode}
                      onValueChange={setDarkMode}
                      trackColor={{ false: "#e0e0e0", true: "#1a73e8" }}
                    />
                  ) : item.showArrow !== false ? (
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        <View style={styles.accessOverview}>
          <Text style={styles.menuSectionTitle}>People With Access</Text>
          {selectedAccount?.ownerId === user?.id && (
            <View
              style={[
                styles.accessRow,
                acceptedAdmins.length === 0 &&
                  visibleMembers.length === 0 &&
                  pendingInvitations.length === 0 &&
                  styles.lastAccessRow,
              ]}
            >
              <View style={[styles.accessAvatar, styles.adminAvatar]}>
                <Text style={styles.accessAvatarText}>
                  {(user?.name || "You").charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.accessInfo}>
                <Text style={styles.accessName}>You</Text>
                <Text style={styles.accessPhone}>{user?.phone || ""}</Text>
              </View>
              <View style={[styles.accessBadge, styles.adminBadge]}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            </View>
          )}

          {acceptedAdmins.length > 0 && (
            <>
              <Text style={styles.accessHeading}>Admins</Text>
              {acceptedAdmins.map((grant) => (
                <View key={grant.id} style={styles.accessRow}>
                  <View style={[styles.accessAvatar, styles.adminAvatar]}>
                    <Text style={styles.accessAvatarText}>
                      {grant.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <View style={[styles.accessBadge, styles.adminBadge]}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {visibleMembers.length > 0 && (
            <>
              <Text style={styles.accessHeading}>Members</Text>
              {visibleMembers.map((grant) => (
                <View key={grant.id} style={styles.accessRow}>
                  <View style={[styles.accessAvatar, styles.memberAvatar]}>
                    <Text style={styles.accessAvatarText}>
                      {grant.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <View style={[styles.accessBadge, styles.memberBadge]}>
                    <Text style={styles.memberBadgeText}>Member</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {pendingInvitations.length > 0 && (
            <>
              <Text style={styles.accessHeading}>Pending Invitations</Text>
              {pendingInvitations.map((grant, i) => (
                <View
                  key={grant.id}
                  style={[
                    styles.accessRow,
                    i === pendingInvitations.length - 1 && styles.lastAccessRow,
                  ]}
                >
                  <View style={[styles.accessAvatar, styles.pendingAvatar]}>
                    <Ionicons name="time-outline" size={19} color="#d97706" />
                  </View>
                  <View style={styles.accessInfo}>
                    <Text style={styles.accessName}>{grant.name}</Text>
                    <Text style={styles.accessPhone}>{grant.phone}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteInvitationButton}
                    onPress={() => setInvitationToDelete(grant.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>

        <Text style={styles.versionText}>Version 1.0.0</Text>

        {/* Phone Edit Modal */}
        <Modal
          transparent
          animationType="fade"
          visible={showPhoneModal}
          onRequestClose={() => setShowPhoneModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.editModal}>
              <Text style={styles.editModalTitle}>Change Phone Number</Text>
              <Text style={styles.currentPhone}>
                Current number: {user?.phone || "Not set"}
              </Text>
              <Text style={styles.fieldLabel}>New phone number</Text>
              <View style={styles.phoneInputRow}>
                <Text style={styles.phonePrefix}>+91</Text>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(value) => {
                    const cleaned = value.replace(/[^0-9]/g, "");
                    setPhone(cleaned.slice(0, 10));
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="9876543210"
                  placeholderTextColor="#999"
                />
              </View>
              {phoneOtpSent && (
                <>
                  <Text style={styles.fieldLabel}>Verification code</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={phoneOtp}
                    onChangeText={(value) => {
                      const cleaned = value.replace(/[^0-9]/g, "");
                      setPhoneOtp(cleaned.slice(0, 6));
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor="#999"
                  />
                </>
              )}
              {phoneError ? (
                <Text style={styles.validationText}>{phoneError}</Text>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowPhoneModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (phoneOtpSent
                      ? phoneOtp.length !== 6
                      : phone.length !== 10) && styles.saveButtonDisabled,
                  ]}
                  onPress={phoneOtpSent ? verifyPhoneOtp : handleSendPhoneOtp}
                  disabled={
                    phoneOtpSent ? phoneOtp.length !== 6 : phone.length !== 10
                  }
                >
                  <Text style={styles.saveButtonText}>
                    {phoneOtpSent ? "Verify OTP" : "Send OTP"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Delete Invitation Confirmation Modal */}
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(invitationToDelete)}
          onRequestClose={() => setInvitationToDelete(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.editModal}>
              <Text style={styles.editModalTitle}>Delete Invitation?</Text>
              <Text style={styles.currentPhone}>
                This person will no longer be able to accept this invitation.
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setInvitationToDelete(null)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteInvitationConfirmButton}
                  onPress={confirmDeleteInvitation}
                >
                  <Text style={styles.deleteInvitationConfirmText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 16,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
  },
  cameraButton: {
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderColor: "#fff",
    borderRadius: 16,
    borderWidth: 2,
    bottom: -2,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 32,
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  userPhone: {
    fontSize: 14,
    color: "#666",
  },
  profileDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  nameDisplayContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  nameEditContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineNameInput: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111",
    borderBottomWidth: 2,
    borderBottomColor: "#1a73e8",
    paddingVertical: 4,
    minWidth: 120,
    textAlign: "center",
  },
  editButton: {
    marginLeft: 8,
    padding: 4,
  },
  saveButtonSmall: {
    backgroundColor: "#1a73e8",
    borderRadius: 20,
    padding: 6,
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "#fee2e2",
  },
  logoutText: {
    color: "#F44336",
    fontWeight: "600",
    marginLeft: 8,
    fontSize: 14,
  },
  menuSection: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  menuSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuItemTitle: {
    fontSize: 15,
    color: "#222",
    fontWeight: "500",
  },
  accessOverview: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accessHeading: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accessRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  lastAccessRow: {
    borderBottomWidth: 0,
  },
  accessAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  adminAvatar: {
    backgroundColor: "#dbeafe",
  },
  memberAvatar: {
    backgroundColor: "#dcfce7",
  },
  pendingAvatar: {
    backgroundColor: "#fef3c7",
  },
  accessAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a73e8",
  },
  accessInfo: {
    flex: 1,
  },
  accessName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },
  accessPhone: {
    fontSize: 12,
    color: "#888",
    marginTop: 1,
  },
  accessBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  adminBadge: {
    backgroundColor: "#dbeafe",
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1a73e8",
  },
  memberBadge: {
    backgroundColor: "#dcfce7",
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#16a34a",
  },
  deleteInvitationButton: {
    padding: 8,
  },
  deleteInvitationConfirmButton: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  deleteInvitationConfirmText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  editModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  currentPhone: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 12,
    marginBottom: 6,
  },
  phoneInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: "#111",
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111",
  },
  validationText: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "500",
  },
  saveButton: {
    backgroundColor: "#1a73e8",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: "#ccc",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    color: "#999",
    marginTop: 20,
  },
});

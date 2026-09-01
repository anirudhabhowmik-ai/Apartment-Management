import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    Alert,
    Image,
    Modal,
    Platform,
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
      "Are you sure you want to delete your account?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Account", style: "destructive" },
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

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
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
    // *** CHANGED: Set to empty string instead of pre-filling ***
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
      id: "add_member",
      title: "Manage Member Visibility",
      icon: "person-add-outline",
      color: "#4CAF50",
      onPress: () =>
        router.push({
          pathname: "/(modals)/grant-access",
          params: {
            accountId: selectedAccount?.id || "",
            role: "member_visibility",
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
  ];

  const settingsSections = [
    { title: "Account", itemIds: ["switch_account", "delete_account"] },
    { title: "Access & Roles", itemIds: ["add_admin", "add_member"] },
    { title: "Preferences", itemIds: ["notifications", "dark_mode"] },
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

          {/* Name with Edit button - positioned as a row */}
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

          {/* Phone with Edit button - positioned as a row */}
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
            <View style={styles.accessRow}>
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
              <Text style={styles.accessHeading}>Visible Members</Text>
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
                    <Text style={styles.memberBadgeText}>Visible</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {pendingInvitations.length > 0 && (
            <>
              <Text style={styles.accessHeading}>Pending Invitations</Text>
              {pendingInvitations.map((grant) => (
                <View key={grant.id} style={styles.accessRow}>
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
                Current number: {user?.phone}
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
  // Profile Header
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
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 7,
    gap: 8,
  },
  nameDisplayContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  nameEditContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  inlineNameInput: {
    borderBottomColor: "#1a73e8",
    borderBottomWidth: 1,
    color: "#111",
    fontSize: 20,
    fontWeight: "700",
    minWidth: 150,
    paddingVertical: 2,
    textAlign: "center",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  editButton: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    height: 28,
    justifyContent: "center",
    width: 28,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  saveButtonSmall: {
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  editButtonText: { color: "#1a73e8", fontSize: 13, fontWeight: "700" },
  menuSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 8,
  },
  menuSectionTitle: {
    color: "#666",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
    textTransform: "uppercase",
  },
  menuItem: {
    alignItems: "center",
    borderBottomColor: "#f5f5f5",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: { alignItems: "center", flexDirection: "row", gap: 12 },
  menuIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  menuItemTitle: { color: "#111", fontSize: 15, fontWeight: "500" },
  accessOverview: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
    paddingVertical: 8,
  },
  accessHeading: {
    color: "#666",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 16,
    marginTop: 12,
    textTransform: "uppercase",
  },
  accessRow: {
    alignItems: "center",
    borderBottomColor: "#f5f5f5",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  accessAvatar: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  adminAvatar: { backgroundColor: "#f3e8ff" },
  memberAvatar: { backgroundColor: "#dcfce7" },
  pendingAvatar: { backgroundColor: "#fef3c7" },
  accessAvatarText: { color: "#333", fontSize: 14, fontWeight: "700" },
  accessInfo: { flex: 1, marginLeft: 12 },
  accessName: { color: "#111", fontSize: 14, fontWeight: "600" },
  accessPhone: { color: "#777", fontSize: 12, marginTop: 2 },
  accessBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  adminBadge: { backgroundColor: "#f3e8ff" },
  memberBadge: { backgroundColor: "#dcfce7" },
  adminBadgeText: { color: "#7c3aed", fontSize: 11, fontWeight: "700" },
  memberBadgeText: { color: "#16803a", fontSize: 11, fontWeight: "700" },
  deleteInvitationButton: { padding: 8 },
  // Logout Button
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 7,
    borderWidth: 1,
    borderColor: "#FFCDD2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F44336",
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  editModal: {
    backgroundColor: "#fff",
    borderRadius: 8,
    maxWidth: 420,
    padding: 20,
    width: "100%",
  },
  editModalTitle: { color: "#111", fontSize: 19, fontWeight: "700" },
  currentPhone: { color: "#666", fontSize: 13, marginTop: 6 },
  fieldLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
    marginTop: 16,
  },
  fieldInput: {
    borderColor: "#d9dde3",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  phoneInputRow: {
    alignItems: "center",
    borderColor: "#d9dde3",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  phonePrefix: {
    color: "#333",
    fontSize: 15,
    marginRight: 8,
    fontWeight: "500",
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  validationText: { color: "#dc2626", fontSize: 12, marginTop: 5 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 22,
  },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelButtonText: { color: "#555", fontSize: 14, fontWeight: "600" },
  saveButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 7,
    marginLeft: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  saveButtonDisabled: { backgroundColor: "#a8c8f2" },
  saveButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  deleteInvitationConfirmButton: {
    backgroundColor: "#dc2626",
    borderRadius: 7,
    marginLeft: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  deleteInvitationConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});

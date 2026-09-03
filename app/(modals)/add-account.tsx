import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";
import { AccountType } from "../../types";

type SetupOptionId =
  | "apartment"
  | "home"
  | "join_owner"
  | "join_staff_sweeper"
  | "join_staff_security";

interface SetupOption {
  id: SetupOptionId;
  title: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  category: "create" | "join";
}

// Staff role definitions with specific access levels
interface StaffRole {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accessLevel: "full" | "limited" | "readonly";
  permissions: string[];
}

const STAFF_ROLES: StaffRole[] = [
  {
    id: "security",
    label: "Security Guard",
    description: "Manage gate entry, visitor logs, and security patrols",
    icon: "shield-checkmark",
    accessLevel: "limited",
    permissions: ["gate_entry", "visitor_management", "patrol_logs"],
  },
  {
    id: "sweeper",
    label: "Sweeper / Cleaner",
    description: "Track cleaning tasks, attendance, and salary",
    icon: "brush",
    accessLevel: "limited",
    permissions: ["cleaning_tasks", "attendance", "salary_view"],
  },
  {
    id: "maintenance",
    label: "Maintenance Staff",
    description: "Handle repairs, maintenance requests, and inventory",
    icon: "construct",
    accessLevel: "limited",
    permissions: ["repairs", "maintenance_requests", "inventory"],
  },
  {
    id: "gardener",
    label: "Gardener",
    description: "Manage garden maintenance, landscaping, and watering",
    icon: "leaf",
    accessLevel: "limited",
    permissions: ["gardening", "landscaping", "watering_schedule"],
  },
  {
    id: "driver",
    label: "Driver",
    description: "Manage vehicle schedules, trips, and maintenance",
    icon: "car",
    accessLevel: "limited",
    permissions: ["vehicle_schedule", "trip_logs", "vehicle_maintenance"],
  },
];

const SETUP_OPTIONS: SetupOption[] = [
  {
    id: "apartment",
    title: "Apartment Society",
    badge: "Secretary / Admin",
    badgeColor: "#1a73e8",
    badgeBg: "#e8f0fe",
    description:
      "Manage flats, flat owners, monthly maintenance dues, staff salaries & accounts",
    icon: "business",
    iconColor: "#1a73e8",
    iconBg: "#e8f0fe",
    category: "create",
  },
  {
    id: "home",
    title: "Personal Home",
    badge: "Owner / Admin",
    badgeColor: "#059669",
    badgeBg: "#ecfdf5",
    description:
      "Track your personal rent, electricity bills, maid expenses and family budget",
    icon: "home",
    iconColor: "#059669",
    iconBg: "#ecfdf5",
    category: "create",
  },
  {
    id: "join_owner",
    title: "Join as Apartment Owner",
    badge: "Join via Invitation",
    badgeColor: "#7c3aed",
    badgeBg: "#f3e8ff",
    description:
      "Connect with your society to check monthly dues, view receipts & building notices",
    icon: "key",
    iconColor: "#7c3aed",
    iconBg: "#f3e8ff",
    category: "join",
  },
];

// Separate staff join options with specific roles
const STAFF_JOIN_OPTIONS: SetupOption[] = [
  {
    id: "join_staff_sweeper",
    title: "Join as Sweeper",
    badge: "Sweeper / Cleaner",
    badgeColor: "#059669",
    badgeBg: "#ecfdf5",
    description:
      "Track your daily cleaning tasks, attendance, and monthly salary payouts",
    icon: "brush",
    iconColor: "#059669",
    iconBg: "#ecfdf5",
    category: "join",
  },
  {
    id: "join_staff_security",
    title: "Join as Security Guard",
    badge: "Security Guard",
    badgeColor: "#d97706",
    badgeBg: "#fef3c7",
    description:
      "Manage gate entry, visitor logs, security patrols, and daily attendance",
    icon: "shield-checkmark",
    iconColor: "#d97706",
    iconBg: "#fef3c7",
    category: "join",
  },
];

export default function AddAccountScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const grantAccountRole = useAuthStore((s) => s.grantAccountRole);
  const { createAccount, accounts } = useAccounts();
  const selectAccount = useAccountStore((s) => s.selectAccount);
  const getPendingGrantsByPhone = useAccessStore(
    (s) => s.getPendingGrantsByPhone,
  );
  const acceptGrant = useAccessStore((s) => s.acceptGrant);
  const removeGrant = useAccessStore((s) => s.removeGrant);

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectingGrantId, setRejectingGrantId] = useState<string | null>(null);

  const pendingInvitations = useMemo(() => {
    return user?.phone ? getPendingGrantsByPhone(user.phone) : [];
  }, [user?.phone, getPendingGrantsByPhone]);

  const getInvitationApartmentName = (invitation: {
    accountId: string;
    accountName?: string;
  }) => {
    const account = accounts.find((a) => a.id === invitation.accountId);
    return account?.name || invitation.accountName || "Apartment Society";
  };

  const ownerInvite = useMemo(() => {
    return (
      pendingInvitations.find((g) => g.role === "member_visibility") ||
      pendingInvitations[0]
    );
  }, [pendingInvitations]);

  const staffInvite = useMemo(() => {
    return (
      pendingInvitations.find(
        (g) => g.role !== "admin" && g.role !== "member_visibility",
      ) || pendingInvitations[0]
    );
  }, [pendingInvitations]);

  const handleSelectOption = async (option: SetupOption) => {
    setError("");

    if (option.id === "apartment" || option.id === "home") {
      setSelectedType(option.id);
      setStep(2);
    } else if (option.id === "join_owner") {
      await handleDirectJoin("owner");
    } else if (option.id === "join_staff_sweeper") {
      await handleDirectJoin("staff", "sweeper");
    } else if (option.id === "join_staff_security") {
      await handleDirectJoin("staff", "security");
    }
  };

  const handleDirectJoin = async (
    roleType: "owner" | "staff",
    staffRoleId?: string,
  ) => {
    setLoading(true);
    setError("");

    try {
      const isFirstAccount = accounts.length === 0;

      const matchingGrant =
        pendingInvitations.find((g) =>
          roleType === "owner" ? g.role === "member_visibility" : true,
        ) || pendingInvitations[0];

      if (matchingGrant) {
        acceptGrant(matchingGrant.id);
        grantAccountRole(matchingGrant.accountId, matchingGrant.role);
        selectAccount(matchingGrant.accountId);
      } else {
        let defaultName =
          roleType === "owner" ? "My Flat (Apartment)" : "Staff Workspace";

        if (roleType === "staff" && staffRoleId) {
          const role = STAFF_ROLES.find((r) => r.id === staffRoleId);
          if (role) {
            defaultName = `${role.label} - Workspace`;
          }
        }

        const newAccount = await createAccount("apartment", defaultName);
        if (newAccount) {
          const role = roleType === "owner" ? "member_visibility" : "admin";
          grantAccountRole(newAccount.id, role);

          if (roleType === "staff" && staffRoleId) {
            console.log(`Staff role selected: ${staffRoleId}`);
          }
        }
      }

      if (isFirstAccount) {
        router.replace("/(tabs)");
      } else {
        router.back();
      }
    } catch (err) {
      console.error("Direct join error:", err);
      setError("Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Permission to access photos is required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    setError("");

    if (!selectedType) {
      setError("Please choose Apartment or Home");
      return;
    }
    if (!name.trim()) {
      setError(
        `Please enter a name for your ${selectedType === "apartment" ? "apartment" : "home"}`,
      );
      return;
    }

    setLoading(true);
    try {
      const isFirstAccount = accounts.length === 0;

      const newAccount = await createAccount(
        selectedType,
        name.trim(),
        photoUri ?? undefined,
      );

      if (newAccount) {
        if (isFirstAccount) {
          router.replace("/(tabs)");
        } else {
          router.back();
        }
      } else {
        setError("Failed to create account. Please try again.");
      }
    } catch (e) {
      setError("Failed to create account. Please try again.");
      console.error("Account creation error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = (
    grantId: string,
    accountId: string,
    role: any,
  ) => {
    acceptGrant(grantId);
    grantAccountRole(accountId, role);
    selectAccount(accountId);
    if (accounts.length === 0) {
      router.replace("/(tabs)");
    } else {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#1a73e8" />
              <Text style={styles.loadingText}>Setting up your account...</Text>
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <View style={styles.header}>
              <Text style={styles.stepBadge}>STEP 1 OF 2</Text>
              <Text style={styles.title}>Choose Setup Type</Text>
              <Text style={styles.subtitle}>
                Select an option that best fits your role to get started
              </Text>
            </View>

            {pendingInvitations.length > 0 && (
              <View style={styles.inviteBanner}>
                <View style={styles.inviteBannerHeader}>
                  <View style={styles.inviteIconCircle}>
                    <Ionicons name="mail-unread" size={20} color="#1a73e8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inviteBannerTitle}>
                      {pendingInvitations.length} Pending Invitation
                      {pendingInvitations.length > 1 ? "s" : ""}
                    </Text>
                    <Text style={styles.inviteBannerSubtitle}>
                      You have received invitation(s) to join
                    </Text>
                  </View>
                </View>

                {pendingInvitations.map((invitation) => {
                  const aptName = getInvitationApartmentName(invitation);
                  const isOwnerRole = invitation.role === "member_visibility";
                  const isAdminRole = invitation.role === "admin";
                  const inviterPhone = invitation.invitedByPhone || "Secretary";

                  return (
                    <View key={invitation.id} style={styles.inviteCard}>
                      <View style={styles.inviteCardTop}>
                        <View style={styles.aptIconContainer}>
                          <Ionicons name="business" size={18} color="#1a73e8" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inviteApartmentName}>
                            {aptName}
                          </Text>
                          <View style={styles.inviteMetaRow}>
                            <View
                              style={[
                                styles.inviteRoleBadge,
                                {
                                  backgroundColor: isAdminRole
                                    ? "#f3e8ff"
                                    : isOwnerRole
                                      ? "#eff6ff"
                                      : "#fef3c7",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.inviteRoleBadgeText,
                                  {
                                    color: isAdminRole
                                      ? "#7c3aed"
                                      : isOwnerRole
                                        ? "#1a73e8"
                                        : "#d97706",
                                  },
                                ]}
                              >
                                {`Invited in ${aptName}`}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.inviterDetailsRow}>
                            <Ionicons
                              name="call-outline"
                              size={13}
                              color="#1a73e8"
                            />
                            <Text style={styles.inviterPhoneText}>
                              Invited by:{" "}
                              <Text style={styles.inviterPhoneBold}>
                                {inviterPhone}
                              </Text>
                            </Text>
                            {invitation.name ? (
                              <Text style={styles.invitePersonText}>
                                • For: {invitation.name}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={() =>
                          handleAcceptInvite(
                            invitation.id,
                            invitation.accountId,
                            invitation.role,
                          )
                        }
                        activeOpacity={0.85}
                      >
                        <Text style={styles.acceptButtonText}>
                          Accept & Join {aptName}
                        </Text>
                        <Ionicons name="arrow-forward" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="add-circle" size={16} color="#1a73e8" />
                <Text style={styles.sectionTitle}>CREATE A PROPERTY</Text>
              </View>

              <View style={styles.optionsList}>
                {SETUP_OPTIONS.filter((o) => o.category === "create").map(
                  (option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.card}
                      onPress={() => handleSelectOption(option)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardHeader}>
                        <View
                          style={[
                            styles.cardIconContainer,
                            { backgroundColor: option.iconBg },
                          ]}
                        >
                          <Ionicons
                            name={option.icon}
                            size={24}
                            color={option.iconColor}
                          />
                        </View>
                        <View style={styles.cardHeaderInfo}>
                          <Text style={styles.cardTitle}>{option.title}</Text>
                          <View style={styles.cardBadgeRow}>
                            <View
                              style={[
                                styles.cardBadge,
                                { backgroundColor: option.badgeBg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.cardBadgeText,
                                  { color: option.badgeColor },
                                ]}
                              >
                                {option.badge}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.arrowCircle}>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color="#1a73e8"
                          />
                        </View>
                      </View>

                      <Text style={styles.cardDescription}>
                        {option.description}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="mail-open" size={16} color="#7c3aed" />
                <Text style={[styles.sectionTitle, { color: "#7c3aed" }]}>
                  INVITATION TO AN EXISTING PROPERTY
                </Text>
              </View>

              <View style={styles.optionsList}>
                {/* Owner Join Card */}
                <View style={[styles.card, styles.cardJoin]}>
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.cardIconContainer,
                        { backgroundColor: "#f3e8ff" },
                      ]}
                    >
                      <Ionicons name="key" size={24} color="#7c3aed" />
                    </View>
                    <View style={styles.cardHeaderInfo}>
                      <Text style={styles.cardTitle}>
                        Join as Apartment Owner
                      </Text>
                      <View style={styles.cardBadgeRow}>
                        <View
                          style={[
                            styles.cardBadge,
                            { backgroundColor: "#eff6ff" },
                          ]}
                        >
                          <Text
                            style={[styles.cardBadgeText, { color: "#1a73e8" }]}
                          >
                            {ownerInvite
                              ? `Invited in ${getInvitationApartmentName(ownerInvite)}`
                              : "Join via Invitation"}
                          </Text>
                        </View>
                        {ownerInvite && (
                          <View style={styles.inviterPill}>
                            <Ionicons name="call" size={10.5} color="#1a73e8" />
                            <Text style={styles.inviterPillText}>
                              Invited by:{" "}
                              <Text style={styles.inviterPillBold}>
                                {ownerInvite.invitedByPhone || "9666665656"}
                              </Text>
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <Text style={styles.cardDescription}>
                    {ownerInvite
                      ? `Connect with ${getInvitationApartmentName(ownerInvite)} as Flat Owner to view monthly maintenance dues, payment receipts & society notices.`
                      : "Connect with your society to check monthly dues, view receipts & building notices"}
                  </Text>

                  <View style={styles.inviteActionRow}>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => {
                        setRejectingGrantId(ownerInvite?.id ?? "join_owner");
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={15}
                        color="#dc2626"
                      />
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.joinButton,
                        { backgroundColor: "#7c3aed" },
                      ]}
                      onPress={() => handleDirectJoin("owner")}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="flash" size={13} color="#ffffff" />
                      <Text style={styles.joinButtonText}>Join Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Staff Join Cards - Redesigned */}
                {STAFF_JOIN_OPTIONS.map((option) => {
                  const staffRoleId = option.id.replace("join_staff_", "");
                  const staffRole = STAFF_ROLES.find(
                    (r) => r.id === staffRoleId,
                  );

                  return (
                    <View key={option.id} style={styles.staffCard}>
                      {/* Top Section with Icon and Title */}
                      <View style={styles.staffCardTop}>
                        <View
                          style={[
                            styles.staffCardIcon,
                            { backgroundColor: option.iconBg },
                          ]}
                        >
                          <Ionicons
                            name={option.icon}
                            size={28}
                            color={option.iconColor}
                          />
                        </View>
                        <View style={styles.staffCardTitleSection}>
                          <Text style={styles.staffCardTitle}>
                            {option.title}
                          </Text>
                          <View style={styles.staffCardBadges}>
                            <View
                              style={[
                                styles.staffCardBadge,
                                { backgroundColor: "#eff6ff" },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.staffCardBadgeText,
                                  { color: "#1a73e8" },
                                ]}
                              >
                                {staffInvite
                                  ? `Invited in ${getInvitationApartmentName(staffInvite)}`
                                  : "Join via Invitation"}
                              </Text>
                            </View>
                            {staffInvite && (
                              <View style={styles.inviterPillSmall}>
                                <Ionicons
                                  name="call"
                                  size={10}
                                  color="#1a73e8"
                                />
                                <Text style={styles.inviterPillTextSmall}>
                                  {staffInvite.invitedByPhone || "9666665656"}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Role Badge and Permissions */}
                      <View style={styles.staffRoleInfo}>
                        <View
                          style={[
                            styles.staffRoleBadge,
                            { backgroundColor: option.badgeBg },
                          ]}
                        >
                          <Ionicons
                            name={staffRole?.icon || "person"}
                            size={14}
                            color={option.badgeColor}
                          />
                          <Text
                            style={[
                              styles.staffRoleBadgeText,
                              { color: option.badgeColor },
                            ]}
                          >
                            {option.badge}
                          </Text>
                        </View>
                        <View style={styles.permissionsRow}>
                          {staffRole?.permissions
                            .slice(0, 2)
                            .map((perm, idx) => (
                              <View key={idx} style={styles.permissionChip}>
                                <Ionicons
                                  name="checkmark-circle"
                                  size={12}
                                  color="#059669"
                                />
                                <Text style={styles.permissionChipText}>
                                  {perm.replace(/_/g, " ").toLowerCase()}
                                </Text>
                              </View>
                            ))}
                          {staffRole && staffRole.permissions.length > 2 && (
                            <View style={styles.permissionChip}>
                              <Text style={styles.permissionChipText}>
                                +{staffRole.permissions.length - 2} more
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Description */}
                      <Text style={styles.staffCardDescription}>
                        {option.description}
                      </Text>

                      {/* Action Buttons */}
                      <View style={styles.staffCardActions}>
                        <TouchableOpacity
                          style={styles.rejectButtonSmall}
                          onPress={() => {
                            setRejectingGrantId(staffInvite?.id ?? option.id);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="close-outline"
                            size={16}
                            color="#dc2626"
                          />
                          <Text style={styles.rejectButtonTextSmall}>
                            Reject
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.joinButtonSmall,
                            { backgroundColor: option.iconColor },
                          ]}
                          onPress={() => handleSelectOption(option)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.joinButtonTextSmall}>
                            Join Now
                          </Text>
                          <Ionicons
                            name="arrow-forward"
                            size={14}
                            color="#ffffff"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setError("");
                setStep(1);
              }}
            >
              <Ionicons name="arrow-back" size={18} color="#1a73e8" />
              <Text style={styles.backButtonText}>Change setup type</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.stepBadge}>STEP 2 OF 2</Text>
              <Text style={styles.title}>
                {selectedType === "apartment"
                  ? "Set up Apartment Society"
                  : "Set up Personal Home"}
              </Text>
              <Text style={styles.subtitle}>
                Add a photo and name for your property to finish setup
              </Text>
            </View>

            <View style={styles.photoSection}>
              <TouchableOpacity
                style={styles.photoCircle}
                onPress={handlePickPhoto}
                activeOpacity={0.8}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.photoImage} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons
                      name={
                        selectedType === "apartment"
                          ? "business-outline"
                          : "home-outline"
                      }
                      size={36}
                      color="#1a73e8"
                    />
                    <View style={styles.cameraIconBadge}>
                      <Ionicons name="camera" size={14} color="#fff" />
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.photoActionButtons}>
                <TouchableOpacity
                  onPress={handlePickPhoto}
                  style={styles.photoButton}
                >
                  <Text style={styles.photoButtonText}>
                    {photoUri ? "Change Photo" : "Add Photo (optional)"}
                  </Text>
                </TouchableOpacity>
                {photoUri && (
                  <TouchableOpacity
                    onPress={() => setPhotoUri(null)}
                    style={styles.removePhotoButton}
                  >
                    <Text style={styles.removePhotoText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {selectedType === "apartment"
                  ? "Apartment / Society Name"
                  : "Home Name"}
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name={
                    selectedType === "apartment"
                      ? "business-outline"
                      : "home-outline"
                  }
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={
                    selectedType === "apartment"
                      ? "e.g. Green Valley Apartments"
                      : "e.g. My Home - Rajarhat"
                  }
                  placeholderTextColor="#999"
                  value={name}
                  onChangeText={(val) => {
                    setName(val);
                    setError("");
                  }}
                  autoFocus
                />
                {name.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setName("")}
                    style={styles.clearInput}
                  >
                    <Ionicons name="close-circle" size={18} color="#aaa" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#e53935" />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submitButton,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Create Account</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={rejectingGrantId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingGrantId(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRejectingGrantId(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="close-circle" size={36} color="#dc2626" />
            </View>

            <Text style={styles.modalTitle}>Reject Invitation?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to reject this invitation? You will no
              longer be able to join this property using this invite.
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setRejectingGrantId(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={() => {
                  if (rejectingGrantId) {
                    const realGrantIds = [
                      "apartment",
                      "home",
                      "join_owner",
                      "join_staff_sweeper",
                      "join_staff_security",
                    ];
                    if (!realGrantIds.includes(rejectingGrantId)) {
                      removeGrant(rejectingGrantId);
                    }
                    setRejectingGrantId(null);
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#ffffff" />
                <Text style={styles.modalConfirmText}>Yes, Reject</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
    marginTop: 4,
  },
  stepBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1a73e8",
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13.5,
    color: "#64748b",
    lineHeight: 19,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    marginBottom: 14,
    gap: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a73e8",
  },
  inviteBanner: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: "#93c5fd",
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inviteBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  inviteIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  inviteBannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1e3a8a",
  },
  inviteBannerSubtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  inviteCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inviteCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  aptIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  inviteApartmentName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 20,
  },
  inviteMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  inviteRoleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  inviteRoleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inviterDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 5,
  },
  inviterPhoneText: {
    fontSize: 12,
    color: "#475569",
  },
  inviterPhoneBold: {
    fontWeight: "700",
    color: "#1e40af",
  },
  invitePersonText: {
    fontSize: 11.5,
    color: "#64748b",
  },
  acceptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#1a73e8",
  },
  optionsList: {
    gap: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardJoin: {
    borderColor: "#e2e8f0",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardHeaderInfo: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 20,
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  cardBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  cardBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  inviterPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 4,
  },
  inviterPillText: {
    fontSize: 10.5,
    color: "#475569",
  },
  inviterPillBold: {
    fontWeight: "700",
    color: "#1e40af",
  },
  cardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginTop: 4,
  },
  inviteActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 8,
  },
  rejectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  rejectButtonText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#dc2626",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  joinButtonText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#ffffff",
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  // Staff Card Styles - Redesigned
  staffCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 10,
  },
  staffCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  staffCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  staffCardTitleSection: {
    flex: 1,
  },
  staffCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  staffCardBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  staffCardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  staffCardBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  inviterPillSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inviterPillTextSmall: {
    fontSize: 9,
    color: "#475569",
    fontWeight: "500",
  },
  staffRoleInfo: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  staffRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  staffRoleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  permissionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  permissionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
  },
  permissionChipText: {
    fontSize: 9,
    color: "#059669",
    fontWeight: "500",
  },
  staffCardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginBottom: 12,
  },
  staffCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rejectButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  rejectButtonTextSmall: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  joinButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  joinButtonTextSmall: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },

  // Step 2 Styles
  photoSection: {
    alignItems: "center",
    marginVertical: 14,
  },
  photoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#eff6ff",
    borderWidth: 2,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  photoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: -4,
    right: -8,
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  photoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  photoActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 12,
  },
  photoButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  photoButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a73e8",
  },
  removePhotoButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removePhotoText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ef4444",
  },
  inputGroup: {
    marginBottom: 18,
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 7,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    height: "100%",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  clearInput: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "500",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    height: 50,
    marginTop: 6,
    gap: 8,
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15.5,
    fontWeight: "700",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },

  // Reject Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#dc2626",
    gap: 6,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});

import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
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

type TabId = "create" | "invitations";

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

// Dummy invitations for testing
const DUMMY_INVITATIONS: any[] = [
  {
    id: "dummy_invite_1",
    accountId: "dummy_account_1",
    accountName: "Green Valley Apartments",
    invitedByPhone: "+91 9876543210",
    invitedByName: "Ramesh Kumar",
    role: "member_visibility",
    name: "John Doe",
    phone: "+91 9876543210",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  },
  {
    id: "dummy_invite_2",
    accountId: "dummy_account_2",
    accountName: "Sunset Heights",
    invitedByPhone: "+91 9876543211",
    invitedByName: "Priya Sharma",
    role: "sweeper",
    name: "Rajesh",
    phone: "+91 9876543211",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  },
  {
    id: "dummy_invite_3",
    accountId: "dummy_account_3",
    accountName: "Lake View Society",
    invitedByPhone: "+91 9876543212",
    invitedByName: "Amit Singh",
    role: "security",
    name: "Vikram",
    phone: "+91 9876543212",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
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
  const [activeTab, setActiveTab] = useState<TabId>("create");
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectingGrantId, setRejectingGrantId] = useState<string | null>(null);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showDummyInvites, setShowDummyInvites] = useState(true);

  const pendingInvitations = useMemo(() => {
    // Get real invitations from the store
    const realInvitations = user?.phone
      ? getPendingGrantsByPhone(user.phone)
      : [];

    // If no real invitations and dummy invites are enabled, return dummy invites
    if (realInvitations.length === 0 && showDummyInvites) {
      return DUMMY_INVITATIONS;
    }

    return realInvitations;
  }, [user?.phone, getPendingGrantsByPhone, showDummyInvites]);

  const getInvitationApartmentName = (invitation: any) => {
    // Check if it's a dummy invitation
    if (invitation.id?.startsWith("dummy_invite_")) {
      return invitation.accountName || "Apartment Society";
    }
    const account = accounts.find((a) => a.id === invitation.accountId);
    return account?.name || invitation.accountName || "Apartment Society";
  };

  const ownerInvite = useMemo(() => {
    return (
      pendingInvitations.find((g: any) => g.role === "member_visibility") ||
      pendingInvitations[0]
    );
  }, [pendingInvitations]);

  const staffInvite = useMemo(() => {
    return (
      pendingInvitations.find(
        (g: any) => g.role !== "admin" && g.role !== "member_visibility",
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

      // Check for matching grant in pending invitations
      const matchingGrant = pendingInvitations.find((g: any) => {
        if (roleType === "owner") {
          return g.role === "member_visibility";
        }
        // For staff, check if role matches
        return g.role !== "admin" && g.role !== "member_visibility";
      });

      if (matchingGrant) {
        // If it's a dummy invitation, simulate acceptance
        if (matchingGrant.id?.startsWith("dummy_invite_")) {
          // Create a new account with the apartment name
          const aptName = getInvitationApartmentName(matchingGrant);
          const defaultName =
            roleType === "owner" ? `${aptName} - Owner` : `${aptName} - Staff`;

          const newAccount = await createAccount("apartment", defaultName);
          if (newAccount) {
            const role = roleType === "owner" ? "member_visibility" : "admin";
            grantAccountRole(newAccount.id, role);
            selectAccount(newAccount.id);

            // Remove dummy invites after accepting
            setShowDummyInvites(false);
          }
        } else {
          // For real invitations, cast role to the correct type
          const role =
            matchingGrant.role === "admin" ? "admin" : "member_visibility";
          acceptGrant(matchingGrant.id);
          grantAccountRole(matchingGrant.accountId, role);
          selectAccount(matchingGrant.accountId);
        }
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

  // Show photo selection options
  const showPhotoSelectionOptions = () => {
    setShowPhotoOptions(true);
  };

  // Handle taking photo with camera - Updated with ["images"]
  const takePhoto = async () => {
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Permission to access camera is required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      const croppedImage = await cropImage(imageUri);
      setPhotoUri(croppedImage);
    }
  };

  // Handle choosing photo from gallery - Updated with ["images"]
  const choosePhoto = async () => {
    setShowPhotoOptions(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Permission to access photos is required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      const croppedImage = await cropImage(imageUri);
      setPhotoUri(croppedImage);
    }
  };

  // Crop and resize image
  const cropImage = async (uri: string): Promise<string> => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            resize: {
              width: 500,
              height: 500,
            },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      return result.uri;
    } catch (error) {
      console.error("Error cropping image:", error);
      // If cropping fails, return the original image
      return uri;
    }
  };

  const handlePickPhoto = async () => {
    showPhotoSelectionOptions();
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
    // Check if it's a dummy invitation
    if (grantId?.startsWith("dummy_invite_")) {
      // Find the dummy invitation
      const dummyInvite = DUMMY_INVITATIONS.find((inv) => inv.id === grantId);
      if (dummyInvite) {
        // Create a new account with the apartment name
        const aptName = dummyInvite.accountName || "Apartment Society";
        const isOwner = role === "member_visibility";
        const defaultName = isOwner
          ? `${aptName} - Owner`
          : `${aptName} - Staff`;

        createAccount("apartment", defaultName).then((newAccount) => {
          if (newAccount) {
            const grantRole = role === "admin" ? "admin" : "member_visibility";
            grantAccountRole(newAccount.id, grantRole);
            selectAccount(newAccount.id);
            // Remove dummy invites after accepting
            setShowDummyInvites(false);
            if (accounts.length === 0) {
              router.replace("/(tabs)");
            } else {
              router.back();
            }
          }
        });
        return;
      }
    }

    // Real invitation - use the store
    const grantRole = role === "admin" ? "admin" : "member_visibility";
    acceptGrant(grantId);
    grantAccountRole(accountId, grantRole);
    selectAccount(accountId);
    if (accounts.length === 0) {
      router.replace("/(tabs)");
    } else {
      router.back();
    }
  };

  // Get unique apartment names from invitations
  const getUniqueApartments = () => {
    const apartmentMap = new Map();
    pendingInvitations.forEach((invitation: any) => {
      const aptName = getInvitationApartmentName(invitation);
      if (!apartmentMap.has(aptName)) {
        apartmentMap.set(aptName, {
          name: aptName,
          invitations: [],
        });
      }
      apartmentMap.get(aptName).invitations.push(invitation);
    });
    return Array.from(apartmentMap.values());
  };

  const uniqueApartments = getUniqueApartments();

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
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: "50%" }]} />
            </View>

            <View style={styles.header}>
              <Text style={styles.stepBadge}>STEP 1 OF 2</Text>
              <Text style={styles.title}>Choose Setup Type</Text>
              <Text style={styles.subtitle}>
                Select an option that best fits your role to get started
              </Text>
            </View>

            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "create" && styles.tabButtonActiveBlue,
                ]}
                onPress={() => setActiveTab("create")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add-circle"
                  size={16}
                  color={activeTab === "create" ? "#1a73e8" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === "create" && styles.tabButtonTextActiveBlue,
                  ]}
                >
                  Create New
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "invitations" && styles.tabButtonActivePurple,
                ]}
                onPress={() => setActiveTab("invitations")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mail-open"
                  size={16}
                  color={activeTab === "invitations" ? "#7c3aed" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === "invitations" &&
                      styles.tabButtonTextActivePurple,
                  ]}
                >
                  Invitations
                  {pendingInvitations.length > 0 && (
                    <View style={styles.invitationBadge}>
                      <Text style={styles.invitationBadgeText}>
                        {pendingInvitations.length}
                      </Text>
                    </View>
                  )}
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === "create" && (
              <View style={styles.section}>
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
            )}

            {activeTab === "invitations" && (
              <View style={styles.section}>
                {pendingInvitations.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyStateIcon}>
                      <Ionicons
                        name="mail-open-outline"
                        size={48}
                        color="#cbd5e1"
                      />
                    </View>
                    <Text style={styles.emptyStateTitle}>No Invitations</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      You haven't received any invitations yet. Ask your society
                      admin to send you an invitation.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.invitationsContainer}>
                    {uniqueApartments.map((apartment: any) => (
                      <View key={apartment.name} style={styles.apartmentGroup}>
                        <View style={styles.apartmentHeader}>
                          <View style={styles.apartmentIconContainer}>
                            <Ionicons
                              name="business"
                              size={20}
                              color="#1a73e8"
                            />
                          </View>
                          <Text style={styles.apartmentName}>
                            {apartment.name}
                          </Text>
                          <View style={styles.invitationCountBadge}>
                            <Text style={styles.invitationCountText}>
                              {apartment.invitations.length}
                            </Text>
                          </View>
                        </View>

                        {apartment.invitations.map((invitation: any) => {
                          const isOwnerRole =
                            invitation.role === "member_visibility";
                          const isAdminRole = invitation.role === "admin";
                          const inviterPhone =
                            invitation.invitedByPhone || "Secretary";

                          // Determine which option card to show based on role
                          let optionCard: SetupOption = {
                            id: "join_owner",
                            title: "Join as Apartment Owner",
                            badge: "Owner",
                            badgeColor: "#7c3aed",
                            badgeBg: "#f3e8ff",
                            description:
                              "Connect with this society to view monthly maintenance dues, payment receipts & society notices.",
                            icon: "key",
                            iconColor: "#7c3aed",
                            iconBg: "#f3e8ff",
                            category: "join",
                          };

                          if (isAdminRole || isOwnerRole) {
                            optionCard = {
                              id: "join_owner",
                              title: "Join as Apartment Owner",
                              badge: "Owner",
                              badgeColor: "#7c3aed",
                              badgeBg: "#f3e8ff",
                              description:
                                "Connect with this society to view monthly maintenance dues, payment receipts & society notices.",
                              icon: "key",
                              iconColor: "#7c3aed",
                              iconBg: "#f3e8ff",
                              category: "join",
                            };
                          } else {
                            // Staff role - find matching option
                            const staffOption = STAFF_JOIN_OPTIONS.find((opt) =>
                              invitation.role
                                ?.toLowerCase()
                                .includes(opt.id.replace("join_staff_", "")),
                            );
                            if (staffOption) {
                              optionCard = staffOption;
                            } else {
                              // Default fallback
                              optionCard = {
                                id: "join_staff_sweeper",
                                title: "Join as Staff",
                                badge: "Staff",
                                badgeColor: "#d97706",
                                badgeBg: "#fef3c7",
                                description:
                                  "Track your daily tasks, attendance, and monthly salary payouts",
                                icon: "person",
                                iconColor: "#d97706",
                                iconBg: "#fef3c7",
                                category: "join",
                              };
                            }
                          }

                          return (
                            <View
                              key={invitation.id}
                              style={styles.invitationCard}
                            >
                              <View style={styles.invitationCardHeader}>
                                <View
                                  style={[
                                    styles.invitationCardIcon,
                                    {
                                      backgroundColor: optionCard.iconBg,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name={optionCard.icon}
                                    size={22}
                                    color={optionCard.iconColor}
                                  />
                                </View>
                                <View style={styles.invitationCardInfo}>
                                  <Text style={styles.invitationCardTitle}>
                                    {optionCard.title}
                                  </Text>
                                  <View style={styles.invitationBadgeRow}>
                                    <View
                                      style={[
                                        styles.invitationRoleBadge,
                                        {
                                          backgroundColor: optionCard.badgeBg,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.invitationRoleBadgeText,
                                          {
                                            color: optionCard.badgeColor,
                                          },
                                        ]}
                                      >
                                        {optionCard.badge}
                                      </Text>
                                    </View>
                                    <View style={styles.inviterPillSmall}>
                                      <Ionicons
                                        name="call"
                                        size={10}
                                        color="#1a73e8"
                                      />
                                      <Text style={styles.inviterPillTextSmall}>
                                        Invited by: {inviterPhone}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>

                              <Text style={styles.invitationCardDescription}>
                                {optionCard.description}
                              </Text>

                              <View style={styles.invitationActions}>
                                <TouchableOpacity
                                  style={styles.invitationRejectButton}
                                  onPress={() =>
                                    setRejectingGrantId(invitation.id)
                                  }
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name="close-outline"
                                    size={16}
                                    color="#dc2626"
                                  />
                                  <Text style={styles.invitationRejectText}>
                                    Reject
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={[
                                    styles.invitationAcceptButton,
                                    {
                                      backgroundColor: optionCard.iconColor,
                                    },
                                  ]}
                                  onPress={() =>
                                    handleAcceptInvite(
                                      invitation.id,
                                      invitation.accountId,
                                      invitation.role,
                                    )
                                  }
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.invitationAcceptText}>
                                    Accept Invitation
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
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: "100%" }]} />
            </View>

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

            <View style={styles.formCard}>
              <View style={styles.photoSection}>
                <TouchableOpacity
                  style={styles.photoCircle}
                  onPress={handlePickPhoto}
                  activeOpacity={0.8}
                >
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.photoImage}
                    />
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
          </View>
        )}
      </ScrollView>

      {/* Photo Options Modal */}
      <Modal
        visible={showPhotoOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoOptions(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowPhotoOptions(false)}
        >
          <Pressable style={styles.photoOptionsModal} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.photoOptionsTitle}>Upload Photo</Text>
            <Text style={styles.photoOptionsSubtitle}>
              Choose how you want to add a photo
            </Text>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={takePhoto}
              activeOpacity={0.7}
            >
              <View style={styles.photoOptionIcon}>
                <Ionicons name="camera" size={24} color="#1a73e8" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Take Photo</Text>
                <Text style={styles.photoOptionDescription}>
                  Capture a photo using your camera
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOptionButton}
              onPress={choosePhoto}
              activeOpacity={0.7}
            >
              <View
                style={[styles.photoOptionIcon, { backgroundColor: "#ecfdf5" }]}
              >
                <Ionicons name="images" size={24} color="#059669" />
              </View>
              <View style={styles.photoOptionTextContainer}>
                <Text style={styles.photoOptionTitle}>Choose from Gallery</Text>
                <Text style={styles.photoOptionDescription}>
                  Select a photo from your device
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOptionsCancel}
              onPress={() => setShowPhotoOptions(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.photoOptionsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reject Modal - Centered */}
      <Modal
        visible={rejectingGrantId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingGrantId(null)}
      >
        <Pressable
          style={styles.modalBackdropCenter}
          onPress={() => setRejectingGrantId(null)}
        >
          <Pressable style={styles.modalCardCenter} onPress={() => {}}>
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
                    // Also remove dummy invitations
                    if (rejectingGrantId.startsWith("dummy_invite_")) {
                      setShowDummyInvites(false);
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
  progressTrack: {
    height: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 2,
    marginBottom: 18,
    marginTop: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1a73e8",
    borderRadius: 2,
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
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: "#eef1f6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  tabButtonActiveBlue: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonActivePurple: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#94a3b8",
  },
  tabButtonTextActiveBlue: {
    color: "#1a73e8",
  },
  tabButtonTextActivePurple: {
    color: "#7c3aed",
  },
  invitationBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  invitationBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  section: {
    marginBottom: 20,
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
  cardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginTop: 4,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  // Invitations Styles
  invitationsContainer: {
    gap: 16,
  },
  apartmentGroup: {
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
  },
  apartmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  apartmentIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  apartmentName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
  },
  invitationCountBadge: {
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  invitationCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  invitationCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  invitationCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  invitationCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  invitationCardInfo: {
    flex: 1,
  },
  invitationCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  invitationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  invitationRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  invitationRoleBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  inviterPillSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inviterPillTextSmall: {
    fontSize: 9,
    color: "#475569",
    fontWeight: "500",
  },
  invitationCardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 17,
    marginBottom: 12,
  },
  invitationActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  invitationRejectButton: {
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
  invitationRejectText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  invitationAcceptButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  invitationAcceptText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },

  // Empty State
  emptyStateContainer: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },

  // Step 2 Styles
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
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
    ...StyleSheet.absoluteFill,
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

  // Photo Options Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 16,
  },
  photoOptionsModal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 480,
  },
  photoOptionsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
    textAlign: "center",
  },
  photoOptionsSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20,
  },
  photoOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  photoOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  photoOptionTextContainer: {
    flex: 1,
  },
  photoOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },
  photoOptionDescription: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  photoOptionsCancel: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
  },
  photoOptionsCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },

  // Reject Modal - Centered
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCardCenter: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 400,
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
    borderRadius: 12,
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
    borderRadius: 12,
    backgroundColor: "#dc2626",
    gap: 6,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});

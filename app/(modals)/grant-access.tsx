import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useGroups } from "../../hooks/useGroups";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import { useMemberStore } from "../../store/memberStore";
import { useAuthStore } from "../../store/useAuthStore";
import { ACCESS_ROLE_LABEL, AccountAccessRole } from "../../types/access";

type RecipientSource = "new" | "existing";
type MemberType = "owner" | "staff";

export default function GrantAccessScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const { accountId, role, memberType } = useLocalSearchParams<{
    accountId: string;
    role: AccountAccessRole;
    memberType?: MemberType;
  }>();
  const accounts = useAccountStore((state) => state.accounts);
  const account = accounts.find((a) => a.id === accountId);
  const { groups } = useGroups(accountId);
  const members = useMemberStore((state) => state.members);
  const addGrant = useAccessStore((state) => state.addGrant);
  const [source, setSource] = useState<RecipientSource>("new");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const eligibleMembers = useMemo(() => {
    const eligibleGroupIds = groups
      .filter((group) => group.type === "apartment" || group.type === "staff")
      .map((group) => group.id);
    return members.filter((member) =>
      eligibleGroupIds.includes(member.groupId),
    );
  }, [groups, members]);
  const apartmentGroupIds = groups
    .filter((group) => group.type === "apartment")
    .map((group) => group.id);
  const staffGroupIds = groups
    .filter((group) => group.type === "staff")
    .map((group) => group.id);
  const apartmentMembers = eligibleMembers.filter((member) =>
    apartmentGroupIds.includes(member.groupId),
  );
  const staffMembers = eligibleMembers.filter((member) =>
    staffGroupIds.includes(member.groupId),
  );

  // Search-filtered lists used only in the dedicated "visibility" flow
  const searchLower = search.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!searchLower) return apartmentMembers;
    return apartmentMembers.filter((member) => {
      const apt = ((member as any).apartmentNumber ?? "")
        .toString()
        .toLowerCase();
      const wing = ((member as any).wing ?? "").toString().toLowerCase();
      return (
        member.name.toLowerCase().includes(searchLower) ||
        member.phone.toLowerCase().includes(searchLower) ||
        apt.includes(searchLower) ||
        wing.includes(searchLower)
      );
    });
  }, [apartmentMembers, searchLower]);

  const filteredStaff = useMemo(() => {
    if (!searchLower) return staffMembers;
    return staffMembers.filter((member) => {
      const role = ((member as any).role ?? "").toString().toLowerCase();
      return (
        member.name.toLowerCase().includes(searchLower) ||
        member.phone.toLowerCase().includes(searchLower) ||
        role.includes(searchLower)
      );
    });
  }, [staffMembers, searchLower]);

  const isVisibilityFlow = memberType === "owner" || memberType === "staff";

  // Updated visibility titles to be more user-friendly
  const visibilityTitle =
    memberType === "owner"
      ? "Invite Member"
      : memberType === "staff"
        ? "Invite Staff"
        : "";

  // Updated button text
  const getButtonText = () => {
    if (isVisibilityFlow) {
      return memberType === "owner" ? "Send Invite" : "Send Invite";
    }
    return `Grant ${title} Access`;
  };

  // Contact picker function
  const pickContact = async () => {
    // Check if running on web
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Contact picker is only available on mobile devices. Please enter the phone number manually.",
        [{ text: "OK" }],
      );
      return;
    }

    try {
      // Check if Contacts module is available
      if (!Contacts) {
        Alert.alert(
          "Error",
          "Contacts module is not available. Please try again.",
          [{ text: "OK" }],
        );
        return;
      }

      // Request permission to access contacts
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your contacts to help you quickly add phone numbers.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                // For iOS, you can open settings
                if (Platform.OS === "ios") {
                  Linking.openURL("app-settings:");
                }
              },
            },
          ],
        );
        setError("Permission to access contacts is required");
        return;
      }

      // Present the native contact picker
      const contact = await Contacts.presentContactPickerAsync();

      if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
        // Get the first phone number
        let phoneNumber = contact.phoneNumbers[0].number || "";

        // Clean the phone number: remove spaces, special characters, and country codes
        phoneNumber = phoneNumber
          .replace(/[^0-9]/g, "") // Remove all non-digits
          .replace(/^91/, "") // Remove country code if present
          .replace(/^0/, ""); // Remove leading zero if present

        // Ensure it's 10 digits (or less if shorter)
        if (phoneNumber.length > 10) {
          phoneNumber = phoneNumber.slice(-10); // Take last 10 digits
        }

        setPhone(phoneNumber);
        setError(""); // Clear any previous errors

        // If name is empty, try to use contact name
        if (!name.trim() && contact.name) {
          setName(contact.name);
        }
      } else {
        setError("Selected contact doesn't have a phone number");
      }
    } catch (error: any) {
      console.error("Error picking contact:", error);

      // User might have cancelled the picker
      if (error.message && error.message.includes("cancelled")) {
        // User cancelled, do nothing
        return;
      }

      // Check for specific error types
      if (error.message && error.message.includes("permission")) {
        setError("Permission to access contacts is required");
      } else {
        setError("Failed to pick contact. Please try again.");
      }
    }
  };

  const handleSave = () => {
    const useExisting = source === "existing" || isVisibilityFlow;
    const selectedMember = eligibleMembers.find(
      (member) => member.id === selectedMemberId,
    );
    const recipientName = useExisting
      ? (selectedMember?.name ?? "")
      : name.trim();

    const recipientPhone = useExisting
      ? (selectedMember?.phone ?? "")
      : `+91${phone.replace(/[^0-9]/g, "").slice(-10)}`;

    if (!recipientName || recipientPhone.length !== 13) {
      setError(
        useExisting
          ? isVisibilityFlow
            ? memberType === "owner"
              ? "Select a member."
              : "Select a staff member."
            : "Select a member or staff member."
          : "Enter a valid 10-digit phone number.",
      );
      return;
    }

    addGrant({
      id: `access_${Date.now()}`,
      accountId,
      accountName: account?.name || "Apartment",
      invitedByPhone: currentUser?.phone || "+91 98765 43210",
      invitedByName: currentUser?.name || "Secretary",
      role: role || "member_visibility",
      name: recipientName,
      phone: recipientPhone,
      memberId: selectedMember?.id,
      createdAt: new Date().toISOString(),
    });
    router.back();
  };

  const title = ACCESS_ROLE_LABEL[role || "member_visibility"];

  const renderMemberRow = (member: (typeof eligibleMembers)[number]) => {
    const apt = (member as any).apartmentNumber as string | undefined;
    const wing = (member as any).wing as string | undefined;
    const staffRole = (member as any).role as string | undefined;

    let meta = "";
    if (memberType === "owner") {
      const parts = [];
      if (wing) parts.push(`Wing ${wing}`);
      if (apt) parts.push(`Apt ${apt}`);
      meta = parts.join(" · ");
    } else if (memberType === "staff") {
      meta = staffRole || "Staff";
    }

    return (
      <TouchableOpacity
        key={member.id}
        style={[
          styles.memberOption,
          selectedMemberId === member.id && styles.memberOptionSelected,
        ]}
        onPress={() =>
          setSelectedMemberId((currentId) =>
            currentId === member.id ? "" : member.id,
          )
        }
      >
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>
            {member.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberPhone}>{member.phone}</Text>
          {meta ? <Text style={styles.memberMeta}>{meta}</Text> : null}
        </View>
        {selectedMemberId === member.id && (
          <Ionicons name="checkmark-circle" size={20} color="#1a73e8" />
        )}
      </TouchableOpacity>
    );
  };

  // Check if there are any members or staff available
  const hasMembersOrStaff =
    apartmentMembers.length > 0 || staffMembers.length > 0;

  // Get the intro text based on the flow
  const getIntroText = () => {
    if (isVisibilityFlow) {
      return memberType === "owner"
        ? "Invite a member to your apartment"
        : "Invite a staff member to your apartment";
    }
    return `Grant ${title} access`;
  };

  // Get the empty state text
  const getEmptyStateText = () => {
    if (isVisibilityFlow) {
      return memberType === "owner"
        ? "No members available to invite."
        : "No staff members available to invite.";
    }
    return "No members or staff are available.";
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        {isVisibilityFlow ? visibilityTitle : `Grant ${title} access`}
      </Text>

      {!isVisibilityFlow && (
        <View style={styles.sourceControl}>
          <TouchableOpacity
            style={[
              styles.sourceButton,
              source === "new" && styles.sourceButtonActive,
            ]}
            onPress={() => setSource("new")}
          >
            <Ionicons
              name="call-outline"
              size={18}
              color={source === "new" ? "#1a73e8" : "#666"}
            />
            <Text
              style={[
                styles.sourceText,
                source === "new" && styles.sourceTextActive,
              ]}
            >
              New phone number
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sourceButton,
              source === "existing" && styles.sourceButtonActive,
            ]}
            onPress={() => setSource("existing")}
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={source === "existing" ? "#1a73e8" : "#666"}
            />
            <Text
              style={[
                styles.sourceText,
                source === "existing" && styles.sourceTextActive,
              ]}
            >
              Member or staff
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isVisibilityFlow ? (
        <>
          {/* Search bar - only visible if there are members or staff in visibility flow */}
          {hasMembersOrStaff && (
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={
                  memberType === "owner"
                    ? "Search by name, phone, apartment or wing"
                    : "Search by name, phone or role"
                }
                placeholderTextColor="#999"
              />
            </View>
          )}

          {memberType === "owner" ? (
            filteredMembers.length === 0 ? (
              <Text style={styles.emptyText}>
                {apartmentMembers.length === 0
                  ? "No members are available."
                  : "No matching members found."}
              </Text>
            ) : (
              filteredMembers.map(renderMemberRow)
            )
          ) : filteredStaff.length === 0 ? (
            <Text style={styles.emptyText}>
              {staffMembers.length === 0
                ? "No staff members are available."
                : "No matching staff members found."}
            </Text>
          ) : (
            filteredStaff.map(renderMemberRow)
          )}
        </>
      ) : source === "new" ? (
        <>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter name"
          />
          <Text style={styles.label}>Phone number</Text>
          <View style={styles.phoneInputRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(value) => {
                setPhone(value.replace(/[^0-9]/g, "").slice(0, 10));
                setError("");
              }}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="9876543210"
            />
            <TouchableOpacity
              onPress={pickContact}
              style={styles.contactIcon}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={22} color="#1a73e8" />
            </TouchableOpacity>
          </View>
          {phone.length > 0 && phone.length !== 10 ? (
            <Text style={styles.phoneHint}>Enter all 10 digits</Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.label}>Select a person</Text>

          {/* Search bar - only visible if there are members or staff */}
          {hasMembersOrStaff && (
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, phone or role"
                placeholderTextColor="#999"
              />
            </View>
          )}

          {eligibleMembers.length === 0 ? (
            <Text style={styles.emptyText}>{getEmptyStateText()}</Text>
          ) : (
            <>
              <Text style={styles.groupHeading}>Members</Text>
              {apartmentMembers.length === 0 ? (
                <Text style={styles.emptyText}>No members are available.</Text>
              ) : (
                // Apply search filter to members if search is active
                (searchLower ? filteredMembers : apartmentMembers).map(
                  renderMemberRow,
                )
              )}

              <Text style={styles.groupHeading}>Staff (optional)</Text>
              {staffMembers.length === 0 ? (
                <Text style={styles.emptyText}>
                  No staff members are available.
                </Text>
              ) : (
                // Apply search filter to staff if search is active
                (searchLower ? filteredStaff : staffMembers).map(
                  renderMemberRow,
                )
              )}
            </>
          )}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>
          {isVisibilityFlow ? "Send Invite" : `Grant ${title} Access`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", flexGrow: 1, padding: 20 },
  intro: { color: "#111", fontSize: 18, fontWeight: "700", marginBottom: 18 },
  sourceControl: { flexDirection: "row", gap: 10, marginBottom: 14 },
  sourceButton: {
    alignItems: "center",
    borderColor: "#d9dde3",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 11,
  },
  sourceButtonActive: { backgroundColor: "#eff6ff", borderColor: "#1a73e8" },
  sourceText: { color: "#555", fontSize: 12, fontWeight: "600" },
  sourceTextActive: { color: "#1a73e8" },
  label: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
    marginTop: 14,
  },
  groupHeading: {
    color: "#333",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderColor: "#d9dde3",
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    height: 48,
    paddingHorizontal: 12,
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
  },
  phonePrefix: { color: "#333", fontSize: 15, marginRight: 8 },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  contactIcon: {
    padding: 8,
    marginLeft: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  phoneHint: { color: "#dc2626", fontSize: 12, marginTop: 5 },
  searchRow: {
    alignItems: "center",
    borderColor: "#d9dde3",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 44,
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: "100%",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  memberOption: {
    alignItems: "center",
    borderColor: "#e5e7eb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    padding: 11,
  },
  memberOptionSelected: { backgroundColor: "#eff6ff", borderColor: "#1a73e8" },
  memberAvatar: {
    alignItems: "center",
    backgroundColor: "#e8f0fe",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginRight: 10,
    width: 32,
  },
  memberAvatarText: { color: "#1a73e8", fontSize: 13, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { color: "#222", fontSize: 14, fontWeight: "600" },
  memberPhone: { color: "#777", fontSize: 12, marginTop: 2 },
  memberMeta: {
    color: "#1a73e8",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  emptyText: { color: "#777", fontSize: 14, paddingVertical: 12 },
  error: { color: "#dc2626", fontSize: 13, marginTop: 14 },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 8,
    marginTop: 24,
    paddingVertical: 14,
  },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { useGroups } from "../../hooks/useGroups";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import { useMemberStore } from "../../store/memberStore";
import { useAuthStore } from "../../store/useAuthStore";
import { ACCESS_ROLE_LABEL, AccountAccessRole } from "../../types/access";

type RecipientSource = "new" | "existing";
type MemberType = "owner" | "staff";

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: {
    number: string;
    label?: string;
  }[];
}

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

  // Contact picker states
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");

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

  const visibilityTitle =
    memberType === "owner"
      ? "Invite Member"
      : memberType === "staff"
        ? "Invite Staff"
        : "";

  const title = ACCESS_ROLE_LABEL[role || "member_visibility"];

  // ============================================================
  // CONTACT PICKER FUNCTIONS - Same as Login page
  // ============================================================

  const pickContact = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Contact picker is only available on mobile devices. Please enter the phone number manually.",
        [{ text: "OK" }],
      );
      return;
    }

    try {
      // Request permission
      const { status } = await Contacts.requestPermissionsAsync();

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

      // Get all contacts using getAllDetails - same as login page
      const contacts = await Contacts.Contact.getAllDetails(
        [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES],
        {
          sortOrder: Contacts.ContactsSortOrder.GivenName,
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

  // Filter contacts based on search
  const filteredContacts = contactsList.filter((contact) => {
    const search = contactSearch.toLowerCase().trim();
    if (!search) return true;
    const nameMatch = contact.name.toLowerCase().includes(search);
    const phoneMatch = contact.phoneNumbers.some((phone) =>
      phone.number.toLowerCase().includes(search),
    );
    return nameMatch || phoneMatch;
  });

  // Close contact picker
  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  // Select contact from picker
  const selectContact = (contact: ContactData) => {
    if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      let phoneNumber = contact.phoneNumbers[0].number || "";

      // Clean the phone number
      phoneNumber = phoneNumber
        .replace(/[^0-9]/g, "")
        .replace(/^91/, "")
        .replace(/^0/, "");

      // Ensure it's 10 digits
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

      // If name is empty, use contact name
      if (!name.trim() && contact.name) {
        setName(contact.name);
      }

      setContactSearch("");
      setShowContactPicker(false);
    } else {
      setError("Selected contact doesn't have a phone number");
    }
  };

  // Render contact picker modal
  const renderContactPickerModal = () => {
    if (!showContactPicker) return null;

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
                        </TouchableOpacity>
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

  const hasMembersOrStaff =
    apartmentMembers.length > 0 || staffMembers.length > 0;

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

      {/* Contact Picker Modal */}
      {renderContactPickerModal()}
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
    paddingHorizontal: 8,
    paddingRight: 4,
  },
  phonePrefix: { color: "#333", fontSize: 15, marginRight: 6 },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
    paddingHorizontal: 4,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  contactIcon: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f6ff",
    borderRadius: 6,
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

  // ==============================================================
  // CONTACT MODAL STYLES - Same as Login page
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

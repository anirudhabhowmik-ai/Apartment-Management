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

  // Contact picker
  const [showContactPicker, setShowContactPicker] = useState(false);

  const [contactsList, setContactsList] = useState<ContactData[]>([]);

  const [contactSearch, setContactSearch] = useState("");

  // ============================================================
  // MEMBERS
  // ============================================================

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

  // ============================================================
  // SEARCH
  // ============================================================

  const searchLower = search.trim().toLowerCase();

  const filteredMembers = useMemo(() => {
    if (!searchLower) return apartmentMembers;

    return apartmentMembers.filter((member) => {
      const apartmentNumber = ((member as any).apartmentNumber ?? "")
        .toString()
        .toLowerCase();

      const wing = ((member as any).wing ?? "").toString().toLowerCase();

      return (
        member.name.toLowerCase().includes(searchLower) ||
        member.phone.toLowerCase().includes(searchLower) ||
        apartmentNumber.includes(searchLower) ||
        wing.includes(searchLower)
      );
    });
  }, [apartmentMembers, searchLower]);

  const filteredStaff = useMemo(() => {
    if (!searchLower) return staffMembers;

    return staffMembers.filter((member) => {
      const staffRole = ((member as any).role ?? "").toString().toLowerCase();

      return (
        member.name.toLowerCase().includes(searchLower) ||
        member.phone.toLowerCase().includes(searchLower) ||
        staffRole.includes(searchLower)
      );
    });
  }, [staffMembers, searchLower]);

  // ============================================================
  // FLOW
  // ============================================================

  const isVisibilityFlow = memberType === "owner" || memberType === "staff";

  const visibilityTitle =
    memberType === "owner"
      ? "Invite Member"
      : memberType === "staff"
        ? "Invite Staff"
        : "";

  const title = ACCESS_ROLE_LABEL[role || "member_visibility"];

  // ============================================================
  // CONTACT PICKER
  // ============================================================

  const pickContact = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Contacts unavailable",
        "Contact picker is available only on mobile devices. Please enter the phone number manually.",
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
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "OK",
            },
          ],
        );

        setError("Permission to access contacts is required.");

        return;
      }

      const contacts = await Contacts.Contact.getAllDetails(
        [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES],
        {
          sortOrder: Contacts.ContactsSortOrder.GivenName,
        },
      );

      if (contacts.length === 0) {
        setError("No contacts found on your device.");

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
        setError("No contacts with phone numbers found.");

        return;
      }

      setContactSearch("");
      setContactsList(mappedContacts);
      setShowContactPicker(true);
      setError("");
    } catch (contactError) {
      console.error("Error fetching contacts:", contactError);

      setError("Failed to fetch contacts. Please try again.");
    }
  };

  const filteredContacts = contactsList.filter((contact) => {
    const query = contactSearch.trim().toLowerCase();

    if (!query) return true;

    const nameMatch = contact.name.toLowerCase().includes(query);

    const phoneMatch = contact.phoneNumbers.some((phone) =>
      phone.number.toLowerCase().includes(query),
    );

    return nameMatch || phoneMatch;
  });

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  const selectContact = (contact: ContactData) => {
    if (
      !contact ||
      !contact.phoneNumbers ||
      contact.phoneNumbers.length === 0
    ) {
      setError("Selected contact doesn't have a phone number.");

      return;
    }

    let phoneNumber = contact.phoneNumbers[0].number || "";

    phoneNumber = phoneNumber
      .replace(/[^0-9]/g, "")
      .replace(/^91/, "")
      .replace(/^0/, "");

    if (phoneNumber.length > 10) {
      phoneNumber = phoneNumber.slice(-10);
    }

    if (phoneNumber.length !== 10) {
      setError("Selected contact does not have a valid 10-digit phone number.");

      return;
    }

    setPhone(phoneNumber);
    setError("");

    if (!name.trim() && contact.name) {
      setName(contact.name);
    }

    setContactSearch("");
    setShowContactPicker(false);
  };

  // ============================================================
  // SAVE
  // ============================================================

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
              ? "Please select a member."
              : "Please select a staff member."
            : "Please select a member or staff member."
          : "Please enter a valid 10-digit phone number.",
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

  // ============================================================
  // MEMBER ROW
  // ============================================================

  const renderMemberRow = (member: (typeof eligibleMembers)[number]) => {
    const apartmentNumber = (member as any).apartmentNumber as
      | string
      | undefined;

    const wing = (member as any).wing as string | undefined;

    const staffRole = (member as any).role as string | undefined;

    let meta = "";

    if (memberType === "owner") {
      const parts: string[] = [];

      if (wing) {
        parts.push(`Wing ${wing}`);
      }

      if (apartmentNumber) {
        parts.push(`Apt ${apartmentNumber}`);
      }

      meta = parts.join("  •  ");
    } else if (memberType === "staff") {
      meta = staffRole || "Staff";
    }

    const selected = selectedMemberId === member.id;

    return (
      <TouchableOpacity
        key={member.id}
        activeOpacity={0.8}
        style={[styles.memberCard, selected && styles.memberCardSelected]}
        onPress={() => {
          setSelectedMemberId((currentId) =>
            currentId === member.id ? "" : member.id,
          );

          setError("");
        }}
      >
        <View
          style={[styles.memberAvatar, selected && styles.memberAvatarSelected]}
        >
          <Text
            style={[
              styles.memberAvatarText,
              selected && styles.memberAvatarTextSelected,
            ]}
          >
            {member.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.memberContent}>
          <Text style={styles.memberName} numberOfLines={1}>
            {member.name}
          </Text>

          <View style={styles.memberPhoneRow}>
            <Ionicons name="call-outline" size={13} color="#64748B" />

            <Text style={styles.memberPhone} numberOfLines={1}>
              {member.phone}
            </Text>
          </View>

          {meta ? (
            <View style={styles.memberMetaRow}>
              <Ionicons
                name={
                  memberType === "staff" ? "briefcase-outline" : "home-outline"
                }
                size={13}
                color="#2563EB"
              />

              <Text style={styles.memberMeta}>{meta}</Text>
            </View>
          ) : null}
        </View>

        <View
          style={[styles.radioOuter, selected && styles.radioOuterSelected]}
        >
          {selected ? (
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // ============================================================
  // CONTACT MODAL
  // ============================================================

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
            <TouchableWithoutFeedback
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.modalContainer}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Select Contact</Text>

                    <Text style={styles.modalSubtitle}>
                      Choose a contact from your phone
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={closeContactPicker}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={22} color="#334155" />
                  </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.modalSearch}>
                  <Ionicons name="search-outline" size={20} color="#64748B" />

                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Search contacts"
                    placeholderTextColor="#94A3B8"
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />

                  {contactSearch.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setContactSearch("")}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Count */}
                <View style={styles.contactCountRow}>
                  <Text style={styles.contactCount}>
                    {filteredContacts.length}{" "}
                    {filteredContacts.length === 1 ? "contact" : "contacts"}
                  </Text>
                </View>

                {/* Contact list */}
                <View style={styles.contactListWrapper}>
                  <ScrollView
                    style={styles.contactList}
                    contentContainerStyle={styles.contactListContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {filteredContacts.length > 0 ? (
                      filteredContacts.map((contact) => (
                        <TouchableOpacity
                          key={contact.id}
                          style={styles.contactItem}
                          onPress={() => selectContact(contact)}
                          activeOpacity={0.75}
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

                            {contact.phoneNumbers?.length > 0 ? (
                              <Text
                                style={styles.contactPhone}
                                numberOfLines={1}
                              >
                                {contact.phoneNumbers[0].number}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.contactArrow}>
                            <Ionicons
                              name="chevron-forward"
                              size={17}
                              color="#94A3B8"
                            />
                          </View>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.noContacts}>
                        <View style={styles.noContactsIcon}>
                          <Ionicons
                            name="search-outline"
                            size={28}
                            color="#64748B"
                          />
                        </View>

                        <Text style={styles.noContactsTitle}>
                          No contacts found
                        </Text>

                        <Text style={styles.noContactsText}>
                          Try another name or phone number.
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>

                {/* Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={closeContactPicker}
                    activeOpacity={0.8}
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
  // EMPTY STATE
  // ============================================================

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

  // ============================================================
  // SCREEN
  // ============================================================

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Intro Card */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons
              name={
                isVisibilityFlow
                  ? memberType === "owner"
                    ? "person-add-outline"
                    : "briefcase-outline"
                  : "shield-checkmark-outline"
              }
              size={24}
              color="#2563EB"
            />
          </View>

          <View style={styles.introContent}>
            <Text style={styles.introTitle}>
              {isVisibilityFlow ? visibilityTitle : `Grant ${title} access`}
            </Text>

            <Text style={styles.introDescription}>
              {isVisibilityFlow
                ? memberType === "owner"
                  ? "Select an apartment member to send an invitation."
                  : "Select a staff member to send an invitation."
                : "Choose who should receive access to this account."}
            </Text>
          </View>
        </View>

        {/* ======================================================
            RECIPIENT SOURCE
        ====================================================== */}

        {!isVisibilityFlow ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RECIPIENT</Text>

            <View style={styles.sourceCard}>
              {/* New phone */}
              <TouchableOpacity
                style={[
                  styles.sourceOption,
                  source === "new" && styles.sourceOptionActive,
                ]}
                onPress={() => {
                  setSource("new");
                  setSelectedMemberId("");
                  setError("");
                }}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.sourceIcon,
                    source === "new" && styles.sourceIconActive,
                  ]}
                >
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color={source === "new" ? "#2563EB" : "#64748B"}
                  />
                </View>

                <View style={styles.sourceContent}>
                  <Text
                    style={[
                      styles.sourceTitle,
                      source === "new" && styles.sourceTitleActive,
                    ]}
                  >
                    New phone number
                  </Text>

                  <Text style={styles.sourceDescription}>
                    Invite someone using their phone
                  </Text>
                </View>

                {source === "new" ? (
                  <Ionicons name="checkmark-circle" size={22} color="#2563EB" />
                ) : null}
              </TouchableOpacity>

              <View style={styles.sourceDivider} />

              {/* Existing */}
              <TouchableOpacity
                style={[
                  styles.sourceOption,
                  source === "existing" && styles.sourceOptionActive,
                ]}
                onPress={() => {
                  setSource("existing");
                  setName("");
                  setPhone("");
                  setError("");
                }}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.sourceIcon,
                    source === "existing" && styles.sourceIconActive,
                  ]}
                >
                  <Ionicons
                    name="people-outline"
                    size={20}
                    color={source === "existing" ? "#2563EB" : "#64748B"}
                  />
                </View>

                <View style={styles.sourceContent}>
                  <Text
                    style={[
                      styles.sourceTitle,
                      source === "existing" && styles.sourceTitleActive,
                    ]}
                  >
                    Existing member or staff
                  </Text>

                  <Text style={styles.sourceDescription}>
                    Select someone already in your account
                  </Text>
                </View>

                {source === "existing" ? (
                  <Ionicons name="checkmark-circle" size={22} color="#2563EB" />
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ======================================================
            NEW PHONE
        ====================================================== */}

        {!isVisibilityFlow && source === "new" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PERSON DETAILS</Text>

            <View style={styles.formCard}>
              <Text style={styles.inputLabel}>Full name</Text>

              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={19} color="#64748B" />

                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError("");
                  }}
                  placeholder="Enter full name"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                />
              </View>

              <Text style={[styles.inputLabel, styles.phoneLabel]}>
                Phone number
              </Text>

              <View style={styles.phoneWrapper}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>

                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value.replace(/[^0-9]/g, "").slice(0, 10));

                    setError("");
                  }}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="98765 43210"
                  placeholderTextColor="#94A3B8"
                />

                <TouchableOpacity
                  onPress={pickContact}
                  style={styles.contactButton}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={20}
                    color="#2563EB"
                  />
                </TouchableOpacity>
              </View>

              {phone.length > 0 && phone.length !== 10 ? (
                <View style={styles.phoneHintRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color="#DC2626"
                  />

                  <Text style={styles.phoneHint}>Enter all 10 digits</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ======================================================
            EXISTING MEMBER / STAFF
        ====================================================== */}

        {!isVisibilityFlow && source === "existing" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SELECT PERSON</Text>

            {hasMembersOrStaff ? (
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={19} color="#64748B" />

                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={(value) => {
                    setSearch(value);
                    setError("");
                  }}
                  placeholder="Search name, phone or role"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />

                {search.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={19} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {eligibleMembers.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={28} color="#64748B" />
                </View>

                <Text style={styles.emptyTitle}>No people available</Text>

                <Text style={styles.emptyDescription}>
                  {getEmptyStateText()}
                </Text>
              </View>
            ) : (
              <>
                {/* Members */}
                <View style={styles.groupHeader}>
                  <View style={styles.groupTitleRow}>
                    <Ionicons name="home-outline" size={17} color="#2563EB" />

                    <Text style={styles.groupTitle}>Members</Text>
                  </View>

                  <Text style={styles.groupCount}>
                    {apartmentMembers.length}
                  </Text>
                </View>

                {apartmentMembers.length === 0 ? (
                  <Text style={styles.emptySmall}>
                    No members are available.
                  </Text>
                ) : (
                  (searchLower ? filteredMembers : apartmentMembers).map(
                    renderMemberRow,
                  )
                )}

                {/* Staff */}
                <View style={[styles.groupHeader, styles.staffGroupHeader]}>
                  <View style={styles.groupTitleRow}>
                    <Ionicons
                      name="briefcase-outline"
                      size={17}
                      color="#2563EB"
                    />

                    <Text style={styles.groupTitle}>Staff</Text>
                  </View>

                  <Text style={styles.groupCount}>{staffMembers.length}</Text>
                </View>

                {staffMembers.length === 0 ? (
                  <Text style={styles.emptySmall}>
                    No staff members are available.
                  </Text>
                ) : (
                  (searchLower ? filteredStaff : staffMembers).map(
                    renderMemberRow,
                  )
                )}
              </>
            )}
          </View>
        ) : null}

        {/* ======================================================
            VISIBILITY FLOW
        ====================================================== */}

        {isVisibilityFlow ? (
          <View style={styles.section}>
            {hasMembersOrStaff ? (
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={19} color="#64748B" />

                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={(value) => {
                    setSearch(value);
                    setError("");
                  }}
                  placeholder={
                    memberType === "owner"
                      ? "Search name, phone, apartment or wing"
                      : "Search name, phone or role"
                  }
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />

                {search.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={19} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {memberType === "owner" ? (
              filteredMembers.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="people-outline" size={28} color="#64748B" />
                  </View>

                  <Text style={styles.emptyTitle}>
                    {apartmentMembers.length === 0
                      ? "No members available"
                      : "No matching members"}
                  </Text>

                  <Text style={styles.emptyDescription}>
                    {apartmentMembers.length === 0
                      ? "There are currently no apartment members available to invite."
                      : "Try searching with another name, phone number, apartment or wing."}
                  </Text>
                </View>
              ) : (
                filteredMembers.map(renderMemberRow)
              )
            ) : filteredStaff.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="briefcase-outline"
                    size={28}
                    color="#64748B"
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  {staffMembers.length === 0
                    ? "No staff available"
                    : "No matching staff"}
                </Text>

                <Text style={styles.emptyDescription}>
                  {staffMembers.length === 0
                    ? "There are currently no staff members available to invite."
                    : "Try searching with another name, phone number or role."}
                </Text>
              </View>
            ) : (
              filteredStaff.map(renderMemberRow)
            )}
          </View>
        ) : null}

        {/* ======================================================
            ERROR
        ====================================================== */}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={19} color="#DC2626" />

            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ======================================================
            ACTION BUTTON
        ====================================================== */}

        <View style={styles.bottomAction}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!isVisibilityFlow && source === "new" && phone.length !== 10) ||
              (isVisibilityFlow && !selectedMemberId)
                ? styles.saveButtonDisabled
                : null,
            ]}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Ionicons
              name={
                isVisibilityFlow ? "send-outline" : "shield-checkmark-outline"
              }
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.saveText}>
              {isVisibilityFlow ? "Send Invite" : `Grant ${title} Access`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      {renderContactPickerModal()}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  scroll: {
    flex: 1,
  },

  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // ----------------------------------------------------------
  // INTRO
  // ----------------------------------------------------------

  introCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    padding: 16,
    marginBottom: 22,
  },

  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  introContent: {
    flex: 1,
  },

  introTitle: {
    color: "#1E3A8A",
    fontSize: 16,
    fontWeight: "700",
  },

  introDescription: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  // ----------------------------------------------------------
  // SECTIONS
  // ----------------------------------------------------------

  section: {
    marginBottom: 20,
  },

  sectionTitle: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 9,
    marginLeft: 3,
  },

  // ----------------------------------------------------------
  // SOURCE
  // ----------------------------------------------------------

  sourceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },

  sourceOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 78,
  },

  sourceOptionActive: {
    backgroundColor: "#F8FBFF",
  },

  sourceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  sourceIconActive: {
    backgroundColor: "#DBEAFE",
  },

  sourceContent: {
    flex: 1,
  },

  sourceTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },

  sourceTitleActive: {
    color: "#1D4ED8",
  },

  sourceDescription: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },

  sourceDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginLeft: 68,
  },

  // ----------------------------------------------------------
  // FORM
  // ----------------------------------------------------------

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 15,
  },

  inputLabel: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
  },

  phoneLabel: {
    marginTop: 17,
  },

  inputWrapper: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: "#0F172A",
    marginLeft: 9,

    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },

  phoneWrapper: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 5,
  },

  countryCode: {
    height: 40,
    minWidth: 55,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
  },

  countryCodeText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },

  phoneInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: "#0F172A",
    paddingHorizontal: 11,

    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },

  contactButton: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },

  phoneHintRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
    gap: 5,
  },

  phoneHint: {
    color: "#DC2626",
    fontSize: 12,
  },

  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  searchBox: {
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: "#0F172A",
    marginLeft: 9,

    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },

  // ----------------------------------------------------------
  // GROUP
  // ----------------------------------------------------------

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
    marginBottom: 9,
    paddingHorizontal: 2,
  },

  staffGroupHeader: {
    marginTop: 20,
  },

  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  groupTitle: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },

  groupCount: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
  },

  // ----------------------------------------------------------
  // MEMBER
  // ----------------------------------------------------------

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 15,
    padding: 12,
    marginBottom: 8,
  },

  memberCardSelected: {
    borderColor: "#60A5FA",
    backgroundColor: "#F8FBFF",
  },

  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  memberAvatarSelected: {
    backgroundColor: "#2563EB",
  },

  memberAvatarText: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "700",
  },

  memberAvatarTextSelected: {
    color: "#FFFFFF",
  },

  memberContent: {
    flex: 1,
    minWidth: 0,
  },

  memberName: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },

  memberPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },

  memberPhone: {
    color: "#64748B",
    fontSize: 12,
    flexShrink: 1,
  },

  memberMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },

  memberMeta: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "600",
  },

  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  radioOuterSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },

  // ----------------------------------------------------------
  // EMPTY
  // ----------------------------------------------------------

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    paddingHorizontal: 25,
    paddingVertical: 32,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  emptyTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  emptyDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },

  emptySmall: {
    color: "#64748B",
    fontSize: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
  },

  // ----------------------------------------------------------
  // ERROR
  // ----------------------------------------------------------

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
    gap: 8,
  },

  errorText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 12,
    lineHeight: 17,
  },

  // ----------------------------------------------------------
  // ACTION
  // ----------------------------------------------------------

  bottomAction: {
    marginTop: 3,
  },

  saveButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
  },

  saveButtonDisabled: {
    opacity: 0.55,
  },

  saveText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  cancelButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },

  cancelText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },

  bottomSpace: {
    height: 20,
  },

  // ----------------------------------------------------------
  // CONTACT MODAL
  // ----------------------------------------------------------

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 20,
    paddingHorizontal: 18,
    maxHeight: "88%",
    minHeight: "55%",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  modalTitle: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "700",
  },

  modalSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },

  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  modalSearch: {
    height: 48,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  modalSearchInput: {
    flex: 1,
    height: "100%",
    color: "#0F172A",
    fontSize: 14,
    marginLeft: 8,

    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },

  contactCountRow: {
    paddingVertical: 10,
  },

  contactCount: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },

  contactListWrapper: {
    flex: 1,
    minHeight: 220,
  },

  contactList: {
    flex: 1,
  },

  contactListContent: {
    paddingBottom: 8,
  },

  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  contactAvatar: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  contactAvatarText: {
    color: "#2563EB",
    fontSize: 17,
    fontWeight: "700",
  },

  contactInfo: {
    flex: 1,
    minWidth: 0,
  },

  contactName: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },

  contactPhone: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },

  contactArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  noContacts: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 45,
    paddingHorizontal: 25,
  },

  noContactsIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  noContactsTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
  },

  noContactsText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 5,
  },

  modalFooter: {
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
  },

  modalCancelButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
}) as any;

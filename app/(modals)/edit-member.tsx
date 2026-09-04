import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { Contact, ContactField, ContactsSortOrder } from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DatePickerModal from "../../components/DatePickerModal";
import { useMembers } from "../../hooks/useMembers";
import { BillAttachment, GroupType, MemberRole } from "../../types";

interface RoleOption {
  role: MemberRole;
  label: string;
}

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: {
    number: string;
    label?: string;
  }[];
}

const FLAT_ROLES: RoleOption[] = [
  { role: "owner", label: "Owner" },
  { role: "secretary", label: "Secretary" },
  { role: "tenant", label: "Tenant" },
];

const SERVANT_ROLES: RoleOption[] = [
  { role: "sweeper", label: "Sweeper" },
  { role: "security", label: "Security" },
  { role: "maintenance", label: "Maintenance" },
];

const EXPENSE_ROLES: RoleOption[] = [
  { role: "electricity", label: "Electricity" },
  { role: "water", label: "Water" },
  { role: "maintenance", label: "Maintenance" },
  { role: "other", label: "Other" },
];

export default function EditMemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { memberId, groupId, groupType } = useLocalSearchParams<{
    memberId: string;
    groupId: string;
    groupType: GroupType;
  }>();

  const { getMemberById, editMember, deleteMember } = useMembers(
    groupId ?? null,
  );

  const member = getMemberById(memberId);

  // ==================================================
  // ROLE OPTIONS
  // ==================================================

  let roleOptions: RoleOption[] = [];

  if (groupType === "apartment") {
    roleOptions = FLAT_ROLES;
  } else if (groupType === "staff") {
    roleOptions = SERVANT_ROLES;
  } else if (groupType === "expense") {
    roleOptions = EXPENSE_ROLES;
  }

  // ==================================================
  // FORM STATE
  // ==================================================

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole | null>(null);
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRole, setCustomRole] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [wing, setWing] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [maintenanceAmount, setMaintenanceAmount] = useState("");

  const [monthlySalary, setMonthlySalary] = useState("");

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<"paid" | "due">("paid");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [billAttachments, setBillAttachments] = useState<BillAttachment[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // ==================================================
  // CONTACT PICKER STATE
  // ==================================================

  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);

  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  // ==================================================
  // FILTER CONTACTS
  // ==================================================

  const filteredContacts = useMemo(() => {
    const search = contactSearch.toLowerCase().trim();

    if (!search) {
      return contactsList;
    }

    return contactsList.filter((contact) => {
      const nameMatch = contact.name.toLowerCase().includes(search);

      const phoneMatch = contact.phoneNumbers.some((phone) =>
        phone.number.toLowerCase().includes(search),
      );

      return nameMatch || phoneMatch;
    });
  }, [contactsList, contactSearch]);

  // ==================================================
  // LOAD MEMBER
  // ==================================================

  useEffect(() => {
    if (!member) return;

    setName(member.name);

    let memberPhone = member.phone || "";

    memberPhone = memberPhone
      .replace(/[^0-9]/g, "")
      .replace(/^91/, "")
      .replace(/^0/, "");

    if (memberPhone.length > 10) {
      memberPhone = memberPhone.slice(-10);
    }

    setPhone(memberPhone);

    setRole(member.role);
    setPhotoUri(member.photoUri || null);

    if (!roleOptions.some((option) => option.role === member.role)) {
      setIsCustomRole(true);
      setCustomRole(member.role);
    } else {
      setIsCustomRole(false);
      setCustomRole("");
    }

    if (groupType === "apartment" && "flatNumber" in member) {
      setWing(member.wing || "");
      setFlatNumber(member.flatNumber || "");
      setAreaSqft(member.areaSqft?.toString() || "");
      setParkingAvailable(member.parkingAvailable || false);
      setMaintenanceAmount(member.maintenanceAmount?.toString() || "");
    }

    if (groupType === "staff" && "monthlySalary" in member) {
      setMonthlySalary(member.monthlySalary?.toString() || "");
    }

    if (groupType === "expense" && "amount" in member) {
      setExpenseAmount(member.amount?.toString() || "");
      setExpenseStatus(member.status || "paid");
      setReminderEnabled(member.reminderEnabled || false);
      setDueDate(member.dueDate || "");
      setExpenseDescription(member.description || "");

      setBillAttachments(
        member.billAttachments ||
          (member.billUri
            ? [
                {
                  uri: member.billUri,
                  name: member.billName || "Bill attachment",
                },
              ]
            : []),
      );
    }
  }, [member, groupType]);

  // ==================================================
  // PICK PROFILE PHOTO
  // ==================================================

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

  // ==================================================
  // CONTACT PICKER
  // ==================================================

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
      setLoadingContacts(true);
      setError("");

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

      const contactDetails = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        {
          sortOrder: ContactsSortOrder.GivenName,
        },
      );

      if (contactDetails.length === 0) {
        setError("No contacts found on your device");
        return;
      }

      const mappedContacts: ContactData[] = contactDetails
        .filter((contact) => contact.phones && contact.phones.length > 0)
        .map((contact) => ({
          id: contact.id || `contact-${Math.random()}`,
          name: contact.fullName || "Unknown",
          phoneNumbers:
            contact.phones?.map((phone) => ({
              number: phone.number || "",
              label: phone.label || undefined,
            })) || [],
        }));

      if (mappedContacts.length === 0) {
        setError("No contacts with phone numbers found");
        return;
      }

      setContactSearch("");
      setContactsList(mappedContacts);
      setShowContactPicker(true);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setError("Failed to fetch contacts. Please try again.");
    } finally {
      setLoadingContacts(false);
    }
  };

  // ==================================================
  // SELECT CONTACT
  // ==================================================

  const selectContact = (contact: ContactData) => {
    if (
      !contact ||
      !contact.phoneNumbers ||
      contact.phoneNumbers.length === 0
    ) {
      setError("Selected contact doesn't have a phone number");
      return;
    }

    let phoneNumber = contact.phoneNumbers[0].number || "";

    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
    phoneNumber = phoneNumber.replace(/^91/, "");
    phoneNumber = phoneNumber.replace(/^0/, "");

    if (phoneNumber.length > 10) {
      phoneNumber = phoneNumber.slice(-10);
    }

    if (phoneNumber.length !== 10) {
      setError("Selected contact does not have a valid 10-digit phone number");
      return;
    }

    setPhone(phoneNumber);

    if (!name.trim() && contact.name) {
      setName(contact.name);
    }

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      phone: "",
    }));

    setError("");
    setContactSearch("");
    setShowContactPicker(false);
  };

  // ==================================================
  // CLOSE CONTACT PICKER
  // ==================================================

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  // ==================================================
  // PICK BILL
  // ==================================================

  const handlePickBill = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setBillAttachments((currentAttachments) => [
        ...currentAttachments,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName || "Bill image",
          mimeType: asset.mimeType,
        })),
      ]);
    }
  };

  // ==================================================
  // UPDATE MEMBER
  // ==================================================

  const handleUpdate = async () => {
    setError("");

    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Name is required";
    }

    if (groupType !== "expense") {
      if (!phone || phone.length === 0) {
        errors.phone = "Phone number is missing";
      } else if (phone.length !== 10) {
        errors.phone = "Phone number must be 10 digits";
      }

      if (!role) {
        errors.role = "Please select a role";
      }
    }

    if (groupType === "apartment") {
      if (!flatNumber.trim()) {
        errors.flatNumber = "Flat number is required";
      }

      if (!maintenanceAmount.trim()) {
        errors.maintenanceAmount = "Maintenance amount is required";
      } else if (isNaN(Number(maintenanceAmount))) {
        errors.maintenanceAmount = "Maintenance amount must be a number";
      }
    }

    if (groupType === "staff") {
      if (!monthlySalary.trim()) {
        errors.monthlySalary = "Monthly salary is required";
      } else if (isNaN(Number(monthlySalary))) {
        errors.monthlySalary = "Monthly salary must be a number";
      }
    }

    if (groupType === "expense") {
      if (!expenseAmount.trim()) {
        errors.expenseAmount = "Expense amount is required";
      } else if (isNaN(Number(expenseAmount))) {
        errors.expenseAmount = "Expense amount must be a number";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix all the errors");
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const updateData: any = {
        name: name.trim(),
        phone: groupType === "expense" ? "" : `+91${phone}`,
        role: groupType === "expense" ? "expense" : role,
        photoUri: photoUri ?? undefined,
      };

      if (groupType === "apartment") {
        if (wing && wing.trim()) {
          updateData.wing = wing.trim();
        }

        updateData.flatNumber = flatNumber.trim();

        if (areaSqft && !isNaN(Number(areaSqft))) {
          updateData.areaSqft = Number(areaSqft);
        }

        updateData.parkingAvailable = parkingAvailable;
        updateData.maintenanceAmount = Number(maintenanceAmount);
      }

      if (groupType === "staff") {
        updateData.monthlySalary = Number(monthlySalary);
      }

      if (groupType === "expense") {
        updateData.amount = Number(expenseAmount);
        updateData.status = expenseStatus;

        updateData.reminderEnabled =
          expenseStatus === "due" ? reminderEnabled : false;

        updateData.dueDate = dueDate || undefined;
        updateData.description = expenseDescription.trim() || undefined;
        updateData.billAttachments = billAttachments;
      }

      await editMember(memberId, updateData);

      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to update member");
    } finally {
      setLoading(false);
    }
  };

  // ==================================================
  // DELETE
  // ==================================================

  const handleDelete = () => {
    setShowDeleteConfirmation(true);
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);
      setError("");
      setFieldErrors({});

      await deleteMember(memberId);

      setShowDeleteConfirmation(false);

      router.back();
    } catch (e: any) {
      console.error("Delete error:", e);

      setError(e.message || "Failed to delete member. Please try again.");

      setLoading(false);
    }
  };

  // ==================================================
  // MEMBER NOT FOUND
  // ==================================================

  if (!member) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: groupType === "expense" ? "Edit Expense" : "Edit Member",
          }}
        />
        <View style={styles.centerContent}>
          <View style={styles.notFoundIcon}>
            <Ionicons name="person-outline" size={34} color="#2563eb" />
          </View>

          <Text style={styles.notFoundTitle}>Member not found</Text>

          <Text style={styles.notFoundSubtitle}>
            This member may have already been removed.
          </Text>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==================================================
  // SCREEN
  // ==================================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: groupType === "expense" ? "Edit Expense" : "Edit Member",
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        {/* ==================================================
            PROFILE CARD
        ================================================== */}

        {groupType !== "expense" ? (
          <View style={styles.profileCard}>
            <TouchableOpacity
              style={styles.profileAvatarWrapper}
              onPress={handlePickPhoto}
              activeOpacity={0.8}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.profileImage} />
              ) : (
                <View style={styles.profilePlaceholder}>
                  <Ionicons name="person" size={34} color="#2563eb" />
                </View>
              )}

              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {name || "Member"}
              </Text>

              <Text style={styles.profileRole}>
                {isCustomRole
                  ? customRole || "Custom role"
                  : roleOptions.find((item) => item.role === role)?.label ||
                    "Member"}
              </Text>

              <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.7}>
                <Text style={styles.changePhotoText}>
                  {photoUri ? "Change profile photo" : "Add profile photo"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ==================================================
            PERSONAL DETAILS
        ================================================== */}

        {groupType !== "expense" && (
          <View style={styles.card}>
            <SectionHeader
              icon="person-outline"
              title="Personal Details"
              subtitle="Basic contact information"
            />

            <FieldLabel label="Full Name" required error={fieldErrors.name} />

            <InputContainer icon="person-outline" error={!!fieldErrors.name}>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                placeholderTextColor="#9ca3af"
                value={name}
                onChangeText={(text) => {
                  setName(text);

                  if (fieldErrors.name) {
                    setFieldErrors({
                      ...fieldErrors,
                      name: "",
                    });
                  }
                }}
              />
            </InputContainer>

            {fieldErrors.name ? <FieldError text={fieldErrors.name} /> : null}

            <FieldLabel
              label="Phone Number"
              required
              error={fieldErrors.phone}
            />

            <View
              style={[
                styles.phoneContainer,
                fieldErrors.phone && styles.errorBorder,
              ]}
            >
              <View style={styles.countryCode}>
                <Text style={styles.countryCodeText}>+91</Text>
              </View>

              <TextInput
                style={styles.phoneInput}
                placeholder="9876543210"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                maxLength={10}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text.replace(/[^0-9]/g, ""));

                  if (fieldErrors.phone) {
                    setFieldErrors({
                      ...fieldErrors,
                      phone: "",
                    });
                  }
                }}
              />

              <TouchableOpacity
                onPress={pickContact}
                style={styles.contactButton}
                activeOpacity={0.7}
                disabled={loadingContacts}
              >
                <Ionicons
                  name="people-outline"
                  size={20}
                  color={loadingContacts ? "#9ca3af" : "#2563eb"}
                />
              </TouchableOpacity>
            </View>

            {fieldErrors.phone ? <FieldError text={fieldErrors.phone} /> : null}
          </View>
        )}

        {/* ==================================================
            ROLE
        ================================================== */}

        {groupType !== "expense" && (
          <View style={styles.card}>
            <SectionHeader
              icon="shield-checkmark-outline"
              title="Role"
              subtitle="Select the person's role"
            />

            <View style={styles.roleGrid}>
              {roleOptions.map((option) => {
                const selected = role === option.role && !isCustomRole;

                return (
                  <TouchableOpacity
                    key={option.role}
                    style={[
                      styles.roleOption,
                      selected && styles.roleOptionSelected,
                    ]}
                    onPress={() => {
                      setRole(option.role);
                      setIsCustomRole(false);
                      setCustomRole("");

                      if (fieldErrors.role) {
                        setFieldErrors({
                          ...fieldErrors,
                          role: "",
                        });
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.roleRadio,
                        selected && styles.roleRadioSelected,
                      ]}
                    >
                      {selected ? <View style={styles.roleRadioDot} /> : null}
                    </View>

                    <Text
                      style={[
                        styles.roleOptionText,
                        selected && styles.roleOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  isCustomRole && styles.roleOptionSelected,
                ]}
                onPress={() => {
                  setIsCustomRole(true);
                  setRole(customRole.trim() || null);
                }}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.roleRadio,
                    isCustomRole && styles.roleRadioSelected,
                  ]}
                >
                  {isCustomRole ? <View style={styles.roleRadioDot} /> : null}
                </View>

                <Text
                  style={[
                    styles.roleOptionText,
                    isCustomRole && styles.roleOptionTextSelected,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {isCustomRole ? (
              <View style={styles.customRoleWrapper}>
                <InputContainer
                  icon="create-outline"
                  error={!!fieldErrors.role}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter custom role"
                    placeholderTextColor="#9ca3af"
                    value={customRole}
                    onChangeText={(text) => {
                      setCustomRole(text);
                      setRole(text.trim() || null);

                      if (fieldErrors.role) {
                        setFieldErrors({
                          ...fieldErrors,
                          role: "",
                        });
                      }
                    }}
                  />
                </InputContainer>
              </View>
            ) : null}

            {fieldErrors.role ? <FieldError text={fieldErrors.role} /> : null}
          </View>
        )}

        {/* ==================================================
            APARTMENT DETAILS
        ================================================== */}

        {groupType === "apartment" && (
          <View style={styles.card}>
            <SectionHeader
              icon="home-outline"
              title="Flat Details"
              subtitle="Apartment and maintenance information"
            />

            <FieldLabel label="Wing / Section" optional />

            <InputContainer icon="business-outline">
              <TextInput
                style={styles.input}
                placeholder="A Wing, B Wing, Tower 1"
                placeholderTextColor="#9ca3af"
                value={wing}
                onChangeText={setWing}
              />
            </InputContainer>

            <FieldLabel
              label="Flat Number"
              required
              error={fieldErrors.flatNumber}
            />

            <InputContainer
              icon="home-outline"
              error={!!fieldErrors.flatNumber}
            >
              <TextInput
                style={styles.input}
                placeholder="A-204"
                placeholderTextColor="#9ca3af"
                value={flatNumber}
                onChangeText={(text) => {
                  setFlatNumber(text);

                  if (fieldErrors.flatNumber) {
                    setFieldErrors({
                      ...fieldErrors,
                      flatNumber: "",
                    });
                  }
                }}
              />
            </InputContainer>

            {fieldErrors.flatNumber ? (
              <FieldError text={fieldErrors.flatNumber} />
            ) : null}

            <FieldLabel label="Area" optional />

            <InputContainer icon="resize-outline" suffix="sq. ft.">
              <TextInput
                style={styles.input}
                placeholder="1200"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={areaSqft}
                onChangeText={(text) =>
                  setAreaSqft(text.replace(/[^0-9]/g, ""))
                }
              />
            </InputContainer>

            {/* PARKING */}

            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="car-outline" size={20} color="#2563eb" />
              </View>

              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Parking Available</Text>

                <Text style={styles.settingSubtitle}>
                  Does this flat have parking?
                </Text>
              </View>

              <Switch
                value={parkingAvailable}
                onValueChange={setParkingAvailable}
                trackColor={{
                  false: "#d1d5db",
                  true: "#93c5fd",
                }}
                thumbColor={parkingAvailable ? "#2563eb" : "#f4f4f5"}
              />
            </View>

            <FieldLabel
              label="Monthly Maintenance"
              required
              error={fieldErrors.maintenanceAmount}
            />

            <InputContainer
              icon="wallet-outline"
              error={!!fieldErrors.maintenanceAmount}
              prefix="₹"
            >
              <TextInput
                style={styles.input}
                placeholder="2500"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={maintenanceAmount}
                onChangeText={(text) => {
                  setMaintenanceAmount(text.replace(/[^0-9]/g, ""));

                  if (fieldErrors.maintenanceAmount) {
                    setFieldErrors({
                      ...fieldErrors,
                      maintenanceAmount: "",
                    });
                  }
                }}
              />
            </InputContainer>

            {fieldErrors.maintenanceAmount ? (
              <FieldError text={fieldErrors.maintenanceAmount} />
            ) : null}
          </View>
        )}

        {/* ==================================================
            STAFF DETAILS
        ================================================== */}

        {groupType === "staff" && (
          <View style={styles.card}>
            <SectionHeader
              icon="briefcase-outline"
              title="Employment Details"
              subtitle="Salary and employment information"
            />

            <FieldLabel
              label="Monthly Salary"
              required
              error={fieldErrors.monthlySalary}
            />

            <InputContainer
              icon="wallet-outline"
              error={!!fieldErrors.monthlySalary}
              prefix="₹"
            >
              <TextInput
                style={styles.input}
                placeholder="5000"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={monthlySalary}
                onChangeText={(text) => {
                  setMonthlySalary(text.replace(/[^0-9]/g, ""));

                  if (fieldErrors.monthlySalary) {
                    setFieldErrors({
                      ...fieldErrors,
                      monthlySalary: "",
                    });
                  }
                }}
              />
            </InputContainer>

            {fieldErrors.monthlySalary ? (
              <FieldError text={fieldErrors.monthlySalary} />
            ) : null}
          </View>
        )}

        {/* ==================================================
            EXPENSE DETAILS
        ================================================== */}

        {groupType === "expense" && (
          <View style={styles.card}>
            <SectionHeader
              icon="receipt-outline"
              title="Expense Details"
              subtitle="Update expense and payment information"
            />

            <FieldLabel
              label="Expense Name"
              required
              error={fieldErrors.name}
            />

            <InputContainer
              icon="document-text-outline"
              error={!!fieldErrors.name}
            >
              <TextInput
                style={styles.input}
                placeholder="Water bill, Lift repair"
                placeholderTextColor="#9ca3af"
                value={name}
                onChangeText={(text) => {
                  setName(text);

                  if (fieldErrors.name) {
                    setFieldErrors({
                      ...fieldErrors,
                      name: "",
                    });
                  }
                }}
              />
            </InputContainer>

            {fieldErrors.name ? <FieldError text={fieldErrors.name} /> : null}

            <FieldLabel
              label="Amount"
              required
              error={fieldErrors.expenseAmount}
            />

            <InputContainer
              icon="cash-outline"
              error={!!fieldErrors.expenseAmount}
              prefix="₹"
            >
              <TextInput
                style={styles.input}
                placeholder="4200"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={expenseAmount}
                onChangeText={(text) => {
                  setExpenseAmount(text.replace(/[^0-9]/g, ""));

                  if (fieldErrors.expenseAmount) {
                    setFieldErrors({
                      ...fieldErrors,
                      expenseAmount: "",
                    });
                  }
                }}
              />
            </InputContainer>

            {fieldErrors.expenseAmount ? (
              <FieldError text={fieldErrors.expenseAmount} />
            ) : null}

            {/* PAYMENT STATUS */}

            <Text style={styles.fieldLabel}>Payment Status</Text>

            <View style={styles.paymentStatusRow}>
              <TouchableOpacity
                style={[
                  styles.paymentStatusCard,
                  expenseStatus === "paid" && styles.paymentStatusCardPaid,
                ]}
                onPress={() => {
                  setExpenseStatus("paid");
                  setReminderEnabled(false);
                }}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.paymentIcon,
                    expenseStatus === "paid" && styles.paymentIconPaid,
                  ]}
                >
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={expenseStatus === "paid" ? "#15803d" : "#6b7280"}
                  />
                </View>

                <View style={styles.paymentTextWrapper}>
                  <Text
                    style={[
                      styles.paymentTitle,
                      expenseStatus === "paid" && styles.paymentTitlePaid,
                    ]}
                  >
                    Paid
                  </Text>

                  <Text style={styles.paymentSubtitle}>Payment completed</Text>
                </View>

                {expenseStatus === "paid" ? (
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentStatusCard,
                  expenseStatus === "due" && styles.paymentStatusCardDue,
                ]}
                onPress={() => setExpenseStatus("due")}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.paymentIcon,
                    expenseStatus === "due" && styles.paymentIconDue,
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={expenseStatus === "due" ? "#c2410c" : "#6b7280"}
                  />
                </View>

                <View style={styles.paymentTextWrapper}>
                  <Text
                    style={[
                      styles.paymentTitle,
                      expenseStatus === "due" && styles.paymentTitleDue,
                    ]}
                  >
                    Due
                  </Text>

                  <Text style={styles.paymentSubtitle}>Payment pending</Text>
                </View>

                {expenseStatus === "due" ? (
                  <Ionicons name="checkmark-circle" size={20} color="#ea580c" />
                ) : null}
              </TouchableOpacity>
            </View>

            {/* REMINDER */}

            {expenseStatus === "due" ? (
              <View style={styles.reminderCard}>
                <View style={styles.reminderIcon}>
                  <Ionicons
                    name="notifications-outline"
                    size={20}
                    color="#c2410c"
                  />
                </View>

                <View style={styles.reminderText}>
                  <Text style={styles.reminderTitle}>Payment Reminder</Text>

                  <Text style={styles.reminderSubtitle}>
                    Get notified on the expense date
                  </Text>
                </View>

                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{
                    false: "#d1d5db",
                    true: "#fdba74",
                  }}
                  thumbColor={reminderEnabled ? "#ea580c" : "#f4f4f5"}
                />
              </View>
            ) : null}

            {/* DATE */}

            <Text style={styles.fieldLabel}>Expense Date</Text>

            <TouchableOpacity
              style={styles.dateField}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.75}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar-outline" size={20} color="#2563eb" />
              </View>

              <View style={styles.dateTextWrapper}>
                <Text
                  style={dueDate ? styles.dateValue : styles.datePlaceholder}
                >
                  {dueDate || "Select expense date"}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>

            {/* ATTACHMENTS */}

            <Text style={styles.fieldLabel}>
              Bill Attachments
              <Text style={styles.optionalText}> • Optional</Text>
            </Text>

            {billAttachments.length > 0 ? (
              <View style={styles.attachmentList}>
                {billAttachments.map((attachment, index) => (
                  <View
                    key={`${attachment.uri}-${index}`}
                    style={[
                      styles.attachmentRow,
                      index === billAttachments.length - 1 &&
                        styles.attachmentRowLast,
                    ]}
                  >
                    <View style={styles.attachmentIcon}>
                      <Ionicons
                        name="document-outline"
                        size={19}
                        color="#2563eb"
                      />
                    </View>

                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {attachment.name}
                    </Text>

                    <TouchableOpacity
                      style={styles.attachmentAction}
                      onPress={() => Linking.openURL(attachment.uri)}
                    >
                      <Ionicons name="open-outline" size={19} color="#2563eb" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.attachmentAction,
                        styles.attachmentDeleteAction,
                      ]}
                      onPress={() =>
                        setBillAttachments((currentAttachments) =>
                          currentAttachments.filter(
                            (_, attachmentIndex) => attachmentIndex !== index,
                          ),
                        )
                      }
                    >
                      <Ionicons
                        name="trash-outline"
                        size={19}
                        color="#dc2626"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyAttachment}>
                <View style={styles.emptyAttachmentIcon}>
                  <Ionicons
                    name="document-attach-outline"
                    size={26}
                    color="#2563eb"
                  />
                </View>

                <Text style={styles.emptyAttachmentTitle}>
                  No bill attached
                </Text>

                <Text style={styles.emptyAttachmentSubtitle}>
                  Add an image of the bill for your records.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.attachButton}
              onPress={handlePickBill}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={21} color="#2563eb" />

              <Text style={styles.attachButtonText}>
                {billAttachments.length
                  ? "Add another bill"
                  : "Add bill attachment"}
              </Text>
            </TouchableOpacity>

            {/* NOTE */}

            <Text style={styles.fieldLabel}>Note</Text>

            <View style={styles.noteContainer}>
              <Ionicons
                name="create-outline"
                size={19}
                color="#9ca3af"
                style={styles.noteIcon}
              />

              <TextInput
                style={styles.noteInput}
                placeholder="Add a note about this expense..."
                placeholderTextColor="#9ca3af"
                value={expenseDescription}
                onChangeText={setExpenseDescription}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {/* ==================================================
            ERROR
        ================================================== */}

        {error && (error !== "Please fix all the errors" || hasFieldErrors) ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={19} color="#dc2626" />

            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ==================================================
            UPDATE BUTTON
        ================================================== */}

        <TouchableOpacity
          style={[styles.updateButton, loading && styles.updateButtonDisabled]}
          onPress={handleUpdate}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons
            name={loading ? "hourglass-outline" : "checkmark-circle-outline"}
            size={21}
            color="#fff"
          />

          <Text style={styles.updateButtonText}>
            {loading
              ? "Saving Changes..."
              : groupType === "expense"
                ? "Save Expense"
                : "Save Changes"}
          </Text>
        </TouchableOpacity>

        {/* ==================================================
            DELETE
        ================================================== */}

        <TouchableOpacity
          style={styles.deleteTextButton}
          onPress={handleDelete}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color="#dc2626" />

          <Text style={styles.deleteTextButtonText}>
            Delete {groupType === "expense" ? "Expense" : "Member"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: Math.max(40, insets.bottom + 20) }} />
      </ScrollView>

      {/* ==================================================
          CONTACT PICKER
      ================================================== */}

      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={closeContactPicker}
      >
        <TouchableWithoutFeedback onPress={closeContactPicker}>
          <View style={styles.contactModalOverlay}>
            <TouchableWithoutFeedback
              onPress={(event) => event.stopPropagation()}
            >
              <View
                style={[
                  styles.contactModal,
                  {
                    paddingBottom: Math.max(insets.bottom, 12),
                  },
                ]}
              >
                <View style={styles.contactModalHandle} />

                <View style={styles.contactModalHeader}>
                  <View>
                    <Text style={styles.contactModalTitle}>Select Contact</Text>

                    <Text style={styles.contactModalSubtitle}>
                      Choose a contact to use their phone number
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={closeContactPicker}
                    style={styles.contactCloseButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={22} color="#374151" />
                  </TouchableOpacity>
                </View>

                <View style={styles.contactSearchContainer}>
                  <Ionicons name="search-outline" size={20} color="#9ca3af" />

                  <TextInput
                    style={styles.contactSearchInput}
                    placeholder="Search contacts"
                    placeholderTextColor="#9ca3af"
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />

                  {contactSearch.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setContactSearch("")}
                      style={styles.clearSearchButton}
                    >
                      <Ionicons name="close-circle" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {loadingContacts ? (
                  <View style={styles.contactLoading}>
                    <View style={styles.contactLoadingIcon}>
                      <Ionicons
                        name="people-outline"
                        size={30}
                        color="#2563eb"
                      />
                    </View>

                    <Text style={styles.contactLoadingText}>
                      Loading contacts...
                    </Text>
                  </View>
                ) : (
                  <View style={styles.contactListWrapper}>
                    <ScrollView
                      style={styles.contactListContainer}
                      contentContainerStyle={styles.contactListContent}
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      bounces
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
                              <Text
                                style={styles.contactName}
                                numberOfLines={1}
                              >
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

                            <Ionicons
                              name="chevron-forward"
                              size={19}
                              color="#9ca3af"
                            />
                          </TouchableOpacity>
                        ))
                      ) : (
                        <View style={styles.noContactsContainer}>
                          <View style={styles.noContactsIcon}>
                            <Ionicons
                              name="search-outline"
                              size={30}
                              color="#9ca3af"
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
                )}

                <TouchableOpacity
                  style={styles.contactCancelButton}
                  onPress={closeContactPicker}
                  activeOpacity={0.7}
                >
                  <Text style={styles.contactCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ==================================================
          DATE PICKER
      ================================================== */}

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={setDueDate}
      />

      {/* ==================================================
          DELETE CONFIRMATION
      ================================================== */}

      <Modal
        transparent
        animationType="fade"
        visible={showDeleteConfirmation}
        onRequestClose={() => setShowDeleteConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmationModal}>
            <View style={styles.deleteWarningIcon}>
              <Ionicons name="trash-outline" size={25} color="#dc2626" />
            </View>

            <Text style={styles.confirmationTitle}>
              Delete {groupType === "expense" ? "Expense" : "Member"}?
            </Text>

            <Text style={styles.confirmationMessage}>
              Are you sure you want to delete {name}? This action cannot be
              undone.
            </Text>

            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowDeleteConfirmation(false)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmDeleteButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={confirmDelete}
                disabled={loading}
              >
                <Ionicons name="trash-outline" size={17} color="#fff" />

                <Text style={styles.confirmDeleteButtonText}>
                  {loading ? "Deleting..." : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==================================================
// REUSABLE UI COMPONENTS
// ==================================================

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color="#2563eb" />
      </View>

      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FieldLabel({
  label,
  required,
  optional,
  error,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={[styles.fieldLabel, error && styles.fieldLabelError]}>
        {label}

        {required ? <Text style={styles.requiredMark}> *</Text> : null}

        {optional ? <Text style={styles.optionalText}> • Optional</Text> : null}
      </Text>
    </View>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <View style={styles.fieldErrorRow}>
      <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />

      <Text style={styles.fieldError}>{text}</Text>
    </View>
  );
}

function InputContainer({
  children,
  icon,
  error,
  prefix,
  suffix,
}: {
  children: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <View style={[styles.inputContainer, error && styles.errorBorder]}>
      <Ionicons
        name={icon}
        size={19}
        color={error ? "#dc2626" : "#9ca3af"}
        style={styles.inputIcon}
      />

      {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}

      {children}

      {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
    </View>
  );
}

// ==================================================
// STYLES
// ==================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f8fc",
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 40,
  },

  // ==================================================
  // NOT FOUND
  // ==================================================

  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },

  notFoundIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  notFoundTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },

  notFoundSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 7,
    marginBottom: 22,
  },

  backButton: {
    minWidth: 130,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },

  backButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // ==================================================
  // PROFILE
  // ==================================================

  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8edf5",
    marginBottom: 14,
  },

  profileAvatarWrapper: {
    width: 78,
    height: 78,
    position: "relative",
  },

  profileImage: {
    width: 78,
    height: 78,
    borderRadius: 39,
  },

  profilePlaceholder: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d7e6ff",
  },

  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },

  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },

  profileName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },

  profileRole: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },

  changePhotoText: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "700",
    marginTop: 8,
  },

  // ==================================================
  // CARDS
  // ==================================================

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e8edf5",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 19,
  },

  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  sectionHeaderText: {
    flex: 1,
    marginLeft: 11,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },

  sectionSubtitle: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 3,
  },

  // ==================================================
  // FIELDS
  // ==================================================

  fieldLabelRow: {
    marginTop: 2,
    marginBottom: 8,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },

  fieldLabelError: {
    color: "#dc2626",
  },

  requiredMark: {
    color: "#dc2626",
  },

  optionalText: {
    color: "#9ca3af",
    fontWeight: "500",
  },

  inputContainer: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 15,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },

  inputPrefix: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "700",
    marginRight: 5,
  },

  inputSuffix: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    marginLeft: 8,
  },

  errorBorder: {
    borderColor: "#dc2626",
    backgroundColor: "#fffafa",
  },

  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -9,
    marginBottom: 14,
  },

  fieldError: {
    fontSize: 12,
    color: "#dc2626",
    marginLeft: 5,
    fontWeight: "600",
  },

  // ==================================================
  // PHONE
  // ==================================================

  phoneContainer: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 13,
    paddingRight: 7,
    marginBottom: 15,
  },

  countryCode: {
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },

  countryCodeText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "700",
  },

  phoneInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#111827",
  },

  contactButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  // ==================================================
  // ROLE
  // ==================================================

  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  roleOption: {
    minHeight: 47,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  roleOptionSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },

  roleRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  roleRadioSelected: {
    borderColor: "#2563eb",
  },

  roleRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },

  roleOptionText: {
    fontSize: 13,
    color: "#4b5563",
    fontWeight: "600",
  },

  roleOptionTextSelected: {
    color: "#2563eb",
    fontWeight: "800",
  },

  customRoleWrapper: {
    marginTop: 12,
  },

  // ==================================================
  // SETTINGS
  // ==================================================

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 2,
    marginTop: 1,
    marginBottom: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#eef2f7",
  },

  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  settingTextContainer: {
    flex: 1,
    marginLeft: 11,
  },

  settingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
  },

  settingSubtitle: {
    fontSize: 11,
    color: "#8a94a6",
    marginTop: 3,
  },

  // ==================================================
  // PAYMENT STATUS
  // ==================================================

  paymentStatusRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },

  paymentStatusCard: {
    flex: 1,
    minHeight: 78,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 13,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  paymentStatusCardPaid: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },

  paymentStatusCardDue: {
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
  },

  paymentIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },

  paymentIconPaid: {
    backgroundColor: "#dcfce7",
  },

  paymentIconDue: {
    backgroundColor: "#ffedd5",
  },

  paymentTextWrapper: {
    flex: 1,
    marginLeft: 8,
  },

  paymentTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
  },

  paymentTitlePaid: {
    color: "#15803d",
  },

  paymentTitleDue: {
    color: "#c2410c",
  },

  paymentSubtitle: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
  },

  // ==================================================
  // REMINDER
  // ==================================================

  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    marginBottom: 15,
  },

  reminderIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#ffedd5",
    justifyContent: "center",
    alignItems: "center",
  },

  reminderText: {
    flex: 1,
    marginLeft: 10,
  },

  reminderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#9a3412",
  },

  reminderSubtitle: {
    fontSize: 11,
    color: "#c2410c",
    marginTop: 3,
  },

  // ==================================================
  // DATE
  // ==================================================

  dateField: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    marginBottom: 15,
  },

  dateIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  dateTextWrapper: {
    flex: 1,
    marginLeft: 11,
  },

  dateValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },

  datePlaceholder: {
    fontSize: 14,
    color: "#9ca3af",
  },

  // ==================================================
  // ATTACHMENTS
  // ==================================================

  attachmentList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 10,
  },

  attachmentRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },

  attachmentRowLast: {
    borderBottomWidth: 0,
  },

  attachmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  attachmentName: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
    marginLeft: 9,
  },

  attachmentAction: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 9,
    backgroundColor: "#eff6ff",
    marginLeft: 5,
  },

  attachmentDeleteAction: {
    backgroundColor: "#fff1f2",
  },

  emptyAttachment: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fafcff",
    marginBottom: 10,
  },

  emptyAttachmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 9,
  },

  emptyAttachmentTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },

  emptyAttachmentSubtitle: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },

  attachButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  attachButtonText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "800",
    marginLeft: 6,
  },

  // ==================================================
  // NOTE
  // ==================================================

  noteContainer: {
    minHeight: 105,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fbfcfe",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
  },

  noteIcon: {
    marginTop: 2,
    marginRight: 9,
  },

  noteInput: {
    flex: 1,
    minHeight: 80,
    fontSize: 14,
    color: "#111827",
    padding: 0,
  },

  // ==================================================
  // ERROR
  // ==================================================

  errorCard: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 12,
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#b91c1c",
    fontWeight: "600",
    marginLeft: 8,
    lineHeight: 18,
  },

  // ==================================================
  // UPDATE
  // ==================================================

  updateButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
    shadowColor: "#2563eb",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 3,
  },

  updateButtonDisabled: {
    backgroundColor: "#93c5fd",
    shadowOpacity: 0,
  },

  updateButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 8,
  },

  deleteTextButton: {
    height: 48,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 7,
  },

  deleteTextButtonText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  // ==================================================
  // CONTACT MODAL
  // ==================================================

  contactModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
  },

  contactModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "88%",
    minHeight: "45%",
  },

  contactModalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 17,
  },

  contactModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  contactModalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },

  contactModalSubtitle: {
    fontSize: 11,
    color: "#8a94a6",
    marginTop: 3,
  },

  contactCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },

  contactSearchContainer: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#f4f6f9",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  contactSearchInput: {
    flex: 1,
    height: 46,
    fontSize: 14,
    color: "#111827",
    paddingHorizontal: 9,
  },

  clearSearchButton: {
    padding: 3,
  },

  contactListWrapper: {
    flex: 1,
    minHeight: 200,
  },

  contactListContainer: {
    flex: 1,
  },

  contactListContent: {
    paddingBottom: 8,
  },

  contactItem: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f2f5",
  },

  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  contactAvatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2563eb",
  },

  contactInfo: {
    flex: 1,
    marginHorizontal: 11,
  },

  contactName: {
    fontSize: 14,
    color: "#1f2937",
    fontWeight: "700",
  },

  contactPhone: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 3,
  },

  contactLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },

  contactLoadingIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#eaf2ff",
    justifyContent: "center",
    alignItems: "center",
  },

  contactLoadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 11,
    fontWeight: "600",
  },

  noContactsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 45,
    paddingHorizontal: 20,
  },

  noContactsIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  noContactsTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#374151",
  },

  noContactsText: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 5,
  },

  contactCancelButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },

  contactCancelButtonText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "800",
  },

  // ==================================================
  // DELETE MODAL
  // ==================================================

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    padding: 22,
  },

  confirmationModal: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
  },

  deleteWarningIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  confirmationTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },

  confirmationMessage: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 20,
    marginTop: 9,
  },

  confirmationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 23,
  },

  cancelButton: {
    minWidth: 90,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
  },

  cancelButtonText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700",
  },

  confirmDeleteButton: {
    minWidth: 105,
    height: 44,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 11,
  },

  confirmDeleteButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
}) as any;

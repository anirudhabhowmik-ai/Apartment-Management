import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
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
import { useMemberStore } from "../../store/memberStore";
import { ACCESS_ROLE_LABEL, AccountAccessRole } from "../../types/access";

type RecipientSource = "new" | "existing";

export default function GrantAccessScreen() {
  const router = useRouter();
  const { accountId, role } = useLocalSearchParams<{
    accountId: string;
    role: AccountAccessRole;
  }>();
  const { groups } = useGroups(accountId);
  const members = useMemberStore((state) => state.members);
  const addGrant = useAccessStore((state) => state.addGrant);
  const [source, setSource] = useState<RecipientSource>("new");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
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
  const apartmentOwners = eligibleMembers.filter((member) =>
    apartmentGroupIds.includes(member.groupId),
  );
  const staffMembers = eligibleMembers.filter((member) =>
    staffGroupIds.includes(member.groupId),
  );

  const handleSave = () => {
    const selectedMember = eligibleMembers.find(
      (member) => member.id === selectedMemberId,
    );
    const recipientName =
      source === "existing" ? (selectedMember?.name ?? "") : name.trim();

    // *** FIXED: Added ?? "" to prevent 'undefined' error ***
    const recipientPhone =
      source === "existing"
        ? (selectedMember?.phone ?? "")
        : `+91${phone.replace(/[^0-9]/g, "").slice(-10)}`;

    if (!recipientName || recipientPhone.length !== 13) {
      setError(
        source === "existing"
          ? "Select an apartment owner or staff member."
          : "Enter a valid 10-digit phone number.",
      );
      return;
    }

    addGrant({
      id: `access_${Date.now()}`,
      accountId,
      role: role || "member_visibility",
      name: recipientName,
      phone: recipientPhone,
      memberId: selectedMember?.id,
      createdAt: new Date().toISOString(),
    });
    router.back();
  };

  const title = ACCESS_ROLE_LABEL[role || "member_visibility"];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>Grant {title} access</Text>
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
            Owner or staff
          </Text>
        </TouchableOpacity>
      </View>

      {source === "new" ? (
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
          </View>
          {phone.length > 0 && phone.length !== 10 ? (
            <Text style={styles.phoneHint}>Enter all 10 digits</Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.label}>Select a person</Text>
          {eligibleMembers.length === 0 ? (
            <Text style={styles.emptyText}>
              No apartment owners or staff are available.
            </Text>
          ) : (
            <>
              <Text style={styles.groupHeading}>Apartment Owners</Text>
              {apartmentOwners.length === 0 ? (
                <Text style={styles.emptyText}>
                  No apartment owners are available.
                </Text>
              ) : (
                apartmentOwners.map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberOption,
                      selectedMemberId === member.id &&
                        styles.memberOptionSelected,
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
                    </View>
                    {selectedMemberId === member.id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#1a73e8"
                      />
                    )}
                  </TouchableOpacity>
                ))
              )}

              <Text style={styles.groupHeading}>Staff (optional)</Text>
              {staffMembers.length === 0 ? (
                <Text style={styles.emptyText}>
                  No staff members are available.
                </Text>
              ) : (
                staffMembers.map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberOption,
                      selectedMemberId === member.id &&
                        styles.memberOptionSelected,
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
                    </View>
                    {selectedMemberId === member.id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#1a73e8"
                      />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>Grant {title} Access</Text>
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
  phoneHint: { color: "#dc2626", fontSize: 12, marginTop: 5 },
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

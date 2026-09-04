import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAccounts } from "../hooks/useAccounts";
import { useAccountStore } from "../store/accountStore";
import { Account } from "../types";

const COLORS = {
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  background: "#F8FAFC",
  white: "#FFFFFF",

  text: "#0F172A",
  secondary: "#64748B",
  muted: "#94A3B8",

  border: "#E2E8F0",
  borderLight: "#F1F5F9",

  success: "#16A34A",
  successLight: "#F0FDF4",
};

export default function AccountSwitcher() {
  const router = useRouter();

  const { accounts, selectedAccount, selectAccount, editAccount } =
    useAccounts();

  const visible = useAccountStore((state) => state.isAccountSwitcherOpen);

  const setAccountSwitcherOpen = useAccountStore(
    (state) => state.setAccountSwitcherOpen,
  );

  const [editingNameId, setEditingNameId] = useState<string | null>(null);

  const [tempName, setTempName] = useState("");

  const handleSelect = (account: Account) => {
    if (editingNameId) return;

    selectAccount(account.id);
    setAccountSwitcherOpen(false);
  };

  const handleAddNew = () => {
    setAccountSwitcherOpen(false);
    router.push("/(modals)/add-account");
  };

  const handleChangePhoto = async (accountId: string) => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await editAccount(accountId, {
          photoUri: result.assets[0].uri,
        });
      }
    } catch (error) {
      console.error("Failed to change account photo:", error);
    }
  };

  const startEditName = (account: Account) => {
    setEditingNameId(account.id);
    setTempName(account.name);
  };

  const cancelEditName = () => {
    setEditingNameId(null);
    setTempName("");
  };

  const saveEditName = async (accountId: string) => {
    const trimmed = tempName.trim();

    if (trimmed) {
      try {
        await editAccount(accountId, {
          name: trimmed,
        });
      } catch (error) {
        console.error("Failed to update account name:", error);
      }
    }

    setEditingNameId(null);
    setTempName("");
  };

  const closeSwitcher = () => {
    cancelEditName();
    setAccountSwitcherOpen(false);
  };

  // ---------------------------------------------------------
  // Selected account information for header
  // ---------------------------------------------------------

  const selectedName = selectedAccount?.name ?? "No Account";

  const selectedType =
    selectedAccount?.type === "apartment"
      ? "Apartment"
      : selectedAccount
        ? "Home"
        : "No Account";

  const selectedIcon =
    selectedAccount?.type === "apartment" ? "business-outline" : "home-outline";

  return (
    <>
      {/* ===================================================== */}
      {/* HEADER ACCOUNT SWITCHER */}
      {/* ===================================================== */}

      <Pressable
        onPress={() => setAccountSwitcherOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.triggerPressed,
        ]}
      >
        {/* Property Avatar */}
        {selectedAccount?.photoUri ? (
          <Image
            source={{
              uri: selectedAccount.photoUri,
            }}
            style={styles.triggerAvatar}
          />
        ) : (
          <View style={styles.triggerAvatarPlaceholder}>
            <Ionicons
              name={selectedAccount?.type === "apartment" ? "business" : "home"}
              size={17}
              color={COLORS.primary}
            />
          </View>
        )}

        {/* Property Name + Type */}
        <View style={styles.triggerInfo}>
          <Text
            style={styles.triggerName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {selectedName}
          </Text>

          <View style={styles.triggerTypeRow}>
            <Ionicons name={selectedIcon} size={11} color={COLORS.secondary} />

            <Text style={styles.triggerType} numberOfLines={1}>
              {selectedType}
            </Text>
          </View>
        </View>

        {/* Dropdown */}
        <View style={styles.triggerChevron}>
          <Ionicons name="chevron-down" size={15} color={COLORS.secondary} />
        </View>
      </Pressable>

      {/* ===================================================== */}
      {/* ACCOUNT MODAL */}
      {/* ===================================================== */}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={closeSwitcher}
      >
        <View style={styles.modalContainer}>
          {/* Background Overlay */}
          <Pressable style={styles.overlay} onPress={closeSwitcher} />

          {/* Bottom Sheet */}
          <View style={styles.sheet}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Switch Account</Text>

                <Text style={styles.sheetSubtitle}>
                  Select a property to manage
                </Text>
              </View>

              <Pressable
                onPress={closeSwitcher}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
              >
                <Ionicons name="close" size={21} color={COLORS.text} />
              </Pressable>
            </View>

            {/* Account Count */}
            {accounts.length > 0 && (
              <View style={styles.accountCountRow}>
                <Text style={styles.accountCountLabel}>Your accounts</Text>

                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{accounts.length}</Text>
                </View>
              </View>
            )}

            {/* ================================================= */}
            {/* ACCOUNT LIST */}
            {/* ================================================= */}

            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={
                accounts.length === 0
                  ? styles.emptyListContent
                  : styles.listContent
              }
              renderItem={({ item }) => {
                const isSelected = item.id === selectedAccount?.id;

                const isEditingName = editingNameId === item.id;

                return (
                  <View
                    style={[
                      styles.accountCard,
                      isSelected && styles.accountCardSelected,
                    ]}
                  >
                    {/* Property Avatar */}
                    <View style={styles.avatarWrapper}>
                      <Pressable
                        onPress={() => handleSelect(item)}
                        style={({ pressed }) => [
                          pressed && styles.avatarPressed,
                        ]}
                      >
                        {item.photoUri ? (
                          <Image
                            source={{
                              uri: item.photoUri,
                            }}
                            style={styles.itemAvatar}
                          />
                        ) : (
                          <View style={styles.itemAvatarPlaceholder}>
                            <Ionicons
                              name={
                                item.type === "apartment" ? "business" : "home"
                              }
                              size={21}
                              color={COLORS.primary}
                            />
                          </View>
                        )}
                      </Pressable>

                      {/* Camera */}
                      <Pressable
                        onPress={() => handleChangePhoto(item.id)}
                        style={({ pressed }) => [
                          styles.cameraBadge,
                          pressed && styles.cameraBadgePressed,
                        ]}
                      >
                        <Ionicons
                          name="camera"
                          size={11}
                          color={COLORS.white}
                        />
                      </Pressable>
                    </View>

                    {/* Property Information */}
                    <View style={styles.accountDetails}>
                      {isEditingName ? (
                        <View style={styles.editContainer}>
                          <TextInput
                            style={styles.nameInput}
                            value={tempName}
                            onChangeText={setTempName}
                            autoFocus
                            selectTextOnFocus
                            returnKeyType="done"
                            onSubmitEditing={() => saveEditName(item.id)}
                            {...(Platform.OS === "web"
                              ? ({
                                  outlineStyle: "none",
                                } as any)
                              : {})}
                          />

                          <Pressable
                            onPress={() => saveEditName(item.id)}
                            style={({ pressed }) => [
                              styles.saveButton,
                              pressed && styles.saveButtonPressed,
                            ]}
                          >
                            <Ionicons
                              name="checkmark"
                              size={17}
                              color={COLORS.white}
                            />
                          </Pressable>

                          <Pressable
                            onPress={cancelEditName}
                            style={({ pressed }) => [
                              styles.cancelButton,
                              pressed && styles.cancelButtonPressed,
                            ]}
                          >
                            <Ionicons
                              name="close"
                              size={16}
                              color={COLORS.secondary}
                            />
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          {/* Name */}
                          <View style={styles.nameRow}>
                            <Pressable
                              onPress={() => handleSelect(item)}
                              style={styles.namePressable}
                            >
                              <Text style={styles.itemName} numberOfLines={1}>
                                {item.name}
                              </Text>
                            </Pressable>

                            {/* Edit */}
                            <Pressable
                              onPress={() => startEditName(item)}
                              style={({ pressed }) => [
                                styles.editButton,
                                pressed && styles.editButtonPressed,
                              ]}
                            >
                              <Ionicons
                                name="pencil-outline"
                                size={14}
                                color={COLORS.secondary}
                              />
                            </Pressable>
                          </View>

                          {/* Type */}
                          <Pressable
                            onPress={() => handleSelect(item)}
                            style={styles.typePressable}
                          >
                            <Ionicons
                              name={
                                item.type === "apartment"
                                  ? "business-outline"
                                  : "home-outline"
                              }
                              size={13}
                              color={COLORS.secondary}
                            />

                            <Text style={styles.itemType}>
                              {item.type === "apartment" ? "Apartment" : "Home"}
                            </Text>

                            {isSelected && (
                              <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>
                                  Current
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        </>
                      )}
                    </View>

                    {/* Radio */}
                    {!isEditingName && (
                      <Pressable
                        onPress={() => handleSelect(item)}
                        style={styles.selectionButton}
                      >
                        <View
                          style={[
                            styles.radioOuter,
                            isSelected && styles.radioOuterSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </Pressable>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="business-outline"
                      size={36}
                      color={COLORS.primary}
                    />
                  </View>

                  <Text style={styles.emptyTitle}>No accounts yet</Text>

                  <Text style={styles.emptySubtitle}>
                    Add your first apartment or home property to get started.
                  </Text>
                </View>
              }
            />

            {/* ================================================= */}
            {/* JOIN WITH NEW PROPERTY */}
            {/* ================================================= */}

            <Pressable
              onPress={handleAddNew}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.addButtonPressed,
              ]}
            >
              <View style={styles.addIconContainer}>
                <Ionicons name="add" size={21} color={COLORS.primary} />
              </View>

              <View style={styles.addTextContainer}>
                <Text style={styles.addButtonTitle}>
                  Join With New Property
                </Text>

                <Text style={styles.addButtonSubtitle}>
                  Create or join another property
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // =========================================================
  // Header Trigger
  // =========================================================

  trigger: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    maxWidth: 280,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
  },

  triggerPressed: {
    opacity: 0.7,
    backgroundColor: COLORS.background,
  },

  triggerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },

  triggerAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginRight: 8,
  },

  triggerInfo: {
    flexShrink: 1,
    minWidth: 0,
    marginRight: 5,
  },

  triggerName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.text,
  },

  triggerTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
    gap: 4,
  },

  triggerType: {
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.secondary,
  },

  triggerChevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },

  // =========================================================
  // Modal
  // =========================================================

  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },

  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "78%",
  },

  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: 17,
  },

  // =========================================================
  // Sheet Header
  // =========================================================

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  sheetHeaderText: {
    flex: 1,
  },

  sheetTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: COLORS.text,
  },

  sheetSubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 4,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginLeft: 12,
  },

  closeButtonPressed: {
    opacity: 0.6,
  },

  // =========================================================
  // Count
  // =========================================================

  accountCountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  accountCountLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  countBadge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginLeft: 7,
  },

  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },

  listContent: {
    paddingBottom: 8,
  },

  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  // =========================================================
  // Account Card
  // =========================================================

  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },

  accountCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },

  // =========================================================
  // Avatar
  // =========================================================

  avatarWrapper: {
    position: "relative",
    marginRight: 12,
  },

  itemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
  },

  itemAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
  },

  avatarPressed: {
    opacity: 0.7,
  },

  cameraBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  cameraBadgePressed: {
    opacity: 0.7,
  },

  // =========================================================
  // Account Details
  // =========================================================

  accountDetails: {
    flex: 1,
    minWidth: 0,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  namePressable: {
    flex: 1,
    minWidth: 0,
  },

  itemName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },

  editButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginLeft: 6,
  },

  editButtonPressed: {
    opacity: 0.6,
  },

  typePressable: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  itemType: {
    fontSize: 12,
    color: COLORS.secondary,
    marginLeft: 5,
  },

  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: COLORS.successLight,
    marginLeft: 8,
  },

  currentBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.success,
  },

  // =========================================================
  // Selection
  // =========================================================

  selectionButton: {
    width: 32,
    height: 48,
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 6,
  },

  radioOuter: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: COLORS.primary,
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },

  // =========================================================
  // Edit Name
  // =========================================================

  editContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 38,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },

  saveButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    marginLeft: 6,
  },

  saveButtonPressed: {
    opacity: 0.7,
  },

  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginLeft: 5,
  },

  cancelButtonPressed: {
    opacity: 0.6,
  },

  // =========================================================
  // Empty State
  // =========================================================

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingVertical: 30,
  },

  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 7,
  },

  emptySubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.secondary,
    textAlign: "center",
    maxWidth: 280,
  },

  // =========================================================
  // Join With New Property
  // =========================================================

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: COLORS.white,
    marginTop: 4,
  },

  addButtonPressed: {
    opacity: 0.7,
    backgroundColor: COLORS.primaryLight,
  },

  addIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginRight: 12,
  },

  addTextContainer: {
    flex: 1,
  },

  addButtonTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },

  addButtonSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 3,
  },
});

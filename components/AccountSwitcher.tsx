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
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../hooks/useAccounts";
import { useAccountStore } from "../store/accountStore";
import { Account } from "../types";

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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await editAccount(accountId, { photoUri: result.assets[0].uri });
    }
  };

  const startEditName = (account: Account) => {
    setEditingNameId(account.id);
    setTempName(account.name);
  };

  const saveEditName = async (accountId: string) => {
    const trimmed = tempName.trim();
    if (trimmed) {
      await editAccount(accountId, { name: trimmed });
    }
    setEditingNameId(null);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setAccountSwitcherOpen(true)}
      >
        {selectedAccount?.photoUri ? (
          <Image
            source={{ uri: selectedAccount.photoUri }}
            style={styles.triggerAvatar}
          />
        ) : (
          <View style={styles.triggerAvatarPlaceholder}>
            <Ionicons
              name={selectedAccount?.type === "apartment" ? "business" : "home"}
              size={16}
              color="#1a73e8"
            />
          </View>
        )}

        <View style={styles.triggerText}>
          <Text style={styles.name} numberOfLines={1}>
            {selectedAccount?.name ?? "No Account"}
          </Text>
          <View style={styles.typeContainer}>
            <Ionicons
              name={selectedAccount?.type === "apartment" ? "business" : "home"}
              size={12}
              color="#666"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.type}>
              {selectedAccount?.type === "apartment" ? "Apartment" : "Home"}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={18} color="#333" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditingNameId(null);
          setAccountSwitcherOpen(false);
        }}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => {
            setEditingNameId(null);
            setAccountSwitcherOpen(false);
          }}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Your Accounts</Text>

            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isEditingName = editingNameId === item.id;

                return (
                  <View
                    style={[
                      styles.item,
                      item.id === selectedAccount?.id && styles.itemSelected,
                    ]}
                  >
                    {/* Avatar with camera badge */}
                    <View style={styles.avatarWrapper}>
                      <TouchableOpacity
                        onPress={() => handleSelect(item)}
                        activeOpacity={0.8}
                      >
                        {item.photoUri ? (
                          <Image
                            source={{ uri: item.photoUri }}
                            style={styles.itemAvatar}
                          />
                        ) : (
                          <View style={styles.itemAvatarPlaceholder}>
                            <Ionicons
                              name={
                                item.type === "apartment" ? "business" : "home"
                              }
                              size={18}
                              color="#1a73e8"
                            />
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cameraBadge}
                        onPress={() => handleChangePhoto(item.id)}
                      >
                        <Ionicons name="camera" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {/* Name + type, or inline name editor */}
                    <View style={styles.nameSection}>
                      {isEditingName ? (
                        <View style={styles.nameEditRow}>
                          <TextInput
                            style={styles.nameInput}
                            value={tempName}
                            onChangeText={setTempName}
                            autoFocus
                            onSubmitEditing={() => saveEditName(item.id)}
                            onBlur={() => saveEditName(item.id)}
                          />
                          <TouchableOpacity
                            style={styles.inlineIconButton}
                            onPress={() => saveEditName(item.id)}
                          >
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#1a73e8"
                            />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.nameDisplayRow}
                          onPress={() => handleSelect(item)}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.nameLine}>
                              <Text style={styles.itemName}>{item.name}</Text>
                              <TouchableOpacity
                                style={styles.inlineIconButton}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  startEditName(item);
                                }}
                              >
                                <Ionicons
                                  name="pencil"
                                  size={13}
                                  color="#888"
                                />
                              </TouchableOpacity>
                            </View>
                            <Text style={styles.itemType}>
                              {item.type === "apartment" ? "Apartment" : "Home"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>

                    {item.id === selectedAccount?.id && !isEditingName && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#1a73e8"
                      />
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No accounts yet. Add one to get started.
                </Text>
              }
            />

            <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Join With New Property</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  triggerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  triggerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eaf1fd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  triggerText: { maxWidth: 150, marginRight: 4 },
  name: { fontSize: 15, fontWeight: "600", color: "#111" },
  typeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  type: { fontSize: 11, color: "#666" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  itemSelected: { backgroundColor: "#f0f6ff" },
  avatarWrapper: {
    position: "relative",
  },
  itemAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  itemAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eaf1fd",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  nameSection: {
    flex: 1,
    marginLeft: 12,
  },
  nameDisplayRow: {
    flex: 1,
  },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemName: { fontSize: 15, fontWeight: "600", color: "#111" },
  itemType: { fontSize: 12, color: "#888", marginTop: 2 },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    borderWidth: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: "#1a73e8",
    paddingVertical: 4,
    paddingHorizontal: 2,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  inlineIconButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: { textAlign: "center", color: "#999", paddingVertical: 24 },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 48,
    marginTop: 12,
    gap: 8,
  },
  addButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

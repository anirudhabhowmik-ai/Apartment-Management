import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useAccessStore } from "../../store/accessStore";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";
import { ACCESS_ROLE_LABEL } from "../../types/access";

export default function JoinAccountScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const grantAccountRole = useAuthStore((state) => state.grantAccountRole);
  const accounts = useAccountStore((state) => state.accounts);
  const selectAccount = useAccountStore((state) => state.selectAccount);
  const getPendingGrantsByPhone = useAccessStore(
    (state) => state.getPendingGrantsByPhone,
  );
  const acceptGrant = useAccessStore((state) => state.acceptGrant);
  const invitations = user ? getPendingGrantsByPhone(user.phone) : [];

  const handleJoin = (
    grantId: string,
    accountId: string,
    role: "admin" | "member_visibility",
  ) => {
    acceptGrant(grantId);
    grantAccountRole(accountId, role);
    selectAccount(accountId);
    router.replace("/(tabs)");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>You've been invited</Text>
      <Text style={styles.subtitle}>
        Choose how you want to join an apartment.
      </Text>
      {invitations.map((invitation) => {
        const account = accounts.find(
          (item) => item.id === invitation.accountId,
        );
        return (
          <View key={invitation.id} style={styles.card}>
            <View style={styles.icon}>
              <Ionicons
                name={
                  invitation.role === "admin" ? "shield-outline" : "eye-outline"
                }
                size={22}
                color="#1a73e8"
              />
            </View>
            <View style={styles.content}>
              <Text style={styles.accountName}>
                {account?.name || "Apartment"}
              </Text>
              <Text style={styles.role}>
                {ACCESS_ROLE_LABEL[invitation.role]}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() =>
                handleJoin(invitation.id, invitation.accountId, invitation.role)
              }
            >
              <Text style={styles.joinText}>
                Join as {invitation.role === "admin" ? "Admin" : "Member"}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.replace("/(modals)/add-account")}
      >
        <Text style={styles.secondaryText}>Create my own account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#f5f7fa", flexGrow: 1, padding: 20 },
  title: { color: "#111", fontSize: 21, fontWeight: "700", marginTop: 8 },
  subtitle: { color: "#666", fontSize: 14, marginBottom: 20, marginTop: 6 },
  card: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e1e7ef",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
  },
  icon: {
    alignItems: "center",
    backgroundColor: "#e8f0fe",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  content: { flex: 1 },
  accountName: { color: "#222", fontSize: 15, fontWeight: "700" },
  role: { color: "#1a73e8", fontSize: 12, fontWeight: "600", marginTop: 3 },
  joinButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  joinText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  secondaryButton: { alignItems: "center", paddingVertical: 14 },
  secondaryText: { color: "#1a73e8", fontSize: 14, fontWeight: "600" },
});

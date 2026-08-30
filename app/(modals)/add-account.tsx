import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts } from "../../hooks/useAccounts";
import { AccountType } from "../../types";

interface AccountTypeOption {
  type: AccountType;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  {
    type: "apartment",
    label: "Apartment",
    description: "Manage flats, owners, maintenance and servants",
    icon: "business",
  },
  {
    type: "home",
    label: "Home",
    description: "Track your own rent and electricity bills",
    icon: "home",
  },
];

export default function AddAccountScreen() {
  const router = useRouter();
  const { createAccount, accounts } = useAccounts();

  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setError("Please enter a name");
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Add Apartment or Home</Text>

      <View style={styles.optionsRow}>
        {ACCOUNT_TYPE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.type}
            style={[
              styles.optionCard,
              selectedType === option.type && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedType(option.type)}
          >
            <Ionicons
              name={option.icon}
              size={26}
              color={selectedType === option.type ? "#1a73e8" : "#555"}
            />
            <Text
              style={[
                styles.optionLabel,
                selectedType === option.type && styles.optionLabelSelected,
              ]}
            >
              {option.label}
            </Text>
            <Text style={styles.optionDescription}>{option.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.photoSection}>
        <TouchableOpacity style={styles.photoCircle} onPress={handlePickPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoImage} />
          ) : (
            <Ionicons name="camera-outline" size={26} color="#888" />
          )}
        </TouchableOpacity>
        <Text style={styles.photoLabel}>
          {photoUri ? "Change Photo" : "Add Photo (optional)"}
        </Text>
      </View>

      <Text style={styles.inputLabel}>
        {selectedType === "apartment" ? "Apartment Name" : "Home Name"}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={
          selectedType === "apartment"
            ? "e.g. Green Valley Apartments"
            : "e.g. My Home - Rajarhat"
        }
        value={name}
        onChangeText={setName}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.button}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Creating..." : "Create Account"}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 24, marginTop: 12 },
  optionsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  optionCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 14,
    padding: 16,
    alignItems: "flex-start",
  },
  optionCardSelected: {
    borderColor: "#1a73e8",
    backgroundColor: "#f0f6ff",
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    color: "#333",
  },
  optionLabelSelected: { color: "#1a73e8" },
  optionDescription: {
    fontSize: 12,
    color: "#777",
    marginTop: 4,
    lineHeight: 16,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  photoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f0f0f0",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  photoLabel: {
    fontSize: 12,
    color: "#1a73e8",
    fontWeight: "600",
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  error: { color: "#e53935", marginTop: 10, fontSize: 13 },
  button: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

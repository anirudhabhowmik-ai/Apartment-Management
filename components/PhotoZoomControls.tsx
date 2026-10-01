import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function PhotoZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  if (Platform.OS !== "web") return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityLabel="Zoom out"
        onPress={onZoomOut}
        style={styles.button}
        activeOpacity={0.75}
      >
        <Ionicons name="remove" size={18} color="#334155" />
      </TouchableOpacity>
      <Text style={styles.value}>{Math.round(zoom * 100)}%</Text>
      <TouchableOpacity
        accessibilityLabel="Zoom in"
        onPress={onZoomIn}
        style={styles.button}
        activeOpacity={0.75}
      >
        <Ionicons name="add" size={18} color="#334155" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  button: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  value: {
    minWidth: 48,
    textAlign: "center",
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
});

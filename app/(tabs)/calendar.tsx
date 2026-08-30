import { SafeAreaView, StyleSheet, Text } from "react-native";

export default function CalendarScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Calendar</Text>
      <Text style={styles.subtitle}>
        Maintenance and attendance calendar coming soon.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#666" },
});

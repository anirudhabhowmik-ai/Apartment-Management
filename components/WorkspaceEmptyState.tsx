import { Ionicons } from "@expo/vector-icons";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

const capabilities = [
  { icon: "people-outline" as const, label: "Residents and staff" },
  { icon: "receipt-outline" as const, label: "Bills and payments" },
  { icon: "calendar-outline" as const, label: "Attendance records" },
];

interface WorkspaceEmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function WorkspaceEmptyState({
  icon,
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: WorkspaceEmptyStateProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 520;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.panel, isCompact && styles.panelCompact]}>
        <View style={styles.intro}>
          <View style={[styles.iconTile, isCompact && styles.iconTileCompact]}>
            <Ionicons name={icon} size={24} color="#126B58" />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.introLabel}>APARTMENT MANAGEMENT</Text>
          </View>
        </View>

        <Text style={[styles.title, isCompact && styles.titleCompact]}>
          {title}
        </Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.capabilities}>
          {capabilities.map((item) => (
            <View key={item.label} style={styles.capability}>
              <Ionicons name={item.icon} size={17} color="#126B58" />
              <Text style={styles.capabilityLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [
              styles.action,
              isCompact && styles.actionCompact,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons name="add" size={19} color="#FFFFFF" />
            <Text style={styles.actionLabel}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F7F2" },
  screenContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  panel: {
    width: "100%",
    maxWidth: 740,
    padding: 32,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E5DC",
    borderRadius: 10,
  },
  panelCompact: { padding: 21 },
  intro: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 9,
    backgroundColor: "#E5F3ED",
    alignItems: "center",
    justifyContent: "center",
  },
  iconTileCompact: { width: 44, height: 44 },
  introCopy: { gap: 3 },
  eyebrow: { color: "#126B58", fontSize: 11, fontWeight: "700" },
  introLabel: { color: "#829087", fontSize: 9, fontWeight: "700" },
  title: {
    maxWidth: 570,
    marginTop: 26,
    color: "#17372E",
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "700",
  },
  titleCompact: { marginTop: 22, fontSize: 25, lineHeight: 31 },
  description: {
    maxWidth: 560,
    marginTop: 10,
    color: "#64746C",
    fontSize: 15,
    lineHeight: 23,
  },
  capabilities: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 23,
  },
  capability: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#E8ECE5",
    borderRadius: 7,
    backgroundColor: "#FAFBF8",
  },
  capabilityLabel: { color: "#345249", fontSize: 12, fontWeight: "600" },
  action: {
    minHeight: 48,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 25,
    paddingHorizontal: 18,
    borderRadius: 7,
    backgroundColor: "#126B58",
  },
  actionCompact: { alignSelf: "stretch" },
  actionPressed: { opacity: 0.84 },
  actionLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

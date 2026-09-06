import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
} from "react-native";
import { BillMemberType, useBillStore } from "../store/billStore";
import {
    downloadBill,
    OwnerBillIndividualData,
    StaffBillIndividualData,
} from "../utils/billGenerator";

// ---------------------------------------------------------------------------
// Drop this into the maintenance/management screen next to a flat marked
// "Paid" (owner) or a staff member's salary row (staff). It fetches the
// saved common template for that member type and merges it with the
// individual data you pass in.
//
// Usage:
//   <DownloadBillButton
//     memberType="owner"
//     individualData={{
//       ownerName: flat.ownerName,
//       flatNumber: flat.number,
//       monthLabel: "December 2024",
//       items: [{ label: "Maintenance Charges", amount: flat.dueAmount }],
//       paidOn: flat.paidOnDate,
//     }}
//   />
// ---------------------------------------------------------------------------

interface DownloadBillButtonProps {
  memberType: BillMemberType;
  individualData: OwnerBillIndividualData | StaffBillIndividualData;
  label?: string;
}

export default function DownloadBillButton({
  memberType,
  individualData,
  label,
}: DownloadBillButtonProps) {
  const { getBillConfig, getTemplateById } = useBillStore();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      const config = getBillConfig(memberType);
      if (!config) {
        Alert.alert(
          "Template Not Set Up",
          `Please set up the ${memberType === "owner" ? "owner bill" : "staff slip"} template first, from Bill Settings.`,
        );
        return;
      }
      const design = getTemplateById(config.templateId);
      if (!design) {
        Alert.alert("Error", "The saved template design could not be found.");
        return;
      }
      await downloadBill(memberType, design, config, individualData);
    } catch (err: any) {
      console.error("Bill download failed:", err);
      Alert.alert(
        "Couldn't Generate Bill",
        err?.message ?? "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <Ionicons name="download-outline" size={16} color="#fff" />
          <Text style={styles.buttonText}>{label ?? "Download Bill"}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
});

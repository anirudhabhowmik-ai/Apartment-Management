// app/(modals)/_layout.tsx
import { Stack } from "expo-router";
import { useThemeStore } from "../../store/themeStore";

// Local type documenting what each modal route expects as params —
// helps when navigating with router.push({ pathname, params })
export type ModalRouteParams = {
  "add-account": { mode?: string } | undefined;
  "add-member": {
    groupId: string;
    groupType: "apartment" | "staff" | "expense";
  };
  "edit-member": {
    memberId: string;
    groupId: string;
    groupType: "apartment" | "staff" | "expense";
  };
  "edit-profile": undefined;
  "mark-attendance": { memberId: string; accountId: string };
  "mark-payment": {
    accountId: string;
    paymentId?: string;
    memberId: string;
    type: "maintenance" | "salary";
    mode?: "edit";
  };
  "grant-access": {
    accountId: string;
    role: "admin" | "member_visibility" | "staff_visibility";
    memberType?: "owner" | "staff";
  };
  "account-profile": undefined;
};

export default function ModalsLayout() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <Stack
      screenOptions={{
        presentation: "modal",
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: isDarkMode ? "#151C27" : "#FFFFFF" },
        headerTintColor: isDarkMode ? "#E7EDF5" : "#0F172A",
        headerTitleStyle: { color: isDarkMode ? "#E7EDF5" : "#0F172A" },
        contentStyle: { backgroundColor: isDarkMode ? "#101720" : "#FFFFFF" },
      }}
    >
      <Stack.Screen name="add-account" options={{ title: "New Account" }} />
      <Stack.Screen name="add-member" options={{ title: "Add Member" }} />
      <Stack.Screen name="edit-member" options={{ title: "Edit Member" }} />
      <Stack.Screen name="edit-profile" options={{ title: "Edit Profile" }} />
      <Stack.Screen
        name="mark-attendance"
        options={{ title: "Mark Attendance" }}
      />
      <Stack.Screen name="mark-payment" options={{ title: "Mark as Paid" }} />
      <Stack.Screen name="grant-access" options={{ title: "Grant Access" }} />
      <Stack.Screen
        name="select-account"
        options={{ title: "Select Account" }}
      />
      <Stack.Screen
        name="account-profile"
        options={{ title: "Manage Account Profile" }}
      />
    </Stack>
  );
}

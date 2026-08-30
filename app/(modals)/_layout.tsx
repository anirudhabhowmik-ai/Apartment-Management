import { Stack } from "expo-router";

// Local type documenting what each modal route expects as params —
// helps when navigating with router.push({ pathname, params })
export type ModalRouteParams = {
  "add-account": undefined;
  "switch-account": undefined;
  "create-group": { accountId: string };
  "add-member": {
    groupId: string;
    groupType: "apartment" | "staff" | "expense";
  };
  "edit-member": {
    memberId: string;
    groupId: string;
    groupType: "apartment" | "staff" | "expense";
  };
  "edit-group": { groupId: string };
  "mark-attendance": { memberId: string; accountId: string };
  "record-payment": {
    accountId: string;
    category?: string;
    paymentId?: string;
    mode?: "edit" | "add";
  };
};

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{ presentation: "modal", headerTitleAlign: "center" }}
    >
      <Stack.Screen name="add-account" options={{ title: "New Account" }} />
      <Stack.Screen name="create-group" options={{ title: "Create Group" }} />
      <Stack.Screen name="add-member" options={{ title: "Add Member" }} />
      <Stack.Screen name="edit-member" options={{ title: "Edit Member" }} />
      <Stack.Screen name="edit-group" options={{ title: "Edit Group" }} />
      <Stack.Screen
        name="mark-attendance"
        options={{ title: "Mark Attendance" }}
      />
      <Stack.Screen
        name="record-payment"
        options={{ title: "Record Payment" }}
      />
      <Stack.Screen
        name="switch-account"
        options={{ title: "Switch Property" }}
      />
    </Stack>
  );
}

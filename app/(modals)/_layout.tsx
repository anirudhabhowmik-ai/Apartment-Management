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
  "mark-payment": {
    accountId: string;
    paymentId?: string;
    memberId: string;
    type: "maintenance" | "salary";
    mode?: "edit";
  };
  "edit-expense": { accountId: string; paymentId: string };
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
      <Stack.Screen name="mark-payment" options={{ title: "Mark as Paid" }} />
      <Stack.Screen name="edit-expense" options={{ title: "Edit Expenses" }} />
      <Stack.Screen
        name="switch-account"
        options={{ title: "Switch Property" }}
      />
    </Stack>
  );
}

import { useCallback, useEffect } from "react";
import { useGroupStore } from "../store/groupStore";
import { Group } from "../types/group";

// TODO: Replace with actual API calls
async function fetchGroups(accountId: string): Promise<Group[]> {
  return [
    {
      id: "g1",
      accountId,
      type: "apartment",
      name: "Tower A - Apartment Owners",
      expenseTypes: ["maintenance", "electricity", "water"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "g2",
      accountId,
      type: "staff",
      name: "Staff & Helpers",
      expenseTypes: ["salary", "bonus", "advance"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "g3",
      accountId,
      type: "expense",
      name: "Utility Expenses",
      expenseTypes: ["electricity", "water", "maintenance", "other"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

async function createGroupApi(
  group: Omit<Group, "id" | "createdAt" | "updatedAt">,
): Promise<Group> {
  const now = new Date().toISOString();

  const createdGroup: Group = {
    ...group,
    id: `group_${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  } as Group;

  return createdGroup;
}

export function useGroups(accountId?: string | null) {
  const {
    groups,
    isLoading,
    setGroups,
    addGroup,
    setIsLoading,
    getGroupsByAccount,
    getGroupById,
  } = useGroupStore();

  // Load groups
  useEffect(() => {
    if (!accountId) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchGroups(accountId);
        setGroups(data);
      } catch (error) {
        console.error("Error fetching groups:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [accountId]);

  // ✅ Create group
  const createGroup = useCallback(
    async (
      group: Omit<Group, "id" | "createdAt" | "updatedAt">,
    ): Promise<Group> => {
      try {
        setIsLoading(true);
        const newGroup = await createGroupApi(group);
        addGroup(newGroup);
        return newGroup;
      } catch (error) {
        console.error("Error creating group:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [addGroup, setIsLoading],
  );

  return {
    groups: accountId ? getGroupsByAccount(accountId) : [],
    isLoading,
    createGroup,
    getGroupById,
  };
}

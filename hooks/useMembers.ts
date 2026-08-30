import { useCallback, useEffect } from "react";
import { useMemberStore } from "../store/memberStore";
import {
    BillAttachment,
    FlatOwner,
    GroupType,
    Member,
    MemberRole,
    Staff,
} from "../types";

// TODO: replace with real backend calls (Supabase/Firebase table: members)
async function fetchMembersForGroup(groupId: string): Promise<Member[]> {
  // const { data } = await supabase.from('members').select('*').eq('groupId', groupId);
  // return data ?? [];
  return []; // placeholder
}

// Input shape the add-member form collects — kept separate from the
// stored Member type since fields differ by role (flat vs staff).
export interface AddMemberInput {
  groupId: string;
  groupType: GroupType;
  name: string;
  phone: string;
  role: MemberRole;
  photoUri?: string;
  // Flat-specific fields
  wing?: string;
  flatNumber?: string;
  areaSqft?: number;
  parkingAvailable?: boolean;
  maintenanceAmount?: number;
  maintenancePaid?: boolean;
  // Staff-specific fields
  monthlySalary?: number;
  // Expense-specific fields
  amount?: number;
  dueDate?: string;
  status?: "paid" | "due";
  reminderEnabled?: boolean;
  description?: string;
  billUri?: string;
  billName?: string;
  billAttachments?: BillAttachment[];
}

// Input shape for updating a member
export interface UpdateMemberInput {
  name?: string;
  phone?: string;
  role?: MemberRole;
  photoUri?: string;
  // Flat-specific fields
  wing?: string;
  flatNumber?: string;
  areaSqft?: number;
  parkingAvailable?: boolean;
  maintenanceAmount?: number;
  maintenancePaid?: boolean;
  // Staff-specific fields
  monthlySalary?: number;
  // Expense-specific fields
  amount?: number;
  dueDate?: string;
  status?: "paid" | "due";
  reminderEnabled?: boolean;
  description?: string;
  billUri?: string;
  billName?: string;
  billAttachments?: BillAttachment[];
}

async function createMemberApi(input: AddMemberInput): Promise<Member> {
  const now = new Date().toISOString();
  const base = {
    id: `mem_${Date.now()}`,
    groupId: input.groupId,
    name: input.name,
    phone: input.phone,
    photoUri: input.photoUri,
    createdAt: now,
    updatedAt: now,
  };

  if (input.groupType === "apartment") {
    // Validate required fields for flat
    if (!input.flatNumber) {
      throw new Error("Flat number is required");
    }
    if (!input.maintenanceAmount) {
      throw new Error("Maintenance amount is required");
    }

    return {
      ...base,
      role: input.role as FlatOwner["role"],
      wing: input.wing,
      flatNumber: input.flatNumber,
      areaSqft: input.areaSqft,
      parkingAvailable: input.parkingAvailable ?? false,
      maintenanceAmount: input.maintenanceAmount,
      maintenancePaid: input.maintenancePaid ?? false,
    } as FlatOwner;
  }

  if (input.groupType === "staff") {
    // Validate required fields for staff
    if (!input.monthlySalary) {
      throw new Error("Monthly salary is required");
    }

    return {
      ...base,
      role: input.role as Staff["role"],
      monthlySalary: input.monthlySalary,
    } as Staff;
  }

  if (input.groupType === "expense") {
    if (!input.amount) {
      throw new Error("Expense amount is required");
    }

    return {
      ...base,
      role: input.role as "electricity" | "water" | "maintenance" | "other",
      amount: input.amount,
      dueDate: input.dueDate,
      status: input.status ?? "paid",
      reminderEnabled: input.reminderEnabled ?? false,
      description: input.description,
      billUri: input.billUri,
      billName: input.billName,
      billAttachments: input.billAttachments,
    };
  }

  throw new Error("Invalid group type");
}

// TODO: Replace with real API call
async function updateMemberApi(
  id: string,
  input: UpdateMemberInput,
): Promise<Partial<Member>> {
  // const { data } = await supabase
  //   .from('members')
  //   .update(input)
  //   .eq('id', id)
  //   .select()
  //   .single();
  // return data;

  // Mock implementation for now
  return {
    ...input,
    updatedAt: new Date().toISOString(),
  };
}

// TODO: Replace with real API call
async function deleteMemberApi(id: string): Promise<void> {
  // await supabase.from('members').delete().eq('id', id);
  console.log("Deleting member:", id);
}

export function useMembers(groupId: string | null) {
  const {
    members,
    isLoading,
    setMembers,
    addMember,
    updateMember,
    removeMember,
    setIsLoading,
    getMembersByGroup,
  } = useMemberStore();

  // Load members
  useEffect(() => {
    if (!groupId) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchMembersForGroup(groupId);
        // Only update if we get actual data back from backend
        // This preserves locally added members when backend returns empty
        if (data && data.length > 0) {
          setMembers(data);
        }
      } catch (error) {
        console.error("Error fetching members:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [groupId, setMembers, setIsLoading]);

  // Add new member
  const addNewMember = useCallback(
    async (input: AddMemberInput) => {
      try {
        const newMember = await createMemberApi(input);
        addMember(newMember);
        return newMember;
      } catch (error) {
        console.error("Error adding member:", error);
        throw error;
      }
    },
    [addMember],
  );

  // Edit/Update member
  const editMember = useCallback(
    async (id: string, input: UpdateMemberInput) => {
      try {
        const updatedData = await updateMemberApi(id, input);
        // Update the member in the store
        updateMember(id, updatedData);
        // Return the updated member
        const updatedMember = getMembersByGroup(groupId || "").find(
          (m) => m.id === id,
        );
        return updatedMember;
      } catch (error) {
        console.error("Error updating member:", error);
        throw error;
      }
    },
    [updateMember, getMembersByGroup, groupId],
  );

  // Delete member
  const deleteMember = useCallback(
    async (id: string) => {
      try {
        await deleteMemberApi(id);
        removeMember(id);
      } catch (error) {
        console.error("Error deleting member:", error);
        throw error;
      }
    },
    [removeMember],
  );

  // Get a single member by ID
  const getMemberById = useCallback(
    (id: string) => {
      return members.find((m) => m.id === id);
    },
    [members],
  );

  return {
    members: groupId ? getMembersByGroup(groupId) : [],
    isLoading,
    addNewMember,
    editMember,
    deleteMember,
    getMemberById,
  };
}

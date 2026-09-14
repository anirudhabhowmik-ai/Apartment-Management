// hooks/useUserRole.ts

import { useMemo } from "react";
import { useAccessStore } from "../store/accessStore";
import { useMemberStore } from "../store/memberStore";
import { useAuthStore } from "../store/useAuthStore";
import { useAccounts } from "./useAccounts";
import { useGroups } from "./useGroups";

export type UserRole = "admin" | "staff" | "member";

// Staff role types
export type StaffRoleType =
  | "security"
  | "sweeper"
  | "maintenance"
  | "gardener"
  | "driver"
  | "cook"
  | "maid"
  | "other";

export interface StaffInfo {
  role: StaffRoleType;
  label: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  color: string;
}

export const STAFF_ROLE_INFO: Record<StaffRoleType, StaffInfo> = {
  security: {
    role: "security",
    label: "Security Guard",
    icon: "shield-checkmark",
    color: "#D97706",
  },
  sweeper: {
    role: "sweeper",
    label: "Sweeper / Cleaner",
    icon: "brush",
    color: "#059669",
  },
  maintenance: {
    role: "maintenance",
    label: "Maintenance Staff",
    icon: "construct",
    color: "#2563EB",
  },
  gardener: {
    role: "gardener",
    label: "Gardener",
    icon: "leaf",
    color: "#65A30D",
  },
  driver: {
    role: "driver",
    label: "Driver",
    icon: "car",
    color: "#7C3AED",
  },
  cook: {
    role: "cook",
    label: "Cook",
    icon: "restaurant",
    color: "#92400E",
  },
  maid: {
    role: "maid",
    label: "Maid",
    icon: "person",
    color: "#16A34A",
  },
  other: {
    role: "other",
    label: "Staff",
    icon: "briefcase",
    color: "#64748B",
  },
};

function isStaffMember(member: any): boolean {
  return member && typeof member.monthlySalary === "number";
}

function getStaffRoleType(member: any): StaffRoleType {
  if (!member || !member.role) return "other";

  const roleMap: Record<string, StaffRoleType> = {
    security: "security",
    sweeper: "sweeper",
    maintenance: "maintenance",
    gardener: "gardener",
    driver: "driver",
    cook: "cook",
    maid: "maid",
  };

  return roleMap[member.role.toLowerCase()] || "other";
}

export function useUserRole() {
  const { selectedAccount } = useAccounts();

  const { groups } = useGroups(selectedAccount?.id || null);

  const members = useMemberStore((state) => state.members);

  const user = useAuthStore((state) => state.user);

  const grants = useAccessStore((state) => state.grants);

  const getAccountRole = useAccessStore((state) => state.getAccountRole);

  // ------------------------------------------------------------
  // Get members belonging to the selected account
  // ------------------------------------------------------------
  const accountMembers = useMemo(() => {
    const accountGroupIds = new Set(groups.map((group) => group.id));

    return members.filter((member) => accountGroupIds.has(member.groupId));
  }, [groups, members]);

  // ------------------------------------------------------------
  // Find the logged-in user's member profile
  // Use PHONE, not NAME.
  // ------------------------------------------------------------
  const userMemberProfile = useMemo(() => {
    if (!selectedAccount || !user?.phone) {
      return null;
    }

    const normalizedUserPhone = user.phone.replace(/\D/g, "").slice(-10);

    const matchingMember = accountMembers.find((member) => {
      if (!member.phone) return false;

      const normalizedMemberPhone = member.phone.replace(/\D/g, "").slice(-10);

      return normalizedMemberPhone === normalizedUserPhone;
    });

    return matchingMember ?? null;
  }, [selectedAccount, user?.phone, accountMembers]);

  // ------------------------------------------------------------
  // Staff information
  // ------------------------------------------------------------
  const staffInfo = useMemo((): StaffInfo | null => {
    if (!userMemberProfile || !isStaffMember(userMemberProfile)) {
      return null;
    }

    const roleType = getStaffRoleType(userMemberProfile);

    return STAFF_ROLE_INFO[roleType] || STAFF_ROLE_INFO.other;
  }, [userMemberProfile]);

  // ------------------------------------------------------------
  // Determine user role
  // ------------------------------------------------------------
  const userRole = useMemo((): UserRole => {
    if (!selectedAccount || !user) {
      console.log("No selectedAccount or user, returning member as default");

      return "member";
    }

    console.log("selectedAccount.ownerId:", selectedAccount.ownerId);

    console.log("user.id:", user.id);

    console.log("Is user the owner?", selectedAccount.ownerId === user.id);

    // ============================================================
    // STEP 1: Check account role from useAccessStore
    // ============================================================

    const accountRole = getAccountRole(selectedAccount.id);

    console.log("accountRole from useAccessStore:", accountRole);

    if (accountRole) {
      console.log("Found accountRole:", accountRole);

      if (accountRole === "admin") {
        console.log("accountRole is admin → Returning admin");

        return "admin";
      }

      if (accountRole === "staff_visibility") {
        console.log("accountRole is staff_visibility → Returning staff");

        return "staff";
      }

      if (accountRole === "member_visibility") {
        // A staff member must remain staff even if the
        // account access grant is member_visibility.
        if (userMemberProfile && isStaffMember(userMemberProfile)) {
          console.log("User has staff profile → Returning staff");

          return "staff";
        }

        console.log("accountRole is member_visibility → Returning member");

        return "member";
      }
    }

    console.log("No accountRole found in useAccessStore");

    // ============================================================
    // STEP 2: Check accepted grants
    // ============================================================

    const userGrant = grants.find(
      (grant) => grant.accountId === selectedAccount.id && grant.acceptedAt,
    );

    console.log("userGrant from accessStore:", userGrant);

    console.log("userGrant?.role:", userGrant?.role);

    if (userGrant) {
      console.log("Grant found in accessStore!");

      if (userGrant.role === "admin") {
        console.log("Grant role is admin → Returning admin");

        return "admin";
      }

      if (userGrant.role === "staff_visibility") {
        console.log("Grant role is staff_visibility → Returning staff");

        return "staff";
      }

      if (userGrant.role === "member_visibility") {
        if (userMemberProfile && isStaffMember(userMemberProfile)) {
          console.log("User has staff profile → Returning staff");

          return "staff";
        }

        console.log("Grant role is member_visibility → Returning member");

        return "member";
      }
    }

    console.log("No grant found in accessStore");

    // ============================================================
    // STEP 3: Check account owner
    // ============================================================

    if (selectedAccount.ownerId === user.id) {
      console.log("User is the account owner → Returning admin");

      return "admin";
    }

    // ============================================================
    // STEP 4: Check member profile
    // ============================================================

    if (userMemberProfile) {
      if (isStaffMember(userMemberProfile)) {
        console.log("User is staff → Returning staff");

        return "staff";
      }

      console.log("User is member → Returning member");

      return "member";
    }

    // ============================================================
    // STEP 5: Default
    // ============================================================

    console.log("No role found, returning member as default");

    return "member";
  }, [selectedAccount, user, grants, getAccountRole, userMemberProfile]);

  return {
    userRole,
    userMemberProfile,
    selectedAccount,
    staffInfo,

    isStaff: userRole === "staff",

    isAdmin: userRole === "admin",

    isMember: userRole === "member",
  };
}

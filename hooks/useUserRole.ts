// hooks/useUserRole.ts

import { useMemo } from "react";
import { useAccessStore } from "../store/accessStore";
import { useAuthStore } from "../store/useAuthStore";
import { Member } from "../types";
import { useAccounts } from "./useAccounts";
import { useMembers, useStaff } from "./useManagement";

export type UserRole = "admin" | "staff" | "member";

// ---------------------------------------------------------------------------
// Staff role catalogue (unchanged)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

  return roleMap[String(member.role).toLowerCase()] || "other";
}

function normalizePhone(raw?: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useUserRole() {
  const { selectedAccount } = useAccounts();

  const user = useAuthStore((state) => state.user);

  const grants = useAccessStore((state) => state.grants);
  const getAccountRole = useAccessStore((state) => state.getAccountRole);

  const accountId = selectedAccount?.id ?? null;

  const membersHook = useMembers(accountId);
  const staffHook = useStaff(accountId);

  // -------------------------------------------------------------------------
  // Is this user the ORIGINAL account creator?
  // accounts.created_by is set at creation and never changes.
  // -------------------------------------------------------------------------
  const isAccountCreator = useMemo(() => {
    if (!selectedAccount || !user) return false;
    return selectedAccount.ownerId === user.id;
  }, [selectedAccount, user]);

  // -------------------------------------------------------------------------
  // Does this user hold an accepted "owner" grant?
  // Set via "Add Ownership" → role: "owner" in account_members.
  // -------------------------------------------------------------------------
  const hasOwnerGrant = useMemo(() => {
    if (!selectedAccount || !user) return false;

    const accountRole = getAccountRole(selectedAccount.id);
    if (accountRole === "owner") return true;

    const grant = grants.find(
      (g) => g.accountId === selectedAccount.id && g.acceptedAt,
    );
    return grant?.role === "owner";
  }, [selectedAccount, user, grants, getAccountRole]);

  const isOwner = isAccountCreator || hasOwnerGrant;

  // -------------------------------------------------------------------------
  // User's member/staff profile
  // -------------------------------------------------------------------------
  const userMemberProfile = useMemo<Member | null>(() => {
    if (!selectedAccount || !user?.phone) return null;

    const target = normalizePhone(user.phone);
    if (!target) return null;

    const matchesPhone = (m: Member) => normalizePhone(m.phone) === target;

    const asMember = membersHook.items.find(matchesPhone);
    if (asMember) return asMember;

    const asStaff = staffHook.items.find(matchesPhone);
    if (asStaff) return asStaff;

    return null;
  }, [selectedAccount, user?.phone, membersHook.items, staffHook.items]);

  const isStaffProfile = useMemo(() => {
    if (!userMemberProfile) return false;
    return staffHook.items.some((s) => s.id === userMemberProfile.id);
  }, [userMemberProfile, staffHook.items]);

  // -------------------------------------------------------------------------
  // Staff info (UI badges)
  // -------------------------------------------------------------------------
  const staffInfo = useMemo((): StaffInfo | null => {
    if (!userMemberProfile || !isStaffProfile) return null;

    const roleType = getStaffRoleType(userMemberProfile);
    return STAFF_ROLE_INFO[roleType] || STAFF_ROLE_INFO.other;
  }, [userMemberProfile, isStaffProfile]);

  // -------------------------------------------------------------------------
  // Determine coarse role (admin | staff | member)
  // -------------------------------------------------------------------------
  const userRole = useMemo((): UserRole => {
    if (!selectedAccount || !user) return "member";

    // Owner beats everything.
    if (isOwner) return "admin"; // still surfaces as "admin" so existing checks keep working

    // ---- Access store ----
    const accountRole = getAccountRole(selectedAccount.id);

    if (accountRole === "admin") return "admin";
    if (accountRole === "staff_visibility") return "staff";
    if (accountRole === "member_visibility") {
      return isStaffProfile ? "staff" : "member";
    }

    // ---- Accepted grant ----
    const grant = grants.find(
      (g) => g.accountId === selectedAccount.id && g.acceptedAt,
    );

    if (grant) {
      if (grant.role === "admin") return "admin";
      if (grant.role === "staff_visibility") return "staff";
      if (grant.role === "member_visibility") {
        return isStaffProfile ? "staff" : "member";
      }
    }

    // ---- Profile ----
    if (userMemberProfile) {
      return isStaffProfile ? "staff" : "member";
    }

    return "member";
  }, [
    selectedAccount,
    user,
    isOwner,
    grants,
    getAccountRole,
    userMemberProfile,
    isStaffProfile,
  ]);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  return {
    // coarse role for existing checks
    userRole,
    isAdmin: userRole === "admin",
    isStaff: userRole === "staff",
    isMember: userRole === "member",

    // fine-grained owner flag for menu-item gating
    isOwner,
    isAccountCreator,
    hasOwnerGrant,

    // supporting data
    userMemberProfile,
    selectedAccount,
    staffInfo,
  };
}

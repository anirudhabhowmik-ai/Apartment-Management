// app/(modals)/grant-access.tsx
import { Ionicons } from "@expo/vector-icons";
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  requestPermissionsAsync,
} from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  closeNameConflict,
  confirmNameConflict,
  setNameConflictBusy,
} from "../../components/NameConflictAlert";
import { useMembers, useStaff } from "../../hooks/useManagement";
import { useAccountStore } from "../../store/accountStore";
import { useAuthStore } from "../../store/useAuthStore";
import { ACCESS_ROLE_LABEL } from "../../types";

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(
  /\/api\/?$/,
  "",
);

type RecipientSource = "new" | "existing";
type MemberType = "owner" | "ownership" | "staff";

type InvitationRole =
  | "admin"
  | "member_visibility"
  | "staff_visibility"
  | "ownership_transfer";

type AccessRoleKey =
  | "owner"
  | "admin"
  | "member_visibility"
  | "staff_visibility";

interface ContactData {
  id: string;
  name: string;
  phoneNumbers: { number: string; label?: string }[];
}

type PreflightKind =
  | "ok"
  | "self"
  | "already_admin"
  | "already_member"
  | "already_staff"
  | "pending"
  | "member_to_admin";

interface PreflightResponse {
  kind: PreflightKind;
  message?: string;
  memberId?: string;
  memberName?: string;
}

type PreflightResult =
  | { ok: true; data: PreflightResponse }
  | { ok: false; message: string };

type InvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "revoked"
  | "cancelled";

interface ApiInvitation {
  id: string;
  account_id: string;
  invited_phone: string;
  role: InvitationRole;
  status: InvitationStatus;
  invited_name?: string | null;
}

type PhoneMatchSource =
  | ""
  | "owner"
  | "admin"
  | "pending_admin"
  | "pending_ownership"
  | "pending_member"
  | "pending_staff"
  | "member"
  | "staff"
  | "both";

const ROLE_RANK: Record<InvitationRole, number> = {
  member_visibility: 1,
  staff_visibility: 1,
  admin: 2,
  ownership_transfer: 3,
};

const roleLabelLower = (r: InvitationRole | null): string => {
  if (r === "ownership_transfer") return "ownership transfer";
  if (r === "admin") return "admin invitation";
  if (r === "staff_visibility") return "staff invitation";
  if (r === "member_visibility") return "member invitation";
  return "invitation";
};

const normalizePhone = (raw?: string | null): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const isActiveRow = (row: any): boolean => {
  const s = String(row?.status ?? "").toLowerCase();
  return s === "" || s === "active";
};

const getRowPhotoUrl = (row: any): string | null => {
  if (!row) return null;
  const candidates = [
    row.photoUri,
    row.photo_url,
    row.photoUrl,
    row.user_photo_url,
    row.userPhotoUrl,
    row.user?.photo_url,
    row.user?.photoUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
  }
  return null;
};

type FeedbackTone = "success" | "warning" | "error" | "info";

interface FeedbackState {
  visible: boolean;
  tone: FeedbackTone;
  title: string;
  message: string;
  primaryLabel: string;
  primaryTone?: "primary" | "danger";
  onPrimaryPress?: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

const EMPTY_FEEDBACK: FeedbackState = {
  visible: false,
  tone: "info",
  title: "",
  message: "",
  primaryLabel: "OK",
};

const FEEDBACK_TONE_META: Record<
  FeedbackTone,
  {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBg: string;
  }
> = {
  success: {
    icon: "checkmark-circle",
    iconColor: "#16A34A",
    iconBg: "#DCFCE7",
  },
  warning: {
    icon: "alert-circle",
    iconColor: "#D97706",
    iconBg: "#FEF3C7",
  },
  error: {
    icon: "close-circle",
    iconColor: "#DC2626",
    iconBg: "#FEE2E2",
  },
  info: {
    icon: "information-circle",
    iconColor: "#2563EB",
    iconBg: "#DBEAFE",
  },
};

interface GroupedPerson {
  id: string;
  userId: string | null;
  phone: string;
  name: string;
  photoUri: string | null;
  memberIds: string[];
  memberSummary: string;
  staffIds: string[];
  staffSummary: string;
}

function summarizeMemberUnits(rows: any[]): string {
  const units: string[] = [];
  for (const r of rows) {
    const wing = (r?.wing ?? "").toString().trim();
    const apt = (r?.apartmentNumber ?? r?.flatNumber ?? "").toString().trim();
    const parts: string[] = [];
    if (wing) parts.push(`Wing ${wing}`);
    if (apt) parts.push(`${apt}`);
    const unit = parts.join(" ");
    if (unit && !units.includes(unit)) units.push(unit);
  }
  return units.join("  •  ");
}

function summarizeStaffRoles(rows: any[]): string {
  const roles: string[] = [];
  for (const r of rows) {
    const role = String(r?.role ?? "").trim();
    if (!role) continue;
    const pretty = role.charAt(0).toUpperCase() + role.slice(1);
    if (!roles.includes(pretty)) roles.push(pretty);
  }
  return roles.join("  •  ");
}

function groupMembersByPerson(rows: any[]): GroupedPerson[] {
  const byKey = new Map<string, GroupedPerson>();

  for (const r of rows) {
    const ten = normalizePhone(r?.phone);
    if (!ten) continue;

    const key = r?.userId ? `u:${r.userId}` : `p:${ten}`;
    const existing = byKey.get(key);

    if (existing) {
      if (!existing.memberIds.includes(r.id)) existing.memberIds.push(r.id);
      continue;
    }

    byKey.set(key, {
      id: key,
      userId: r?.userId ?? null,
      phone: ten,
      name: r?.name ?? "",
      photoUri: getRowPhotoUrl(r),
      memberIds: [r.id],
      memberSummary: "",
      staffIds: [],
      staffSummary: "",
    });
  }

  const grouped = Array.from(byKey.values());
  for (const person of grouped) {
    const rowsForPerson = rows.filter((r) => {
      const ten = normalizePhone(r?.phone);
      if (!ten || ten !== person.phone) return false;
      if (person.userId) return r?.userId === person.userId;
      return !r?.userId;
    });
    person.memberSummary = summarizeMemberUnits(rowsForPerson);
  }
  return grouped;
}

function groupStaffByPerson(rows: any[]): GroupedPerson[] {
  const byKey = new Map<string, GroupedPerson>();

  for (const r of rows) {
    const ten = normalizePhone(r?.phone);
    if (!ten) continue;

    const key = r?.userId ? `u:${r.userId}` : `p:${ten}`;
    const existing = byKey.get(key);

    if (existing) {
      if (!existing.staffIds.includes(r.id)) existing.staffIds.push(r.id);
      continue;
    }

    byKey.set(key, {
      id: key,
      userId: r?.userId ?? null,
      phone: ten,
      name: r?.name ?? "",
      photoUri: getRowPhotoUrl(r),
      memberIds: [],
      memberSummary: "",
      staffIds: [r.id],
      staffSummary: "",
    });
  }

  const grouped = Array.from(byKey.values());
  for (const person of grouped) {
    const rowsForPerson = rows.filter((r) => {
      const ten = normalizePhone(r?.phone);
      if (!ten || ten !== person.phone) return false;
      if (person.userId) return r?.userId === person.userId;
      return !r?.userId;
    });
    person.staffSummary = summarizeStaffRoles(rowsForPerson);
  }
  return grouped;
}

// ============================================================================
// Toggle Switch
// ============================================================================

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  trackColorOn?: string;
  trackColorOff?: string;
  thumbColor?: string;
}

function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  trackColorOn = "#2563EB",
  trackColorOff = "#CBD5E1",
  thumbColor = "#FFFFFF",
}: ToggleSwitchProps) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: trackColorOff, true: trackColorOn }}
      thumbColor={thumbColor}
      ios_backgroundColor={trackColorOff}
    />
  );
}

interface AdminRecord {
  user_id: string;
  name: string;
  phone: string;
  photo_url: string | null;
}

// ============================================================================
// Visibility tab key (only used when visibilityTabs=true)
// ============================================================================

type VisibilityTab = "member" | "staff";

export default function GrantAccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const currentUser = useAuthStore((state) => state.user);

  const {
    accountId,
    role: roleParamRaw,
    memberType,
    visibilityTabs: visibilityTabsRaw,
  } = useLocalSearchParams<{
    accountId: string;
    role: string;
    memberType?: MemberType;
    visibilityTabs?: string;
  }>();

  // When this is true, we render BOTH member & staff visibility in one
  // screen behind a tab bar. Only set from the "Manage Visibility" entry.
  const showVisibilityTabs = visibilityTabsRaw === "true";

  const role: InvitationRole =
    (roleParamRaw as InvitationRole | undefined) ?? "member_visibility";

  const roleSafe: InvitationRole = role;

  const getRole = (): InvitationRole => roleSafe;

  const accessKey: AccessRoleKey =
    getRole() === "admin"
      ? "admin"
      : getRole() === "staff_visibility"
        ? "staff_visibility"
        : "member_visibility";

  const accounts = useAccountStore((state) => state.accounts);
  const account = accounts.find((a) => a.id === accountId);

  const {
    items: rawApartmentMembers,
    renameByPhone: renameMemberByPhone,
    isLoading: membersLoading,
  } = useMembers(accountId ?? null);

  const {
    items: rawStaffList,
    renameByPhone: renameStaffByPhone,
    isLoading: staffLoading,
  } = useStaff(accountId ?? null);

  // Local tab state for the tabbed visibility mode
  const [visibilityTab, setVisibilityTab] = useState<VisibilityTab>("member");

  const [source, setSource] = useState<RecipientSource>("new");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<ContactData[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const [blockedOwnerPhones, setBlockedOwnerPhones] = useState<Set<string>>(
    new Set(),
  );
  const [blockedAdminPhones, setBlockedAdminPhones] = useState<Set<string>>(
    new Set(),
  );
  const [blockedMemberPhones, setBlockedMemberPhones] = useState<Set<string>>(
    new Set(),
  );
  const [blockedStaffPhones, setBlockedStaffPhones] = useState<Set<string>>(
    new Set(),
  );
  const [pendingAdminPhones, setPendingAdminPhones] = useState<Set<string>>(
    new Set(),
  );
  const [pendingOwnershipPhones, setPendingOwnershipPhones] = useState<
    Set<string>
  >(new Set());
  const [pendingMemberPhones, setPendingMemberPhones] = useState<Set<string>>(
    new Set(),
  );
  const [pendingStaffPhones, setPendingStaffPhones] = useState<Set<string>>(
    new Set(),
  );

  const [adminRecords, setAdminRecords] = useState<AdminRecord[]>([]);

  const [invitationsReady, setInvitationsReady] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackState>(EMPTY_FEEDBACK);

  const [keepAdmin, setKeepAdmin] = useState(true);
  const [keepMember, setKeepMember] = useState(true);
  const [keepStaff, setKeepStaff] = useState(true);

  const showFeedback = (next: Omit<FeedbackState, "visible">) => {
    setFeedback({ ...next, visible: true });
  };

  const closeFeedback = () => {
    setFeedback((cur) => ({ ...cur, visible: false }));
  };

  const runFeedbackPrimary = () => {
    const cb = feedback.onPrimaryPress;
    closeFeedback();
    if (cb) cb();
  };

  const runFeedbackSecondary = () => {
    const cb = feedback.onSecondaryPress;
    closeFeedback();
    if (cb) cb();
  };

  const listsReady = !membersLoading && !staffLoading;
  const pageReady = listsReady && invitationsReady;

  const isOwnershipFlow =
    memberType === "ownership" || getRole() === "ownership_transfer";

  // staff-only when the caller explicitly requested staff flow (and not tabs)
  const isStaffFlow =
    !showVisibilityTabs &&
    !isOwnershipFlow &&
    (memberType === "staff" || getRole() === "staff_visibility");

  // member-visibility flow (either standalone or default)
  const isVisibilityFlow =
    !showVisibilityTabs &&
    !isOwnershipFlow &&
    !isStaffFlow &&
    (memberType === "owner" || getRole() === "member_visibility");

  // When tabs are enabled, we treat the screen as "both" flows
  const isTabbedVisibility = showVisibilityTabs;

  const visibilityTitle = isStaffFlow
    ? "Manage Staff Visibility"
    : "Manage Apartment Owner Visibility";

  const title = isOwnershipFlow
    ? "Ownership"
    : isStaffFlow
      ? ACCESS_ROLE_LABEL["staff_visibility"]
      : ACCESS_ROLE_LABEL[accessKey];

  const introTitle = isTabbedVisibility
    ? "Manage Visibility"
    : isStaffFlow
      ? visibilityTitle
      : isVisibilityFlow
        ? visibilityTitle
        : isOwnershipFlow
          ? "Transfer account ownership"
          : `Grant ${title} access`;

  const introDescription = isTabbedVisibility
    ? "Grant apartment owners and staff visibility access to this property. Switch tabs to choose who can see what."
    : isStaffFlow
      ? "Select one or more staff members to grant visibility access."
      : isVisibilityFlow
        ? "Select one or more apartment owners to grant visibility access."
        : isOwnershipFlow
          ? "Transfer full ownership of this account to another person. They will become the new owner after accepting."
          : "Choose who should receive access to this account.";

  const introIcon: keyof typeof Ionicons.glyphMap = isTabbedVisibility
    ? "eye-outline"
    : isStaffFlow
      ? "briefcase-outline"
      : isVisibilityFlow
        ? "person-add-outline"
        : isOwnershipFlow
          ? "swap-horizontal-outline"
          : "shield-checkmark-outline";

  const saveLabel = isTabbedVisibility
    ? visibilityTab === "member"
      ? "Grant Member Visibility"
      : "Grant Staff Visibility"
    : isStaffFlow
      ? `Grant ${visibilityTitle.replace("Manage ", "")}`
      : isVisibilityFlow
        ? `Grant ${visibilityTitle.replace("Manage ", "")}`
        : isOwnershipFlow
          ? "Transfer account ownership"
          : `Grant ${title} Access`;

  const apartmentRowsActive = useMemo(
    () => rawApartmentMembers.filter(isActiveRow),
    [rawApartmentMembers],
  );

  const staffRowsActive = useMemo(
    () => rawStaffList.filter(isActiveRow),
    [rawStaffList],
  );

  const apartmentPeople = useMemo(
    () => groupMembersByPerson(apartmentRowsActive),
    [apartmentRowsActive],
  );

  const staffPeople = useMemo(
    () => groupStaffByPerson(staffRowsActive),
    [staffRowsActive],
  );

  useEffect(() => {
    let cancelled = false;

    if (!accountId) {
      setInvitationsReady(true);
      return;
    }

    setInvitationsReady(false);

    (async () => {
      try {
        const token = await SecureStore.getItemAsync("auth_token");
        if (!token) {
          if (!cancelled) setInvitationsReady(true);
          return;
        }
        const res = await fetch(
          `${API_URL}/api/accounts/${accountId}/invitations`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          if (!cancelled) setInvitationsReady(true);
          return;
        }
        const data = await res.json();
        const rows: ApiInvitation[] = data?.invitations ?? [];

        const rawOwner: string[] = Array.isArray(data?.owner_phones)
          ? data.owner_phones
          : [];
        const rawAdmin: string[] = Array.isArray(data?.admin_phones)
          ? data.admin_phones
          : Array.isArray(data?.excluded_phones)
            ? data.excluded_phones
            : [];

        const ownerSet = new Set<string>();
        for (const p of rawOwner) {
          const ten = normalizePhone(p);
          if (ten) ownerSet.add(ten);
        }

        const adminSet = new Set<string>();
        for (const p of rawAdmin) {
          const ten = normalizePhone(p);
          if (ten) adminSet.add(ten);
        }

        const memberSet = new Set<string>();
        const staffSet = new Set<string>();

        const pendAdmin = new Set<string>();
        const pendOwnership = new Set<string>();
        const pendMember = new Set<string>();
        const pendStaff = new Set<string>();

        for (const inv of rows) {
          const ten = normalizePhone(inv.invited_phone);
          if (!ten) continue;

          if (inv.status === "accepted") {
            if (inv.role === "member_visibility") memberSet.add(ten);
            else if (inv.role === "staff_visibility") staffSet.add(ten);
            continue;
          }

          if (inv.status !== "pending") continue;

          if (inv.role === "admin") pendAdmin.add(ten);
          else if (inv.role === "ownership_transfer") pendOwnership.add(ten);
          else if (inv.role === "member_visibility") pendMember.add(ten);
          else if (inv.role === "staff_visibility") pendStaff.add(ten);
        }

        const rawAdminRecords: any[] = Array.isArray(data?.admins)
          ? data.admins
          : [];
        const adminRecs: AdminRecord[] = rawAdminRecords
          .map((r: any) => ({
            user_id: String(r?.user_id ?? ""),
            name: String(r?.name ?? ""),
            phone: normalizePhone(r?.phone),
            photo_url:
              typeof r?.photo_url === "string" && r.photo_url.length > 0
                ? r.photo_url
                : null,
          }))
          .filter((r) => r.user_id && r.phone.length === 10);

        if (!cancelled) {
          setBlockedOwnerPhones(ownerSet);
          setBlockedAdminPhones(adminSet);
          setBlockedMemberPhones(memberSet);
          setBlockedStaffPhones(staffSet);
          setPendingAdminPhones(pendAdmin);
          setPendingOwnershipPhones(pendOwnership);
          setPendingMemberPhones(pendMember);
          setPendingStaffPhones(pendStaff);
          setAdminRecords(adminRecs);
        }
      } catch (e) {
        console.warn("[grant-access] invitation load failed:", e);
      } finally {
        if (!cancelled) setInvitationsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const visibilityCandidates = useMemo(() => {
    if (!invitationsReady) return [];
    if (!isVisibilityFlow && !isTabbedVisibility) return apartmentPeople;
    return apartmentPeople.filter((p) => {
      if (!p.phone) return false;
      if (blockedMemberPhones.has(p.phone)) return false;
      if (blockedOwnerPhones.has(p.phone)) return false;
      if (blockedAdminPhones.has(p.phone)) return false;
      if (pendingMemberPhones.has(p.phone)) return false;
      return true;
    });
  }, [
    invitationsReady,
    apartmentPeople,
    blockedMemberPhones,
    blockedOwnerPhones,
    blockedAdminPhones,
    pendingMemberPhones,
    isVisibilityFlow,
    isTabbedVisibility,
  ]);

  const adminCandidates = useMemo(() => {
    if (!invitationsReady) return [];
    return apartmentPeople.filter((p) => {
      if (!p.phone) return false;
      if (blockedOwnerPhones.has(p.phone)) return false;
      if (blockedAdminPhones.has(p.phone)) return false;
      if (pendingAdminPhones.has(p.phone)) return false;
      return true;
    });
  }, [
    invitationsReady,
    apartmentPeople,
    blockedOwnerPhones,
    blockedAdminPhones,
    pendingAdminPhones,
  ]);

  const ownershipCandidates = useMemo(() => {
    if (!invitationsReady) return [];

    const memberUserIds = new Set(
      apartmentPeople.map((p) => p.userId).filter(Boolean) as string[],
    );
    const memberPhones = new Set(apartmentPeople.map((p) => p.phone));

    const adminOnlyCandidates: GroupedPerson[] = adminRecords
      .filter((a) => !memberUserIds.has(a.user_id))
      .filter((a) => !memberPhones.has(a.phone))
      .map((a) => ({
        id: `u:${a.user_id}`,
        userId: a.user_id,
        phone: a.phone,
        name: a.name || "Admin",
        photoUri: a.photo_url,
        memberIds: [],
        memberSummary: "",
        staffIds: [],
        staffSummary: "",
      }));

    return [...apartmentPeople, ...adminOnlyCandidates].filter((p) => {
      if (!p.phone) return false;
      if (blockedOwnerPhones.has(p.phone)) return false;
      if (pendingOwnershipPhones.has(p.phone)) return false;
      return true;
    });
  }, [
    invitationsReady,
    apartmentPeople,
    adminRecords,
    blockedOwnerPhones,
    pendingOwnershipPhones,
  ]);

  const activeMembers = useMemo(() => {
    if (isVisibilityFlow) return visibilityCandidates;
    if (isOwnershipFlow) return ownershipCandidates;
    if (!isVisibilityFlow && !isStaffFlow && !isTabbedVisibility)
      return adminCandidates;
    return apartmentPeople;
  }, [
    isVisibilityFlow,
    isOwnershipFlow,
    isStaffFlow,
    isTabbedVisibility,
    visibilityCandidates,
    ownershipCandidates,
    adminCandidates,
    apartmentPeople,
  ]);

  const staffCandidates = useMemo(() => {
    if (!invitationsReady) return [];
    if (!isStaffFlow && !isTabbedVisibility) return staffPeople;
    return staffPeople.filter((p) => {
      if (!p.phone) return false;
      if (blockedStaffPhones.has(p.phone)) return false;
      if (blockedOwnerPhones.has(p.phone)) return false;
      if (blockedAdminPhones.has(p.phone)) return false;
      if (pendingStaffPhones.has(p.phone)) return false;
      return true;
    });
  }, [
    invitationsReady,
    staffPeople,
    blockedStaffPhones,
    blockedOwnerPhones,
    blockedAdminPhones,
    pendingStaffPhones,
    isStaffFlow,
    isTabbedVisibility,
  ]);

  const currentUserMember = useMemo(() => {
    if (!currentUser?.phone) return null;
    const mine = normalizePhone(currentUser.phone);
    if (!mine) return null;
    return apartmentPeople.find((p) => p.phone === mine) ?? null;
  }, [currentUser?.phone, apartmentPeople]);

  const currentUserStaff = useMemo(() => {
    if (!currentUser?.phone) return null;
    const mine = normalizePhone(currentUser.phone);
    if (!mine) return null;
    return staffPeople.find((p) => p.phone === mine) ?? null;
  }, [currentUser?.phone, staffPeople]);

  useEffect(() => {
    if (isOwnershipFlow) {
      setKeepAdmin(true);
      setKeepMember(true);
      setKeepStaff(true);
    }
  }, [isOwnershipFlow]);

  const isAccountCreator =
    !!account && !!currentUser && account.ownerId === currentUser.id;

  const inviterName = useMemo(() => {
    if (isAccountCreator && account?.name) return account.name;
    if (currentUserMember?.name) return currentUserMember.name;
    if (account?.name) return account.name;
    return "Account Admin";
  }, [isAccountCreator, account?.name, currentUserMember?.name]);

  const inviterPhone = currentUser?.phone || "";

  const typedPhone10 =
    source === "new" &&
    !isVisibilityFlow &&
    !isStaffFlow &&
    !isTabbedVisibility &&
    phone.length === 10
      ? phone
      : "";

  const phoneLookup = useMemo<{
    matched: boolean;
    existingName: string;
    existingKind: "" | "member" | "staff" | "both";
    source: PhoneMatchSource;
    pendingRole: InvitationRole | null;
  }>(() => {
    if (!invitationsReady || !typedPhone10) {
      return {
        matched: false,
        existingName: "",
        existingKind: "",
        source: "",
        pendingRole: null,
      };
    }

    const memberMatch =
      apartmentPeople.find((p) => p.phone === typedPhone10) ?? null;
    const staffMatch =
      staffPeople.find((p) => p.phone === typedPhone10) ?? null;

    if (memberMatch || staffMatch) {
      const kind: "member" | "staff" | "both" =
        memberMatch && staffMatch ? "both" : memberMatch ? "member" : "staff";
      const existingName =
        memberMatch?.name?.trim() || staffMatch?.name?.trim() || "";
      return {
        matched: true,
        existingName,
        existingKind: kind,
        source: kind,
        pendingRole: null,
      };
    }

    if (blockedOwnerPhones.has(typedPhone10)) {
      return {
        matched: true,
        existingName: "",
        existingKind: "member",
        source: "owner",
        pendingRole: null,
      };
    }

    if (blockedAdminPhones.has(typedPhone10) && !isOwnershipFlow) {
      return {
        matched: true,
        existingName: "",
        existingKind: "member",
        source: "admin",
        pendingRole: null,
      };
    }

    if (pendingOwnershipPhones.has(typedPhone10)) {
      return {
        matched: true,
        existingName: "",
        existingKind: "member",
        source: "pending_ownership",
        pendingRole: "ownership_transfer",
      };
    }
    if (pendingAdminPhones.has(typedPhone10)) {
      return {
        matched: true,
        existingName: "",
        existingKind: "member",
        source: "pending_admin",
        pendingRole: "admin",
      };
    }
    if (pendingMemberPhones.has(typedPhone10)) {
      return {
        matched: true,
        existingName: "",
        existingKind: "member",
        source: "pending_member",
        pendingRole: "member_visibility",
      };
    }
    if (pendingStaffPhones.has(typedPhone10)) {
      return {
        matched: true,
        existingName: "",
        existingKind: "staff",
        source: "pending_staff",
        pendingRole: "staff_visibility",
      };
    }

    return {
      matched: false,
      existingName: "",
      existingKind: "",
      source: "",
      pendingRole: null,
    };
  }, [
    invitationsReady,
    typedPhone10,
    apartmentPeople,
    staffPeople,
    blockedOwnerPhones,
    blockedAdminPhones,
    pendingOwnershipPhones,
    pendingAdminPhones,
    pendingMemberPhones,
    pendingStaffPhones,
    isOwnershipFlow,
  ]);

  const searchLower = search.trim().toLowerCase();

  const filteredMembers = useMemo(() => {
    if (!searchLower) return visibilityCandidates;
    return visibilityCandidates.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchLower) ||
        p.phone.includes(searchLower) ||
        p.memberSummary.toLowerCase().includes(searchLower)
      );
    });
  }, [visibilityCandidates, searchLower]);

  const filteredStaff = useMemo(() => {
    if (!searchLower) return staffCandidates;
    return staffCandidates.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchLower) ||
        p.phone.includes(searchLower) ||
        p.staffSummary.toLowerCase().includes(searchLower)
      );
    });
  }, [staffCandidates, searchLower]);

  const filteredActiveMembers = useMemo(() => {
    if (!searchLower) return activeMembers;
    return activeMembers.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchLower) ||
        p.phone.includes(searchLower) ||
        p.memberSummary.toLowerCase().includes(searchLower)
      );
    });
  }, [activeMembers, searchLower]);

  const selectableIds = useMemo(
    () => filteredActiveMembers.map((p) => p.id),
    [filteredActiveMembers],
  );

  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedMemberIds.includes(id));

  const toggleMember = (personId: string) => {
    setSelectedMemberIds((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
    setError("");
  };

  const handleSelectAll = () => {
    setSelectedMemberIds((current) => {
      const set = new Set(current);
      selectableIds.forEach((id) => set.add(id));
      return Array.from(set);
    });
    setError("");
  };

  const handleClearAll = () => {
    setSelectedMemberIds([]);
    setError("");
  };

  const staffSelectableIds = useMemo(
    () => filteredStaff.map((p) => p.id),
    [filteredStaff],
  );

  const allStaffSelected =
    staffSelectableIds.length > 0 &&
    staffSelectableIds.every((id) => selectedStaffIds.includes(id));

  const toggleStaff = (personId: string) => {
    setSelectedStaffIds((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
    setError("");
  };

  const handleSelectAllStaff = () => {
    setSelectedStaffIds((current) => {
      const set = new Set(current);
      staffSelectableIds.forEach((id) => set.add(id));
      return Array.from(set);
    });
    setError("");
  };

  const handleClearAllStaff = () => {
    setSelectedStaffIds([]);
    setError("");
  };

  // Reset selections when switching tabs
  useEffect(() => {
    if (showVisibilityTabs) {
      setSearch("");
      setError("");
    }
  }, [visibilityTab, showVisibilityTabs]);

  const getAuthToken = async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync("auth_token");
    } catch {
      return null;
    }
  };

  const callPreflight = async (
    targetPhone: string,
    targetRole: InvitationRole,
  ): Promise<PreflightResult> => {
    const token = await getAuthToken();
    if (!token) {
      return { ok: false, message: "Not signed in (missing auth_token)." };
    }
    try {
      const url = `${API_URL}/api/accounts/${accountId}/invitations/preflight?phone=${encodeURIComponent(
        targetPhone,
      )}&role=${encodeURIComponent(targetRole)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const backendMessage =
          data?.message ?? data?.error ?? "(no message from server)";
        return {
          ok: false,
          message: `Preflight failed · ${res.status} · ${backendMessage}`,
        };
      }

      return { ok: true, data: data as PreflightResponse };
    } catch (err: any) {
      console.warn("[grant-access] preflight network error:", err);
      return {
        ok: false,
        message: `Network error: ${err?.message ?? "unknown"}`,
      };
    }
  };

  const callCreateInvitation = async (payload: {
    phone: string;
    name?: string;
    role: InvitationRole;
    targetMemberId?: string;
    targetStaffId?: string;
    isOwnershipTransfer?: boolean;
    predecessorContinuationRoles?: InvitationRole[];
  }): Promise<{ ok: boolean; message?: string; code?: string }> => {
    const token = await getAuthToken();
    if (!token) return { ok: false, message: "Not signed in" };
    try {
      const url = `${API_URL}/api/accounts/${accountId}/invitations`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        if (res.status === 409) {
          const code = String(data?.code ?? "").toLowerCase();
          return { ok: false, code };
        }
        const backendMessage =
          data?.message ?? data?.error ?? "(no message from server)";
        return {
          ok: false,
          message: `Create failed · ${res.status} · ${backendMessage}`,
        };
      }
      return { ok: true };
    } catch (err: any) {
      console.warn("[grant-access] create network error:", err);
      return {
        ok: false,
        message: `Network error: ${err?.message ?? "unknown"}`,
      };
    }
  };

  const callRenamePerson = async (payload: {
    phone: string;
    name: string;
  }): Promise<{ ok: boolean; message?: string }> => {
    const token = await getAuthToken();
    if (!token) return { ok: false, message: "Not signed in" };
    try {
      const url = `${API_URL}/api/accounts/${accountId}/rename-person`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const backendMessage =
          data?.message ?? data?.error ?? "(no message from server)";
        return {
          ok: false,
          message: `Rename failed · ${res.status} · ${backendMessage}`,
        };
      }
      return { ok: true };
    } catch (err: any) {
      console.warn("[grant-access] rename network error:", err);
      return {
        ok: false,
        message: `Network error: ${err?.message ?? "unknown"}`,
      };
    }
  };

  const sendInviteWithAlerts = async (opts: {
    phone: string;
    name?: string;
    role: InvitationRole;
    targetMemberId?: string;
    targetStaffId?: string;
    isOwnershipTransfer?: boolean;
    predecessorContinuationRoles?: InvitationRole[];
  }): Promise<boolean> => {
    const preResult = await callPreflight(opts.phone, opts.role);

    if (!preResult.ok) {
      showFeedback({
        tone: "error",
        title: "Couldn't check number",
        message: preResult.message,
        primaryLabel: "OK",
      });
      return false;
    }

    const pre = preResult.data;

    const doSend = async (): Promise<boolean> => {
      setSubmitting(true);
      const result = await callCreateInvitation({
        phone: opts.phone,
        name: opts.name,
        role: opts.role,
        targetMemberId: opts.targetMemberId,
        targetStaffId: opts.targetStaffId,
        isOwnershipTransfer: opts.isOwnershipTransfer,
        predecessorContinuationRoles: opts.predecessorContinuationRoles,
      });
      setSubmitting(false);
      if (!result.ok) {
        if (result.code === "ownership_pending_other") {
          showFeedback({
            tone: "warning",
            title: "Another ownership request is pending",
            message:
              "There is already a pending ownership transfer request to a different number on this account. Delete that request first, then send this one.",
            primaryLabel: "OK",
          });
          return false;
        }
        if (result.code === "pending_ownership") {
          showFeedback({
            tone: "warning",
            title: "Ownership request already pending",
            message: `An ownership transfer request is already pending for +91${opts.phone}. It must be accepted or deleted from the account profile before sending a new one.`,
            primaryLabel: "OK",
          });
          return false;
        }
        if (result.code === "pending_admin") {
          showFeedback({
            tone: "warning",
            title: "Admin invitation already pending",
            message: `An admin invitation is already pending for +91${opts.phone}. It must be accepted or deleted from the account profile before sending a new one.`,
            primaryLabel: "OK",
          });
          return false;
        }
        if (result.code === "pending") {
          showFeedback({
            tone: "warning",
            title: "Invitation already pending",
            message: `An invitation is already pending for +91${opts.phone}. It must be accepted or deleted from the account profile before sending a new one.`,
            primaryLabel: "OK",
          });
          return false;
        }

        showFeedback({
          tone: "error",
          title: "Send failed",
          message: result.message || "Failed to send invite",
          primaryLabel: "OK",
        });
        return false;
      }
      return true;
    };

    const isOwnership = opts.isOwnershipTransfer === true;

    switch (pre.kind) {
      case "self":
        showFeedback({
          tone: "warning",
          title: isOwnership
            ? "This is the current owner"
            : "This number belongs to the owner",
          message: isOwnership
            ? `+91${opts.phone} is the current owner of this account. Ownership cannot be transferred to the same person.`
            : `+91${opts.phone} is the owner's number. The owner already has full access to this account, so no invitation is needed.`,
          primaryLabel: "OK",
        });
        return false;

      case "already_admin":
        showFeedback({
          tone: "warning",
          title: "This number already has admin access",
          message: `+91${opts.phone} already has admin access to this account. No invitation is needed.`,
          primaryLabel: "OK",
        });
        return false;

      case "already_member":
        showFeedback({
          tone: "warning",
          title: "This number is already a member",
          message: `+91${opts.phone} already has member visibility access to this account. No invitation is needed.`,
          primaryLabel: "OK",
        });
        return false;

      case "already_staff":
        showFeedback({
          tone: "warning",
          title: "This number is already staff",
          message: `+91${opts.phone} already has staff visibility access to this account. No invitation is needed.`,
          primaryLabel: "OK",
        });
        return false;

      case "pending":
        showFeedback({
          tone: "warning",
          title: "Invitation already pending",
          message: `An invitation is already pending for +91${opts.phone}. It must be accepted or deleted from the account profile before sending a new one.`,
          primaryLabel: "OK",
        });
        return false;

      case "member_to_admin": {
        const displayName = pre.memberName || opts.name || "This person";
        return await new Promise<boolean>((resolve) => {
          showFeedback({
            tone: "info",
            title: "Existing access found",
            message: isOwnership
              ? `${displayName} (+91${opts.phone}) already has access to this account. Transferring ownership will make them the new owner of the account once they accept. Continue?`
              : `${displayName} (+91${opts.phone}) already has member or staff access on this account. Granting admin access will add admin alongside their existing roles. Continue?`,
            primaryLabel: isOwnership ? "Transfer ownership" : "Grant Admin",
            primaryTone: "primary",
            onPrimaryPress: () => {
              doSend().then(resolve);
            },
            secondaryLabel: "Cancel",
            onSecondaryPress: () => resolve(false),
          });
        });
      }

      case "ok":
      default:
        return await doSend();
    }
  };

  const pickContact = async () => {
    if (Platform.OS === "web") {
      showFeedback({
        tone: "info",
        title: "Contacts unavailable",
        message:
          "Contact picker is only available on mobile devices. Please enter the phone number manually.",
        primaryLabel: "OK",
      });
      return;
    }
    try {
      const { status } = await requestPermissionsAsync();
      if (status !== "granted") {
        showFeedback({
          tone: "warning",
          title: "Permission required",
          message:
            "We need access to your contacts to help you quickly add phone numbers.",
          primaryLabel: "OK",
        });
        setError("Permission to access contacts is required.");
        return;
      }
      const contacts = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        { sortOrder: ContactsSortOrder.GivenName },
      );
      if (!contacts || contacts.length === 0) {
        setError("No contacts found on your device.");
        return;
      }
      const mapped: ContactData[] = contacts
        .filter((c: any) => c.phones && c.phones.length > 0)
        .map((c: any) => ({
          id: c.id ?? `${c.fullName ?? "unknown"}-${Math.random()}`,
          name: c.fullName || "Unknown",
          phoneNumbers: (c.phones ?? []).map((p: any) => ({
            number: p.number || "",
            label: p.label || undefined,
          })),
        }));
      if (mapped.length === 0) {
        setError("No contacts with phone numbers found.");
        return;
      }
      setContactSearch("");
      setContactsList(mapped);
      setShowContactPicker(true);
      setError("");
    } catch (e) {
      console.error("Error fetching contacts:", e);
      setError("Failed to fetch contacts. Please try again.");
    }
  };

  const filteredContacts = contactsList.filter((contact) => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      contact.name.toLowerCase().includes(q) ||
      contact.phoneNumbers.some((p) => p.number.toLowerCase().includes(q))
    );
  });

  const closeContactPicker = () => {
    setContactSearch("");
    setShowContactPicker(false);
  };

  const selectContact = (contact: ContactData) => {
    if (!contact?.phoneNumbers?.length) {
      setError("Selected contact doesn't have a phone number.");
      return;
    }
    let n = contact.phoneNumbers[0].number || "";
    n = n
      .replace(/[^0-9]/g, "")
      .replace(/^91/, "")
      .replace(/^0/, "");
    if (n.length > 10) n = n.slice(-10);
    if (n.length !== 10) {
      setError("Selected contact does not have a valid 10-digit phone number.");
      return;
    }
    setPhone(n);
    setError("");
    if (!name.trim() && contact.name) setName(contact.name);
    setContactSearch("");
    setShowContactPicker(false);
  };

  const computePredecessorContinuationRoles = (): InvitationRole[] => {
    if (!isOwnershipFlow) return [];
    const out: InvitationRole[] = [];
    if (keepAdmin) {
      out.push("admin");
    } else {
      if (keepMember && currentUserMember) out.push("member_visibility");
      if (keepStaff && currentUserStaff) out.push("staff_visibility");
    }
    return out;
  };

  const handleSave = async () => {
    if (!accountId) {
      setError("Account information is missing.");
      return;
    }
    if (!inviterPhone) {
      setError("Your phone number is missing. Please sign in again.");
      return;
    }

    // ---- Tabbed visibility mode: route by active tab ----
    if (isTabbedVisibility) {
      if (visibilityTab === "member") {
        if (selectedMemberIds.length === 0) {
          setError("Please select at least one apartment owner.");
          return;
        }
        let allOk = true;
        for (const personId of selectedMemberIds) {
          const person = visibilityCandidates.find((p) => p.id === personId);
          if (!person) continue;
          const ok = await sendInviteWithAlerts({
            phone: person.phone,
            name: person.name,
            role: "member_visibility",
            targetMemberId: person.memberIds[0],
          });
          if (!ok) {
            allOk = false;
            break;
          }
        }
        if (allOk) {
          showFeedback({
            tone: "success",
            title: "Invitations sent",
            message:
              selectedMemberIds.length === 1
                ? "The apartment owner has been invited to view this account."
                : `${selectedMemberIds.length} apartment owners have been invited.`,
            primaryLabel: "Done",
            primaryTone: "primary",
            onPrimaryPress: () => router.back(),
          });
        }
        return;
      } else {
        if (selectedStaffIds.length === 0) {
          setError("Please select at least one staff member.");
          return;
        }
        let allOk = true;
        for (const personId of selectedStaffIds) {
          const person = staffCandidates.find((p) => p.id === personId);
          if (!person) continue;
          if (person.phone.length !== 10) {
            showFeedback({
              tone: "warning",
              title: "Missing phone",
              message: `${person.name} doesn't have a valid phone number on file.`,
              primaryLabel: "OK",
            });
            allOk = false;
            break;
          }
          const ok = await sendInviteWithAlerts({
            phone: person.phone,
            name: person.name,
            role: "staff_visibility",
            targetStaffId: person.staffIds[0],
          });
          if (!ok) {
            allOk = false;
            break;
          }
        }
        if (allOk) {
          showFeedback({
            tone: "success",
            title: "Invitations sent",
            message:
              selectedStaffIds.length === 1
                ? "Staff member has been invited to view this account."
                : `${selectedStaffIds.length} staff members have been invited.`,
            primaryLabel: "Done",
            primaryTone: "primary",
            onPrimaryPress: () => router.back(),
          });
        }
        return;
      }
    }

    // ---- Non-tabbed: keep the original behaviour ----

    if (
      source === "new" &&
      !isVisibilityFlow &&
      !isStaffFlow &&
      phoneLookup.matched &&
      phone.length === 10
    ) {
      const src = phoneLookup.source;

      if (src === "owner") {
        showFeedback({
          tone: "warning",
          title: "This number belongs to the owner",
          message: `+91${phone} is the owner of this account. The owner already has full access, so no invitation is needed.`,
          primaryLabel: "OK",
        });
        return;
      }

      if (src === "admin" && !isOwnershipFlow) {
        showFeedback({
          tone: "warning",
          title: "This number is already an admin",
          message: `+91${phone} already has admin access to this account. No invitation is needed.`,
          primaryLabel: "OK",
        });
        return;
      }

      if (
        src === "pending_admin" ||
        src === "pending_ownership" ||
        src === "pending_member" ||
        src === "pending_staff"
      ) {
        const pendingRole = phoneLookup.pendingRole;

        const requestedRole: InvitationRole | null = isOwnershipFlow
          ? "ownership_transfer"
          : getRole() === "ownership_transfer"
            ? "ownership_transfer"
            : getRole() === "admin"
              ? "admin"
              : getRole() === "staff_visibility"
                ? "staff_visibility"
                : getRole() === "member_visibility"
                  ? "member_visibility"
                  : null;

        if (pendingRole && requestedRole) {
          if (pendingRole === requestedRole) {
            showFeedback({
              tone: "warning",
              title: "Invitation already pending",
              message: `A ${roleLabelLower(
                requestedRole,
              )} is already pending for +91${phone}. It must be accepted or deleted from the account profile before sending a new one.`,
              primaryLabel: "OK",
            });
            return;
          }

          const LOWER_ROLE_KEYS = new Set<InvitationRole>([
            "member_visibility",
            "staff_visibility",
          ]);

          const isCoexistSwap =
            pendingRole !== requestedRole &&
            LOWER_ROLE_KEYS.has(pendingRole) &&
            LOWER_ROLE_KEYS.has(requestedRole);

          const pendingRank = ROLE_RANK[pendingRole];
          const requestedRank = ROLE_RANK[requestedRole];

          let actionLine: string;
          if (isCoexistSwap) {
            actionLine = `The existing ${roleLabelLower(
              pendingRole,
            )} stays, and a new ${roleLabelLower(
              requestedRole,
            )} will be sent — this person will hold both roles at the same time.`;
          } else if (requestedRank > pendingRank) {
            actionLine = `Granting ${roleLabelLower(
              requestedRole,
            )} will upgrade the pending ${roleLabelLower(
              pendingRole,
            )} to ${roleLabelLower(requestedRole)}.`;
          } else if (requestedRank < pendingRank) {
            actionLine = `Granting ${roleLabelLower(
              requestedRole,
            )} will downgrade the pending ${roleLabelLower(
              pendingRole,
            )} to ${roleLabelLower(requestedRole)}.`;
          } else {
            actionLine = `Granting ${roleLabelLower(
              requestedRole,
            )} will replace the pending ${roleLabelLower(pendingRole)}.`;
          }

          const confirmed = await new Promise<boolean>((resolve) => {
            showFeedback({
              tone: "info",
              title: isCoexistSwap
                ? "Add another role"
                : "Invitation already pending",
              message: `+91${phone} already has a pending ${roleLabelLower(
                pendingRole,
              )}. ${actionLine}`,
              primaryLabel: isCoexistSwap ? "Add" : "Grant",
              primaryTone: "primary",
              onPrimaryPress: () => resolve(true),
              secondaryLabel: "Cancel",
              onSecondaryPress: () => resolve(false),
            });
          });

          if (!confirmed) return;
        }
      }

      if (src === "member" || src === "staff" || src === "both") {
        const cleanName = name.trim();

        if (!cleanName) {
          setError(
            `This number belongs to ${
              phoneLookup.existingName || "an existing person"
            }. Enter a name to continue.`,
          );
          return;
        }

        const namesMatch =
          phoneLookup.existingName &&
          cleanName.toLowerCase() === phoneLookup.existingName.toLowerCase();

        if (!namesMatch) {
          const confirmed = await confirmNameConflict({
            phone,
            existing_name: phoneLookup.existingName || "another person",
            role: "admin",
          });

          if (!confirmed) {
            setName(phoneLookup.existingName);
            setError("");
            return;
          }

          setNameConflictBusy(true);

          const renameResult = await callRenamePerson({
            phone,
            name: cleanName,
          });

          if (!renameResult.ok) {
            setNameConflictBusy(false);
            closeNameConflict();
            showFeedback({
              tone: "error",
              title: "Couldn't update name",
              message: renameResult.message || "Failed to rename this person.",
              primaryLabel: "OK",
            });
            return;
          }

          renameMemberByPhone(phone, cleanName);
          renameStaffByPhone(phone, cleanName);

          setNameConflictBusy(false);
          closeNameConflict();
        }
      }
    }

    const grantRole: InvitationRole =
      getRole() === "ownership_transfer"
        ? "ownership_transfer"
        : isOwnershipFlow
          ? "ownership_transfer"
          : getRole() || "member_visibility";

    if (isStaffFlow) {
      if (selectedStaffIds.length === 0) {
        setError("Please select at least one staff member.");
        return;
      }
      let allOk = true;
      for (const personId of selectedStaffIds) {
        const person = staffPeople.find((p) => p.id === personId);
        if (!person) continue;
        if (person.phone.length !== 10) {
          showFeedback({
            tone: "warning",
            title: "Missing phone",
            message: `${person.name} doesn't have a valid phone number on file.`,
            primaryLabel: "OK",
          });
          allOk = false;
          break;
        }
        const ok = await sendInviteWithAlerts({
          phone: person.phone,
          name: person.name,
          role: "staff_visibility",
          targetStaffId: person.staffIds[0],
        });
        if (!ok) {
          allOk = false;
          break;
        }
      }
      if (allOk) {
        showFeedback({
          tone: "success",
          title: "Invitations sent",
          message:
            selectedStaffIds.length === 1
              ? "Staff member has been invited to view this account."
              : `${selectedStaffIds.length} staff members have been invited.`,
          primaryLabel: "Done",
          primaryTone: "primary",
          onPrimaryPress: () => router.back(),
        });
      }
      return;
    }

    if (isVisibilityFlow) {
      if (selectedMemberIds.length === 0) {
        setError("Please select at least one apartment owner.");
        return;
      }
      let allOk = true;
      for (const personId of selectedMemberIds) {
        const person = visibilityCandidates.find((p) => p.id === personId);
        if (!person) continue;
        const ok = await sendInviteWithAlerts({
          phone: person.phone,
          name: person.name,
          role: "member_visibility",
          targetMemberId: person.memberIds[0],
        });
        if (!ok) {
          allOk = false;
          break;
        }
      }
      if (allOk) {
        showFeedback({
          tone: "success",
          title: "Invitations sent",
          message:
            selectedMemberIds.length === 1
              ? "The apartment owner has been invited to view this account."
              : `${selectedMemberIds.length} apartment owners have been invited.`,
          primaryLabel: "Done",
          primaryTone: "primary",
          onPrimaryPress: () => router.back(),
        });
      }
      return;
    }

    if (source === "new") {
      const recipientName = name.trim();
      const cleanPhone = phone.replace(/[^0-9]/g, "").slice(-10);

      if (isOwnershipFlow && blockedOwnerPhones.has(cleanPhone)) {
        showFeedback({
          tone: "warning",
          title: "This is the current owner",
          message:
            "Ownership cannot be transferred to the same person who already owns the account.",
          primaryLabel: "OK",
        });
        return;
      }

      if (!recipientName) {
        setError("Please enter a name.");
        return;
      }
      if (cleanPhone.length !== 10) {
        setError("Please enter a valid 10-digit phone number.");
        return;
      }
      const ok = await sendInviteWithAlerts({
        phone: cleanPhone,
        name: recipientName,
        role: grantRole,
        isOwnershipTransfer: isOwnershipFlow,
        predecessorContinuationRoles: computePredecessorContinuationRoles(),
      });
      if (ok) {
        showFeedback({
          tone: "success",
          title: isOwnershipFlow
            ? "Ownership transfer sent"
            : "Invitation sent",
          message: isOwnershipFlow
            ? `Ownership transfer invitation sent to +91${cleanPhone}. They will become the new owner once they accept.`
            : `Invite sent to +91${cleanPhone}.`,
          primaryLabel: "Done",
          primaryTone: "primary",
          onPrimaryPress: () => router.back(),
        });
      }
      return;
    }

    if (selectedMemberIds.length === 0) {
      setError("Please select at least one member.");
      return;
    }
    let allOk = true;
    for (const personId of selectedMemberIds) {
      const person =
        apartmentPeople.find((p) => p.id === personId) ??
        (isOwnershipFlow
          ? ownershipCandidates.find((p) => p.id === personId)
          : undefined);
      if (!person) continue;

      if (isOwnershipFlow && blockedOwnerPhones.has(person.phone)) {
        showFeedback({
          tone: "warning",
          title: "This is the current owner",
          message:
            "Ownership cannot be transferred to the same person who already owns the account.",
          primaryLabel: "OK",
        });
        allOk = false;
        break;
      }

      const ok = await sendInviteWithAlerts({
        phone: person.phone,
        name: person.name,
        role: grantRole,
        targetMemberId: person.memberIds[0],
        isOwnershipTransfer: isOwnershipFlow,
        predecessorContinuationRoles: computePredecessorContinuationRoles(),
      });
      if (!ok) {
        allOk = false;
        break;
      }
    }
    if (allOk) {
      showFeedback({
        tone: "success",
        title: isOwnershipFlow ? "Ownership transfer sent" : "Invitations sent",
        message: isOwnershipFlow
          ? selectedMemberIds.length === 1
            ? "Ownership transfer invitation has been sent. They will become the new owner once they accept."
            : `${selectedMemberIds.length} ownership transfer invitations have been sent.`
          : selectedMemberIds.length === 1
            ? "Person has been invited."
            : `${selectedMemberIds.length} people have been invited.`,
        primaryLabel: "Done",
        primaryTone: "primary",
        onPrimaryPress: () => router.back(),
      });
    }
  };

  const renderMemberRow = (person: GroupedPerson) => {
    const meta = person.memberSummary;
    const selected = selectedMemberIds.includes(person.id);
    const photoUrl = person.photoUri;

    return (
      <TouchableOpacity
        key={person.id}
        activeOpacity={0.8}
        style={[styles.memberCard, selected && styles.memberCardSelected]}
        onPress={() => toggleMember(person.id)}
      >
        <View
          style={[styles.memberAvatar, selected && styles.memberAvatarSelected]}
        >
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.memberAvatarImage}
              resizeMode="cover"
            />
          ) : (
            <Text
              style={[
                styles.memberAvatarText,
                selected && styles.memberAvatarTextSelected,
              ]}
            >
              {(person.name || "?").charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.memberContent}>
          <Text style={styles.memberName} numberOfLines={1}>
            {person.name || "Unnamed"}
          </Text>
          <View style={styles.memberPhoneRow}>
            <Ionicons name="call-outline" size={13} color="#64748B" />
            <Text style={styles.memberPhone} numberOfLines={1}>
              +91 {person.phone}
            </Text>
          </View>
          {meta ? (
            <View style={styles.memberMetaRow}>
              <Ionicons name="home-outline" size={13} color="#2563EB" />
              <Text style={styles.memberMeta} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected ? (
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderStaffRow = (person: GroupedPerson) => {
    const meta = person.staffSummary;
    const selected = selectedStaffIds.includes(person.id);
    const photoUrl = person.photoUri;

    return (
      <TouchableOpacity
        key={person.id}
        activeOpacity={0.8}
        style={[styles.memberCard, selected && styles.memberCardSelected]}
        onPress={() => toggleStaff(person.id)}
      >
        <View
          style={[
            styles.memberAvatar,
            styles.memberAvatarStaff,
            selected && styles.memberAvatarSelected,
          ]}
        >
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.memberAvatarImage}
              resizeMode="cover"
            />
          ) : (
            <Text
              style={[
                styles.memberAvatarText,
                selected && styles.memberAvatarTextSelected,
              ]}
            >
              {(person.name || "?").charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.memberContent}>
          <Text style={styles.memberName} numberOfLines={1}>
            {person.name || "Unnamed"}
          </Text>
          <View style={styles.memberPhoneRow}>
            <Ionicons name="call-outline" size={13} color="#64748B" />
            <Text style={styles.memberPhone} numberOfLines={1}>
              +91 {person.phone}
            </Text>
          </View>
          {meta ? (
            <View style={styles.memberMetaRow}>
              <Ionicons name="briefcase-outline" size={13} color="#7C3AED" />
              <Text style={styles.memberStaffMeta} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected ? (
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderContactPickerModal = () => {
    if (!showContactPicker) return null;
    return (
      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={closeContactPicker}
      >
        <TouchableWithoutFeedback onPress={closeContactPicker}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback
              onPress={(event) => event.stopPropagation()}
            >
              <View
                style={[
                  styles.modalContainer,
                  { paddingBottom: Math.max(insets.bottom, 12) },
                ]}
              >
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Select Contact</Text>
                    <Text style={styles.modalSubtitle}>
                      Choose a contact from your phone{" "}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={closeContactPicker}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={22} color="#334155" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalSearch}>
                  <Ionicons name="search-outline" size={20} color="#64748B" />
                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Search contacts"
                    placeholderTextColor="#94A3B8"
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {contactSearch.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setContactSearch("")}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.contactCountRow}>
                  <Text style={styles.contactCount}>
                    {filteredContacts.length}{" "}
                    {filteredContacts.length === 1 ? "contact" : "contacts"}
                  </Text>
                </View>

                <View style={styles.contactListWrapper}>
                  <ScrollView
                    style={styles.contactList}
                    contentContainerStyle={styles.contactListContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {filteredContacts.length > 0 ? (
                      filteredContacts.map((contact) => (
                        <TouchableOpacity
                          key={contact.id}
                          style={styles.contactItem}
                          onPress={() => selectContact(contact)}
                          activeOpacity={0.75}
                        >
                          <View style={styles.contactAvatar}>
                            <Text style={styles.contactAvatarText}>
                              {contact.name
                                ? contact.name.charAt(0).toUpperCase()
                                : "?"}
                            </Text>
                          </View>
                          <View style={styles.contactInfo}>
                            <Text style={styles.contactName} numberOfLines={1}>
                              {contact.name || "Unknown"}
                            </Text>
                            {contact.phoneNumbers?.length > 0 ? (
                              <Text
                                style={styles.contactPhone}
                                numberOfLines={1}
                              >
                                {contact.phoneNumbers[0].number}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.contactArrow}>
                            <Ionicons
                              name="chevron-forward"
                              size={17}
                              color="#94A3B8"
                            />
                          </View>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.noContacts}>
                        <View style={styles.noContactsIcon}>
                          <Ionicons
                            name="search-outline"
                            size={28}
                            color="#64748B"
                          />
                        </View>
                        <Text style={styles.noContactsTitle}>
                          No contacts found
                        </Text>
                        <Text style={styles.noContactsText}>
                          Try another name or phone number.
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={closeContactPicker}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  const renderFeedbackModal = () => {
    if (!feedback.visible) return null;

    const meta = FEEDBACK_TONE_META[feedback.tone];
    const primaryIsDanger = feedback.primaryTone === "danger";

    return (
      <Modal
        transparent
        animationType="fade"
        visible={feedback.visible}
        onRequestClose={closeFeedback}
      >
        <TouchableWithoutFeedback onPress={closeFeedback}>
          <View style={styles.feedbackOverlay}>
            <TouchableWithoutFeedback
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.feedbackCard}>
                <View
                  style={[
                    styles.feedbackIconWrap,
                    { backgroundColor: meta.iconBg },
                  ]}
                >
                  <Ionicons name={meta.icon} size={32} color={meta.iconColor} />
                </View>

                <Text style={styles.feedbackTitle}>{feedback.title}</Text>
                <Text style={styles.feedbackMessage}>{feedback.message}</Text>

                <View style={styles.feedbackActions}>
                  {feedback.secondaryLabel ? (
                    <TouchableOpacity
                      style={styles.feedbackSecondaryButton}
                      onPress={runFeedbackSecondary}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.feedbackSecondaryText}>
                        {feedback.secondaryLabel}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.feedbackPrimaryButton,
                      feedback.secondaryLabel ? { flex: 1.2 } : { flex: 1 },
                      primaryIsDanger && { backgroundColor: "#DC2626" },
                    ]}
                    onPress={runFeedbackPrimary}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.feedbackPrimaryText}>
                      {feedback.primaryLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  const renderAfterTransferSection = () => {
    if (!isOwnershipFlow) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AFTER TRANSFER</Text>
        <View style={styles.formCard}>
          <Text style={styles.continuationHint}>
            Choose which access you want to keep after transferring ownership.
            Roles you turn off will be removed.
          </Text>

          <View style={styles.toggleRow}>
            <View
              style={[styles.toggleIconWrap, { backgroundColor: "#EDE9FE" }]}
            >
              <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
            </View>
            <View style={styles.toggleContent}>
              <Text style={styles.toggleTitle}>Continue as Admin</Text>
              <Text style={styles.toggleSubtitle}>
                Keep administrator privileges
              </Text>
            </View>
            <ToggleSwitch
              value={keepAdmin}
              onValueChange={setKeepAdmin}
              trackColorOn="#7C3AED"
            />
          </View>

          {!keepAdmin && currentUserMember ? (
            <View style={styles.toggleRow}>
              <View
                style={[styles.toggleIconWrap, { backgroundColor: "#DCFCE7" }]}
              >
                <Ionicons name="person" size={18} color="#16A34A" />
              </View>
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>Continue as Member</Text>
                <Text style={styles.toggleSubtitle} numberOfLines={1}>
                  {currentUserMember.name}
                  {currentUserMember.memberSummary
                    ? `  •  ${currentUserMember.memberSummary}`
                    : ""}
                </Text>
              </View>
              <ToggleSwitch
                value={keepMember}
                onValueChange={setKeepMember}
                trackColorOn="#16A34A"
              />
            </View>
          ) : null}

          {!keepAdmin && currentUserStaff ? (
            <View style={styles.toggleRow}>
              <View
                style={[styles.toggleIconWrap, { backgroundColor: "#E0F2FE" }]}
              >
                <Ionicons name="briefcase" size={18} color="#0284C7" />
              </View>
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>Continue as Staff</Text>
                <Text style={styles.toggleSubtitle} numberOfLines={1}>
                  {currentUserStaff.name}
                  {currentUserStaff.staffSummary
                    ? `  ·  ${currentUserStaff.staffSummary}`
                    : ""}
                </Text>
              </View>
              <ToggleSwitch
                value={keepStaff}
                onValueChange={setKeepStaff}
                trackColorOn="#0284C7"
              />
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const hasMembers = visibilityCandidates.length > 0;
  const hasStaff = staffCandidates.length > 0;

  const getEmptyStateText = () => {
    if (isStaffFlow) return "No staff available to select.";
    if (isVisibilityFlow)
      return "All apartment owners already have a pending or active invitation.";
    if (isOwnershipFlow)
      return "No other members are available to transfer ownership to.";
    return "No members are available.";
  };

  const saveButtonDisabled = (() => {
    if (submitting || !pageReady) return true;

    if (isTabbedVisibility) {
      if (visibilityTab === "member") return selectedMemberIds.length === 0;
      return selectedStaffIds.length === 0;
    }

    if (isStaffFlow) return selectedStaffIds.length === 0;

    if (!isVisibilityFlow && source === "new" && phone.length !== 10)
      return true;

    if (isVisibilityFlow && selectedMemberIds.length === 0) return true;

    if (
      !isStaffFlow &&
      !isVisibilityFlow &&
      source === "existing" &&
      selectedMemberIds.length === 0
    )
      return true;

    return false;
  })();

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        bounces={false}
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name={introIcon} size={24} color="#2563EB" />
          </View>
          <View style={styles.introContent}>
            <Text style={styles.introTitle}>{introTitle}</Text>
            <Text style={styles.introDescription}>{introDescription}</Text>
          </View>
        </View>

        {!pageReady ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.loadingText}>Loading people…</Text>
          </View>
        ) : (
          <>
            {/* ── Tab bar for tabbed visibility mode ── */}
            {isTabbedVisibility ? (
              <View style={styles.visibilityTabs}>
                {[
                  {
                    key: "member" as const,
                    label: "Member",
                    icon: "home-outline" as const,
                    color: "#2563EB",
                    bg: "#EFF6FF",
                  },
                  {
                    key: "staff" as const,
                    label: "Staff",
                    icon: "briefcase-outline" as const,
                    color: "#7C3AED",
                    bg: "#F5F3FF",
                  },
                ].map((t) => {
                  const active = visibilityTab === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        styles.visibilityTab,
                        active && {
                          backgroundColor: t.bg,
                          borderColor: t.color + "40",
                        },
                      ]}
                      onPress={() => setVisibilityTab(t.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={t.icon}
                        size={17}
                        color={active ? t.color : "#64748B"}
                      />
                      <Text
                        style={[
                          styles.visibilityTabText,
                          active && { color: t.color, fontWeight: "800" },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* Recipient picker (hidden in tabbed mode) */}
            {!isTabbedVisibility && !isVisibilityFlow && !isStaffFlow ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>RECIPIENT</Text>
                <View style={styles.sourceRow}>
                  <TouchableOpacity
                    style={[
                      styles.sourceTile,
                      source === "new" && styles.sourceTileActive,
                    ]}
                    onPress={() => {
                      setSource("new");
                      setSelectedMemberIds([]);
                      setError("");
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.sourceTileIcon,
                        source === "new" && styles.sourceTileIconActive,
                      ]}
                    >
                      <Ionicons
                        name="call-outline"
                        size={22}
                        color={source === "new" ? "#2563EB" : "#64748B"}
                      />
                    </View>
                    <Text
                      style={[
                        styles.sourceTileTitle,
                        source === "new" && styles.sourceTileTitleActive,
                      ]}
                      numberOfLines={1}
                    >
                      New phone
                    </Text>
                    <Text
                      style={styles.sourceTileDescription}
                      numberOfLines={2}
                    >
                      Invite by phone number
                    </Text>
                    {source === "new" ? (
                      <View style={styles.sourceTileCheck}>
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sourceTile,
                      source === "existing" && styles.sourceTileActive,
                    ]}
                    onPress={() => {
                      setSource("existing");
                      setName("");
                      setPhone("");
                      setError("");
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.sourceTileIcon,
                        source === "existing" && styles.sourceTileIconActive,
                      ]}
                    >
                      <Ionicons
                        name="people-outline"
                        size={22}
                        color={source === "existing" ? "#2563EB" : "#64748B"}
                      />
                    </View>
                    <Text
                      style={[
                        styles.sourceTileTitle,
                        source === "existing" && styles.sourceTileTitleActive,
                      ]}
                      numberOfLines={1}
                    >
                      Existing person
                    </Text>
                    <Text
                      style={styles.sourceTileDescription}
                      numberOfLines={2}
                    >
                      Pick from members
                    </Text>
                    {source === "existing" ? (
                      <View style={styles.sourceTileCheck}>
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!isTabbedVisibility &&
            !isVisibilityFlow &&
            !isStaffFlow &&
            source === "new" ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>PERSON DETAILS</Text>
                <View style={styles.formCard}>
                  <Text style={styles.inputLabel}>Full name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={19} color="#64748B" />
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={(value) => {
                        setName(value);
                        setError("");
                      }}
                      placeholder="Enter full name"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                    />
                  </View>

                  <Text style={[styles.inputLabel, styles.phoneLabel]}>
                    Phone number
                  </Text>

                  <View style={styles.phoneRow}>
                    <View style={styles.phoneWrapper}>
                      <View style={styles.countryCode}>
                        <Text style={styles.countryCodeText}>+91</Text>
                      </View>
                      <TextInput
                        style={styles.phoneInput}
                        value={phone}
                        onChangeText={(value) => {
                          setPhone(value.replace(/[^0-9]/g, "").slice(0, 10));
                          setError("");
                        }}
                        keyboardType="phone-pad"
                        maxLength={10}
                        placeholder="98765 43210"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <TouchableOpacity
                      onPress={pickContact}
                      style={styles.contactButton}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="person-add-outline"
                        size={20}
                        color="#2563EB"
                      />
                    </TouchableOpacity>
                  </View>

                  {phone.length > 0 && phone.length !== 10 ? (
                    <View style={styles.phoneHintRow}>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#DC2626"
                      />
                      <Text style={styles.phoneHint}>Enter all 10 digits</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {renderAfterTransferSection()}

            {!isTabbedVisibility &&
            !isVisibilityFlow &&
            !isStaffFlow &&
            source === "existing" ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SELECT PEOPLE</Text>
                {activeMembers.length > 0 ? (
                  <>
                    <View style={styles.selectControlsRow}>
                      <View style={styles.searchBoxInline}>
                        <Ionicons
                          name="search-outline"
                          size={19}
                          color="#64748B"
                        />
                        <TextInput
                          style={styles.searchInput}
                          value={search}
                          onChangeText={(value) => {
                            setSearch(value);
                            setError("");
                          }}
                          placeholder="Search name or phone no."
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="none"
                        />
                        {search.length > 0 ? (
                          <TouchableOpacity
                            onPress={() => setSearch("")}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="close-circle"
                              size={19}
                              color="#94A3B8"
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={styles.selectAllButton}
                        onPress={allSelected ? handleClearAll : handleSelectAll}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            allSelected
                              ? "close-circle-outline"
                              : "checkmark-done"
                          }
                          size={16}
                          color={allSelected ? "#DC2626" : "#2563EB"}
                        />
                        <Text
                          style={[
                            styles.selectAllText,
                            allSelected && styles.clearAllText,
                          ]}
                        >
                          {allSelected ? "Clear all" : "Select all"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.groupHeader}>
                      <View style={styles.groupTitleRow}>
                        <Ionicons
                          name="home-outline"
                          size={17}
                          color="#2563EB"
                        />
                        <Text style={styles.groupTitle}>Members</Text>
                      </View>
                      <Text style={styles.groupCount}>
                        {filteredActiveMembers.length}
                      </Text>
                    </View>

                    {filteredActiveMembers.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>
                          <Ionicons
                            name="people-outline"
                            size={28}
                            color="#64748B"
                          />
                        </View>
                        <Text style={styles.emptyTitle}>
                          No matching members
                        </Text>
                        <Text style={styles.emptyDescription}>
                          Try searching with another name, phone number, or
                          apartment.
                        </Text>
                      </View>
                    ) : (
                      filteredActiveMembers.map(renderMemberRow)
                    )}
                  </>
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                      <Ionicons
                        name="people-outline"
                        size={28}
                        color="#64748B"
                      />
                    </View>
                    <Text style={styles.emptyTitle}>No people available</Text>
                    <Text style={styles.emptyDescription}>
                      {getEmptyStateText()}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* ── Member visibility list (standalone or tabbed) ── */}
            {isVisibilityFlow ||
            (isTabbedVisibility && visibilityTab === "member") ? (
              <View style={styles.section}>
                {hasMembers ? (
                  <>
                    <View style={styles.selectControlsRow}>
                      <View style={styles.searchBoxInline}>
                        <Ionicons
                          name="search-outline"
                          size={19}
                          color="#64748B"
                        />
                        <TextInput
                          style={styles.searchInput}
                          value={search}
                          onChangeText={(value) => {
                            setSearch(value);
                            setError("");
                          }}
                          placeholder="Search name or phone no."
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="none"
                        />
                        {search.length > 0 ? (
                          <TouchableOpacity
                            onPress={() => setSearch("")}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="close-circle"
                              size={19}
                              color="#94A3B8"
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={styles.selectAllButton}
                        onPress={allSelected ? handleClearAll : handleSelectAll}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            allSelected
                              ? "close-circle-outline"
                              : "checkmark-done"
                          }
                          size={16}
                          color={allSelected ? "#DC2626" : "#2563EB"}
                        />
                        <Text
                          style={[
                            styles.selectAllText,
                            allSelected && styles.clearAllText,
                          ]}
                        >
                          {allSelected ? "Clear all" : "Select all"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {filteredMembers.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>
                          <Ionicons
                            name="people-outline"
                            size={28}
                            color="#64748B"
                          />
                        </View>
                        <Text style={styles.emptyTitle}>
                          {visibilityCandidates.length === 0
                            ? "No apartment owners available"
                            : "No matching apartment owners"}
                        </Text>
                        <Text style={styles.emptyDescription}>
                          {visibilityCandidates.length === 0
                            ? "Every apartment owner already has a pending or active visibility invitation."
                            : "Try searching with another name, phone number, apartment or wing."}
                        </Text>
                      </View>
                    ) : (
                      filteredMembers.map(renderMemberRow)
                    )}
                  </>
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                      <Ionicons
                        name="people-outline"
                        size={28}
                        color="#64748B"
                      />
                    </View>
                    <Text style={styles.emptyTitle}>No people available</Text>
                    <Text style={styles.emptyDescription}>
                      {getEmptyStateText()}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* ── Staff visibility list (standalone or tabbed) ── */}
            {isStaffFlow ||
            (isTabbedVisibility && visibilityTab === "staff") ? (
              <View style={styles.section}>
                {hasStaff ? (
                  <>
                    <View style={styles.selectControlsRow}>
                      <View style={styles.searchBoxInline}>
                        <Ionicons
                          name="search-outline"
                          size={19}
                          color="#64748B"
                        />
                        <TextInput
                          style={styles.searchInput}
                          value={search}
                          onChangeText={(value) => {
                            setSearch(value);
                            setError("");
                          }}
                          placeholder="Search staff name, phone or role"
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="none"
                        />
                        {search.length > 0 ? (
                          <TouchableOpacity
                            onPress={() => setSearch("")}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="close-circle"
                              size={19}
                              color="#94A3B8"
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={styles.selectAllButton}
                        onPress={
                          allStaffSelected
                            ? handleClearAllStaff
                            : handleSelectAllStaff
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            allStaffSelected
                              ? "close-circle-outline"
                              : "checkmark-done"
                          }
                          size={16}
                          color={allStaffSelected ? "#DC2626" : "#2563EB"}
                        />
                        <Text
                          style={[
                            styles.selectAllText,
                            allStaffSelected && styles.clearAllText,
                          ]}
                        >
                          {allStaffSelected ? "Clear all" : "Select all"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {filteredStaff.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>
                          <Ionicons
                            name="briefcase-outline"
                            size={28}
                            color="#64748B"
                          />
                        </View>
                        <Text style={styles.emptyTitle}>
                          {staffCandidates.length === 0
                            ? "No staff available"
                            : "No matching staff"}
                        </Text>
                        <Text style={styles.emptyDescription}>
                          {staffCandidates.length === 0
                            ? "Every staff member already has a pending or active visibility invitation."
                            : "Try searching with another name, phone number, or role."}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.groupHeader}>
                          <View style={styles.groupTitleRow}>
                            <Ionicons
                              name="briefcase-outline"
                              size={17}
                              color="#7C3AED"
                            />
                            <Text style={styles.groupTitle}>Staff</Text>
                          </View>
                          <Text style={styles.groupCount}>
                            {filteredStaff.length}
                          </Text>
                        </View>
                        {filteredStaff.map(renderStaffRow)}
                      </>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                      <Ionicons
                        name="briefcase-outline"
                        size={28}
                        color="#64748B"
                      />
                    </View>
                    <Text style={styles.emptyTitle}>No staff available</Text>
                    <Text style={styles.emptyDescription}>
                      Add staff in the management tab first, then come back to
                      grant them visibility.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color="#DC2626"
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.bottomAction}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  saveButtonDisabled ? styles.saveButtonDisabled : null,
                  isOwnershipFlow && !saveButtonDisabled
                    ? styles.saveButtonOwnership
                    : null,
                ]}
                onPress={handleSave}
                activeOpacity={0.85}
                disabled={saveButtonDisabled}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={
                        isOwnershipFlow
                          ? "swap-horizontal-outline"
                          : "shield-checkmark-outline"
                      }
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.saveText}>{saveLabel}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomSpace} />
          </>
        )}
      </ScrollView>

      {renderContactPickerModal()}
      {renderFeedbackModal()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 16, flexGrow: 1 },

  introCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    padding: 16,
    marginBottom: 22,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  introContent: { flex: 1 },
  introTitle: { color: "#1E3A8A", fontSize: 16, fontWeight: "700" },
  introDescription: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  loadingBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },

  /* ── Visibility tab bar (only in tabbed mode) ── */
  visibilityTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  visibilityTab: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  visibilityTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },

  section: { marginBottom: 20 },
  sectionTitle: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 9,
    marginLeft: 3,
  },

  sourceRow: { flexDirection: "row", gap: 10 },
  sourceTile: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 14,
    minHeight: 118,
    position: "relative",
  },
  sourceTileActive: { borderColor: "#2563EB", backgroundColor: "#F8FBFF" },
  sourceTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  sourceTileIconActive: { backgroundColor: "#DBEAFE" },
  sourceTileTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 3,
  },
  sourceTileTitleActive: { color: "#1D4ED8" },
  sourceTileDescription: {
    fontSize: 11.5,
    color: "#64748B",
    lineHeight: 15,
  },
  sourceTileCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 15,
  },
  inputLabel: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
  },
  phoneLabel: { marginTop: 17 },
  inputWrapper: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: "#0F172A",
    marginLeft: 9,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  phoneWrapper: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 5,
  },
  countryCode: {
    height: 40,
    minWidth: 55,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
  },
  countryCodeText: { color: "#334155", fontSize: 14, fontWeight: "700" },
  phoneInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: "#0F172A",
    paddingHorizontal: 11,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  contactButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneHintRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
    gap: 5,
  },
  phoneHint: { color: "#DC2626", fontSize: 12 },

  continuationHint: {
    color: "#475569",
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    gap: 10,
  },
  toggleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleContent: { flex: 1, minWidth: 0 },
  toggleTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },
  toggleSubtitle: {
    color: "#64748B",
    fontSize: 11.5,
    marginTop: 3,
  },

  selectControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  searchBoxInline: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: "#0F172A",
    marginLeft: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  selectAllText: { fontSize: 12.5, fontWeight: "700", color: "#2563EB" },
  clearAllText: { color: "#DC2626" },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  groupTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  groupTitle: { color: "#334155", fontSize: 13, fontWeight: "700" },
  groupCount: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
  },

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 15,
    padding: 12,
    marginBottom: 8,
  },
  memberCardSelected: { borderColor: "#60A5FA", backgroundColor: "#F8FBFF" },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    overflow: "hidden",
  },
  memberAvatarStaff: { backgroundColor: "#F5F3FF" },
  memberAvatarSelected: { backgroundColor: "#2563EB" },
  memberAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
  },
  memberAvatarText: { color: "#2563EB", fontSize: 16, fontWeight: "700" },
  memberAvatarTextSelected: { color: "#FFFFFF" },
  memberContent: { flex: 1, minWidth: 0 },
  memberName: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  memberPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },
  memberPhone: { color: "#64748B", fontSize: 12, flexShrink: 1 },
  memberMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },
  memberMeta: { color: "#2563EB", fontSize: 11, fontWeight: "600" },
  memberStaffMeta: { color: "#7C3AED", fontSize: 11, fontWeight: "600" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    backgroundColor: "#FFFFFF",
  },
  checkboxSelected: { backgroundColor: "#2563EB", borderColor: "#2563EB" },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    paddingHorizontal: 25,
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
    gap: 8,
  },
  errorText: { flex: 1, color: "#B91C1C", fontSize: 12, lineHeight: 17 },

  bottomAction: { marginTop: 3 },
  saveButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
  },
  saveButtonOwnership: { backgroundColor: "#D97706" },
  saveButtonDisabled: { opacity: 0.55 },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  cancelButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },
  cancelText: { color: "#64748B", fontSize: 14, fontWeight: "600" },
  bottomSpace: { height: 20 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 20,
    paddingHorizontal: 18,
    maxHeight: "88%",
    minHeight: "55%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: { color: "#0F172A", fontSize: 19, fontWeight: "700" },
  modalSubtitle: { color: "#64748B", fontSize: 12, marginTop: 3 },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSearch: {
    height: 48,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },
  modalSearchInput: {
    flex: 1,
    height: "100%",
    color: "#0F172A",
    fontSize: 14,
    marginLeft: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  contactCountRow: { paddingVertical: 10 },
  contactCount: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  contactListWrapper: { flex: 1, minHeight: 220 },
  contactList: { flex: 1 },
  contactListContent: { paddingBottom: 8 },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  contactAvatar: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactAvatarText: { color: "#2563EB", fontSize: 17, fontWeight: "700" },
  contactInfo: { flex: 1, minWidth: 0 },
  contactName: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  contactPhone: { color: "#64748B", fontSize: 12, marginTop: 3 },
  contactArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  noContacts: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 45,
    paddingHorizontal: 25,
  },
  noContactsIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  noContactsTitle: { color: "#334155", fontSize: 15, fontWeight: "700" },
  noContactsText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 5,
  },
  modalFooter: {
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
  },
  modalCancelButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },

  feedbackOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  feedbackCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  feedbackIconWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  feedbackTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  feedbackMessage: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  feedbackActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    marginTop: 22,
  },
  feedbackSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackSecondaryText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
  },
  feedbackPrimaryButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

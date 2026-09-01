export type AccountAccessRole = "admin" | "member_visibility";

export interface AccountAccessGrant {
  id: string;
  accountId: string;
  accountName?: string;
  invitedByPhone?: string;
  invitedByName?: string;
  role: AccountAccessRole;
  name: string;
  phone: string;
  memberId?: string;
  createdAt: string;
  acceptedAt?: string;
}

export const ACCESS_ROLE_LABEL: Record<AccountAccessRole, string> = {
  admin: "Admin",
  member_visibility: "Member Visibility",
};

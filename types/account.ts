export type AccountType = "apartment" | "home";

export interface BaseAccount {
  id: string;
  ownerId: string; // user who created this account
  type: AccountType;
  name: string; // "Green Valley Apartments" or "My Home - Rajarhat"
  photoUri?: string; // uploaded apartment/home photo
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApartmentAccount extends BaseAccount {
  type: "apartment";
}

export interface HomeAccount extends BaseAccount {
  type: "home";
}

export type Account = ApartmentAccount | HomeAccount;

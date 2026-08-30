export type AccountType = "apartment" | "home";

export interface BaseAccount {
  id: string;
  ownerId: string; // user who created this account
  type: AccountType;
  name: string; // "Green Valley Apartments" or "My Home - Rajarhat"
  photoUri?: string; // uploaded apartment/home photo
  createdAt: string;
  updatedAt: string;
}

export interface ApartmentAccount extends BaseAccount {
  type: "apartment";
  address?: string;
  totalFlats?: number;
  secretaryId: string; // user managing maintenance
}

export interface HomeAccount extends BaseAccount {
  type: "home";
  address?: string;
  isRented: boolean; // true if user pays rent here
}

export type Account = ApartmentAccount | HomeAccount;

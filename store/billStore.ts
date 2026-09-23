// store/billStore.ts
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/api\/?$/, "");

export interface BillTemplateDesign {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    headerBg: string;
    footerBg: string;
  };
  fontFamily: "Roboto" | "Helvetica" | "Arial";
  logoPosition: "top-left" | "top-center" | "top-right";
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  showWatermark: boolean;
  watermarkText?: string;
  layoutVariant: "bold" | "classic" | "minimal";
}

export type BillMemberType = "owner" | "staff";

export type SignatureData =
  | { type: "svg"; svgMarkup: string; width: number; height: number }
  | { type: "image"; uri: string; transparentBg: boolean };

export interface SavedBillConfig {
  templateId: string;
  accentColor: string;
  societyName: string;
  address: string;
  contactNumber: string;
  email: string;
  signature?: SignatureData;
  updatedAt: string;
  layoutSnapshot?: {
    colors: BillTemplateDesign["colors"];
    fontFamily: BillTemplateDesign["fontFamily"];
    logoPosition: BillTemplateDesign["logoPosition"];
    showBorder: boolean;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    showWatermark: boolean;
    watermarkText?: string;
    layoutVariant: BillTemplateDesign["layoutVariant"];
  };
}

interface BillState {
  templates: BillTemplateDesign[];

  /** In-memory cache of configs loaded from the server, keyed by member type. */
  ownerBillConfig: SavedBillConfig | null;
  staffBillConfig: SavedBillConfig | null;

  setLocalConfig: (
    memberType: BillMemberType,
    config: SavedBillConfig | null,
  ) => void;
  getBillConfig: (memberType: BillMemberType) => SavedBillConfig | null;
  getTemplateById: (id: string) => BillTemplateDesign | undefined;

  /** Network ops — always talk to the server. */
  fetchConfigFromServer: (
    accountId: string,
    memberType: BillMemberType,
  ) => Promise<SavedBillConfig | null>;

  saveConfigToServer: (
    accountId: string,
    memberType: BillMemberType,
    config: SavedBillConfig,
  ) => Promise<SavedBillConfig>;
}

export const DEFAULT_TEMPLATES: BillTemplateDesign[] = [
  {
    id: "modern",
    name: "Bold",
    description: "Colored header bar with a strong visual identity",
    colors: {
      primary: "#1a73e8",
      secondary: "#e8f0fe",
      accent: "#34a853",
      background: "#ffffff",
      text: "#0f172a",
      headerBg: "#1a73e8",
      footerBg: "#eff6ff",
    },
    fontFamily: "Roboto",
    logoPosition: "top-left",
    showBorder: false,
    borderColor: "#e0e0e0",
    borderWidth: 0,
    borderRadius: 12,
    showWatermark: false,
    watermarkText: "",
    layoutVariant: "bold",
  },
  {
    id: "elegant",
    name: "Classic",
    description: "Bordered layout with a centered header and rule lines",
    colors: {
      primary: "#2c3e50",
      secondary: "#ecf0f1",
      accent: "#c0392b",
      background: "#ffffff",
      text: "#1a1a1a",
      headerBg: "#ffffff",
      footerBg: "#f8f9fa",
    },
    fontFamily: "Helvetica",
    logoPosition: "top-center",
    showBorder: true,
    borderColor: "#d5dbdb",
    borderWidth: 1,
    borderRadius: 0,
    showWatermark: true,
    watermarkText: "OFFICIAL",
    layoutVariant: "classic",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean black & white layout — printer friendly",
    colors: {
      primary: "#0f172a",
      secondary: "#f1f5f9",
      accent: "#64748b",
      background: "#ffffff",
      text: "#0f172a",
      headerBg: "#ffffff",
      footerBg: "#ffffff",
    },
    fontFamily: "Arial",
    logoPosition: "top-left",
    showBorder: false,
    borderColor: "#e5e7eb",
    borderWidth: 0,
    borderRadius: 4,
    showWatermark: false,
    watermarkText: "",
    layoutVariant: "minimal",
  },
];

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const useBillStore = create<BillState>((set, get) => ({
  templates: DEFAULT_TEMPLATES,
  ownerBillConfig: null,
  staffBillConfig: null,

  setLocalConfig: (memberType, config) =>
    set(() =>
      memberType === "owner"
        ? { ownerBillConfig: config }
        : { staffBillConfig: config },
    ),

  getBillConfig: (memberType) =>
    memberType === "owner" ? get().ownerBillConfig : get().staffBillConfig,

  getTemplateById: (id) => get().templates.find((t) => t.id === id),

  fetchConfigFromServer: async (accountId, memberType) => {
    const res = await fetch(
      `${API_URL}/api/accounts/${accountId}/bills/config/${memberType}`,
      { headers: await authHeaders() },
    );
    if (!res.ok) {
      if (res.status === 404) {
        set(() =>
          memberType === "owner"
            ? { ownerBillConfig: null }
            : { staffBillConfig: null },
        );
        return null;
      }
      throw new Error(`Failed to load bill config (${res.status})`);
    }
    const data = await res.json();
    const config: SavedBillConfig | null = data?.config ?? null;
    set(() =>
      memberType === "owner"
        ? { ownerBillConfig: config }
        : { staffBillConfig: config },
    );
    return config;
  },

  saveConfigToServer: async (accountId, memberType, config) => {
    const res = await fetch(
      `${API_URL}/api/accounts/${accountId}/bills/config/${memberType}`,
      {
        method: "PUT",
        headers: await authHeaders(),
        body: JSON.stringify({ config }),
      },
    );
    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {}
      throw new Error(body?.message || `Save failed (${res.status})`);
    }
    const data = await res.json();
    const saved: SavedBillConfig = data.config;
    set(() =>
      memberType === "owner"
        ? { ownerBillConfig: saved }
        : { staffBillConfig: saved },
    );
    return saved;
  },
}));

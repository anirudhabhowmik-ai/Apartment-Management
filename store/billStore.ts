import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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

  /**
   * Snapshot of the resolved template's layout fields at save time.
   *
   * Storing this makes owner and staff configs fully independent — the
   * PDF generator uses this directly instead of looking up the shared
   * `templates` array. Older configs saved before this field existed
   * won't have it; the PDF code falls back to the live template array.
   */
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
  ownerBillConfig: SavedBillConfig | null;
  staffBillConfig: SavedBillConfig | null;
  setBillConfig: (memberType: BillMemberType, config: SavedBillConfig) => void;
  getBillConfig: (memberType: BillMemberType) => SavedBillConfig | null;
  getTemplateById: (id: string) => BillTemplateDesign | undefined;
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

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      templates: DEFAULT_TEMPLATES,
      ownerBillConfig: null,
      staffBillConfig: null,

      setBillConfig: (memberType, config) =>
        set(() =>
          memberType === "owner"
            ? { ownerBillConfig: config }
            : { staffBillConfig: config },
        ),

      getBillConfig: (memberType) =>
        memberType === "owner" ? get().ownerBillConfig : get().staffBillConfig,

      getTemplateById: (id) => get().templates.find((t) => t.id === id),
    }),
    {
      name: "bill-config-storage",
      storage: createJSONStorage(() => AsyncStorage),

      partialize: (state) => ({
        ownerBillConfig: state.ownerBillConfig,
        staffBillConfig: state.staffBillConfig,
      }),

      // Bumped to 2 because SavedBillConfig gained `layoutSnapshot`.
      // Old configs won't have it — the PDF code falls back to the
      // live template array in that case.
      version: 2,

      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<BillState>;
        return {
          ownerBillConfig: state.ownerBillConfig ?? null,
          staffBillConfig: state.staffBillConfig ?? null,
        };
      },
    },
  ),
);

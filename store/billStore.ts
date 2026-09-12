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
  /** Distinguishes the actual layout of the bill */
  layoutVariant: "bold" | "classic" | "minimal";
}

export type BillMemberType = "owner" | "staff";

// Drawn signatures are stored as a self-contained SVG string.
// Uploaded signatures are stored as an image uri.
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

      // ✅ THE FIX
      // `templates` is static design data that lives in code
      // (DEFAULT_TEMPLATES), not something the user edits. Without this,
      // zustand's persist middleware saves the entire store — including
      // `templates` — to AsyncStorage on first run, and every app
      // restart REHYDRATES from that saved snapshot, silently
      // overwriting whatever DEFAULT_TEMPLATES looks like in the
      // current code. That's why template layout changes (or new
      // fields like layoutVariant) never showed up on-device: the app
      // kept loading a stale cached copy from the very first install.
      //
      // Only persist the two things that are actually user data —
      // the saved owner/staff bill configs. `templates` always comes
      // fresh from DEFAULT_TEMPLATES in code from now on.
      partialize: (state) => ({
        ownerBillConfig: state.ownerBillConfig,
        staffBillConfig: state.staffBillConfig,
      }),

      // Bump this whenever DEFAULT_TEMPLATES' shape changes again in
      // the future, so any other stale persisted fields get dropped
      // instead of silently lingering.
      version: 1,

      // ✅ Required whenever `version` is bumped above the version the
      // device already has saved (every existing install is on the old
      // unversioned/version-0 shape, which still had `templates` baked
      // into the saved blob). Without this, zustand refuses to apply
      // the old saved state at all and logs:
      //   "State loaded from storage couldn't be migrated since no
      //    migrate function was provided"
      // We just pull out the two fields we still care about and ignore
      // everything else (including any stale `templates`) — that stale
      // data is exactly what we're trying to get rid of.
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

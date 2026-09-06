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
  };
}

export type BillMemberType = "owner" | "staff";

// Drawn signatures are stored as a self-contained SVG string (no native
// screenshot library needed - works in Expo Go). Uploaded signatures are
// stored as an image uri, with a flag for the "make background transparent"
// trick applied at PDF-render time (see utils/billGenerator.ts).
export type SignatureData =
  | { type: "svg"; svgMarkup: string; width: number; height: number }
  | { type: "image"; uri: string; transparentBg: boolean };

// "Wing/Building" removed - it varies per flat/member, so it doesn't belong
// in the common template config. Put it in each bill's individual data
// instead (see OwnerBillIndividualData.flatArea/flatNumber usage).
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
    name: "Modern",
    description: "Clean layout with a bold colored header",
    colors: { primary: "#1a73e8", secondary: "#e8f0fe", accent: "#34a853" },
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Classic look with a dark header",
    colors: { primary: "#2c3e50", secondary: "#ecf0f1", accent: "#c0392b" },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Simple black & white, print-friendly",
    colors: { primary: "#1f2937", secondary: "#f5f5f5", accent: "#374151" },
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
    },
  ),
);

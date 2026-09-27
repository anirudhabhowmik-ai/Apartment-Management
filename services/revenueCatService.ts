// services/revenueCatService.ts
import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, {
    CustomerInfo,
    LOG_LEVEL,
    PurchasesOffering,
    PurchasesPackage,
} from "react-native-purchases";

// ── Config ────────────────────────────────────────────────────────────────
const GOOGLE_API_KEY =
  (Constants.expoConfig?.extra as any)?.revenuecatGoogleApiKey || "";
const APPLE_API_KEY =
  (Constants.expoConfig?.extra as any)?.revenuecatAppleApiKey || "";

export const ENTITLEMENT_PRO = "pro";
export const ENTITLEMENT_BUSINESS = "business";

let initialized = false;
let nativeAvailable = true;
let initAttempted = false;

// ── Native availability check ────────────────────────────────────────────
function isNativeAvailable(): boolean {
  try {
    if (!Purchases) return false;
    if (typeof (Purchases as any).configure !== "function") return false;
    if (typeof (Purchases as any).setLogLevel !== "function") return false;
    return true;
  } catch {
    return false;
  }
}

// ── Initialization ────────────────────────────────────────────────────────
export async function initializeRevenueCat(appUserId?: string): Promise<void> {
  // Guard entire function so it can never throw
  try {
    if (initialized) return;
    if (initAttempted) return;
    initAttempted = true;

    // Check native module availability
    if (!isNativeAvailable()) {
      nativeAvailable = false;
      console.log(
        "[revenuecat] Native module not available — skipping init. " +
          "This is expected in Expo Go. Rebuild the dev client to use RevenueCat.",
      );
      return;
    }

    let apiKey = "";
    if (Platform.OS === "android") apiKey = GOOGLE_API_KEY;
    else if (Platform.OS === "ios") apiKey = APPLE_API_KEY;

    if (!apiKey) {
      console.log(
        "[revenuecat] no API key for platform",
        Platform.OS,
        "— SDK not initialized",
      );
      return;
    }

    // setLogLevel — guarded
    try {
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
      } else {
        Purchases.setLogLevel(LOG_LEVEL.ERROR);
      }
    } catch (err) {
      console.log("[revenuecat] setLogLevel not available:", err);
      nativeAvailable = false;
      return;
    }

    // configure — guarded
    try {
      if (appUserId) {
        await Purchases.configure({ apiKey, appUserID: appUserId });
      } else {
        await Purchases.configure({ apiKey });
      }
      initialized = true;
      console.log(
        "[revenuecat] initialized for",
        Platform.OS,
        "user:",
        appUserId,
      );
    } catch (err) {
      console.log("[revenuecat] configure failed:", err);
      nativeAvailable = false;
    }
  } catch (outerErr) {
    // Absolute last-resort guard. Nothing here should ever throw.
    console.log("[revenuecat] initialize crashed silently:", outerErr);
    nativeAvailable = false;
  }
}

// Called on logout so the next user starts fresh
export async function resetRevenueCat(): Promise<void> {
  try {
    if (!nativeAvailable || !initialized) return;
    await Purchases.logOut();
    initialized = false;
    initAttempted = false;
  } catch (err) {
    console.log("[revenuecat] logout:", err);
  }
}

// ── Offerings / Products ──────────────────────────────────────────────────
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  try {
    if (!nativeAvailable || !initialized) return null;
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    console.log("[revenuecat] getOfferings failed:", err);
    return null;
  }
}

// ── Debug helper ──────────────────────────────────────────────────────────
export async function debugOfferings(): Promise<void> {
  try {
    if (!nativeAvailable || !initialized) {
      console.log("[revenuecat:debug] not initialized");
      return;
    }
    const offerings = await Purchases.getOfferings();
    console.log("═══════════ REVENUECAT DEBUG ═══════════");
    console.log(
      "Current offering ID:",
      offerings.current?.identifier ?? "NONE",
    );
    console.log("All offerings:", Object.keys(offerings.all));
    if (offerings.current) {
      console.log(
        "Packages in current offering:",
        offerings.current.availablePackages.map((p) => ({
          identifier: p.identifier,
          productId: p.product.identifier,
          price: p.product.priceString,
        })),
      );
    } else {
      console.log(
        "⚠️ No current offering. Set one in RevenueCat → Product Catalog → Offerings.",
      );
    }
    console.log("═════════════════════════════════════════");
  } catch (err) {
    console.log("[revenuecat:debug] error:", err);
  }
}

// ── Purchase ──────────────────────────────────────────────────────────────
export type PurchaseResult =
  | { success: true; customerInfo: CustomerInfo }
  | { success: false; cancelled: boolean; error: string };

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  try {
    if (!nativeAvailable || !initialized) {
      return {
        success: false,
        cancelled: false,
        error: "Purchases are not available in this build.",
      };
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (err: any) {
    const cancelled = err?.userCancelled === true;
    return {
      success: false,
      cancelled,
      error: cancelled
        ? "Purchase cancelled."
        : err?.message || "Purchase failed. Please try again.",
    };
  }
}

// ── Restore ───────────────────────────────────────────────────────────────
export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    if (!nativeAvailable || !initialized) return null;
    return await Purchases.restorePurchases();
  } catch (err) {
    console.log("[revenuecat] restore failed:", err);
    return null;
  }
}

// ── Customer Info ─────────────────────────────────────────────────────────
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    if (!nativeAvailable || !initialized) return null;
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.log("[revenuecat] getCustomerInfo failed:", err);
    return null;
  }
}

// ── Entitlement helpers ───────────────────────────────────────────────────
export function hasEntitlement(
  info: CustomerInfo | null,
  entitlementId: string,
): boolean {
  if (!info) return false;
  return info.entitlements.active[entitlementId] !== undefined;
}

export function isPro(info: CustomerInfo | null): boolean {
  return hasEntitlement(info, ENTITLEMENT_PRO);
}

export function isBusiness(info: CustomerInfo | null): boolean {
  return hasEntitlement(info, ENTITLEMENT_BUSINESS);
}

export function planIdFromCustomerInfo(info: CustomerInfo | null): string {
  if (isBusiness(info)) return "business";
  if (isPro(info)) return "pro";
  return "free";
}

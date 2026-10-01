// services/paymentService.ts
import { getSecureItem } from "../utils/tokenStorage";
const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/api\/?$/, "");
const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || "";
const AUTH_TOKEN_KEY = "auth_token";

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  signature?: string;
  error?: string;
}

interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  amount: number;
  currency: string;
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await getSecureItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform detection
// ─────────────────────────────────────────────────────────────────────────────

function isWebPlatform(): boolean {
  try {
    const { Platform } = require("react-native");
    return Platform?.OS === "web";
  } catch {
    return false;
  }
}

// APK builds (development/preview) use Razorpay on Android too — see
// EXPO_PUBLIC_PAYMENT_PROVIDER in eas.json. Only the Play Store app-bundle
// build sets it to "google_play", which is the only case Razorpay must be
// blocked for (Play policy requires Google Play Billing there).
function isGooglePlayBillingBuild(): boolean {
  try {
    const { Platform } = require("react-native");
    if (Platform?.OS !== "android") return false;
    return (process.env.EXPO_PUBLIC_PAYMENT_PROVIDER ?? "google_play") ===
      "google_play";
  } catch {
    return false;
  }
}

/**
 * Tells the backend which client is calling, so it knows whether Razorpay
 * is an allowed payment method for this build.
 *   web   → Razorpay web checkout is allowed
 *   mobile → Razorpay is blocked; RevenueCat/Google Play Billing handles payments
 */
function getPlatformHeader(): "web" | "mobile" {
  if (isWebPlatform()) return "web";
  // Android APK builds (Razorpay-enabled) are reported like "web" so the
  // backend's existing web/mobile guard allows Razorpay order creation.
  return isGooglePlayBillingBuild() ? "mobile" : "web";
}

/**
 * Shared headers for every request this service makes.
 * Includes the platform header that the backend guard reads.
 */
async function buildHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-app-platform": getPlatformHeader(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Native module loader (Android / iOS only)
// ─────────────────────────────────────────────────────────────────────────────

type RazorpayCheckoutModule = {
  open: (options: any) => Promise<any>;
};

let cachedRazorpay: RazorpayCheckoutModule | null = null;

function loadRazorpayNative(): RazorpayCheckoutModule {
  if (cachedRazorpay) return cachedRazorpay;

  if (isWebPlatform()) {
    throw new Error(
      "Razorpay native module is not available on web. Use the web checkout instead.",
    );
  }

  try {
    const mod = require("react-native-razorpay");
    const resolved = mod?.default ?? mod;

    if (!resolved || typeof resolved.open !== "function") {
      throw new Error(
        "Razorpay native module is not linked. Rebuild the Android/iOS app after installing react-native-razorpay.",
      );
    }

    cachedRazorpay = resolved as RazorpayCheckoutModule;
    return cachedRazorpay;
  } catch (err: any) {
    const message =
      err instanceof Error
        ? err.message
        : String(err?.message ?? err ?? "Unknown error");
    throw new Error(
      message ||
        "Razorpay is not available in this build. Please rebuild the app with the native module installed.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Web checkout (Razorpay checkout.js)
// ─────────────────────────────────────────────────────────────────────────────

const RAZORPAY_WEB_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let webScriptPromise: Promise<void> | null = null;

function loadRazorpayWebScript(): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Web checkout is not available."));
  }

  const w = window as any;
  if (w.Razorpay) return Promise.resolve();

  if (webScriptPromise) return webScriptPromise;

  webScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_WEB_SCRIPT_SRC}"]`,
    );

    if (existing) {
      if ((window as any).Razorpay) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Razorpay script.")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_WEB_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Razorpay checkout script."));
    document.body.appendChild(script);
  });

  return webScriptPromise;
}

async function openRazorpayOnWeb(options: {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}): Promise<{
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}> {
  await loadRazorpayWebScript();

  const Razorpay = (window as any).Razorpay;
  if (!Razorpay) {
    throw {
      error: {
        code: "SCRIPT_NOT_LOADED",
        description: "Razorpay checkout script is unavailable.",
      },
    };
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const rzp = new Razorpay({
      key: options.key,
      amount: options.amount,
      currency: options.currency,
      name: options.name,
      description: options.description,
      order_id: options.order_id,
      prefill: options.prefill || {},
      theme: options.theme || { color: "#2563EB" },

      handler: (response: any) => {
        settled = true;
        resolve({
          razorpay_payment_id: response?.razorpay_payment_id,
          razorpay_order_id: response?.razorpay_order_id,
          razorpay_signature: response?.razorpay_signature,
        });
      },

      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          reject({
            error: {
              code: "PAYMENT_CANCELLED",
              reason: "payment_cancelled",
              description: "Payment was cancelled by the user.",
            },
          });
        },
      },
    });

    rzp.on("payment.failed", (resp: any) => {
      if (settled) return;
      settled = true;
      reject({
        error: {
          code: resp?.error?.code || "PAYMENT_FAILED",
          description:
            resp?.error?.description || "Payment failed. Please try again.",
          reason: resp?.error?.reason || "",
          source: resp?.error?.source || "",
          step: resp?.error?.step || "",
        },
      });
    });

    rzp.open();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const formatIndianPhoneNumber = (phone?: string): string => {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const last10Digits = digits.slice(-10);
  if (last10Digits.length !== 10) return "";
  return `+91${last10Digits}`;
};

const createOrderOnBackend = async (
  accountId: string,
  planId: string,
  billingPeriod: "monthly" | "yearly",
): Promise<CreateOrderResponse> => {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  const headers = await buildHeaders();

  if (!headers.Authorization) {
    throw new Error("You are not signed in. Please log in again.");
  }

  try {
    const response = await fetch(`${API_URL}/api/payment/create-order`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        accountId,
        plan_id: planId,
        billing_period: billingPeriod,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // Surface the backend's real message so the user sees something useful
      const msg =
        data?.message || data?.error || `Backend error: ${response.status}`;
      throw new Error(msg);
    }

    if (!data?.success) {
      throw new Error(
        data?.error || data?.message || "Unable to create Razorpay order.",
      );
    }

    if (!data?.orderId) {
      throw new Error("Backend did not return a Razorpay order ID.");
    }

    return {
      success: true,
      orderId: data.orderId,
      amount:
        typeof data.amount === "number" ? data.amount : Number(data.amount),
      currency: data.currency || "INR",
    };
  } catch (error: any) {
    console.error("Create Razorpay order error:", error);
    throw new Error(error?.message || "Unable to create payment order.");
  }
};

const parseRazorpayError = (error: any) => {
  let razorpayError = error?.error || null;

  const description =
    typeof error?.description === "string" ? error.description : "";

  if (description) {
    try {
      const parsed = JSON.parse(description);
      if (parsed?.error) {
        razorpayError = parsed.error;
      }
    } catch {
      // Description is normal text.
    }
  }

  return {
    code: razorpayError?.code || error?.code || "",
    description: razorpayError?.description || "",
    reason: razorpayError?.reason || "",
    source: razorpayError?.source || "",
    step: razorpayError?.step || "",
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const startRazorpayPayment = async (
  accountId: string,
  planId: string,
  billingPeriod: "monthly" | "yearly",
  user: {
    name?: string;
    email?: string;
    phone?: string;
  },
): Promise<PaymentResponse> => {
  try {
    if (!API_URL) {
      return { success: false, error: "Payment API URL is not configured." };
    }

    if (!accountId) {
      return { success: false, error: "Missing account ID." };
    }

    if (!planId) {
      return { success: false, error: "Missing plan ID." };
    }

    if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
      return { success: false, error: "Invalid billing period." };
    }

    if (!RAZORPAY_KEY_ID) {
      return {
        success: false,
        error:
          "Razorpay Key ID is not configured. Add EXPO_PUBLIC_RAZORPAY_KEY_ID to your .env and rebuild the app.",
      };
    }

    const contact = formatIndianPhoneNumber(user.phone);

    console.log("Razorpay customer information:", {
      name: user.name || "",
      email: user.email || "",
      contact,
      platform: getPlatformHeader(),
    });

    console.log("Creating Razorpay order...", {
      accountId,
      planId,
      billingPeriod,
    });

    const order = await createOrderOnBackend(accountId, planId, billingPeriod);

    console.log("Razorpay order created:", order.orderId);

    const amountInPaise = Math.round(order.amount * 100);

    const options = {
      description: `${planId} (${billingPeriod}) subscription`,
      currency: order.currency || "INR",
      key: RAZORPAY_KEY_ID,
      amount: amountInPaise,
      name: "Apartment Management",
      order_id: order.orderId,
      prefill: {
        name: user.name || "",
        email: user.email || "",
        contact,
      },
      theme: {
        color: "#2563EB",
      },
    };

    // ─────────────────────────────────────────────────────────────────────
    // WEB — Razorpay checkout.js
    // ─────────────────────────────────────────────────────────────────────
    if (isWebPlatform()) {
      console.log("Opening Razorpay web checkout…");

      const data = await openRazorpayOnWeb({
        key: options.key,
        amount: options.amount,
        currency: options.currency,
        name: options.name,
        description: options.description,
        order_id: options.order_id,
        prefill: options.prefill,
        theme: options.theme,
      });

      console.log("Razorpay web payment response:", data);

      const paymentId = data?.razorpay_payment_id;
      const orderId = data?.razorpay_order_id || order.orderId;
      const signature = data?.razorpay_signature;

      if (!paymentId || !orderId || !signature) {
        console.error("Incomplete Razorpay web payment response:", data);
        return {
          success: false,
          error:
            "Razorpay did not return complete payment verification details.",
        };
      }

      return { success: true, paymentId, orderId, signature };
    }

    // ─────────────────────────────────────────────────────────────────────
    // NATIVE (Android / iOS) — react-native-razorpay
    // ─────────────────────────────────────────────────────────────────────
    let RazorpayCheckout: RazorpayCheckoutModule;
    try {
      RazorpayCheckout = loadRazorpayNative();
    } catch (loadErr: any) {
      console.error("Razorpay native module load failed:", loadErr);
      return {
        success: false,
        error:
          loadErr?.message ||
          "Razorpay is not available in this build. Please rebuild the app.",
      };
    }

    const data = await RazorpayCheckout.open(options);

    console.log("Razorpay payment response:", data);

    const paymentId = data?.razorpay_payment_id;
    const orderId = data?.razorpay_order_id || order.orderId;
    const signature = data?.razorpay_signature;

    if (!paymentId || !orderId || !signature) {
      console.error("Incomplete Razorpay payment response:", data);
      return {
        success: false,
        error: "Razorpay did not return complete payment verification details.",
      };
    }

    return { success: true, paymentId, orderId, signature };
  } catch (error: any) {
    console.error("Razorpay payment error:", error);

    const parsed = parseRazorpayError(error);
    console.error("Parsed Razorpay error:", parsed);

    const reason = String(parsed.reason || "").toLowerCase();
    const description = String(parsed.description || "").toLowerCase();

    if (
      reason === "payment_cancelled" ||
      reason === "user_cancelled" ||
      reason === "cancelled" ||
      reason === "payment_cancel" ||
      parsed.code === "PAYMENT_CANCELLED" ||
      description.includes("cancel")
    ) {
      console.log("Razorpay Checkout cancelled by user.");
      return { success: false, error: "Payment was cancelled." };
    }

    if (reason === "payment_error") {
      console.log("Razorpay reported a payment error.");
      return {
        success: false,
        error: "Payment could not be completed. Please try again.",
      };
    }

    if (parsed.step === "payment_authentication") {
      return {
        success: false,
        error:
          "Payment authentication failed. Please try again or use another payment method.",
      };
    }

    return {
      success: false,
      error:
        parsed.description ||
        error?.message ||
        "Payment failed. Please try again.",
    };
  }
};

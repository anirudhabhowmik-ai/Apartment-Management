// services/paymentService.ts
//
// IMPORTANT: We do NOT statically import `react-native-razorpay` at the top.
// Doing so crashes the whole tab navigator at load time whenever:
//   • the native module isn't linked (Expo Go / stale dev build)
//   • the code runs on Web
//
// Instead we lazy-load the native module inside startRazorpayPayment, and
// degrade gracefully if it isn't available.

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || "";

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

interface VerifyPaymentResponse {
  success: boolean;
  message?: string;
  paymentId?: string;
  orderId?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy native module loader
// ─────────────────────────────────────────────────────────────────────────────

type RazorpayCheckoutModule = {
  open: (options: any) => Promise<any>;
};

let cachedRazorpay: RazorpayCheckoutModule | null = null;

function isWebPlatform(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require("react-native");
    return Platform?.OS === "web";
  } catch {
    return false;
  }
}

function loadRazorpayNative(): RazorpayCheckoutModule {
  if (cachedRazorpay) return cachedRazorpay;

  if (isWebPlatform()) {
    throw new Error(
      "Razorpay Checkout is not available on web. Please use the mobile app to complete payments.",
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
  amount: number,
  planName: string,
): Promise<CreateOrderResponse> => {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  try {
    const response = await fetch(`${API_URL}/payment/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        planName,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || `Backend error: ${response.status}`,
      );
    }

    if (!data?.success) {
      throw new Error(data?.error || "Unable to create Razorpay order.");
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

const verifyPaymentOnBackend = async (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): Promise<VerifyPaymentResponse> => {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  try {
    const response = await fetch(`${API_URL}/payment/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error ||
          data?.message ||
          `Payment verification failed: ${response.status}`,
      );
    }

    if (!data?.success) {
      throw new Error(data?.error || "Payment verification failed.");
    }

    return {
      success: true,
      message: data.message || "Payment verified successfully.",
      paymentId: data.paymentId || razorpayPaymentId,
      orderId: data.orderId || razorpayOrderId,
    };
  } catch (error: any) {
    console.error("Razorpay payment verification error:", error);
    throw new Error(error?.message || "Unable to verify payment.");
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
  amount: number,
  planName: string,
  user: {
    name?: string;
    email?: string;
    phone?: string;
  },
): Promise<PaymentResponse> => {
  try {
    if (!API_URL) {
      return {
        success: false,
        error: "Payment API URL is not configured.",
      };
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: "Invalid payment amount.",
      };
    }

    if (!planName || typeof planName !== "string") {
      return {
        success: false,
        error: "Plan name is required.",
      };
    }

    if (!RAZORPAY_KEY_ID) {
      return {
        success: false,
        error:
          "Razorpay Key ID is not configured. Add EXPO_PUBLIC_RAZORPAY_KEY_ID to your .env and rebuild the Android APK.",
      };
    }

    // ── Lazy-load the native module ONLY when we actually need it ──
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

    const contact = formatIndianPhoneNumber(user.phone);

    console.log("Razorpay customer information:", {
      name: user.name || "",
      email: user.email || "",
      contact,
    });

    console.log("Creating Razorpay order...");

    const order = await createOrderOnBackend(amount, planName);

    console.log("Razorpay order created:", order.orderId);

    const amountInPaise = Math.round(order.amount * 100);

    const options = {
      description: `${planName} Plan Subscription`,
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

    console.log("Verifying Razorpay payment on backend...");

    const verification = await verifyPaymentOnBackend(
      orderId,
      paymentId,
      signature,
    );

    if (!verification.success) {
      return {
        success: false,
        error: verification.error || "Payment verification failed.",
      };
    }

    return {
      success: true,
      paymentId,
      orderId,
      signature,
    };
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
      description.includes("cancel")
    ) {
      console.log("Razorpay Checkout cancelled by user.");
      return {
        success: false,
        error: "Payment was cancelled.",
      };
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

import RazorpayCheckout from "react-native-razorpay";

/**
 * Backend API URL
 *
 * Comes from:
 *   EXPO_PUBLIC_API_URL=http://103.75.163.121:5000/api
 *
 * So `${API_URL}/payment/create-order` becomes:
 *   http://103.75.163.121:5000/api/payment/create-order
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Razorpay PUBLIC Key ID.
 *
 * Comes from:
 *   EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
 *
 * IMPORTANT:
 *   NEVER put Razorpay Key SECRET here.
 *   The secret lives only on the backend.
 */
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

/**
 * Create a real Razorpay order through the Express backend.
 *
 * Flow:
 *   React Native  →  Express backend  →  Razorpay API
 *                                       →  real Razorpay order ID
 */
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
      body: JSON.stringify({ amount, planName }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || `Backend error: ${response.status}`,
      );
    }

    if (!data?.orderId) {
      throw new Error("Backend did not return a Razorpay order ID.");
    }

    return {
      success: true,
      orderId: data.orderId,
      amount: typeof data.amount === "number" ? data.amount : amount,
      currency: data.currency || "INR",
    };
  } catch (error: any) {
    console.error("Create Razorpay order error:", error);
    throw new Error(error?.message || "Unable to create payment order.");
  }
};

/**
 * Start Razorpay payment.
 *
 * Steps:
 *   1. Validate payment information.
 *   2. Ask Express backend to create a Razorpay order.
 *   3. Receive real Razorpay order ID.
 *   4. Open native Razorpay Checkout.
 *   5. Receive payment response.
 *
 * Payment signature must be verified on the backend
 * via `/payment/verify` before you mark the payment as paid.
 */
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
    // ------------------------------------------------
    // Validate API URL
    // ------------------------------------------------
    if (!API_URL) {
      return {
        success: false,
        error: "Payment API URL is not configured.",
      };
    }

    // ------------------------------------------------
    // Validate amount
    // ------------------------------------------------
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: "Invalid payment amount.",
      };
    }

    // ------------------------------------------------
    // Validate Razorpay Key ID
    // ------------------------------------------------
    if (!RAZORPAY_KEY_ID) {
      return {
        success: false,
        error:
          "Razorpay Key ID is not configured. Add EXPO_PUBLIC_RAZORPAY_KEY_ID to your .env and restart with `npx expo start -c`.",
      };
    }

    // ------------------------------------------------
    // STEP 1 — Create REAL Razorpay order
    // ------------------------------------------------
    console.log("Creating Razorpay order...");
    const order = await createOrderOnBackend(amount, planName);
    console.log("Razorpay order created:", order.orderId);

    // ------------------------------------------------
    // Prepare customer phone number
    // ------------------------------------------------
    const contact = user.phone ? user.phone.replace(/\D/g, "").slice(-10) : "";

    // ------------------------------------------------
    // STEP 2 — Razorpay Checkout options
    // ------------------------------------------------
    const options = {
      description: `${planName} Plan Subscription`,

      // Replace with your publicly accessible logo URL
      image: "https://your-app-logo-url.com/logo.png",

      currency: order.currency || "INR",

      // PUBLIC Razorpay Key ID
      key: RAZORPAY_KEY_ID,

      // Razorpay expects paise: ₹499 = 49900
      amount: Math.round(order.amount * 100),

      name: "Apartment Management",

      // MUST be the real Razorpay order ID from backend
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

    console.log("Opening Razorpay Checkout...");

    // ------------------------------------------------
    // STEP 3 — Open REAL native Razorpay Checkout
    // ------------------------------------------------
    const data = await RazorpayCheckout.open(options);
    console.log("Razorpay payment response:", data);

    // ------------------------------------------------
    // STEP 4 — Return payment info
    // ------------------------------------------------
    return {
      success: true,
      paymentId: data.razorpay_payment_id,
      orderId: data.razorpay_order_id || order.orderId,
      signature: data.razorpay_signature,
    };
  } catch (error: any) {
    console.error("Razorpay payment error:", error);

    // ------------------------------------------------
    // Payment cancelled by user
    // ------------------------------------------------
    const description = error?.description || "";

    if (
      error?.code === 0 ||
      error?.code === 1 ||
      description.toLowerCase().includes("cancel")
    ) {
      return {
        success: false,
        error: "Payment was cancelled.",
      };
    }

    // ------------------------------------------------
    // Other Razorpay/backend errors
    // ------------------------------------------------
    return {
      success: false,
      error: description || error?.message || "Payment failed.",
    };
  }
};

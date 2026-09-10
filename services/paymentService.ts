// services/paymentService.ts
import RazorpayCheckout from "react-native-razorpay";

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  error?: string;
}

export const startRazorpayPayment = async (
  amount: number,
  planName: string,
  user: { name?: string; email?: string; phone?: string },
): Promise<PaymentResponse> => {
  // 1. IMPORTANT: In a real app, you MUST call your backend here to create an order.
  // const orderResponse = await fetch('https://your-api.com/create-order', { ... });
  // const orderId = orderResponse.data.id;
  const mockOrderId = `order_${Date.now()}`; // Temporary for testing

  const options = {
    description: `${planName} Plan Subscription`,
    image: "https://your-app-logo-url.com/logo.png", // Replace with your actual logo URL
    currency: "INR",
    key: "YOUR_RAZORPAY_KEY_ID", // ⚠️ Replace with your Razorpay Key ID
    amount: amount * 100, // Razorpay expects amount in paise (₹499 = 49900)
    name: "Apartment Management",
    order_id: mockOrderId,
    prefill: {
      email: user.email || "user@example.com",
      contact: user.phone || "9876543210",
      name: user.name || "User",
    },
    theme: { color: "#2563EB" }, // Matches your app's primary brand color
  };

  try {
    // 2. This single line opens the default Razorpay UI
    const data = await RazorpayCheckout.open(options);

    return {
      success: true,
      paymentId: data.razorpay_payment_id,
    };
  } catch (error: any) {
    // User closed the modal or payment failed
    return {
      success: false,
      error: error.description || "Payment was cancelled",
    };
  }
};

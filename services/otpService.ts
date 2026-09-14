import { OTPWidget } from "@msg91comm/sendotp-react-native";

const MSG91_WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID;
const MSG91_TOKEN = process.env.EXPO_PUBLIC_MSG91_WIDGET_TOKEN;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

interface SendOtpResponse {
  success: boolean;
  message?: string;
}

interface VerifyOtpResponse {
  success: boolean;
  userId?: string;
  token?: string;
  phone?: string;
  message?: string;
}

let widgetInitialized = false;
let currentReqId: string | null = null;

/**
 * Return the error message provided by MSG91.
 *
 * We intentionally do NOT guess MSG91 error messages or codes.
 * MSG91 controls resend limits, retry timing and OTP expiry.
 */
function getMsg91ErrorMessage(message?: unknown): string {
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return "Unable to process OTP. Please try again.";
}

/**
 * Initialize MSG91 Widget only once.
 */
function initializeWidget() {
  if (widgetInitialized) {
    return;
  }

  if (!MSG91_WIDGET_ID || !MSG91_TOKEN) {
    throw new Error(
      "MSG91 Widget configuration is missing. Check EXPO_PUBLIC_MSG91_WIDGET_ID and EXPO_PUBLIC_MSG91_WIDGET_TOKEN.",
    );
  }

  OTPWidget.initializeWidget(MSG91_WIDGET_ID, MSG91_TOKEN);

  widgetInitialized = true;
}

/**
 * Send OTP through MSG91.
 *
 * MSG91 controls:
 * - Resend count
 * - Resend time
 * - OTP expiration
 */
export async function sendOtp(phone: string): Promise<SendOtpResponse> {
  try {
    initializeWidget();

    const identifier = phone.replace(/\D/g, "");

    if (!/^91[6-9]\d{9}$/.test(identifier)) {
      return {
        success: false,
        message: "Invalid Indian phone number.",
      };
    }

    console.log("Sending OTP through MSG91:", identifier);

    const response = await OTPWidget.sendOTP({
      identifier,
    });

    console.log("MSG91 send OTP response:", response);

    /**
     * MSG91 successful Send OTP response:
     *
     * {
     *   type: "success",
     *   message: "<reqId>"
     * }
     *
     * The reqId is required for OTP verification/retry.
     */

    const reqId =
      response?.message ||
      response?.reqId ||
      response?.["req-id"] ||
      response?.data?.reqId;

    if (response?.type !== "success" || !reqId) {
      console.error("MSG91 send OTP failed:", response);

      return {
        success: false,
        message: getMsg91ErrorMessage(response?.message),
      };
    }

    currentReqId = String(reqId);

    console.log("MSG91 reqId saved:", currentReqId);

    return {
      success: true,
      message: "OTP sent successfully.",
    };
  } catch (error) {
    console.error("MSG91 send OTP error:", error);

    return {
      success: false,
      message: "Unable to send OTP. Please try again.",
    };
  }
}

/**
 * Verify OTP with MSG91.
 *
 * After MSG91 successfully verifies the OTP,
 * MSG91 returns an access token.
 *
 * That access token is then sent to our backend.
 *
 * Our backend independently verifies the access token
 * using the private MSG91_AUTHKEY.
 */
export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  try {
    initializeWidget();

    // =========================================================
    // Validate backend configuration
    // =========================================================

    if (!API_BASE_URL) {
      console.error("EXPO_PUBLIC_API_URL is missing.");

      return {
        success: false,
        message: "Backend API URL is not configured.",
      };
    }

    // =========================================================
    // Validate phone
    // =========================================================

    const identifier = phone.replace(/\D/g, "");

    if (!/^91[6-9]\d{9}$/.test(identifier)) {
      return {
        success: false,
        message: "Invalid Indian phone number.",
      };
    }

    // =========================================================
    // Validate OTP
    // =========================================================

    if (!/^\d{6}$/.test(otp)) {
      return {
        success: false,
        message: "OTP must be 6 digits.",
      };
    }

    // =========================================================
    // Check reqId
    // =========================================================

    if (!currentReqId) {
      console.error("MSG91 reqId is missing.");

      return {
        success: false,
        message: "OTP session expired. Please request a new OTP.",
      };
    }

    console.log("Verifying OTP with MSG91 reqId:", currentReqId);

    // =========================================================
    // Verify OTP with MSG91
    // =========================================================

    const response = await OTPWidget.verifyOTP({
      reqId: currentReqId,
      otp,
    });

    console.log("MSG91 OTP verification response:", response);

    // =========================================================
    // IMPORTANT:
    //
    // Only a successful MSG91 response can provide
    // the access token.
    // =========================================================

    if (response?.type !== "success") {
      console.error("MSG91 OTP verification failed:", response);

      return {
        success: false,
        message: getMsg91ErrorMessage(response?.message),
      };
    }

    // =========================================================
    // MSG91 access token
    // =========================================================

    const accessToken = response?.message;

    if (!accessToken) {
      console.error(
        "MSG91 verification succeeded but no access token was returned:",
        response,
      );

      return {
        success: false,
        message: "OTP verification failed. Access token was not received.",
      };
    }

    console.log("MSG91 access token received.");

    // =========================================================
    // Send MSG91 access token to our backend
    // =========================================================

    const backendResponse = await fetch(`${API_BASE_URL}/auth/verify-widget`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        phone: identifier,
        accessToken,
      }),
    });

    // =========================================================
    // Read backend response
    // =========================================================

    let backendData: any = null;

    try {
      backendData = await backendResponse.json();
    } catch {
      backendData = null;
    }

    console.log(
      "Backend authentication response:",
      backendResponse.status,
      backendData,
    );

    // =========================================================
    // Backend authentication failed
    // =========================================================

    if (!backendResponse.ok || !backendData?.success) {
      console.error(
        "Backend authentication failed:",
        backendResponse.status,
        backendData,
      );

      return {
        success: false,
        message:
          backendData?.message || "Authentication failed. Please try again.",
      };
    }

    // =========================================================
    // Authentication completely succeeded
    // =========================================================

    currentReqId = null;

    return {
      success: true,
      userId: backendData.user?.id,
      token: backendData.token,
      phone: backendData.user?.phone,
      message: backendData.message,
    };
  } catch (error) {
    console.error("OTP verification error:", error);

    return {
      success: false,
      message: "Unable to verify OTP. Please try again.",
    };
  }
}

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

// MSG91 returns the request ID from sendOTP()
// and we need that same request ID when verifying.
let currentReqId: string | null = null;

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

    /*
     * MSG91 normal OTP response:
     *
     * {
     *   type: "success",
     *   message: "<reqId>"
     * }
     *
     * The reqId must be passed to verifyOTP().
     */
    const reqId =
      response?.message ||
      response?.reqId ||
      response?.["req-id"] ||
      response?.data?.reqId;

    /*
     * Invisible OTP can sometimes verify immediately.
     * In that case MSG91 may return an access token directly.
     *
     * We do not need to handle that here because the current
     * app uses the normal OTP flow.
     */
    if (response?.type !== "success" || !reqId) {
      console.error(
        "MSG91 send OTP failed or reqId was not returned:",
        response,
      );

      return {
        success: false,
        message: response?.message || "Unable to send OTP. Please try again.",
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

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  try {
    initializeWidget();

    if (!API_BASE_URL) {
      console.error("EXPO_PUBLIC_API_URL is missing.");

      return {
        success: false,
        message: "Backend API URL is not configured.",
      };
    }

    const identifier = phone.replace(/\D/g, "");

    if (!/^91[6-9]\d{9}$/.test(identifier)) {
      return {
        success: false,
        message: "Invalid Indian phone number.",
      };
    }

    if (!/^\d{6}$/.test(otp)) {
      return {
        success: false,
        message: "OTP must be 6 digits.",
      };
    }

    if (!currentReqId) {
      console.error("MSG91 reqId is missing.");

      return {
        success: false,
        message: "OTP session expired. Please request a new OTP.",
      };
    }

    console.log("Verifying OTP with MSG91 reqId:", currentReqId);

    /*
     * IMPORTANT:
     *
     * MSG91 React Native SDK expects:
     *
     * {
     *   reqId: "...",
     *   otp: "123456"
     * }
     */
    const response = await OTPWidget.verifyOTP({
      reqId: currentReqId,
      otp,
    });

    if (response?.type !== "success") {
      console.error("MSG91 OTP verification failed:", response);

      return {
        success: false,
        message:
          response?.message || "Invalid OTP. Please enter the correct OTP.",
      };
    }

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

    /*
     * Login completed successfully.
     *
     * Clear the old OTP request ID so it cannot
     * accidentally be reused.
     */
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

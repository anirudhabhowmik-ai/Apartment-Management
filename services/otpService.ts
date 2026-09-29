// services/otpService.ts
import { OTPWidget } from "@msg91comm/sendotp-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MSG91_WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID;
const MSG91_TOKEN = process.env.EXPO_PUBLIC_MSG91_WIDGET_TOKEN;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const REQ_ID_STORAGE_PREFIX = "msg91_reqid:";

// Must match backend REVIEWER_PHONE.
const REVIEWER_PHONE = "9999999999";

function toTenDigits(phone: string): string {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

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
  code?: "account_deleted" | string;
  recoveryToken?: string;
}

export interface VerifyOtpOnlyResponse {
  success: boolean;
  accessToken?: string;
  phone?: string;
  message?: string;
}

let widgetInitialized = false;

const reqIdByPhone: Record<string, string> = {};

function storageKey(identifier: string) {
  return `${REQ_ID_STORAGE_PREFIX}${identifier}`;
}

async function setReqId(identifier: string, reqId: string) {
  reqIdByPhone[identifier] = reqId;
  try {
    await AsyncStorage.setItem(storageKey(identifier), reqId);
  } catch (e) {
    console.warn("[otpService] setReqId storage failed:", e);
  }
}

async function getReqId(identifier: string): Promise<string | null> {
  if (reqIdByPhone[identifier]) return reqIdByPhone[identifier];
  try {
    const stored = await AsyncStorage.getItem(storageKey(identifier));
    if (stored) {
      reqIdByPhone[identifier] = stored;
      return stored;
    }
  } catch (e) {
    console.warn("[otpService] getReqId storage failed:", e);
  }
  return null;
}

async function clearReqId(identifier: string) {
  delete reqIdByPhone[identifier];
  try {
    await AsyncStorage.removeItem(storageKey(identifier));
  } catch (e) {
    console.warn("[otpService] clearReqId storage failed:", e);
  }
}

function getMsg91ErrorMessage(message?: unknown): string {
  if (typeof message === "string" && message.trim()) return message;
  return "Unable to process OTP. Please try again.";
}

function initializeWidget() {
  if (widgetInitialized) return;
  if (!MSG91_WIDGET_ID || !MSG91_TOKEN) {
    throw new Error(
      "MSG91 Widget configuration is missing. Check EXPO_PUBLIC_MSG91_WIDGET_ID and EXPO_PUBLIC_MSG91_WIDGET_TOKEN.",
    );
  }
  OTPWidget.initializeWidget(MSG91_WIDGET_ID, MSG91_TOKEN);
  widgetInitialized = true;
}

function normalizePhoneForMsg91(phone: string): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (!/^91[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

export async function sendOtp(phone: string): Promise<SendOtpResponse> {
  try {
    const ten = toTenDigits(phone);

    if (ten === REVIEWER_PHONE) {
      console.log("[otpService] Reviewer mode — skipping MSG91 send");
      return { success: true, message: "OTP sent successfully." };
    }

    initializeWidget();

    const identifier = normalizePhoneForMsg91(phone);
    if (!identifier) {
      return { success: false, message: "Invalid Indian phone number." };
    }

    console.log("[otpService] Sending OTP through MSG91 for", identifier);

    const response = await OTPWidget.sendOTP({ identifier });
    console.log("[otpService] MSG91 send OTP response:", response);

    const reqId =
      response?.message ||
      response?.reqId ||
      response?.["req-id"] ||
      response?.data?.reqId;

    if (response?.type !== "success" || !reqId) {
      console.error("[otpService] MSG91 send OTP failed:", response);
      return {
        success: false,
        message: getMsg91ErrorMessage(response?.message),
      };
    }

    await setReqId(identifier, String(reqId));
    console.log("[otpService] reqId saved for", identifier, "→", reqId);

    return { success: true, message: "OTP sent successfully." };
  } catch (error) {
    console.error("[otpService] sendOtp error:", error);
    return { success: false, message: "Unable to send OTP. Please try again." };
  }
}

async function msg91VerifyAndGetAccessToken(
  phone: string,
  otp: string,
): Promise<{
  success: boolean;
  accessToken?: string;
  identifier?: string;
  message?: string;
}> {
  initializeWidget();

  const identifier = normalizePhoneForMsg91(phone);
  if (!identifier) {
    return { success: false, message: "Invalid Indian phone number." };
  }

  if (!/^\d{6}$/.test(otp)) {
    return { success: false, message: "OTP must be 6 digits." };
  }

  const reqId = await getReqId(identifier);

  console.log("[otpService] verify called", {
    identifier,
    hasReqId: !!reqId,
    reqId,
  });

  if (!reqId) {
    console.error(
      "[otpService] reqId missing for",
      identifier,
      "— did sendOtp() succeed on this exact phone?",
    );
    return {
      success: false,
      message: "OTP session expired. Please request a new OTP.",
    };
  }

  console.log("[otpService] Verifying OTP with MSG91 reqId:", reqId);

  const response = await OTPWidget.verifyOTP({ reqId, otp });
  console.log("[otpService] MSG91 verify response:", response);

  if (response?.type !== "success") {
    console.error("[otpService] MSG91 verify failed:", response);
    return {
      success: false,
      message: getMsg91ErrorMessage(response?.message),
    };
  }

  const accessToken = response?.message;
  if (!accessToken) {
    console.error(
      "[otpService] MSG91 verify succeeded but no access token was returned:",
      response,
    );
    return {
      success: false,
      message: "OTP verification failed. Access token was not received.",
    };
  }

  return {
    success: true,
    accessToken: String(accessToken),
    identifier,
  };
}

export async function verifyOtpOnly(
  phone: string,
  otp: string,
): Promise<VerifyOtpOnlyResponse> {
  try {
    const result = await msg91VerifyAndGetAccessToken(phone, otp);
    if (!result.success || !result.identifier) {
      return { success: false, message: result.message };
    }

    await clearReqId(result.identifier);

    const tenDigitPhone = result.identifier.slice(-10);
    return {
      success: true,
      accessToken: result.accessToken,
      phone: tenDigitPhone,
      message: "OTP verified.",
    };
  } catch (error) {
    console.error("[otpService] verifyOtpOnly error:", error);
    return {
      success: false,
      message: "Unable to verify OTP. Please try again.",
    };
  }
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  try {
    if (!API_BASE_URL) {
      console.error("[otpService] EXPO_PUBLIC_API_URL missing.");
      return { success: false, message: "Backend API URL is not configured." };
    }

    const ten = toTenDigits(phone);

    if (ten === REVIEWER_PHONE) {
      console.log("[otpService] Reviewer mode — calling /auth/reviewer-login");

      const res = await fetch(`${API_BASE_URL}/auth/reviewer-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ten, otp }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success) {
        console.error("[otpService] Reviewer login failed:", res.status, data);
        return {
          success: false,
          message: data?.message || "Invalid OTP, please try again",
        };
      }

      return {
        success: true,
        userId: data.user?.id,
        token: data.token,
        phone: data.user?.phone,
        message: data.message,
      };
    }

    const result = await msg91VerifyAndGetAccessToken(phone, otp);
    if (!result.success || !result.accessToken || !result.identifier) {
      return {
        success: false,
        message: result.message || "OTP verification failed.",
      };
    }

    const backendResponse = await fetch(`${API_BASE_URL}/auth/verify-widget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: result.identifier,
        accessToken: result.accessToken,
      }),
    });

    let backendData: any = null;
    try {
      backendData = await backendResponse.json();
    } catch {
      backendData = null;
    }

    if (backendData?.code === "account_deleted") {
      await clearReqId(result.identifier);
      return {
        success: false,
        code: "account_deleted",
        phone: backendData.phone ?? ten,
        recoveryToken: backendData.recoveryToken,
        message:
          backendData.message ||
          "This account was deleted. You can recover it.",
      };
    }

    if (!backendResponse.ok || !backendData?.success) {
      console.error(
        "[otpService] Backend auth failed:",
        backendResponse.status,
        backendData,
      );
      return {
        success: false,
        message:
          backendData?.message || "Authentication failed. Please try again.",
      };
    }

    await clearReqId(result.identifier);

    return {
      success: true,
      userId: backendData.user?.id,
      token: backendData.token,
      phone: backendData.user?.phone,
      message: backendData.message,
    };
  } catch (error) {
    console.error("[otpService] verifyOtp error:", error);
    return {
      success: false,
      message: "Unable to verify OTP. Please try again.",
    };
  }
}

/**
 * Recover a previously deleted account.
 *
 * The backend already verified the OTP in the previous `verifyOtp`
 * call and returned a short-lived `recoveryToken`. We simply POST
 * that token to /auth/recover — no MSG91 re-verification needed.
 */
export async function recoverAccount(
  recoveryToken: string,
): Promise<VerifyOtpResponse> {
  try {
    if (!API_BASE_URL) {
      console.error("[otpService] EXPO_PUBLIC_API_URL missing.");
      return { success: false, message: "Backend API URL is not configured." };
    }
    if (!recoveryToken) {
      return { success: false, message: "Recovery session expired." };
    }

    const res = await fetch(`${API_BASE_URL}/auth/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryToken }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok || !data?.success) {
      console.error("[otpService] recoverAccount failed:", res.status, data);
      return {
        success: false,
        message:
          data?.message || "Could not recover account. Please try again.",
      };
    }

    return {
      success: true,
      userId: data.user?.id,
      token: data.token,
      phone: data.user?.phone,
      message: data.message,
    };
  } catch (error) {
    console.error("[otpService] recoverAccount error:", error);
    return {
      success: false,
      message: "Unable to recover account. Please try again.",
    };
  }
}

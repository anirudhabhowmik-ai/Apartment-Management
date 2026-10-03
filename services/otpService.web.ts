// services/otpService.web.ts
// Shared web/native implementation. Uses the backend as a proxy to MSG91 so
// client bundles never contain widget credentials or call MSG91 directly.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
    SendOtpResponse,
    VerifyOtpOnlyResponse,
    VerifyOtpResponse,
} from "./otpTypes";

export type {
    SendOtpResponse, VerifyOtpOnlyResponse, VerifyOtpResponse
} from "./otpTypes";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const REVIEWER_PHONE = "9999999999";
const REQ_ID_STORAGE_PREFIX = "msg91_reqid:";

function toTenDigits(phone: string): string {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

function normalizePhoneForMsg91(phone: string): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (!/^91[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

function getMsg91ErrorMessage(message?: unknown): string {
  if (typeof message === "string" && message.trim()) return message;
  return "Unable to process OTP. Please try again.";
}

function requireApiUrl(): string {
  if (!API_BASE_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is missing. Cannot talk to backend proxy.",
    );
  }
  return API_BASE_URL;
}

// ---- reqId storage (per phone, persisted in AsyncStorage) ----

const reqIdByPhone: Record<string, string> = {};

function storageKey(identifier: string) {
  return `${REQ_ID_STORAGE_PREFIX}${identifier}`;
}

async function setReqId(identifier: string, reqId: string) {
  reqIdByPhone[identifier] = reqId;
  try {
    await AsyncStorage.setItem(storageKey(identifier), reqId);
  } catch (e) {
    console.warn("[otpService.web] setReqId storage failed:", e);
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
    console.warn("[otpService.web] getReqId storage failed:", e);
  }
  return null;
}

async function clearReqId(identifier: string) {
  delete reqIdByPhone[identifier];
  try {
    await AsyncStorage.removeItem(storageKey(identifier));
  } catch (e) {
    console.warn("[otpService.web] clearReqId storage failed:", e);
  }
}

// ---- sendOtp ----

export async function sendOtp(phone: string): Promise<SendOtpResponse> {
  try {
    const ten = toTenDigits(phone);

    if (ten === REVIEWER_PHONE) {
      console.log("[otpService.web] Reviewer mode — skipping MSG91 send");
      return { success: true, message: "OTP sent successfully." };
    }

    const identifier = normalizePhoneForMsg91(phone);
    if (!identifier) {
      return { success: false, message: "Invalid Indian phone number." };
    }

    console.log(
      "[otpService.web] Sending OTP via backend proxy for",
      identifier,
    );

    const res = await fetch(`${requireApiUrl()}/auth/send-widget-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: identifier }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("[otpService.web] Backend send-widget-otp response:", data);

    if (data?.type !== "success") {
      console.error("[otpService.web] send OTP failed:", data);
      return {
        success: false,
        message: getMsg91ErrorMessage(data?.message),
      };
    }

    // MSG91 widget API returns the reqId in the "message" field.
    const reqId = data.message;
    if (!reqId) {
      console.error("[otpService.web] No reqId returned:", data);
      return {
        success: false,
        message: "OTP was not sent correctly. Please try again.",
      };
    }

    await setReqId(identifier, String(reqId));
    console.log("[otpService.web] reqId saved for", identifier, "→", reqId);

    return { success: true, message: "OTP sent successfully." };
  } catch (error) {
    console.error("[otpService.web] sendOtp error:", error);
    return { success: false, message: "Unable to send OTP. Please try again." };
  }
}

// ---- verify helpers ----

async function verifyWidgetOtp(
  phone: string,
  otp: string,
): Promise<{
  success: boolean;
  accessToken?: string;
  identifier?: string;
  message?: string;
}> {
  const identifier = normalizePhoneForMsg91(phone);
  if (!identifier) {
    return { success: false, message: "Invalid Indian phone number." };
  }

  if (!/^\d{4,6}$/.test(otp)) {
    return { success: false, message: "OTP must be 4-6 digits." };
  }

  const reqId = await getReqId(identifier);
  if (!reqId) {
    return {
      success: false,
      message: "OTP session expired. Please request a new OTP.",
    };
  }

  console.log("[otpService.web] Verifying via backend reqId:", reqId);

  const res = await fetch(`${requireApiUrl()}/auth/verify-widget-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reqId, otp }),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  console.log("[otpService.web] Backend verify-widget-otp response:", data);

  if (data?.type !== "success" || !data?.message) {
    return {
      success: false,
      message: getMsg91ErrorMessage(data?.message),
    };
  }

  return {
    success: true,
    accessToken: String(data.message),
    identifier,
  };
}

// ---- verifyOtpOnly (used by profile phone change on web) ----

export async function verifyOtpOnly(
  phone: string,
  otp: string,
): Promise<VerifyOtpOnlyResponse> {
  try {
    const result = await verifyWidgetOtp(phone, otp);
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
    console.error("[otpService.web] verifyOtpOnly error:", error);
    return {
      success: false,
      message: "Unable to verify OTP. Please try again.",
    };
  }
}

// ---- verifyOtp (used by login on web) ----

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  try {
    const apiBase = requireApiUrl();
    const ten = toTenDigits(phone);

    if (ten === REVIEWER_PHONE) {
      console.log(
        "[otpService.web] Reviewer mode — calling /auth/reviewer-login",
      );

      const res = await fetch(`${apiBase}/auth/reviewer-login`, {
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
        console.error(
          "[otpService.web] Reviewer login failed:",
          res.status,
          data,
        );
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

    const result = await verifyWidgetOtp(phone, otp);
    if (!result.success || !result.accessToken || !result.identifier) {
      return {
        success: false,
        message: result.message || "OTP verification failed.",
      };
    }

    // Feed the MSG91 access token into the same backend endpoint mobile uses.
    const backendResponse = await fetch(`${apiBase}/auth/verify-widget`, {
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

    console.log("[otpService.web] verify-widget response:", backendData);

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
        "[otpService.web] Backend auth failed:",
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
    console.error("[otpService.web] verifyOtp error:", error);
    return {
      success: false,
      message: "Unable to verify OTP. Please try again.",
    };
  }
}

// ---- recoverAccount (unchanged from your existing flow) ----

export async function recoverAccount(
  recoveryToken: string,
): Promise<VerifyOtpResponse> {
  try {
    const apiBase = requireApiUrl();
    if (!recoveryToken) {
      return { success: false, message: "Recovery session expired." };
    }

    const res = await fetch(`${apiBase}/auth/recover`, {
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
      console.error(
        "[otpService.web] recoverAccount failed:",
        res.status,
        data,
      );
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
    console.error("[otpService.web] recoverAccount error:", error);
    return {
      success: false,
      message: "Unable to recover account. Please try again.",
    };
  }
}

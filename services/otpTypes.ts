// services/otpTypes.ts

export interface SendOtpResponse {
  success: boolean;
  message?: string;
}

export interface VerifyOtpResponse {
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

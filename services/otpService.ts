// MOCK MODE: backend not ready yet. Every call succeeds so the UI/UX
// flow can be tested end-to-end. Swap the bodies of these two functions
// for real API calls once the backend is available — the function
// signatures and return shapes are already what the UI expects.

interface SendOtpResponse {
  success: boolean;
  message?: string;
}

interface VerifyOtpResponse {
  success: boolean;
  userId?: string;
  message?: string;
}

export async function sendOtp(phone: string): Promise<SendOtpResponse> {
  console.log(`[MOCK] OTP sent to ${phone}`);
  await new Promise((resolve) => setTimeout(resolve, 500)); // simulate network delay
  return { success: true };
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  console.log(`[MOCK] Verifying OTP ${otp} for ${phone}`);
  await new Promise((resolve) => setTimeout(resolve, 500)); // simulate network delay

  // Any 6-digit code is accepted while backend is not ready
  if (otp.length === 6) {
    return { success: true, userId: `mock-user-${phone}` };
  }
  return { success: false, message: "OTP must be 6 digits" };
}

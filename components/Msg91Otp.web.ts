const OTPWidget = {
  initializeWidget: (_widgetId?: string, _widgetToken?: string) => {
    console.log("ℹ️ MSG91 OTP Widget is disabled on Web.");
  },

  sendOTP: async (_options?: any) => {
    throw new Error("MSG91 OTP is only available on Android/iOS.");
  },

  verifyOTP: async (_options?: any) => {
    throw new Error("MSG91 OTP verification is only available on Android/iOS.");
  },

  retryOTP: async (_options?: any) => {
    throw new Error("MSG91 OTP resend is only available on Android/iOS.");
  },
};

export default OTPWidget;

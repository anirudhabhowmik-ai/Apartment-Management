declare module "@msg91comm/sendotp-react-native" {
  export interface OtpWidgetResponse {
    type: "success" | "error";
    message: string;
    [key: string]: any;
  }

  export const OTPWidget: {
    initializeWidget: (widgetId: string, token: string) => void;
    sendOTP: (data: {
      identifier: string;
      [key: string]: any;
    }) => Promise<OtpWidgetResponse>;
    verifyOTP: (data: {
      reqId: string;
      otp: string;
    }) => Promise<OtpWidgetResponse>;
    retryOTP: (data?: {
      identifier?: string;
      [key: string]: any;
    }) => Promise<OtpWidgetResponse>;
  };
}

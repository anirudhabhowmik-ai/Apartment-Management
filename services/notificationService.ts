import * as Device from "expo-device";
import { Platform } from "react-native";

// Safely attempt to load expo-notifications
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch (error) {
  console.log(
    "expo-notifications is not available in this environment (Expo Go). Push notifications will be disabled.",
  );
}

// Only set up the handler if the module loaded successfully
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (error) {
    console.log("Failed to set notification handler:", error);
  }
}

export async function registerForPushNotificationsAsync() {
  if (!Notifications) {
    console.log("Push notifications are not available in Expo Go.");
    return null;
  }

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device.");
    return null;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Notification permission was not granted.");
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;

    console.log("Expo Push Token:", token);
    return token;
  } catch (error) {
    console.log("Error registering for push notifications:", error);
    return null;
  }
}

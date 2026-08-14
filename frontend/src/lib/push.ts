import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

// Registers this device for push notifications and binds it to the user id.
// Safe to call on every app open — tokens rotate and the backend upserts.
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BASE}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch (e) {
    console.log("[push] register skipped:", e);
  }
}

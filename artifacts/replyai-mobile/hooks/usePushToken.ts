import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useAuth } from "@clerk/clerk-expo";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api-server`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushToken() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn || Platform.OS === "web") return;

    (async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenData.data;
        if (!pushToken) return;

        const authToken = await getToken();
        await fetch(`${API_BASE}/push-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ token: pushToken }),
        });

        // Also register Gmail watch so push notifications flow in
        await fetch(`${API_BASE}/gmail/watch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
        });
      } catch {
        // Non-fatal — push notifications are a nice-to-have
      }
    })();
  }, [isSignedIn, getToken]);
}

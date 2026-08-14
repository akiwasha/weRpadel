import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Alert, LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import Purchases from "react-native-purchases";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { initializeRevenueCat, SubscriptionProvider, rcEnabled } from "@/src/lib/revenuecat";
import { registerForPush } from "@/src/lib/push";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Push: foreground display behavior (module scope, before any component)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Push: Android notification channel (module scope)
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

const queryClient = new QueryClient();

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

function AuthGate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const rcIdentityRef = useRef<string | null>(null);
  const [, setPurchaseIdentityError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Bind RevenueCat identity to the backend user id on every auth path.
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.id && rcIdentityRef.current !== user.id) {
          const { customerInfo } = await Purchases.logIn(user.id);
          rcIdentityRef.current = user.id;
          queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
          console.log("[RevenueCat] identity bound:", customerInfo.originalAppUserId);
        } else if (!user?.id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
          queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
        }
      } catch (e) {
        setPurchaseIdentityError(String(e));
      }
    })();
  }, [user?.id]);

  // Push: register device for the logged-in user (re-runs on each auth)
  useEffect(() => {
    if (user?.id) registerForPush(user.id);
  }, [user?.id]);

  // Push: tap handlers (warm + cold start) and denied-permission weekly nudge
  useEffect(() => {
    if (Platform.OS === "web") return;

    const routeFromData = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url);
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromData(response.notification.request.content.data || {});
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeFromData(response.notification.request.content.data || {});
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      Alert.alert(
        "Active les notifications",
        "Reçois une alerte dès que ton match est complet (4/4) et quand un joueur te rejoint.",
        [
          { text: "Plus tard", style: "cancel", onPress: () => AsyncStorage.setItem("pushNudgeAt", String(Date.now())) },
          { text: "Ouvrir les réglages", onPress: () => { AsyncStorage.setItem("pushNudgeAt", String(Date.now())); Linking.openSettings(); } },
        ]
      );
    })();

    return () => { tapSub.remove(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, ready, segments]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="club/[id]" />
      <Stack.Screen name="player/[id]" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="suggest-club" options={{ presentation: "modal" }} />
      <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
      <Stack.Screen name="manage-subscription" options={{ presentation: "modal" }} />
      <Stack.Screen name="matches" />
      <Stack.Screen name="favorites" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SubscriptionProvider>
              <AuthGate />
            </SubscriptionProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

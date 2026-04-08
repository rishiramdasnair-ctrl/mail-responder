import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { InboxSheetProvider } from "@/contexts/InboxSheetContext";
import { usePushToken } from "@/hooks/usePushToken";

SplashScreen.preventAutoHideAsync();

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
};

const SIGN_IN_ROUTE = "/(auth)/sign-in" as const;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  usePushToken();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!isSignedIn && !inAuthGroup) {
      router.replace(SIGN_IN_ROUTE);
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/");
    }
    // connect-gmail and thread screens are not in (auth), so signed-in users can access them
  }, [isSignedIn, isLoaded, segments]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGuard>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="event/[eventId]" options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="thread/[threadId]" options={{ presentation: "card" }} />
        <Stack.Screen name="connect-gmail" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="compose" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="create-event" options={{ presentation: "modal", headerShown: false }} />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const style = document.createElement("style");
    style.id = "replyai-link-reset";
    style.textContent = "a,a:visited,a:hover,a:active{color:inherit!important;text-decoration:none!important;}";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        <SafeAreaProvider>
          <ThemeProvider>
            <InboxSheetProvider>
              <ErrorBoundary>
                <QueryClientProvider client={queryClient}>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <ToastProvider>
                        <RootLayoutNav />
                      </ToastProvider>
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </QueryClientProvider>
              </ErrorBoundary>
            </InboxSheetProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

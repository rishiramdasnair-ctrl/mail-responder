import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import Logo from "@/components/Logo";
import { Link } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuthContext } from "@/contexts/AuthContext";
import { API_BASE } from "@/hooks/useApiClient";

type FeatherName = ComponentProps<typeof Feather>["name"];

WebBrowser.maybeCompleteAuthSession();

const SIGNIN_REDIRECT = "replyai://signin-success";

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignInWithGoogle = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch the Google OAuth URL from the backend
      const base = API_BASE || `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const urlRes = await fetch(`${base}/api/auth/google/signin-url`);
      if (!urlRes.ok) {
        setError("Couldn't start sign-in. Please try again.");
        return;
      }
      const { url } = (await urlRes.json()) as { url: string };

      // 2. Open in browser and wait for redirect back to replyai://
      const result = await WebBrowser.openAuthSessionAsync(url, SIGNIN_REDIRECT, {
        showInRecents: true,
        preferEphemeralSession: false,
      });

      if (result.type !== "success") {
        return;
      }

      // 3. Parse token, email, userId from the redirect URL
      const redirectUrl = result.url;
      const params = new URL(redirectUrl).searchParams;
      const token = params.get("token");
      const email = params.get("email") ?? "";
      const userId = params.get("userId") ?? "";

      if (!token) {
        setError("Sign-in failed — no token received. Please try again.");
        return;
      }

      // 4. Google OAuth also grants Gmail access — mark gmail as connected
      await SecureStore.setItemAsync("gmail_connected", "1");

      // 5. Store session — AuthGuard will route to onboarding
      await signIn(token, email, userId);
    } catch (err) {
      console.error("OAuth error", err);
      setError("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [signIn]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topPad + 20,
      paddingBottom: bottomPad + 20,
      paddingHorizontal: 32,
    },
    logoSection: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    logoMark: {
      width: 80,
      height: 80,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    appName: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
      marginBottom: 8,
    },
    tagline: {
      fontSize: 16,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 24,
      maxWidth: 260,
    },
    bottomSection: {
      gap: 12,
    },
    googleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      gap: 10,
    },
    googleBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    errorText: {
      fontSize: 13,
      color: colors.destructive,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    trialNote: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    signUpRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 4,
      marginTop: 4,
    },
    signUpText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    signUpLink: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    features: {
      marginBottom: 32,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
    },
    featureIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    featureText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
  });

  const FEATURES: Array<{ icon: FeatherName; text: string }> = [
    { icon: "inbox", text: "Priority inbox across all Gmail accounts" },
    { icon: "cpu", text: "AI-powered reply suggestions" },
    { icon: "calendar", text: "Calendar-aware scheduling" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        <View style={styles.logoMark}>
          <Logo size={80} color={colors.foreground} />
        </View>
        <Text style={styles.appName}>ReplyAI</Text>
        <Text style={styles.tagline}>Your AI email assistant for Gmail</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.icon} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Feather name={f.icon} size={18} color={colors.foreground} />
            </View>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.googleBtn, isLoading && { opacity: 0.7 }]}
          onPress={onSignInWithGoogle}
          disabled={isLoading}
          activeOpacity={0.8}
          testID="google-sign-in-btn"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Feather name="mail" size={18} color={colors.primaryForeground} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Text style={styles.trialNote}>14-day free trial · No credit card required</Text>
        <View style={styles.signUpRow}>
          <Text style={styles.signUpText}>New here?</Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={styles.signUpLink}>Create account</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </View>
  );
}

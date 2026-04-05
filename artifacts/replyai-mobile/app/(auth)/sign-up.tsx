import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useOAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignUpWithGoogle = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: makeRedirectUri({ scheme: "replyai", path: "oauth-callback" }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err) {
      console.error("OAuth error", err);
      setError("Sign-up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [startOAuthFlow]);

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
      width: 72,
      height: 72,
      borderRadius: 18,
      backgroundColor: colors.foreground,
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
    trialBadge: {
      marginTop: 16,
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    trialText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
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
    termsText: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
      lineHeight: 18,
    },
    errorText: {
      fontSize: 13,
      color: colors.destructive,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    signInRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 4,
      marginTop: 4,
    },
    signInText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    signInLink: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        <View style={styles.logoMark}>
          <Feather name="send" size={32} color={colors.primaryForeground} />
        </View>
        <Text style={styles.appName}>Create account</Text>
        <Text style={styles.tagline}>Start your free 14-day trial of ReplyAI</Text>
        <View style={styles.trialBadge}>
          <Text style={styles.trialText}>Free trial · No credit card required</Text>
        </View>
      </View>

      <View style={styles.bottomSection}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.googleBtn, isLoading && { opacity: 0.7 }]}
          onPress={onSignUpWithGoogle}
          disabled={isLoading}
          activeOpacity={0.85}
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

        <Text style={styles.termsText}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>

        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account?</Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={styles.signInLink}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </View>
  );
}

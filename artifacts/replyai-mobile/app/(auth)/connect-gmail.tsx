import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useQueryClient } from "@tanstack/react-query";

WebBrowser.maybeCompleteAuthSession();

interface ConnectGmailProps {
  addAccount?: boolean;
  onDone?: () => void;
}

export default function ConnectGmailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const openGmailOAuth = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const headers = await authHeaders();
      const startUrl = `${apiBaseUrl}/api/auth/google/start?platform=mobile`;

      const result = await WebBrowser.openAuthSessionAsync(startUrl, "replyai://oauth-success", {
        showInRecents: true,
        preferEphemeralSession: false,
      });

      if (result.type === "success") {
        const url = result.url;
        if (url.startsWith("replyai://oauth-success")) {
          setStatus("success");
          qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
          qc.invalidateQueries({ queryKey: ["priority-inbox"] });
          setTimeout(() => router.replace("/(tabs)/"), 1200);
        } else if (url.startsWith("replyai://oauth-error")) {
          setStatus("error");
          setErrorMsg("Gmail connection failed. Please try again.");
        }
      } else if (result.type === "cancel") {
        setStatus("idle");
      } else {
        setStatus("error");
        setErrorMsg("Could not open Gmail authorization page.");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }, [apiBaseUrl, authHeaders, qc, router]);

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topPad,
    },
    backRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 12,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 32,
    },
    connectBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 28,
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    connectBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    errorText: {
      fontSize: 14,
      color: colors.destructive,
      textAlign: "center",
      marginTop: 16,
      fontFamily: "Inter_400Regular",
    },
    successContainer: {
      alignItems: "center",
      gap: 12,
    },
    successText: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
    },
    successSub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    featureList: {
      width: "100%",
      marginBottom: 32,
      gap: 12,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    featureText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
  });

  const FEATURES = [
    { icon: "inbox" as const, text: "View and manage your priority inbox" },
    { icon: "zap" as const, text: "Get AI-generated replies in seconds" },
    { icon: "calendar" as const, text: "Calendar-aware smart scheduling" },
  ];

  if (status === "success") {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.foreground }]}>
            <Feather name="check" size={36} color={colors.primaryForeground} />
          </View>
          <View style={styles.successContainer}>
            <Text style={styles.successText}>Gmail connected!</Text>
            <Text style={styles.successSub}>Taking you to your inbox…</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Feather name="mail" size={36} color={colors.foreground} />
        </View>

        <Text style={styles.title}>Connect Gmail</Text>
        <Text style={styles.subtitle}>
          Authorize ReplyAI to access your Gmail so we can generate smart replies and manage your inbox.
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <Feather name={f.icon} size={16} color={colors.mutedForeground} />
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {status === "loading" ? (
          <ActivityIndicator size="large" color={colors.foreground} />
        ) : (
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={openGmailOAuth}
            activeOpacity={0.8}
          >
            <Feather name="mail" size={18} color={colors.primaryForeground} />
            <Text style={styles.connectBtnText}>Continue with Gmail</Text>
          </TouchableOpacity>
        )}

        {status === "error" && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>
    </View>
  );
}

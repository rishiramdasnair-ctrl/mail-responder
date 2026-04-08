import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

type FeatherName = ComponentProps<typeof Feather>["name"];

WebBrowser.maybeCompleteAuthSession();

const STEPS = ["welcome", "gmail", "tone", "done"] as const;
type Step = (typeof STEPS)[number];
type ToneOption = "professional" | "friendly" | "concise";

const TONES: Array<{ id: ToneOption; label: string; description: string; icon: FeatherName }> = [
  { id: "professional", label: "Professional", description: "Formal & to the point", icon: "briefcase" },
  { id: "friendly", label: "Friendly", description: "Warm & conversational", icon: "smile" },
  { id: "concise", label: "Concise", description: "Short & direct", icon: "zap" },
];

const GMAIL_FEATURES: Array<{ icon: FeatherName; text: string }> = [
  { icon: "inbox", text: "Priority inbox across all accounts" },
  { icon: "cpu", text: "AI-generated replies in seconds" },
  { icon: "calendar", text: "Calendar-aware smart scheduling" },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const [stepIndex, setStepIndex] = useState(0);
  const [gmailStatus, setGmailStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [gmailError, setGmailError] = useState("");
  const [selectedTone, setSelectedTone] = useState<ToneOption>("professional");

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  const currentStep = STEPS[stepIndex];

  useEffect(() => {
    if (currentStep === "welcome") {
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
    if (currentStep === "done") {
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(checkScale, { toValue: 1, tension: 70, friction: 6, useNativeDriver: true }),
          Animated.timing(checkOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      }, 100);
    }
  }, [currentStep]);

  const animateTransition = useCallback(
    (callback: () => void) => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -16, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        callback();
        slideAnim.setValue(24);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 10 }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim]
  );

  const advance = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      animateTransition(() => setStepIndex((i) => i + 1));
    }
  }, [stepIndex, animateTransition]);

  const connectGmail = useCallback(async () => {
    setGmailStatus("loading");
    setGmailError("");
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/auth/google/mobile-url`, { headers });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setGmailStatus("error");
        setGmailError(d.error || "Failed to start Gmail authorization.");
        return;
      }
      const { url: oauthUrl } = (await res.json()) as { url: string };
      const result = await WebBrowser.openAuthSessionAsync(oauthUrl, "replyai://oauth-success", {
        showInRecents: true,
        preferEphemeralSession: false,
      });
      if (result.type === "success" && result.url.startsWith("replyai://oauth-success")) {
        setGmailStatus("connected");
        qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
        qc.invalidateQueries({ queryKey: ["priority-inbox"] });
        setTimeout(() => advance(), 900);
      } else if (result.type === "cancel") {
        setGmailStatus("idle");
      } else {
        setGmailStatus("error");
        setGmailError("Gmail connection failed. Please try again.");
      }
    } catch {
      setGmailStatus("error");
      setGmailError("Something went wrong. Please try again.");
    }
  }, [apiBaseUrl, authHeaders, qc, advance]);

  const finish = useCallback(async () => {
    await SecureStore.setItemAsync("onboarding_complete", "1");
    await SecureStore.setItemAsync("ai_tone", selectedTone);
    router.replace("/");
  }, [selectedTone, router]);

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 32 : insets.bottom;

  const s = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topPad,
      paddingBottom: bottomPad,
    },
    progressRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      paddingTop: 16,
      paddingBottom: 8,
    },
    dot: {
      height: 6,
      borderRadius: 3,
    },
    content: {
      flex: 1,
      paddingHorizontal: 28,
      justifyContent: "center",
    },
    iconWrap: {
      alignSelf: "center",
      width: 80,
      height: 80,
      borderRadius: 22,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    iconWrapMuted: {
      backgroundColor: colors.muted,
    },
    title: {
      fontSize: 30,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.6,
      textAlign: "center",
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 28,
    },
    featureList: {
      gap: 14,
      marginBottom: 28,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
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
    toneRow: {
      gap: 10,
      marginBottom: 28,
    },
    toneCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    toneCardActive: {
      backgroundColor: colors.foreground,
      borderColor: colors.foreground,
    },
    toneCardInactive: {
      backgroundColor: colors.background,
      borderColor: colors.border,
    },
    toneLabelActive: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    toneLabelInactive: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    toneDescActive: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.primaryForeground,
      opacity: 0.7,
    },
    toneDescInactive: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    doneRow: {
      alignItems: "center",
      gap: 8,
      marginBottom: 28,
    },
    doneLabel: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    doneBold: {
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    bottom: {
      paddingHorizontal: 28,
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtn: {
      alignItems: "center",
      paddingVertical: 10,
    },
    secondaryBtnText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    errorText: {
      fontSize: 13,
      color: colors.destructive,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    connectedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    connectedText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    welcomeTagline: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.8,
      textAlign: "center",
      marginBottom: 8,
      lineHeight: 36,
    },
    welcomeSub: {
      fontSize: 16,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 24,
      marginBottom: 40,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
      marginBottom: 0,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.muted,
      borderRadius: 100,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    pillText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
  });

  const WELCOME_PILLS: Array<{ icon: FeatherName; label: string }> = [
    { icon: "zap", label: "AI replies" },
    { icon: "inbox", label: "Priority inbox" },
    { icon: "calendar", label: "Smart scheduling" },
    { icon: "clock", label: "Save hours weekly" },
  ];

  return (
    <View style={s.root}>
      {/* Progress dots */}
      <View style={s.progressRow}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              {
                width: i === stepIndex ? 22 : 6,
                backgroundColor: i <= stepIndex ? colors.foreground : colors.border,
              },
            ]}
          />
        ))}
      </View>

      {/* Animated content area */}
      <Animated.View
        style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {/* ── WELCOME ── */}
        {currentStep === "welcome" && (
          <>
            <Animated.View
              style={[
                s.iconWrap,
                { transform: [{ scale: logoScale }], opacity: logoOpacity },
              ]}
            >
              <Feather name="send" size={36} color={colors.primaryForeground} />
            </Animated.View>
            <Text style={s.welcomeTagline}>Your AI inbox,{"\n"}finally.</Text>
            <Text style={s.welcomeSub}>
              ReplyAI handles the replies so you can focus on what matters.
            </Text>
            <View style={s.pillRow}>
              {WELCOME_PILLS.map((p) => (
                <View key={p.label} style={s.pill}>
                  <Feather name={p.icon} size={13} color={colors.mutedForeground} />
                  <Text style={s.pillText}>{p.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── GMAIL ── */}
        {currentStep === "gmail" && (
          <>
            {gmailStatus === "connected" ? (
              <View style={[s.iconWrap, { backgroundColor: colors.foreground }]}>
                <Feather name="check" size={36} color={colors.primaryForeground} />
              </View>
            ) : (
              <View style={[s.iconWrap, s.iconWrapMuted]}>
                <Feather name="mail" size={36} color={colors.foreground} />
              </View>
            )}
            <Text style={s.title}>
              {gmailStatus === "connected" ? "Gmail connected!" : "Connect Gmail"}
            </Text>
            <Text style={s.subtitle}>
              {gmailStatus === "connected"
                ? "Your inbox is being synced. Let's set up your AI writing style."
                : "Give ReplyAI access to your Gmail to unlock your AI-powered inbox."}
            </Text>
            {gmailStatus !== "connected" && (
              <View style={s.featureList}>
                {GMAIL_FEATURES.map((f) => (
                  <View key={f.icon} style={s.featureRow}>
                    <View style={s.featureIcon}>
                      <Feather name={f.icon} size={16} color={colors.foreground} />
                    </View>
                    <Text style={s.featureText}>{f.text}</Text>
                  </View>
                ))}
              </View>
            )}
            {gmailStatus === "error" && (
              <Text style={s.errorText}>{gmailError}</Text>
            )}
          </>
        )}

        {/* ── TONE ── */}
        {currentStep === "tone" && (
          <>
            <View style={[s.iconWrap, s.iconWrapMuted]}>
              <Feather name="edit-3" size={36} color={colors.foreground} />
            </View>
            <Text style={s.title}>Your writing style</Text>
            <Text style={s.subtitle}>
              How should AI craft replies on your behalf?
            </Text>
            <View style={s.toneRow}>
              {TONES.map((t) => {
                const active = selectedTone === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.toneCard, active ? s.toneCardActive : s.toneCardInactive]}
                    onPress={() => setSelectedTone(t.id)}
                    activeOpacity={0.75}
                  >
                    <Feather
                      name={t.icon}
                      size={20}
                      color={active ? colors.primaryForeground : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={active ? s.toneLabelActive : s.toneLabelInactive}>
                        {t.label}
                      </Text>
                      <Text style={active ? s.toneDescActive : s.toneDescInactive}>
                        {t.description}
                      </Text>
                    </View>
                    {active && (
                      <Feather name="check" size={16} color={colors.primaryForeground} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── DONE ── */}
        {currentStep === "done" && (
          <>
            <Animated.View
              style={[
                s.iconWrap,
                { backgroundColor: colors.foreground, transform: [{ scale: checkScale }], opacity: checkOpacity },
              ]}
            >
              <Feather name="check" size={36} color={colors.primaryForeground} />
            </Animated.View>
            <Text style={s.title}>You're all set!</Text>
            <Text style={s.subtitle}>
              ReplyAI is ready. Head to your inbox and let AI do the heavy lifting.
            </Text>
            <View style={s.doneRow}>
              <Text style={s.doneLabel}>
                Writing style:{" "}
                <Text style={s.doneBold}>
                  {TONES.find((t) => t.id === selectedTone)?.label}
                </Text>
              </Text>
              {gmailStatus === "connected" && (
                <Text style={s.doneLabel}>
                  <Text style={s.doneBold}>Gmail</Text> connected ✓
                </Text>
              )}
            </View>
          </>
        )}
      </Animated.View>

      {/* Bottom actions */}
      <View style={s.bottom}>
        {currentStep === "welcome" && (
          <TouchableOpacity style={s.primaryBtn} onPress={advance} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Get started</Text>
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}

        {currentStep === "gmail" && (
          <>
            {gmailStatus === "connected" ? null : gmailStatus === "loading" ? (
              <View style={[s.primaryBtn, { opacity: 0.7 }]}>
                <ActivityIndicator color={colors.primaryForeground} size="small" />
                <Text style={s.primaryBtnText}>Connecting…</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.primaryBtn} onPress={connectGmail} activeOpacity={0.85}>
                <Feather name="mail" size={16} color={colors.primaryForeground} />
                <Text style={s.primaryBtnText}>Connect Gmail</Text>
              </TouchableOpacity>
            )}
            {gmailStatus !== "loading" && gmailStatus !== "connected" && (
              <TouchableOpacity style={s.secondaryBtn} onPress={advance}>
                <Text style={s.secondaryBtnText}>Skip for now</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {currentStep === "tone" && (
          <TouchableOpacity style={s.primaryBtn} onPress={advance} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Continue</Text>
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}

        {currentStep === "done" && (
          <TouchableOpacity style={s.primaryBtn} onPress={finish} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Go to my inbox</Text>
            <Feather name="inbox" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

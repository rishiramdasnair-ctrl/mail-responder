import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import Logo from "@/components/Logo";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuth } from "@clerk/clerk-expo";

type FeatherName = ComponentProps<typeof Feather>["name"];
WebBrowser.maybeCompleteAuthSession();

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Step config ────────────────────────────────────────────────────────────
const STEPS = ["welcome", "connect", "tone", "done"] as const;
type Step = (typeof STEPS)[number];
type ToneOption = "professional" | "friendly" | "concise";

const TONES: Array<{ id: ToneOption; label: string; desc: string; icon: FeatherName; tag: string }> = [
  { id: "professional", label: "Professional", desc: "Formal & precise replies", icon: "briefcase", tag: "Best for work" },
  { id: "friendly", label: "Friendly", desc: "Warm & conversational", icon: "smile", tag: "Most popular" },
  { id: "concise", label: "Concise", desc: "Short, direct, no fluff", icon: "zap", tag: "Saves most time" },
];

// Email cards shown in "connect" step hero
const PREVIEW_EMAILS = [
  { from: "Sarah K.", subject: "URGENT: Q3 Report Needed", time: "2m ago" },
  { from: "Marcus B.", subject: "Re: Product launch timeline", time: "14m ago" },
  { from: "Priya N.", subject: "Quick question about pricing", time: "1h ago" },
  { from: "Tom H.", subject: "Follow up from yesterday", time: "3h ago" },
];

// Confetti seeds
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  angle: (i / 16) * Math.PI * 2,
  r: 55 + (i % 4) * 20,
  delay: i * 25,
  size: 6 + (i % 3) * 3,
}));

// ─── Mini helpers ────────────────────────────────────────────────────────────
function useSpring(toValue: number, config = { tension: 80, friction: 7 }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue, useNativeDriver: true, ...config }).start();
  }, [toValue]);
  return anim;
}

// Floating ambient orb
function Orb({ size, top, left, delay, opacity }: { size: number; top: number; left: number; delay: number; opacity: number }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: opacity, duration: 900, delay, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 3200 + delay * 2, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.82, duration: 3600 + delay, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, top, left, opacity: op, transform: [{ scale }] }}
    />
  );
}

// Dot step indicator
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <Animated.View
            key={i}
            style={{
              width: active ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: active || done ? "#000" : "#d4d4d4",
              opacity: done ? 0.35 : 1,
            }}
          />
        );
      })}
    </View>
  );
}

// Press-scale button
function PressBtn({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  icon?: FeatherName;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 300, friction: 10 }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }).start();
  const isPrimary = variant === "primary";
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 17,
          paddingHorizontal: 28,
          borderRadius: 16,
          backgroundColor: isPrimary ? "#000" : "transparent",
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: isPrimary ? undefined : "#e5e5e5",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={isPrimary ? "#fff" : "#000"} size="small" />
        ) : (
          <>
            {icon && <Feather name={icon} size={17} color={isPrimary ? "#fff" : "#000"} />}
            <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: isPrimary ? "#fff" : "#000" }}>
              {label}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { signOut } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [connectStatus, setConnectStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [connectError, setConnectError] = useState("");
  const [selectedTone, setSelectedTone] = useState<ToneOption>("professional");

  const currentStep = STEPS[stepIndex];

  // Transition anims
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Hero-area anims (per step)
  const heroScale = useRef(new Animated.Value(0.88)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;

  // Welcome word anims
  const w1 = useRef(new Animated.Value(0)).current;
  const w2 = useRef(new Animated.Value(0)).current;
  const w3 = useRef(new Animated.Value(0)).current;
  const subAnim = useRef(new Animated.Value(0)).current;
  const pillsAnim = useRef(new Animated.Value(0)).current;

  // Connect step anims
  const cardAnims = useRef(PREVIEW_EMAILS.map(() => new Animated.Value(0))).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;

  // Tone step
  const [toneKey, setToneKey] = useState("t0");
  const toneAnims = useRef(TONES.map(() => new Animated.Value(0))).current;

  // Done step
  const checkAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.4)).current;
  const confettiAnims = useRef(CONFETTI.map(() => ({ p: new Animated.Value(0), op: new Animated.Value(0) }))).current;
  const doneTitleAnim = useRef(new Animated.Value(0)).current;

  // ── Animate step in ──────────────────────────────────────────────────────
  const animateStepIn = useCallback((step: Step) => {
    heroScale.setValue(0.88);
    heroOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(heroScale, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
      Animated.timing(heroOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();

    if (step === "welcome") {
      [w1, w2, w3, subAnim, pillsAnim].forEach((a) => a.setValue(0));
      Animated.stagger(80, [
        Animated.spring(w1, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
        Animated.spring(w2, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
        Animated.spring(w3, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
      ]).start();
      setTimeout(() => Animated.timing(subAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start(), 320);
      setTimeout(() => Animated.timing(pillsAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start(), 500);
    }

    if (step === "connect") {
      cardAnims.forEach((a) => a.setValue(0));
      badgeAnim.setValue(0);
      Animated.stagger(90, cardAnims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 80, friction: 9, useNativeDriver: true })
      )).start();
      setTimeout(() => Animated.spring(badgeAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }).start(), 420);
    }

    if (step === "tone") {
      toneAnims.forEach((a) => a.setValue(0));
      setToneKey(`t${Date.now()}`);
      Animated.stagger(80, toneAnims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 85, friction: 8, useNativeDriver: true })
      )).start();
    }

    if (step === "done") {
      checkAnim.setValue(0);
      checkScale.setValue(0.3);
      doneTitleAnim.setValue(0);
      confettiAnims.forEach(({ p, op }) => { p.setValue(0); op.setValue(0); });
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(checkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(checkScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        ]).start();
      }, 100);
      setTimeout(() => Animated.timing(doneTitleAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start(), 500);
      confettiAnims.forEach(({ p, op }, i) => {
        const delay = CONFETTI[i].delay + 250;
        setTimeout(() => {
          Animated.parallel([
            Animated.spring(p, { toValue: 1, tension: 35, friction: 6, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(op, { toValue: 1, duration: 120, useNativeDriver: true }),
              Animated.delay(350),
              Animated.timing(op, { toValue: 0, duration: 350, useNativeDriver: true }),
            ]),
          ]).start();
        }, delay);
      });
    }
  }, []);

  useEffect(() => { animateStepIn(currentStep); }, [currentStep]);

  // ── Step transition ──────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -24, duration: 110, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 110, useNativeDriver: true }),
    ]).start(() => {
      setStepIndex((i) => i + 1);
      slideAnim.setValue(30);
      scaleAnim.setValue(0.96);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 85, friction: 10, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 85, friction: 10, useNativeDriver: true }),
      ]).start();
    });
  }, [stepIndex]);

  // ── Connect Gmail + Calendar ─────────────────────────────────────────────
  const connectGoogle = useCallback(async () => {
    setConnectStatus("loading");
    setConnectError("");
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/auth/google/mobile-url`, { headers });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        if (res.status === 401) {
          setConnectStatus("error");
          setConnectError("Session expired — please sign out and back in.");
          return;
        }
        setConnectStatus("error");
        setConnectError(body.error ?? "Couldn't start Google authorization. Try again.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const result = await WebBrowser.openAuthSessionAsync(url, "replyai://oauth-success", {
        showInRecents: true,
        preferEphemeralSession: false,
      });
      if (result.type === "success" && result.url.startsWith("replyai://oauth-success")) {
        await SecureStore.setItemAsync("gmail_connected", "1");
        setConnectStatus("done");
        qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
        qc.invalidateQueries({ queryKey: ["priority-inbox"] });
        setTimeout(() => advance(), 700);
      } else if (result.type === "cancel") {
        setConnectStatus("idle");
      } else {
        setConnectStatus("error");
        setConnectError("Google connection failed. Please try again.");
      }
    } catch {
      setConnectStatus("error");
      setConnectError("Network error. Check your connection and try again.");
    }
  }, [apiBaseUrl, authHeaders, qc, advance]);

  // ── Finish ───────────────────────────────────────────────────────────────
  const finish = useCallback(async () => {
    await SecureStore.setItemAsync("onboarding_complete", "1");
    await SecureStore.setItemAsync("ai_tone", selectedTone);
    router.replace("/");
  }, [selectedTone, router]);

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 32 : insets.bottom;

  // ── Render ───────────────────────────────────────────────────────────────
  const wordStyle = (a: Animated.Value) => ({
    opacity: a,
    transform: [
      { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
      { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    ],
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: topPad, paddingBottom: bottomPad }}>
      {/* ── Ambient orbs (behind everything) ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Orb size={SW * 0.9} top={SH * -0.12} left={SW * -0.25} delay={0} opacity={0.04} />
        <Orb size={SW * 0.65} top={SH * 0.55} left={SW * 0.35} delay={400} opacity={0.035} />
      </View>

      {/* ── Header: step dots + skip ── */}
      <View style={{ paddingHorizontal: 24, paddingTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <StepDots current={stepIndex} total={STEPS.length} />
        {stepIndex === 0 && (
          <TouchableOpacity onPress={() => signOut()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, color: "#999", fontFamily: "Inter_400Regular" }}>Sign out</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Main animated content ── */}
      <Animated.View style={{ flex: 1, transform: [{ translateY: slideAnim }, { scale: scaleAnim }], opacity: fadeAnim }}>

        {/* ╔══════════ WELCOME ══════════╗ */}
        {currentStep === "welcome" && (
          <View style={{ flex: 1 }}>
            {/* Hero: logo + orbiting pills */}
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity }]}>
              <View style={styles.logoMark}>
                <Logo size={72} color="#000" />
              </View>
              {/* Feature pills floating around */}
              <Animated.View style={[styles.pill, styles.pillTL, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
                <Feather name="zap" size={11} color="#000" /><Text style={styles.pillText}>AI replies</Text>
              </Animated.View>
              <Animated.View style={[styles.pill, styles.pillTR, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
                <Feather name="calendar" size={11} color="#000" /><Text style={styles.pillText}>Calendar</Text>
              </Animated.View>
              <Animated.View style={[styles.pill, styles.pillBL, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
                <Feather name="inbox" size={11} color="#000" /><Text style={styles.pillText}>Priority inbox</Text>
              </Animated.View>
              <Animated.View style={[styles.pill, styles.pillBR, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
                <Feather name="clock" size={11} color="#000" /><Text style={styles.pillText}>Save hours</Text>
              </Animated.View>
            </Animated.View>

            {/* Content */}
            <View style={styles.content}>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {(["Your AI", "inbox,", "finally."] as string[]).map((word, i) => (
                  <Animated.Text key={word} style={[styles.headline, wordStyle([w1, w2, w3][i])]}>
                    {word}{" "}
                  </Animated.Text>
                ))}
              </View>
              <Animated.Text style={[styles.body, { opacity: subAnim, marginTop: 12 }]}>
                ReplyAI reads your Gmail, drafts smart replies and schedules meetings — so you can focus on what actually matters.
              </Animated.Text>
              <View style={{ marginTop: 32 }}>
                <PressBtn label="Get started" onPress={advance} icon="arrow-right" />
              </View>
              <Text style={styles.legalNote}>14-day free trial · No credit card required</Text>
            </View>
          </View>
        )}

        {/* ╔══════════ CONNECT ══════════╗ */}
        {currentStep === "connect" && (
          <View style={{ flex: 1 }}>
            {/* Hero: animated email card stack */}
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity, justifyContent: "center", paddingHorizontal: 20 }]}>
              <View style={{ gap: 8 }}>
                {PREVIEW_EMAILS.map((email, i) => (
                  <Animated.View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#f9f9f9",
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderWidth: 1,
                      borderColor: "#ebebeb",
                      opacity: cardAnims[i],
                      transform: [
                        { translateX: cardAnims[i].interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
                        { scale: cardAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                      ],
                    }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#000", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{email.from[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#000" }} numberOfLines={1}>{email.from}</Text>
                      <Text style={{ fontSize: 12, color: "#666", fontFamily: "Inter_400Regular" }} numberOfLines={1}>{email.subject}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: "#aaa", fontFamily: "Inter_400Regular" }}>{email.time}</Text>
                  </Animated.View>
                ))}
              </View>

              {/* Gmail + Calendar badge */}
              <Animated.View style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 14,
                justifyContent: "center",
                opacity: badgeAnim,
                transform: [{ translateY: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              }}>
                {([{ icon: "mail" as FeatherName, label: "Gmail" }, { icon: "calendar" as FeatherName, label: "Calendar" }]).map((b) => (
                  <View key={b.label} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#000", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Feather name={b.icon} size={12} color="#fff" />
                    <Text style={{ fontSize: 12, color: "#fff", fontFamily: "Inter_600SemiBold" }}>{b.label}</Text>
                  </View>
                ))}
              </Animated.View>
            </Animated.View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.headline}>Connect Google{"\n"}to get started</Text>
              <Text style={[styles.body, { marginTop: 10 }]}>
                ReplyAI needs access to your Gmail and Google Calendar to read messages and draft replies. Your data is encrypted and never shared.
              </Text>

              {connectStatus === "error" && (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={14} color="#c00" />
                  <Text style={styles.errorText}>{connectError}</Text>
                </View>
              )}

              <View style={{ marginTop: 24, gap: 12 }}>
                {connectStatus === "done" ? (
                  <View style={styles.successRow}>
                    <Feather name="check-circle" size={20} color="#000" />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#000" }}>Connected! Moving on…</Text>
                  </View>
                ) : (
                  <PressBtn
                    label={connectStatus === "error" ? "Try again" : "Connect Gmail & Calendar"}
                    onPress={connectGoogle}
                    loading={connectStatus === "loading"}
                    icon="mail"
                  />
                )}
              </View>

              <Text style={styles.legalNote}>
                We only request read + send access. You can revoke any time in your Google account.
              </Text>
            </View>
          </View>
        )}

        {/* ╔══════════ TONE ══════════╗ */}
        {currentStep === "tone" && (
          <View style={{ flex: 1 }}>
            {/* Hero: animated tone cards preview */}
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity, justifyContent: "center", paddingHorizontal: 28 }]}>
              <View style={{ gap: 10 }}>
                {TONES.map((tone, i) => {
                  const selected = selectedTone === tone.id;
                  return (
                    <Animated.View
                      key={tone.id}
                      style={{
                        opacity: toneAnims[i],
                        transform: [
                          { translateY: toneAnims[i].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                          { scale: toneAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                        ],
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setSelectedTone(tone.id)}
                        activeOpacity={0.82}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 14,
                          backgroundColor: selected ? "#000" : "#f5f5f5",
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 2,
                          borderColor: selected ? "#000" : "transparent",
                        }}
                      >
                        <View style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          backgroundColor: selected ? "rgba(255,255,255,0.15)" : "#e8e8e8",
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <Feather name={tone.icon} size={20} color={selected ? "#fff" : "#333"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: selected ? "#fff" : "#000" }}>
                            {tone.label}
                          </Text>
                          <Text style={{ fontSize: 13, color: selected ? "rgba(255,255,255,0.7)" : "#888", fontFamily: "Inter_400Regular" }}>
                            {tone.desc}
                          </Text>
                        </View>
                        <View style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 20,
                          backgroundColor: selected ? "rgba(255,255,255,0.18)" : "#ebebeb",
                        }}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: selected ? "#fff" : "#555" }}>
                            {tone.tag}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.headline}>How should{"\n"}ReplyAI sound?</Text>
              <Text style={[styles.body, { marginTop: 10 }]}>
                Pick the tone for AI-generated replies. You can change this any time in settings.
              </Text>
              <View style={{ marginTop: 24 }}>
                <PressBtn label="Continue" onPress={advance} icon="arrow-right" />
              </View>
            </View>
          </View>
        )}

        {/* ╔══════════ DONE ══════════╗ */}
        {currentStep === "done" && (
          <View style={{ flex: 1 }}>
            {/* Hero: big check + confetti */}
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity, justifyContent: "center", alignItems: "center" }]}>
              {/* Confetti dots */}
              {CONFETTI.map((seed, i) => (
                <Animated.View
                  key={i}
                  style={{
                    position: "absolute",
                    width: seed.size,
                    height: seed.size,
                    borderRadius: seed.size / 2,
                    backgroundColor: i % 4 === 0 ? "#000" : i % 4 === 1 ? "#555" : i % 4 === 2 ? "#aaa" : "#e0e0e0",
                    opacity: confettiAnims[i].op,
                    transform: [
                      { translateX: confettiAnims[i].p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(seed.angle) * seed.r] }) },
                      { translateY: confettiAnims[i].p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(seed.angle) * seed.r] }) },
                      { scale: confettiAnims[i].p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1.4, 0.9] }) },
                    ],
                  }}
                />
              ))}

              {/* Check circle */}
              <Animated.View style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: "#000",
                alignItems: "center",
                justifyContent: "center",
                transform: [{ scale: checkScale }],
                opacity: checkAnim,
              }}>
                <Feather name="check" size={48} color="#fff" />
              </Animated.View>

              <Animated.Text style={{
                marginTop: 24,
                fontSize: 28,
                fontFamily: "Inter_700Bold",
                color: "#000",
                textAlign: "center",
                opacity: doneTitleAnim,
                transform: [{ translateY: doneTitleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              }}>
                You're all set!
              </Animated.Text>
            </Animated.View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.headline}>Ready to{"\n"}reply smarter</Text>
              <Text style={[styles.body, { marginTop: 10 }]}>
                Your priority inbox is loading. ReplyAI will start drafting replies for your most important emails right away.
              </Text>
              <View style={{ marginTop: 24 }}>
                <PressBtn label="Open my inbox" onPress={finish} icon="inbox" />
              </View>
            </View>
          </View>
        )}

      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  heroArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 16,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 16,
    minHeight: SH * 0.36,
    justifyContent: "flex-start",
  },
  logoMark: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  pillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#000",
  },
  pillTL: { top: "10%", left: "8%" },
  pillTR: { top: "14%", right: "6%" },
  pillBL: { bottom: "22%", left: "4%" },
  pillBR: { bottom: "18%", right: "8%" },
  headline: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#000",
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 15,
    color: "#666",
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
  },
  legalNote: {
    marginTop: 16,
    fontSize: 12,
    color: "#bbb",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    backgroundColor: "#fff2f2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fcc",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#c00",
    fontFamily: "Inter_400Regular",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
  },
});

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
  Easing,
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
  { from: "Sarah K.", subject: "URGENT: Q3 Report Needed", time: "2m ago", urgent: true },
  { from: "Marcus B.", subject: "Re: Product launch timeline", time: "14m ago", urgent: false },
  { from: "Priya N.", subject: "Quick question about pricing", time: "1h ago", urgent: false },
  { from: "Tom H.", subject: "Follow up from yesterday", time: "3h ago", urgent: false },
];

// Confetti seeds
const CONFETTI = Array.from({ length: 20 }, (_, i) => ({
  angle: (i / 20) * Math.PI * 2,
  r: 60 + (i % 5) * 18,
  delay: i * 20,
  size: 5 + (i % 4) * 3,
  shape: i % 3, // 0=circle, 1=square, 2=diamond
}));

// Particles for welcome step
const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  x: (i / 8) * SW * 0.8 + SW * 0.1,
  size: 3 + (i % 3) * 2,
  delay: i * 120,
  startY: SH * 0.45,
  endY: SH * 0.1,
  opacity: 0.08 + (i % 4) * 0.04,
}));

// Expanding rings for done step
const RINGS = [0, 1, 2].map((i) => ({ delay: i * 200, maxScale: 3.5 + i * 1.2 }));

// ─── Mini helpers ────────────────────────────────────────────────────────────
function wordStyle(anim: Animated.Value) {
  return {
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.88, 1.04, 1] }) },
    ],
  };
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
  const onIn = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, tension: 300, friction: 10 }).start();
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
          paddingVertical: 16,
          paddingHorizontal: 28,
          borderRadius: 16,
          backgroundColor: isPrimary ? (disabled ? "#ccc" : "#000") : "transparent",
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: "#000",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={isPrimary ? "#fff" : "#000"} />
        ) : (
          <>
            <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: isPrimary ? "#fff" : "#000" }}>
              {label}
            </Text>
            {icon && <Feather name={icon} size={17} color={isPrimary ? "#fff" : "#000"} />}
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Step dots
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

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { signOut } = useAuth();

  const topPad = Math.max(insets.top, 16);
  const bottomPad = Math.max(insets.bottom, 16);

  const [stepIndex, setStepIndex] = useState(0);
  const [connectStatus, setConnectStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [connectError, setConnectError] = useState("");
  const [connectHint, setConnectHint] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<ToneOption>("professional");

  const currentStep = STEPS[stepIndex];

  // Transition anims
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Hero-area anims (per step)
  const heroScale = useRef(new Animated.Value(0.88)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;

  // Welcome: word anims + sub + pills
  const w1 = useRef(new Animated.Value(0)).current;
  const w2 = useRef(new Animated.Value(0)).current;
  const w3 = useRef(new Animated.Value(0)).current;
  const subAnim = useRef(new Animated.Value(0)).current;
  const pillsAnim = useRef(new Animated.Value(0)).current;

  // Welcome: logo pulse (continuous breathing)
  const logoPulse = useRef(new Animated.Value(1)).current;
  const logoGlow = useRef(new Animated.Value(0)).current;

  // Welcome: rising particles
  const particleAnims = useRef(PARTICLES.map(() => ({
    y: new Animated.Value(0),
    op: new Animated.Value(0),
  }))).current;

  // Connect step
  const cardAnims = useRef(PREVIEW_EMAILS.map(() => new Animated.Value(0))).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const scanLineY = useRef(new Animated.Value(0)).current;

  // Tone step
  const toneAnims = useRef(TONES.map(() => new Animated.Value(0))).current;
  const toneScales = useRef(TONES.map(() => new Animated.Value(1))).current;

  // Done step
  const checkAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.3)).current;
  const checkRing = useRef(new Animated.Value(0)).current;
  const confettiAnims = useRef(CONFETTI.map(() => ({
    p: new Animated.Value(0),
    op: new Animated.Value(0),
    rot: new Animated.Value(0),
  }))).current;
  const ringAnims = useRef(RINGS.map(() => ({
    scale: new Animated.Value(0),
    op: new Animated.Value(0),
  }))).current;
  const doneTitleAnim = useRef(new Animated.Value(0)).current;
  const doneSubAnim = useRef(new Animated.Value(0)).current;

  // ── Logo pulse (loops while on welcome step) ─────────────────────────────
  const logoPulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const startLogoPulse = useCallback(() => {
    logoPulse.setValue(1);
    logoGlow.setValue(0);
    logoPulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoPulse, { toValue: 1.08, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(logoGlow, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(logoPulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(logoGlow, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ])
    );
    logoPulseLoop.current.start();
  }, []);

  const stopLogoPulse = useCallback(() => {
    logoPulseLoop.current?.stop();
    logoPulse.setValue(1);
    logoGlow.setValue(0);
  }, []);

  // ── Rising particles (welcome step) ─────────────────────────────────────
  const startParticles = useCallback(() => {
    particleAnims.forEach(({ y, op }, i) => {
      y.setValue(0);
      op.setValue(0);
      const delay = PARTICLES[i].delay + 600;
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(op, { toValue: PARTICLES[i].opacity, duration: 400, useNativeDriver: true }),
            Animated.timing(y, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0, duration: 400, useNativeDriver: true }),
          ])
        ).start();
      }, delay);
    });
  }, []);

  // ── Scan line (connect step) ─────────────────────────────────────────────
  const startScanLine = useCallback(() => {
    scanLineY.setValue(0);
    Animated.loop(
      Animated.timing(scanLineY, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  // ── Tone selection spring ────────────────────────────────────────────────
  const selectTone = useCallback((id: ToneOption, idx: number) => {
    setSelectedTone(id);
    TONES.forEach((_, i) => {
      Animated.spring(toneScales[i], {
        toValue: i === idx ? 1.03 : 0.98,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }).start();
      // Return unselected back to 1 after a moment
      if (i !== idx) {
        setTimeout(() => {
          Animated.spring(toneScales[i], { toValue: 1, tension: 200, friction: 12, useNativeDriver: true }).start();
        }, 180);
      }
    });
  }, [toneScales]);

  // ── Animate step in ──────────────────────────────────────────────────────
  const animateStepIn = useCallback((step: Step) => {
    heroScale.setValue(0.85);
    heroOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(heroScale, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
      Animated.timing(heroOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();

    if (step === "welcome") {
      [w1, w2, w3, subAnim, pillsAnim].forEach((a) => a.setValue(0));
      Animated.stagger(100, [
        Animated.spring(w1, { toValue: 1, tension: 90, friction: 7, useNativeDriver: true }),
        Animated.spring(w2, { toValue: 1, tension: 90, friction: 7, useNativeDriver: true }),
        Animated.spring(w3, { toValue: 1, tension: 90, friction: 7, useNativeDriver: true }),
      ]).start();
      setTimeout(() => Animated.spring(subAnim, { toValue: 1, tension: 80, friction: 9, useNativeDriver: true }).start(), 350);
      setTimeout(() => Animated.spring(pillsAnim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }).start(), 520);
      setTimeout(startLogoPulse, 700);
      startParticles();
    } else {
      stopLogoPulse();
    }

    if (step === "connect") {
      cardAnims.forEach((a) => a.setValue(0));
      badgeAnim.setValue(0);
      Animated.stagger(100, cardAnims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 75, friction: 8, useNativeDriver: true })
      )).start();
      setTimeout(() => Animated.spring(badgeAnim, { toValue: 1, tension: 90, friction: 8, useNativeDriver: true }).start(), 480);
      setTimeout(startScanLine, 800);
    }

    if (step === "tone") {
      toneAnims.forEach((a) => a.setValue(0));
      toneScales.forEach((a) => a.setValue(1));
      Animated.stagger(90, toneAnims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true })
      )).start();
    }

    if (step === "done") {
      checkAnim.setValue(0);
      checkScale.setValue(0.3);
      checkRing.setValue(0);
      doneTitleAnim.setValue(0);
      doneSubAnim.setValue(0);
      confettiAnims.forEach(({ p, op, rot }) => { p.setValue(0); op.setValue(0); rot.setValue(0); });
      ringAnims.forEach(({ scale, op }) => { scale.setValue(0); op.setValue(0); });

      // Checkmark + ring burst
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(checkScale, { toValue: 1, tension: 55, friction: 5, useNativeDriver: true }),
          Animated.timing(checkAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
        Animated.sequence([
          Animated.spring(checkRing, { toValue: 1.4, tension: 80, friction: 5, useNativeDriver: true }),
          Animated.spring(checkRing, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }),
        ]).start();
      }, 80);

      // Expanding rings
      RINGS.forEach(({ delay: rd }, ri) => {
        setTimeout(() => {
          ringAnims[ri].op.setValue(0.5);
          Animated.parallel([
            Animated.timing(ringAnims[ri].scale, { toValue: RINGS[ri].maxScale, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(ringAnims[ri].op, { toValue: 0, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]).start();
        }, 120 + rd);
      });

      // Confetti burst
      confettiAnims.forEach(({ p, op, rot }, i) => {
        const delay = CONFETTI[i].delay + 220;
        setTimeout(() => {
          Animated.parallel([
            Animated.spring(p, { toValue: 1, tension: 30, friction: 5, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(op, { toValue: 1, duration: 100, useNativeDriver: true }),
              Animated.delay(380),
              Animated.timing(op, { toValue: 0, duration: 400, useNativeDriver: true }),
            ]),
            Animated.timing(rot, { toValue: 1, duration: 900, useNativeDriver: true }),
          ]).start();
        }, delay);
      });

      setTimeout(() => Animated.spring(doneTitleAnim, { toValue: 1, tension: 75, friction: 9, useNativeDriver: true }).start(), 480);
      setTimeout(() => Animated.spring(doneSubAnim, { toValue: 1, tension: 70, friction: 10, useNativeDriver: true }).start(), 680);
    }
  }, [startLogoPulse, stopLogoPulse, startParticles, startScanLine]);

  useEffect(() => { animateStepIn(currentStep); }, [currentStep]);

  // ── Step transition ──────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -28, duration: 110, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 110, useNativeDriver: true }),
    ]).start(() => {
      setStepIndex((i) => i + 1);
      slideAnim.setValue(32);
      scaleAnim.setValue(0.95);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
      ]).start();
    });
  }, [stepIndex]);

  // ── Connect Gmail + Calendar ─────────────────────────────────────────────
  const connectGoogle = useCallback(async () => {
    setConnectStatus("loading");
    setConnectError("");
    setConnectHint(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/auth/google/mobile-url`, { headers });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        const hint = body.hint ?? null;
        setConnectHint(hint);
        if (res.status === 401) {
          setConnectStatus("error");
          setConnectError(
            hint === "no_token"
              ? "No session token found. Please sign out and sign back in."
              : "Your session was rejected by the server. Sign out below and sign back in to continue.",
          );
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
      if (result.type !== "success") {
        setConnectStatus("idle");
        return;
      }
      const callbackUrl = result.url;
      const successRes = await fetch(`${apiBaseUrl}/api/auth/google/mobile-callback?url=${encodeURIComponent(callbackUrl)}`, { headers });
      if (!successRes.ok) {
        setConnectStatus("error");
        setConnectError("Google authorization failed. Please try again.");
        return;
      }
      await qc.invalidateQueries();
      setConnectStatus("done");
      await SecureStore.setItemAsync("gmail_connected", "1");
      setTimeout(advance, 900);
    } catch (e: any) {
      setConnectStatus("error");
      setConnectError(e?.message?.includes("Session unavailable") ? "Session unavailable — please sign out and back in." : "Something went wrong. Please try again.");
    }
  }, [apiBaseUrl, authHeaders, qc, advance]);

  // ── Finish onboarding ────────────────────────────────────────────────────
  const finish = useCallback(async () => {
    await SecureStore.setItemAsync("onboarding_complete", "1");
    router.replace("/(tabs)");
  }, [router]);

  // ── Confetti rotation interpolation ─────────────────────────────────────
  const rotateRange = ["0deg", "360deg"];

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: topPad, paddingBottom: bottomPad }}>

      {/* ── Header ── */}
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
            {/* Floating particles */}
            <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
              {PARTICLES.map((p, i) => (
                <Animated.View
                  key={i}
                  style={{
                    position: "absolute",
                    left: p.x,
                    width: p.size,
                    height: p.size,
                    borderRadius: p.size / 2,
                    backgroundColor: "#000",
                    opacity: particleAnims[i].op,
                    transform: [{
                      translateY: particleAnims[i].y.interpolate({
                        inputRange: [0, 1],
                        outputRange: [p.startY, p.endY],
                      }),
                    }],
                  }}
                />
              ))}
            </View>

            {/* Hero: logo + orbiting pills */}
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity }]}>
              {/* Glow ring behind logo */}
              <Animated.View style={{
                position: "absolute",
                width: 130,
                height: 130,
                borderRadius: 65,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: "#000",
                opacity: logoGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
                transform: [{ scale: logoPulse.interpolate({ inputRange: [1, 1.08], outputRange: [1.2, 1.6] }) }],
              }} />
              <Animated.View style={[styles.logoMark, { transform: [{ scale: logoPulse }] }]}>
                <Logo size={72} color="#000" />
              </Animated.View>
              {/* Feature pills */}
              <Animated.View style={[styles.pill, styles.pillTL, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
                <Feather name="zap" size={11} color="#000" /><Text style={styles.pillText}>AI replies</Text>
              </Animated.View>
              <Animated.View style={[styles.pill, styles.pillTR, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
                <Feather name="calendar" size={11} color="#000" /><Text style={styles.pillText}>Calendar</Text>
              </Animated.View>
              <Animated.View style={[styles.pill, styles.pillBL, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }, { scale: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
                <Feather name="inbox" size={11} color="#000" /><Text style={styles.pillText}>Priority inbox</Text>
              </Animated.View>
              <Animated.View style={[styles.pill, styles.pillBR, { opacity: pillsAnim, transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }, { scale: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
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
              <Animated.Text style={[styles.body, { opacity: subAnim, marginTop: 12, transform: [{ translateY: subAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
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
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity, justifyContent: "center", paddingHorizontal: 20 }]}>
              <View style={{ width: "100%", position: "relative" }}>
                {/* AI scan line */}
                <Animated.View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: 1.5,
                    backgroundColor: "#000",
                    opacity: 0.12,
                    zIndex: 10,
                    pointerEvents: "none",
                    transform: [{
                      translateY: scanLineY.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, PREVIEW_EMAILS.length * 70],
                      }),
                    }],
                  }}
                />
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
                        borderColor: email.urgent ? "#e8e8e8" : "#ebebeb",
                        opacity: cardAnims[i],
                        transform: [
                          { translateY: cardAnims[i].interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) },
                          { scale: cardAnims[i].interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.9, 1.02, 1] }) },
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
              </View>

              {/* Gmail + Calendar badge */}
              <Animated.View style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 14,
                justifyContent: "center",
                opacity: badgeAnim,
                transform: [
                  { translateY: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                  { scale: badgeAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.85, 1.04, 1] }) },
                ],
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
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Feather name="alert-circle" size={14} color="#c00" style={{ marginTop: 2 }} />
                    <Text style={[styles.errorText, { flex: 1 }]}>{connectError}</Text>
                  </View>
                  {(connectHint === "token_rejected" || connectHint === "no_token") && (
                    <TouchableOpacity
                      onPress={() => signOut()}
                      style={{ marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6 }}
                      activeOpacity={0.7}
                    >
                      <Feather name="log-out" size={13} color="#c00" />
                      <Text style={{ color: "#c00", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Sign out & sign back in</Text>
                    </TouchableOpacity>
                  )}
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
                    label={connectHint === "token_rejected" || connectHint === "no_token" ? "Retry after signing back in" : connectStatus === "error" ? "Try again" : "Connect Gmail & Calendar"}
                    onPress={connectGoogle}
                    loading={connectStatus === "loading"}
                    disabled={connectHint === "token_rejected" || connectHint === "no_token"}
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
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity, justifyContent: "center", paddingHorizontal: 28 }]}>
              <View style={{ gap: 10, width: "100%" }}>
                {TONES.map((tone, i) => {
                  const selected = selectedTone === tone.id;
                  return (
                    <Animated.View
                      key={tone.id}
                      style={{
                        opacity: toneAnims[i],
                        transform: [
                          { translateY: toneAnims[i].interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
                          { scale: toneAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                        ],
                      }}
                    >
                      <Animated.View style={{ transform: [{ scale: toneScales[i] }] }}>
                      <TouchableOpacity
                        onPress={() => selectTone(tone.id, i)}
                        activeOpacity={0.85}
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
            <Animated.View style={[styles.heroArea, { transform: [{ scale: heroScale }], opacity: heroOpacity, justifyContent: "center", alignItems: "center" }]}>

              {/* Expanding rings */}
              {RINGS.map((_, ri) => (
                <Animated.View
                  key={ri}
                  style={{
                    position: "absolute",
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    borderWidth: 1.5,
                    borderColor: "#000",
                    pointerEvents: "none",
                    opacity: ringAnims[ri].op,
                    transform: [{ scale: ringAnims[ri].scale }],
                  }}
                />
              ))}

              {/* Confetti dots */}
              {CONFETTI.map((seed, i) => {
                const rot = confettiAnims[i].rot.interpolate({ inputRange: [0, 1], outputRange: rotateRange });
                return (
                  <Animated.View
                    key={i}
                    style={{
                      position: "absolute",
                      width: seed.size,
                      height: seed.size,
                      borderRadius: seed.shape === 0 ? seed.size / 2 : seed.shape === 1 ? 2 : 0,
                      backgroundColor: i % 5 === 0 ? "#000" : i % 5 === 1 ? "#333" : i % 5 === 2 ? "#777" : i % 5 === 3 ? "#aaa" : "#d4d4d4",
                      opacity: confettiAnims[i].op,
                      transform: [
                        { translateX: confettiAnims[i].p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(seed.angle) * seed.r] }) },
                        { translateY: confettiAnims[i].p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(seed.angle) * seed.r] }) },
                        { scale: confettiAnims[i].p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1.5, 1] }) },
                        { rotate: rot },
                      ],
                    }}
                  />
                );
              })}

              {/* Check circle with outer ring */}
              <Animated.View style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                borderWidth: 2.5,
                borderColor: "#000",
                position: "absolute",
                transform: [{ scale: checkRing }],
                opacity: checkAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.3, 0] }),
              }} />
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
                marginTop: 28,
                fontSize: 30,
                fontFamily: "Inter_700Bold",
                color: "#000",
                textAlign: "center",
                opacity: doneTitleAnim,
                transform: [
                  { translateY: doneTitleAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                  { scale: doneTitleAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.9, 1.03, 1] }) },
                ],
              }}>
                You're all set!
              </Animated.Text>
            </Animated.View>

            {/* Content */}
            <View style={styles.content}>
              <Animated.Text style={[styles.headline, {
                opacity: doneSubAnim,
                transform: [{ translateY: doneSubAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
              }]}>
                Ready to{"\n"}reply smarter
              </Animated.Text>
              <Animated.Text style={[styles.body, {
                marginTop: 10,
                opacity: doneSubAnim,
                transform: [{ translateY: doneSubAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              }]}>
                Your priority inbox is loading. ReplyAI will start drafting replies for your most important emails right away.
              </Animated.Text>
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
    flexDirection: "column",
    marginTop: 14,
    backgroundColor: "#fff2f2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fcc",
  },
  errorText: {
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

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Platform,
  Dimensions,
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
import { useAuth } from "@clerk/clerk-expo";

type FeatherName = ComponentProps<typeof Feather>["name"];

WebBrowser.maybeCompleteAuthSession();

const { width: SW, height: SH } = Dimensions.get("window");

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

const WELCOME_PILLS: Array<{ icon: FeatherName; label: string }> = [
  { icon: "zap", label: "AI replies" },
  { icon: "inbox", label: "Priority inbox" },
  { icon: "calendar", label: "Smart scheduling" },
  { icon: "clock", label: "Save hours weekly" },
];

const CONFETTI_COUNT = 12;
const CONFETTI_SEEDS = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  angle: (i / CONFETTI_COUNT) * Math.PI * 2,
  radius: 60 + Math.random() * 60,
  delay: i * 30,
}));

function useSpring(toValue: number, config?: { tension?: number; friction?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue,
      tension: config?.tension ?? 80,
      friction: config?.friction ?? 7,
      useNativeDriver: true,
    }).start();
  }, [toValue]);
  return anim;
}

function FloatingOrb({
  size,
  top,
  left,
  opacity,
  color,
  delay,
}: {
  size: number;
  top: number;
  left: number;
  opacity: number;
  color: string;
  delay: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: opacity,
      duration: 800,
      delay,
      useNativeDriver: true,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.15, duration: 3000 + delay * 3, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 3500 + delay * 2, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        top,
        left,
        opacity: opacityAnim,
        transform: [{ scale: scaleAnim }],
      }}
    />
  );
}

function StaggeredItems<T>({
  items,
  renderItem,
  delayBase,
  stepKey,
}: {
  items: T[];
  renderItem: (item: T, i: number, anim: Animated.Value) => React.ReactNode;
  delayBase: number;
  stepKey: string;
}) {
  const anims = useRef(items.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    anims.forEach((a) => a.setValue(0));
    Animated.stagger(
      delayBase,
      anims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 90, friction: 8, useNativeDriver: true })
      )
    ).start();
  }, [stepKey]);

  return <>{items.map((item, i) => renderItem(item, i, anims[i]))}</>;
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { signOut } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [gmailStatus, setGmailStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [gmailError, setGmailError] = useState("");
  const [selectedTone, setSelectedTone] = useState<ToneOption>("professional");

  const currentStep = STEPS[stepIndex];

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const iconScale = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconRingScale = useRef(new Animated.Value(0.6)).current;
  const iconRingOpacity = useRef(new Animated.Value(0)).current;

  const titleWord1 = useRef(new Animated.Value(0)).current;
  const titleWord2 = useRef(new Animated.Value(0)).current;
  const titleWord3 = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;

  const confettiAnims = useRef(
    CONFETTI_SEEDS.map(() => ({
      progress: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;
  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  const progressAnim = useRef(new Animated.Value(0)).current;

  const [toneKey, setToneKey] = useState("tone-0");

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: stepIndex / (STEPS.length - 1),
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [stepIndex]);

  const animateIconIn = useCallback(
    (delay = 0) => {
      iconScale.setValue(0);
      iconOpacity.setValue(0);
      iconRingScale.setValue(0.5);
      iconRingOpacity.setValue(0);
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(iconScale, { toValue: 1, tension: 70, friction: 6, useNativeDriver: true }),
          Animated.timing(iconOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
        setTimeout(() => {
          Animated.parallel([
            Animated.spring(iconRingScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
            Animated.timing(iconRingOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start(() => {
            Animated.loop(
              Animated.sequence([
                Animated.timing(iconRingOpacity, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
                Animated.timing(iconRingOpacity, { toValue: 1, duration: 1200, useNativeDriver: true }),
              ])
            ).start();
          });
        }, 150);
      }, delay);
    },
    [iconScale, iconOpacity, iconRingScale, iconRingOpacity]
  );

  const animateWelcomeText = useCallback(() => {
    [titleWord1, titleWord2, titleWord3, subtitleAnim].forEach((a) => a.setValue(0));
    Animated.stagger(90, [
      Animated.spring(titleWord1, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
      Animated.spring(titleWord2, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
      Animated.spring(titleWord3, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.timing(subtitleAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 350);
  }, [titleWord1, titleWord2, titleWord3, subtitleAnim]);

  const animateDone = useCallback(() => {
    confettiAnims.forEach(({ progress, opacity }, i) => {
      progress.setValue(0);
      opacity.setValue(0);
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(progress, { toValue: 1, tension: 40, friction: 6, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
            Animated.delay(400),
            Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          ]),
        ]).start();
      }, CONFETTI_SEEDS[i].delay + 200);
    });
    ringScale.setValue(0.3);
    ringOpacity.setValue(0);
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(ringScale, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0.25, duration: 250, useNativeDriver: true }),
          Animated.delay(300),
          Animated.timing(ringOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      ]).start();
    }, 150);
  }, [confettiAnims, ringScale, ringOpacity]);

  const runStepEntrance = useCallback(
    (step: Step) => {
      if (step === "welcome") {
        animateIconIn(0);
        animateWelcomeText();
      } else if (step === "gmail") {
        animateIconIn(80);
      } else if (step === "tone") {
        animateIconIn(80);
        setToneKey(`tone-${Date.now()}`);
      } else if (step === "done") {
        animateIconIn(100);
        animateDone();
      }
    },
    [animateIconIn, animateWelcomeText, animateDone]
  );

  useEffect(() => {
    runStepEntrance(currentStep);
  }, [currentStep]);

  const animateTransition = useCallback(
    (callback: () => void) => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -20, duration: 120, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 120, useNativeDriver: true }),
      ]).start(() => {
        callback();
        slideAnim.setValue(28);
        scaleAnim.setValue(0.96);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 10, useNativeDriver: true }),
          Animated.spring(scaleAnim, { toValue: 1, tension: 90, friction: 10, useNativeDriver: true }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim, scaleAnim]
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
        const d = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        setGmailStatus("error");
        setGmailError(
          res.status === 401
            ? "Session issue — please sign out and sign back in."
            : d.error || "Failed to start Gmail authorization."
        );
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
        animateIconIn(0);
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
  }, [apiBaseUrl, authHeaders, qc, advance, animateIconIn]);

  const finish = useCallback(async () => {
    await SecureStore.setItemAsync("onboarding_complete", "1");
    await SecureStore.setItemAsync("ai_tone", selectedTone);
    router.replace("/");
  }, [selectedTone, router]);

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 32 : insets.bottom;

  const wordAnim = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
      },
      {
        scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] }),
      },
    ],
  });

  const s = styles(colors);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["12%", "100%"],
  });

  const isDark = colors.background === "#000000" || colors.background === "#09090b";

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      {/* ── Ambient background orbs ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <FloatingOrb
          size={SW * 0.8}
          top={SH * -0.15}
          left={SW * -0.2}
          opacity={isDark ? 0.07 : 0.05}
          color={colors.foreground}
          delay={0}
        />
        <FloatingOrb
          size={SW * 0.6}
          top={SH * 0.55}
          left={SW * 0.4}
          opacity={isDark ? 0.06 : 0.04}
          color={colors.foreground}
          delay={300}
        />
        <FloatingOrb
          size={SW * 0.4}
          top={SH * 0.3}
          left={SW * -0.1}
          opacity={isDark ? 0.05 : 0.03}
          color={colors.foreground}
          delay={600}
        />
      </View>

      {/* ── Progress bar ── */}
      <View style={s.progressContainer}>
        <View style={s.progressTrack}>
          <Animated.View style={[s.progressFill, { width: progressWidth }]} />
        </View>
        <Text style={s.progressLabel}>
          {stepIndex + 1} / {STEPS.length}
        </Text>
      </View>

      {/* ── Animated content ── */}
      <Animated.View
        style={[
          s.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] },
        ]}
      >
        {/* Shared icon area */}
        <View style={s.iconArea} pointerEvents="none">
          {/* Pulse ring */}
          <Animated.View
            style={[
              s.iconRing,
              {
                transform: [{ scale: iconRingScale }],
                opacity: iconRingOpacity,
                borderColor:
                  currentStep === "done" || gmailStatus === "connected"
                    ? colors.foreground
                    : colors.border,
              },
            ]}
          />
          {/* Done burst ring */}
          {currentStep === "done" && (
            <Animated.View
              style={[s.burstRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
          )}
          {/* Confetti dots */}
          {currentStep === "done" &&
            CONFETTI_SEEDS.map((seed, i) => (
              <Animated.View
                key={i}
                style={[
                  s.confettiDot,
                  {
                    opacity: confettiAnims[i].opacity,
                    transform: [
                      {
                        translateX: confettiAnims[i].progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.cos(seed.angle) * seed.radius],
                        }),
                      },
                      {
                        translateY: confettiAnims[i].progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.sin(seed.angle) * seed.radius],
                        }),
                      },
                      {
                        scale: confettiAnims[i].progress.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0, 1.3, 0.8],
                        }),
                      },
                    ],
                    backgroundColor: i % 3 === 0
                      ? colors.foreground
                      : i % 3 === 1
                      ? colors.mutedForeground
                      : colors.border,
                  },
                ]}
              />
            ))}
          {/* Icon box */}
          <Animated.View
            style={[
              s.iconBox,
              {
                transform: [{ scale: iconScale }],
                opacity: iconOpacity,
                backgroundColor:
                  currentStep === "done" || gmailStatus === "connected"
                    ? colors.foreground
                    : colors.muted,
              },
            ]}
          >
            <Feather
              name={
                currentStep === "done" || gmailStatus === "connected"
                  ? "check"
                  : currentStep === "welcome"
                  ? "send"
                  : currentStep === "gmail"
                  ? "mail"
                  : "edit-3"
              }
              size={32}
              color={
                currentStep === "done" || gmailStatus === "connected"
                  ? colors.primaryForeground
                  : colors.foreground
              }
            />
          </Animated.View>
        </View>

        {/* ── WELCOME ── */}
        {currentStep === "welcome" && (
          <View style={s.stepContent}>
            <View style={s.welcomeHeadline}>
              {["Your AI", "inbox,", "finally."].map((word, i) => {
                const anim = [titleWord1, titleWord2, titleWord3][i];
                return (
                  <Animated.Text key={word} style={[s.welcomeWord, wordAnim(anim)]}>
                    {word}{" "}
                  </Animated.Text>
                );
              })}
            </View>
            <Animated.Text style={[s.subtitle, { opacity: subtitleAnim }]}>
              ReplyAI handles the replies so you can focus on what matters.
            </Animated.Text>
            <StaggeredItems
              items={WELCOME_PILLS}
              renderItem={(pill, i, anim) => (
                <Animated.View
                  key={pill.label}
                  style={[
                    s.pill,
                    {
                      opacity: anim,
                      transform: [
                        {
                          translateY: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                      ],
                    },
                  ]}
                >
                  <Feather name={pill.icon} size={12} color={colors.mutedForeground} />
                  <Text style={s.pillText}>{pill.label}</Text>
                </Animated.View>
              )}
              delayBase={70}
              stepKey="welcome"
            />
          </View>
        )}

        {/* ── GMAIL ── */}
        {currentStep === "gmail" && (
          <View style={s.stepContent}>
            <Text style={s.title}>
              {gmailStatus === "connected" ? "Gmail connected!" : "Connect Gmail"}
            </Text>
            <Text style={s.subtitle}>
              {gmailStatus === "connected"
                ? "Your inbox is being synced. Let's set up your AI writing style."
                : "Give ReplyAI access to your Gmail to unlock your AI-powered inbox."}
            </Text>
            {gmailStatus !== "connected" && (
              <StaggeredItems
                items={GMAIL_FEATURES}
                renderItem={(f, i, anim) => (
                  <Animated.View
                    key={f.icon}
                    style={[
                      s.featureRow,
                      {
                        opacity: anim,
                        transform: [
                          {
                            translateX: anim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={s.featureIcon}>
                      <Feather name={f.icon} size={15} color={colors.foreground} />
                    </View>
                    <Text style={s.featureText}>{f.text}</Text>
                  </Animated.View>
                )}
                delayBase={80}
                stepKey="gmail"
              />
            )}
            {gmailStatus === "error" && (
              <View style={s.errorBlock}>
                <Text style={s.errorText}>{gmailError}</Text>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: colors.destructive, marginTop: 4 }]}
                  onPress={() => signOut()}
                >
                  <Feather name="log-out" size={15} color="#fff" />
                  <Text style={[s.primaryBtnText, { color: "#fff" }]}>Sign out & try again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── TONE ── */}
        {currentStep === "tone" && (
          <View style={s.stepContent}>
            <Text style={s.title}>Your writing style</Text>
            <Text style={s.subtitle}>How should AI craft replies on your behalf?</Text>
            <View style={s.toneRow}>
              <StaggeredItems
                items={TONES}
                renderItem={(t, i, anim) => {
                  const active = selectedTone === t.id;
                  return (
                    <Animated.View
                      key={t.id}
                      style={{
                        opacity: anim,
                        transform: [
                          {
                            translateY: anim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [24, 0],
                            }),
                          },
                          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                        ],
                      }}
                    >
                      <TouchableOpacity
                        style={[s.toneCard, active ? s.toneCardActive : s.toneCardInactive]}
                        onPress={() => setSelectedTone(t.id)}
                        activeOpacity={0.72}
                      >
                        <View
                          style={[
                            s.toneIconWrap,
                            { backgroundColor: active ? colors.primaryForeground + "22" : colors.muted },
                          ]}
                        >
                          <Feather
                            name={t.icon}
                            size={18}
                            color={active ? colors.primaryForeground : colors.mutedForeground}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[s.toneLabel, active ? { color: colors.primaryForeground } : {}]}
                          >
                            {t.label}
                          </Text>
                          <Text
                            style={[
                              s.toneDesc,
                              active
                                ? { color: colors.primaryForeground, opacity: 0.7 }
                                : {},
                            ]}
                          >
                            {t.description}
                          </Text>
                        </View>
                        {active && (
                          <View style={s.toneCheck}>
                            <Feather name="check" size={12} color={colors.primaryForeground} />
                          </View>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                }}
                delayBase={75}
                stepKey={toneKey}
              />
            </View>
          </View>
        )}

        {/* ── DONE ── */}
        {currentStep === "done" && (
          <View style={s.stepContent}>
            <Text style={s.title}>You're all set!</Text>
            <Text style={s.subtitle}>
              ReplyAI is ready. Head to your inbox and let AI do the heavy lifting.
            </Text>
            <StaggeredItems
              items={[
                { label: "Writing style", value: TONES.find((t) => t.id === selectedTone)?.label ?? "" },
                ...(gmailStatus === "connected" ? [{ label: "Gmail", value: "Connected" }] : []),
              ]}
              renderItem={(item, i, anim) => (
                <Animated.View
                  key={item.label}
                  style={[
                    s.doneChip,
                    {
                      opacity: anim,
                      transform: [
                        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                      ],
                    },
                  ]}
                >
                  <Feather
                    name={i === 0 ? "edit-3" : "mail"}
                    size={13}
                    color={colors.mutedForeground}
                  />
                  <Text style={s.doneChipLabel}>{item.label}</Text>
                  <View style={s.doneChipDivider} />
                  <Text style={s.doneChipValue}>{item.value}</Text>
                </Animated.View>
              )}
              delayBase={120}
              stepKey="done"
            />
          </View>
        )}
      </Animated.View>

      {/* ── Bottom actions ── */}
      <View style={s.bottom}>
        {currentStep === "welcome" && (
          <TouchableOpacity style={s.primaryBtn} onPress={advance} activeOpacity={0.82}>
            <Text style={s.primaryBtnText}>Get started</Text>
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}

        {currentStep === "gmail" && (
          <>
            {gmailStatus === "connected" ? null : gmailStatus === "loading" ? (
              <View style={[s.primaryBtn, { opacity: 0.65 }]}>
                <ActivityIndicator color={colors.primaryForeground} size="small" />
                <Text style={s.primaryBtnText}>Connecting…</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.primaryBtn} onPress={connectGmail} activeOpacity={0.82}>
                <Feather name="mail" size={16} color={colors.primaryForeground} />
                <Text style={s.primaryBtnText}>Connect Gmail</Text>
              </TouchableOpacity>
            )}
            {gmailStatus !== "loading" && gmailStatus !== "connected" && gmailStatus !== "error" && (
              <TouchableOpacity style={s.secondaryBtn} onPress={advance}>
                <Text style={s.secondaryBtnText}>Skip for now</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {currentStep === "tone" && (
          <TouchableOpacity style={s.primaryBtn} onPress={advance} activeOpacity={0.82}>
            <Text style={s.primaryBtnText}>Continue</Text>
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}

        {currentStep === "done" && (
          <TouchableOpacity style={s.primaryBtn} onPress={finish} activeOpacity={0.82}>
            <Text style={s.primaryBtnText}>Go to my inbox</Text>
            <Feather name="inbox" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    progressContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 28,
      paddingTop: 14,
      paddingBottom: 4,
      gap: 10,
    },
    progressTrack: {
      flex: 1,
      height: 3,
      backgroundColor: colors.border,
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: 3,
      backgroundColor: colors.foreground,
      borderRadius: 2,
    },
    progressLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      letterSpacing: 0.4,
    },
    content: {
      flex: 1,
      paddingHorizontal: 28,
    },
    iconArea: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: 28,
      marginBottom: 28,
      height: 96,
    },
    iconRing: {
      position: "absolute",
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 1.5,
    },
    iconBox: {
      width: 72,
      height: 72,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    burstRing: {
      position: "absolute",
      width: 140,
      height: 140,
      borderRadius: 70,
      borderWidth: 2,
      borderColor: colors.foreground,
    },
    confettiDot: {
      position: "absolute",
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    stepContent: {
      flex: 1,
    },
    welcomeHeadline: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
    },
    welcomeWord: {
      fontSize: 34,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.8,
      lineHeight: 42,
    },
    title: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
      marginBottom: 24,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.muted,
      borderRadius: 100,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    pillText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 12,
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
      gap: 0,
    },
    toneCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 15,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      marginBottom: 10,
    },
    toneCardActive: {
      backgroundColor: colors.foreground,
      borderColor: colors.foreground,
    },
    toneCardInactive: {
      backgroundColor: colors.background,
      borderColor: colors.border,
    },
    toneIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    toneLabel: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 1,
    },
    toneDesc: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    toneCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    doneChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    doneChipLabel: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    doneChipDivider: {
      width: 1,
      height: 12,
      backgroundColor: colors.border,
    },
    doneChipValue: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    errorBlock: {
      gap: 10,
      marginTop: 4,
    },
    errorText: {
      fontSize: 13,
      color: colors.destructive,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    bottom: {
      paddingHorizontal: 28,
      paddingBottom: 8,
      gap: 8,
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
  });
}

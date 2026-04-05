import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather, type ComponentProps } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuth } from "@/hooks/useAuth";

type FeatherName = ComponentProps<typeof Feather>["name"];

interface UserSettings {
  defaultTone: "pro" | "casual" | "fast";
  customInstructions?: string;
  emailSignature?: string;
  darkMode?: boolean;
  notifications?: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  plan: "trial" | "pro" | "expired";
  trialEndsAt?: string;
  repliesUsed: number;
  repliesLimit: number;
}

interface GmailAccount {
  id: number;
  email: string;
  isPrimary: boolean;
}

const TONES: Array<{ value: "pro" | "casual" | "fast"; label: string; desc: string; icon: FeatherName }> = [
  { value: "pro", label: "Professional", desc: "Formal & polished", icon: "briefcase" },
  { value: "casual", label: "Casual", desc: "Friendly & relaxed", icon: "smile" },
  { value: "fast", label: "Fast", desc: "Short & direct", icon: "zap" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/auth/me`, { headers });
      return res.json();
    },
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/settings`, { headers });
      return res.json();
    },
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery<{ accounts: GmailAccount[] }>({
    queryKey: ["gmail-accounts"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/accounts`, { headers });
      return res.json();
    },
  });

  const [tone, setTone] = useState<"pro" | "casual" | "fast">("pro");
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    if (settings) {
      setTone(settings.defaultTone ?? "pro");
      setNotifications(settings.notifications ?? false);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (body: Partial<UserSettings>) => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/settings`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (email: string) => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/accounts/${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
      qc.invalidateQueries({ queryKey: ["priority-inbox"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleToneChange = (t: "pro" | "casual" | "fast") => {
    setTone(t);
    updateMutation.mutate({ defaultTone: t });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleNotificationsToggle = (v: boolean) => {
    setNotifications(v);
    updateMutation.mutate({ notifications: v });
  };

  const handleDisconnectAccount = (email: string, isPrimary: boolean) => {
    const accounts = accountsData?.accounts ?? [];
    if (isPrimary && accounts.length === 1) {
      Alert.alert(
        "Disconnect Gmail",
        "This is your only connected account. Disconnecting will remove all Gmail access.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Disconnect", style: "destructive", onPress: () => disconnectMutation.mutate(email) },
        ]
      );
    } else {
      Alert.alert("Disconnect", `Remove ${email}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => disconnectMutation.mutate(email) },
      ]);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const handleManageBilling = () => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const url = domain ? `https://${domain}/billing` : "https://replyai.app/billing";
    Linking.openURL(url);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const displayName =
    profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email
      : "";

  const planLabel =
    profile?.plan === "pro"
      ? "Pro"
      : profile?.plan === "trial"
      ? "Free trial"
      : "Expired";

  const usagePercent =
    profile && profile.repliesLimit > 0
      ? Math.min(1, profile.repliesUsed / profile.repliesLimit)
      : 0;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topPad + 8,
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    scrollContent: {
      paddingBottom: bottomPad + 100,
    },
    section: {
      marginTop: 24,
      paddingHorizontal: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      gap: 14,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    profileEmail: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    planChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: profile?.plan === "pro" ? colors.foreground : colors.muted,
    },
    planChipText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: profile?.plan === "pro" ? colors.primaryForeground : colors.mutedForeground,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: 16,
    },
    usageRow: {
      padding: 16,
    },
    usageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    usageLabel: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    usageCount: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    usageBar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.muted,
      overflow: "hidden",
    },
    usageFill: {
      height: 4,
      borderRadius: 2,
      backgroundColor: usagePercent > 0.9 ? colors.destructive : colors.foreground,
    },
    toneOptions: {
      padding: 12,
      gap: 8,
    },
    toneBtn: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      gap: 12,
    },
    toneBtnActive: {
      borderColor: colors.foreground,
      backgroundColor: colors.foreground,
    },
    toneBtnInactive: {
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    toneLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    toneLabelActive: {
      color: colors.primaryForeground,
    },
    toneLabelInactive: {
      color: colors.foreground,
    },
    toneDesc: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
    toneDescActive: {
      color: "rgba(255,255,255,0.7)",
    },
    toneDescInactive: {
      color: colors.mutedForeground,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
    },
    rowLabel: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    rowSubLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 1,
    },
    accountRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      gap: 12,
    },
    accountDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.foreground,
    },
    accountEmail: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    primaryBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: colors.muted,
      marginRight: 8,
    },
    primaryBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    addAccountBtn: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      gap: 10,
    },
    addAccountText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    signOutBtn: {
      marginTop: 24,
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    signOutText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.destructive,
    },
    versionText: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 16,
      fontFamily: "Inter_400Regular",
    },
    rowChevron: {
      marginLeft: 4,
    },
  });

  const isLoading = profileLoading || settingsLoading;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const accounts = accountsData?.accounts ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card}>
              <View style={styles.profileRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{displayName}</Text>
                  <Text style={styles.profileEmail}>{profile?.email}</Text>
                </View>
                <View style={styles.planChip}>
                  <Text style={styles.planChipText}>{planLabel}</Text>
                </View>
              </View>

              {profile && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.usageRow}>
                    <View style={styles.usageHeader}>
                      <Text style={styles.usageLabel}>AI replies used</Text>
                      <Text style={styles.usageCount}>
                        {profile.repliesUsed} / {profile.repliesLimit}
                      </Text>
                    </View>
                    <View style={styles.usageBar}>
                      <View style={[styles.usageFill, { width: `${usagePercent * 100}%` }]} />
                    </View>
                  </View>

                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.row} onPress={handleManageBilling} activeOpacity={0.7}>
                    <View>
                      <Text style={styles.rowLabel}>
                        {profile.plan === "pro" ? "Manage subscription" : "Upgrade to Pro"}
                      </Text>
                      {profile.plan !== "pro" && (
                        <Text style={styles.rowSubLabel}>$99/year · unlimited replies</Text>
                      )}
                    </View>
                    <Feather name="external-link" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Connected Gmail accounts</Text>
            <View style={styles.card}>
              {accounts.map((acct, i) => (
                <React.Fragment key={acct.email}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.accountRow}>
                    <View style={styles.accountDot} />
                    <Text style={styles.accountEmail} numberOfLines={1}>{acct.email}</Text>
                    {acct.isPrimary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>Primary</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => handleDisconnectAccount(acct.email, acct.isPrimary)}>
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </React.Fragment>
              ))}
              {accounts.length > 0 && <View style={styles.divider} />}
              <Link href="/(auth)/connect-gmail" asChild>
                <TouchableOpacity style={styles.addAccountBtn} activeOpacity={0.7}>
                  <Feather name="plus" size={16} color={colors.foreground} />
                  <Text style={styles.addAccountText}>
                    {accounts.length === 0 ? "Connect Gmail" : "Add another account"}
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Default reply tone</Text>
            <View style={styles.card}>
              <View style={styles.toneOptions}>
                {TONES.map((t) => {
                  const isActive = tone === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[
                        styles.toneBtn,
                        isActive ? styles.toneBtnActive : styles.toneBtnInactive,
                      ]}
                      onPress={() => handleToneChange(t.value)}
                      activeOpacity={0.8}
                    >
                      <Feather
                        name={t.icon}
                        size={16}
                        color={isActive ? colors.primaryForeground : colors.foreground}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.toneLabel,
                            isActive ? styles.toneLabelActive : styles.toneLabelInactive,
                          ]}
                        >
                          {t.label}
                        </Text>
                        <Text
                          style={[
                            styles.toneDesc,
                            isActive ? styles.toneDescActive : styles.toneDescInactive,
                          ]}
                        >
                          {t.desc}
                        </Text>
                      </View>
                      {isActive && (
                        <Feather name="check" size={16} color={colors.primaryForeground} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preferences</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Notifications</Text>
                <Switch
                  value={notifications}
                  onValueChange={handleNotificationsToggle}
                  trackColor={{ false: colors.border, true: colors.foreground }}
                  thumbColor={colors.primaryForeground}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>ReplyAI · v1.0</Text>
        </ScrollView>
      )}
    </View>
  );
}

import React, { useState, useEffect, useRef } from "react";
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
  TextInput,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { THEMES, type ThemeId } from "@/constants/themes";

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
  signature?: string | null;
  signatureImageUrl?: string | null;
}

interface Connector {
  id: string;
  connectorId: string;
  displayName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const TONES: Array<{ value: "pro" | "casual" | "fast"; label: string; desc: string; icon: FeatherName }> = [
  { value: "pro", label: "Professional", desc: "Formal & polished", icon: "briefcase" },
  { value: "casual", label: "Casual", desc: "Friendly & relaxed", icon: "smile" },
  { value: "fast", label: "Fast", desc: "Short & direct", icon: "zap" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const { themeId, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { user } = useUser();

  const [editingName, setEditingName] = useState(false);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [savingName, setSavingName] = useState(false);
  const lastInputRef = useRef<TextInput>(null);
  const [classifyingInbox, setClassifyingInbox] = useState(false);
  const [categoriesData, setCategoriesData] = useState<Array<{ category: string; enabled: boolean }>>([]);

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

  const { data: connectorsData, isLoading: connectorsLoading } = useQuery<{ connectors: Connector[] }>({
    queryKey: ["connectors"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/connectors`, { headers });
      return res.json();
    },
  });

  const disconnectConnectorMutation = useMutation({
    mutationFn: async (connectorId: string) => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/connectors/${encodeURIComponent(connectorId)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const [tone, setTone] = useState<"pro" | "casual" | "fast">("pro");
  const [notifications, setNotifications] = useState(false);

  const [expandedSig, setExpandedSig] = useState<string | null>(null);
  const [sigTexts, setSigTexts] = useState<Record<string, string>>({});
  const [sigImages, setSigImages] = useState<Record<string, string | null>>({});
  const [sigLinks, setSigLinks] = useState<Record<string, Array<{ id: string; label: string; url: string }>>>({});
  const [newLinkLabel, setNewLinkLabel] = useState<Record<string, string>>({});
  const [newLinkUrl, setNewLinkUrl] = useState<Record<string, string>>({});
  const [savingSig, setSavingSig] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setTone(settings.defaultTone ?? "pro");
      setNotifications(settings.notifications ?? false);
    }
  }, [settings]);

  useEffect(() => {
    if (accountsData?.accounts) {
      const texts: Record<string, string> = {};
      const images: Record<string, string | null> = {};
      const links: Record<string, Array<{ id: string; label: string; url: string }>> = {};
      for (const a of accountsData.accounts) {
        let parsed: { text?: string; imageUrl?: string | null; links?: Array<{ label: string; url: string }> } | null = null;
        if (a.signature) {
          try { parsed = JSON.parse(a.signature); } catch { parsed = { text: a.signature }; }
        }
        texts[a.email] = parsed?.text ?? "";
        images[a.email] = parsed?.imageUrl ?? a.signatureImageUrl ?? null;
        links[a.email] = (parsed?.links ?? []).map((l, i) => ({ ...l, id: String(i) }));
      }
      setSigTexts(prev => ({ ...prev, ...texts }));
      setSigImages(prev => ({ ...prev, ...images }));
      setSigLinks(prev => ({ ...prev, ...links }));
    }
  }, [accountsData]);

  const handleToggleSig = (email: string) => {
    setExpandedSig(prev => (prev === email ? null : email));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePickSigImageFromLibrary = async (email: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to add a signature image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      quality: 0.4,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      const mime = result.assets[0].mimeType ?? "image/jpeg";
      setSigImages(prev => ({ ...prev, [email]: `data:${mime};base64,${result.assets[0].base64}` }));
    }
  };

  const handlePickSigImageFromFiles = async (email: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const mime = asset.mimeType ?? "image/jpeg";
    setSigImages(prev => ({ ...prev, [email]: `data:${mime};base64,${b64}` }));
  };

  const handlePickSigImage = (email: string) => {
    Alert.alert("Add image", "Choose source", [
      { text: "Photo Library", onPress: () => handlePickSigImageFromLibrary(email) },
      { text: "Browse Files", onPress: () => handlePickSigImageFromFiles(email) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleRemoveSigImage = (email: string) => {
    setSigImages(prev => ({ ...prev, [email]: null }));
  };

  const handleAddLink = (email: string) => {
    const url = (newLinkUrl[email] ?? "").trim();
    const label = (newLinkLabel[email] ?? "").trim();
    if (!url) return;
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    setSigLinks(prev => ({
      ...prev,
      [email]: [...(prev[email] ?? []), { id: Date.now().toString(), label: label || fullUrl, url: fullUrl }],
    }));
    setNewLinkUrl(prev => ({ ...prev, [email]: "" }));
    setNewLinkLabel(prev => ({ ...prev, [email]: "" }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveLink = (email: string, id: string) => {
    setSigLinks(prev => ({ ...prev, [email]: (prev[email] ?? []).filter(l => l.id !== id) }));
  };

  const handleSaveSig = async (email: string) => {
    setSavingSig(email);
    try {
      const headers = await authHeaders();
      const sigData = {
        text: sigTexts[email] || null,
        imageUrl: sigImages[email] || null,
        links: (sigLinks[email] ?? []).map(({ label, url }) => ({ label, url })),
      };
      await fetch(`${apiBaseUrl}/api/gmail/accounts/${encodeURIComponent(email)}/signature`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ signature: JSON.stringify(sigData), signatureImageUrl: null }),
      });
      await qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setExpandedSig(null);
    } catch {
      Alert.alert("Error", "Could not save signature. Please try again.");
    } finally {
      setSavingSig(null);
    }
  };

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

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/gmail/categories`, { headers });
        if (res.ok) {
          const data = await res.json() as { categories: Array<{ category: string; enabled: boolean }> };
          setCategoriesData(data.categories);
        }
      } catch {}
    })();
  }, [apiBaseUrl, authHeaders]);

  const handleToggleCategory = async (category: string, enabled: boolean) => {
    const updated = categoriesData.map(c => c.category === category ? { ...c, enabled } : c);
    setCategoriesData(updated);
    try {
      const headers = await authHeaders();
      await fetch(`${apiBaseUrl}/api/gmail/categories`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ categories: updated }),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setCategoriesData(categoriesData);
      Alert.alert("Error", "Could not update category. Please try again.");
    }
  };

  const handleClassifyInbox = async () => {
    setClassifyingInbox(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/categories/classify-inbox`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Started", "Your inbox is being labeled in the background. Check back in a moment.");
    } catch {
      Alert.alert("Error", "Failed to start inbox classification.");
    } finally {
      setClassifyingInbox(false);
    }
  };

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

  const handleStartEditName = () => {
    setEditFirst(profile?.firstName ?? user?.firstName ?? "");
    setEditLast(profile?.lastName ?? user?.lastName ?? "");
    setEditingName(true);
  };

  const handleSaveName = async () => {
    const first = editFirst.trim();
    const last = editLast.trim();
    if (!first) return;
    const capitalized = first.charAt(0).toUpperCase() + first.slice(1);
    setSavingName(true);
    try {
      await user?.update({ firstName: capitalized, lastName: last || undefined });
      await qc.invalidateQueries({ queryKey: ["auth-me"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingName(false);
    } catch {
      Alert.alert("Error", "Could not update name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setEditingName(false);
  };

  const handleConnectConnector = async (connectorId: "zoom" | "teams") => {
    try {
      const headers = await authHeaders();
      const mobileUrlRes = await fetch(`${apiBaseUrl}/api/auth/${connectorId}/mobile-url`, { headers });
      if (!mobileUrlRes.ok) {
        Alert.alert("Error", `Could not start ${connectorId === "zoom" ? "Zoom" : "Teams"} authorization.`);
        return;
      }
      const { url: oauthUrl } = await mobileUrlRes.json() as { url: string };

      const result = await WebBrowser.openAuthSessionAsync(oauthUrl, "replyai://oauth-success", {
        showInRecents: true,
        preferEphemeralSession: false,
      });

      if (result.type === "success" && result.url.startsWith("replyai://oauth-success")) {
        qc.invalidateQueries({ queryKey: ["connectors"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.type !== "cancel") {
        Alert.alert("Error", `Could not connect ${connectorId === "zoom" ? "Zoom" : "Teams"}. Please try again.`);
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    }
  };

  const handleDisconnectConnector = (connectorId: string, label: string) => {
    Alert.alert(`Disconnect ${label}`, `Remove your ${label} connection?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => disconnectConnectorMutation.mutate(connectorId),
      },
    ]);
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
    nameEditContainer: {
      padding: 14,
      gap: 10,
    },
    nameInputRow: {
      flexDirection: "row",
      gap: 8,
    },
    nameInput: {
      flex: 1,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    nameActionRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
    nameCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    nameSaveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.foreground,
    },
    nameBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    sigRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      gap: 12,
    },
    sigEditor: {
      padding: 14,
      gap: 10,
    },
    sigInput: {
      minHeight: 80,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      textAlignVertical: "top",
    },
    sigImagePreview: {
      width: 80,
      height: 40,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      resizeMode: "contain",
      backgroundColor: colors.muted,
    },
    sigImageRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    sigImageBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    sigImageBtnText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    sigLinkChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: 6,
    },
    sigLinkLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    sigLinkUrl: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    sigAddLinkRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
    },
    sigActionRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
    sigCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sigSaveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.foreground,
    },
  });

  const isLoading = profileLoading || settingsLoading || connectorsLoading;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const accounts = accountsData?.accounts ?? [];
  const connectors = connectorsData?.connectors ?? [];

  const VIDEO_CONNECTORS: Array<{ id: "zoom" | "teams"; label: string; icon: FeatherName }> = [
    { id: "zoom", label: "Zoom", icon: "video" },
    { id: "teams", label: "Microsoft Teams", icon: "video" },
  ];

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
          {profile?.plan === "trial" && profile.trialEndsAt && (() => {
            const daysLeft = Math.max(0, Math.ceil((new Date(profile.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
            const urgency = daysLeft <= 3;
            return (
              <TouchableOpacity
                onPress={handleManageBilling}
                activeOpacity={0.8}
                style={{
                  marginHorizontal: 16,
                  marginTop: 16,
                  marginBottom: 4,
                  borderRadius: 14,
                  padding: 16,
                  backgroundColor: urgency ? "#EF444415" : colors.muted,
                  borderWidth: 1,
                  borderColor: urgency ? "#EF4444" : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: urgency ? "#EF444425" : colors.background,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Text style={{ fontSize: 22 }}>{urgency ? "⏰" : "🎯"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: urgency ? "#EF4444" : colors.foreground }}>
                    {daysLeft === 0 ? "Trial ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in trial`}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                    Upgrade to Pro for unlimited replies
                  </Text>
                </View>
                <Feather name="arrow-right" size={16} color={urgency ? "#EF4444" : colors.mutedForeground} />
              </TouchableOpacity>
            );
          })()}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card}>
              {editingName ? (
                <View style={styles.nameEditContainer}>
                  <View style={styles.nameInputRow}>
                    <TextInput
                      style={styles.nameInput}
                      value={editFirst}
                      onChangeText={setEditFirst}
                      placeholder="First name"
                      placeholderTextColor={colors.mutedForeground}
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => lastInputRef.current?.focus()}
                    />
                    <TextInput
                      ref={lastInputRef}
                      style={styles.nameInput}
                      value={editLast}
                      onChangeText={setEditLast}
                      placeholder="Last name"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={handleSaveName}
                    />
                  </View>
                  <View style={styles.nameActionRow}>
                    <TouchableOpacity style={styles.nameCancelBtn} onPress={handleCancelEditName} disabled={savingName}>
                      <Text style={[styles.nameBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.nameSaveBtn} onPress={handleSaveName} disabled={savingName}>
                      {savingName ? (
                        <ActivityIndicator size="small" color={colors.primaryForeground} />
                      ) : (
                        <Text style={[styles.nameBtnText, { color: colors.primaryForeground }]}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.profileRow} onPress={handleStartEditName} activeOpacity={0.7}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{displayName}</Text>
                    <Text style={styles.profileEmail}>{profile?.email}</Text>
                  </View>
                  <Feather name="edit-2" size={14} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <View style={styles.planChip}>
                    <Text style={styles.planChipText}>{planLabel}</Text>
                  </View>
                </TouchableOpacity>
              )}

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
              <Link
                href={accounts.length === 0
                  ? "/connect-gmail"
                  : ({ pathname: "/connect-gmail", params: { addAccount: "true" } } as const)
                }
                asChild
              >
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
            <Text style={styles.sectionLabel}>Email Categories</Text>
            <View style={styles.card}>
              {categoriesData.map((cat, i) => (
                <React.Fragment key={cat.category}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{cat.category}</Text>
                    <Switch
                      value={cat.enabled}
                      onValueChange={(v) => handleToggleCategory(cat.category, v)}
                      trackColor={{ false: colors.border, true: colors.foreground }}
                      thumbColor={colors.background}
                    />
                  </View>
                </React.Fragment>
              ))}
              {categoriesData.length > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.addAccountBtn}
                onPress={handleClassifyInbox}
                disabled={classifyingInbox}
                activeOpacity={0.7}
              >
                {classifyingInbox ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <Feather name="tag" size={16} color={colors.foreground} />
                )}
                <Text style={styles.addAccountText}>Label my inbox now</Text>
              </TouchableOpacity>
            </View>
          </View>

          {accounts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Email Signatures</Text>
              <View style={styles.card}>
                {accounts.map((acct, i) => {
                  const isExpanded = expandedSig === acct.email;
                  const hasExistingSig = !!(acct.signature || acct.signatureImageUrl);
                  return (
                    <React.Fragment key={acct.email}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.sigRow}
                        onPress={() => handleToggleSig(acct.email)}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-3" size={15} color={colors.mutedForeground} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowLabel} numberOfLines={1}>{acct.email}</Text>
                          {hasExistingSig && !isExpanded && (
                            <Text style={styles.rowSubLabel} numberOfLines={1}>
                              {acct.signature || "Image attached"}
                            </Text>
                          )}
                        </View>
                        <Feather
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </TouchableOpacity>
                      {isExpanded && (
                        <>
                          <View style={styles.divider} />
                          <View style={styles.sigEditor}>
                            <Text style={[styles.sectionLabel, { marginBottom: 4 }]}>Text</Text>
                            <TextInput
                              style={styles.sigInput}
                              value={sigTexts[acct.email] ?? ""}
                              onChangeText={(t) => setSigTexts(prev => ({ ...prev, [acct.email]: t }))}
                              placeholder="Name, title, company..."
                              placeholderTextColor={colors.mutedForeground}
                              multiline
                              autoCapitalize="none"
                              autoCorrect={false}
                            />

                            <Text style={[styles.sectionLabel, { marginBottom: 4, marginTop: 4 }]}>Image</Text>
                            <View style={styles.sigImageRow}>
                              {sigImages[acct.email] ? (
                                <>
                                  <Image
                                    source={{ uri: sigImages[acct.email]! }}
                                    style={styles.sigImagePreview}
                                  />
                                  <TouchableOpacity
                                    style={styles.sigImageBtn}
                                    onPress={() => handleRemoveSigImage(acct.email)}
                                  >
                                    <Feather name="trash-2" size={13} color={colors.destructive} />
                                    <Text style={[styles.sigImageBtnText, { color: colors.destructive }]}>Remove</Text>
                                  </TouchableOpacity>
                                </>
                              ) : (
                                <TouchableOpacity
                                  style={styles.sigImageBtn}
                                  onPress={() => handlePickSigImage(acct.email)}
                                >
                                  <Feather name="image" size={13} color={colors.foreground} />
                                  <Text style={styles.sigImageBtnText}>Add photo or file</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <Text style={[styles.sectionLabel, { marginBottom: 4, marginTop: 4 }]}>Links</Text>
                            {(sigLinks[acct.email] ?? []).map(link => (
                              <View key={link.id} style={styles.sigLinkChip}>
                                <Feather name="link" size={12} color={colors.mutedForeground} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.sigLinkLabel} numberOfLines={1}>{link.label}</Text>
                                  <Text style={styles.sigLinkUrl} numberOfLines={1}>{link.url}</Text>
                                </View>
                                <TouchableOpacity onPress={() => handleRemoveLink(acct.email, link.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Feather name="x" size={14} color={colors.mutedForeground} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            <View style={styles.sigAddLinkRow}>
                              <View style={{ flex: 1, gap: 6 }}>
                                <TextInput
                                  style={[styles.sigInput, { minHeight: 36, paddingVertical: 6 }]}
                                  value={newLinkLabel[acct.email] ?? ""}
                                  onChangeText={(t) => setNewLinkLabel(prev => ({ ...prev, [acct.email]: t }))}
                                  placeholder="Label (e.g. Schedule a call)"
                                  placeholderTextColor={colors.mutedForeground}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                />
                                <TextInput
                                  style={[styles.sigInput, { minHeight: 36, paddingVertical: 6 }]}
                                  value={newLinkUrl[acct.email] ?? ""}
                                  onChangeText={(t) => setNewLinkUrl(prev => ({ ...prev, [acct.email]: t }))}
                                  placeholder="https://calendly.com/..."
                                  placeholderTextColor={colors.mutedForeground}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  keyboardType="url"
                                />
                              </View>
                              <TouchableOpacity
                                style={[styles.sigImageBtn, { alignSelf: "flex-end", paddingVertical: 10 }]}
                                onPress={() => handleAddLink(acct.email)}
                              >
                                <Feather name="plus" size={14} color={colors.foreground} />
                              </TouchableOpacity>
                            </View>

                            <View style={styles.sigActionRow}>
                              <TouchableOpacity
                                style={styles.sigCancelBtn}
                                onPress={() => setExpandedSig(null)}
                                disabled={savingSig === acct.email}
                              >
                                <Text style={[styles.nameBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.sigSaveBtn}
                                onPress={() => handleSaveSig(acct.email)}
                                disabled={savingSig === acct.email}
                              >
                                {savingSig === acct.email ? (
                                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                                ) : (
                                  <Text style={[styles.nameBtnText, { color: colors.primaryForeground }]}>Save</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Connectors</Text>
            <View style={styles.card}>
              {VIDEO_CONNECTORS.map((vc, i) => {
                const conn = connectors.find((c) => c.connectorId === vc.id && c.status === "connected");
                return (
                  <React.Fragment key={vc.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.row}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <Feather name={vc.icon} size={16} color={colors.foreground} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowLabel}>{vc.label}</Text>
                          {conn && (
                            <Text style={styles.rowSubLabel} numberOfLines={1}>
                              {conn.displayName}
                            </Text>
                          )}
                        </View>
                      </View>
                      {conn ? (
                        <TouchableOpacity
                          onPress={() => handleDisconnectConnector(vc.id, vc.label)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="x" size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleConnectConnector(vc.id)}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.foreground }}
                        >
                          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>
                            Connect
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </React.Fragment>
                );
              })}
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
            <Text style={styles.sectionLabel}>Theme</Text>
            <View style={[styles.card, { padding: 16 }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 12, flexGrow: 1, justifyContent: "center" }}>
                {THEMES.map((theme) => {
                  const isActive = themeId === theme.id;
                  return (
                    <TouchableOpacity
                      key={theme.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTheme(theme.id as ThemeId);
                      }}
                      activeOpacity={0.8}
                      style={{ alignItems: "center", gap: 6 }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: theme.swatch,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: isActive ? 3 : 2,
                          borderColor: isActive ? colors.foreground : colors.border,
                          shadowColor: theme.swatch,
                          shadowOpacity: isActive ? 0.35 : 0,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: isActive ? 4 : 0,
                        }}
                      >
                        {isActive && (
                          <Feather
                            name="check"
                            size={18}
                            color={theme.dark ? "#0a0a0a" : "#ffffff"}
                          />
                        )}
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                        {theme.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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

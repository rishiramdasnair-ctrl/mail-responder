import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Alert,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type FeatherName = ComponentProps<typeof Feather>["name"];

export interface ProposedAction {
  id: string;
  label: string;
  description: string;
  type: "reply" | "forward" | "calendar" | "archive";
  draftContent?: string;
}

interface CalendarDraft {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  emailBody: string;
  emailFrom: string;
  emailSubject: string;
  toEmail: string;
  subject: string;
  accountEmail?: string;
  apiBaseUrl: string;
  getToken: () => Promise<string | null>;
  onActionDone?: () => void;
}

type Phase = "loading" | "actions" | "confirm" | "executing" | "done";

const ACTION_ICONS: Record<string, FeatherName> = {
  reply: "corner-up-left",
  forward: "corner-up-right",
  calendar: "calendar",
  archive: "archive",
};

const ACTION_LABELS: Record<string, string> = {
  reply: "Reply",
  forward: "Forward",
  calendar: "Add to Calendar",
  archive: "Archive",
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

function parseDuration(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e.getTime() - s.getTime()) / 60000);
    if (diff < 60) return `${diff} min`;
    if (diff % 60 === 0) return `${diff / 60}h`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  } catch {
    return "";
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SkeletonBar({ width, height = 14 }: { width: number | `${number}%`; height?: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <View style={{ width, height, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
      <Animated.View style={{ flex: 1, backgroundColor: "#e0e0e0", opacity }} />
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
      <View style={{ marginBottom: 20 }}>
        <SkeletonBar width="60%" height={12} />
        <SkeletonBar width="90%" />
        <SkeletonBar width="75%" />
        <SkeletonBar width={80} height={32} />
      </View>
      <View style={{ marginBottom: 20 }}>
        <SkeletonBar width="50%" height={12} />
        <SkeletonBar width="85%" />
        <SkeletonBar width="70%" />
        <SkeletonBar width={80} height={32} />
      </View>
      <View style={{ marginBottom: 20 }}>
        <SkeletonBar width="55%" height={12} />
        <SkeletonBar width="80%" />
        <SkeletonBar width={80} height={32} />
      </View>
    </View>
  );
}

export function ActionSheet({
  visible,
  onClose,
  threadId,
  emailBody,
  emailFrom,
  emailSubject,
  toEmail,
  subject,
  accountEmail,
  apiBaseUrl,
  getToken,
  onActionDone,
}: ActionSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>("loading");
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<ProposedAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState("");
  const [isCustomFetching, setIsCustomFetching] = useState(false);

  const [draftText, setDraftText] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [calDraft, setCalDraft] = useState<CalendarDraft | null>(null);
  const [calTitle, setCalTitle] = useState("");

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const fetchActions = useCallback(async (instruction?: string) => {
    if (!instruction) setPhase("loading");
    setError(null);
    try {
      const headers = await authHeaders();
      const body: Record<string, string> = {
        threadId: threadId || "",
        emailBody: emailBody || "",
        emailFrom: emailFrom || "",
        emailSubject: emailSubject || "",
      };
      if (instruction) body.customInstruction = instruction;
      if (accountEmail) body.accountEmail = accountEmail;

      const res = await fetch(`${apiBaseUrl}/api/ai/actions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to analyze email");
        setPhase("actions");
        return null;
      }
      return data.actions as ProposedAction[];
    } catch {
      setError("Network error. Please try again.");
      setPhase("actions");
      return null;
    }
  }, [threadId, emailBody, emailFrom, emailSubject, accountEmail, apiBaseUrl, authHeaders]);

  useEffect(() => {
    if (!visible) return;
    setPhase("loading");
    setActions([]);
    setSelectedAction(null);
    setError(null);
    setCustomInstruction("");
    setDraftText("");
    setForwardTo("");
    setCalDraft(null);
    setCalTitle("");

    fetchActions().then((result) => {
      if (result) {
        setActions(result);
        setPhase("actions");
      } else {
        setPhase("actions");
      }
    });
  }, [visible]);

  const handleExecute = useCallback((action: ProposedAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAction(action);

    if (action.type === "reply" || action.type === "forward") {
      setDraftText(action.draftContent || "");
      if (action.type === "forward") setForwardTo("");
    } else if (action.type === "calendar") {
      try {
        const parsed: CalendarDraft = JSON.parse(action.draftContent || "{}");
        setCalDraft(parsed);
        setCalTitle(parsed.title || "");
      } catch {
        setCalDraft({ title: action.label, start: "", end: "" });
        setCalTitle(action.label);
      }
    }
    setPhase("confirm");
  }, []);

  const handleCustomSubmit = useCallback(async () => {
    const instruction = customInstruction.trim();
    if (!instruction) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsCustomFetching(true);
    const result = await fetchActions(instruction);
    setIsCustomFetching(false);
    if (result && result.length > 0) {
      handleExecute(result[0]);
    }
  }, [customInstruction, fetchActions, handleExecute]);

  const sendReply = useCallback(async () => {
    if (!draftText.trim() || !selectedAction) return;
    setPhase("executing");
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          threadId,
          to: toEmail,
          subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
          body: draftText,
          ...(accountEmail ? { account: accountEmail } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert("Send failed", d.error || "Could not send reply");
        setPhase("confirm");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");
      setTimeout(() => { onActionDone?.(); onClose(); }, 1200);
    } catch {
      Alert.alert("Send failed", "Network error. Please try again.");
      setPhase("confirm");
    }
  }, [draftText, selectedAction, threadId, toEmail, subject, accountEmail, apiBaseUrl, authHeaders, onActionDone, onClose]);

  const sendForward = useCallback(async () => {
    const to = forwardTo.trim();
    if (!to || !draftText.trim()) return;
    setPhase("executing");
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/compose`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to,
          subject: subject.startsWith("Fwd:") ? subject : `Fwd: ${subject}`,
          body: draftText,
          ...(accountEmail ? { account: accountEmail } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert("Forward failed", d.error || "Could not send forward");
        setPhase("confirm");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");
      setTimeout(() => { onActionDone?.(); onClose(); }, 1200);
    } catch {
      Alert.alert("Forward failed", "Network error. Please try again.");
      setPhase("confirm");
    }
  }, [forwardTo, draftText, subject, accountEmail, apiBaseUrl, authHeaders, onActionDone, onClose]);

  const createCalendarEvent = useCallback(async () => {
    if (!calDraft) return;
    setPhase("executing");
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/calendar/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: calTitle || calDraft.title,
          start: calDraft.start,
          end: calDraft.end,
          description: calDraft.description,
          location: calDraft.location,
          attendees: calDraft.attendees,
          ...(accountEmail ? { account: accountEmail } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert("Calendar error", d.error || "Could not create event");
        setPhase("confirm");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");
      setTimeout(() => { onActionDone?.(); onClose(); }, 1200);
    } catch {
      Alert.alert("Calendar error", "Network error. Please try again.");
      setPhase("confirm");
    }
  }, [calDraft, calTitle, accountEmail, apiBaseUrl, authHeaders, onActionDone, onClose]);

  const archiveThread = useCallback(async () => {
    setPhase("executing");
    try {
      const headers = await authHeaders();
      const qs = accountEmail ? `?account=${encodeURIComponent(accountEmail)}` : "";
      const res = await fetch(`${apiBaseUrl}/api/gmail/threads/${threadId}/modify${qs}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ removeLabelIds: ["INBOX"], addLabelIds: [] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert("Archive failed", d.error || "Could not archive thread");
        setPhase("confirm");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");
      setTimeout(() => { onActionDone?.(); onClose(); }, 1200);
    } catch {
      Alert.alert("Archive failed", "Network error. Please try again.");
      setPhase("confirm");
    }
  }, [threadId, accountEmail, apiBaseUrl, authHeaders, onActionDone, onClose]);

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: SCREEN_HEIGHT * 0.88,
      paddingBottom: insets.bottom || 16,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    closeBtn: {
      padding: 4,
    },
    body: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    loadingContainer: {
      alignItems: "center",
      paddingVertical: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    errorContainer: {
      padding: 20,
      alignItems: "center",
    },
    errorText: {
      fontSize: 14,
      color: colors.destructive,
      textAlign: "center",
      marginBottom: 12,
      fontFamily: "Inter_400Regular",
    },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    retryText: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    actionCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
      backgroundColor: colors.background,
    },
    actionCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    actionTypeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    actionTypeText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    actionLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    actionDescription: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginBottom: 10,
    },
    executeBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    executeBtnText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    customSection: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 8,
      paddingTop: 14,
    },
    customLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    customRow: {
      flexDirection: "row",
      gap: 8,
    },
    customInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      backgroundColor: colors.background,
    },
    customGoBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 10,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    customGoBtnText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    confirmHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    confirmLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    confirmTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    fieldRow: {
      marginBottom: 12,
    },
    fieldLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    fieldInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      backgroundColor: colors.background,
    },
    draftInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      backgroundColor: colors.background,
      minHeight: 150,
      textAlignVertical: "top",
      lineHeight: 22,
    },
    calCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      backgroundColor: colors.background,
      marginBottom: 12,
    },
    calTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    calRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    calText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    archiveCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      backgroundColor: colors.background,
      marginBottom: 12,
    },
    archiveText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 22,
    },
    actionBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      marginTop: 4,
    },
    actionBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    doneContainer: {
      alignItems: "center",
      paddingVertical: 48,
    },
    doneText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginTop: 12,
    },
    doneSubText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    executingContainer: {
      alignItems: "center",
      paddingVertical: 48,
    },
    executingText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 12,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 20,
      gap: 6,
    },
    backText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

  const renderActions = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.body, styles.scrollContent]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => {
            fetchActions().then((result) => {
              if (result) { setActions(result); setPhase("actions"); } else setPhase("actions");
            });
          }}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        actions.map((action) => (
          <View key={action.id} style={styles.actionCard}>
            <View style={styles.actionCardHeader}>
              <View style={styles.actionTypeBadge}>
                <Feather name={ACTION_ICONS[action.type] ?? "zap"} size={12} color={colors.mutedForeground} />
                <Text style={styles.actionTypeText}>{ACTION_LABELS[action.type] ?? action.type}</Text>
              </View>
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
            <Text style={styles.actionDescription}>{action.description}</Text>
            <TouchableOpacity
              style={styles.executeBtn}
              onPress={() => handleExecute(action)}
              activeOpacity={0.8}
            >
              <Feather name="play" size={12} color={colors.primaryForeground} />
              <Text style={styles.executeBtnText}>Execute</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <View style={styles.customSection}>
        <Text style={styles.customLabel}>Custom instruction</Text>
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={customInstruction}
            onChangeText={setCustomInstruction}
            placeholder="e.g. Ask for more time, mention I'm traveling"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.foreground}
            returnKeyType="go"
            onSubmitEditing={handleCustomSubmit}
            editable={!isCustomFetching}
          />
          <TouchableOpacity
            style={[styles.customGoBtn, (!customInstruction.trim() || isCustomFetching) && { opacity: 0.4 }]}
            onPress={handleCustomSubmit}
            disabled={!customInstruction.trim() || isCustomFetching}
            activeOpacity={0.8}
          >
            {isCustomFetching ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.customGoBtnText}>Go</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  const renderConfirm = () => {
    if (!selectedAction) return null;
    const { type } = selectedAction;

    if (type === "reply") {
      return (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.body, styles.scrollContent]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>To</Text>
              <Text style={[styles.fieldInput, { color: colors.mutedForeground }]}>{toEmail}</Text>
            </View>
            <View style={[styles.fieldRow, { marginBottom: 16 }]}>
              <Text style={styles.fieldLabel}>Draft reply</Text>
              <TextInput
                style={styles.draftInput}
                value={draftText}
                onChangeText={setDraftText}
                multiline
                autoFocus
                placeholder="Edit your reply…"
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.foreground}
              />
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, !draftText.trim() && { opacity: 0.4 }]}
              onPress={sendReply}
              disabled={!draftText.trim()}
              activeOpacity={0.8}
            >
              <Feather name="send" size={16} color={colors.primaryForeground} />
              <Text style={styles.actionBtnText}>Send Reply</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      );
    }

    if (type === "forward") {
      return (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.body, styles.scrollContent]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Forward to</Text>
              <TextInput
                style={styles.fieldInput}
                value={forwardTo}
                onChangeText={setForwardTo}
                placeholder="recipient@example.com"
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.foreground}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
              />
            </View>
            <View style={[styles.fieldRow, { marginBottom: 16 }]}>
              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={styles.draftInput}
                value={draftText}
                onChangeText={setDraftText}
                multiline
                placeholder="Add a note…"
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.foreground}
              />
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, (!forwardTo.trim() || !draftText.trim()) && { opacity: 0.4 }]}
              onPress={sendForward}
              disabled={!forwardTo.trim() || !draftText.trim()}
              activeOpacity={0.8}
            >
              <Feather name="corner-up-right" size={16} color={colors.primaryForeground} />
              <Text style={styles.actionBtnText}>Send Forward</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      );
    }

    if (type === "calendar" && calDraft) {
      return (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, styles.scrollContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.fieldRow, { marginBottom: 16 }]}>
            <Text style={styles.fieldLabel}>Event title</Text>
            <TextInput
              style={styles.fieldInput}
              value={calTitle}
              onChangeText={setCalTitle}
              placeholder="Event title"
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.foreground}
            />
          </View>
          <View style={styles.calCard}>
            {calDraft.start ? (
              <View style={styles.calRow}>
                <Feather name="clock" size={14} color={colors.mutedForeground} />
                <Text style={styles.calText}>
                  {formatDateTime(calDraft.start)}
                  {calDraft.end ? `  ·  ${parseDuration(calDraft.start, calDraft.end)}` : ""}
                </Text>
              </View>
            ) : null}
            {calDraft.location ? (
              <View style={styles.calRow}>
                <Feather name="map-pin" size={14} color={colors.mutedForeground} />
                <Text style={styles.calText}>{calDraft.location}</Text>
              </View>
            ) : null}
            {calDraft.attendees && calDraft.attendees.length > 0 ? (
              <View style={styles.calRow}>
                <Feather name="users" size={14} color={colors.mutedForeground} />
                <Text style={styles.calText}>{calDraft.attendees.join(", ")}</Text>
              </View>
            ) : null}
            {calDraft.description ? (
              <View style={[styles.calRow, { marginTop: 4 }]}>
                <Feather name="file-text" size={14} color={colors.mutedForeground} />
                <Text style={[styles.calText, { flex: 1 }]}>{calDraft.description}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, !calTitle.trim() && { opacity: 0.4 }]}
            onPress={createCalendarEvent}
            disabled={!calTitle.trim()}
            activeOpacity={0.8}
          >
            <Feather name="calendar" size={16} color={colors.primaryForeground} />
            <Text style={styles.actionBtnText}>Create Event</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (type === "archive") {
      return (
        <View style={[styles.body, { paddingTop: 20 }]}>
          <View style={styles.archiveCard}>
            <Text style={styles.archiveText}>
              This thread will be archived and removed from your inbox. You can still find it by searching your Gmail.
            </Text>
          </View>
          <TouchableOpacity style={styles.actionBtn} onPress={archiveThread} activeOpacity={0.8}>
            <Feather name="archive" size={16} color={colors.primaryForeground} />
            <Text style={styles.actionBtnText}>Archive Thread</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const headerTitle = () => {
    if (phase === "loading") return "Analyzing email…";
    if (phase === "actions") return "AI Actions";
    if (phase === "confirm" && selectedAction) return selectedAction.label;
    if (phase === "executing") return "Executing…";
    if (phase === "done") return "Done";
    return "AI Actions";
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {phase === "confirm" && (
                <TouchableOpacity onPress={() => setPhase("actions")} style={{ padding: 4, marginRight: 4 }}>
                  <Feather name="arrow-left" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerTitle()}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {phase === "loading" && <LoadingSkeleton />}

          {phase === "actions" && renderActions()}

          {phase === "confirm" && renderConfirm()}

          {phase === "executing" && (
            <View style={styles.executingContainer}>
              <ActivityIndicator color={colors.foreground} size="large" />
              <Text style={styles.executingText}>Sending…</Text>
            </View>
          )}

          {phase === "done" && (
            <View style={styles.doneContainer}>
              <Feather name="check-circle" size={48} color={colors.foreground} />
              <Text style={styles.doneText}>Done!</Text>
              <Text style={styles.doneSubText}>Action completed successfully</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

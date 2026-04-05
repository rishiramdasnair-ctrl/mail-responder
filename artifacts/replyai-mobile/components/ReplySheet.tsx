import React, { useState, useCallback, useRef } from "react";
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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as Haptics from "expo-haptics";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type FeatherName = ComponentProps<typeof Feather>["name"];

interface ReplySuggestion {
  tone: "pro" | "casual" | "fast";
  content: string;
  reasoning: string;
}

interface ReplySheetProps {
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
  onReplySent?: () => void;
}

const TONE_CONFIG: Record<string, { label: string; icon: FeatherName; desc: string }> = {
  pro: { label: "Professional", icon: "briefcase", desc: "Formal & polished" },
  casual: { label: "Casual", icon: "smile", desc: "Friendly & relaxed" },
  fast: { label: "Fast", icon: "zap", desc: "Short & direct" },
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function ReplySheet({
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
  onReplySent,
}: ReplySheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [phase, setPhase] = useState<"select" | "edit">("select");
  const [error, setError] = useState<string | null>(null);
  const [repliesRemaining, setRepliesRemaining] = useState<number | null>(null);

  const generateReplies = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setSuggestions([]);
    try {
      const token = await getToken();
      const res = await fetch(`${apiBaseUrl}/api/ai/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId,
          emailBody,
          emailFrom,
          emailSubject,
          ...(accountEmail ? { account: accountEmail } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setError(data.error || "Reply limit reached. Upgrade to Pro for unlimited replies.");
        } else {
          setError(data.error || "Failed to generate replies");
        }
        return;
      }
      setSuggestions(data.suggestions || []);
      if (data.repliesRemaining != null) {
        setRepliesRemaining(data.repliesRemaining);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [threadId, emailBody, emailFrom, emailSubject, accountEmail, getToken, apiBaseUrl]);

  React.useEffect(() => {
    if (visible) {
      setPhase("select");
      setSuggestions([]);
      setSelectedTone(null);
      setEditedContent("");
      setError(null);
      generateReplies();
    }
  }, [visible]);

  const selectSuggestion = (s: ReplySuggestion) => {
    setSelectedTone(s.tone);
    setEditedContent(s.content);
    setPhase("edit");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const sendReply = async () => {
    if (!editedContent.trim()) return;
    setIsSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiBaseUrl}/api/gmail/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId,
          to: toEmail,
          subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
          body: editedContent,
          ...(accountEmail ? { account: accountEmail } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        Alert.alert("Send failed", d.error || "Could not send reply");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onReplySent?.();
      onClose();
    } catch {
      Alert.alert("Send failed", "Network error. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

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
      maxHeight: SCREEN_HEIGHT * 0.85,
      paddingBottom: insets.bottom,
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
    loadingContainer: {
      alignItems: "center",
      paddingVertical: 40,
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
    toneCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
      backgroundColor: colors.background,
    },
    toneHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    toneLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginLeft: 6,
    },
    toneDesc: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginLeft: 6,
    },
    toneContent: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 20,
      marginBottom: 10,
    },
    useBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: "center",
    },
    useBtnText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    editPhase: {
      flex: 1,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      marginBottom: 12,
    },
    backText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginLeft: 4,
    },
    toneChip: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    chipText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      marginLeft: 4,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      backgroundColor: colors.background,
      minHeight: 160,
      textAlignVertical: "top",
      lineHeight: 22,
      marginBottom: 16,
    },
    sendBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    sendBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    remainingText: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 12,
      fontFamily: "Inter_400Regular",
    },
    scrollContent: {
      paddingBottom: 20,
    },
  });

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
            <Text style={styles.headerTitle}>
              {phase === "edit" ? "Edit Reply" : "AI Reply Suggestions"}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {phase === "select" ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.body, styles.scrollContent]}
              showsVerticalScrollIndicator={false}
            >
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.foreground} size="large" />
                  <Text style={styles.loadingText}>Generating replies…</Text>
                </View>
              ) : error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={generateReplies}>
                    <Text style={styles.retryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                suggestions.map((s) => {
                  const cfg = TONE_CONFIG[s.tone] ?? { label: s.tone, icon: "message-circle" as FeatherName, desc: "" };
                  return (
                    <View key={s.tone} style={styles.toneCard}>
                      <View style={styles.toneHeader}>
                        <Feather name={cfg.icon} size={14} color={colors.foreground} />
                        <Text style={styles.toneLabel}>{cfg.label}</Text>
                        <Text style={styles.toneDesc}> · {cfg.desc}</Text>
                      </View>
                      <Text style={styles.toneContent} numberOfLines={4}>
                        {s.content}
                      </Text>
                      <TouchableOpacity
                        style={styles.useBtn}
                        onPress={() => selectSuggestion(s)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.useBtnText}>Use this reply</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
              {repliesRemaining != null && !isGenerating && !error && (
                <Text style={styles.remainingText}>
                  {repliesRemaining} AI repl{repliesRemaining === 1 ? "y" : "ies"} remaining
                </Text>
              )}
            </ScrollView>
          ) : (
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={20}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.body, styles.scrollContent]}
                keyboardShouldPersistTaps="handled"
              >
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setPhase("select")}
                >
                  <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                  <Text style={styles.backText}>Back to suggestions</Text>
                </TouchableOpacity>

                {selectedTone && (
                  <View style={styles.toneChip}>
                    <Feather
                      name={TONE_CONFIG[selectedTone]?.icon ?? "message-circle"}
                      size={12}
                      color={colors.mutedForeground}
                    />
                    <Text style={styles.chipText}>
                      {TONE_CONFIG[selectedTone]?.label || selectedTone}
                    </Text>
                  </View>
                )}

                <TextInput
                  style={styles.textInput}
                  value={editedContent}
                  onChangeText={setEditedContent}
                  multiline
                  autoFocus
                  placeholder="Edit your reply…"
                  placeholderTextColor={colors.mutedForeground}
                  selectionColor={colors.foreground}
                />

                <TouchableOpacity
                  style={[styles.sendBtn, (!editedContent.trim() || isSending) && { opacity: 0.5 }]}
                  onPress={sendReply}
                  disabled={!editedContent.trim() || isSending}
                  activeOpacity={0.8}
                >
                  {isSending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <>
                      <Feather name="send" size={16} color={colors.primaryForeground} />
                      <Text style={styles.sendBtnText}>Send</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

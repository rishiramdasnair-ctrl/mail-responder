import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type FeatherName = ComponentProps<typeof Feather>["name"];

interface PendingEmail {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "confirm";
  content: string;
  pendingEmail?: PendingEmail;
  isLoading?: boolean;
}

interface Suggestion {
  label: string;
  prompt: string;
  icon: "mail" | "calendar" | "globe" | "search";
}

const ICON_MAP: Record<string, FeatherName> = {
  mail: "mail",
  calendar: "calendar",
  globe: "globe",
  search: "search",
};

function MessageBubble({
  msg,
  onApproveEmail,
  isApproving,
}: {
  msg: ChatMessage;
  onApproveEmail: (email: PendingEmail) => void;
  isApproving: boolean;
}) {
  const colors = useColors();

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      marginBottom: 12,
      paddingHorizontal: 16,
    },
    userRow: {
      justifyContent: "flex-end",
    },
    assistantRow: {
      justifyContent: "flex-start",
    },
    userBubble: {
      backgroundColor: colors.foreground,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: "80%",
    },
    assistantBubble: {
      backgroundColor: colors.muted,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: "82%",
    },
    userText: {
      color: colors.primaryForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    assistantText: {
      color: colors.foreground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    avatarDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      alignSelf: "flex-end",
      marginBottom: 2,
    },
    confirmCard: {
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      maxWidth: "88%",
    },
    confirmTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 10,
    },
    emailField: {
      marginBottom: 6,
    },
    emailFieldLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    emailFieldValue: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 19,
    },
    emailBody: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    emailBodyText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 20,
    },
    confirmActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    sendBtn: {
      flex: 1,
      backgroundColor: colors.foreground,
      borderRadius: 8,
      paddingVertical: 9,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    },
    sendBtnText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    dismissBtn: {
      flex: 1,
      borderRadius: 8,
      paddingVertical: 9,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    dismissBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
  });

  if (msg.isLoading) {
    return (
      <View style={[styles.row, styles.assistantRow]}>
        <View style={styles.avatarDot}>
          <Feather name="zap" size={14} color={colors.primaryForeground} />
        </View>
        <View style={styles.assistantBubble}>
          <ActivityIndicator color={colors.mutedForeground} size="small" />
        </View>
      </View>
    );
  }

  if (msg.role === "user") {
    return (
      <View style={[styles.row, styles.userRow]}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{msg.content}</Text>
        </View>
      </View>
    );
  }

  if (msg.role === "confirm" && msg.pendingEmail) {
    const email = msg.pendingEmail;
    return (
      <View style={[styles.row, styles.assistantRow]}>
        <View style={styles.avatarDot}>
          <Feather name="zap" size={14} color={colors.primaryForeground} />
        </View>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Ready to send — confirm?</Text>
          <View style={styles.emailField}>
            <Text style={styles.emailFieldLabel}>To</Text>
            <Text style={styles.emailFieldValue}>{email.to}</Text>
          </View>
          <View style={styles.emailField}>
            <Text style={styles.emailFieldLabel}>Subject</Text>
            <Text style={styles.emailFieldValue}>{email.subject}</Text>
          </View>
          <View style={[styles.emailField, styles.emailBody]}>
            <Text style={styles.emailBodyText} numberOfLines={6}>
              {email.body}
            </Text>
          </View>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={[styles.sendBtn, isApproving && { opacity: 0.5 }]}
              onPress={() => onApproveEmail(email)}
              disabled={isApproving}
              activeOpacity={0.8}
            >
              {isApproving ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <>
                  <Feather name="send" size={13} color={colors.primaryForeground} />
                  <Text style={styles.sendBtnText}>Send Email</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.assistantRow]}>
      <View style={styles.avatarDot}>
        <Feather name="zap" size={14} color={colors.primaryForeground} />
      </View>
      <View style={styles.assistantBubble}>
        <Text style={styles.assistantText}>{msg.content}</Text>
      </View>
    </View>
  );
}

export default function AgentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/agent/suggestions`, { headers });
        if (res.ok) {
          const data = await res.json() as { suggestions: Suggestion[] };
          setSuggestions(data.suggestions || []);
        }
      } catch {}
      setLoadingSuggestions(false);
    })();
  }, [apiBaseUrl, authHeaders]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const buildHistory = useCallback((msgs: ChatMessage[]) =>
    msgs
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m.isLoading)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .slice(-20),
    []
  );

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setInputText("");
    setIsSending(true);

    const userMsg: ChatMessage = { id: randomUUID(), role: "user", content: trimmed };
    const loadingMsg: ChatMessage = { id: randomUUID(), role: "assistant", content: "", isLoading: true };

    setMessages((prev) => {
      const next = [...prev, userMsg, loadingMsg];
      return next;
    });
    scrollToBottom();

    try {
      const headers = await authHeaders();
      const history = buildHistory(messages);

      const res = await fetch(`${apiBaseUrl}/api/agent/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({ task: trimmed, history }),
      });

      const data = await res.json() as {
        answer?: string;
        error?: string;
        pendingEmail?: PendingEmail;
      };

      if (!res.ok) {
        const errText = data.error || "Something went wrong. Please try again.";
        setMessages((prev) => prev.map((m) => m.id === loadingMsg.id
          ? { ...m, isLoading: false, content: errText }
          : m
        ));
        return;
      }

      if (data.pendingEmail) {
        const assistantContent = data.answer || "I've drafted an email for you — review and confirm below.";
        const confirmMsg: ChatMessage = {
          id: randomUUID(),
          role: "confirm",
          content: "",
          pendingEmail: data.pendingEmail,
        };
        setMessages((prev) => [
          ...prev.map((m) => m.id === loadingMsg.id
            ? { ...m, isLoading: false, content: assistantContent }
            : m
          ),
          confirmMsg,
        ]);
      } else {
        const assistantContent = data.answer || "Done! Let me know if you need anything else.";
        setMessages((prev) => prev.map((m) => m.id === loadingMsg.id
          ? { ...m, isLoading: false, content: assistantContent }
          : m
        ));
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === loadingMsg.id
        ? { ...m, isLoading: false, content: "Network error. Please try again." }
        : m
      ));
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  }, [messages, isSending, apiBaseUrl, authHeaders, buildHistory, scrollToBottom]);

  const handleApproveEmail = useCallback(async (email: PendingEmail) => {
    if (isApproving) return;
    setIsApproving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/agent/send`, {
        method: "POST",
        headers,
        body: JSON.stringify(email),
      });
      const data = await res.json() as { success?: boolean; error?: string };

      const resultMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: res.ok && data.success
          ? "Email sent successfully!"
          : `Failed to send: ${data.error || "Unknown error"}`,
      };
      setMessages((prev) => [...prev, resultMsg]);
      scrollToBottom();
    } catch {
      const errMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: "Failed to send the email. Please try again.",
      };
      setMessages((prev) => [...prev, errMsg]);
      scrollToBottom();
    } finally {
      setIsApproving(false);
    }
  }, [isApproving, apiBaseUrl, authHeaders, scrollToBottom]);

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
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    messageList: {
      flex: 1,
    },
    messageListContent: {
      paddingTop: 16,
      paddingBottom: 12,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 6,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },
    suggestionsRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingRight: 24,
    },
    suggestionsScroll: {
      marginBottom: 12,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    inputArea: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      paddingTop: 10,
      paddingBottom: botPad + 10,
      paddingHorizontal: 16,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
    },
    textInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      maxHeight: 120,
      backgroundColor: colors.muted,
      lineHeight: 20,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: {
      opacity: 0.35,
    },
    clearBtn: {
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    clearBtnText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

  const isEmpty = messages.length === 0;

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="zap" size={24} color={colors.foreground} />
      </View>
      <Text style={styles.emptyTitle}>What can I help with?</Text>
      <Text style={styles.emptySubtitle}>
        Ask me to reply to emails, schedule meetings, search your inbox, or anything else.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Feather name="zap" size={18} color={colors.primaryForeground} />
          </View>
          <View>
            <Text style={styles.title}>Agent</Text>
            <Text style={styles.subtitle}>AI assistant for email &amp; calendar</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {isEmpty ? (
          <View style={{ flex: 1 }}>
            {renderEmptyState()}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                onApproveEmail={handleApproveEmail}
                isApproving={isApproving}
              />
            )}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
          />
        )}

        <View style={styles.inputArea}>
          {isEmpty && suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsRow}
              style={styles.suggestionsScroll}
            >
              {suggestions.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.chip}
                  onPress={() => sendMessage(s.prompt)}
                  activeOpacity={0.7}
                >
                  <Feather name={ICON_MAP[s.icon] ?? "zap"} size={13} color={colors.mutedForeground} />
                  <Text style={styles.chipText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {isEmpty && loadingSuggestions && (
            <View style={{ paddingBottom: 8, alignItems: "center" }}>
              <ActivityIndicator color={colors.mutedForeground} size="small" />
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask anything about your email or calendar…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              selectionColor={colors.foreground}
              returnKeyType="default"
              editable={!isSending}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isSending) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isSending}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Feather name="send" size={18} color={colors.primaryForeground} />
              )}
            </TouchableOpacity>
          </View>

          {!isEmpty && (
            <TouchableOpacity
              style={[styles.clearBtn, { alignSelf: "center", marginTop: 6 }]}
              onPress={() => setMessages([])}
            >
              <Text style={styles.clearBtnText}>Clear conversation</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { ReplySheet } from "@/components/ReplySheet";

interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
}

interface Thread {
  id: string;
  subject: string;
  messages: EmailMessage[];
  snippet: string;
  isUnread: boolean;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function getInitials(name: string, email: string): string {
  const src = name || email || "";
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function MessageBubble({ msg }: { msg: EmailMessage }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(true);
  const initials = getInitials(msg.fromName, msg.fromEmail);

  const styles = StyleSheet.create({
    bubble: {
      marginBottom: 16,
      paddingHorizontal: 16,
    },
    senderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    senderInfo: {
      flex: 1,
    },
    senderName: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    senderDate: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    collapseBtn: {
      padding: 4,
    },
    bodyContainer: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 14,
      marginLeft: 46,
    },
    bodyText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
    },
    collapsedSnippet: {
      marginLeft: 46,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.muted,
      borderRadius: 12,
    },
    snippetText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <View style={styles.bubble}>
      <View style={styles.senderRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.senderInfo}>
          <Text style={styles.senderName}>{msg.fromName || msg.fromEmail}</Text>
          <Text style={styles.senderDate}>{formatDate(msg.date)}</Text>
        </View>
        <TouchableOpacity style={styles.collapseBtn} onPress={() => setExpanded(!expanded)}>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View style={styles.bodyContainer}>
          <Text style={styles.bodyText}>
            {msg.body?.trim() || msg.snippet || "(no content)"}
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.collapsedSnippet} onPress={() => setExpanded(true)}>
          <Text style={styles.snippetText} numberOfLines={1}>{msg.snippet}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ThreadScreen() {
  const { threadId, accountEmail } = useLocalSearchParams<{ threadId: string; accountEmail?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders, getToken } = useApiClient();
  const [showReplySheet, setShowReplySheet] = useState(false);

  const { data: thread, isLoading, isError, error } = useQuery<Thread>({
    queryKey: ["thread", threadId, accountEmail],
    queryFn: async () => {
      const headers = await authHeaders();
      const qs = accountEmail ? `?account=${encodeURIComponent(accountEmail)}` : "";
      const res = await fetch(`${apiBaseUrl}/api/gmail/threads/${threadId}${qs}`, { headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to load thread");
      }
      return res.json();
    },
    enabled: !!threadId,
  });

  const lastMessage = thread?.messages?.[thread.messages.length - 1];

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    errorText: {
      fontSize: 14,
      color: colors.destructive,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
      marginTop: 16,
    },
    subject: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    scrollContent: {
      paddingTop: 16,
      paddingBottom: bottomPad + 100,
    },
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      padding: 16,
      paddingBottom: bottomPad + 16,
    },
    replyBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    replyBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    msgCount: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      marginBottom: 12,
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerBackTitle: "Inbox",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={colors.foreground} size="large" />
          </View>
        ) : isError ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={48} color={colors.border} />
            <Text style={styles.errorText}>
              {error?.message || "Failed to load thread"}
            </Text>
          </View>
        ) : thread ? (
          <>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.subject}>{thread.subject || "(no subject)"}</Text>
              {thread.messages.length > 1 && (
                <Text style={styles.msgCount}>
                  {thread.messages.length} messages
                </Text>
              )}
              {thread.messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.replyBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowReplySheet(true);
                }}
                activeOpacity={0.8}
                testID="ai-reply-btn"
              >
                <Feather name="cpu" size={16} color={colors.primaryForeground} />
                <Text style={styles.replyBtnText}>AI Reply</Text>
              </TouchableOpacity>
            </View>

            {lastMessage && (
              <ReplySheet
                visible={showReplySheet}
                onClose={() => setShowReplySheet(false)}
                threadId={threadId!}
                emailBody={lastMessage.body || lastMessage.snippet || ""}
                emailFrom={lastMessage.from}
                emailSubject={thread.subject}
                toEmail={lastMessage.fromEmail || lastMessage.from}
                subject={thread.subject}
                accountEmail={accountEmail}
                apiBaseUrl={apiBaseUrl}
                getToken={getToken}
                onReplySent={() => {
                  qc.invalidateQueries({ queryKey: ["priority-inbox"] });
                  qc.invalidateQueries({ queryKey: ["thread", threadId, accountEmail] });
                  router.back();
                }}
              />
            )}
          </>
        ) : null}
      </View>
    </>
  );
}

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { ActionSheet } from "@/components/ActionSheet";
import { EmailBodyRenderer } from "@/components/EmailBodyRenderer";
import { AttachmentsSection, type Attachment } from "@/components/AttachmentViewer";

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
  bodyType: "html" | "plain";
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
  attachments?: Attachment[];
}

interface Thread {
  id: string;
  subject: string;
  messages: EmailMessage[];
  snippet: string;
  isUnread: boolean;
  unsubscribeLink?: string;
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

function MessageBubble({
  msg,
  apiBaseUrl,
  authHeaders,
}: {
  msg: EmailMessage;
  apiBaseUrl: string;
  authHeaders: () => Promise<Record<string, string>>;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(true);
  const initials = getInitials(msg.fromName, msg.fromEmail);

  const styles = StyleSheet.create({
    bubble: {
      marginBottom: 2,
    },
    senderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    senderInfo: {
      flex: 1,
    },
    senderName: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    senderDate: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 1,
    },
    collapseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    bodyContainer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    summaryContainer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    summaryText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    viewFullBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 10,
      marginTop: 4,
    },
    viewFullText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: 4,
    },
  });

  const hasAttachments = msg.attachments && msg.attachments.length > 0;

  return (
    <View style={styles.bubble}>
      <TouchableOpacity
        style={styles.senderRow}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.senderInfo}>
          <Text style={styles.senderName}>{msg.fromName || msg.fromEmail}</Text>
          <Text style={styles.senderDate}>{formatDate(msg.date)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {hasAttachments && !expanded && (
            <Feather name="paperclip" size={14} color={colors.mutedForeground} />
          )}
          <View style={styles.collapseBtn}>
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
          </View>
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.bodyContainer}>
          <EmailBodyRenderer
            body={msg.body?.trim() || msg.snippet || ""}
            bodyType={msg.bodyType ?? "plain"}
            backgroundColor={colors.background}
            textColor={colors.foreground}
            mutedColor={colors.mutedForeground}
            borderColor={colors.border}
          />
          {hasAttachments && (
            <AttachmentsSection
              attachments={msg.attachments!}
              messageId={msg.id}
              apiBaseUrl={apiBaseUrl}
              authHeaders={authHeaders}
            />
          )}
        </View>
      ) : (
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryText} numberOfLines={5}>
            {msg.snippet}
          </Text>
          <TouchableOpacity
            style={styles.viewFullBtn}
            onPress={() => setExpanded(true)}
            activeOpacity={0.6}
          >
            <Text style={styles.viewFullText}>View full email</Text>
            <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.divider} />
    </View>
  );
}

export default function ThreadScreen() {
  const { threadId, accountEmail, action } = useLocalSearchParams<{ threadId: string; accountEmail?: string; action?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const [showReplySheet, setShowReplySheet] = useState(false);
  const autoOpenedRef = React.useRef(false);
  const [threadSummary, setThreadSummary] = useState<string | null>(null);
  const [threadTriage, setThreadTriage] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryFetchedRef = React.useRef(false);

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
    staleTime: 2 * 60_000,
  });

  const lastMessage = thread?.messages?.[thread.messages.length - 1];

  // Silently mark thread as read when it loads and has unread messages
  React.useEffect(() => {
    if (!thread?.isUnread || !threadId) return;
    (async () => {
      try {
        const headers = await authHeaders();
        const qs = accountEmail ? `?account=${encodeURIComponent(accountEmail)}` : "";
        await fetch(`${apiBaseUrl}/api/gmail/threads/${threadId}/modify${qs}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ removeLabelIds: ["UNREAD"], addLabelIds: [] }),
        });
        qc.setQueryData<Thread>(["thread", threadId, accountEmail], (old) =>
          old ? { ...old, isUnread: false, messages: old.messages.map((m) => ({ ...m, isUnread: false })) } : old
        );
        qc.setQueriesData<any>({ queryKey: ["priority-inbox"] }, (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              threads: page.threads.map((t: any) =>
                t.threadId === threadId ? { ...t, isUnread: false } : t
              ),
            })),
          };
        });
      } catch {}
    })();
  }, [thread?.isUnread, threadId, accountEmail, apiBaseUrl, authHeaders, qc]);

  // Auto-open the ActionSheet when navigated from a priority card with a specific action
  React.useEffect(() => {
    if (!action || !thread || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    const t = setTimeout(() => setShowReplySheet(true), 400);
    return () => clearTimeout(t);
  }, [action, thread]);

  // Fetch AI thread summary for multi-message threads
  useEffect(() => {
    if (!thread || thread.messages.length < 2 || summaryFetchedRef.current) return;
    summaryFetchedRef.current = true;
    (async () => {
      setSummaryLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/ai/thread-summary`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: thread.subject,
            messages: thread.messages.map((m) => ({ fromName: m.fromName, date: m.date, body: m.body || m.snippet })),
          }),
        });
        if (res.ok) {
          const data = await res.json() as { summary?: string; triage?: string };
          if (data.summary) setThreadSummary(data.summary);
          if (data.triage) setThreadTriage(data.triage);
        }
      } catch {}
      setSummaryLoading(false);
    })();
  }, [thread, apiBaseUrl, authHeaders]);

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
      paddingTop: 0,
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
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingLeft: Platform.OS === "web" ? 4 : 0,
      paddingRight: 8,
      paddingVertical: 4,
    },
    backBtnText: {
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
  });

  const BackButton = () => (
    <TouchableOpacity
      style={styles.backBtn}
      onPress={() => router.back()}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name="arrow-left" size={22} color={colors.foreground} />
      <Text style={styles.backBtnText}>Inbox</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerLeft: () => <BackButton />,
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

              {(summaryLoading || threadSummary) && (
                <View style={{
                  marginHorizontal: 16,
                  marginBottom: 12,
                  backgroundColor: colors.muted,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Feather name="zap" size={12} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      AI Summary
                    </Text>
                    {threadTriage && !summaryLoading && (() => {
                      const triageColors: Record<string, { bg: string; text: string }> = {
                        "REPLY-NOW": { bg: "#FF2D5518", text: "#FF2D55" },
                        "REPLY-TODAY": { bg: "#FF6B3518", text: "#FF6B35" },
                        "DECISION": { bg: "#5856D618", text: "#5856D6" },
                        "FYI": { bg: colors.border, text: colors.mutedForeground },
                      };
                      const tc = triageColors[threadTriage] || { bg: colors.border, text: colors.mutedForeground };
                      return (
                        <View style={{ marginLeft: "auto", backgroundColor: tc.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: tc.text, letterSpacing: 0.3 }}>
                            {threadTriage}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                  {summaryLoading ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 20 }}>
                      {threadSummary}
                    </Text>
                  )}
                </View>
              )}

              {thread.unsubscribeLink ? (
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginHorizontal: 16,
                  marginBottom: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: colors.muted,
                  gap: 8,
                }}>
                  <Feather name="inbox" size={14} color={colors.mutedForeground} />
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                    Mailing list
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      Linking.openURL(thread.unsubscribeLink!);
                    }}
                    activeOpacity={0.65}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                      Unsubscribe
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {thread.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  apiBaseUrl={apiBaseUrl}
                  authHeaders={authHeaders}
                />
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
                testID="ai-actions-btn"
              >
                <Feather name="zap" size={16} color={colors.primaryForeground} />
                <Text style={styles.replyBtnText}>{action ? action : "AI Actions"}</Text>
              </TouchableOpacity>
            </View>

            <ActionSheet
              visible={showReplySheet}
              onClose={() => setShowReplySheet(false)}
              threadId={threadId!}
              emailBody={lastMessage?.body || lastMessage?.snippet || thread.snippet || ""}
              emailFrom={lastMessage?.from ?? ""}
              emailSubject={thread.subject}
              toEmail={lastMessage?.fromEmail || lastMessage?.from || ""}
              subject={thread.subject}
              accountEmail={accountEmail}
              onActionDone={() => {
                qc.invalidateQueries({ queryKey: ["priority-inbox"] });
                qc.invalidateQueries({ queryKey: ["thread", threadId, accountEmail] });
                router.back();
              }}
            />
          </>
        ) : null}
      </View>
    </>
  );
}

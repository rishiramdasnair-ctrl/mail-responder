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
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
  Alert,
  Animated,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Audio } from "expo-av";
import { fetch } from "expo/fetch";
import * as FileSystem from "expo-file-system";
import { useAuth } from "@/hooks/useAuth";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { ConnectorStrip } from "@/components/ConnectorStrip";
import { useGmailAccounts } from "@/hooks/useGmailAccounts";

type FeatherName = ComponentProps<typeof Feather>["name"];

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface PendingEmail {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

interface PendingCalendarEvent {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface AgentStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: "success" | "error";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "loading" | "confirm-email" | "confirm-event";
  content: string;
  steps?: AgentStep[];
  pendingEmail?: PendingEmail;
  pendingCalendarEvent?: PendingCalendarEvent;
  resolved?: boolean;
  resolvedLabel?: string;
  streaming?: boolean;
}

interface Suggestion {
  label: string;
  prompt: string;
  icon: "mail" | "calendar" | "globe" | "search";
}

interface ConversationSummary {
  id: number;
  title: string;
  updatedAt: string;
}

interface ConversationMessage {
  id: number;
  role: string;
  content: string;
  stepsData: string | null;
}

const ICON_MAP: Record<string, FeatherName> = {
  mail: "mail",
  calendar: "calendar",
  globe: "globe",
  search: "search",
};

function stepLabel(s: AgentStep): string {
  const i = s.input as Record<string, string>;
  switch (s.toolName) {
    case "search_emails": return `Searching emails for "${i.query ?? ""}"`;
    case "read_email": return "Reading email thread";
    case "send_email": return "Preparing email draft";
    case "list_calendar_events": return "Checking your calendar";
    case "create_calendar_event": return `Preparing event "${i.title ?? ""}"`;
    case "search_web": return `Searching the web for "${i.query ?? ""}"`;
    case "browse_url": return `Visiting ${i.url ?? "page"}`;
    case "get_page_state": return "Reading page content";
    case "click_element": return `Clicking "${i.description ?? ""}"`;
    case "type_text": return `Filling in "${i.field_description ?? ""}"`;
    default: return s.toolName.replace(/_/g, " ");
  }
}

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function MessageBubble({
  msg,
  onApproveEmail,
  onDismissEmail,
  onApproveEvent,
  onDismissEvent,
  isActing,
}: {
  msg: ChatMessage;
  onApproveEmail: (email: PendingEmail, msgId: string) => void;
  onDismissEmail: (msgId: string) => void;
  onApproveEvent: (event: PendingCalendarEvent, msgId: string) => void;
  onDismissEvent: (msgId: string) => void;
  isActing: boolean;
}) {
  const colors = useColors();

  const s = StyleSheet.create({
    userRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 10, paddingHorizontal: 16 },
    assistantRow: { flexDirection: "row", justifyContent: "flex-start", alignItems: "flex-end", gap: 8, marginBottom: 10, paddingHorizontal: 16 },
    avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    userBubble: { backgroundColor: colors.foreground, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" },
    userText: { color: colors.primaryForeground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
    assistantBubble: { backgroundColor: colors.muted, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "82%" },
    stepsContainer: { marginTop: 6, gap: 3 },
    stepRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    stepDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.mutedForeground },
    stepText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1 },
    streamingText: { color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
    cursor: { color: colors.mutedForeground, fontSize: 14 },
    card: { backgroundColor: colors.background, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, maxWidth: "88%" },
    cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 10 },
    fieldLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    fieldValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 19, marginBottom: 6 },
    bodyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 20, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    actions: { flexDirection: "row", gap: 8, marginTop: 12 },
    approveBtn: { flex: 1, backgroundColor: colors.foreground, borderRadius: 8, paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
    approveTxt: { color: colors.primaryForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" },
    dismissBtn: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    dismissTxt: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    resolvedBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
    resolvedText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  const markdownStyles = {
    body: { color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    strong: { fontFamily: "Inter_600SemiBold" },
    em: { fontStyle: "italic" as const },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    list_item: { marginBottom: 3 },
    code_inline: { backgroundColor: colors.border, borderRadius: 3, paddingHorizontal: 4, fontSize: 13, fontFamily: "Inter_400Regular" },
    fence: { backgroundColor: colors.border, borderRadius: 6, padding: 10, marginVertical: 6 },
    code_block: { backgroundColor: colors.border, borderRadius: 6, padding: 10, marginVertical: 6 },
    heading1: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 },
    heading2: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 4 },
    heading3: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 3 },
    hr: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: 8 },
    blockquote: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 10, marginLeft: 0 },
  };

  if (msg.role === "user") {
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}><Text style={s.userText}>{msg.content}</Text></View>
      </View>
    );
  }

  if (msg.role === "loading") {
    const hasContent = msg.content && msg.content.length > 0;
    return (
      <View style={s.assistantRow}>
        <View style={s.avatar}><Feather name="message-square" size={13} color={colors.primaryForeground} /></View>
        <View style={[s.assistantBubble, { flexShrink: 1 }]}>
          {hasContent ? (
            <Text style={s.streamingText}>
              {msg.content}<Text style={s.cursor}>▌</Text>
            </Text>
          ) : (
            <ActivityIndicator color={colors.mutedForeground} size="small" />
          )}
          {msg.steps && msg.steps.length > 0 && (
            <View style={s.stepsContainer}>
              {msg.steps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepDot} />
                  <Text style={s.stepText} numberOfLines={1}>{stepLabel(step)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  if (msg.role === "confirm-email" && msg.pendingEmail) {
    const email = msg.pendingEmail;
    const disabled = msg.resolved || isActing;
    return (
      <View style={s.assistantRow}>
        <View style={s.avatar}><Feather name="message-square" size={13} color={colors.primaryForeground} /></View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Email draft — ready to send</Text>
          <Text style={s.fieldLabel}>To</Text>
          <Text style={s.fieldValue}>{email.to}</Text>
          <Text style={s.fieldLabel}>Subject</Text>
          <Text style={s.fieldValue}>{email.subject}</Text>
          <Text style={s.bodyText} numberOfLines={8}>{email.body}</Text>
          {msg.resolved ? (
            <View style={s.resolvedBadge}>
              <Feather
                name={msg.resolvedLabel === "dismissed" || msg.resolvedLabel === "error" ? "x-circle" : "check-circle"}
                size={13} color={colors.mutedForeground}
              />
              <Text style={s.resolvedText}>
                {msg.resolvedLabel === "dismissed" ? "Dismissed" : msg.resolvedLabel === "error" ? "Failed to send" : "Email sent"}
              </Text>
            </View>
          ) : (
            <View style={s.actions}>
              <TouchableOpacity style={[s.approveBtn, disabled && { opacity: 0.5 }]} onPress={() => onApproveEmail(email, msg.id)} disabled={disabled} activeOpacity={0.8}>
                {isActing ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <><Feather name="send" size={13} color={colors.primaryForeground} /><Text style={s.approveTxt}>Send</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.dismissBtn, disabled && { opacity: 0.5 }]} onPress={() => onDismissEmail(msg.id)} disabled={disabled} activeOpacity={0.8}>
                <Text style={s.dismissTxt}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (msg.role === "confirm-event" && msg.pendingCalendarEvent) {
    const ev = msg.pendingCalendarEvent;
    const disabled = msg.resolved || isActing;
    return (
      <View style={s.assistantRow}>
        <View style={s.avatar}><Feather name="message-square" size={13} color={colors.primaryForeground} /></View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Calendar event — confirm to create</Text>
          <Text style={s.fieldLabel}>Event</Text>
          <Text style={s.fieldValue}>{ev.title}</Text>
          <Text style={s.fieldLabel}>Start</Text>
          <Text style={s.fieldValue}>{formatEventDate(ev.start)}</Text>
          <Text style={s.fieldLabel}>End</Text>
          <Text style={s.fieldValue}>{formatEventDate(ev.end)}</Text>
          {ev.location ? (<><Text style={s.fieldLabel}>Location</Text><Text style={s.fieldValue}>{ev.location}</Text></>) : null}
          {ev.description ? (<><Text style={s.fieldLabel}>Description</Text><Text style={s.fieldValue} numberOfLines={3}>{ev.description}</Text></>) : null}
          {ev.attendees?.length ? (<><Text style={s.fieldLabel}>Attendees</Text><Text style={s.fieldValue}>{ev.attendees.join(", ")}</Text></>) : null}
          {msg.resolved ? (
            <View style={s.resolvedBadge}>
              <Feather
                name={msg.resolvedLabel === "dismissed" || msg.resolvedLabel === "error" ? "x-circle" : "check-circle"}
                size={13} color={colors.mutedForeground}
              />
              <Text style={s.resolvedText}>
                {msg.resolvedLabel === "dismissed" ? "Dismissed" : msg.resolvedLabel === "error" ? "Failed to create" : "Event created"}
              </Text>
            </View>
          ) : (
            <View style={s.actions}>
              <TouchableOpacity style={[s.approveBtn, disabled && { opacity: 0.5 }]} onPress={() => onApproveEvent(ev, msg.id)} disabled={disabled} activeOpacity={0.8}>
                {isActing ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <><Feather name="calendar" size={13} color={colors.primaryForeground} /><Text style={s.approveTxt}>Create Event</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.dismissBtn, disabled && { opacity: 0.5 }]} onPress={() => onDismissEvent(msg.id)} disabled={disabled} activeOpacity={0.8}>
                <Text style={s.dismissTxt}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.assistantRow}>
      <View style={s.avatar}><Feather name="message-square" size={13} color={colors.primaryForeground} /></View>
      <View style={[s.assistantBubble, { flexShrink: 1 }]}>
        <Markdown style={markdownStyles}>
          {msg.content}
        </Markdown>
        {msg.steps && msg.steps.length > 0 && (
          <View style={s.stepsContainer}>
            {msg.steps.map((step, i) => (
              <View key={i} style={s.stepRow}>
                <View style={[s.stepDot, { backgroundColor: step.status === "error" ? "#ef4444" : colors.mutedForeground }]} />
                <Text style={s.stepText} numberOfLines={1}>{stepLabel(step)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return diffMins <= 1 ? "just now" : `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

function HistoryModal({
  visible,
  onClose,
  onOpenConversation,
  apiBaseUrl,
  authHeaders,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenConversation: (id: number, msgs: ConversationMessage[]) => void;
  apiBaseUrl: string;
  authHeaders: () => Promise<Record<string, string>>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    authHeaders()
      .then((headers) =>
        fetch(`${apiBaseUrl}/api/agent/conversations`, { headers })
          .then((r) => r.ok ? r.json() as Promise<{ conversations: ConversationSummary[] }> : { conversations: [] })
          .then((data) => setConversations(data.conversations ?? []))
          .catch(() => setConversations([]))
      )
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [visible, apiBaseUrl, authHeaders]);

  const handleOpen = async (id: number) => {
    setOpeningId(id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/agent/conversations/${id}`, { headers });
      if (!res.ok) return;
      const data = await res.json() as { messages: ConversationMessage[] };
      onOpenConversation(id, data.messages ?? []);
    } catch { /* ignore */ } finally {
      setOpeningId(null);
    }
  };

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      backgroundColor: colors.background,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: insets.bottom + 16,
      maxHeight: "80%",
    },
    handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
    title: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    closeBtn: { padding: 4 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    itemTitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, flex: 1, marginRight: 12 },
    itemDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay} />
      </TouchableWithoutFeedback>
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>Conversation History</Text>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={s.empty}><ActivityIndicator color={colors.mutedForeground} /></View>
        ) : conversations.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No conversations yet</Text></View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => String(c.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.item} onPress={() => handleOpen(item.id)} activeOpacity={0.7} disabled={openingId === item.id}>
                <Text style={s.itemTitle} numberOfLines={2}>{item.title}</Text>
                {openingId === item.id
                  ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                  : <Text style={s.itemDate}>{formatRelativeDate(item.updatedAt)}</Text>
                }
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

export default function AgentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { user } = useAuth();
  const rawFirst = user?.firstName || user?.username || null;
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1) : null;

  const { accounts: gmailAccounts } = useGmailAccounts();
  const gmailConnected = gmailAccounts.length > 0;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleVoicePress = useCallback(async () => {
    if (isTranscribing) return;

    if (isRecording) {
      setIsRecording(false);
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (!recording) return;
      try {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = recording.getURI();
        if (!uri) return;

        setIsTranscribing(true);
        try {
          const allHeaders = await authHeaders();
          const formData = new FormData();
          if (Platform.OS === "web") {
            const blob = await fetch(uri).then((r) => r.blob());
            formData.append("audio", blob, "audio.webm");
          } else {
            const fileInfo = await FileSystem.getInfoAsync(uri);
            if (!fileInfo.exists) return;
            formData.append("audio", {
              uri,
              name: "audio.m4a",
              type: "audio/m4a",
            } as unknown as Blob);
          }
          const res = await fetch(`${apiBaseUrl}/api/ai/transcribe`, {
            method: "POST",
            headers: { Authorization: allHeaders["Authorization"] },
            body: formData,
          });
          if (res.ok) {
            const data = await res.json() as { text?: string };
            if (data.text) {
              setInputText((prev) => (prev ? `${prev} ${data.text}` : data.text!));
            }
          }
        } catch {
          Alert.alert("Transcription failed", "Could not transcribe your recording. Please try again.");
        } finally {
          setIsTranscribing(false);
        }
      } catch {
        setIsTranscribing(false);
      }
      return;
    }

    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Voice input is not supported in the web browser.");
      return;
    }

    const { status, canAskAgain } = await Audio.getPermissionsAsync();
    if (status !== "granted") {
      if (!canAskAgain) {
        Alert.alert(
          "Microphone Access Required",
          "ReplyAI needs microphone access to transcribe your voice. Please enable it in Settings.",
          [{ text: "OK" }]
        );
        return;
      }
      const result = await Audio.requestPermissionsAsync();
      if (result.status !== "granted") {
        Alert.alert(
          "Microphone Denied",
          "ReplyAI needs microphone access to use voice input. You can enable it in your device settings.",
          [{ text: "OK" }]
        );
        return;
      }
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert("Recording failed", "Could not start recording. Please try again.");
    }
  }, [isRecording, isTranscribing, apiBaseUrl, authHeaders]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 56, web: 84, default: 49 }) as number;
  const botPad = (Platform.OS === "web" ? 0 : insets.bottom) + TAB_BAR_HEIGHT;

  const { data: suggestionsData, isLoading: loadingSuggestions } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ["agent-suggestions"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/agent/suggestions`, { headers });
      if (!res.ok) return { suggestions: [] };
      return res.json() as Promise<{ suggestions: Suggestion[] }>;
    },
    staleTime: 5 * 60_000,
  });
  const suggestions = suggestionsData?.suggestions ?? [];

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const buildHistory = useCallback((msgs: ChatMessage[]) =>
    msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .slice(-20),
    []
  );

  const handleCatchMeUp = useCallback(async () => {
    if (digestLoading || isSending) return;
    setDigestLoading(true);
    const loadingId = uuid();
    const loadingMsg: ChatMessage = { id: loadingId, role: "loading", content: "" };
    setMessages([loadingMsg]);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/ai/digest`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = res.ok ? (await res.json() as { digest?: string }) : {};
      const digestText = data.digest || "No digest available right now.";
      const assistantMsg: ChatMessage = { id: uuid(), role: "assistant", content: digestText };
      setMessages([assistantMsg]);
    } catch {
      const errMsg: ChatMessage = { id: uuid(), role: "assistant", content: "Failed to generate your digest. Please try again." };
      setMessages([errMsg]);
    }
    setDigestLoading(false);
  }, [digestLoading, isSending, apiBaseUrl, authHeaders]);

  const handleOpenConversation = useCallback((id: number, msgs: ConversationMessage[]) => {
    const chatMsgs: ChatMessage[] = msgs.map((m) => ({
      id: uuid(),
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
      steps: m.stepsData ? (JSON.parse(m.stepsData) as AgentStep[]) : undefined,
    }));
    setMessages(chatMsgs);
    setActiveConversationId(id);
    setShowHistory(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInputText("");
    setIsSending(true);

    const userMsg: ChatMessage = { id: uuid(), role: "user", content: trimmed };
    const loadingId = uuid();
    const loadingMsg: ChatMessage = { id: loadingId, role: "loading", content: "", steps: [] };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    scrollToBottom();

    try {
      const headers = await authHeaders();
      const currentMsgs = [...messages, userMsg];
      const history = buildHistory(currentMsgs);
      const convId = activeConversationId;

      const res = await fetch(`${apiBaseUrl}/api/agent/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({ task: trimmed, history, ...(convId ? { conversationId: convId } : {}) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        const errText = data.error || "Something went wrong. Please try again.";
        setMessages((prev) => prev.map((m) => m.id === loadingId ? { ...m, role: "assistant" as const, content: errText } : m));
        setIsSending(false);
        return;
      }

      if (!res.body) {
        setMessages((prev) => prev.map((m) => m.id === loadingId ? { ...m, role: "assistant" as const, content: "Streaming not supported." } : m));
        setIsSending(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }

          const type = event.type as string;

          if (type === "token") {
            const token = event.content as string;
            setMessages((prev) => prev.map((m) =>
              m.id === loadingId ? { ...m, content: (m.content || "") + token } : m
            ));
            scrollToBottom();
          } else if (type === "step") {
            const step = event.step as AgentStep;
            setMessages((prev) => prev.map((m) =>
              m.id === loadingId ? { ...m, steps: [...(m.steps ?? []), step] } : m
            ));
          } else if (type === "done") {
            doneReceived = true;
            const answer = (event.answer as string) || "";
            const newConvId = typeof event.conversationId === "number" ? event.conversationId : null;
            if (newConvId) setActiveConversationId(newConvId);
            setMessages((prev) => {
              const inProgress = prev.find((m) => m.id === loadingId);
              const stepsFromLoading = inProgress?.steps ?? [];
              return [
                ...prev.filter((m) => m.id !== loadingId),
                { id: uuid(), role: "assistant" as const, content: answer, steps: stepsFromLoading },
              ];
            });
            scrollToBottom();
            setIsSending(false);
          } else if (type === "pending_email") {
            const data = event.data as PendingEmail;
            setMessages((prev) => [...prev, { id: uuid(), role: "confirm-email" as const, content: "", pendingEmail: data }]);
            scrollToBottom();
          } else if (type === "pending_event") {
            const data = event.data as PendingCalendarEvent;
            setMessages((prev) => [...prev, { id: uuid(), role: "confirm-event" as const, content: "", pendingCalendarEvent: data }]);
            scrollToBottom();
          } else if (type === "error") {
            doneReceived = true;
            const errMsg = (event.message as string) || "Something went wrong.";
            setMessages((prev) => prev.map((m) =>
              m.id === loadingId ? { ...m, role: "assistant" as const, content: errMsg } : m
            ));
            setIsSending(false);
          }
        }
      }

      if (!doneReceived) {
        setMessages((prev) => prev.map((m) =>
          m.id === loadingId && m.role === "loading" ? { ...m, role: "assistant" as const } : m
        ));
        setIsSending(false);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setIsSending(false);
        return;
      }
      setMessages((prev) => prev.map((m) =>
        m.id === loadingId ? { ...m, role: "assistant" as const, content: "Network error. Please try again." } : m
      ));
      setIsSending(false);
    }
  }, [messages, isSending, apiBaseUrl, authHeaders, buildHistory, scrollToBottom, activeConversationId]);

  const handleApproveEmail = useCallback(async (email: PendingEmail, msgId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/agent/send`, {
        method: "POST", headers,
        body: JSON.stringify(email),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      const ok = res.ok && data.success;
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, resolved: true, resolvedLabel: ok ? "sent" : "error" } : m
      ));
      const confirmMsg: ChatMessage = {
        id: uuid(), role: "assistant",
        content: ok ? "Email sent successfully!" : `Failed to send: ${data.error || "Unknown error"}`,
      };
      setMessages((prev) => [...prev, confirmMsg]);
      scrollToBottom();
    } catch {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, resolved: true, resolvedLabel: "error" } : m));
    } finally {
      setIsActing(false);
    }
  }, [isActing, apiBaseUrl, authHeaders, scrollToBottom]);

  const handleDismissEmail = useCallback((msgId: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, resolved: true, resolvedLabel: "dismissed" } : m
    ));
  }, []);

  const handleApproveEvent = useCallback(async (event: PendingCalendarEvent, msgId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/agent/create-event`, {
        method: "POST", headers,
        body: JSON.stringify(event),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      const ok = res.ok && data.success;
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, resolved: true, resolvedLabel: ok ? "created" : "error" } : m
      ));
      const confirmMsg: ChatMessage = {
        id: uuid(), role: "assistant",
        content: ok ? `Event created! ${data.message || ""}`.trim() : `Failed to create event: ${data.error || "Unknown error"}`,
      };
      setMessages((prev) => [...prev, confirmMsg]);
      scrollToBottom();
    } catch {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, resolved: true, resolvedLabel: "error" } : m));
    } finally {
      setIsActing(false);
    }
  }, [isActing, apiBaseUrl, authHeaders, scrollToBottom]);

  const handleDismissEvent = useCallback((msgId: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, resolved: true, resolvedLabel: "dismissed" } : m
    ));
  }, []);

  const isEmpty = messages.length === 0;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8, paddingBottom: 12, paddingHorizontal: 16,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.3 },
    subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    messageList: { flex: 1 },
    messageListContent: { paddingTop: 16, paddingBottom: 12 },
    emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    emptyTitle: { fontSize: 24, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 8, textAlign: "center" },
    emptySubtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22 },
    suggestionsScroll: { marginBottom: 10 },
    suggestionsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingRight: 24 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    chipText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    inputArea: {
      backgroundColor: colors.background,
      paddingTop: 10, paddingBottom: botPad + 10, paddingHorizontal: 16,
    },
    inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
    textInput: {
      flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 22,
      paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.foreground,
      fontFamily: "Inter_400Regular", maxHeight: 120, backgroundColor: colors.background, lineHeight: 20,
    },
    sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" },
    sendBtnDisabled: { opacity: 0.35 },
    micBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    micBtnRecording: { backgroundColor: "#ef4444", borderColor: "#ef4444" },
    clearBtn: { paddingHorizontal: 4, paddingVertical: 4, alignSelf: "center", marginTop: 6 },
    clearBtnText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.headerRow, { justifyContent: "space-between" }]}>
          <View>
            <Text style={styles.title}>Agent</Text>
            <Text style={styles.subtitle}>AI assistant for email &amp; calendar</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowHistory(true)}
            style={{ padding: 8 }}
            activeOpacity={0.7}
          >
            <Feather name="clock" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <HistoryModal
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        onOpenConversation={handleOpenConversation}
        apiBaseUrl={apiBaseUrl}
        authHeaders={authHeaders}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {isEmpty ? (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }}>
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  {getGreeting()}{firstName ? `, ${firstName}` : ""}
                </Text>
                <Text style={styles.emptySubtitle}>
                  What can I help you with?
                </Text>
                <TouchableOpacity
                  onPress={handleCatchMeUp}
                  disabled={digestLoading}
                  activeOpacity={0.8}
                  style={{
                    marginTop: 20,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 24,
                    backgroundColor: colors.foreground,
                  }}
                >
                  {digestLoading ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Feather name="inbox" size={16} color={colors.primaryForeground} />
                  )}
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>
                    Catch me up
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                  onDismissEmail={handleDismissEmail}
                  onApproveEvent={handleApproveEvent}
                  onDismissEvent={handleDismissEvent}
                  isActing={isActing}
                />
              )}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToBottom}
              keyboardShouldPersistTaps="handled"
            />
          </TouchableWithoutFeedback>
        )}

        <ConnectorStrip gmailConnected={gmailConnected} exclude={["zoom", "gmail", "calendar"]} />

        <View style={styles.inputArea}>
          {isEmpty && suggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow} style={styles.suggestionsScroll}>
              {suggestions.map((sug, i) => (
                <TouchableOpacity key={i} style={styles.chip} onPress={() => sendMessage(sug.prompt)} activeOpacity={0.7}>
                  <Feather name={ICON_MAP[sug.icon] ?? "message-circle"} size={13} color={colors.mutedForeground} />
                  <Text style={styles.chipText}>{sug.label}</Text>
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
            {Platform.OS !== "web" && (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[styles.micBtn, isRecording && styles.micBtnRecording]}
                  onPress={handleVoicePress}
                  disabled={isSending || isTranscribing}
                  activeOpacity={0.8}
                >
                  {isTranscribing ? (
                    <ActivityIndicator color={colors.mutedForeground} size="small" />
                  ) : (
                    <Feather
                      name="mic"
                      size={18}
                      color={isRecording ? "#fff" : colors.mutedForeground}
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
            )}
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={isRecording ? "Recording… tap mic to stop" : "Ask anything about your email or calendar…"}
              placeholderTextColor={isRecording ? "#ef4444" : colors.mutedForeground}
              multiline
              selectionColor={colors.foreground}
              returnKeyType="default"
              editable={!isSending && !isRecording}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isSending || isRecording) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isSending || isRecording}
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
            <TouchableOpacity style={styles.clearBtn} onPress={() => { abortRef.current?.abort(); setMessages([]); setIsSending(false); setActiveConversationId(null); }}>
              <Text style={styles.clearBtnText}>New conversation</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

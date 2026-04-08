import React, { useState, useMemo } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

interface Attendee {
  email: string;
  name: string;
  responseStatus: string;
}

interface ConferenceEntry {
  entryPointType: string | null | undefined;
  uri: string | null | undefined;
  label: string | null | undefined;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  attendees: Attendee[];
  htmlLink: string | null;
  description: string | null;
  organizer: { email: string; name: string } | null;
  conferenceData: { entryPoints: ConferenceEntry[] } | null;
}

function toLocalDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function formatFullDate(iso: string, isAllDay: boolean): string {
  const d = toLocalDate(iso);
  if (isAllDay) return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return d.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTimeRange(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const s = toLocalDate(start);
  const e = toLocalDate(end);
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function rsvpLabel(status: string): string {
  switch (status) {
    case "accepted": return "Accepted";
    case "declined": return "Declined";
    case "tentative": return "Maybe";
    default: return "Invited";
  }
}

function rsvpColor(status: string, foreground: string, muted: string, destructive: string): string {
  switch (status) {
    case "accepted": return "#16a34a";
    case "declined": return destructive;
    case "tentative": return "#d97706";
    default: return muted;
  }
}

function MarkdownBrief({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(
        <Text key={i} style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 18, marginBottom: 6 }}>
          {line.replace("## ", "")}
        </Text>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <Text key={i} style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 8, marginBottom: 6 }}>
          {line.replace("# ", "")}
        </Text>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <View key={i} style={{ flexDirection: "row", marginBottom: 5, paddingLeft: 4 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21, marginRight: 8 }}>•</Text>
          <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 21 }}>
            {line.replace(/^[-*]\s/, "").replace(/\*\*(.*?)\*\*/g, "$1")}
          </Text>
        </View>
      );
    } else if (line.trim() === "") {
      elements.push(<View key={i} style={{ height: 4 }} />);
    } else {
      const cleaned = line.replace(/\*\*(.*?)\*\*/g, "$1");
      elements.push(
        <Text key={i} style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 21, marginBottom: 2 }}>
          {cleaned}
        </Text>
      );
    }
  }

  return <View>{elements}</View>;
}

export default function EventDetailScreen() {
  const { eventId, eventData } = useLocalSearchParams<{ eventId: string; eventData?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const [brief, setBrief] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const parsedPlaceholder = useMemo<CalendarEvent | undefined>(() => {
    if (!eventData) return undefined;
    try { return JSON.parse(eventData as string) as CalendarEvent; } catch { return undefined; }
  }, [eventData]);

  const { data: event, isLoading, isError, error } = useQuery<CalendarEvent>({
    queryKey: ["calendar-event", eventId],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/calendar/events/${eventId}`, { headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to fetch event");
      }
      return res.json();
    },
    enabled: !!eventId,
    staleTime: 60_000,
    placeholderData: parsedPlaceholder,
  });

  const generateBrief = async () => {
    if (!eventId || generatingBrief) return;
    setGeneratingBrief(true);
    setBriefError(null);
    setBrief(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/calendar/events/${eventId}/brief`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to generate brief");
      }
      const data = await res.json() as { brief: string };
      setBrief(data.brief);
    } catch (e: any) {
      setBriefError(e.message || "Failed to generate brief");
    } finally {
      setGeneratingBrief(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 24 : insets.bottom;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topPad + 8,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    scrollContent: { padding: 20, paddingBottom: botPad + 40 },
    eventTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.3, marginBottom: 16 },
    card: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 14,
      backgroundColor: colors.card, padding: 16, marginBottom: 14,
    },
    sectionLabel: {
      fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12,
    },
    detailRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 12 },
    detailText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 21 },
    detailSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    attendeeRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
    avatarCircle: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: colors.muted,
      alignItems: "center", justifyContent: "center",
    },
    avatarText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    attendeeName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    rsvpBadge: { fontSize: 11, fontFamily: "Inter_500Medium" },
    joinBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.foreground, borderRadius: 10,
      paddingHorizontal: 16, paddingVertical: 10, marginTop: 4,
    },
    joinBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    briefBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      borderWidth: 1.5, borderColor: colors.foreground, borderRadius: 12,
      paddingVertical: 13, paddingHorizontal: 20, marginBottom: 14,
    },
    briefBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    briefCard: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 14,
      backgroundColor: colors.card, padding: 16, marginBottom: 14,
    },
    briefHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
    briefTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    regenerateBtn: { marginLeft: "auto" as any },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#ef4444", textAlign: "center", marginBottom: 14 },
  });

  if (isLoading && !event) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.foreground} size="large" />
      </View>
    );
  }

  if (isError || !event) {
    return (
      <View style={s.container}>
        <View style={s.headerBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Event</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name="calendar" size={40} color={colors.border} />
          <Text style={{ marginTop: 16, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground }}>
            {(error as Error)?.message || "Event not found"}
          </Text>
          <TouchableOpacity style={[s.briefBtn, { marginTop: 20 }]} onPress={() => router.back()}>
            <Text style={s.briefBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const videoEntry = event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video");
  const phoneEntry = event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "phone");

  return (
    <View style={s.container}>
      <View style={s.headerBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Event Details</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <Text style={s.eventTitle}>{event.title}</Text>

        <View style={s.card}>
          <Text style={s.sectionLabel}>When</Text>
          <View style={s.detailRow}>
            <Feather name="clock" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.detailText}>{formatFullDate(event.start, event.isAllDay)}</Text>
              <Text style={s.detailSub}>{formatTimeRange(event.start, event.end, event.isAllDay)}</Text>
            </View>
          </View>

          {event.location && (
            <View style={s.detailRow}>
              <Feather name="map-pin" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
              <Text style={s.detailText}>{event.location}</Text>
            </View>
          )}

          {event.organizer && (
            <View style={s.detailRow}>
              <Feather name="user" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
              <Text style={s.detailText}>
                Organized by {event.organizer.name || event.organizer.email}
              </Text>
            </View>
          )}
        </View>

        {(videoEntry || phoneEntry) && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>Join Meeting</Text>
            {videoEntry?.uri && (
              <TouchableOpacity style={s.joinBtn} onPress={() => Linking.openURL(videoEntry.uri!)}>
                <Feather name="video" size={16} color={colors.primaryForeground} />
                <Text style={s.joinBtnText}>{videoEntry.label || "Join Video Call"}</Text>
              </TouchableOpacity>
            )}
            {phoneEntry?.uri && (
              <TouchableOpacity
                style={[s.joinBtn, { backgroundColor: colors.muted, marginTop: videoEntry ? 8 : 0 }]}
                onPress={() => Linking.openURL(phoneEntry.uri!)}
              >
                <Feather name="phone" size={16} color={colors.foreground} />
                <Text style={[s.joinBtnText, { color: colors.foreground }]}>{phoneEntry.label || "Dial in"}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {event.attendees.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>{event.attendees.length} Attendee{event.attendees.length !== 1 ? "s" : ""}</Text>
            {event.attendees.map((a, i) => (
              <View key={i} style={s.attendeeRow}>
                <View style={s.avatarCircle}>
                  <Text style={s.avatarText}>{(a.name || a.email).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.attendeeName} numberOfLines={1}>{a.name || a.email}</Text>
                  {a.name && <Text style={s.detailSub} numberOfLines={1}>{a.email}</Text>}
                </View>
                <Text style={[s.rsvpBadge, { color: rsvpColor(a.responseStatus, colors.foreground, colors.mutedForeground, "#ef4444") }]}>
                  {rsvpLabel(a.responseStatus)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {event.description && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>Description</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 21 }}>
              {event.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
            </Text>
          </View>
        )}

        {brief ? (
          <View style={s.briefCard}>
            <View style={s.briefHeader}>
              <Feather name="zap" size={15} color={colors.foreground} />
              <Text style={s.briefTitle}>Pre-Meeting Brief</Text>
              <TouchableOpacity style={s.regenerateBtn} onPress={generateBrief} disabled={generatingBrief}>
                <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <MarkdownBrief text={brief} colors={colors} />
          </View>
        ) : briefError ? (
          <>
            <Text style={s.errorText}>{briefError}</Text>
            <TouchableOpacity style={s.briefBtn} onPress={generateBrief} disabled={generatingBrief}>
              {generatingBrief
                ? <ActivityIndicator color={colors.foreground} size="small" />
                : <><Feather name="zap" size={16} color={colors.foreground} /><Text style={s.briefBtnText}>Try again</Text></>
              }
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={s.briefBtn} onPress={generateBrief} disabled={generatingBrief}>
            {generatingBrief ? (
              <>
                <ActivityIndicator color={colors.foreground} size="small" />
                <Text style={s.briefBtnText}>Generating brief…</Text>
              </>
            ) : (
              <>
                <Feather name="zap" size={16} color={colors.foreground} />
                <Text style={s.briefBtnText}>Generate Pre-Meeting Brief</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

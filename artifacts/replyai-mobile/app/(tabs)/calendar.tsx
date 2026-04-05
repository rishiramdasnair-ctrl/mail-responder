import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  attendees: Array<{ email: string; name: string; responseStatus: string }>;
  htmlLink: string | null;
  description: string | null;
}

function toLocalDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function formatEventTime(evt: CalendarEvent): string {
  if (evt.isAllDay) return "All day";
  const start = toLocalDate(evt.start);
  const end = toLocalDate(evt.end);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatEventDate(iso: string): string {
  const d = toLocalDate(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Section = { dateKey: string; label: string; events: CalendarEvent[] };

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const today = new Date();
  const startStr = dateKey(today);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 30);
  const endStr = dateKey(endDate);

  const { data, isLoading, isError, error, isRefetching, refetch } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["calendar-range", startStr, endStr],
    queryFn: async () => {
      const headers = await authHeaders();
      const params = new URLSearchParams({ start: startStr, end: endStr });
      const res = await fetch(`${apiBaseUrl}/api/calendar/events?${params}`, { headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const errData = d as { error?: string; code?: string };
        const err = Object.assign(new Error(errData.error || "Failed"), { code: errData.code });
        throw err;
      }
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const sections = useMemo<Section[]>(() => {
    const events = data?.events ?? [];
    const map = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      const dk = dateKey(toLocalDate(evt.start));
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(evt);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dk, evts]) => ({
        dateKey: dk,
        label: formatEventDate(dk),
        events: evts.sort(
          (a, b) => toLocalDate(a.start).getTime() - toLocalDate(b.start).getTime()
        ),
      }));
  }, [data]);

  const allItems: Array<{ type: "header"; label: string } | { type: "event"; event: CalendarEvent }> =
    useMemo(() => {
      const items: Array<{ type: "header"; label: string } | { type: "event"; event: CalendarEvent }> = [];
      for (const sec of sections) {
        items.push({ type: "header", label: sec.label });
        for (const evt of sec.events) {
          items.push({ type: "event", event: evt });
        }
      }
      return items;
    }, [sections]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
    subtitle: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 8,
    },
    sectionLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    eventCard: {
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
    },
    eventTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    eventTime: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 4,
    },
    eventMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    eventMetaText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
    attendeeDots: {
      flexDirection: "row",
      gap: 4,
      marginTop: 6,
    },
    attendeeDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    attendeeDotText: {
      fontSize: 9,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    allDayBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.foreground,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 4,
    },
    allDayText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingTop: 80,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
    },
    errorNote: {
      marginTop: 8,
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    retryBtn: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    retryText: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
  });

  const renderItem = ({ item }: { item: (typeof allItems)[number] }) => {
    if (item.type === "header") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{item.label}</Text>
        </View>
      );
    }
    const evt = item.event;
    return (
      <View style={styles.eventCard}>
        {evt.isAllDay && (
          <View style={styles.allDayBadge}>
            <Text style={styles.allDayText}>ALL DAY</Text>
          </View>
        )}
        <Text style={styles.eventTitle}>{evt.title}</Text>
        <Text style={styles.eventTime}>{formatEventTime(evt)}</Text>
        {evt.location && (
          <View style={styles.eventMeta}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={styles.eventMetaText} numberOfLines={1}>{evt.location}</Text>
          </View>
        )}
        {evt.attendees.length > 0 && (
          <View style={styles.attendeeDots}>
            {evt.attendees.slice(0, 5).map((a, i) => (
              <View key={i} style={styles.attendeeDot}>
                <Text style={styles.attendeeDotText}>
                  {(a.name || a.email).charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {evt.attendees.length > 5 && (
              <View style={styles.attendeeDot}>
                <Text style={styles.attendeeDotText}>+{evt.attendees.length - 5}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>Calendar</Text>
      <Text style={styles.subtitle}>Next 30 days</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.foreground} size="large" />
      </View>
    );
  }

  if (isError) {
    const errCode = (error as Error & { code?: string })?.code;
    const isNotConnected = errCode === "NOT_CONNECTED" || errCode === "PERMISSION_DENIED" || error?.message?.includes("not connected");
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Feather name="calendar" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>
            {isNotConnected ? "Calendar not connected" : "Couldn't load calendar"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {isNotConnected
              ? "Connect Gmail to access your Google Calendar events."
              : (error?.message || "Something went wrong")}
          </Text>
          {isNotConnected ? (
            <Link href="/(auth)/connect-gmail" asChild>
              <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.foreground, borderColor: colors.foreground }]}>
                <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Connect Gmail</Text>
              </TouchableOpacity>
            </Link>
          ) : (
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={allItems}
        keyExtractor={(item, i) =>
          item.type === "header" ? `header-${item.label}` : `event-${item.event.id}-${i}`
        }
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="calendar" size={48} color={colors.border} />
            <Text style={styles.emptyTitle}>No upcoming events</Text>
            <Text style={styles.emptySubtitle}>
              Your calendar is clear for the next 30 days.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.foreground}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      />
    </View>
  );
}

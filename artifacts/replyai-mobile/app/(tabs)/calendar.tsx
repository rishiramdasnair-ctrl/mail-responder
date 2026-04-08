import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ScrollView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

interface GmailAccount {
  email: string;
  isPrimary: boolean;
}

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

function isPastEvent(evt: CalendarEvent): boolean {
  const end = toLocalDate(evt.end);
  if (evt.isAllDay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return end < today;
  }
  return end < new Date();
}

function formatEventTime(evt: CalendarEvent): string {
  if (evt.isAllDay) return "All day";
  const start = toLocalDate(evt.start);
  const end = toLocalDate(evt.end);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Section = { dateKey: string; events: CalendarEvent[] };

type ListItem =
  | { type: "header"; sectionKey: string }
  | { type: "event"; event: CalendarEvent; isLast: boolean };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatSectionHeader(dk: string): { dayNum: string; weekday: string } {
  const d = toLocalDate(dk);
  return {
    dayNum: String(d.getDate()).padStart(2, "0"),
    weekday: WEEKDAYS[d.getDay()],
  };
}

function formatTodayHeader(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function getInitials(name: string, email: string): string {
  const src = name || email;
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.charAt(0).toUpperCase();
}

const ATTENDEE_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];

function getAttendeeColor(index: number): string {
  return ATTENDEE_COLORS[index % ATTENDEE_COLORS.length];
}

function buildDateStrip(today: Date): Array<{ date: Date; key: string }> {
  const strip: Array<{ date: Date; key: string }> = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    strip.push({ date: d, key: dateKey(d) });
  }
  return strip;
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<ListItem>>(null);
  const { apiBaseUrl, authHeaders } = useApiClient();

  const today = new Date();
  const [selectedDateKey, setSelectedDateKey] = useState<string>(dateKey(today));
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/gmail/accounts`, { headers });
        if (res.ok) {
          const d = (await res.json()) as { accounts: GmailAccount[] };
          setAccounts(d.accounts);
        }
      } catch {}
    })();
  }, [apiBaseUrl, authHeaders]);

  const startStr = dateKey(today);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 30);
  const endStr = dateKey(endDate);

  const { data, isLoading, isError, error, isRefetching, refetch } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["calendar-range", startStr, endStr, selectedAccount],
    queryFn: async () => {
      const headers = await authHeaders();
      const params = new URLSearchParams({ start: startStr, end: endStr });
      if (selectedAccount !== "all") params.set("account", selectedAccount);
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
        events: evts.sort(
          (a, b) => toLocalDate(a.start).getTime() - toLocalDate(b.start).getTime()
        ),
      }));
  }, [data]);

  const allItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const sec of sections) {
      items.push({ type: "header", sectionKey: sec.dateKey });
      sec.events.forEach((evt, idx) => {
        items.push({ type: "event", event: evt, isLast: idx === sec.events.length - 1 });
      });
    }
    return items;
  }, [sections]);

  const sectionIndexMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    allItems.forEach((item, idx) => {
      if (item.type === "header") {
        map[item.sectionKey] = idx;
      }
    });
    return map;
  }, [allItems]);

  const todayKey = dateKey(today);
  const dateStrip = useMemo(() => buildDateStrip(today), [todayKey]);

  const handleDateSelect = useCallback((key: string) => {
    setSelectedDateKey(key);
    const idx = sectionIndexMap[key];
    if (idx !== undefined && listRef.current) {
      listRef.current.scrollToIndex({ index: idx, animated: true, viewOffset: 0 });
    }
  }, [sectionIndexMap]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerWrap: {
      paddingTop: topPad + 8,
      paddingBottom: 10,
      paddingHorizontal: 20,
      backgroundColor: colors.background,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    headerDateText: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.4,
    },
    newEventBtn: {
      paddingVertical: 4,
      paddingHorizontal: 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    newEventText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    accountPillsScroll: {
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    accountPillsRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    accountPill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      flexShrink: 0,
    },
    accountPillText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    dateStripWrap: {
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.background,
    },
    dateCell: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginRight: 6,
      borderRadius: 20,
      minWidth: 44,
    },
    dateCellDayLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.2,
      marginBottom: 4,
    },
    dateCellNum: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    dateCellTodayDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginTop: 3,
    },
    sectionHeaderWrap: {
      paddingTop: 32,
      paddingBottom: 10,
      paddingLeft: 20,
      paddingRight: 20,
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    sectionDayNum: {
      fontSize: 42,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -1,
      lineHeight: 46,
    },
    sectionWeekday: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      letterSpacing: 0,
    },
    timelineRow: {
      flexDirection: "row",
      paddingLeft: 20,
      paddingRight: 20,
    },
    timelineLeft: {
      width: 28,
      alignItems: "center",
      flexShrink: 0,
    },
    timelineLineBottom: {
      position: "absolute",
      left: 13,
      top: 9,
      bottom: -16,
      width: 1.5,
      backgroundColor: colors.border,
    },
    timelineDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      marginTop: 8,
      zIndex: 1,
    },
    eventContent: {
      flex: 1,
      paddingLeft: 12,
      paddingBottom: 20,
    },
    allDayStrip: {
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    allDayTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: -0.1,
    },
    allDayTimeLabel: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    eventTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      letterSpacing: -0.1,
      lineHeight: 21,
    },
    timeChip: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.muted,
    },
    timeChipText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 6,
    },
    locationText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
    },
    attendeeRow: {
      flexDirection: "row",
      marginTop: 8,
    },
    attendeeCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    attendeeCircleText: {
      fontSize: 8,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
    },
    emptyContainer: {
      alignItems: "center",
      paddingHorizontal: 32,
      paddingTop: 80,
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginTop: 20,
      marginBottom: 8,
      letterSpacing: -0.2,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
    },
    retryBtn: {
      marginTop: 20,
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

  const renderDateStrip = () => (
    <View style={s.dateStripWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 4 }}
      >
        {dateStrip.map(({ date, key }) => {
          const isToday = key === todayKey;
          const isSelected = key === selectedDateKey;
          const hasSectionEvents = sectionIndexMap[key] !== undefined;
          const dayLabel = WEEKDAYS[date.getDay()].slice(0, 1);
          const dayNum = date.getDate();

          return (
            <TouchableOpacity
              key={key}
              style={[
                s.dateCell,
                isSelected && {
                  backgroundColor: colors.foreground,
                },
              ]}
              onPress={() => handleDateSelect(key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.dateCellDayLabel,
                  { color: isSelected ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {dayLabel}
              </Text>
              <Text
                style={[
                  s.dateCellNum,
                  {
                    color: isSelected
                      ? colors.primaryForeground
                      : isToday
                      ? colors.primary
                      : colors.foreground,
                  },
                ]}
              >
                {dayNum}
              </Text>
              {isToday && (
                <View
                  style={[
                    s.dateCellTodayDot,
                    {
                      backgroundColor: isSelected ? colors.primaryForeground : colors.primary,
                    },
                  ]}
                />
              )}
              {!isToday && hasSectionEvents && !isSelected && (
                <View
                  style={[
                    s.dateCellTodayDot,
                    { backgroundColor: colors.border },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderTopHeader = () => (
    <>
      <View style={s.headerWrap}>
        <View style={s.headerRow}>
          <Text style={s.headerDateText}>{formatTodayHeader(today)}</Text>
          <TouchableOpacity
            style={s.newEventBtn}
            onPress={() => router.push("/create-event")}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <Text style={s.newEventText}>New Event</Text>
          </TouchableOpacity>
        </View>
      </View>
      {accounts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.accountPillsRow}
          style={s.accountPillsScroll}
        >
          {[{ email: "all", isPrimary: false }, ...accounts].map((acct) => {
            const isActive = selectedAccount === acct.email;
            const label = acct.email === "all" ? "All" : acct.email;
            return (
              <TouchableOpacity
                key={acct.email}
                style={[
                  s.accountPill,
                  isActive && { backgroundColor: colors.foreground, borderColor: colors.foreground },
                ]}
                onPress={() => setSelectedAccount(acct.email)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    s.accountPillText,
                    { color: isActive ? colors.background : colors.mutedForeground },
                    isActive && { color: colors.background },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );

  const renderSectionHeader = (sectionKey: string) => {
    const { dayNum, weekday } = formatSectionHeader(sectionKey);
    return (
      <View style={s.sectionHeaderWrap}>
        <Text style={s.sectionDayNum}>{dayNum}</Text>
        <Text style={s.sectionWeekday}>{weekday}</Text>
      </View>
    );
  };

  const renderEvent = (evt: CalendarEvent, isLast: boolean) => {
    const past = isPastEvent(evt);
    const dotColor = past ? colors.mutedForeground : colors.primary;
    const opacity = past ? 0.4 : 1;
    const timeStr = formatEventTime(evt);

    if (evt.isAllDay) {
      return (
        <TouchableOpacity
          style={s.timelineRow}
          activeOpacity={0.75}
          onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: evt.id } })}
        >
          <View style={s.timelineLeft}>
            {!isLast && <View style={s.timelineLineBottom} />}
            <View style={[s.timelineDot, { backgroundColor: past ? colors.border : colors.primary, opacity }]} />
          </View>
          <View style={[s.eventContent, { opacity }]}>
            <View
              style={[
                s.allDayStrip,
                { backgroundColor: colors.muted + "cc" },
              ]}
            >
              <Text style={[s.allDayTitle, { color: colors.foreground }]} numberOfLines={1}>
                {evt.title}
              </Text>
              <Text style={[s.allDayTimeLabel, { color: colors.mutedForeground }]}>All day</Text>
              {evt.location && (
                <View style={[s.locationRow, { marginTop: 4 }]}>
                  <Feather name="map-pin" size={10} color={colors.mutedForeground} />
                  <Text style={s.locationText} numberOfLines={1}>
                    {evt.location}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={s.timelineRow}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: evt.id } })}
      >
        <View style={s.timelineLeft}>
          {!isLast && <View style={s.timelineLineBottom} />}
          <View style={[s.timelineDot, { backgroundColor: dotColor, opacity }]} />
        </View>
        <View style={[s.eventContent, { opacity }]}>
          <Text style={s.eventTitle} numberOfLines={2}>
            {evt.title}
          </Text>
          <View style={s.timeChip}>
            <Text style={s.timeChipText}>{timeStr}</Text>
          </View>
          {evt.location && (
            <View style={s.locationRow}>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={s.locationText} numberOfLines={1}>
                {evt.location}
              </Text>
            </View>
          )}
          {evt.attendees.length > 0 && (
            <View style={s.attendeeRow}>
              {evt.attendees.slice(0, 5).map((a, i) => (
                <View
                  key={i}
                  style={[
                    s.attendeeCircle,
                    {
                      backgroundColor: getAttendeeColor(i),
                      marginLeft: i === 0 ? 0 : -6,
                      zIndex: 5 - i,
                    },
                  ]}
                >
                  <Text style={s.attendeeCircleText}>{getInitials(a.name, a.email)}</Text>
                </View>
              ))}
              {evt.attendees.length > 5 && (
                <View
                  style={[
                    s.attendeeCircle,
                    {
                      backgroundColor: colors.muted,
                      marginLeft: -6,
                      zIndex: 0,
                    },
                  ]}
                >
                  <Text style={[s.attendeeCircleText, { color: colors.mutedForeground }]}>
                    +{evt.attendees.length - 5}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return renderSectionHeader(item.sectionKey);
    }
    return renderEvent(item.event, item.isLast);
  };

  const renderListHeader = () => (
    <>
      {renderTopHeader()}
      {renderDateStrip()}
    </>
  );

  if (isLoading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.foreground} size="large" />
      </View>
    );
  }

  if (isError) {
    const errCode = (error as Error & { code?: string })?.code;
    const isNotConnected =
      errCode === "NOT_CONNECTED" ||
      errCode === "PERMISSION_DENIED" ||
      error?.message?.includes("not connected");
    return (
      <View style={s.container}>
        {renderTopHeader()}
        {renderDateStrip()}
        <View style={s.emptyContainer}>
          <Feather name="calendar" size={40} color={colors.border} />
          <Text style={s.emptyTitle}>
            {isNotConnected ? "Calendar not connected" : "Couldn't load calendar"}
          </Text>
          <Text style={s.emptySubtitle}>
            {isNotConnected
              ? "Connect Gmail to access your Google Calendar events."
              : error?.message || "Something went wrong"}
          </Text>
          {isNotConnected ? (
            <Link href="/connect-gmail" asChild>
              <TouchableOpacity
                style={[
                  s.retryBtn,
                  { backgroundColor: colors.foreground, borderColor: colors.foreground },
                ]}
              >
                <Text style={[s.retryText, { color: colors.primaryForeground }]}>
                  Connect Gmail
                </Text>
              </TouchableOpacity>
            </Link>
          ) : (
            <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
              <Text style={s.retryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        ref={listRef}
        data={allItems}
        keyExtractor={(item, i) =>
          item.type === "header"
            ? `header-${item.sectionKey}`
            : `event-${item.event.id}-${i}`
        }
        renderItem={renderItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Feather name="calendar" size={40} color={colors.border} />
            <Text style={s.emptyTitle}>No upcoming events</Text>
            <Text style={s.emptySubtitle}>
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
        onScrollToIndexFailed={(info) => {
          const wait = new Promise((resolve) => setTimeout(resolve, 300));
          wait.then(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
            });
          });
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      />
    </View>
  );
}

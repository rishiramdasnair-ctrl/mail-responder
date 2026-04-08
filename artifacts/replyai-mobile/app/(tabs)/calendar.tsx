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
  PanResponder,
  Animated,
  Dimensions,
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
  calendarAccount?: string;
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

const DAY_ABBREVS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getWeekSunday(baseDate: Date, weekOffset: number): Date {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + weekOffset * 7);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getInitials(name: string, email: string): string {
  const src = name || email;
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.charAt(0).toUpperCase();
}

const ATTENDEE_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
function getAttendeeColor(i: number) { return ATTENDEE_COLORS[i % ATTENDEE_COLORS.length]; }

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<CalendarEvent>>(null);
  const { apiBaseUrl, authHeaders } = useApiClient();

  const todayBase = useRef(new Date()).current;
  todayBase.setHours(0, 0, 0, 0);
  const todayKey = dateKey(todayBase);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");

  const slideAnim = useRef(new Animated.Value(0)).current;

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

  const weekSunday = useMemo(() => getWeekSunday(todayBase, weekOffset), [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekSunday, i)), [weekSunday]);

  const startStr = dateKey(weekSunday);
  const endStr = dateKey(addDays(weekSunday, 6));

  const { data, isLoading, isError, error, isRefetching, refetch } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["calendar-week", startStr, endStr, selectedAccount],
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

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const evt of data?.events ?? []) {
      const dk = dateKey(toLocalDate(evt.start));
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(evt);
    }
    return map;
  }, [data]);

  const selectedDayEvents = useMemo(() => {
    const evts = eventsByDay.get(selectedDateKey) ?? [];
    return [...evts].sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return toLocalDate(a.start).getTime() - toLocalDate(b.start).getTime();
    });
  }, [eventsByDay, selectedDateKey]);

  const animateWeekChange = useCallback((direction: number, newOffset: number) => {
    slideAnim.setValue(direction * SCREEN_WIDTH);
    setWeekOffset(newOffset);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  }, [slideAnim]);

  const goToPrevWeek = useCallback(() => {
    const newOffset = weekOffset - 1;
    const newSunday = getWeekSunday(todayBase, newOffset);
    const newSat = addDays(newSunday, 6);
    setSelectedDateKey(dateKey(newSat));
    animateWeekChange(1, newOffset);
  }, [weekOffset, animateWeekChange]);

  const goToNextWeek = useCallback(() => {
    const newOffset = weekOffset + 1;
    const newSunday = getWeekSunday(todayBase, newOffset);
    setSelectedDateKey(dateKey(newSunday));
    animateWeekChange(-1, newOffset);
  }, [weekOffset, animateWeekChange]);

  const weekOffsetRef = useRef(weekOffset);
  weekOffsetRef.current = weekOffset;

  const swipeHandlers = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 12,
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -SWIPE_THRESHOLD) {
        const cur = weekOffsetRef.current;
        const newOff = cur + 1;
        const newSunday = getWeekSunday(todayBase, newOff);
        setSelectedDateKey(dateKey(newSunday));
        slideAnim.setValue(-SCREEN_WIDTH);
        setWeekOffset(newOff);
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
      } else if (gs.dx > SWIPE_THRESHOLD) {
        const cur = weekOffsetRef.current;
        const newOff = cur - 1;
        const newSunday = getWeekSunday(todayBase, newOff);
        const newSat = addDays(newSunday, 6);
        setSelectedDateKey(dateKey(newSat));
        slideAnim.setValue(SCREEN_WIDTH);
        setWeekOffset(newOff);
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
      }
    },
  }), []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom;

  const monthLabel = useMemo(() => {
    const firstDay = weekDays[0];
    const lastDay = weekDays[6];
    if (firstDay.getMonth() === lastDay.getMonth()) {
      return `${MONTHS[firstDay.getMonth()]} ${firstDay.getFullYear()}`;
    }
    return `${MONTHS[firstDay.getMonth()].slice(0, 3)} – ${MONTHS[lastDay.getMonth()].slice(0, 3)} ${lastDay.getFullYear()}`;
  }, [weekDays]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerWrap: {
      paddingTop: topPad + 4,
      paddingBottom: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    monthLabel: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    navBtn: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: colors.muted,
    },
    newEventBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.muted,
    },
    newEventText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    weekStrip: {
      flexDirection: "row",
      paddingBottom: 4,
    },
    dayCell: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 4,
    },
    dayAbbrev: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    dayNumWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    dayNum: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    todayDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginTop: 2,
    },
    eventDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginTop: 2,
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
    eventsArea: {
      flex: 1,
      overflow: "hidden",
    },
    dayHeaderWrap: {
      paddingTop: 20,
      paddingBottom: 8,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    dayHeaderNum: {
      fontSize: 38,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -1,
      lineHeight: 42,
    },
    dayHeaderWeekday: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
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
      alignItems: "center",
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
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 80,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 40,
    },
    retryBtn: {
      marginTop: 8,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.foreground,
    },
    retryText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.background,
    },
    connectBtn: {
      marginTop: 8,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    connectText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    emptyDayContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 60,
      gap: 6,
    },
    emptyDayText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    listFooter: { height: bottomPad + 40 },
  });

  const renderWeekStrip = () => (
    <View style={s.weekStrip}>
      {weekDays.map((day, i) => {
        const dk = dateKey(day);
        const isToday = dk === todayKey;
        const isSelected = dk === selectedDateKey;
        const hasEvents = (eventsByDay.get(dk)?.length ?? 0) > 0;

        return (
          <TouchableOpacity
            key={dk}
            style={s.dayCell}
            onPress={() => setSelectedDateKey(dk)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                s.dayAbbrev,
                { color: isSelected ? colors.primary : colors.mutedForeground },
              ]}
            >
              {DAY_ABBREVS[i]}
            </Text>
            <View
              style={[
                s.dayNumWrap,
                isSelected && { backgroundColor: colors.foreground },
                !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.foreground },
              ]}
            >
              <Text
                style={[
                  s.dayNum,
                  {
                    color: isSelected
                      ? colors.background
                      : isToday
                      ? colors.foreground
                      : colors.foreground,
                  },
                ]}
              >
                {day.getDate()}
              </Text>
            </View>
            {isToday && !isSelected && (
              <View style={[s.todayDot, { backgroundColor: colors.primary }]} />
            )}
            {!isToday && hasEvents && (
              <View style={[s.eventDot, { backgroundColor: colors.border }]} />
            )}
            {isToday && !isSelected && !hasEvents && <View style={[s.todayDot, { opacity: 0 }]} />}
            {(!isToday || isSelected) && !hasEvents && <View style={[s.eventDot, { opacity: 0 }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderEvent = (evt: CalendarEvent, isLast: boolean) => {
    const past = isPastEvent(evt);
    const dotColor = past ? colors.mutedForeground : colors.foreground;
    const opacity = past ? 0.45 : 1;
    const timeStr = formatEventTime(evt);

    if (evt.isAllDay) {
      return (
        <TouchableOpacity
          key={evt.id}
          onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: evt.id, eventData: JSON.stringify(evt) } })}
          activeOpacity={0.75}
          style={{ paddingHorizontal: 20, marginBottom: isLast ? 0 : 10, opacity }}
        >
          <View style={[s.allDayStrip, { backgroundColor: colors.muted }]}>
            <Text style={[s.allDayTitle, { color: colors.foreground }]} numberOfLines={2}>
              {evt.title}
            </Text>
            <Text style={[s.allDayTimeLabel, { color: colors.mutedForeground }]}>All day</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={evt.id}
        onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: evt.id, eventData: JSON.stringify(evt) } })}
        activeOpacity={0.75}
        style={[s.timelineRow, { opacity }]}
      >
        <View style={s.timelineLeft}>
          {!isLast && <View style={s.timelineLineBottom} />}
          <View style={[s.timelineDot, { backgroundColor: dotColor }]} />
        </View>
        <View style={s.eventContent}>
          <Text style={s.eventTitle} numberOfLines={2}>{evt.title}</Text>
          <View style={s.timeChip}>
            <Text style={s.timeChipText}>{timeStr}</Text>
          </View>
          {evt.location && (
            <View style={s.locationRow}>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={s.locationText} numberOfLines={1}>{evt.location}</Text>
            </View>
          )}
          {evt.attendees.length > 0 && (
            <View style={s.attendeeRow}>
              {evt.attendees.slice(0, 5).map((a, i) => (
                <View
                  key={i}
                  style={[
                    s.attendeeCircle,
                    { backgroundColor: getAttendeeColor(i), marginLeft: i === 0 ? 0 : -6, zIndex: 5 - i },
                  ]}
                >
                  <Text style={s.attendeeCircleText}>{getInitials(a.name, a.email)}</Text>
                </View>
              ))}
              {evt.attendees.length > 5 && (
                <Text style={[s.timeChipText, { marginLeft: 6 }]}>+{evt.attendees.length - 5}</Text>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedDay = toLocalDate(selectedDateKey);
  const dayHeaderText = `${DAY_ABBREVS[selectedDay.getDay()].charAt(0) + DAY_ABBREVS[selectedDay.getDay()].slice(1).toLowerCase().replace(/^[A-Z]/, c => c)}`;

  const renderDayHeader = () => (
    <View style={s.dayHeaderWrap}>
      <Text style={s.dayHeaderNum}>{selectedDay.getDate()}</Text>
      <Text style={s.dayHeaderWeekday}>
        {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][selectedDay.getDay()]}
      </Text>
    </View>
  );

  const header = (
    <View style={s.headerWrap}>
      <View style={s.headerRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity style={s.navBtn} onPress={goToPrevWeek} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={s.navBtn} onPress={goToNextWeek} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-right" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.newEventBtn} onPress={() => router.push("/create-event")} activeOpacity={0.7}>
          <Feather name="plus" size={14} color={colors.foreground} />
          <Text style={s.newEventText}>New Event</Text>
        </TouchableOpacity>
      </View>
      {renderWeekStrip()}
    </View>
  );

  const accountPills = accounts.length > 1 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.accountPillsRow}
      style={s.accountPillsScroll}
    >
      {[{ email: "all", isPrimary: false }, ...accounts].map((acct) => {
        const isActive = selectedAccount === acct.email;
        return (
          <TouchableOpacity
            key={acct.email}
            style={[s.accountPill, isActive && { backgroundColor: colors.foreground, borderColor: colors.foreground }]}
            onPress={() => setSelectedAccount(acct.email)}
            activeOpacity={0.7}
          >
            <Text
              style={[s.accountPillText, { color: isActive ? colors.background : colors.mutedForeground }]}
              numberOfLines={1}
            >
              {acct.email === "all" ? "All" : acct.email}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  ) : null;

  if (isLoading) {
    return (
      <View style={[s.container]}>
        {header}
        {accountPills}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.foreground} size="large" />
        </View>
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
        {header}
        {accountPills}
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
              <TouchableOpacity style={s.connectBtn}>
                <Text style={s.connectText}>Connect Gmail</Text>
              </TouchableOpacity>
            </Link>
          ) : (
            <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {header}
      {accountPills}
      <Animated.View
        style={[s.eventsArea, { transform: [{ translateX: slideAnim }] }]}
        {...swipeHandlers.panHandlers}
      >
        <FlatList
          ref={listRef}
          data={selectedDayEvents}
          keyExtractor={(evt) => evt.id ?? Math.random().toString()}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.foreground}
            />
          }
          ListHeaderComponent={renderDayHeader}
          renderItem={({ item, index }) =>
            renderEvent(item, index === selectedDayEvents.length - 1)
          }
          ListEmptyComponent={
            <View style={s.emptyDayContainer}>
              <Feather name="sun" size={28} color={colors.border} />
              <Text style={s.emptyDayText}>No events today</Text>
            </View>
          }
          ListFooterComponent={<View style={s.listFooter} />}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
    </View>
  );
}

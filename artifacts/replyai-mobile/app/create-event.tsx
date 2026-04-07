import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  BackHandler,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useToast } from "@/components/ToastProvider";

interface Attendee {
  email: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimeLabel(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function toIsoDateTime(date: Date, time: Date): string {
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const h = time.getHours();
  const mi = time.getMinutes();
  return new Date(y, mo, d, h, mi).toISOString();
}

type PickerMode = "startDate" | "startTime" | "endDate" | "endTime" | null;
type ConferenceType = "meet" | "zoom" | "teams" | null;

const CONFERENCE_OPTIONS: Array<{ value: Exclude<ConferenceType, null>; label: string; icon: string }> = [
  { value: "meet", label: "Meet", icon: "video" },
  { value: "zoom", label: "Zoom", icon: "video" },
  { value: "teams", label: "Teams", icon: "video" },
];

export default function CreateEventScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { showToast } = useToast();

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 2, 0);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [location, setLocation] = useState("");
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [conferenceType, setConferenceType] = useState<ConferenceType>(null);
  const [conferenceUrl, setConferenceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const allowBackRef = useRef(false);

  const hasContent = title.trim().length > 0 || location.trim().length > 0 || attendees.length > 0 || conferenceType !== null;

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      if (!hasContent) {
        allowBackRef.current = true;
        onConfirm();
        return;
      }
      Alert.alert("Discard Event", "Discard this new event?", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            allowBackRef.current = true;
            onConfirm();
          },
        },
      ]);
    },
    [hasContent]
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        confirmDiscard(() => router.back());
        return true;
      });
      return () => sub.remove();
    }, [confirmDiscard, router])
  );

  React.useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e: any) => {
      if (allowBackRef.current || !hasContent) return;
      e.preventDefault();
      confirmDiscard(() => navigation.dispatch(e.data.action));
    });
    return unsub;
  }, [navigation, hasContent, confirmDiscard]);

  const addAttendee = () => {
    const email = attendeeInput.trim().toLowerCase();
    if (!email.includes("@")) return;
    if (attendees.some((a) => a.email === email)) {
      setAttendeeInput("");
      return;
    }
    setAttendees((prev) => [...prev, { email }]);
    setAttendeeInput("");
  };

  const removeAttendee = (email: string) => {
    setAttendees((prev) => prev.filter((a) => a.email !== email));
  };

  const handlePickerChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (!selected) {
      setPickerMode(null);
      return;
    }
    if (pickerMode === "startDate") {
      const newStart = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), startDate.getHours(), startDate.getMinutes());
      setStartDate(newStart);
      if (newStart >= endDate) {
        setEndDate(new Date(newStart.getTime() + 60 * 60 * 1000));
      }
    } else if (pickerMode === "startTime") {
      const newStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), selected.getHours(), selected.getMinutes());
      setStartDate(newStart);
      if (newStart >= endDate) {
        setEndDate(new Date(newStart.getTime() + 60 * 60 * 1000));
      }
    } else if (pickerMode === "endDate") {
      setEndDate(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), endDate.getHours(), endDate.getMinutes()));
    } else if (pickerMode === "endTime") {
      setEndDate(new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), selected.getHours(), selected.getMinutes()));
    }
    if (Platform.OS === "android") setPickerMode(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a title for this event.");
      return;
    }
    if (endDate <= startDate) {
      Alert.alert("Invalid time", "End time must be after start time.");
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();
      const needsUrl = conferenceType === "zoom" || conferenceType === "teams";
      if (needsUrl && !conferenceUrl.trim()) {
        Alert.alert("Missing link", `Please paste your ${conferenceType === "zoom" ? "Zoom" : "Teams"} meeting URL.`);
        setSaving(false);
        return;
      }

      const res = await fetch(`${apiBaseUrl}/api/calendar/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          start: toIsoDateTime(startDate, startDate),
          end: toIsoDateTime(endDate, endDate),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(attendees.length > 0 ? { attendees: attendees.map((a) => a.email) } : {}),
          ...(conferenceType ? { conferenceType } : {}),
          ...(needsUrl && conferenceUrl.trim() ? { conferenceUrl: conferenceUrl.trim() } : {}),
        }),
      });
      const data = await res.json() as { error?: string; id?: string };
      if (!res.ok) {
        Alert.alert("Failed to create event", data.error ?? "Something went wrong.");
        return;
      }
      allowBackRef.current = true;
      qc.invalidateQueries({ queryKey: ["calendar-range"] });
      router.back();
      showToast("Event created", "success");
    } catch {
      Alert.alert("Error", "Could not create event. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: topPad + 12,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    cancelText: { fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", minWidth: 60 },
    saveBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 60,
    },
    saveBtnText: { fontSize: 14, color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" },
    scrollContent: { flexGrow: 1, paddingBottom: bottomPad + 24 },
    section: {
      marginHorizontal: 16,
      marginTop: 20,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    fieldRowLast: { borderBottomWidth: 0 },
    fieldIcon: { marginRight: 12 },
    fieldLabel: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      width: 64,
    },
    fieldInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      paddingVertical: 0,
    },
    fieldValue: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    timeLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, width: 64 },
    timeBtns: { flex: 1, flexDirection: "row", gap: 8 },
    timePill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.muted,
    },
    timePillText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    sectionTitle: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginHorizontal: 16,
      marginTop: 24,
      marginBottom: 8,
    },
    chipsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 14,
      paddingTop: 8,
      gap: 6,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingLeft: 10,
      paddingRight: 6,
      paddingVertical: 4,
      gap: 4,
    },
    chipText: { fontSize: 12, color: colors.foreground, fontFamily: "Inter_400Regular" },
    addAttendeeRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    attendeeInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      paddingVertical: 0,
    },
    addBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.foreground,
    },
    addBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    confRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 13,
      gap: 8,
    },
    confOptions: {
      flexDirection: "row",
      gap: 8,
      flex: 1,
      flexWrap: "wrap",
    },
    confPill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1.5,
      gap: 5,
    },
    confPillActive: {
      backgroundColor: colors.foreground,
      borderColor: colors.foreground,
    },
    confPillInactive: {
      backgroundColor: colors.background,
      borderColor: colors.border,
    },
    confPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    confUrlRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    confUrlInput: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      paddingVertical: 0,
    },
  });

  const pickerValue =
    pickerMode === "startDate" || pickerMode === "startTime" ? startDate : endDate;
  const pickerType: "date" | "time" =
    pickerMode === "startDate" || pickerMode === "endDate" ? "date" : "time";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => confirmDiscard(() => router.back())}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Event</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={[styles.fieldRow, styles.fieldRowLast]}>
              <Feather name="calendar" size={16} color={colors.mutedForeground} style={styles.fieldIcon} />
              <TextInput
                style={[styles.fieldInput, { fontSize: 18, fontFamily: "Inter_600SemiBold" }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="sentences"
                autoCorrect
                selectionColor={colors.foreground}
                autoFocus
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>When</Text>
          <View style={styles.section}>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Starts</Text>
              <View style={styles.timeBtns}>
                <TouchableOpacity
                  style={styles.timePill}
                  onPress={() => setPickerMode(pickerMode === "startDate" ? null : "startDate")}
                >
                  <Text style={styles.timePillText}>{formatDateLabel(startDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.timePill}
                  onPress={() => setPickerMode(pickerMode === "startTime" ? null : "startTime")}
                >
                  <Text style={styles.timePillText}>{formatTimeLabel(startDate)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {(pickerMode === "startDate" || pickerMode === "startTime") && (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <DateTimePicker
                  value={pickerValue}
                  mode={pickerType}
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={handlePickerChange}
                  minimumDate={pickerMode === "startDate" ? new Date() : undefined}
                  themeVariant="light"
                />
              </View>
            )}

            <View style={[styles.timeRow, styles.fieldRowLast]}>
              <Text style={styles.timeLabel}>Ends</Text>
              <View style={styles.timeBtns}>
                <TouchableOpacity
                  style={styles.timePill}
                  onPress={() => setPickerMode(pickerMode === "endDate" ? null : "endDate")}
                >
                  <Text style={styles.timePillText}>{formatDateLabel(endDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.timePill}
                  onPress={() => setPickerMode(pickerMode === "endTime" ? null : "endTime")}
                >
                  <Text style={styles.timePillText}>{formatTimeLabel(endDate)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {(pickerMode === "endDate" || pickerMode === "endTime") && (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <DateTimePicker
                  value={pickerValue}
                  mode={pickerType}
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={handlePickerChange}
                  minimumDate={pickerMode === "endDate" ? startDate : undefined}
                  themeVariant="light"
                />
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.section}>
            <View style={[styles.fieldRow, styles.fieldRowLast]}>
              <Feather name="map-pin" size={16} color={colors.mutedForeground} style={styles.fieldIcon} />
              <TextInput
                style={styles.fieldInput}
                value={location}
                onChangeText={setLocation}
                placeholder="Add location"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                selectionColor={colors.foreground}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Video Conference</Text>
          <View style={styles.section}>
            <View style={[styles.confRow, (conferenceType !== null) && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Feather name="video" size={16} color={colors.mutedForeground} style={styles.fieldIcon} />
              <View style={styles.confOptions}>
                {CONFERENCE_OPTIONS.map((opt) => {
                  const isActive = conferenceType === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.confPill, isActive ? styles.confPillActive : styles.confPillInactive]}
                      onPress={() => {
                        setConferenceType(isActive ? null : opt.value);
                        if (isActive) setConferenceUrl("");
                      }}
                      activeOpacity={0.7}
                    >
                      {isActive && (
                        <Feather name="check" size={12} color={colors.primaryForeground} />
                      )}
                      <Text style={[styles.confPillText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {(conferenceType === "zoom" || conferenceType === "teams") && (
              <View style={styles.confUrlRow}>
                <Feather name="link" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={styles.confUrlInput}
                  value={conferenceUrl}
                  onChangeText={setConferenceUrl}
                  placeholder={`Paste ${conferenceType === "zoom" ? "Zoom" : "Teams"} meeting link`}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  selectionColor={colors.foreground}
                />
              </View>
            )}
            {conferenceType === "meet" && (
              <View style={styles.confUrlRow}>
                <Feather name="check-circle" size={14} color={colors.mutedForeground} />
                <Text style={[styles.confUrlInput, { color: colors.mutedForeground }]}>
                  A Google Meet link will be created automatically
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Attendees</Text>
          <View style={styles.section}>
            {attendees.length > 0 && (
              <View style={styles.chipsContainer}>
                {attendees.map((a) => (
                  <View key={a.email} style={styles.chip}>
                    <Text style={styles.chipText}>{a.email}</Text>
                    <TouchableOpacity
                      onPress={() => removeAttendee(a.email)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={12} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={[styles.addAttendeeRow, attendees.length > 0 && { paddingTop: 8 }]}>
              <Feather name="users" size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.attendeeInput}
                value={attendeeInput}
                onChangeText={setAttendeeInput}
                onSubmitEditing={addAttendee}
                placeholder="Add attendee email"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={false}
                selectionColor={colors.foreground}
              />
              {attendeeInput.includes("@") && (
                <TouchableOpacity style={styles.addBtn} onPress={addAttendee}>
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

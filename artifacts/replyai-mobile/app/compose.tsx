import React, { useState, useCallback, useEffect, useRef } from "react";
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
  FlatList,
  BackHandler,
} from "react-native";
import { SchedulePicker } from "@/components/SchedulePicker";
import { useRouter, useFocusEffect, useNavigation, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useToast } from "@/components/ToastProvider";

interface GmailAccount {
  email: string;
  isPrimary: boolean;
}

interface ContactResult {
  name: string | null;
  email: string;
  organization: string | null;
  photoUrl: string | null;
}

interface Recipient {
  email: string;
  name: string | null;
}

function RecipientChip({
  recipient,
  onRemove,
  colors,
}: {
  recipient: Recipient;
  onRemove: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const styles = StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingLeft: 10,
      paddingRight: 6,
      paddingVertical: 4,
      gap: 4,
      marginRight: 6,
      marginBottom: 4,
    },
    chipText: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      maxWidth: 160,
    },
    removeBtn: {
      padding: 2,
    },
  });

  return (
    <View style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {recipient.name ?? recipient.email}
      </Text>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={13} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

export default function ComposeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    replyTo?: string;
    replyToName?: string;
    subject?: string;
    threadId?: string;
    accountEmail?: string;
    prefill?: string;
  }>();

  const [toInput, setToInput] = useState("");
  const [toRecipients, setToRecipients] = useState<Recipient[]>(() =>
    params.replyTo ? [{ email: params.replyTo, name: params.replyToName ?? null }] : []
  );
  const [ccInput, setCcInput] = useState("");
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([]);
  const [ccExpanded, setCcExpanded] = useState(false);
  const [subject, setSubject] = useState(() => params.subject ?? "");
  const [body, setBody] = useState(() => params.prefill ?? "");

  const [toSuggestions, setToSuggestions] = useState<ContactResult[]>([]);
  const [ccSuggestions, setCcSuggestions] = useState<ContactResult[]>([]);
  const [searchingTo, setSearchingTo] = useState(false);
  const [searchingCc, setSearchingCc] = useState(false);

  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  const toDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ccDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowBackRef = useRef(false);

  useEffect(() => {
    return () => {
      if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
      if (ccDebounceRef.current) clearTimeout(ccDebounceRef.current);
    };
  }, []);

  const hasContent =
    toRecipients.length > 0 ||
    toInput.trim().length > 0 ||
    ccRecipients.length > 0 ||
    ccInput.trim().length > 0 ||
    subject.trim().length > 0 ||
    body.trim().length > 0;

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      if (!hasContent) {
        allowBackRef.current = true;
        onConfirm();
        return;
      }
      Alert.alert(
        "Discard Email",
        "Are you sure you want to discard this email?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              allowBackRef.current = true;
              onConfirm();
            },
          },
        ]
      );
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

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: { preventDefault: () => void; data: { action: { type: string } } }) => {
      if (allowBackRef.current || !hasContent) return;
      e.preventDefault();
      confirmDiscard(() => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, hasContent, confirmDiscard]);

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/gmail/accounts`, { headers });
        if (res.ok) {
          const data = (await res.json()) as { accounts: GmailAccount[] };
          setAccounts(data.accounts);
          const primary = data.accounts.find((a) => a.isPrimary) ?? data.accounts[0];
          if (primary) setSelectedAccount(primary.email);
        }
      } catch {}
    })();
  }, [apiBaseUrl, authHeaders]);

  const searchContacts = useCallback(
    async (q: string, field: "to" | "cc") => {
      if (q.trim().length < 2) {
        if (field === "to") setToSuggestions([]);
        else setCcSuggestions([]);
        return;
      }
      if (field === "to") setSearchingTo(true);
      else setSearchingCc(true);
      try {
        const headers = await authHeaders();
        const params = new URLSearchParams({ q });
        const res = await fetch(`${apiBaseUrl}/api/contacts/search?${params}`, { headers });
        if (res.ok) {
          const data = (await res.json()) as { results: ContactResult[] };
          if (field === "to") setToSuggestions(data.results);
          else setCcSuggestions(data.results);
        }
      } catch {
        if (field === "to") setToSuggestions([]);
        else setCcSuggestions([]);
      } finally {
        if (field === "to") setSearchingTo(false);
        else setSearchingCc(false);
      }
    },
    [apiBaseUrl, authHeaders]
  );

  const onToInputChange = (text: string) => {
    setToInput(text);
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    toDebounceRef.current = setTimeout(() => {
      searchContacts(text, "to");
    }, 300);
  };

  const onCcInputChange = (text: string) => {
    setCcInput(text);
    if (ccDebounceRef.current) clearTimeout(ccDebounceRef.current);
    ccDebounceRef.current = setTimeout(() => {
      searchContacts(text, "cc");
    }, 300);
  };

  const addRecipient = (contact: ContactResult | null, field: "to" | "cc") => {
    const emailRaw = contact?.email ?? (field === "to" ? toInput : ccInput).trim();
    if (!emailRaw) return;
    const email = emailRaw.toLowerCase();
    if (!email.includes("@")) return;
    const recipient: Recipient = { email, name: contact?.name ?? null };

    if (field === "to") {
      if (toRecipients.some((r) => r.email === email)) return;
      setToRecipients((prev) => [...prev, recipient]);
      setToInput("");
      setToSuggestions([]);
    } else {
      if (ccRecipients.some((r) => r.email === email)) return;
      setCcRecipients((prev) => [...prev, recipient]);
      setCcInput("");
      setCcSuggestions([]);
    }
  };

  const removeRecipient = (email: string, field: "to" | "cc") => {
    if (field === "to") setToRecipients((prev) => prev.filter((r) => r.email !== email));
    else setCcRecipients((prev) => prev.filter((r) => r.email !== email));
  };

  const handleToSubmitEditing = () => {
    if (toInput.trim().length > 0) {
      addRecipient(null, "to");
    }
  };

  const handleCcSubmitEditing = () => {
    if (ccInput.trim().length > 0) {
      addRecipient(null, "cc");
    }
  };

  const handleCancel = () => {
    confirmDiscard(() => router.back());
  };

  const handleScheduleConfirm = async (date: Date) => {
    setScheduledDate(date);
    setShowSchedulePicker(false);

    const allTo = [...toRecipients.map((r) => r.email)];
    if (toInput.trim().includes("@")) allTo.push(toInput.trim().toLowerCase());
    if (allTo.length === 0) {
      Alert.alert("Missing recipient", "Please add at least one recipient in the To field.");
      return;
    }
    if (!subject.trim()) {
      Alert.alert("Missing subject", "Please enter a subject before scheduling.");
      return;
    }

    setScheduling(true);
    try {
      const headers = await authHeaders();
      const allCc = [...ccRecipients.map((r) => r.email)];
      if (ccInput.trim().includes("@")) allCc.push(ccInput.trim().toLowerCase());

      const payload: Record<string, string> = {
        type: "compose",
        to: allTo.join(", "),
        subject: subject.trim(),
        body,
        ...(allCc.length > 0 ? { cc: allCc.join(", ") } : {}),
        ...(selectedAccount ? { accountEmail: selectedAccount } : {}),
        scheduledAt: date.toISOString(),
      };

      const res = await fetch(`${apiBaseUrl}/api/gmail/schedule`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        Alert.alert("Failed to schedule", data.error ?? "Something went wrong. Please try again.");
        return;
      }

      allowBackRef.current = true;
      router.back();
      showToast(
        `Email scheduled for ${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
        "success",
      );
    } catch {
      Alert.alert("Error", "Could not schedule email. Check your connection and try again.");
    } finally {
      setScheduling(false);
    }
  };

  const handleSend = async () => {
    const allTo = [...toRecipients.map((r) => r.email)];
    if (toInput.trim().includes("@")) allTo.push(toInput.trim().toLowerCase());
    if (allTo.length === 0) {
      Alert.alert("Missing recipient", "Please add at least one recipient in the To field.");
      return;
    }
    if (!subject.trim()) {
      Alert.alert("Missing subject", "Please enter a subject before sending.");
      return;
    }

    setSending(true);
    try {
      const headers = await authHeaders();
      const allCc = [...ccRecipients.map((r) => r.email)];
      if (ccInput.trim().includes("@")) allCc.push(ccInput.trim().toLowerCase());

      const payload: Record<string, string> = {
        to: allTo.join(", "),
        subject: subject.trim(),
        body: body,
        ...(allCc.length > 0 ? { cc: allCc.join(", ") } : {}),
        ...(selectedAccount ? { account: selectedAccount } : {}),
      };

      const res = await fetch(`${apiBaseUrl}/api/gmail/compose`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        Alert.alert("Failed to send", data.error ?? "Something went wrong. Please try again.");
        return;
      }

      allowBackRef.current = true;
      router.back();
      showToast("Email sent successfully", "success");
    } catch {
      Alert.alert("Error", "Could not send email. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
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
    headerTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    headerBtn: {
      padding: 4,
      minWidth: 60,
    },
    cancelText: {
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    scheduleBtn: {
      padding: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtn: {
      backgroundColor: colors.foreground,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 60,
    },
    sendText: {
      fontSize: 14,
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: bottomPad + 16,
    },
    fieldRow: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    fieldLabel: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      width: 44,
      flexShrink: 0,
      paddingTop: 2,
    },
    fieldLabelRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    fieldInputArea: {
      flex: 1,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 2,
    },
    textInput: {
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      paddingVertical: 0,
      minHeight: 26,
    },
    ccToggle: {
      paddingVertical: 2,
      paddingHorizontal: 4,
    },
    ccToggleText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
    },
    bodyInput: {
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
      minHeight: 180,
      paddingHorizontal: 16,
      paddingTop: 14,
      textAlignVertical: "top",
    },
    suggestionsContainer: {
      backgroundColor: colors.background,
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 3,
      maxHeight: 200,
    },
    suggestionItem: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    suggestionName: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    suggestionEmail: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 1,
    },
    accountSection: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    accountLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    accountScroll: {
      flexDirection: "row",
      gap: 8,
    },
    accountPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    accountPillActive: {
      backgroundColor: colors.foreground,
      borderColor: colors.foreground,
    },
    accountPillText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    accountPillTextActive: {
      color: colors.primaryForeground,
    },
  });

  const showToSuggestions = toSuggestions.length > 0 && toInput.length >= 2;
  const showCcSuggestions = ccSuggestions.length > 0 && ccInput.length >= 2;

  return (
    <View style={styles.container}>
      <SchedulePicker
        visible={showSchedulePicker}
        onConfirm={(date) => { setShowSchedulePicker(false); handleScheduleConfirm(date); }}
        onCancel={() => setShowSchedulePicker(false)}
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            style={styles.scheduleBtn}
            onPress={() => setShowSchedulePicker(true)}
            disabled={sending || scheduling}
          >
            {scheduling ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Feather name="clock" size={18} color={colors.mutedForeground} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || scheduling}>
            {sending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {accounts.length > 1 && (
            <View style={styles.accountSection}>
              <Text style={styles.accountLabel}>From</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountScroll}>
                {accounts.map((acct) => (
                  <TouchableOpacity
                    key={acct.email}
                    style={[styles.accountPill, selectedAccount === acct.email && styles.accountPillActive]}
                    onPress={() => setSelectedAccount(acct.email)}
                  >
                    <Text
                      style={[styles.accountPillText, selectedAccount === acct.email && styles.accountPillTextActive]}
                      numberOfLines={1}
                    >
                      {acct.email}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>To</Text>
              <View style={styles.fieldInputArea}>
                {toRecipients.length > 0 && (
                  <View style={styles.chipsRow}>
                    {toRecipients.map((r) => (
                      <RecipientChip
                        key={r.email}
                        recipient={r}
                        onRemove={() => removeRecipient(r.email, "to")}
                        colors={colors}
                      />
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={toInput}
                    onChangeText={onToInputChange}
                    onSubmitEditing={handleToSubmitEditing}
                    placeholder={toRecipients.length === 0 ? "Recipients" : ""}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    selectionColor={colors.foreground}
                    blurOnSubmit={false}
                  />
                  {searchingTo && (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  )}
                  {!ccExpanded && (
                    <TouchableOpacity style={styles.ccToggle} onPress={() => setCcExpanded(true)}>
                      <Text style={styles.ccToggleText}>Cc</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>

          {showToSuggestions && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={toSuggestions}
                keyExtractor={(item) => item.email}
                scrollEnabled={false}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.suggestionItem,
                      index === toSuggestions.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => addRecipient(item, "to")}
                  >
                    {item.name && <Text style={styles.suggestionName}>{item.name}</Text>}
                    <Text style={styles.suggestionEmail}>{item.email}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {ccExpanded && (
            <View style={styles.fieldRow}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Cc</Text>
                <View style={styles.fieldInputArea}>
                  {ccRecipients.length > 0 && (
                    <View style={styles.chipsRow}>
                      {ccRecipients.map((r) => (
                        <RecipientChip
                          key={r.email}
                          recipient={r}
                          onRemove={() => removeRecipient(r.email, "cc")}
                          colors={colors}
                        />
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={ccInput}
                      onChangeText={onCcInputChange}
                      onSubmitEditing={handleCcSubmitEditing}
                      placeholder={ccRecipients.length === 0 ? "Add Cc recipients" : ""}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      selectionColor={colors.foreground}
                      blurOnSubmit={false}
                    />
                    {searchingCc && (
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}

          {showCcSuggestions && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={ccSuggestions}
                keyExtractor={(item) => item.email}
                scrollEnabled={false}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.suggestionItem,
                      index === ccSuggestions.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => addRecipient(item, "cc")}
                  >
                    {item.name && <Text style={styles.suggestionName}>{item.name}</Text>}
                    <Text style={styles.suggestionEmail}>{item.email}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Subj</Text>
              <TextInput
                style={[styles.textInput, styles.fieldInputArea]}
                value={subject}
                onChangeText={setSubject}
                placeholder="Subject"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
                selectionColor={colors.foreground}
                autoCapitalize="sentences"
                autoCorrect
              />
            </View>
          </View>

          <TextInput
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Write your message…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
            autoCorrect
            selectionColor={colors.foreground}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

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
  Modal,
} from "react-native";
import { SchedulePicker } from "@/components/SchedulePicker";
import { useRouter, useFocusEffect, useNavigation, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { useToast } from "@/components/ToastProvider";
import { useGmailAccounts } from "@/hooks/useGmailAccounts";

function parseSignatureText(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const text = parsed.text?.trim() ?? "";
      const links: Array<{ label: string; url: string }> = parsed.links ?? [];
      const linkPart = links.map((l: { label: string; url: string }) => l.label ? `${l.label}: ${l.url}` : l.url).join("\n");
      return [text, linkPart].filter(Boolean).join("\n");
    }
  } catch {}
  return raw.trim();
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string | null;
  iconLink: string | null;
}

function getMimeTypeEmoji(mimeType: string): string {
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📊";
  if (mimeType.includes("document") || mimeType.includes("word")) return "📄";
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.includes("image")) return "🖼️";
  if (mimeType.includes("video")) return "🎬";
  if (mimeType.includes("audio")) return "🎵";
  if (mimeType.includes("folder")) return "📁";
  return "📄";
}

function DrivePickerBottomSheet({
  visible,
  onClose,
  onSelect,
  apiBaseUrl,
  authHeaders,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (file: DriveFile) => void;
  apiBaseUrl: string;
  authHeaders: () => Promise<Record<string, string>>;
  colors: ReturnType<typeof useColors>;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/drive/list?pageSize=20`, { headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to load Drive files");
      }
      const data = await res.json() as { files: DriveFile[] };
      setFiles(data.files ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load Drive files");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, authHeaders]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setError(null);
      loadRecent();
    }
  }, [visible, loadRecent]);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      loadRecent();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const params = new URLSearchParams({ q });
        const res = await fetch(`${apiBaseUrl}/api/drive/search?${params}`, { headers });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error || "Search failed");
        }
        const data = await res.json() as { files: DriveFile[] };
        setFiles(data.files ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const sheetStyles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "75%",
      paddingBottom: insets.bottom,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 16,
      marginVertical: 10,
      backgroundColor: colors.muted,
      borderRadius: 10,
      paddingHorizontal: 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      paddingVertical: 9,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      paddingBottom: 6,
      paddingTop: 2,
    },
    fileItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    fileEmoji: {
      fontSize: 20,
      width: 28,
      textAlign: "center",
    },
    fileName: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      flex: 1,
    },
    fileDate: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    emptyText: {
      textAlign: "center",
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      paddingVertical: 32,
    },
    errorText: {
      textAlign: "center",
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      paddingHorizontal: 24,
      paddingTop: 24,
    },
    retryBtn: {
      alignSelf: "center",
      marginTop: 8,
      paddingVertical: 6,
      paddingHorizontal: 16,
    },
    retryText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={sheetStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={sheetStyles.sheet} onStartShouldSetResponder={() => true}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.header}>
            <Text style={sheetStyles.headerTitle}>Attach from Drive</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={sheetStyles.searchRow}>
            <Feather name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              style={sheetStyles.searchInput}
              value={query}
              onChangeText={handleSearch}
              placeholder="Search your Drive…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={colors.foreground}
              returnKeyType="search"
            />
            {loading && <ActivityIndicator size="small" color={colors.mutedForeground} />}
          </View>
          {error ? (
            <View>
              <Text style={sheetStyles.errorText}>{error}</Text>
              <TouchableOpacity style={sheetStyles.retryBtn} onPress={loadRecent}>
                <Text style={sheetStyles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={!query && files.length > 0 ? (
                <Text style={sheetStyles.sectionLabel}>Recent files</Text>
              ) : null}
              ListEmptyComponent={!loading ? (
                <Text style={sheetStyles.emptyText}>{query ? "No files found" : "No recent files"}</Text>
              ) : null}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sheetStyles.fileItem}
                  onPress={() => { onSelect(item); onClose(); }}
                  activeOpacity={0.6}
                >
                  <Text style={sheetStyles.fileEmoji}>{getMimeTypeEmoji(item.mimeType)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={sheetStyles.fileName} numberOfLines={1}>{item.name}</Text>
                    {item.modifiedTime ? (
                      <Text style={sheetStyles.fileDate}>
                        {new Date(item.modifiedTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="external-link" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
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

  const { accounts } = useGmailAccounts();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const accountInitRef = useRef(false);

  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveAttachments, setDriveAttachments] = useState<DriveFile[]>([]);

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
    body.trim().length > 0 ||
    driveAttachments.length > 0;

  const handleDriveSelect = useCallback((file: DriveFile) => {
    setDriveAttachments(prev => {
      if (prev.some(f => f.id === file.id)) return prev;
      return [...prev, file];
    });
    const link = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
    setBody(prev => {
      const separator = prev && !prev.endsWith("\n") ? "\n" : "";
      return `${prev}${separator}\n📎 ${file.name}: ${link}`;
    });
  }, []);

  const removeDriveAttachment = useCallback((fileId: string) => {
    const file = driveAttachments.find(f => f.id === fileId);
    if (!file) return;
    setDriveAttachments(prev => prev.filter(f => f.id !== fileId));
    const link = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
    setBody(prev => prev.replace(`\n📎 ${file.name}: ${link}`, "").replace(`📎 ${file.name}: ${link}`, ""));
  }, [driveAttachments]);

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
    if (accountInitRef.current || accounts.length === 0) return;
    accountInitRef.current = true;
    const preferred = params.accountEmail
      ? accounts.find((a) => a.email === params.accountEmail) ?? accounts.find((a) => a.isPrimary)
      : accounts.find((a) => a.isPrimary);
    const account = preferred ?? accounts[0];
    if (account) {
      setSelectedAccount(account.email);
      const sigText = parseSignatureText(account.signature);
      if (sigText && !params.prefill) {
        setBody(`\n\n-- \n${sigText}`);
      }
    }
  }, [accounts]);

  const handleAccountChange = (email: string) => {
    setSelectedAccount(email);
    const acct = accounts.find((a) => a.email === email);
    const sigText = parseSignatureText(acct?.signature);
    setBody((prev) => {
      // Strip any existing signature block and replace with new one
      const sigDelimiter = "\n\n-- \n";
      const sigIdx = prev.indexOf(sigDelimiter);
      const textPart = sigIdx !== -1 ? prev.slice(0, sigIdx) : prev;
      return sigText ? `${textPart}${sigDelimiter}${sigText}` : textPart;
    });
  };

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
      <DrivePickerBottomSheet
        visible={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        onSelect={handleDriveSelect}
        apiBaseUrl={apiBaseUrl}
        authHeaders={authHeaders}
        colors={colors}
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            style={styles.scheduleBtn}
            onPress={() => setShowDrivePicker(true)}
            disabled={sending || scheduling}
          >
            <Feather name="hard-drive" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
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
          {accounts.length > 0 && (
            <View style={styles.fieldRow}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>From</Text>
                <View style={[styles.fieldInputArea, { flexDirection: "row", flexWrap: "wrap", gap: 6 }]}>
                  {accounts.map((acct) => (
                    <TouchableOpacity
                      key={acct.email}
                      style={[styles.accountPill, selectedAccount === acct.email && styles.accountPillActive]}
                      onPress={() => handleAccountChange(acct.email)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Text
                        style={[styles.accountPillText, selectedAccount === acct.email && styles.accountPillTextActive]}
                        numberOfLines={1}
                      >
                        {acct.email}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
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

          {driveAttachments.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {driveAttachments.map(file => (
                <View
                  key={file.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.muted,
                    borderRadius: 20,
                    paddingLeft: 10,
                    paddingRight: 6,
                    paddingVertical: 5,
                    gap: 6,
                    maxWidth: 220,
                  }}
                >
                  <Feather name="hard-drive" size={12} color={colors.mutedForeground} />
                  <Text
                    style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 }}
                    numberOfLines={1}
                  >
                    {file.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeDriveAttachment(file.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={12} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  TextInput,
  Platform,
  ScrollView,
  Modal,
  ActionSheetIOS,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmailRow, EmailThread } from "@/components/EmailRow";
import { PrioritySection, type PriorityEmail } from "@/components/PrioritySection";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

interface GmailAccount {
  email: string;
  isPrimary: boolean;
}

const PAGE_SIZE = 50;

interface InboxPage {
  threads: EmailThread[];
  nextPageToken?: string;
}

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [activeFolder, setActiveFolder] = useState<"INBOX" | "STARRED" | "TRASH">("INBOX");
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/gmail/accounts`, { headers });
        if (res.ok) {
          const data = (await res.json()) as { accounts: GmailAccount[] };
          setAccounts(data.accounts);
        }
      } catch {}
    })();
  }, [apiBaseUrl, authHeaders]);

  const fetchInbox = useCallback(
    async ({ pageParam }: { pageParam: unknown }) => {
      const token = pageParam as string | undefined;
      const params = new URLSearchParams({
        maxResults: String(PAGE_SIZE),
        label: activeFolder,
        ...(token ? { pageToken: token } : {}),
        ...(activeQuery ? { q: activeQuery } : {}),
      });
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/priority-inbox?${params}`, {
        headers,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to load inbox");
      }
      return res.json() as Promise<InboxPage>;
    },
    [apiBaseUrl, activeQuery, activeFolder, authHeaders]
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInfiniteQuery<InboxPage, Error, InfiniteData<InboxPage>, readonly unknown[], unknown>({
    queryKey: ["priority-inbox", activeQuery, activeFolder] as const,
    queryFn: fetchInbox,
    initialPageParam: undefined as unknown,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
  });

  const allThreads = data?.pages.flatMap((p) => p.threads) ?? [];
  const visibleThreads = selectedAccount === "all"
    ? allThreads
    : allThreads.filter((t) => t.accountEmail === selectedAccount);

  const onPressEmail = (email: EmailThread) => {
    router.push({
      pathname: "/thread/[threadId]",
      params: {
        threadId: email.threadId,
        ...(email.accountEmail ? { accountEmail: email.accountEmail } : {}),
      },
    });
  };

  const onPressPriority = (threadId: string, accountEmail?: string) => {
    router.push({
      pathname: "/thread/[threadId]",
      params: { threadId, ...(accountEmail ? { accountEmail } : {}) },
    });
  };

  const onPressAction = (item: PriorityEmail) => {
    router.push({
      pathname: "/thread/[threadId]",
      params: {
        threadId: item.threadId,
        ...(item.accountEmail ? { accountEmail: item.accountEmail } : {}),
        action: item.suggestedAction,
      },
    });
  };

  const modifyThread = useCallback(async (
    threadId: string,
    accountEmail: string | undefined,
    addLabelIds: string[],
    removeLabelIds: string[]
  ) => {
    const headers = await authHeaders();
    const qs = accountEmail ? `?account=${encodeURIComponent(accountEmail)}` : "";
    await fetch(`${apiBaseUrl}/api/gmail/threads/${threadId}/modify${qs}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }, [apiBaseUrl, authHeaders]);

  const qKey = ["priority-inbox", activeQuery, activeFolder] as const;

  const onStar = useCallback((email: EmailThread) => {
    const addLabels = email.isStarred ? [] : ["STARRED"];
    const removeLabels = email.isStarred ? ["STARRED"] : [];
    qc.setQueriesData<InfiniteData<InboxPage>>(
      { queryKey: qKey },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            threads: activeFolder === "STARRED" && email.isStarred
              ? page.threads.filter((t) => t.threadId !== email.threadId)
              : page.threads.map((t) =>
                  t.threadId === email.threadId ? { ...t, isStarred: !email.isStarred } : t
                ),
          })),
        };
      }
    );
    modifyThread(email.threadId, email.accountEmail, addLabels, removeLabels).catch(() => {
      qc.invalidateQueries({ queryKey: qKey });
    });
  }, [qc, modifyThread, qKey, activeFolder]);

  const onTrash = useCallback((email: EmailThread) => {
    qc.setQueriesData<InfiniteData<InboxPage>>(
      { queryKey: qKey },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            threads: page.threads.filter((t) => t.threadId !== email.threadId),
          })),
        };
      }
    );
    modifyThread(email.threadId, email.accountEmail, ["TRASH"], ["INBOX"]).catch(() => {
      qc.invalidateQueries({ queryKey: qKey });
    });
  }, [qc, modifyThread, qKey]);

  const onRestore = useCallback((email: EmailThread) => {
    qc.setQueriesData<InfiniteData<InboxPage>>(
      { queryKey: qKey },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            threads: page.threads.filter((t) => t.threadId !== email.threadId),
          })),
        };
      }
    );
    modifyThread(email.threadId, email.accountEmail, ["INBOX"], ["TRASH"]).catch(() => {
      qc.invalidateQueries({ queryKey: qKey });
    });
  }, [qc, modifyThread, qKey]);

  const onMarkRead = useCallback((email: EmailThread) => {
    const removeLabels = email.isUnread ? ["UNREAD"] : [];
    const addLabelIds = email.isUnread ? [] : ["UNREAD"];
    qc.setQueriesData<InfiniteData<InboxPage>>(
      { queryKey: qKey },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            threads: page.threads.map((t) =>
              t.threadId === email.threadId ? { ...t, isUnread: !email.isUnread } : t
            ),
          })),
        };
      }
    );
    modifyThread(email.threadId, email.accountEmail, addLabelIds, removeLabels).catch(() => {
      qc.invalidateQueries({ queryKey: qKey });
    });
  }, [qc, modifyThread, qKey]);

  const onReply = useCallback((email: EmailThread) => {
    router.push({
      pathname: "/compose",
      params: {
        replyTo: email.fromEmail || email.from,
        replyToName: email.fromName,
        subject: email.subject?.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
        threadId: email.threadId,
        accountEmail: email.accountEmail,
      },
    });
  }, [router]);

  const onSnooze = useCallback(async (email: EmailThread, until: Date) => {
    qc.setQueriesData<InfiniteData<InboxPage>>(
      { queryKey: qKey },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            threads: page.threads.filter((t) => t.threadId !== email.threadId),
          })),
        };
      }
    );
    try {
      const headers = await authHeaders();
      const qs = email.accountEmail ? `?account=${encodeURIComponent(email.accountEmail)}` : "";
      await fetch(`${apiBaseUrl}/api/gmail/threads/${email.threadId}/snooze${qs}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeUntil: until.toISOString() }),
      });
    } catch {
      qc.invalidateQueries({ queryKey: qKey });
    }
  }, [qc, qKey, apiBaseUrl, authHeaders]);

  const onQuickReply = useCallback((item: PriorityEmail, text: string) => {
    router.push({
      pathname: "/compose",
      params: {
        replyTo: item.fromEmail,
        replyToName: item.fromName,
        subject: item.subject?.startsWith("Re:") ? item.subject : `Re: ${item.subject}`,
        threadId: item.threadId,
        accountEmail: item.accountEmail,
        prefill: text,
      },
    });
  }, [router]);

  const submitSearch = () => {
    setActiveQuery(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setActiveQuery("");
    setIsSearchOpen(false);
  };

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
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    headerActions: {
      flexDirection: "row",
      gap: 12,
    },
    iconBtn: {
      padding: 6,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: 12,
      marginTop: 12,
      paddingHorizontal: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      height: 40,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      marginTop: 80,
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
    footerLoader: {
      paddingVertical: 20,
      alignItems: "center",
    },
    errorContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    errorText: {
      fontSize: 14,
      color: colors.destructive,
      textAlign: "center",
      marginBottom: 16,
      fontFamily: "Inter_400Regular",
    },
    retryBtn: {
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
    unreadBadge: {
      backgroundColor: colors.foreground,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 8,
    },
    unreadText: {
      color: colors.primaryForeground,
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
    },
    accountPillsScroll: {
      marginTop: 10,
    },
    accountPillsRow: {
      flexDirection: "row",
      gap: 6,
      paddingRight: 16,
    },
    accountPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
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
      fontFamily: "Inter_500Medium",
    },
    folderPickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
  });

  const unreadCount = visibleThreads.filter((t) => t.isUnread).length;

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={colors.mutedForeground} size="small" />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading || isError) return null;
    const folderIcon = activeFolder === "STARRED" ? "star" : activeFolder === "TRASH" ? "trash-2" : "inbox";
    const emptyTitle = activeQuery ? "No results" : activeFolder === "STARRED" ? "No starred emails" : activeFolder === "TRASH" ? "Trash is empty" : "All caught up!";
    const emptySubtitle = activeQuery ? `No emails matching "${activeQuery}"` : activeFolder === "STARRED" ? "Star emails to find them here." : activeFolder === "TRASH" ? "Deleted emails will appear here." : "Your inbox is empty. Well done.";
    return (
      <View style={styles.emptyContainer}>
        <Feather name={folderIcon} size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
      </View>
    );
  };

  if (isLoading && !data) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <View style={{ paddingTop: topPad }} />
        <ActivityIndicator color={colors.foreground} size="large" />
      </View>
    );
  }

  if (isError && !data) {
    const isNotConnected = error?.message?.includes("not connected") || error?.message?.includes("Gmail not connected");
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Inbox</Text>
        </View>
        <View style={styles.errorContainer}>
          <Feather name={isNotConnected ? "mail" : "wifi-off"} size={48} color={colors.border} />
          <Text style={[styles.errorText, { marginTop: 16 }]}>
            {isNotConnected ? "Gmail not connected" : (error?.message || "Failed to load inbox")}
          </Text>
          {isNotConnected ? (
            <Link href="/connect-gmail" asChild>
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

  const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 56, web: 84 }) ?? 49;
  const fabStyles = StyleSheet.create({
    fab: {
      position: "absolute",
      right: 20,
      bottom: insets.bottom + TAB_BAR_HEIGHT + 16,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.foreground,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 6,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.folderPickerBtn}
            onPress={() => {
              if (Platform.OS === "ios") {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options: ["Inbox", "Starred", "Trash", "Cancel"], cancelButtonIndex: 3 },
                  (idx) => {
                    if (idx === 0) { setActiveFolder("INBOX"); setActiveQuery(""); setSearchQuery(""); }
                    if (idx === 1) { setActiveFolder("STARRED"); setActiveQuery(""); setSearchQuery(""); }
                    if (idx === 2) { setActiveFolder("TRASH"); setActiveQuery(""); setSearchQuery(""); }
                  }
                );
              } else {
                setFolderPickerVisible(true);
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Text style={styles.title}>{activeFolder === "STARRED" ? "Starred" : activeFolder === "TRASH" ? "Trash" : "Inbox"}</Text>
            <Feather name="chevron-down" size={18} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => {
                setIsSearchOpen(!isSearchOpen);
                if (!isSearchOpen) {
                  setTimeout(() => searchRef.current?.focus(), 100);
                } else {
                  clearSearch();
                }
              }}
            >
              <Feather
                name={isSearchOpen ? "x" : "search"}
                size={20}
                color={colors.foreground}
              />
            </TouchableOpacity>
          </View>
        </View>

        {isSearchOpen && (
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={submitSearch}
              placeholder="Search emails…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              autoCapitalize="none"
              selectionColor={colors.foreground}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {accounts.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountPillsRow}
            style={styles.accountPillsScroll}
          >
            {[{ email: "all", isPrimary: false }, ...accounts].map((acct) => {
              const isActive = selectedAccount === acct.email;
              const label = acct.email === "all" ? "All" : acct.email.split("@")[0];
              return (
                <TouchableOpacity
                  key={acct.email}
                  style={[styles.accountPill, isActive && styles.accountPillActive]}
                  onPress={() => setSelectedAccount(acct.email)}
                >
                  <Text style={[styles.accountPillText, isActive && styles.accountPillTextActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Android/Web folder picker modal */}
      <Modal visible={folderPickerVisible} transparent animationType="fade" onRequestClose={() => setFolderPickerVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setFolderPickerVisible(false)}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Switch Folder</Text>
            {(["INBOX", "STARRED", "TRASH"] as const).map((folder) => {
              const label = folder === "INBOX" ? "Inbox" : folder === "STARRED" ? "Starred" : "Trash";
              const icon = folder === "INBOX" ? "inbox" : folder === "STARRED" ? "star" : "trash-2";
              const isActive = activeFolder === folder;
              return (
                <TouchableOpacity key={folder} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 }} onPress={() => { setActiveFolder(folder); setActiveQuery(""); setSearchQuery(""); setFolderPickerVisible(false); }}>
                  <Feather name={icon} size={18} color={isActive ? colors.foreground : colors.mutedForeground} />
                  <Text style={{ fontSize: 16, fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular", color: isActive ? colors.foreground : colors.mutedForeground }}>{label}</Text>
                  {isActive && <Feather name="check" size={16} color={colors.foreground} style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <FlatList
        data={visibleThreads}
        keyExtractor={(item) => item.threadId || item.id}
        renderItem={({ item }) => (
          <EmailRow
            email={item}
            onPress={onPressEmail}
            onStar={activeFolder !== "TRASH" ? onStar : undefined}
            onTrash={activeFolder !== "TRASH" ? onTrash : undefined}
            onRestore={activeFolder === "TRASH" ? onRestore : undefined}
            onMarkRead={onMarkRead}
            onReply={onReply}
            onSnooze={activeFolder === "INBOX" ? onSnooze : undefined}
          />
        )}
        ListHeaderComponent={
          activeFolder === "INBOX" && !activeQuery ? (
            <PrioritySection
              onPressEmail={onPressPriority}
              onPressAction={onPressAction}
            />
          ) : null
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              qc.resetQueries({ queryKey: ["priority-inbox", activeQuery, activeFolder] });
            }}
            tintColor={colors.foreground}
          />
        }
        scrollEnabled={visibleThreads.length > 0}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={fabStyles.fab}
        onPress={() => router.push("/compose")}
        activeOpacity={0.85}
      >
        <Feather name="edit-2" size={22} color={colors.primaryForeground} />
      </TouchableOpacity>
    </View>
  );
}

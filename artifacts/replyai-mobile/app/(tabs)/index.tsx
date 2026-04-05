import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmailRow, EmailThread } from "@/components/EmailRow";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

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

  const fetchInbox = useCallback(
    async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams({
        maxResults: String(PAGE_SIZE),
        ...(pageParam ? { pageToken: pageParam } : {}),
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
    [apiBaseUrl, activeQuery, authHeaders]
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
  } = useInfiniteQuery<InboxPage, Error>({
    queryKey: ["priority-inbox", activeQuery],
    queryFn: fetchInbox,
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
  });

  const allThreads = data?.pages.flatMap((p) => p.threads) ?? [];

  const onPressEmail = (email: EmailThread) => {
    router.push({ pathname: "/thread/[threadId]", params: { threadId: email.threadId } });
  };

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
  });

  const unreadCount = allThreads.filter((t) => t.isUnread).length;

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
    return (
      <View style={styles.emptyContainer}>
        <Feather name="inbox" size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>
          {activeQuery ? "No results" : "All caught up!"}
        </Text>
        <Text style={styles.emptySubtitle}>
          {activeQuery
            ? `No emails matching "${activeQuery}"`
            : "Your inbox is empty. Well done."}
        </Text>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.title}>Inbox</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </View>
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
      </View>

      <FlatList
        data={allThreads}
        keyExtractor={(item) => item.threadId || item.id}
        renderItem={({ item }) => <EmailRow email={item} onPress={onPressEmail} />}
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
              qc.resetQueries({ queryKey: ["priority-inbox", activeQuery] });
            }}
            tintColor={colors.foreground}
          />
        }
        scrollEnabled={allThreads.length > 0}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

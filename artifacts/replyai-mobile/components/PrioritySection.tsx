import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

export interface PriorityEmail {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  date: string;
  isUnread: boolean;
  accountEmail?: string;
  priorityScore: number;
  summary: string;
  suggestedAction: string;
}

interface PriorityCardProps {
  item: PriorityEmail;
  onPress: (threadId: string, accountEmail?: string) => void;
  onAction: (item: PriorityEmail) => void;
  colors: ReturnType<typeof useColors>;
}

function getInitials(name: string, email: string): string {
  const src = name || email || "";
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return "just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function PriorityCard({ item, onPress, onAction, colors }: PriorityCardProps) {
  const initials = getInitials(item.fromName, item.fromEmail);
  const displayName = item.fromName || item.fromEmail;
  const isUrgent = item.suggestedAction === "Urgent Reply";

  const styles = StyleSheet.create({
    card: {
      width: 240,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isUrgent ? colors.foreground : colors.border,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
    cardInner: {
      padding: 14,
      gap: 8,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: item.isUnread ? colors.foreground : colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: item.isUnread ? colors.primaryForeground : colors.mutedForeground,
    },
    senderName: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    dateText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    subject: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      lineHeight: 18,
    },
    summary: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 17,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 2,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.foreground,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      gap: 4,
    },
    actionText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    urgentDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.foreground,
    },
  });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item.threadId, item.accountEmail)}
      activeOpacity={0.75}
    >
      <View style={styles.cardInner}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.senderName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.dateText}>{formatShortDate(item.date)}</Text>
        </View>

        <Text style={styles.subject} numberOfLines={1}>
          {item.subject || "(no subject)"}
        </Text>

        <Text style={styles.summary} numberOfLines={2}>
          {item.summary}
        </Text>

        <View style={styles.actionRow}>
          {isUrgent && <View style={styles.urgentDot} />}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onAction(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionText}>{item.suggestedAction}</Text>
            <Feather name="arrow-right" size={11} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface PrioritySectionProps {
  onPressEmail: (threadId: string, accountEmail?: string) => void;
  onPressAction: (item: PriorityEmail) => void;
}

export function PrioritySection({ onPressEmail, onPressAction }: PrioritySectionProps) {
  const colors = useColors();
  const { apiBaseUrl, authHeaders } = useApiClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-priority"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/ai-priority`, { headers });
      if (!res.ok) return { priority: [] as PriorityEmail[] };
      return res.json() as Promise<{ priority: PriorityEmail[] }>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const items = data?.priority ?? [];

  const styles = StyleSheet.create({
    container: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingBottom: 16,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
      gap: 6,
    },
    headerLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    badge: {
      backgroundColor: colors.foreground,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 2,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    loadingRow: {
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingBottom: 8,
    },
    loadingText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Feather name="zap" size={12} color={colors.foreground} />
          <Text style={styles.headerLabel}>Priority</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text style={styles.loadingText}>AI is analyzing your inbox…</Text>
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Feather name="zap" size={12} color={colors.foreground} />
        <Text style={styles.headerLabel}>Priority</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{items.length}</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingRight: 20 }}
      >
        {items.map((item) => (
          <PriorityCard
            key={item.threadId}
            item={item}
            onPress={onPressEmail}
            onAction={onPressAction}
            colors={colors}
          />
        ))}
      </ScrollView>
    </View>
  );
}

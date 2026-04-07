import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";

const SIRI_GRADIENT = ["#5856D6", "#AF52DE", "#FF2D55"] as const;
const URGENT_GRADIENT = ["#FF2D55", "#FF6B35", "#AF52DE"] as const;

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

const QUICK_CHIPS = [
  { label: "Sounds good", icon: "👍" },
  { label: "On my way", icon: "🏃" },
  { label: "Let me check", icon: "📅" },
];

interface PriorityCardProps {
  item: PriorityEmail;
  onPress: (threadId: string, accountEmail?: string) => void;
  onAction: (item: PriorityEmail) => void;
  onQuickReply: (item: PriorityEmail, text: string) => void;
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

const cardStyles = StyleSheet.create({
  card: {
    width: 240,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(175,82,222,0.3)",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  cardInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
  },
  cardInnerPadded: {
    flex: 1,
    padding: 14,
    justifyContent: "space-between",
  },
  cardContent: {
    flex: 1,
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  subject: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  summary: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    paddingBottom: 2,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  urgentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

function PriorityCard({ item, onPress, onAction, onQuickReply, colors }: PriorityCardProps) {
  const initials = getInitials(item.fromName, item.fromEmail);
  const displayName = item.fromName || item.fromEmail;
  const isUrgent = item.suggestedAction?.toLowerCase().startsWith("urgent");
  const gradient = isUrgent ? URGENT_GRADIENT : SIRI_GRADIENT;

  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.card }]}
      onPress={() => onPress(item.threadId, item.accountEmail)}
      activeOpacity={0.75}
    >
      <View style={cardStyles.cardInner}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={cardStyles.accentBar}
        />
        <View style={cardStyles.cardInnerPadded}>
          <View style={cardStyles.cardContent}>
            <View style={cardStyles.topRow}>
              <View style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: item.isUnread ? colors.foreground : colors.muted,
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Text style={{
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                  color: item.isUnread ? colors.primaryForeground : colors.mutedForeground,
                }}>{initials}</Text>
              </View>
              <Text style={[{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[cardStyles.dateText, { color: colors.mutedForeground }]}>{formatShortDate(item.date)}</Text>
            </View>

            <Text style={[cardStyles.subject, { color: colors.foreground }]} numberOfLines={1}>
              {item.subject || "(no subject)"}
            </Text>

            <Text style={[cardStyles.summary, { color: colors.mutedForeground }]} numberOfLines={4}>
              {item.summary}
            </Text>
          </View>

          <View style={[cardStyles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <View style={[cardStyles.urgentDot, { backgroundColor: isUrgent ? "#FF2D55" : "transparent" }]} />
            <TouchableOpacity
              style={[cardStyles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => onAction(item)}
              activeOpacity={0.7}
            >
              <Text style={[cardStyles.actionText, { color: colors.foreground }]}>{item.suggestedAction}</Text>
              <Feather name="arrow-right" size={11} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: "row", gap: 6, paddingTop: 6, paddingBottom: 2 }}
            style={{ marginHorizontal: -4 }}
          >
            {QUICK_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip.label}
                onPress={() => onQuickReply(item, chip.label)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: colors.muted,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 11 }}>{chip.icon}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.foreground }}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface PrioritySectionProps {
  onPressEmail: (threadId: string, accountEmail?: string) => void;
  onPressAction: (item: PriorityEmail) => void;
  onQuickReply: (item: PriorityEmail, text: string) => void;
}

export function PrioritySection({ onPressEmail, onPressAction, onQuickReply }: PrioritySectionProps) {
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
            onQuickReply={onQuickReply}
            colors={colors}
          />
        ))}
      </ScrollView>
    </View>
  );
}

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface EmailThread {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
  accountEmail?: string;
}

interface EmailRowProps {
  email: EmailThread;
  onPress: (email: EmailThread) => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  } catch {
    return "";
  }
}

function getInitials(name: string, email: string): string {
  const src = name || email || "";
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export function EmailRow({ email, onPress }: EmailRowProps) {
  const colors = useColors();

  const displayName = email.fromName || email.fromEmail || email.from;
  const initials = getInitials(email.fromName, email.fromEmail);

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: email.isUnread ? colors.background : colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    avatarContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: email.isUnread ? colors.foreground : colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      marginTop: 2,
    },
    avatarText: {
      color: email.isUnread ? colors.primaryForeground : colors.mutedForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    senderName: {
      fontSize: 14,
      fontFamily: email.isUnread ? "Inter_600SemiBold" : "Inter_400Regular",
      color: colors.foreground,
      flex: 1,
      marginRight: 8,
    },
    dateText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    subject: {
      fontSize: 13,
      fontFamily: email.isUnread ? "Inter_500Medium" : "Inter_400Regular",
      color: email.isUnread ? colors.foreground : colors.mutedForeground,
      marginBottom: 2,
    },
    snippet: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 17,
    },
    unreadDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.foreground,
      marginTop: 4,
      marginLeft: 8,
    },
    starIcon: {
      marginLeft: 6,
      marginTop: 2,
    },
  });

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(email)}
      activeOpacity={0.7}
      testID={`email-row-${email.threadId}`}
    >
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.senderName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.dateText}>{formatDate(email.date)}</Text>
          {email.isUnread && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.subject} numberOfLines={1}>
          {email.subject || "(no subject)"}
        </Text>
        <Text style={styles.snippet} numberOfLines={2}>
          {email.snippet}
        </Text>
      </View>
      {email.isStarred && (
        <View style={styles.starIcon}>
          <Feather name="star" size={14} color={colors.mutedForeground} />
        </View>
      )}
    </TouchableOpacity>
  );
}

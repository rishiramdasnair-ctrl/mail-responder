import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
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
  onStar?: (email: EmailThread) => void;
  onTrash?: (email: EmailThread) => void;
  onRestore?: (email: EmailThread) => void;
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

export function EmailRow({ email, onPress, onStar, onTrash, onRestore }: EmailRowProps) {
  const colors = useColors();
  const swipeableRef = useRef<Swipeable>(null);

  const displayName = email.fromName || email.fromEmail || email.from;
  const initials = getInitials(email.fromName, email.fromEmail);
  const accountDomain = email.accountEmail ? email.accountEmail.split("@")[1] : null;

  const close = () => swipeableRef.current?.close();

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [0, 72],
      outputRange: [0.7, 1],
      extrapolate: "clamp",
    });

    if (onRestore) {
      return (
        <TouchableOpacity
          style={[styles.actionBox, { backgroundColor: "#007AFF" }]}
          onPress={() => { close(); onRestore(email); }}
          activeOpacity={0.85}
        >
          <Animated.View style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}>
            <Feather name="inbox" size={22} color="#fff" />
            <Text style={styles.actionLabel}>Restore</Text>
          </Animated.View>
        </TouchableOpacity>
      );
    }

    if (!onStar) return null;
    return (
      <TouchableOpacity
        style={[styles.actionBox, { backgroundColor: email.isStarred ? "#6B7280" : "#F59E0B" }]}
        onPress={() => { close(); onStar(email); }}
        activeOpacity={0.85}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}>
          <Feather name="star" size={22} color="#fff" />
          <Text style={styles.actionLabel}>{email.isStarred ? "Unstar" : "Star"}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onTrash) return null;
    const scale = dragX.interpolate({
      inputRange: [-72, 0],
      outputRange: [1, 0.7],
      extrapolate: "clamp",
    });
    return (
      <TouchableOpacity
        style={[styles.actionBox, { backgroundColor: "#EF4444" }]}
        onPress={() => { close(); onTrash(email); }}
        activeOpacity={0.85}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}>
          <Feather name="trash-2" size={22} color="#fff" />
          <Text style={styles.actionLabel}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const rowContent = (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: email.isUnread ? colors.background : colors.card }]}
      onPress={() => onPress(email)}
      activeOpacity={0.7}
      testID={`email-row-${email.threadId}`}
    >
      <View style={[styles.avatarContainer, { backgroundColor: email.isUnread ? colors.foreground : colors.muted }]}>
        <Text style={[styles.avatarText, { color: email.isUnread ? colors.primaryForeground : colors.mutedForeground }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.senderName, {
            fontFamily: email.isUnread ? "Inter_600SemiBold" : "Inter_400Regular",
            color: email.isUnread ? colors.foreground : colors.mutedForeground,
          }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.dateText, { color: email.isUnread ? colors.mutedForeground : colors.border }]}>
            {formatDate(email.date)}
          </Text>
          {email.isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.foreground }]} />}
        </View>
        <Text style={[styles.subject, {
          fontFamily: email.isUnread ? "Inter_500Medium" : "Inter_400Regular",
          color: email.isUnread ? colors.foreground : colors.mutedForeground,
        }]} numberOfLines={1}>
          {email.subject || "(no subject)"}
        </Text>
        <Text style={[styles.snippet, { color: email.isUnread ? colors.mutedForeground : colors.border }]} numberOfLines={2}>
          {email.snippet}
        </Text>
        {accountDomain && (
          <View style={[styles.accountBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.accountBadgeText, { color: colors.mutedForeground }]}>{accountDomain}</Text>
          </View>
        )}
      </View>
      {email.isStarred && (
        <View style={styles.starIcon}>
          <Feather name="star" size={14} color="#F59E0B" />
        </View>
      )}
    </TouchableOpacity>
  );

  if (Platform.OS === "web") {
    return rowContent;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={onStar || onRestore ? renderLeftActions : undefined}
      renderRightActions={onTrash ? renderRightActions : undefined}
      friction={1.5}
      leftThreshold={50}
      rightThreshold={50}
      overshootLeft={false}
      overshootRight={false}
      useNativeAnimations
    >
      {rowContent}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  avatarText: {
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
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  subject: {
    fontSize: 13,
    marginBottom: 2,
  },
  snippet: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 4,
    marginLeft: 8,
  },
  starIcon: {
    marginLeft: 6,
    marginTop: 2,
  },
  accountBadge: {
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 4,
  },
  accountBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  actionBox: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});

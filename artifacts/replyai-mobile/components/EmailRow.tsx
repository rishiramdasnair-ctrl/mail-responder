import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableOpacity,
  ActionSheetIOS,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

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
  onMarkRead?: (email: EmailThread) => void;
  onReply?: (email: EmailThread) => void;
  onSnooze?: (email: EmailThread, until: Date) => void;
}

const SNOOZE_OPTIONS = [
  { label: "1 hour", getDate: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "3 hours", getDate: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { label: "Tomorrow morning", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; } },
  { label: "This weekend", getDate: () => { const d = new Date(); const day = d.getDay(); const diff = day === 6 ? 1 : (6 - day); d.setDate(d.getDate() + diff); d.setHours(8, 0, 0, 0); return d; } },
  { label: "Next week", getDate: () => { const d = new Date(); d.setDate(d.getDate() + (8 - d.getDay())); d.setHours(8, 0, 0, 0); return d; } },
];

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

interface ContextMenuProps {
  visible: boolean;
  email: EmailThread;
  onClose: () => void;
  onStar?: (email: EmailThread) => void;
  onTrash?: (email: EmailThread) => void;
  onRestore?: (email: EmailThread) => void;
  onMarkRead?: (email: EmailThread) => void;
  onReply?: (email: EmailThread) => void;
  onShowSnoozePicker?: () => void;
}

function SnoozePicker({ visible, email, onClose, onSnooze }: { visible: boolean; email: EmailThread; onClose: () => void; onSnooze?: (email: EmailThread, until: Date) => void }) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={menuStyles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[menuStyles.sheet, { backgroundColor: colors.background }]}>
              <View style={[menuStyles.handle, { backgroundColor: colors.border }]} />
              <Text style={[menuStyles.from, { color: colors.foreground }]}>Snooze until…</Text>
              <Text style={[menuStyles.subject, { color: colors.mutedForeground }]} numberOfLines={1}>{email.subject || "(no subject)"}</Text>
              <View style={[menuStyles.divider, { backgroundColor: colors.border }]} />
              {SNOOZE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={menuStyles.actionRow}
                  onPress={() => { onClose(); onSnooze?.(email, opt.getDate()); }}
                  activeOpacity={0.65}
                >
                  <View style={[menuStyles.actionIcon, { backgroundColor: colors.muted }]}>
                    <Feather name="clock" size={16} color={colors.foreground} />
                  </View>
                  <Text style={[menuStyles.actionLabel, { color: colors.foreground }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[menuStyles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
                <Text style={[menuStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function ContextMenu({ visible, email, onClose, onStar, onTrash, onRestore, onMarkRead, onReply, onShowSnoozePicker }: ContextMenuProps) {
  const colors = useColors();

  const actions: { icon: string; label: string; color?: string; onPress: () => void }[] = [];

  if (onReply) {
    actions.push({ icon: "corner-up-left", label: "Reply", onPress: () => { onClose(); onReply(email); } });
  }
  if (onStar) {
    actions.push({
      icon: "star",
      label: email.isStarred ? "Unstar" : "Star",
      color: "#F59E0B",
      onPress: () => { onClose(); onStar(email); },
    });
  }
  if (onMarkRead) {
    actions.push({
      icon: email.isUnread ? "mail" : "mail-open",
      label: email.isUnread ? "Mark as Read" : "Mark as Unread",
      onPress: () => { onClose(); onMarkRead(email); },
    });
  }
  if (onShowSnoozePicker) {
    actions.push({ icon: "clock", label: "Snooze", onPress: () => { onClose(); setTimeout(onShowSnoozePicker, 300); } });
  }
  if (onRestore) {
    actions.push({ icon: "inbox", label: "Restore to Inbox", color: "#3B82F6", onPress: () => { onClose(); onRestore(email); } });
  }
  if (onTrash) {
    actions.push({ icon: "trash-2", label: "Delete", color: "#EF4444", onPress: () => { onClose(); onTrash(email); } });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={menuStyles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[menuStyles.sheet, { backgroundColor: colors.background }]}>
              <View style={[menuStyles.handle, { backgroundColor: colors.border }]} />
              <Text style={[menuStyles.from, { color: colors.foreground }]} numberOfLines={1}>
                {email.fromName || email.fromEmail}
              </Text>
              <Text style={[menuStyles.subject, { color: colors.mutedForeground }]} numberOfLines={1}>
                {email.subject || "(no subject)"}
              </Text>
              <View style={[menuStyles.divider, { backgroundColor: colors.border }]} />
              {actions.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={menuStyles.actionRow}
                  onPress={action.onPress}
                  activeOpacity={0.65}
                >
                  <View style={[menuStyles.actionIcon, { backgroundColor: (action.color ?? colors.foreground) + "15" }]}>
                    <Feather name={action.icon as any} size={16} color={action.color ?? colors.foreground} />
                  </View>
                  <Text style={[menuStyles.actionLabel, { color: action.color ?? colors.foreground }]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[menuStyles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
                <Text style={[menuStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export function EmailRow({ email, onPress, onStar, onTrash, onRestore, onMarkRead, onReply, onSnooze }: EmailRowProps) {
  const colors = useColors();
  const [menuVisible, setMenuVisible] = useState(false);
  const [snoozePickerVisible, setSnoozePickerVisible] = useState(false);

  const displayName = email.fromName || email.fromEmail || email.from;
  const initials = getInitials(email.fromName, email.fromEmail);

  const showSnoozePicker = () => setSnoozePickerVisible(true);

  const handleLongPress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (Platform.OS === "ios") {
      const options: string[] = [];
      const handlers: (() => void)[] = [];

      if (onReply) { options.push("Reply"); handlers.push(() => onReply(email)); }
      if (onStar) { options.push(email.isStarred ? "Unstar" : "Star"); handlers.push(() => onStar(email)); }
      if (onMarkRead) { options.push(email.isUnread ? "Mark as Read" : "Mark as Unread"); handlers.push(() => onMarkRead(email)); }
      if (onSnooze) { options.push("Snooze"); handlers.push(() => setTimeout(showSnoozePicker, 300)); }
      if (onRestore) { options.push("Restore to Inbox"); handlers.push(() => onRestore(email)); }
      if (onTrash) { options.push("Delete"); handlers.push(() => onTrash(email)); }
      options.push("Cancel");

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: onTrash ? options.indexOf("Delete") : undefined,
          title: displayName,
          message: email.subject || "(no subject)",
        },
        (idx) => {
          if (idx < handlers.length) handlers[idx]();
        }
      );
    } else {
      setMenuVisible(true);
    }
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: email.isUnread ? colors.background : colors.card },
          pressed && { opacity: 0.75 },
        ]}
        onPress={() => onPress(email)}
        onLongPress={handleLongPress}
        delayLongPress={350}
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
        </View>
        {email.isStarred && (
          <View style={styles.starIcon}>
            <Feather name="star" size={14} color="#F59E0B" />
          </View>
        )}
      </Pressable>

      <ContextMenu
        visible={menuVisible}
        email={email}
        onClose={() => setMenuVisible(false)}
        onStar={onStar}
        onTrash={onTrash}
        onRestore={onRestore}
        onMarkRead={onMarkRead}
        onReply={onReply}
        onShowSnoozePicker={onSnooze ? showSnoozePicker : undefined}
      />

      <SnoozePicker
        visible={snoozePickerVisible}
        email={email}
        onClose={() => setSnoozePickerVisible(false)}
        onSnooze={onSnooze}
      />
    </>
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
});

const menuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  from: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  subject: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  cancelBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

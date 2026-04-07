import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
  Dimensions,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export interface Attachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface AttachmentChipProps {
  attachment: Attachment;
  messageId: string;
  apiBaseUrl: string;
  authHeaders: () => Promise<Record<string, string>>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "file-text";
  if (mimeType.includes("word") || mimeType.includes("document")) return "file-text";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "grid";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "archive";
  if (mimeType.includes("audio")) return "music";
  if (mimeType.includes("video")) return "video";
  return "paperclip";
}

function ImageModal({
  visible,
  uri,
  filename,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  filename: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get("window");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 0,
            right: 0,
            zIndex: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 14,
              fontFamily: "Inter_500Medium",
              flex: 1,
              marginRight: 12,
            }}
            numberOfLines={1}
          >
            {filename}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {uri ? (
            <Image
              source={{ uri }}
              style={{ width, height: height * 0.85 }}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <ActivityIndicator color="#fff" size="large" />
          )}
        </View>
      </View>
    </Modal>
  );
}

export function AttachmentChip({
  attachment,
  messageId,
  apiBaseUrl,
  authHeaders,
}: AttachmentChipProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  const isImage = attachment.mimeType.startsWith("image/");
  const icon = getFileIcon(attachment.mimeType);

  const fetchAttachment = useCallback(async (): Promise<ArrayBuffer | null> => {
    const headers = await authHeaders();
    const url =
      `${apiBaseUrl}/api/gmail/messages/${messageId}/attachments/${attachment.attachmentId}` +
      `?filename=${encodeURIComponent(attachment.filename)}&mimeType=${encodeURIComponent(attachment.mimeType)}`;
    const res = await fetch(url, { headers: { Authorization: headers.Authorization || "" } });
    if (!res.ok) throw new Error("Failed to fetch attachment");
    return res.arrayBuffer();
  }, [apiBaseUrl, messageId, attachment, authHeaders]);

  const handlePress = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const buffer = await fetchAttachment();
      if (!buffer) return;

      if (isImage) {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        const dataUri = `data:${attachment.mimeType};base64,${b64}`;
        setImageUri(dataUri);
        setShowImageModal(true);
      } else {
        if (Platform.OS === "web") {
          const blob = new Blob([buffer], { type: attachment.mimeType });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank");
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        } else {
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          const dataUri = `data:${attachment.mimeType};base64,${b64}`;
          const { Linking } = await import("react-native");
          Linking.openURL(dataUri).catch(() => {});
        }
      }
    } catch (e) {
      console.error("Attachment fetch error", e);
    } finally {
      setLoading(false);
    }
  }, [loading, isImage, fetchAttachment, attachment]);

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.background }]}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Feather name={icon as any} size={16} color={colors.foreground} />
          )}
        </View>
        <View style={styles.chipInfo}>
          <Text
            style={[styles.chipName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {attachment.filename}
          </Text>
          <Text style={[styles.chipSize, { color: colors.mutedForeground }]}>
            {formatSize(attachment.size)} · {isImage ? "Tap to view" : "Tap to open"}
          </Text>
        </View>
        <Feather name="external-link" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>

      {isImage && (
        <ImageModal
          visible={showImageModal}
          uri={imageUri}
          filename={attachment.filename}
          onClose={() => {
            setShowImageModal(false);
            setImageUri(null);
          }}
        />
      )}
    </>
  );
}

interface AttachmentsSectionProps {
  attachments: Attachment[];
  messageId: string;
  apiBaseUrl: string;
  authHeaders: () => Promise<Record<string, string>>;
}

export function AttachmentsSection({
  attachments,
  messageId,
  apiBaseUrl,
  authHeaders,
}: AttachmentsSectionProps) {
  const colors = useColors();
  if (!attachments || attachments.length === 0) return null;

  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <Feather name="paperclip" size={12} color={colors.mutedForeground} />
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {attachments.map((att) => (
          <AttachmentChip
            key={att.attachmentId}
            attachment={att}
            messageId={messageId}
            apiBaseUrl={apiBaseUrl}
            authHeaders={authHeaders}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingRight: 10,
    overflow: "hidden",
    maxWidth: 220,
    gap: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  chipInfo: {
    flex: 1,
    minWidth: 0,
  },
  chipName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  chipSize: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});

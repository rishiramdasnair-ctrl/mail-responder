import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApiClient } from "@/hooks/useApiClient";
import { getConnectorLogo, getConnectorLogoImage } from "./ConnectorLogos";
import { useToast } from "./ToastProvider";

export interface ConnectorDef {
  id: string;
  label: string;
  description: string;
  capabilities: string[];
  color: string;
  textColor: string;
  initials: string;
  oauthPath?: string;
  configKey?: string;
}

export const ALL_CONNECTORS: ConnectorDef[] = [
  {
    id: "gmail",
    label: "Gmail",
    description: "Read, search, and send emails across your Gmail inboxes.",
    capabilities: ["Search emails", "Read threads", "Send & reply", "AI reply drafts"],
    color: "#EA4335",
    textColor: "#fff",
    initials: "G",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "View and create Google Calendar events.",
    capabilities: ["List events", "Create meetings", "Check availability", "Pre-meeting briefs"],
    color: "#4285F4",
    textColor: "#fff",
    initials: "C",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    description: "Search, read, and save files in Google Drive.",
    capabilities: ["Search files", "Read documents", "Save to Drive", "List recent files"],
    color: "#4285F4",
    textColor: "#fff",
    initials: "GD",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Read messages and send replies to Slack channels.",
    capabilities: ["Read messages", "Send to channels", "DM teammates", "Search Slack"],
    color: "#4A154B",
    textColor: "#fff",
    initials: "Sl",
    oauthPath: "/api/auth/slack/start",
  },
  {
    id: "hubspot",
    label: "HubSpot",
    description: "Access your CRM contacts, deals, and pipeline data.",
    capabilities: ["Search contacts", "Read deals", "Create contacts", "Pipeline view"],
    color: "#FF7A59",
    textColor: "#fff",
    initials: "HS",
    oauthPath: "/api/auth/hubspot/start",
  },
  {
    id: "zoom",
    label: "Zoom",
    description: "Schedule and manage Zoom meetings from your emails.",
    capabilities: ["Create meetings", "Generate join links", "Schedule from email", "Meeting summaries"],
    color: "#2D8CFF",
    textColor: "#fff",
    initials: "Zm",
    oauthPath: "/api/auth/zoom/start",
  },
  {
    id: "teams",
    label: "Teams",
    description: "Send messages, post to channels, and create meetings in Microsoft Teams.",
    capabilities: ["Send chat messages", "Post to channels", "Create meetings", "Reply to threads", "List teams & channels"],
    color: "#6264A7",
    textColor: "#fff",
    initials: "MS",
    oauthPath: "/api/auth/teams/start",
  },
];

interface ConnectedRecord {
  connectorId: string;
  displayName: string;
  status: string;
}

function ConnectorAvatar({
  def,
  connected,
  size = 28,
  onPress,
}: {
  def: ConnectorDef;
  connected: boolean;
  size?: number;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{ alignItems: "center", gap: 3 }}
    >
      <View style={{ width: size, height: size, position: "relative" }}>
        {(() => {
          const imgCfg = getConnectorLogoImage(def.id);
          if (imgCfg) {
            return (
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  overflow: "hidden",
                  opacity: connected ? 1 : 0.45,
                  backgroundColor: imgCfg.backgroundColor,
                  padding: imgCfg.padding,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={imgCfg.source}
                  style={{ width: size - imgCfg.padding * 2, height: size - imgCfg.padding * 2 }}
                  resizeMode={imgCfg.resizeMode}
                />
              </View>
            );
          }
          const Logo = getConnectorLogo(def.id);
          const logoSize = Math.round(size * 0.58);
          const logoColor = connected ? def.textColor : colors.mutedForeground;
          return (
            <View
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: connected ? def.color : colors.muted,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: connected ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              {Logo ? (
                <Logo size={logoSize} color={logoColor} />
              ) : (
                <Text
                  style={{
                    fontSize: size <= 28 ? 9 : 11,
                    fontFamily: "Inter_700Bold",
                    color: logoColor,
                    letterSpacing: -0.3,
                  }}
                >
                  {def.initials}
                </Text>
              )}
            </View>
          );
        })()}
        {connected && (
          <View
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.foreground,
              borderWidth: 1.5,
              borderColor: colors.background,
            }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

interface ConnectorDetailSheetProps {
  def: ConnectorDef | null;
  connected: boolean;
  connectedAs?: string;
  visible: boolean;
  onClose: () => void;
  onConnect: (def: ConnectorDef) => Promise<void>;
  onDisconnect: (def: ConnectorDef) => Promise<void>;
  connecting: boolean;
  isBuiltIn: boolean;
}

function ConnectorDetailSheet({
  def,
  connected,
  connectedAs,
  visible,
  onClose,
  onConnect,
  onDisconnect,
  connecting,
  isBuiltIn,
}: ConnectorDetailSheetProps) {
  const colors = useColors();
  if (!def) return null;

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
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
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 20,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 16,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: def.color,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: def.textColor,
    },
    label: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: connected ? colors.foreground : colors.border,
    },
    statusText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: connected ? colors.foreground : colors.mutedForeground,
    },
    description: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 21,
      marginBottom: 16,
    },
    capSection: {
      marginBottom: 20,
    },
    capTitle: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 10,
    },
    capRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    capText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    connectBtn: {
      backgroundColor: def.color,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    connectBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: def.textColor,
    },
    disconnectBtn: {
      marginTop: 12,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    disconnectText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    builtInBadge: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: "center",
    },
    builtInText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.topRow}>
              {(() => {
                const imgCfg = getConnectorLogoImage(def.id);
                if (imgCfg) {
                  return (
                    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: imgCfg.backgroundColor, alignItems: "center", justifyContent: "center" }}>
                      <Image source={imgCfg.source} style={{ width: 40, height: 40 }} resizeMode="contain" />
                    </View>
                  );
                }
                const Logo = getConnectorLogo(def.id);
                return (
                  <View style={styles.avatar}>
                    {Logo ? <Logo size={28} color={def.textColor} /> : <Text style={styles.avatarText}>{def.initials}</Text>}
                  </View>
                );
              })()}
              <View>
                <Text style={styles.label}>{def.label}</Text>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>
                    {connected ? (connectedAs ? `Connected as ${connectedAs}` : "Connected") : "Not connected"}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.description}>{def.description}</Text>

            <View style={styles.capSection}>
              <Text style={styles.capTitle}>What the agent can do</Text>
              {def.capabilities.map((cap) => (
                <View key={cap} style={styles.capRow}>
                  <Feather name="check-circle" size={15} color={connected ? colors.foreground : colors.border} />
                  <Text style={styles.capText}>{cap}</Text>
                </View>
              ))}
            </View>

            {isBuiltIn ? (
              <View style={styles.builtInBadge}>
                <Text style={styles.builtInText}>
                  {connected
                    ? "Built-in — connected via your Gmail account"
                    : "Connect Gmail to enable this tool"}
                </Text>
              </View>
            ) : connected ? (
              <>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => onDisconnect(def)}
                  disabled={connecting}
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <Text style={styles.disconnectText}>Disconnect {def.label}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.connectBtn, connecting && { opacity: 0.6 }]}
                onPress={() => onConnect(def)}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color={def.textColor} />
                ) : (
                  <>
                    <Feather name="link" size={16} color={def.textColor} />
                    <Text style={styles.connectBtnText}>Connect {def.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

interface ConnectorStripProps {
  gmailConnected: boolean;
  exclude?: string[];
}

export function ConnectorStrip({ gmailConnected, exclude }: ConnectorStripProps) {
  const colors = useColors();
  const { apiBaseUrl, authHeaders } = useApiClient();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [selectedDef, setSelectedDef] = useState<ConnectorDef | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const { data: connectorsData } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/connectors`, { headers });
      if (!res.ok) return { connectors: [] as ConnectedRecord[] };
      return res.json() as Promise<{ connectors: ConnectedRecord[] }>;
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const connected = connectorsData?.connectors ?? [];

  const isConnected = useCallback(
    (id: string) => {
      if (id === "gmail" || id === "calendar" || id === "google-drive") return gmailConnected;
      return connected.some((c) => c.connectorId === id && c.status === "connected");
    },
    [gmailConnected, connected]
  );

  const getConnectedAs = useCallback(
    (id: string) => connected.find((c) => c.connectorId === id)?.displayName,
    [connected]
  );

  const handleOpen = useCallback((def: ConnectorDef) => {
    setSelectedDef(def);
    setSheetVisible(true);
  }, []);

  const handleConnect = useCallback(
    async (def: ConnectorDef) => {
      if (!def.oauthPath) return;
      setConnecting(true);
      try {
        const headers = await authHeaders();
        const mobileUrlPath = def.oauthPath.replace("/start", "/mobile-url");
        const urlRes = await fetch(`${apiBaseUrl}${mobileUrlPath}`, { headers });

        if (!urlRes.ok) {
          const errBody = await urlRes.json().catch(() => ({})) as { error?: string };
          const msg = errBody.error || `${def.label} is not configured yet.`;
          if (Platform.OS === "web") {
            alert(msg);
          } else {
            Alert.alert("Not available", msg);
          }
          return;
        }

        const { url: oauthUrl } = await urlRes.json() as { url: string };

        if (Platform.OS === "web") {
          // Open in new tab so the user stays in the app
          const popup = (window as any).open(oauthUrl, "_blank", "width=520,height=620");
          if (!popup) {
            // Popup blocked — fall back to same-tab navigation
            (window as any).location.href = oauthUrl;
          } else {
            // Poll until the popup closes, then refresh connector status
            const poll = setInterval(() => {
              if (popup.closed) {
                clearInterval(poll);
                qc.invalidateQueries({ queryKey: ["connectors"] });
                setConnecting(false);
              }
            }, 800);
            return; // don't hit finally until poll fires
          }
        } else {
          const result = await WebBrowser.openAuthSessionAsync(
            oauthUrl,
            "replyai://oauth-success",
            { showInRecents: true, preferEphemeralSession: false }
          );
          if (result.type === "success") {
            await qc.invalidateQueries({ queryKey: ["connectors"] });
            setSheetVisible(false);
            showToast(`${def.label} connected`, "success");
          } else if (result.type === "cancel" || result.type === "dismiss") {
            // user cancelled — no toast needed
          }
        }
      } catch (e) {
        console.error("Connect error", e);
        showToast("Connection failed. Please try again.", "error");
      } finally {
        setConnecting(false);
      }
    },
    [apiBaseUrl, authHeaders, qc, showToast]
  );

  const handleDisconnect = useCallback(
    async (def: ConnectorDef) => {
      setConnecting(true);
      try {
        const headers = await authHeaders();
        await fetch(`${apiBaseUrl}/api/connectors/${def.id}`, {
          method: "DELETE",
          headers,
        });
        await qc.invalidateQueries({ queryKey: ["connectors"] });
        setSheetVisible(false);
      } catch (e) {
        console.error("Disconnect error", e);
      } finally {
        setConnecting(false);
      }
    },
    [apiBaseUrl, authHeaders, qc]
  );

  const connectedCount = ALL_CONNECTORS.filter((d) => isConnected(d.id)).length;

  const styles = StyleSheet.create({
    strip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      gap: 8,
    },
    leftSide: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginRight: 4,
    },
    toolsText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    divider: {
      width: 1,
      height: 16,
      backgroundColor: colors.border,
      marginHorizontal: 2,
    },
    addBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
    },
  });

  return (
    <>
      <View style={styles.strip}>
        <View style={styles.leftSide}>
          <Text style={styles.toolsText}>Tools</Text>
        </View>
        <View style={styles.divider} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: 8, alignItems: "center" }}
        >
          {ALL_CONNECTORS.filter((d) => !exclude?.includes(d.id)).map((def) => (
            <ConnectorAvatar
              key={def.id}
              def={def}
              connected={isConnected(def.id)}
              onPress={() => handleOpen(def)}
            />
          ))}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              const firstUnconnected = ALL_CONNECTORS.filter((d) => !exclude?.includes(d.id)).find(
                (d) => !isConnected(d.id) && d.oauthPath
              );
              if (firstUnconnected) handleOpen(firstUnconnected);
            }}
          >
            <Feather name="plus" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ConnectorDetailSheet
        def={selectedDef}
        connected={selectedDef ? isConnected(selectedDef.id) : false}
        connectedAs={selectedDef ? getConnectedAs(selectedDef.id) : undefined}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        connecting={connecting}
        isBuiltIn={selectedDef?.id === "gmail" || selectedDef?.id === "calendar"}
      />
    </>
  );
}

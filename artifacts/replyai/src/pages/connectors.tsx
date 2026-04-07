import { useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Link2Off, ExternalLink } from "lucide-react";

interface ConnectorRow {
  id: string;
  connectorId: string;
  displayName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ConnectorsResponse {
  connectors: ConnectorRow[];
}

interface GmailStatus {
  connected: boolean;
  email?: string;
}

type DisconnectSpec =
  | { kind: "google-base" }
  | { kind: "connectors-api"; connectorIds: string[] };

interface Integration {
  id: string;
  title: string;
  description: string;
  logo: React.ReactNode;
  connectPath: string;
  disconnect: DisconnectSpec | null;
  features: string[];
  connectorKey: string | null;
  note?: string;
}

const INTEGRATION_CATALOG: Integration[] = [
  {
    id: "gmail",
    title: "Gmail",
    description: "Read, search, and reply to emails from your Gmail inbox.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="3" fill="white" stroke="#ddd" />
        <path fill="#EA4335" d="M6 10h36L24 26z" />
        <path fill="#FBBC05" d="M6 10v28h6V22z" />
        <path fill="#34A853" d="M42 10v28h-6V22z" />
        <path fill="#4285F4" d="M12 38h24l-12-12z" />
      </svg>
    ),
    connectPath: "/api/auth/google/start",
    disconnect: { kind: "google-base" },
    features: ["Inbox access", "Send replies", "Label management"],
    connectorKey: null,
  },
  {
    id: "google-calendar",
    title: "Google Calendar",
    description: "See upcoming events and create calendar entries from emails.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="6" y="10" width="36" height="32" rx="3" fill="white" stroke="#ddd" />
        <rect x="6" y="10" width="36" height="11" rx="3" fill="#4285F4" />
        <rect x="6" y="17" width="36" height="4" fill="#4285F4" />
        <text x="24" y="36" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#EA4335">31</text>
        <line x1="16" y1="10" x2="16" y2="6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="10" x2="32" y2="6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    connectPath: "/api/auth/google/start",
    disconnect: null,
    features: ["View upcoming events", "Create calendar events", "Meeting detection"],
    connectorKey: null,
    note: "Included with Gmail — reconnect Google to grant calendar access.",
  },
  {
    id: "google-drive",
    title: "Google Drive",
    description: "Save email attachments directly to your Google Drive with one click.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <path d="M6 38l8-14 8 14z" fill="#FBBC05" />
        <path d="M30 10L16 34h16l8-14z" fill="#34A853" />
        <path d="M30 10l10 20h-8L22 14z" fill="#EA4335" />
        <path d="M16 34l-10-4 8-14 2 4z" fill="#4285F4" />
      </svg>
    ),
    connectPath: "/api/auth/google/extend",
    disconnect: { kind: "connectors-api", connectorIds: ["google-drive", "google-contacts"] },
    features: ["Save attachments to Drive", "Access Drive files you create"],
    connectorKey: "google-drive",
    note: "Enabling Drive also enables Google Contacts — both use one re-authorization.",
  },
  {
    id: "google-contacts",
    title: "Google Contacts",
    description: "See contact info from your Google address book inline when viewing emails.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="6" y="6" width="36" height="36" rx="4" fill="#34A853" />
        <circle cx="24" cy="20" r="7" fill="white" />
        <ellipse cx="24" cy="38" rx="12" ry="8" fill="white" />
      </svg>
    ),
    connectPath: "/api/auth/google/extend",
    disconnect: { kind: "connectors-api", connectorIds: ["google-drive", "google-contacts"] },
    features: ["View contact details inline", "Name and company lookup"],
    connectorKey: "google-contacts",
    note: "Enabling Contacts also enables Google Drive — both use one re-authorization.",
  },
  {
    id: "hubspot",
    title: "HubSpot",
    description: "Look up HubSpot contacts and deal stage directly inside email threads. Create contacts from your inbox.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <circle cx="24" cy="24" r="20" fill="#FF7A59" />
        <circle cx="24" cy="17" r="5" fill="white" />
        <circle cx="34" cy="30" r="4" fill="white" />
        <circle cx="14" cy="30" r="4" fill="white" />
        <line x1="24" y1="17" x2="34" y2="30" stroke="white" strokeWidth="2.5" />
        <line x1="24" y1="17" x2="14" y2="30" stroke="white" strokeWidth="2.5" />
      </svg>
    ),
    connectPath: "/api/auth/hubspot/start",
    disconnect: { kind: "connectors-api", connectorIds: ["hubspot"] },
    features: ["Contact lookup in thread view", "Deal stage visibility", "Create contacts from inbox"],
    connectorKey: "hubspot",
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    description: "See sender profile info — photo, title, and company — directly in the email thread sidebar.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="6" fill="#0A66C2" />
        <rect x="12" y="20" width="6" height="16" fill="white" />
        <circle cx="15" cy="14" r="3.5" fill="white" />
        <path d="M22 20h5.5v2.2s1.5-2.5 5.5-2.5c4.5 0 6 2.8 6 7.5V36h-6v-8c0-2-.3-4-2.5-4-2.5 0-3 2-3 4v8H22V20z" fill="white" />
      </svg>
    ),
    connectPath: "/api/auth/linkedin/start",
    disconnect: { kind: "connectors-api", connectorIds: ["linkedin"] },
    features: ["Sender profile photo, title, and company", "Quick link to LinkedIn profile", "Manual search fallback"],
    connectorKey: "linkedin",
  },
  {
    id: "slack",
    title: "Slack",
    description: "Send an AI-generated thread summary to any Slack channel directly from your inbox.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="8" fill="white" />
        <path d="M18 12a4 4 0 1 0 0 8h4v-4a4 4 0 0 0-4-4z" fill="#E01E5A" />
        <path d="M12 18a4 4 0 1 0 8 0v-4a4 4 0 0 0-8 0z" fill="#E01E5A" opacity=".5" />
        <path d="M30 12a4 4 0 1 0 0 8h4a4 4 0 0 0-4-4z" fill="#36C5F0" />
        <path d="M36 18a4 4 0 1 0-8 0v4h4a4 4 0 0 0 4-4z" fill="#36C5F0" opacity=".5" />
        <path d="M18 36a4 4 0 1 0 0-8h-4a4 4 0 0 0 0 8z" fill="#2EB67D" />
        <path d="M12 30a4 4 0 1 0 8 0v-4a4 4 0 0 0-8 0z" fill="#2EB67D" opacity=".5" />
        <path d="M30 36a4 4 0 1 0 0-8h-4v4a4 4 0 0 0 4 4z" fill="#ECB22E" />
        <path d="M36 30a4 4 0 1 0-8 0v4h4a4 4 0 0 0 4-4z" fill="#ECB22E" opacity=".5" />
      </svg>
    ),
    connectPath: "/api/auth/slack/start",
    disconnect: { kind: "connectors-api", connectorIds: ["slack"] },
    features: ["Send thread summaries to any channel", "Channel picker in thread toolbar", "AI-generated summaries"],
    connectorKey: "slack",
  },
  {
    id: "calendly",
    title: "Calendly",
    description: "Insert your Calendly scheduling links into replies with one click — no copy-pasting required.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="8" fill="#006BFF" />
        <rect x="14" y="16" width="20" height="18" rx="3" fill="white" />
        <line x1="14" y1="22" x2="34" y2="22" stroke="#006BFF" strokeWidth="1.5" />
        <line x1="18" y1="10" x2="18" y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="30" y1="10" x2="30" y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="20" cy="27" r="2" fill="#006BFF" />
        <circle cx="28" cy="27" r="2" fill="#006BFF" />
      </svg>
    ),
    connectPath: "/api/auth/calendly/start",
    disconnect: { kind: "connectors-api", connectorIds: ["calendly"] },
    features: ["Insert scheduling links into replies", "Pick from your active event types", "No copy-paste needed"],
    connectorKey: "calendly",
  },
];

function useConnectors() {
  return useQuery<ConnectorsResponse>({
    queryKey: ["connectors"],
    queryFn: async () => {
      const res = await fetch("/api/connectors", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load connectors");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useGmailStatus() {
  return useQuery<GmailStatus>({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      const res = await fetch("/api/gmail/status", { credentials: "include" });
      if (!res.ok) return { connected: false };
      return res.json();
    },
    staleTime: 30_000,
  });
}

async function disconnectConnectorIds(connectorIds: string[]): Promise<void> {
  await Promise.all(
    connectorIds.map(id =>
      fetch(`/api/connectors/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      }).then(r => { if (!r.ok) throw new Error(`Failed to remove ${id}`); })
    )
  );
}

export default function ConnectorsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: connectorsData, isLoading } = useConnectors();
  const { data: gmailStatus, isLoading: isLoadingGmail } = useGmailStatus();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const errorMessages: Record<string, string> = {
      hubspot_not_configured: "HubSpot OAuth credentials are not yet configured on the server.",
      hubspot_denied: "You denied HubSpot access. Please try again.",
      hubspot_missing_params: "OAuth response was incomplete. Please try again.",
      hubspot_token_failed: "Failed to exchange HubSpot token. Please try again.",
      hubspot_callback_failed: "Something went wrong connecting HubSpot. Please try again.",
      linkedin_not_configured: "LinkedIn OAuth credentials are not yet configured on the server.",
      linkedin_denied: "You denied LinkedIn access. Please try again.",
      linkedin_missing_params: "OAuth response was incomplete. Please try again.",
      linkedin_token_failed: "Failed to exchange LinkedIn token. Please try again.",
      linkedin_callback_failed: "Something went wrong connecting LinkedIn. Please try again.",
      slack_not_configured: "Slack OAuth credentials are not yet configured on the server.",
      slack_denied: "You denied Slack access. Please try again.",
      slack_missing_params: "OAuth response was incomplete. Please try again.",
      slack_token_failed: "Failed to exchange Slack token. Please try again.",
      slack_callback_failed: "Something went wrong connecting Slack. Please try again.",
      calendly_not_configured: "Calendly OAuth credentials are not yet configured on the server.",
      calendly_denied: "You denied Calendly access. Please try again.",
      calendly_missing_params: "OAuth response was incomplete. Please try again.",
      calendly_token_failed: "Failed to exchange Calendly token. Please try again.",
      calendly_callback_failed: "Something went wrong connecting Calendly. Please try again.",
      google_extend_denied: "You denied Google access. Please try again.",
      google_extend_callback_failed: "Something went wrong extending Google access. Please try again.",
      google_extend_not_linked: "Please connect Gmail first before enabling Google Drive and Contacts.",
      google_not_configured: "Google OAuth credentials are not configured on the server.",
    };

    const error = params.get("error");
    if (error) {
      const description = errorMessages[error] ?? "Something went wrong. Please try again.";
      toast({ title: "Connection failed", description, variant: "destructive" });
      window.history.replaceState({}, "", "/connectors");
      return;
    }

    if (params.get("hubspot_connected") === "true") {
      toast({ title: "HubSpot connected", description: "Your HubSpot account is now connected." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      window.history.replaceState({}, "", "/connectors");
    }
    if (params.get("linkedin_connected") === "true") {
      toast({ title: "LinkedIn connected", description: "Your LinkedIn account is now connected." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      window.history.replaceState({}, "", "/connectors");
    }
    if (params.get("slack_connected") === "true") {
      toast({ title: "Slack connected", description: "Your Slack workspace is now connected." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      window.history.replaceState({}, "", "/connectors");
    }
    if (params.get("calendly_connected") === "true") {
      toast({ title: "Calendly connected", description: "Your Calendly account is now connected." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      window.history.replaceState({}, "", "/connectors");
    }
    if (params.get("gsuite_extended") === "true") {
      toast({ title: "Google extensions enabled", description: "Google Drive and Contacts are now active." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      window.history.replaceState({}, "", "/connectors");
    }
  }, []);

  const connectedIds = new Set<string>(connectorsData?.connectors.map(c => c.connectorId) ?? []);
  const isGmailConnected = gmailStatus?.connected ?? false;

  const disconnectMutation = useMutation({
    mutationFn: async (spec: DisconnectSpec) => {
      if (spec.kind === "google-base") {
        const res = await fetch("/api/auth/google/disconnect", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to disconnect Gmail");
      } else {
        await disconnectConnectorIds(spec.connectorIds);
      }
    },
    onSuccess: (_, spec) => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      qc.invalidateQueries({ queryKey: ["gmail-status"] });
      const label =
        spec.kind === "google-base"
          ? "Gmail"
          : spec.connectorIds.includes("hubspot")
          ? "HubSpot"
          : spec.connectorIds.includes("linkedin")
          ? "LinkedIn"
          : spec.connectorIds.includes("slack")
          ? "Slack"
          : spec.connectorIds.includes("calendly")
          ? "Calendly"
          : "Google extensions";
      toast({ title: `${label} disconnected` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    },
  });

  const isConnected = (integration: Integration): boolean => {
    if (integration.id === "gmail" || integration.id === "google-calendar") {
      return isGmailConnected;
    }
    if (integration.connectorKey) {
      return connectedIds.has(integration.connectorKey);
    }
    return false;
  };

  const anyLoading = isLoading || isLoadingGmail;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Connectors</h1>
          <p className="text-muted-foreground mt-1.5">
            Connect your tools to unlock CRM data, calendar awareness, and file storage inside your inbox.
          </p>
        </div>

        {anyLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading integrations…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {INTEGRATION_CATALOG.map((integration) => {
              const connected = isConnected(integration);

              return (
                <div
                  key={integration.id}
                  className="border rounded-xl p-5 bg-card flex flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg border bg-background flex items-center justify-center shrink-0">
                      {integration.logo}
                    </div>
                    <div>
                      <h3 className="font-semibold text-base">{integration.title}</h3>
                      {connected ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
                          <span className="text-xs font-medium text-green-600 dark:text-green-500">Connected</span>
                          {integration.id === "gmail" && gmailStatus?.email && (
                            <span className="text-xs text-muted-foreground">· {gmailStatus.email}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground mt-0.5 block">Not connected</span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">{integration.description}</p>

                  <ul className="space-y-1">
                    {integration.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {integration.note && (
                    <p className="text-xs text-muted-foreground italic border-t pt-2">{integration.note}</p>
                  )}

                  <div className="flex items-center gap-2 mt-auto pt-1">
                    {connected ? (
                      <>
                        {integration.disconnect && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => disconnectMutation.mutate(integration.disconnect!)}
                            disabled={disconnectMutation.isPending}
                          >
                            {disconnectMutation.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Link2Off className="w-3.5 h-3.5" />
                            )}
                            Disconnect
                          </Button>
                        )}
                        {integration.id === "hubspot" && (
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" asChild>
                            <a href="https://app.hubspot.com" target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open HubSpot
                            </a>
                          </Button>
                        )}
                        {integration.id === "google-calendar" && (
                          <span className="text-xs text-muted-foreground italic">Managed with Gmail</span>
                        )}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => { window.location.href = integration.connectPath; }}
                        disabled={disconnectMutation.isPending}
                      >
                        Connect {integration.title}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

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

type DisconnectAction =
  | { kind: "google-base" }
  | { kind: "connectors-api"; connectorId: string }
  | null;

interface Integration {
  id: string;
  title: string;
  description: string;
  logo: React.ReactNode;
  connectPath: string;
  disconnect: DisconnectAction;
  features: string[];
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
    note: "Included with Gmail — reconnect Google to grant calendar access.",
  },
  {
    id: "gsuite-extensions",
    title: "Google Drive & Contacts",
    description: "Save email attachments to Drive and see Google Contacts info inline — both enabled with one re-authorization.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <path d="M6 38l8-14 8 14z" fill="#FBBC05" />
        <path d="M30 10L16 34h16l8-14z" fill="#34A853" />
        <path d="M30 10l10 20h-8L22 14z" fill="#EA4335" />
        <path d="M16 34l-10-4 8-14 2 4z" fill="#4285F4" />
      </svg>
    ),
    connectPath: "/api/auth/google/extend",
    disconnect: { kind: "connectors-api", connectorId: "google-drive" },
    features: ["Save attachments directly to Drive", "Google Contacts info inline with emails"],
  },
  {
    id: "hubspot",
    title: "HubSpot",
    description: "Look up and create HubSpot contacts from your inbox. See deal stage and CRM data right in the thread view.",
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
    disconnect: { kind: "connectors-api", connectorId: "hubspot" },
    features: ["Contact lookup in email threads", "Deal stage visibility", "Create contacts from inbox"],
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
      google_extend_denied: "You denied Google access. Please try again.",
      google_extend_callback_failed: "Something went wrong extending Google access. Please try again.",
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
    if (params.get("gsuite_extended") === "true") {
      toast({ title: "Google extensions enabled", description: "Google Drive and Contacts are now active." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      window.history.replaceState({}, "", "/connectors");
    }
  }, []);

  const connectedIds = new Set<string>(connectorsData?.connectors.map(c => c.connectorId) ?? []);
  const isGmailConnected = gmailStatus?.connected ?? false;
  const driveConnected = connectedIds.has("google-drive");

  const disconnectMutation = useMutation({
    mutationFn: async (action: { kind: "google-base" } | { kind: "connectors-api"; connectorId: string }) => {
      if (action.kind === "google-base") {
        const res = await fetch("/api/auth/google/disconnect", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to disconnect Gmail");
      } else {
        const res = await fetch(`/api/connectors/${encodeURIComponent(action.connectorId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to disconnect");
      }
    },
    onSuccess: (_, action) => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connector-ids"] });
      qc.invalidateQueries({ queryKey: ["gmail-status"] });
      const label = action.kind === "google-base" ? "Gmail" : action.connectorId === "hubspot" ? "HubSpot" : "Google extensions";
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
    if (integration.id === "gsuite-extensions") {
      return driveConnected;
    }
    return connectedIds.has(integration.id);
  };

  const anyLoading = isLoading || isLoadingGmail;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Connectors</h1>
          <p className="text-muted-foreground mt-1.5">
            Connect your tools to get more out of ReplyAI — CRM data, calendar awareness, and file storage right inside your inbox.
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

                  <div className="flex items-center gap-2 mt-auto pt-1">
                    {connected ? (
                      <>
                        {integration.disconnect && integration.id !== "google-calendar" && (
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
                        {integration.note && integration.id === "google-calendar" && (
                          <span className="text-xs text-muted-foreground italic">{integration.note}</span>
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

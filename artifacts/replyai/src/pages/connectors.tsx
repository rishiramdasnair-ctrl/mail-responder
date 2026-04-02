import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Link2Off, ExternalLink } from "lucide-react";

interface Connector {
  id: string;
  connectorId: string;
  displayName: string;
  status: string;
  createdAt: string;
}

interface ConnectorsResponse {
  connectors: Connector[];
}

interface GmailStatus {
  connected: boolean;
  email?: string;
}

const INTEGRATION_CATALOG = [
  {
    id: "gmail",
    title: "Gmail",
    description: "Read, search, and reply to emails from your Gmail inbox.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <path fill="#EA4335" d="M6 10h36l-18 14z" />
        <path fill="#FBBC05" d="M6 10v28h6V20z" />
        <path fill="#34A853" d="M42 10v28h-6V20z" />
        <path fill="#4285F4" d="M12 38h24v-4L24 24 12 34z" />
        <rect x="6" y="10" width="36" height="28" rx="3" ry="3" stroke="#ddd" strokeWidth="1" fill="none" />
      </svg>
    ),
    oauthType: "google-base",
    connectPath: "/api/auth/google/start",
    disconnectPath: "/api/auth/google/disconnect",
    features: ["Inbox access", "Send replies", "Label management"],
  },
  {
    id: "google-calendar",
    title: "Google Calendar",
    description: "See upcoming events and create calendar entries from emails.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="6" y="10" width="36" height="32" rx="3" fill="white" stroke="#ddd" />
        <rect x="6" y="10" width="36" height="10" rx="3" fill="#4285F4" />
        <rect x="6" y="17" width="36" height="3" fill="#4285F4" />
        <text x="24" y="35" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#EA4335">31</text>
        <line x1="16" y1="10" x2="16" y2="6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="10" x2="32" y2="6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    oauthType: "google-base",
    connectPath: "/api/auth/google/start",
    disconnectPath: null,
    features: ["View upcoming events", "Create calendar events", "Meeting detection"],
  },
  {
    id: "google-drive",
    title: "Google Drive",
    description: "Save email attachments directly to your Google Drive.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <path d="M6 38l8-14 8 14z" fill="#FBBC05" />
        <path d="M30 10L16 34h16l8-14z" fill="#34A853" />
        <path d="M16 34l-10-4 8-14 2 4z" fill="#4285F4" />
        <path d="M30 10l10 20h-8L22 14z" fill="#EA4335" />
      </svg>
    ),
    oauthType: "google-extend",
    extension: "drive",
    connectPath: "/api/auth/google/extend?scope=drive",
    disconnectPath: "/api/auth/google/extend/disconnect",
    features: ["Save attachments to Drive", "Access Drive files"],
  },
  {
    id: "google-contacts",
    title: "Google Contacts",
    description: "See contact details from your Google address book inline with emails.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <rect x="6" y="6" width="36" height="36" rx="4" fill="#34A853" />
        <circle cx="24" cy="20" r="7" fill="white" />
        <ellipse cx="24" cy="38" rx="12" ry="8" fill="white" />
      </svg>
    ),
    oauthType: "google-extend",
    extension: "contacts",
    connectPath: "/api/auth/google/extend?scope=contacts",
    disconnectPath: "/api/auth/google/extend/disconnect",
    features: ["View contact info inline", "Name and company lookup"],
  },
  {
    id: "hubspot",
    title: "HubSpot",
    description: "Look up and create HubSpot contacts from your inbox. Log email activity automatically.",
    logo: (
      <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
        <circle cx="24" cy="24" r="20" fill="#FF7A59" />
        <circle cx="24" cy="18" r="5" fill="white" />
        <circle cx="34" cy="30" r="4" fill="white" />
        <circle cx="14" cy="30" r="4" fill="white" />
        <line x1="24" y1="18" x2="34" y2="30" stroke="white" strokeWidth="2" />
        <line x1="24" y1="18" x2="14" y2="30" stroke="white" strokeWidth="2" />
      </svg>
    ),
    oauthType: "hubspot",
    connectPath: "/api/auth/hubspot/start",
    disconnectPath: "/api/auth/hubspot/disconnect",
    features: ["Contact lookup in email threads", "Create contacts from inbox", "Deal stage visibility"],
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

  // Handle OAuth redirect results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorMap: Record<string, string> = {
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
    if (error && errorMap[error]) {
      toast({ title: "Connection failed", description: errorMap[error], variant: "destructive" });
      window.history.replaceState({}, "", "/connectors");
      return;
    }

    if (params.get("hubspot_connected") === "true") {
      toast({ title: "HubSpot connected", description: "Your HubSpot account is now connected." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      window.history.replaceState({}, "", "/connectors");
    }
    if (params.get("drive_connected") === "true") {
      toast({ title: "Google Drive enabled", description: "You can now save attachments to Drive." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      window.history.replaceState({}, "", "/connectors");
    }
    if (params.get("contacts_connected") === "true") {
      toast({ title: "Google Contacts enabled", description: "Contact info will now appear inline." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      window.history.replaceState({}, "", "/connectors");
    }
  }, []);

  const connectedIds = new Set<string>(connectorsData?.connectors.map(c => c.connectorId) ?? []);
  const isGmailConnected = gmailStatus?.connected ?? false;

  const disconnectMutation = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: Record<string, string> }) => {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: (_, { path }) => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["gmail-status"] });
      if (path.includes("gmail")) {
        toast({ title: "Gmail disconnected" });
      } else if (path.includes("hubspot")) {
        toast({ title: "HubSpot disconnected" });
      } else {
        toast({ title: "Disconnected" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    },
  });

  const isConnected = (integrationId: string) => {
    if (integrationId === "gmail" || integrationId === "google-calendar") {
      return isGmailConnected;
    }
    return connectedIds.has(integrationId);
  };

  const handleConnect = (integration: typeof INTEGRATION_CATALOG[number]) => {
    window.location.href = integration.connectPath;
  };

  const handleDisconnect = (integration: typeof INTEGRATION_CATALOG[number]) => {
    if (!integration.disconnectPath) return;
    if (integration.oauthType === "google-extend") {
      disconnectMutation.mutate({
        path: integration.disconnectPath,
        body: { extension: (integration as any).extension },
      });
    } else {
      disconnectMutation.mutate({ path: integration.disconnectPath });
    }
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
              const connected = isConnected(integration.id);
              const isDisconnecting = disconnectMutation.isPending;
              const canDisconnect = !!integration.disconnectPath &&
                integration.id !== "google-calendar";

              return (
                <div
                  key={integration.id}
                  className={`border rounded-xl p-5 bg-card flex flex-col gap-4 transition-colors ${connected ? "border-border" : "border-border/60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
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
                        {canDisconnect && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => handleDisconnect(integration)}
                            disabled={isDisconnecting}
                          >
                            {isDisconnecting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Link2Off className="w-3.5 h-3.5" />
                            )}
                            Disconnect
                          </Button>
                        )}
                        {integration.id === "hubspot" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-muted-foreground"
                            asChild
                          >
                            <a
                              href="https://app.hubspot.com"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open HubSpot
                            </a>
                          </Button>
                        )}
                        {integration.id === "google-calendar" && (
                          <span className="text-xs text-muted-foreground italic">Included with Gmail</span>
                        )}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleConnect(integration)}
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

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useMailFolder, FolderId as FolderIdFromCtx } from "@/contexts/mail-folder";
import { 
  useGetInbox, 
  useGetThread, 
  useGenerateReplies, 
  useSendReply,
  getGetInboxQueryKey,
  type EmailAttachment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Search, 
  RefreshCw, 
  Mail, 
  Sparkles, 
  Send,
  User,
  Loader2,
  Calendar,
  CalendarPlus,
  Clock,
  MapPin,
  Users,
  ChevronRight,
  ChevronLeft,
  X,
  CalendarDays,
  Star,
  Archive,
  Trash2,
  MailOpen,
  PenSquare,
  AlertTriangle,
  FileText,
  Paperclip,
  HardDrive,
  Building2,
  ExternalLink,
  UserPlus,
} from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek, parseISO, startOfDay, isSameDay } from "date-fns";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  attendees: { email: string; name: string; responseStatus: string }[];
  htmlLink: string | null;
  description: string | null;
}

interface CalendarApiError extends Error {
  code?: string;
  status?: number;
}

function isHtmlBody(body: string): boolean {
  return /(<html[\s>]|<!doctype\s+html|<body[\s>]|<table[\s>]|<div\s+[^>]*style|<span\s+[^>]*style)/i.test(body);
}

function EmailBodyRenderer({ body }: { body: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);

  const html = useMemo(() => {
    const inject = `<base target="_blank" /><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;word-break:break-word;margin:0;padding:8px;}img{max-width:100%!important;height:auto!important;}a{color:#6366f1;}*{box-sizing:border-box;}</style>`;
    if (/<\/head>/i.test(body)) {
      return body.replace(/<\/head>/i, `${inject}</head>`);
    }
    if (/<body([\s>])/i.test(body)) {
      return body.replace(/<body([\s>])/i, (_m, rest) => `<head>${inject}</head><body${rest}`);
    }
    return `<!doctype html><html><head>${inject}</head><body>${body}</body></html>`;
  }, [body]);

  const handleLoad = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        setIframeHeight(Math.max(100, doc.body.scrollHeight + 24));
      }
    } catch {}
  }, []);

  if (!isHtmlBody(body)) {
    return (
      <div className="whitespace-pre-wrap font-sans leading-relaxed text-foreground/90 text-sm">
        {body}
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={handleLoad}
      style={{ height: `${iframeHeight}px` }}
      className="w-full border-none rounded bg-white"
      title="Email content"
    />
  );
}

const FOLDERS = [
  { id: "INBOX",   label: "Inbox",   icon: Mail },
  { id: "STARRED", label: "Starred", icon: Star },
  { id: "SENT",    label: "Sent",    icon: Send },
  { id: "DRAFTS",  label: "Drafts",  icon: FileText },
  { id: "SPAM",    label: "Spam",    icon: AlertTriangle },
  { id: "TRASH",   label: "Trash",   icon: Trash2 },
] as const;

type FolderId = FolderIdFromCtx;

const REPLY_FOLDERS: FolderId[] = ["INBOX", "STARRED"];

interface ContactSuggestion {
  name: string | null;
  email: string;
  organization: string | null;
  photoUrl: string | null;
}

function ContactAutocomplete({
  value,
  onChange,
  placeholder = "recipient@example.com",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ContactSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (v: string) => {
    setQuery(v);
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(v)}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { connected: boolean; results: ContactSuggestion[] };
        if (data.connected && data.results.length > 0) {
          setResults(data.results);
          setOpen(true);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 280);
  };

  const select = (c: ContactSuggestion) => {
    const displayValue = c.name ? `${c.name} <${c.email}>` : c.email;
    setQuery(displayValue);
    onChange(c.email);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-8"
        />
        {loading && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {results.map((c, i) => (
            <button
              key={i}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors text-sm"
              onMouseDown={(e) => { e.preventDefault(); select(c); }}
            >
              {c.photoUrl ? (
                <img src={c.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-medium text-primary">
                  {c.name ? c.name[0].toUpperCase() : c.email[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {c.name && <p className="font-medium text-sm leading-tight truncate">{c.name}</p>}
                <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                {c.organization && <p className="text-xs text-muted-foreground/70 truncate">{c.organization}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gmail/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to, subject, body }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email sent", description: `Sent to ${to}` });
      setTo(""); setSubject(""); setBody("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenSquare className="w-4 h-4" />
            New Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <ContactAutocomplete value={to} onChange={setTo} placeholder="Search contacts or type an email..." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              className="w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || !to || !subject}>
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useCalendarEvents() {
  return useQuery<{ events: CalendarEvent[] }, CalendarApiError>({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/events", { credentials: "include" });
      if (!res.ok) {
        const data: { error?: string; code?: string } = await res.json().catch(() => ({}));
        const err: CalendarApiError = Object.assign(new Error(data.error || "Failed to fetch"), {
          code: data.code,
          status: res.status,
        });
        throw err;
      }
      return res.json() as Promise<{ events: CalendarEvent[] }>;
    },
    retry: false,
    staleTime: 60_000,
  });
}

function useCreateCalendarEvent() {
  return useMutation({
    mutationFn: async (body: { title: string; start: string; end: string; description?: string; location?: string; attendees?: string[] }) => {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create event");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}


interface HubSpotContact {
  id: string;
  email: string | null;
  name: string | null;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  dealName: string | null;
  dealStage: string | null;
  hubspotUrl: string | null;
}

function useHubSpotContact(email: string | null | undefined) {
  return useQuery<{ connected: boolean; contact: HubSpotContact | null }>({
    queryKey: ["hubspot-contact", email],
    queryFn: async () => {
      if (!email) return { connected: false, contact: null };
      const res = await fetch(`/api/hubspot/contact?email=${encodeURIComponent(email)}`, { credentials: "include" });
      if (!res.ok) return { connected: false, contact: null };
      return res.json();
    },
    enabled: !!email,
    staleTime: 60_000,
  });
}

function useConnectorIds() {
  return useQuery<{ connectors: Array<{ connectorId: string }> }>({
    queryKey: ["connector-ids"],
    queryFn: async () => {
      const res = await fetch("/api/connectors", { credentials: "include" });
      if (!res.ok) return { connectors: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
}

function useDriveSave() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: { messageId: string; attachmentId: string; filename: string; mimeType: string }) => {
      const res = await fetch("/api/drive/save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to save");
      }
      return res.json() as Promise<{ file: { id: string; name: string; url: string | null } }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Saved to Drive",
        description: data.file.url
          ? `"${data.file.name}" saved.`
          : `"${data.file.name}" saved to your Drive.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save to Drive", description: err.message, variant: "destructive" });
    },
  });
}

interface GoogleContact {
  resourceName: string | null;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  jobTitle: string | null;
  photoUrl: string | null;
}

function useGoogleContact(email: string | null | undefined) {
  return useQuery<{ connected: boolean; contact: GoogleContact | null }>({
    queryKey: ["google-contact", email],
    queryFn: async () => {
      if (!email) return { connected: false, contact: null };
      const res = await fetch(`/api/contacts/lookup?email=${encodeURIComponent(email)}`, { credentials: "include" });
      if (!res.ok) return { connected: false, contact: null };
      return res.json();
    },
    enabled: !!email,
    staleTime: 60_000,
  });
}

function GoogleContactPanel({ senderEmail }: { senderEmail: string }) {
  const { data, isLoading } = useGoogleContact(senderEmail);

  if (isLoading || !data?.connected) return null;

  const contact = data.contact;

  return (
    <div className="mx-0 mt-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center shrink-0">
          <span className="text-white text-[10px] font-bold">G</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Google Contact</span>
      </div>
      {contact ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {contact.photoUrl ? (
              <img src={contact.photoUrl} alt={contact.name ?? ""} className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              {contact.name && <p className="font-medium text-sm leading-tight">{contact.name}</p>}
              <p className="text-xs text-muted-foreground truncate">{senderEmail}</p>
            </div>
          </div>
          {contact.organization && (
            <div className="flex items-center gap-2 pl-0.5">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{contact.organization}</span>
            </div>
          )}
          {contact.jobTitle && (
            <p className="text-xs text-muted-foreground pl-5">{contact.jobTitle}</p>
          )}
          {contact.phone && (
            <p className="text-xs text-muted-foreground pl-5">{contact.phone}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not in your Google Contacts</p>
      )}
    </div>
  );
}

function HubSpotContactPanel({ senderEmail }: { senderEmail: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useHubSpotContact(senderEmail);
  const createContact = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hubspot/contact", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: senderEmail }),
      });
      if (!res.ok) throw new Error("Failed to create contact");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact created", description: `${senderEmail} added to HubSpot.` });
      queryClient.invalidateQueries({ queryKey: ["hubspot-contact", senderEmail] });
    },
    onError: () => {
      toast({ title: "Failed to create contact", variant: "destructive" });
    },
  });

  if (!data?.connected) return null;
  if (isLoading) return null;

  const contact = data.contact;

  return (
    <div className="mx-0 mt-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-[#FF7A59] flex items-center justify-center shrink-0">
          <span className="text-white text-[10px] font-bold">HS</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">HubSpot</span>
      </div>
      {contact ? (
        <div className="space-y-1">
          {contact.name && (
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{contact.name}</span>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">{contact.company}</span>
            </div>
          )}
          {contact.jobTitle && (
            <p className="text-xs text-muted-foreground pl-5">{contact.jobTitle}</p>
          )}
          {contact.dealName && (
            <div className="mt-1 text-xs text-muted-foreground pl-5">
              <span className="font-medium">Deal:</span> {contact.dealName}
              {contact.dealStage && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-[10px] uppercase tracking-wide font-medium">
                  {contact.dealStage}
                </span>
              )}
            </div>
          )}
          {contact.hubspotUrl && (
            <a
              href={contact.hubspotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 pl-5"
            >
              View in HubSpot
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Not in HubSpot</p>
          <button
            onClick={() => createContact.mutate()}
            disabled={createContact.isPending}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {createContact.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
            Add contact
          </button>
        </div>
      )}
    </div>
  );
}

function AttachmentsBar({
  messageId,
  attachments,
  driveConnected,
}: {
  messageId: string;
  attachments: EmailAttachment[];
  driveConnected: boolean;
}) {
  const driveSave = useDriveSave();
  if (!attachments.length) return null;

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mt-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attachments</span>
      </div>
      <div className="space-y-1.5">
        {attachments.map((att) => (
          <div key={att.attachmentId} className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{att.filename}</p>
              <p className="text-xs text-muted-foreground">{fmt(att.size)}</p>
            </div>
            {driveConnected && (
              <button
                onClick={() => driveSave.mutate({
                  messageId,
                  attachmentId: att.attachmentId,
                  filename: att.filename,
                  mimeType: att.mimeType,
                })}
                disabled={driveSave.isPending}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                title="Save to Google Drive"
              >
                {driveSave.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <HardDrive className="w-3 h-3" />
                )}
                Save to Drive
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatEventTime(start: string, isAllDay: boolean) {
  if (isAllDay) return "All day";
  try {
    return format(parseISO(start), "h:mm a");
  } catch {
    return "";
  }
}

function getEventDayLabel(start: string, isAllDay: boolean) {
  try {
    const d = isAllDay ? startOfDay(parseISO(start)) : parseISO(start);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEEE, MMM d");
  } catch {
    return "";
  }
}

function groupEventsByDay(events: CalendarEvent[]) {
  const groups: Record<string, CalendarEvent[]> = {};
  for (const evt of events) {
    try {
      const d = evt.isAllDay ? startOfDay(parseISO(evt.start)) : parseISO(evt.start);
      const key = format(d, "yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    } catch {
      const key = "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    }
  }
  return groups;
}

function CalendarPanel({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useCalendarEvents();

  const events = data?.events || [];
  const grouped = groupEventsByDay(events);
  const dayKeys = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col h-full border-l bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Calendar</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : error?.code === "NOT_CONNECTED" ? (
          <div className="p-4 text-center text-muted-foreground text-xs space-y-2">
            <CalendarDays className="w-6 h-6 mx-auto opacity-30" />
            <p>Calendar not connected.</p>
            <p>Connect Google in Settings.</p>
          </div>
        ) : error?.code === "PERMISSION_DENIED" ? (
          <div className="p-4 text-center text-muted-foreground text-xs space-y-2">
            <CalendarDays className="w-6 h-6 mx-auto opacity-30" />
            <p className="text-xs">Calendar access not granted.</p>
            <a href="/settings" className="text-primary underline text-xs">Reconnect Google</a>
          </div>
        ) : events.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-xs space-y-1">
            <CalendarDays className="w-6 h-6 mx-auto opacity-30 mb-2" />
            <p>No upcoming events</p>
            <p className="text-[11px]">Next 7 days are clear</p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {dayKeys.map(dayKey => {
              const dayEvents = grouped[dayKey];
              const firstEvent = dayEvents[0];
              const label = getEventDayLabel(firstEvent.start, firstEvent.isAllDay);
              const isCurrentDay = label === "Today";

              return (
                <div key={dayKey}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-1 ${isCurrentDay ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </div>
                  <div className="space-y-1.5">
                    {dayEvents.map(evt => (
                      <a
                        key={evt.id}
                        href={evt.htmlLink || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border bg-secondary/30 hover:bg-secondary/60 transition-colors p-2.5 group"
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${isCurrentDay ? "bg-primary" : "bg-muted-foreground/40"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate text-foreground leading-tight">{evt.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-[11px] text-muted-foreground">{formatEventTime(evt.start, evt.isAllDay)}</span>
                              {evt.attendees.length > 1 && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-[11px] text-muted-foreground">{evt.attendees.length}</span>
                                </>
                              )}
                            </div>
                            {evt.location && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-[11px] text-muted-foreground truncate">{evt.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function isMeetingEmail(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase();
  const strongSignals = /\b(meeting|appointment|schedule a call|book a call|zoom|google meet|microsoft teams|teams call|conference call|video call|phone call|catch up|catchup)\b/;
  if (strongSignals.test(text)) return true;
  const weakSignals = /\b(meet|call|schedule|invite|calendar|availability|available)\b/;
  const timeRef = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|this week|today|\d{1,2}\s*(am|pm)|\d{1,2}:\d{2}|morning|afternoon|evening|this month|next month)\b/;
  return weakSignals.test(text) && timeRef.test(text);
}

function AddToCalendarDialog({
  open,
  onOpenChange,
  subject,
  body,
  from,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject: string;
  body: string;
  from: string;
}) {
  const { toast } = useToast();
  const createEvent = useCreateCalendarEvent();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(11, 0, 0, 0);

  const [title, setTitle] = useState(subject || "");
  const [startStr, setStartStr] = useState(format(tomorrow, "yyyy-MM-dd'T'HH:mm"));
  const [endStr, setEndStr] = useState(format(tomorrowEnd, "yyyy-MM-dd'T'HH:mm"));
  const [location, setLocation] = useState("");

  const emailMatch = from.match(/<(.+)>/);
  const fromEmail = emailMatch ? emailMatch[1] : from;

  const handleCreate = () => {
    createEvent.mutate(
      {
        title,
        start: new Date(startStr).toISOString(),
        end: new Date(endStr).toISOString(),
        description: `Created from email: ${subject}`,
        location: location || undefined,
        attendees: fromEmail ? [fromEmail] : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Event created", description: "Added to your Google Calendar." });
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({ title: "Failed to create event", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-primary" />
            Add to Calendar
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Start</label>
              <Input type="datetime-local" value={startStr} onChange={e => setStartStr(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">End</label>
              <Input type="datetime-local" value={endStr} onChange={e => setEndStr(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Location (optional)</label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Zoom, Office, etc." />
          </div>
          {fromEmail && (
            <p className="text-xs text-muted-foreground">
              <Users className="inline w-3 h-3 mr-1" />
              Will invite: {fromEmail}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createEvent.isPending || !title}>
            {createEvent.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarPlus className="w-4 h-4 mr-2" />}
            Add to Calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const { activeLabel, setActiveLabel } = useMailFolder();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCalendar, setShowCalendar] = useState(true);
  const [showAddToCalendar, setShowAddToCalendar] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedThreadId(null);
    setSearchQuery("");
  }, [activeLabel]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "true") {
      toast({ title: "Gmail connected!", description: "Your inbox is now loading." });
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail_connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const { data: inboxData, isLoading: isLoadingInbox, isError: isInboxError, refetch: refetchInbox } = useGetInbox(
    { maxResults: 30, label: activeLabel, q: debouncedSearch || undefined },
    { query: { queryKey: ["inbox", activeLabel, debouncedSearch], retry: 1 } }
  );

  const modifyThread = useMutation({
    mutationFn: async ({ threadId, addLabelIds = [], removeLabelIds = [] }: { threadId: string; addLabelIds?: string[]; removeLabelIds?: string[] }) => {
      const res = await fetch(`/api/gmail/threads/${threadId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
      });
      if (!res.ok) throw new Error("Failed to modify thread");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const handleStar = (threadId: string, isStarred: boolean) => {
    modifyThread.mutate(
      isStarred
        ? { threadId, removeLabelIds: ["STARRED"] }
        : { threadId, addLabelIds: ["STARRED"] },
      { onSuccess: () => toast({ title: isStarred ? "Unstarred" : "Starred" }) }
    );
  };

  const handleArchive = (threadId: string) => {
    modifyThread.mutate(
      { threadId, removeLabelIds: ["INBOX"] },
      { onSuccess: () => { toast({ title: "Archived" }); setSelectedThreadId(null); } }
    );
  };

  const handleTrash = (threadId: string) => {
    modifyThread.mutate(
      { threadId, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] },
      { onSuccess: () => { toast({ title: "Moved to Trash" }); setSelectedThreadId(null); } }
    );
  };

  const handleMarkRead = (threadId: string, isUnread: boolean) => {
    modifyThread.mutate(
      isUnread
        ? { threadId, removeLabelIds: ["UNREAD"] }
        : { threadId, addLabelIds: ["UNREAD"] },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }) }
    );
  };

  const { data: threadData, isLoading: isLoadingThread } = useGetThread(
    selectedThreadId || "",
    { query: { enabled: !!selectedThreadId, queryKey: [selectedThreadId] } }
  );

  const { data: calendarData } = useCalendarEvents();
  const { data: connectorsData } = useConnectorIds();
  const driveConnected = connectorsData?.connectors.some(c => c.connectorId === "google-drive") ?? false;
  const hubspotConnected = connectorsData?.connectors.some(c => c.connectorId === "hubspot") ?? false;
  const contactsConnected = connectorsData?.connectors.some(c => c.connectorId === "google-contacts") ?? false;

  const generateReplies = useGenerateReplies();
  const sendReply = useSendReply();

  // Build full 7-day calendar context string for AI awareness
  const calendarContext = (() => {
    if (!calendarData?.events?.length) return undefined;
    const byDay = new Map<string, typeof calendarData.events>();
    for (const event of calendarData.events) {
      const dayKey = event.start.substring(0, 10);
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey)!.push(event);
    }
    const lines: string[] = [];
    for (const [day, events] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      try {
        const date = parseISO(day + "T00:00:00");
        const label = isToday(date) ? "Today" : isTomorrow(date) ? "Tomorrow" : format(date, "EEEE, MMM d");
        lines.push(`${label}:`);
        for (const e of events) {
          lines.push(`  - ${formatEventTime(e.start, e.isAllDay)}: ${e.title}${e.location ? ` @ ${e.location}` : ""}`);
        }
      } catch { continue; }
    }
    return lines.length ? lines.join("\n") : undefined;
  })();

  const lastGeneratedRef = useRef<{ threadId: string; hadCalendar: boolean } | null>(null);

  const triggerGeneration = useCallback((
    thread: NonNullable<typeof threadData>,
    ctx: string | undefined,
  ) => {
    const lastMsg = thread.messages[thread.messages.length - 1];
    generateReplies.mutate({
      data: {
        threadId: thread.id,
        emailBody: lastMsg.body || lastMsg.snippet,
        emailFrom: lastMsg.from,
        emailSubject: lastMsg.subject,
        calendarContext: ctx,
      },
    });
    lastGeneratedRef.current = { threadId: thread.id, hadCalendar: !!ctx };
  }, [generateReplies.mutate]);

  // Trigger when a new thread is loaded
  useEffect(() => {
    if (threadData && threadData.messages.length > 0) {
      triggerGeneration(threadData, calendarContext);
    }
  }, [threadData?.id]);

  // Re-trigger if calendar data arrives AFTER the thread was already generated without it
  useEffect(() => {
    if (
      calendarContext &&
      threadData &&
      threadData.messages.length > 0 &&
      lastGeneratedRef.current?.threadId === threadData.id &&
      !lastGeneratedRef.current.hadCalendar
    ) {
      triggerGeneration(threadData, calendarContext);
    }
  }, [calendarContext]);

  const handleSend = (content: string, tone: string) => {
    if (!threadData || !selectedThreadId) return;
    const lastMessage = threadData.messages[threadData.messages.length - 1];
    sendReply.mutate(
      {
        data: {
          threadId: selectedThreadId,
          to: lastMessage.from,
          subject: lastMessage.subject.startsWith("Re:") ? lastMessage.subject : `Re: ${lastMessage.subject}`,
          body: content,
          inReplyTo: lastMessage.id,
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Reply sent", description: `Sent ${tone} reply successfully.` });
          queryClient.invalidateQueries({ queryKey: getGetInboxQueryKey() });
          setSelectedThreadId(null);
        },
        onError: () => {
          toast({ title: "Failed to send", description: "An error occurred while sending the reply.", variant: "destructive" });
        }
      }
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!inboxData?.threads.length) return;
      const currentIndex = inboxData.threads.findIndex(t => t.threadId === selectedThreadId);
      if (e.key === "j") {
        const nextIndex = currentIndex < inboxData.threads.length - 1 ? currentIndex + 1 : 0;
        setSelectedThreadId(inboxData.threads[nextIndex].threadId);
      } else if (e.key === "k") {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : inboxData.threads.length - 1;
        setSelectedThreadId(inboxData.threads[prevIndex].threadId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inboxData, selectedThreadId]);

  const lastMessage = threadData?.messages[threadData.messages.length - 1];
  const showMeetingButton = lastMessage && isMeetingEmail(lastMessage.subject || "", lastMessage.body || lastMessage.snippet || "");

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden bg-background">
        
        {/* Inbox List Pane */}
        <div className={`flex-shrink-0 flex flex-col border-r bg-background z-10 w-full md:w-[360px] ${selectedThreadId ? "hidden md:flex" : "flex"}`}>
          <div className="border-b flex flex-col shrink-0 bg-sidebar/30">
            <div className="px-3 pt-3 pb-2 flex items-center gap-2">
              <h2 className="font-semibold text-base flex-1">{FOLDERS.find(f => f.id === activeLabel)?.label ?? "Inbox"}</h2>
              <Button
                onClick={() => setShowCompose(true)}
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium shrink-0"
              >
                <PenSquare className="w-3.5 h-3.5" />
                Compose
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCalendar(v => !v)}
                className={`h-8 w-8 shrink-0 ${showCalendar ? "text-primary" : "text-muted-foreground"}`}
                title="Toggle calendar"
              >
                <Calendar className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => refetchInbox()} className="h-8 w-8 shrink-0 text-muted-foreground" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            <div className="px-3 pb-3 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input 
                  placeholder={`Search ${FOLDERS.find(f => f.id === activeLabel)?.label ?? ""}...`}
                  className="pl-9 h-9 bg-background shadow-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            {isLoadingInbox ? (
              <div className="p-4 space-y-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isInboxError ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                <AlertTriangle className="w-8 h-8 text-amber-500 opacity-70" />
                <div>
                  <p className="font-medium text-sm">Couldn't load your inbox</p>
                  <p className="text-xs text-muted-foreground mt-1">Your Gmail connection may have expired.</p>
                </div>
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant="outline" onClick={() => refetchInbox()}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Retry
                  </Button>
                  <Button size="sm" variant="default" onClick={() => window.location.href = "/api/auth/google/start"}>
                    Reconnect Gmail
                  </Button>
                </div>
              </div>
            ) : inboxData?.threads.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                <Mail className="w-8 h-8 mb-3 opacity-20" />
                <p className="text-sm">{debouncedSearch ? `No results for "${debouncedSearch}"` : "No emails found"}</p>
                {debouncedSearch && (
                  <button onClick={() => setSearchQuery("")} className="text-xs text-primary hover:underline mt-1">Clear search</button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {inboxData?.threads.map((thread) => {
                  const isSentFolder = activeLabel === "SENT" || activeLabel === "DRAFTS";
                  const displayName = isSentFolder
                    ? (thread.to || "Unknown recipient")
                    : (thread.fromName || thread.from?.split("<")[0]?.replace(/"/g, "").trim() || thread.from || "Unknown");
                  const dateStr = (() => { try { const d = new Date(thread.date); return isNaN(d.getTime()) ? "" : format(d, "MMM d"); } catch { return ""; } })();
                  return (
                    <div
                      key={thread.threadId}
                      className={`w-full text-left transition-colors group relative border-l-2 ${
                        selectedThreadId === thread.threadId ? "bg-secondary border-l-primary" : "border-l-transparent hover:bg-secondary/50"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedThreadId(thread.threadId)}
                        className="w-full text-left p-4 flex flex-col gap-1 focus:outline-none"
                      >
                        <div className="flex justify-between items-center mb-0.5 w-full gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {thread.isUnread && activeLabel === "INBOX" && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                            )}
                            <span className={`font-medium truncate text-sm ${thread.isUnread ? "text-foreground" : "text-foreground/80"}`}>
                              {isSentFolder ? `To: ${displayName}` : displayName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {thread.isStarred && (
                              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            )}
                            <span className="text-xs text-muted-foreground">{dateStr}</span>
                          </div>
                        </div>
                        <span className={`text-sm truncate w-full ${thread.isUnread ? "font-semibold text-foreground" : "text-foreground/70"}`}>
                          {thread.subject || "(No subject)"}
                        </span>
                        <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                          {thread.snippet}
                        </span>
                      </button>
                      {/* Quick-action buttons on hover */}
                      <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-background/80 backdrop-blur-sm rounded border border-border/50 shadow-sm p-0.5">
                        <button
                          onClick={e => { e.stopPropagation(); handleStar(thread.threadId, !!thread.isStarred); }}
                          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-yellow-500"
                          title={thread.isStarred ? "Unstar" : "Star"}
                        >
                          <Star className={`w-3.5 h-3.5 ${thread.isStarred ? "fill-yellow-500 text-yellow-500" : ""}`} />
                        </button>
                        {activeLabel !== "TRASH" && (
                          <button
                            onClick={e => { e.stopPropagation(); handleTrash(thread.threadId); }}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"
                            title="Move to Trash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {activeLabel === "INBOX" && (
                          <button
                            onClick={e => { e.stopPropagation(); handleArchive(thread.threadId); }}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                            title="Archive"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Thread & Reply Pane */}
        <div className={`flex-1 flex-col min-w-0 bg-secondary/10 ${selectedThreadId ? "flex" : "hidden md:flex"}`}>
          {!selectedThreadId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg font-medium text-foreground/70">Select an email to view</p>
              <p className="text-sm mt-1">Use J/K keys to navigate quickly</p>
            </div>
          ) : isLoadingThread ? (
            <div className="flex-1 p-8 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">Loading thread...</p>
            </div>
          ) : threadData ? (
            <>
              {/* Thread Header */}
              <div className="p-4 md:p-6 border-b bg-background shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden -ml-1 shrink-0"
                    onClick={() => setSelectedThreadId(null)}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <h1 className="text-base md:text-lg font-bold tracking-tight leading-tight line-clamp-2 flex-1">{threadData.subject}</h1>
                  {/* Thread actions */}
                  <div className="flex items-center gap-0.5 shrink-0 ml-2">
                    {(() => {
                      const lastMsg = threadData.messages[threadData.messages.length - 1];
                      const isStarred = (lastMsg.labelIds || []).includes("STARRED");
                      const isUnread = (lastMsg.labelIds || []).includes("UNREAD");
                      return (
                        <>
                          <Button
                            variant="ghost" size="icon"
                            className={`h-8 w-8 ${isStarred ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"}`}
                            title={isStarred ? "Unstar" : "Star"}
                            onClick={() => handleStar(selectedThreadId!, isStarred)}
                          >
                            <Star className={`w-4 h-4 ${isStarred ? "fill-yellow-500" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title={isUnread ? "Mark as read" : "Mark as unread"}
                            onClick={() => handleMarkRead(selectedThreadId!, isUnread)}
                          >
                            <MailOpen className="w-4 h-4" />
                          </Button>
                          {activeLabel !== "TRASH" && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Archive"
                              onClick={() => handleArchive(selectedThreadId!)}
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Move to Trash"
                            onClick={() => handleTrash(selectedThreadId!)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          {showMeetingButton && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs hidden sm:flex"
                              onClick={() => setShowAddToCalendar(true)}
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              Calendar
                            </Button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm truncate">
                      {threadData.messages[threadData.messages.length - 1].from}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(() => { try { const d = new Date(threadData.messages[threadData.messages.length - 1].date); return isNaN(d.getTime()) ? "" : format(d, "PPP 'at' p"); } catch { return ""; } })()}
                    </span>
                  </div>
                  {showMeetingButton && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-8 gap-1.5 text-xs sm:hidden"
                      onClick={() => setShowAddToCalendar(true)}
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Calendar
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Email Content */}
                <ScrollArea className="flex-1 px-4 md:px-6 py-4">
                  <EmailBodyRenderer
                    body={threadData.messages[threadData.messages.length - 1].body || threadData.messages[threadData.messages.length - 1].snippet || ""}
                  />
                  {(() => {
                    const lastMsg = threadData.messages[threadData.messages.length - 1];
                    const firstMsg = threadData.messages[0];
                    const attachments: EmailAttachment[] = lastMsg.attachments ?? [];
                    const threadOriginatorEmail = firstMsg.fromEmail;
                    return (
                      <>
                        {attachments.length > 0 && (
                          <AttachmentsBar
                            messageId={lastMsg.id || ""}
                            attachments={attachments}
                            driveConnected={driveConnected}
                          />
                        )}
                        {contactsConnected && threadOriginatorEmail && (
                          <GoogleContactPanel senderEmail={threadOriginatorEmail} />
                        )}
                        {hubspotConnected && threadOriginatorEmail && (
                          <HubSpotContactPanel senderEmail={threadOriginatorEmail} />
                        )}
                      </>
                    );
                  })()}
                </ScrollArea>

                {/* AI Reply Section — only shown for inbox/starred, not sent/trash/spam */}
                {!REPLY_FOLDERS.includes(activeLabel) && (
                  <div className="shrink-0 border-t bg-muted/20 p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <MailOpen className="w-3.5 h-3.5 opacity-50" />
                    Viewing {FOLDERS.find(f => f.id === activeLabel)?.label} — AI reply suggestions are only available in Inbox and Starred.
                  </div>
                )}
                {REPLY_FOLDERS.includes(activeLabel) && (<div className="shrink-0 border-t bg-sidebar/30 p-4 md:p-6 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-sidebar-foreground/70">AI Suggestions</h3>
                    {calendarContext && (
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        Calendar-aware
                      </Badge>
                    )}
                  </div>

                  {generateReplies.isPending ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[1,2,3].map(i => (
                        <Card key={i} className="bg-background/50 border-border/50">
                          <CardContent className="p-4 space-y-3">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-8 w-full mt-4" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : generateReplies.data?.suggestions ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {generateReplies.data.suggestions.map((suggestion, idx) => (
                        <Card key={idx} className="flex flex-col border-border/50 hover:border-primary/50 transition-colors shadow-sm bg-background">
                          <div className="px-4 py-2 border-b bg-secondary/30 flex justify-between items-center">
                            <span className="text-xs font-semibold uppercase tracking-wider">{suggestion.tone}</span>
                          </div>
                          <CardContent className="p-4 flex-1 flex flex-col">
                            <div className="text-sm flex-1 whitespace-pre-wrap mb-4 text-foreground/90 leading-relaxed font-sans">
                              {suggestion.content}
                            </div>
                            <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded mb-4 italic">
                              "{suggestion.reasoning}"
                            </div>
                            <Button 
                              className="w-full mt-auto" 
                              size="sm"
                              onClick={() => handleSend(suggestion.content, suggestion.tone)}
                              disabled={sendReply.isPending}
                            >
                              {sendReply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3 h-3 mr-2" /> Send Reply</>}
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Button variant="outline" onClick={() => triggerGeneration(threadData, calendarContext)}>
                        Regenerate Suggestions
                      </Button>
                    </div>
                  )}
                </div>)}
              </div>
            </>
          ) : null}
        </div>

        {/* Calendar Panel */}
        {showCalendar && (
          <div className="hidden lg:flex flex-col w-[260px] flex-shrink-0">
            <CalendarPanel onClose={() => setShowCalendar(false)} />
          </div>
        )}

      </div>

      {/* Add to Calendar Dialog */}
      {threadData && lastMessage && (
        <AddToCalendarDialog
          open={showAddToCalendar}
          onOpenChange={setShowAddToCalendar}
          subject={threadData.subject}
          body={lastMessage.body || lastMessage.snippet || ""}
          from={lastMessage.from}
        />
      )}

      <ComposeDialog open={showCompose} onOpenChange={setShowCompose} />
    </AppLayout>
  );
}

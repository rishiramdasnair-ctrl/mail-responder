import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, Send, ChevronDown, ChevronRight, Search, Mail, CalendarPlus,
  CalendarDays, CheckCircle2, XCircle, Loader2, Sparkles, AlertCircle,
  Globe, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: "success" | "error";
  url?: string;
  screenshot?: string;
}

interface PendingEmail {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  pendingEmail?: PendingEmail;
  error?: string;
}

interface Suggestion {
  label: string;
  prompt: string;
  icon: string;
}

const FLIGHT_CHECKIN_ACTION: Suggestion = {
  label: "Check in for a flight",
  prompt: "Find my most recent flight booking confirmation email. Extract the booking reference/confirmation number and my last name. Then search the web for the airline's online check-in page, navigate to it, enter my details, and complete the check-in process. Report the boarding pass details or any issues encountered.",
  icon: "globe",
};

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { label: "Summarize unread emails", prompt: "Search for my unread emails and give me a summary of the most important ones.", icon: "mail" },
  { label: "Check my calendar", prompt: "List my upcoming calendar events for the next 7 days.", icon: "calendar" },
  { label: "Find invoice emails", prompt: "Search for any invoice or billing emails from this month and summarize what I owe.", icon: "search" },
];

const TOOL_ICONS: Record<string, React.ReactNode> = {
  search_emails: <Search className="w-3.5 h-3.5" />,
  read_email: <Mail className="w-3.5 h-3.5" />,
  send_email: <Send className="w-3.5 h-3.5" />,
  list_calendar_events: <CalendarDays className="w-3.5 h-3.5" />,
  create_calendar_event: <CalendarPlus className="w-3.5 h-3.5" />,
  search_web: <Search className="w-3.5 h-3.5" />,
  browse_url: <Globe className="w-3.5 h-3.5" />,
  get_page_state: <Globe className="w-3.5 h-3.5" />,
  click_element: <Globe className="w-3.5 h-3.5" />,
  type_text: <Globe className="w-3.5 h-3.5" />,
};

const TOOL_LABELS: Record<string, string> = {
  search_emails: "Searching emails",
  read_email: "Reading email",
  send_email: "Drafting email",
  list_calendar_events: "Checking calendar",
  create_calendar_event: "Creating calendar event",
  search_web: "Searching web",
  browse_url: "Browsing page",
  get_page_state: "Reading page",
  click_element: "Clicking element",
  type_text: "Filling in field",
};

const BROWSER_TOOLS = new Set(["search_web", "browse_url", "get_page_state", "click_element", "type_text"]);

function SuggestionIcon({ icon }: { icon: string }) {
  if (icon === "calendar") return <CalendarDays className="w-4 h-4 text-primary shrink-0" />;
  if (icon === "globe") return <Globe className="w-4 h-4 text-primary shrink-0" />;
  if (icon === "search") return <Search className="w-4 h-4 text-primary shrink-0" />;
  return <Mail className="w-4 h-4 text-primary shrink-0" />;
}

function ToolStepCard({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[step.toolName] || step.toolName;
  const icon = TOOL_ICONS[step.toolName] || <Bot className="w-3.5 h-3.5" />;
  const inputSummary = getInputSummary(step.toolName, step.input, step.url);
  const isBrowsing = BROWSER_TOOLS.has(step.toolName);

  return (
    <div className={cn("text-xs border rounded-md overflow-hidden", isBrowsing ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40" : "bg-muted/30")}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={cn("shrink-0", isBrowsing ? "text-blue-500" : "text-muted-foreground")}>{icon}</span>
        <span className="font-medium text-foreground/80">{label}</span>
        {inputSummary && <span className="text-muted-foreground truncate flex-1">{inputSummary}</span>}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {step.status === "success"
            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            : <XCircle className="w-3.5 h-3.5 text-destructive" />
          }
          {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t bg-background/50 space-y-2">
          {step.url && (
            <div>
              <span className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">URL </span>
              <a href={step.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all text-xs">{step.url}</a>
            </div>
          )}
          {step.screenshot && (
            <div>
              <div className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">Browser screenshot</div>
              <img
                src={`data:image/jpeg;base64,${step.screenshot}`}
                alt="Browser screenshot"
                className="w-full rounded border border-border/50 object-cover"
                style={{ maxHeight: 320 }}
              />
            </div>
          )}
          <div>
            <div className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">Result</div>
            <pre className="whitespace-pre-wrap text-xs text-foreground/80 max-h-40 overflow-y-auto font-mono leading-relaxed">
              {step.output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function getInputSummary(toolName: string, input: Record<string, unknown>, url?: string): string {
  if (toolName === "search_emails" && input.query) return `"${input.query}"`;
  if (toolName === "read_email" && input.threadId) return `thread ${String(input.threadId).slice(0, 12)}…`;
  if (toolName === "send_email" && input.to) return `to ${input.to}`;
  if (toolName === "list_calendar_events" && input.days) return `next ${input.days} days`;
  if (toolName === "create_calendar_event" && input.title) return `"${input.title}"`;
  if (toolName === "search_web" && input.query) return `"${input.query}"`;
  if (toolName === "browse_url" && input.url) return String(input.url);
  if (toolName === "get_page_state" && url) return url;
  if (toolName === "click_element" && input.description) return `"${input.description}"`;
  if (toolName === "type_text" && input.field_description) return `"${input.field_description}"`;
  return "";
}

function PendingEmailCard({
  email,
  onConfirm,
  onDiscard,
  isSending,
}: {
  email: PendingEmail;
  onConfirm: () => void;
  onDiscard: () => void;
  isSending: boolean;
}) {
  return (
    <Card className="mt-3 border-primary/40 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Email ready to send</span>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground mb-3">
          <div><span className="font-medium text-foreground">To:</span> {email.to}</div>
          <div><span className="font-medium text-foreground">Subject:</span> {email.subject}</div>
        </div>
        <div className="bg-background border rounded p-3 text-xs whitespace-pre-wrap text-foreground/80 max-h-40 overflow-y-auto mb-4">
          {email.body}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onConfirm} disabled={isSending} className="flex-1">
            {isSending ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Sending…</> : <><Send className="w-3 h-3 mr-1.5" />Send</>}
          </Button>
          <Button size="sm" variant="outline" onClick={onDiscard} disabled={isSending}>
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssistantMessage({
  msg,
  onConfirmSend,
  onDiscardEmail,
  sendingId,
}: {
  msg: AgentMessage;
  onConfirmSend: (msgId: string) => void;
  onDiscardEmail: (msgId: string) => void;
  sendingId: string | null;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.error ? (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{msg.error}</span>
          </div>
        ) : (
          <>
            {msg.steps && msg.steps.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {msg.steps.map((step, i) => (
                  <ToolStepCard key={i} step={step} />
                ))}
              </div>
            )}
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</div>
            {msg.pendingEmail && (
              <PendingEmailCard
                email={msg.pendingEmail}
                onConfirm={() => onConfirmSend(msg.id)}
                onDiscard={() => onDiscardEmail(msg.id)}
                isSending={sendingId === msg.id}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SuggestionsGrid({ suggestions, onSelect, isLoading }: {
  suggestions: Suggestion[];
  onSelect: (prompt: string) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-3 rounded-xl border bg-card">
            <Skeleton className="h-3 w-32 mb-1.5" />
            <Skeleton className="h-2.5 w-48" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
      {suggestions.map((s) => (
        <button
          key={s.label}
          onClick={() => onSelect(s.prompt)}
          className="text-left p-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-sm flex items-start gap-2.5"
        >
          <SuggestionIcon icon={s.icon} />
          <span className="font-medium leading-snug">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function AgentPage() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.username || null;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [activeBrowserSessionId, setActiveBrowserSessionId] = useState<string | null>(null);
  const [closingBrowser, setClosingBrowser] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem("agent_onboarded"); } catch { return true; }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch("/api/agent/suggestions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const fetched: Suggestion[] = data.suggestions || [];
        const base = fetched.length > 0 ? fetched : FALLBACK_SUGGESTIONS;
        const hasFlight = base.some((s) => s.icon === "globe" && s.label.toLowerCase().includes("flight"));
        setSuggestions(hasFlight ? base : [...base, FLIGHT_CHECKIN_ACTION]);
      } else {
        setSuggestions([...FALLBACK_SUGGESTIONS, FLIGHT_CHECKIN_ACTION]);
      }
    } catch {
      setSuggestions([...FALLBACK_SUGGESTIONS, FLIGHT_CHECKIN_ACTION]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleDismissOnboarding = () => {
    try { localStorage.setItem("agent_onboarded", "1"); } catch { /* ignore */ }
    setShowOnboarding(false);
  };

  const getHistory = () => messages
    .filter((m) => !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  const runTask = async (task: string) => {
    if (!task.trim() || isLoading) return;
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: task }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          task,
          history: getHistory(),
          ...(activeBrowserSessionId ? { sessionId: activeBrowserSessionId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          error: data.error || "Something went wrong. Please try again.",
        }]);
        return;
      }
      if (data.browserSessionActive && data.sessionId) {
        setActiveBrowserSessionId(data.sessionId);
      }
      setMessages((prev) => [...prev, {
        id: assistantMsgId,
        role: "assistant",
        content: data.answer || "",
        steps: data.steps || [],
        pendingEmail: data.pendingEmail,
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        error: "Network error. Please check your connection and try again.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => runTask(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleConfirmSend = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingEmail) return;
    setSendingId(msgId);
    try {
      const res = await fetch("/api/agent/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: msg.pendingEmail.to,
          subject: msg.pendingEmail.subject,
          body: msg.pendingEmail.body,
          ...(msg.pendingEmail.threadId ? { threadId: msg.pendingEmail.threadId } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Send failed", description: data.error || "Could not send email.", variant: "destructive" });
        return;
      }
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, pendingEmail: undefined } : m
      ));
      const confirmId = crypto.randomUUID();
      setMessages((prev) => [...prev, {
        id: confirmId,
        role: "assistant",
        content: `Email sent to ${msg.pendingEmail!.to}.`,
        steps: [],
      }]);
      toast({ title: "Email sent", description: `Sent to ${msg.pendingEmail.to}` });
    } catch {
      toast({ title: "Send failed", description: "Network error.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleDiscardEmail = (msgId: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, pendingEmail: undefined } : m
    ));
  };

  const closeBrowserSession = async () => {
    if (!activeBrowserSessionId || closingBrowser) return;
    setClosingBrowser(true);
    try {
      await fetch(`/api/agent/session/${encodeURIComponent(activeBrowserSessionId)}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch { /* ignore */ } finally {
      setActiveBrowserSessionId(null);
      setClosingBrowser(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full max-w-3xl mx-auto">
        {showOnboarding && (
          <div className="mx-4 mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold mb-1">Meet your AI inbox agent</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Type any task and I'll work through it step by step — searching your emails, checking your calendar,
                  drafting replies, and even browsing the web. I'll always ask before sending anything.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7 shrink-0" onClick={handleDismissOnboarding}>
                Got it
              </Button>
            </div>
          </div>
        )}

        {activeBrowserSessionId && (
          <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800">
            <Globe className="w-3.5 h-3.5 shrink-0 text-amber-600 animate-pulse" />
            <span className="flex-1 font-medium">Browser session active — you can continue to interact with the open page</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-amber-700 hover:bg-amber-100 hover:text-amber-900"
              onClick={closeBrowserSession}
              disabled={closingBrowser}
            >
              {closingBrowser ? "Closing…" : "Close"}
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
              <div>
                <h2 className="font-semibold text-2xl mb-1">
                  {getGreeting()}{firstName ? `, ${firstName}` : ""}
                </h2>
                <p className="text-muted-foreground text-base">What can I help you with?</p>
              </div>
              <SuggestionsGrid
                suggestions={suggestions}
                onSelect={runTask}
                isLoading={suggestionsLoading}
              />
              {!suggestionsLoading && (
                <button
                  onClick={fetchSuggestions}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh suggestions
                </button>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
              {msg.role === "user" ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-semibold">You</span>
                  </div>
                  <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                    {msg.content}
                  </div>
                </>
              ) : (
                <AssistantMessage
                  msg={msg}
                  onConfirmSend={handleConfirmSend}
                  onDiscardEmail={handleDiscardEmail}
                  sendingId={sendingId}
                />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="px-4 pb-4 pt-2 border-t bg-background">
          {messages.length > 0 && !isLoading && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
              {suggestions.map((s) => (
                <Badge
                  key={s.label}
                  variant="outline"
                  className="cursor-pointer whitespace-nowrap hover:bg-muted/50 transition-colors text-xs py-1 px-2.5 shrink-0"
                  onClick={() => runTask(s.prompt)}
                >
                  {s.label}
                </Badge>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to search emails, schedule meetings, browse the web…"
              className="min-h-[52px] max-h-36 resize-none pr-12 text-sm"
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8 shrink-0"
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Agent will always ask before sending emails
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

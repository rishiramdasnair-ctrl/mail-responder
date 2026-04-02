import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: "success" | "error";
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

const QUICK_ACTIONS = [
  { label: "Check me into a flight", prompt: "Find my most recent flight booking confirmation email and give me the check-in link or booking reference number." },
  { label: "Schedule a meeting", prompt: "Check my calendar availability for next week and draft a reply to the most recent email asking to meet." },
  { label: "Summarize unread emails", prompt: "Search for my unread emails and give me a summary of the most important ones." },
  { label: "Find invoice emails", prompt: "Search for any invoice or billing emails from this month and summarize what I owe." },
];

const TOOL_ICONS: Record<string, React.ReactNode> = {
  search_emails: <Search className="w-3.5 h-3.5" />,
  read_email: <Mail className="w-3.5 h-3.5" />,
  send_email: <Send className="w-3.5 h-3.5" />,
  list_calendar_events: <CalendarDays className="w-3.5 h-3.5" />,
  create_calendar_event: <CalendarPlus className="w-3.5 h-3.5" />,
};

const TOOL_LABELS: Record<string, string> = {
  search_emails: "Searching emails",
  read_email: "Reading email",
  send_email: "Drafting email",
  list_calendar_events: "Checking calendar",
  create_calendar_event: "Creating calendar event",
};

function ToolStepCard({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[step.toolName] || step.toolName;
  const icon = TOOL_ICONS[step.toolName] || <Bot className="w-3.5 h-3.5" />;
  const inputSummary = getInputSummary(step.toolName, step.input);

  return (
    <div className="text-xs border rounded-md overflow-hidden bg-muted/30">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-muted-foreground">{icon}</span>
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
        <div className="px-3 pb-3 pt-1 border-t bg-background/50">
          <div className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">Result</div>
          <pre className="whitespace-pre-wrap text-xs text-foreground/80 max-h-48 overflow-y-auto font-mono leading-relaxed">
            {step.output}
          </pre>
        </div>
      )}
    </div>
  );
}

function getInputSummary(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "search_emails" && input.query) return `"${input.query}"`;
  if (toolName === "read_email" && input.threadId) return `thread ${String(input.threadId).slice(0, 12)}…`;
  if (toolName === "send_email" && input.to) return `to ${input.to}`;
  if (toolName === "list_calendar_events" && input.days) return `next ${input.days} days`;
  if (toolName === "create_calendar_event" && input.title) return `"${input.title}"`;
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

export default function AgentPage() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem("agent_onboarded"); } catch { return true; }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

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
        body: JSON.stringify({ task, history: getHistory() }),
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
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: msg.pendingEmail.to,
          subject: msg.pendingEmail.subject,
          body: msg.pendingEmail.body,
          threadId: msg.pendingEmail.threadId,
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
                  drafting replies. I'll always ask before sending anything.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7 shrink-0" onClick={handleDismissOnboarding}>
                Got it
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg mb-1">What can I help you with?</h2>
                <p className="text-muted-foreground text-sm">I can search your inbox, check your calendar, draft and send emails.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => runTask(action.prompt)}
                    className="text-left p-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-sm"
                  >
                    <span className="font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
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
              {QUICK_ACTIONS.map((action) => (
                <Badge
                  key={action.label}
                  variant="outline"
                  className="cursor-pointer whitespace-nowrap hover:bg-muted/50 transition-colors text-xs py-1 px-2.5 shrink-0"
                  onClick={() => runTask(action.prompt)}
                >
                  {action.label}
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
              placeholder="Ask me to search emails, schedule meetings, summarize threads…"
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

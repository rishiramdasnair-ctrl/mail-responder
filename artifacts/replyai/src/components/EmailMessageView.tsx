import { useRef, useState, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isHtmlBody(body: string): boolean {
  return /<(html|body|div|p|span|table|td|tr|br|font|a[\s>]|img[\s>])/i.test(body);
}

/** Clickable plain-text links */
export function renderWithLinks(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={`${keyPrefix}-${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
}

/** Generate a consistent brand color from an email/name string */
export function senderColor(seed: string): string {
  const palette = [
    "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b",
    "#ef4444", "#ec4899", "#06b6d4", "#84cc16",
    "#f97316", "#6366f1",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

/** Split plain-text body at RFC-2646 "-- " signature delimiter */
function splitPlainText(body: string): { main: string; sig?: string } {
  for (const d of ["\n-- \n", "\n--\n", "\n-- \r\n", "\r\n-- \r\n"]) {
    const idx = body.indexOf(d);
    if (idx > 10) return { main: body.slice(0, idx).trimEnd(), sig: body.slice(idx + d.length) };
  }
  return { main: body };
}

/** Detect confidentiality disclaimers in plain text */
const DISCLAIMER_PATTERNS = [
  /\*{2,}.*confidential.*\*{2,}/is,
  /this\s+e?mail\s+and\s+any\s+files?\s+transmitted/i,
  /intended\s+solely\s+for\s+the\s+use\s+of/i,
  /if\s+you\s+are\s+not\s+the\s+(named\s+)?addressee/i,
];
function containsDisclaimer(text: string): boolean {
  return DISCLAIMER_PATTERNS.some(p => p.test(text));
}

// ─── HTML email body renderer ────────────────────────────────────────────────

function HtmlBodyRenderer({ body }: { body: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(200);

  const html = useMemo(() => {
    const css = `
      html,body{
        margin:0;padding:16px 20px 24px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
        font-size:14px;line-height:1.75;color:#1a1a1a;background:#fff;
        overflow-wrap:break-word;word-wrap:break-word;-webkit-text-size-adjust:100%;
      }
      img{max-width:100%;height:auto;}
      a{color:#2563eb;text-decoration:underline;overflow-wrap:break-word;}
      a:hover{color:#1d4ed8;}
      blockquote{
        margin:12px 0 12px 0;padding:8px 16px;
        border-left:3px solid #d1d5db;color:#6b7280;
        background:#f9fafb;border-radius:0 6px 6px 0;
      }
      pre{background:#f3f4f6;border-radius:6px;padding:12px;overflow-x:auto;font-size:13px;}
      code{font-family:ui-monospace,'Cascadia Code',monospace;font-size:0.9em;
           background:#f3f4f6;padding:2px 5px;border-radius:4px;}
      pre code{background:none;padding:0;}
      table{border-collapse:collapse;max-width:100%;}
      td,th{padding:6px 10px;vertical-align:top;}
      *{box-sizing:border-box;}
      /* Dim Gmail signature blocks */
      .gmail_signature,[data-smartmail="gmail_signature"]{
        opacity:0.55;font-size:12px;margin-top:16px;
        padding-top:12px;border-top:1px solid #e5e7eb;
      }
      /* Dim quoted history */
      .gmail_quote,.gmail_extra{color:#9ca3af;font-size:12px;}
      /* Prevent wide tables from breaking layout */
      table{width:auto!important;max-width:100%!important;}
      td,th{max-width:100%;}
    `;
    const inject = `<base target="_blank" /><style>${css}</style>`;
    if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, `${inject}</head>`);
    if (/<body([\s>])/i.test(body))
      return body.replace(/<body([\s>])/i, (_m, rest) => `<head>${inject}</head><body${rest}`);
    return `<!doctype html><html><head>${inject}</head><body>${body}</body></html>`;
  }, [body]);

  const handleLoad = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.body) return;
      setIframeHeight(Math.max(80, doc.documentElement.scrollHeight + 8));
    } catch {}
  }, []);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border/60 bg-white shadow-sm">
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        onLoad={handleLoad}
        style={{ height: `${iframeHeight}px`, minWidth: "100%", display: "block" }}
        className="border-none rounded-xl"
        title="Email content"
      />
    </div>
  );
}

// ─── Plain-text email body renderer ─────────────────────────────────────────

function PlainBodyRenderer({ body }: { body: string }) {
  const [showSig, setShowSig] = useState(false);
  const { main, sig } = useMemo(() => splitPlainText(body), [body]);

  // Split main at disclaimer if present
  const { content, disclaimer } = useMemo(() => {
    const lines = main.split("\n");
    const disclaimerIdx = lines.findIndex(l => containsDisclaimer(l));
    if (disclaimerIdx > 0) {
      return {
        content: lines.slice(0, disclaimerIdx).join("\n"),
        disclaimer: lines.slice(disclaimerIdx).join("\n"),
      };
    }
    return { content: main, disclaimer: undefined };
  }, [main]);

  const renderLines = (text: string) =>
    text.split("\n").map((line, i) => {
      const quoteMatch = line.match(/^(>+\s*)/);
      if (quoteMatch) {
        return (
          <div key={i} className="pl-3 border-l-2 border-muted text-muted-foreground text-xs my-0.5 italic">
            {renderWithLinks(line.slice(quoteMatch[0].length), `q${i}`) || "\u00a0"}
          </div>
        );
      }
      return line.trim() === "" ? (
        <div key={i} className="h-2.5" />
      ) : (
        <div key={i} className="my-0.5 leading-relaxed" style={{ overflowWrap: "break-word" }}>
          {renderWithLinks(line, `l${i}`)}
        </div>
      );
    });

  return (
    <div className="text-sm text-foreground/90 font-sans" style={{ overflowWrap: "break-word" }}>
      {renderLines(content)}

      {/* Signature collapse */}
      {sig && (
        <div className="mt-5">
          <button
            onClick={() => setShowSig(v => !v)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="h-px flex-1 bg-border max-w-[60px]" />
            <span>Signature</span>
            {showSig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <div className="h-px flex-1 bg-border max-w-[60px]" />
          </button>
          {showSig && (
            <div className="mt-3 text-xs text-muted-foreground border-l-2 border-border/50 pl-3">
              {renderLines(sig)}
            </div>
          )}
        </div>
      )}

      {/* Disclaimer collapse */}
      {disclaimer && (
        <div className="mt-4">
          <button
            onClick={() => setShowSig(v => !v)}
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors italic"
          >
            {showSig ? "Hide" : "Show"} confidentiality notice
          </button>
          {showSig && (
            <div className="mt-2 text-[10px] text-muted-foreground/60 italic leading-relaxed">
              {disclaimer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Email body router ───────────────────────────────────────────────────────

export function EmailBodyRenderer({ body }: { body: string }) {
  if (!body) return null;
  if (isHtmlBody(body)) return <HtmlBodyRenderer body={body} />;
  return <PlainBodyRenderer body={body} />;
}

// ─── Single message card ─────────────────────────────────────────────────────

interface EmailMessage {
  id?: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
  snippet?: string;
  labelIds?: string[];
}

interface EmailMessageCardProps {
  message: EmailMessage;
  isLast?: boolean;
  defaultExpanded?: boolean;
}

export function EmailMessageCard({ message, isLast = false, defaultExpanded = false }: EmailMessageCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { from, fromName, fromEmail, date, body, snippet } = message;
  const displayName = fromName || fromEmail || from?.split("<")[0].replace(/"/g, "").trim() || "Unknown";
  const emailAddr = fromEmail || from?.match(/<([^>]+)>/)?.[1] || from || "";
  const initial = displayName[0]?.toUpperCase() ?? "?";
  const color = senderColor(emailAddr || displayName);

  const dateStr = (() => {
    try {
      const d = new Date(date ?? "");
      return isNaN(d.getTime()) ? "" : format(d, "MMM d, yyyy 'at' h:mm a");
    } catch { return ""; }
  })();
  const shortDate = (() => {
    try {
      const d = new Date(date ?? "");
      return isNaN(d.getTime()) ? "" : format(d, "MMM d");
    } catch { return ""; }
  })();

  const bodyContent = body || snippet || "";

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-3 px-1 py-2.5 rounded-lg hover:bg-muted/40 transition-colors">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0"
            style={{ background: color }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate text-foreground/80">{displayName}</span>
              <span className="text-xs text-muted-foreground shrink-0">{shortDate}</span>
            </div>
            <span className="text-xs text-muted-foreground truncate block">{snippet ?? ""}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border ${isLast ? "border-border shadow-sm" : "border-border/60"} bg-background`}>
      {/* Sender header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
          style={{ background: color }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="font-semibold text-sm text-foreground">{displayName}</span>
              {emailAddr && displayName.toLowerCase() !== emailAddr.toLowerCase() && (
                <span className="text-xs text-muted-foreground ml-1.5">{"<"}{emailAddr}{">"}</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{dateStr || shortDate}</span>
          </div>
          {message.to && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              To: {message.to}
            </p>
          )}
        </div>
        {!isLast && (
          <button
            onClick={() => setExpanded(false)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            title="Collapse"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Email body */}
      <div className="px-4 pb-5">
        <EmailBodyRenderer body={bodyContent} />
      </div>
    </div>
  );
}

// ─── Full thread view (all messages) ─────────────────────────────────────────

interface ThreadViewProps {
  messages: EmailMessage[];
}

export function ThreadMessageView({ messages }: ThreadViewProps) {
  if (!messages.length) return null;
  const last = messages.length - 1;

  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, i) => (
        <EmailMessageCard
          key={msg.id ?? i}
          message={msg}
          isLast={i === last}
          defaultExpanded={i === last}
        />
      ))}
    </div>
  );
}

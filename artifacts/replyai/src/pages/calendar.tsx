import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  MapPin,
  Users,
  ExternalLink,
  X,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64; // px per hour in time grid
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type CalendarView = "month" | "week" | "day";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  attendees: Array<{ email: string; name: string; responseStatus: string }>;
  htmlLink: string | null;
  description: string | null;
}

interface EventLayout {
  event: CalendarEvent;
  col: number;
  numCols: number;
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function toLocalDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isToday(d: Date) { return sameDay(d, new Date()); }

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function startOfWeek(d: Date) {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0,0,0,0); return r;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatTime(iso: string) {
  const d = toLocalDate(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTimeRange(start: string, end: string, isAllDay: boolean) {
  if (isAllDay) return "All day";
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function minutesFromMidnight(iso: string) {
  const d = toLocalDate(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function isPastEvent(evt: CalendarEvent): boolean {
  const end = toLocalDate(evt.end);
  if (evt.isAllDay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return end < today;
  }
  return end < new Date();
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dk = dateKey(day);
  return events.filter(evt => {
    const start = toLocalDate(evt.start);
    if (dateKey(start) === dk) return true;
    if (evt.isAllDay && evt.end) {
      const end = toLocalDate(evt.end);
      const adjustedEnd = new Date(end.getTime() - 1);
      return day >= start && day <= adjustedEnd;
    }
    return false;
  });
}

function buildMonthGrid(anchor: Date): Date[] {
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const firstDay = new Date(y, m, 1);
  const lastDay  = new Date(y, m + 1, 0);
  const startOffset = firstDay.getDay();
  const total = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  return Array.from({ length: total }, (_, i) => new Date(y, m, 1 - startOffset + i));
}

function getWeekDays(anchor: Date): Date[] {
  const sun = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
}

// ─── Event overlap layout ─────────────────────────────────────────────────────

function layoutTimedEvents(events: CalendarEvent[]): EventLayout[] {
  const timed = [...events]
    .filter(e => !e.isAllDay)
    .sort((a, b) => toLocalDate(a.start).getTime() - toLocalDate(b.start).getTime());

  if (!timed.length) return [];

  // Group into overlapping clusters
  const clusters: CalendarEvent[][] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEndMs = 0;

  for (const evt of timed) {
    const startMs = toLocalDate(evt.start).getTime();
    const endMs   = Math.max(startMs + 15 * 60000, toLocalDate(evt.end).getTime());
    if (!cluster.length || startMs < clusterEndMs) {
      cluster.push(evt);
      clusterEndMs = Math.max(clusterEndMs, endMs);
    } else {
      clusters.push(cluster);
      cluster = [evt];
      clusterEndMs = endMs;
    }
  }
  if (cluster.length) clusters.push(cluster);

  const result: EventLayout[] = [];
  for (const grp of clusters) {
    const cols: number[] = [];
    const placements: number[] = [];
    for (const evt of grp) {
      const startMs = toLocalDate(evt.start).getTime();
      const endMs   = toLocalDate(evt.end).getTime();
      let col = cols.findIndex(end => end <= startMs);
      if (col === -1) col = cols.length;
      cols[col] = endMs;
      placements.push(col);
    }
    const numCols = cols.length;
    grp.forEach((evt, i) => result.push({ event: evt, col: placements[i], numCols }));
  }
  return result;
}

// ─── API ──────────────────────────────────────────────────────────────────────

function useRangeEvents(start: string, end: string) {
  return useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["calendar-range", start, end],
    queryFn: async () => {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/calendar/events?${params}`, { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const err: any = new Error((d as any).error || "Failed");
        err.code = (d as any).code;
        throw err;
      }
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });
}

function useCreateEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; start: string; end: string; description?: string; location?: string }) => {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["calendar-range"] }),
  });
}

// ─── Event detail panel ───────────────────────────────────────────────────────

function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const startD = toLocalDate(event.start);
  const dateStr = startD.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-3 border-b">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-snug">{event.title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-5 py-4 space-y-3.5">
          <div className="flex items-center gap-2.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>{formatTimeRange(event.start, event.end, event.isAllDay)}</span>
          </div>
          {event.location && (
            <div className="flex items-start gap-2.5 text-xs">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-px" />
              <span className="leading-snug">{event.location}</span>
            </div>
          )}
          {event.attendees.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-2">
                {event.attendees.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center text-[9px] font-semibold uppercase shrink-0">
                      {(a.name || a.email).charAt(0)}
                    </div>
                    <div className="min-w-0">
                      {a.name && <p className="text-[11px] font-medium leading-none">{a.name}</p>}
                      <p className="text-[11px] text-muted-foreground truncate">{a.email}</p>
                    </div>
                    {a.responseStatus === "accepted" && <span className="ml-auto text-[10px] text-green-600 font-medium">✓</span>}
                    {a.responseStatus === "declined"  && <span className="ml-auto text-[10px] text-red-500  font-medium">✕</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {event.description && (
            <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap border-t pt-3">
              {event.description}
            </div>
          )}
          {event.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="w-3 h-3" />
              Open in Google Calendar
            </a>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

function AddEventModal({ open, onClose, defaultDate, defaultTime }: {
  open: boolean; onClose: () => void; defaultDate?: Date; defaultTime?: string;
}) {
  const { toast } = useToast();
  const create = useCreateEvent();
  const [title, setTitle]           = useState("");
  const [date, setDate]             = useState("");
  const [startTime, setStartTime]   = useState("09:00");
  const [endTime, setEndTime]       = useState("10:00");
  const [location, setLocation]     = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay]         = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDate ? dateKey(defaultDate) : dateKey(new Date()));
      setStartTime(defaultTime ?? "09:00");
      const [h, m] = (defaultTime ?? "09:00").split(":").map(Number);
      const endH = String(Math.min(23, h + 1)).padStart(2, "0");
      setEndTime(`${endH}:${String(m).padStart(2, "0")}`);
    }
  }, [open, defaultDate, defaultTime]);

  function reset() {
    setTitle(""); setDate(""); setStartTime("09:00"); setEndTime("10:00");
    setLocation(""); setDescription(""); setAllDay(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date) return;
    const startISO = allDay ? date : `${date}T${startTime}:00`;
    const endISO   = allDay ? date : `${date}T${endTime}:00`;
    try {
      await create.mutateAsync({ title, start: startISO, end: endISO, location: location || undefined, description: description || undefined });
      toast({ title: "Event created" });
      reset(); onClose();
    } catch (err: any) {
      toast({ title: "Failed to create event", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input autoFocus placeholder="Event title" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="allDay" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="rounded" />
            <Label htmlFor="allDay" className="cursor-pointer text-sm">All-day event</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="Add a location" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="Add notes" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Create event"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Time Grid (shared by Week + Day views) ───────────────────────────────────

function TimeGrid({ days, eventsByDay, onEventClick, onSlotClick }: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  onEventClick: (evt: CalendarEvent) => void;
  onSlotClick: (day: Date, hour: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 16;
    }
  }, []);

  // Live time indicator
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayKey = dateKey(new Date());
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b shrink-0 bg-background">
        <div className="w-14 shrink-0" /> {/* time gutter */}
        {days.map(day => {
          const dk = dateKey(day);
          const today = dk === todayKey;
          const evts = eventsByDay.get(dk) ?? [];
          const timedCount = evts.filter(e => !e.isAllDay).length;
          return (
            <div key={dk} className={`flex-1 min-w-0 text-center py-2 px-1 border-l ${today ? "bg-foreground/[0.02]" : ""}`}>
              <p className={`text-[11px] font-medium uppercase tracking-wide ${today ? "text-foreground" : "text-muted-foreground"}`}>
                {WEEKDAYS_SHORT[day.getDay()]}
              </p>
              <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold mx-auto mt-0.5 ${today ? "bg-foreground text-background" : "text-foreground"}`}>
                {day.getDate()}
              </div>
              {timedCount > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{timedCount} event{timedCount !== 1 ? "s" : ""}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      {days.some(d => (eventsByDay.get(dateKey(d)) ?? []).some(e => e.isAllDay)) && (
        <div className="flex border-b shrink-0 max-h-20 overflow-y-auto bg-muted/20">
          <div className="w-14 shrink-0 flex items-start justify-end pr-2 pt-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">all day</span>
          </div>
          {days.map(day => {
            const dk = dateKey(day);
            const allDayEvts = (eventsByDay.get(dk) ?? []).filter(e => e.isAllDay);
            return (
              <div key={dk} className="flex-1 min-w-0 border-l px-0.5 py-1 space-y-0.5">
                {allDayEvts.map(evt => (
                  <button key={evt.id} onClick={() => onEventClick(evt)}
                    className="w-full text-left truncate rounded text-[10px] font-medium px-1.5 py-0.5 bg-foreground text-background hover:opacity-80 transition-opacity">
                    {evt.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Time labels */}
          <div className="w-14 shrink-0 relative">
            {HOURS.map(h => (
              <div key={h} className="absolute right-2 flex items-start" style={{ top: h * HOUR_HEIGHT - 8, height: HOUR_HEIGHT }}>
                {h > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium leading-none">
                    {formatHour(h)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const dk = dateKey(day);
            const evts = eventsByDay.get(dk) ?? [];
            const layouts = layoutTimedEvents(evts);
            const isCurrentDay = dk === todayKey;

            return (
              <div key={dk} className={`flex-1 min-w-0 border-l relative ${isCurrentDay ? "bg-foreground/[0.015]" : ""}`}
                style={{ height: 24 * HOUR_HEIGHT }}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                    style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    onClick={() => onSlotClick(day, h)}
                  />
                ))}
                {/* Half-hour dashed lines */}
                {HOURS.map(h => (
                  <div key={`${h}-half`} className="absolute inset-x-0 border-t border-dashed border-border/25 pointer-events-none"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                ))}

                {/* Current time indicator */}
                {isCurrentDay && (
                  <div className="absolute inset-x-0 flex items-center pointer-events-none z-20"
                    style={{ top: nowTop }}>
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                    <div className="flex-1 border-t border-red-500" />
                  </div>
                )}

                {/* Events */}
                {layouts.map(({ event: evt, col, numCols }) => {
                  const startMin = minutesFromMidnight(evt.start);
                  const endMin   = minutesFromMidnight(evt.end);
                  const duration = Math.max(endMin - startMin, 15);
                  const top      = (startMin / 60) * HOUR_HEIGHT;
                  const height   = Math.max((duration / 60) * HOUR_HEIGHT, 22);
                  const width    = `calc(${100 / numCols}% - 2px)`;
                  const left     = `calc(${(col / numCols) * 100}% + 1px)`;
                  const short    = height < 36;

                  const past = isPastEvent(evt);
                  return (
                    <button
                      key={evt.id}
                      onClick={e => { e.stopPropagation(); onEventClick(evt); }}
                      className="absolute rounded-md text-left overflow-hidden group hover:brightness-95 transition-all z-10 shadow-sm"
                      style={{
                        top, height, width, left,
                        background: past ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                        color: "hsl(var(--background))",
                        opacity: past ? 0.45 : 1,
                      }}
                    >
                      <div className="px-1.5 py-0.5 h-full flex flex-col justify-start overflow-hidden">
                        <p className={`font-medium leading-tight truncate ${short ? "text-[9px]" : "text-[10px]"}`}>{evt.title}</p>
                        {!short && (
                          <p className="text-[9px] opacity-70 leading-tight">{formatTime(evt.start)}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ anchor, events, onDayClick, onEventClick }: {
  anchor: Date;
  events: CalendarEvent[];
  onDayClick: (day: Date) => void;
  onEventClick: (evt: CalendarEvent) => void;
}) {
  const grid = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const todayKey = dateKey(new Date());

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b shrink-0">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${grid.length / 7}, minmax(88px, 1fr))` }}>
          {grid.map((day, i) => {
            const dk = dateKey(day);
            const isCurrentMonth = day.getMonth() === anchor.getMonth();
            const today = dk === todayKey;
            const dayEvts = eventsForDay(events, day);
            const overflow = dayEvts.length > 3;

            return (
              <div key={i}
                onClick={() => onDayClick(day)}
                className={`border-b border-r flex flex-col cursor-pointer group transition-colors
                  ${isCurrentMonth ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"}
                `}
              >
                {/* Day number */}
                <div className="px-2 pt-1.5 pb-1 shrink-0">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                    ${today ? "bg-foreground text-background" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/50"}`}>
                    {day.getDate()}
                  </span>
                </div>

                {/* Events */}
                <div className="flex flex-col gap-0.5 px-1 pb-1 overflow-hidden">
                  {dayEvts.slice(0, 3).map(evt => {
                    const past = isPastEvent(evt);
                    return (
                      <button key={evt.id}
                        onClick={e => { e.stopPropagation(); onEventClick(evt); }}
                        className={`w-full text-left truncate rounded text-[10px] leading-tight font-medium px-1.5 py-0.5 transition-opacity hover:opacity-80
                          ${evt.isAllDay
                            ? "bg-foreground text-background"
                            : past
                              ? "bg-muted-foreground/15 border border-border text-muted-foreground"
                              : "bg-foreground/8 border border-border text-foreground"
                          }`}
                        style={past ? { opacity: 0.55 } : undefined}
                        title={evt.title}
                      >
                        {!evt.isAllDay && (
                          <span className={`mr-1 ${past ? "text-muted-foreground/70" : "text-muted-foreground"}`}>{formatTime(evt.start)}</span>
                        )}
                        {evt.title}
                      </button>
                    );
                  })}
                  {overflow && (
                    <span className="text-[10px] text-muted-foreground pl-1.5">+{dayEvts.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView]           = useState<CalendarView>("month");
  const [anchor, setAnchor]       = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAddEvent, setShowAddEvent]   = useState(false);
  const [addEventTime, setAddEventTime]   = useState<{ day: Date; hour: number } | null>(null);

  // Swipe-to-navigate
  const swipeRef    = useRef<HTMLDivElement>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const swipeIntent = useRef<"horizontal" | "vertical" | null>(null);

  // Compute fetch range based on view
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === "month") {
      const sm = startOfMonth(anchor);
      const em = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59);
      return { rangeStart: sm.toISOString(), rangeEnd: em.toISOString() };
    }
    if (view === "week") {
      const sw = startOfWeek(anchor);
      const ew = addDays(sw, 6);
      ew.setHours(23, 59, 59);
      return { rangeStart: sw.toISOString(), rangeEnd: ew.toISOString() };
    }
    // day
    const sd = new Date(anchor); sd.setHours(0, 0, 0, 0);
    const ed = new Date(anchor); ed.setHours(23, 59, 59);
    return { rangeStart: sd.toISOString(), rangeEnd: ed.toISOString() };
  }, [view, anchor]);

  const { data, isLoading, error } = useRangeEvents(rangeStart, rangeEnd);
  const events = data?.events ?? [];

  const errorCode    = (error as any)?.code as string | undefined;
  const notConnected = errorCode === "NOT_CONNECTED";
  const permDenied   = errorCode === "PERMISSION_DENIED";
  const apiNotEnabled = errorCode === "API_NOT_ENABLED";

  // Navigation
  const navigate = useCallback((dir: 1 | -1) => {
    setSelectedEvent(null);
    setAnchor(prev => {
      if (view === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
      }
      if (view === "week") return addDays(prev, dir * 7);
      return addDays(prev, dir);
    });
  }, [view]);

  // Attach swipe listeners to the calendar body.
  // We lock in the gesture direction early (after the first 10px of movement)
  // so that accumulated vertical scroll in the time grid can't retroactively
  // invalidate a horizontal swipe.
  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      touchOrigin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      swipeIntent.current = null;
    };

    const onMove = (e: TouchEvent) => {
      if (!touchOrigin.current || swipeIntent.current !== null) return;
      const dx = e.touches[0].clientX - touchOrigin.current.x;
      const dy = e.touches[0].clientY - touchOrigin.current.y;
      // Wait until at least 10px of movement before deciding intent
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      swipeIntent.current = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
    };

    const onEnd = (e: TouchEvent) => {
      if (!touchOrigin.current) return;
      const dx = e.changedTouches[0].clientX - touchOrigin.current.x;
      const intent = swipeIntent.current;
      touchOrigin.current = null;
      swipeIntent.current = null;
      // Only navigate if we locked in a horizontal intent and moved far enough
      if (intent !== "horizontal" || Math.abs(dx) < 50) return;
      navigate(dx < 0 ? 1 : -1);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove",  onMove,  { passive: true });
    el.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove",  onMove);
      el.removeEventListener("touchend",   onEnd);
    };
  }, [navigate]);

  const goToday = () => {
    const t = new Date(); t.setHours(0,0,0,0);
    setAnchor(t);
    setSelectedEvent(null);
  };

  // Header label
  const headerLabel = useMemo(() => {
    if (view === "month") return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === "week") {
      const sun = startOfWeek(anchor);
      const sat = addDays(sun, 6);
      if (sun.getMonth() === sat.getMonth()) {
        return `${MONTHS_SHORT[sun.getMonth()]} ${sun.getDate()} – ${sat.getDate()}, ${sun.getFullYear()}`;
      }
      return `${MONTHS_SHORT[sun.getMonth()]} ${sun.getDate()} – ${MONTHS_SHORT[sat.getMonth()]} ${sat.getDate()}, ${sat.getFullYear()}`;
    }
    return anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [view, anchor]);

  // For week view: group events by day
  const weekDays = useMemo(() => view === "week" ? getWeekDays(anchor) : [], [view, anchor]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (view === "week") {
      for (const day of weekDays) {
        map.set(dateKey(day), eventsForDay(events, day));
      }
    } else if (view === "day") {
      map.set(dateKey(anchor), eventsForDay(events, anchor));
    }
    return map;
  }, [view, events, weekDays, anchor]);

  function handleDayClick(day: Date) {
    setAnchor(new Date(day));
    setView("day");
    setSelectedEvent(null);
  }

  function handleSlotClick(day: Date, hour: number) {
    setAddEventTime({ day, hour });
    setShowAddEvent(true);
  }

  return (
    <AppLayout>
      <div className="flex h-[100dvh] flex-col overflow-hidden">

        {/* ── Not-connected / error banner ────────────────────────────────── */}
        {(notConnected || permDenied || apiNotEnabled) && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
            <CalendarDays className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 flex-1 min-w-0">
              {apiNotEnabled
                ? "Google Calendar API is not enabled in your Google Cloud project. Enable it at console.cloud.google.com → APIs & Services → Google Calendar API."
                : notConnected
                  ? "Connect your Google account to see real events on this calendar."
                  : "Calendar access was not granted. Click Reconnect and make sure to approve Calendar access."}
            </p>
            {!apiNotEnabled && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => { window.location.href = "/api/auth/google/start"; }}
              >
                {notConnected ? "Connect Google" : "Reconnect"}
              </Button>
            )}
            {apiNotEnabled && (
              <a
                href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-amber-800 underline underline-offset-2 whitespace-nowrap hover:opacity-70 shrink-0"
              >
                Enable API →
              </a>
            )}
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 md:px-5 py-2.5 border-b shrink-0 gap-2 bg-background">
          {/* Navigation */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => navigate(1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <h1 className="ml-1 text-sm md:text-base font-semibold">{headerLabel}</h1>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>Today</Button>

            {/* View switcher */}
            <div className="hidden sm:flex h-8 rounded-lg border bg-muted/40 p-0.5 gap-0.5">
              {(["month", "week", "day"] as CalendarView[]).map(v => (
                <button key={v} onClick={() => { setView(v); setSelectedEvent(null); }}
                  className={`px-2.5 text-xs font-medium rounded-md transition-colors capitalize
                    ${view === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v}
                </button>
              ))}
            </div>

            <Button size="sm" className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => { setAddEventTime(null); setShowAddEvent(true); }}>
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New event</span>
            </Button>
          </div>
        </div>

        {/* Mobile view switcher */}
        <div className="flex sm:hidden border-b shrink-0 bg-muted/20">
          {(["month", "week", "day"] as CalendarView[]).map(v => (
            <button key={v} onClick={() => { setView(v); setSelectedEvent(null); }}
              className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors
                ${view === v ? "text-foreground border-b-2 border-foreground bg-background" : "text-muted-foreground"}`}>
              {v}
            </button>
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div ref={swipeRef} className="flex flex-1 overflow-hidden">
          {/* Main calendar area */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {isLoading && (view === "week" || view === "day") ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="space-y-3 w-full max-w-sm px-8">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              </div>
            ) : view === "month" ? (
              <MonthView anchor={anchor} events={events} onDayClick={handleDayClick} onEventClick={setSelectedEvent} />
            ) : view === "week" ? (
              <TimeGrid days={weekDays} eventsByDay={eventsByDay} onEventClick={setSelectedEvent} onSlotClick={handleSlotClick} />
            ) : (
              <TimeGrid days={[anchor]} eventsByDay={eventsByDay} onEventClick={setSelectedEvent} onSlotClick={handleSlotClick} />
            )}
          </div>

          {/* ── Event detail panel (desktop) ──────────────────────────── */}
          {selectedEvent && (
            <div className="hidden md:flex flex-col w-72 border-l shrink-0 overflow-hidden">
              <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            </div>
          )}

          {/* ── Day schedule sidebar (desktop, month view, no event selected) ── */}
          {!selectedEvent && view === "month" && (
            <div className="hidden md:flex flex-col w-64 border-l shrink-0 overflow-hidden bg-background">
              <div className="px-4 py-3 border-b shrink-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              </div>
              <ScrollArea className="flex-1">
                {(() => {
                  const todayEvts = eventsForDay(events, today);
                  if (!todayEvts.length) return (
                    <div className="p-5 text-center">
                      <CalendarDays className="w-7 h-7 mx-auto text-muted-foreground/25 mb-2" />
                      <p className="text-xs text-muted-foreground">No events today</p>
                    </div>
                  );
                  return (
                    <div className="p-3 space-y-2">
                      {todayEvts.map(evt => {
                        const past = isPastEvent(evt);
                        return (
                          <button key={evt.id} onClick={() => setSelectedEvent(evt)}
                            className={`w-full text-left rounded-xl border p-3 transition-colors ${past ? "hover:bg-muted/20 opacity-50" : "hover:bg-muted/40"}`}>
                            <p className={`text-xs font-medium leading-snug truncate ${past ? "text-muted-foreground" : ""}`}>{evt.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTimeRange(evt.start, evt.end, evt.isAllDay)}
                            </p>
                            {evt.location && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{evt.location}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </ScrollArea>
            </div>
          )}
        </div>

        {/* ── Mobile event detail sheet ───────────────────────────────── */}
        {selectedEvent && (
          <div className="md:hidden fixed inset-x-0 bottom-16 z-50 bg-background border-t shadow-xl max-h-[60dvh] overflow-hidden flex flex-col"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        )}
      </div>

      <AddEventModal
        open={showAddEvent}
        onClose={() => { setShowAddEvent(false); setAddEventTime(null); }}
        defaultDate={addEventTime?.day ?? anchor}
        defaultTime={addEventTime ? `${String(addEventTime.hour).padStart(2,"0")}:00` : undefined}
      />
    </AppLayout>
  );
}

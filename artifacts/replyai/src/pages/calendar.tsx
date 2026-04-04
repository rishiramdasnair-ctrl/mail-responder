import { useState, useMemo } from "react";
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

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── API helpers ─────────────────────────────────────────────────────────────

function monthWindow(year: number, month: number) {
  // Fetch a slightly wider window so multi-day events at boundaries show up
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59);
  return {
    start: start.toISOString(),
    end:   end.toISOString(),
  };
}

function useMonthEvents(year: number, month: number) {
  const { start, end } = monthWindow(year, month);
  return useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["calendar-month", year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/calendar/events?${params}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err: any = new Error((data as any).error || "Failed");
        err.code = (data as any).code;
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
    mutationFn: async (body: {
      title: string; start: string; end: string;
      description?: string; location?: string;
    }) => {
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
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["calendar-month"] });
    },
  });
}

// ─── Date utilities ───────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function toLocalDate(iso: string): Date {
  // If it's a date-only string (YYYY-MM-DD) parse as local to avoid UTC shift
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

function isToday(d: Date) {
  return sameDay(d, new Date());
}

function formatTime(iso: string) {
  const d = toLocalDate(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTimeRange(start: string, end: string, isAllDay: boolean) {
  if (isAllDay) return "All day";
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function buildGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const startOffset = firstDay.getDay(); // 0=Sun
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i);
    cells.push(d);
  }
  return cells;
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter(evt => {
    const start = toLocalDate(evt.start);
    if (sameDay(start, day)) return true;
    // Multi-day events
    if (evt.isAllDay && evt.end) {
      const end = toLocalDate(evt.end);
      // For all-day events, Google's end date is exclusive
      const adjustedEnd = new Date(end.getTime() - 1);
      return day >= start && day <= adjustedEnd;
    }
    return false;
  });
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function EventPill({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const isAllDay = event.isAllDay;
  return (
    <div
      className={`
        truncate rounded text-[10px] leading-none font-medium px-1.5 py-0.5
        ${isAllDay
          ? "bg-foreground text-background"
          : "bg-foreground/8 border border-border text-foreground"}
        ${compact ? "max-w-full" : ""}
      `}
      title={event.title}
    >
      {!isAllDay && (
        <span className="text-muted-foreground mr-1">{formatTime(event.start)}</span>
      )}
      {event.title}
    </div>
  );
}

function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const startD = toLocalDate(event.start);
  const dateStr = startD.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 p-5 pb-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold leading-snug">{event.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {/* Time */}
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{formatTimeRange(event.start, event.end, event.isAllDay)}</span>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-px" />
              <span className="text-foreground leading-snug">{event.location}</span>
            </div>
          )}

          {/* Attendees */}
          {event.attendees.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Users className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                {event.attendees.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center text-[9px] font-semibold uppercase shrink-0">
                      {(a.name || a.email).charAt(0)}
                    </div>
                    <div className="min-w-0">
                      {a.name && <p className="text-xs font-medium leading-none">{a.name}</p>}
                      <p className="text-[11px] text-muted-foreground truncate">{a.email}</p>
                    </div>
                    {a.responseStatus === "accepted" && (
                      <span className="ml-auto text-[10px] text-green-600 font-medium shrink-0">✓</span>
                    )}
                    {a.responseStatus === "declined" && (
                      <span className="ml-auto text-[10px] text-red-500 font-medium shrink-0">✕</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap border-t pt-3 mt-3">
              {event.description}
            </div>
          )}

          {/* Open in Google Calendar */}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Google Calendar
            </a>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function AddEventModal({
  open, onClose, defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate?: Date;
}) {
  const { toast } = useToast();
  const create = useCreateEvent();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ? defaultDate.toISOString().slice(0, 10) : "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);

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
      await create.mutateAsync({
        title,
        start: startISO,
        end: endISO,
        location: location || undefined,
        description: description || undefined,
      });
      toast({ title: "Event created" });
      reset();
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to create event", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              autoFocus
              placeholder="Event title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={e => setAllDay(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="allDay" className="cursor-pointer text-sm">All-day event</Label>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
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
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [selectedDay, setSelectedDay] = useState<Date | null>(today);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const { data, isLoading, error } = useMonthEvents(year, month);
  const events = data?.events ?? [];

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const dayEvents = useMemo(
    () => selectedDay ? eventsForDay(events, selectedDay) : [],
    [events, selectedDay],
  );

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedEvent(null);
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedEvent(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDay(today);
    setSelectedEvent(null);
  }

  const notConnected = (error as any)?.code === "NOT_CONNECTED";
  const permDenied   = (error as any)?.code === "PERMISSION_DENIED";

  const selectedDayLabel = selectedDay
    ? selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;

  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-0px)] flex-col overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b shrink-0 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-base font-semibold w-40 text-center">
              {MONTHS[month - 1]} {year}
            </h1>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>
              Today
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => setShowAddEvent(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New event</span>
            </Button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        {notConnected || permDenied ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4 max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                <CalendarDays className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-base mb-1">
                  {notConnected ? "Calendar not connected" : "Calendar access not granted"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {notConnected
                    ? "Connect your Google account to see and manage your calendar events."
                    : "We need calendar permissions. Please reconnect your Google account in Settings."}
                </p>
              </div>
              <Button size="sm" onClick={() => window.location.href = "/settings"}>
                Go to Settings
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">

            {/* ── Monthly grid ─────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 border-b shrink-0">
                {WEEKDAYS.map(d => (
                  <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="flex-1 overflow-auto">
                {isLoading ? (
                  <div className="grid grid-cols-7 h-full">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <div key={i} className="border-b border-r p-2">
                        <Skeleton className="h-4 w-6 rounded mb-1" />
                        <Skeleton className="h-3 w-full rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-7"
                    style={{ gridTemplateRows: `repeat(${grid.length / 7}, minmax(80px, 1fr))` }}
                  >
                    {grid.map((day, i) => {
                      const isCurrentMonth = day.getMonth() + 1 === month;
                      const todayFlag     = isToday(day);
                      const selected      = selectedDay && sameDay(day, selectedDay);
                      const dayEvts       = eventsForDay(events, day);
                      const overflow      = dayEvts.length > 2;

                      return (
                        <button
                          key={i}
                          onClick={() => { setSelectedDay(day); setSelectedEvent(null); }}
                          className={`
                            relative border-b border-r text-left p-1.5 md:p-2 flex flex-col gap-0.5 min-h-[80px]
                            transition-colors group
                            ${selected
                              ? "bg-foreground/5 ring-1 ring-inset ring-foreground/20"
                              : "hover:bg-muted/40"}
                            ${!isCurrentMonth ? "opacity-40" : ""}
                          `}
                        >
                          {/* Day number */}
                          <span
                            className={`
                              inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full shrink-0
                              ${todayFlag
                                ? "bg-foreground text-background"
                                : selected
                                  ? "text-foreground"
                                  : "text-foreground/80"}
                            `}
                          >
                            {day.getDate()}
                          </span>

                          {/* Event pills */}
                          <div className="flex flex-col gap-0.5 w-full overflow-hidden">
                            {dayEvts.slice(0, 2).map(evt => (
                              <EventPill key={evt.id} event={evt} compact />
                            ))}
                            {overflow && (
                              <span className="text-[10px] text-muted-foreground pl-1">
                                +{dayEvts.length - 2} more
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Day detail panel (desktop) ────────────────────────────── */}
            <div className="hidden md:flex flex-col w-72 border-l shrink-0 overflow-hidden">
              {selectedEvent ? (
                <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
              ) : (
                <>
                  <div className="px-4 py-3 border-b shrink-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {selectedDayLabel ?? "Select a day"}
                    </p>
                    {selectedDay && isToday(selectedDay) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">Today</p>
                    )}
                  </div>

                  <ScrollArea className="flex-1">
                    {dayEvents.length === 0 ? (
                      <div className="p-6 text-center">
                        <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">No events</p>
                        <button
                          onClick={() => setShowAddEvent(true)}
                          className="mt-3 text-xs text-foreground underline underline-offset-2 hover:opacity-70 transition-opacity"
                        >
                          Add one
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        {dayEvents.map(evt => (
                          <button
                            key={evt.id}
                            onClick={() => setSelectedEvent(evt)}
                            className="w-full text-left rounded-xl border p-3 hover:bg-muted/50 transition-colors group"
                          >
                            <div className="flex items-start gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${evt.isAllDay ? "bg-foreground" : "bg-foreground/40"}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-snug truncate">{evt.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {formatTimeRange(evt.start, evt.end, evt.isAllDay)}
                                </p>
                                {evt.location && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                    {evt.location}
                                  </p>
                                )}
                                {evt.attendees.length > 0 && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {evt.attendees.length} attendee{evt.attendees.length !== 1 ? "s" : ""}
                                  </p>
                                )}
                              </div>
                              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </>
              )}
            </div>

            {/* ── Day detail panel (mobile) — bottom sheet style ────────── */}
            {selectedDay && dayEvents.length > 0 && (
              <div className="md:hidden fixed bottom-16 inset-x-0 z-40 bg-background border-t shadow-lg max-h-56 overflow-auto"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                <div className="px-4 py-2 border-b flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedDayLabel}
                  </p>
                  <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  {dayEvents.map(evt => (
                    <a
                      key={evt.id}
                      href={evt.htmlLink || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-xl border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${evt.isAllDay ? "bg-foreground" : "bg-foreground/40"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{evt.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatTimeRange(evt.start, evt.end, evt.isAllDay)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add event modal */}
      <AddEventModal
        open={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        defaultDate={selectedDay ?? undefined}
      />
    </AppLayout>
  );
}

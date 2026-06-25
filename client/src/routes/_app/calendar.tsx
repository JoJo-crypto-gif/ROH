import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { calendarApi, academicApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "academic.manage");
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  
  // Get active academic year
  const { data: yearsData } = useQuery({
    queryKey: ["academic-years"],
    queryFn: academicApi.getYears,
  });
  
  const activeYear = yearsData?.years?.find(y => y.active);
  const selectedYear = yearsData?.years?.find(y => y.id === selectedYearId) || activeYear;

  // Get events
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ["calendar-events", selectedYear?.id],
    queryFn: () => calendarApi.getEvents(selectedYear?.id),
    enabled: !!selectedYear?.id,
  });

  const events = eventsData?.events || [];
  const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState("EVENT");

  const createMutation = useMutation({
    mutationFn: (data: any) => calendarApi.createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Event created successfully");
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create event"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => calendarApi.updateEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Event updated successfully");
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update event"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => calendarApi.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Event deleted");
      setModalOpen(false);
    },
  });

  const minMonth = selectedYear ? startOfMonth(new Date(selectedYear.startDate)) : null;
  const maxMonth = selectedYear ? startOfMonth(new Date(selectedYear.endDate)) : null;

  const canGoPrev = minMonth ? currentDate > minMonth : true;
  const canGoNext = maxMonth ? currentDate < maxMonth : true;
  const canGoToday = minMonth && maxMonth ? (new Date() >= minMonth && new Date() <= endOfMonth(maxMonth)) : true;

  const handleNextMonth = () => { if (canGoNext) setCurrentDate(addMonths(currentDate, 1)); };
  const handlePrevMonth = () => { if (canGoPrev) setCurrentDate(subMonths(currentDate, 1)); };
  const handleToday = () => { if (canGoToday) setCurrentDate(new Date()); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYear) return toast.error("No academic year selected");
    if (new Date(endDate) < new Date(startDate)) return toast.error("End date must be after or equal to start date");

    const payload = { title, description: description || null, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), type, academicYearId: selectedYear.id };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openNewEvent = (date?: Date) => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setType("EVENT");
    if (date) {
      setStartDate(format(date, "yyyy-MM-dd"));
      setEndDate(format(date, "yyyy-MM-dd"));
    } else {
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      setEndDate(format(new Date(), "yyyy-MM-dd"));
    }
    setModalOpen(true);
  };

  const openEditEvent = (ev: any) => {
    setEditingId(ev.id);
    setTitle(ev.title);
    setDescription(ev.description || "");
    setType(ev.type);
    setStartDate(format(new Date(ev.startDate), "yyyy-MM-dd"));
    setEndDate(format(new Date(ev.endDate), "yyyy-MM-dd"));
    setModalOpen(true);
  };

  // Calendar Grid Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDateGrid = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const endDateGrid = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDateGrid, end: endDateGrid });
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const getTypeStyles = (evtType: string) => {
    switch (evtType) {
      case "HOLIDAY": return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20";
      case "EXAM": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20";
      case "ACTIVITY": return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
      default: return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Academic Calendar</h2>
          <p className="text-muted-foreground">Manage and view school events and schedules.</p>
        </div>
        {canManage && (
          <Button onClick={() => openNewEvent()} className="shrink-0 gap-1.5 cursor-pointer">
            <Plus className="h-4 w-4" /> Add Event
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden flex flex-col">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold w-48">{format(currentDate, "MMMM yyyy")}</h3>
            <div className="flex items-center rounded-md border border-input bg-transparent">
              <Button variant="ghost" size="icon" onClick={handlePrevMonth} disabled={!canGoPrev} className="h-8 w-8 rounded-none border-r border-input cursor-pointer hover:bg-muted disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={handleToday} disabled={!canGoToday} className="h-8 px-3 rounded-none text-xs font-medium cursor-pointer hover:bg-muted disabled:opacity-50">
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNextMonth} disabled={!canGoNext} className="h-8 w-8 rounded-none border-l border-input cursor-pointer hover:bg-muted disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {yearsData?.years && yearsData.years.length > 0 && (
            <select
              value={selectedYear?.id || ""}
              onChange={(e) => {
                const newYearId = e.target.value;
                setSelectedYearId(newYearId);
                const newlySelected = yearsData.years.find(y => y.id === newYearId);
                if (newlySelected) {
                  setCurrentDate(new Date(newlySelected.startDate));
                }
              }}
              className="text-xs font-medium bg-muted/30 border border-border rounded-md px-2 py-1 outline-none cursor-pointer"
            >
              {yearsData.years.map(y => (
                <option key={y.id} value={y.id}>{y.name}{y.active ? " (Active)" : ""}</option>
              ))}
            </select>
          )}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1">
          <div className="grid grid-cols-7 border-b border-border bg-muted/20">
            {weekDays.map((day) => (
              <div key={day} className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr min-h-[600px] bg-border gap-px">
            {days.map((day, idx) => {
              const dayEvents = events.filter((e) => {
                const s = new Date(e.startDate);
                const end = new Date(e.endDate);
                s.setHours(0,0,0,0);
                end.setHours(23,59,59,999);
                return day >= s && day <= end;
              });

              return (
                <div
                  key={day.toString()}
                  className={cn(
                    "min-h-[120px] bg-card p-2 transition-colors relative group",
                    !isSameMonth(day, monthStart) && "bg-muted/10 text-muted-foreground/50",
                    canManage && "hover:bg-muted/30 cursor-pointer"
                  )}
                  onClick={(e) => {
                    if (e.target === e.currentTarget && canManage) openNewEvent(day);
                  }}
                >
                  <div className="flex justify-between items-start mb-1 pointer-events-none">
                    <span className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                      isToday(day) ? "bg-brand text-brand-foreground" : ""
                    )}>
                      {format(day, dateFormat)}
                    </span>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {dayEvents.map(ev => (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canManage) openEditEvent(ev);
                        }}
                        className={cn(
                          "px-2 py-1 text-xs rounded border truncate cursor-pointer transition-opacity hover:opacity-80",
                          getTypeStyles(ev.type)
                        )}
                        title={ev.title}
                      >
                        {ev.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Event List */}
      <div className="space-y-4 pt-6 mt-8">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Events in {selectedYear?.name || "Selected Year"}</h3>
          <p className="text-sm text-muted-foreground">All scheduled activities for this academic year.</p>
        </div>
        
        {sortedEvents.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
            <p className="text-sm text-muted-foreground">No events scheduled.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedEvents.map(ev => {
               const start = new Date(ev.startDate);
               const end = new Date(ev.endDate);
               const isOneDay = isSameDay(start, end);
               return (
                 <div 
                    key={ev.id} 
                    className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-[var(--shadow-card)] transition-shadow cursor-pointer group" 
                    onClick={() => canManage ? openEditEvent(ev) : undefined}
                 >
                    <div className="flex items-start justify-between mb-3">
                       <span className={cn("px-2.5 py-0.5 text-xs font-medium rounded-full border", getTypeStyles(ev.type))}>
                         {ev.type}
                       </span>
                    </div>
                    <h4 className="font-semibold text-foreground line-clamp-1 mb-1">{ev.title}</h4>
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                       <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
                       {isOneDay ? format(start, "MMMM d, yyyy") : `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`}
                    </p>
                    {ev.description && (
                       <p className="text-sm text-muted-foreground mt-auto pt-2 border-t border-border/50 line-clamp-2">
                         {ev.description}
                       </p>
                    )}
                 </div>
               );
            })}
          </div>
        )}
      </div>

      {/* Event Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Event" : "New Event"}</DialogTitle>
              <DialogDescription>Add an event to the calendar.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Event Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Mid-term Break"
                  required
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Event Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring appearance-none"
                >
                  <option value="EVENT">General Event</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="EXAM">Examination</option>
                  <option value="ACTIVITY">School Activity</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional details..."
                  className="min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              {editingId ? (
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => {
                    if (confirm("Delete this event?")) deleteMutation.mutate(editingId);
                  }}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive px-2 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              ) : <div></div>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingId ? "Save Changes" : "Create Event"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

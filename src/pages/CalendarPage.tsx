import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Calendar, dateFnsLocalizer, Event as BigCalendarEvent, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { hy, enUS, ru } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '@/hooks/useAuth';
import { useCourtCases } from '@/hooks/useCourtCases';
import { useReminders, type Reminder, type CreateReminderInput } from '@/hooks/useReminders';
import { CaseForm } from '@/components/cases/CaseForm';
import { ReminderForm } from '@/components/reminders/ReminderForm';
import { DateRemindersSheet } from '@/components/reminders/DateRemindersSheet';
import { NotificationBell } from '@/components/reminders/NotificationBell';
import { useReminderNotificationChecker } from '@/components/reminders/useReminderNotificationChecker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import {
  Loader2, Scale, Plus, ArrowLeft, Bell,
  Gavel, Clock, Target, Users, HelpCircle, LogOut,
  CalendarDays, CalendarCheck2
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useCases } from '@/hooks/useCases';

type Case = Database['public']['Tables']['cases']['Row'];
type CaseStatus = Database['public']['Enums']['case_status'];
type ReminderType = 'court_hearing' | 'deadline' | 'task' | 'meeting' | 'other';

interface CalendarEvent extends BigCalendarEvent {
  id: string;
  type: 'case' | 'reminder';
  caseData?: Case;
  reminderData?: Reminder;
}

const reminderTypeColors: Record<ReminderType, string> = {
  court_hearing: '#ef4444',
  deadline: '#f97316',
  task: '#3b82f6',
  meeting: '#22c55e',
  other: '#6b7280',
};

const CalendarPage = () => {
  const { t, i18n } = useTranslation(['calendar', 'cases', 'common', 'reminders']);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { cases, isLoading: casesLoading } = useCourtCases();
  const { createCase } = useCases();
  const {
    reminders,
    isLoading: remindersLoading,
    createReminder,
    updateReminder,
  } = useReminders();

  const [caseFormOpen, setCaseFormOpen] = useState(false);
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentView, setCurrentView] = useState<View>('month');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  useReminderNotificationChecker();

  const isLoading = casesLoading || remindersLoading;

  const getLocale = () => {
    switch (i18n.language) {
      case 'hy': return hy;
      case 'ru': return ru;
      default: return enUS;
    }
  };

  const locale = getLocale();
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { locale }),
    getDay,
    locales: { 'hy': hy, 'en': enUS, 'ru': ru },
  });

  const messages = useMemo(() => ({
    allDay: t('all_day'),
    previous: t('previous'),
    next: t('next'),
    today: t('today'),
    month: t('month'),
    week: t('week'),
    day: t('day'),
    agenda: t('agenda'),
    date: t('date'),
    time: t('time'),
    event: t('event'),
    noEventsInRange: t('no_events'),
    showMore: (total: number) => `+${total} ${t('show_more')}`,
  }), [t]);

  const events: CalendarEvent[] = useMemo(() => {
    const caseEvents: CalendarEvent[] = cases
      .filter(c => c.court_date)
      .map(c => ({
        id: c.id,
        type: 'case' as const,
        title: c.title || c.case_number || '',
        start: new Date(c.court_date!),
        end: new Date(c.court_date!),
        caseData: c,
      }));

    const reminderEvents: CalendarEvent[] = reminders
      .filter(r => r.status === 'active')
      .map(r => ({
        id: r.id,
        type: 'reminder' as const,
        title: r.title,
        start: new Date(r.event_datetime),
        end: new Date(r.event_datetime),
        reminderData: r,
      }));

    return [...caseEvents, ...reminderEvents];
  }, [cases, reminders]);

  const totalEvents = events.length;
  const upcomingEvents = events.filter(e => e.start >= new Date()).length;

  const getEventStyle = useCallback((event: CalendarEvent) => {
    if (event.type === 'case' && event.caseData) {
      const statusColors: Record<CaseStatus, string> = {
        open: '#3b82f6',
        in_progress: '#f59e0b',
        pending: '#8b5cf6',
        closed: '#10b981',
        archived: '#6b7280',
      };
      const backgroundColor = statusColors[event.caseData.status] || '#3b82f6';
      return {
        style: {
          backgroundColor,
          borderRadius: '6px',
          opacity: 0.92,
          color: 'white',
          border: 'none',
          display: 'block',
          fontWeight: '500',
          fontSize: '0.8rem',
          paddingLeft: '6px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        },
      };
    }
    if (event.type === 'reminder' && event.reminderData) {
      const backgroundColor = reminderTypeColors[event.reminderData.reminder_type] || '#6b7280';
      return {
        style: {
          backgroundColor,
          borderRadius: '6px',
          opacity: 0.88,
          color: 'white',
          border: '2px dashed rgba(255,255,255,0.5)',
          display: 'block',
          fontWeight: '500',
          fontSize: '0.8rem',
          paddingLeft: '6px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        },
      };
    }
    return {};
  }, []);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (event.type === 'case') {
      navigate(`/cases/${event.id}`);
    } else if (event.type === 'reminder' && event.reminderData) {
      setEditingReminder(event.reminderData);
      setReminderFormOpen(true);
    }
  }, [navigate]);

  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date }) => {
    setSelectedDate(slotInfo.start);
    setDateSheetOpen(true);
  }, []);

  const handleCreateCase = (data: Database['public']['Tables']['cases']['Insert']) => {
    createCase.mutate(data, {
      onSuccess: () => setCaseFormOpen(false),
    });
  };

  const handleReminderSubmit = (data: CreateReminderInput) => {
    if (editingReminder) {
      updateReminder.mutate({ id: editingReminder.id, ...data }, {
        onSuccess: () => {
          setReminderFormOpen(false);
          setEditingReminder(null);
        },
      });
    } else {
      createReminder.mutate(data, {
        onSuccess: () => setReminderFormOpen(false),
      });
    }
  };

  const handleAddReminder = () => {
    setEditingReminder(null);
    setSelectedDate(new Date());
    setReminderFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">{t('common:loading', 'Загрузка...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur-sm shadow-soft">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="rounded-xl hover:bg-muted"
              aria-label={t('common:back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                <Scale className="h-4 w-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold hidden sm:block tracking-tight">{t('common:app_name')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden md:inline text-sm text-muted-foreground truncate max-w-[140px] bg-muted px-3 py-1 rounded-lg">
              {user?.email}
            </span>
            <NotificationBell />
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => signOut()} className="rounded-xl hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">

        {/* Page title + actions */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('court_sessions')}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t('calendar:calendar')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAddReminder}
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl border-dashed hover:border-solid"
            >
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">{t('reminders:add_reminder')}</span>
            </Button>
            <Button
              onClick={() => setCaseFormOpen(true)}
              size="sm"
              className="gap-2 rounded-xl shadow-soft"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('add_session')}</span>
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: CalendarDays,
              label: t('cases:cases'),
              value: cases.filter(c => c.court_date).length,
              color: 'text-blue-500',
              bg: 'bg-blue-500/10',
            },
            {
              icon: Bell,
              label: t('reminders:reminders'),
              value: reminders.filter(r => r.status === 'active').length,
              color: 'text-orange-500',
              bg: 'bg-orange-500/10',
            },
            {
              icon: CalendarCheck2,
              label: t('calendar:today', 'Сегодня'),
              value: events.filter(e => {
                const d = e.start as Date;
                const now = new Date();
                return d.toDateString() === now.toDateString();
              }).length,
              color: 'text-primary',
              bg: 'bg-primary/10',
            },
            {
              icon: Target,
              label: 'Предстоящих',
              value: upcomingEvents,
              color: 'text-emerald-500',
              bg: 'bg-emerald-500/10',
            },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-card border rounded-2xl p-4 flex items-center gap-3 shadow-soft">
              <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Calendar card */}
        <div className="bg-card border rounded-2xl shadow-soft overflow-hidden">
          <div className="calendar-wrapper" style={{ height: 'calc(100vh - 380px)', minHeight: '520px' }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              culture={i18n.language}
              messages={messages}
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              selectable
              view={currentView}
              onView={setCurrentView}
              eventPropGetter={getEventStyle}
              popup
              className="h-full"
            />
          </div>
        </div>

        {/* Legend */}
        <div className="bg-card border rounded-2xl shadow-soft p-5 grid sm:grid-cols-2 gap-5">
          {/* Cases legend */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('cases:cases')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { color: '#3b82f6', label: t('cases:status_open') },
                { color: '#f59e0b', label: t('cases:status_in_progress') },
                { color: '#8b5cf6', label: t('cases:status_pending') },
                { color: '#10b981', label: t('cases:status_closed') },
                { color: '#6b7280', label: t('cases:status_archived') },
              ].map(({ color, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5"
                >
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reminders legend */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('reminders:reminders')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { color: '#ef4444', icon: Gavel, label: t('reminders:type_court_hearing') },
                { color: '#f97316', icon: Clock, label: t('reminders:type_deadline') },
                { color: '#3b82f6', icon: Target, label: t('reminders:type_task') },
                { color: '#22c55e', icon: Users, label: t('reminders:type_meeting') },
                { color: '#6b7280', icon: HelpCircle, label: t('reminders:type_other') },
              ].map(({ color, icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5 border border-dashed border-border"
                >
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Case Form Dialog */}
      <CaseForm
        open={caseFormOpen}
        onOpenChange={setCaseFormOpen}
        onSubmit={handleCreateCase}
        initialData={selectedDate ? {
          id: '',
          case_number: '',
          title: '',
          status: 'open',
          priority: 'medium',
          court_date: format(selectedDate, 'yyyy-MM-dd'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          description: null,
          court_name: null,
          notes: null,
          lawyer_id: null,
          client_id: null,
          case_type: 'civil',
          current_stage: 'preliminary',
          court: null,
          facts: null,
          legal_question: null,
        } as Case : null}
        isLoading={createCase.isPending}
      />

      {/* Reminder Form Dialog */}
      <ReminderForm
        open={reminderFormOpen}
        onOpenChange={(open) => {
          setReminderFormOpen(open);
          if (!open) setEditingReminder(null);
        }}
        onSubmit={handleReminderSubmit}
        initialData={editingReminder}
        initialDate={selectedDate}
        isLoading={createReminder.isPending || updateReminder.isPending}
      />

      {/* Date Reminders Sheet */}
      {selectedDate && (
        <DateRemindersSheet
          open={dateSheetOpen}
          onOpenChange={setDateSheetOpen}
          selectedDate={selectedDate}
        />
      )}

      {/* Custom Calendar Styles */}
      <style>{`
        .calendar-wrapper {
          padding: 1rem;
        }

        .calendar-wrapper .rbc-calendar {
          font-family: inherit;
        }

        .calendar-wrapper .rbc-header {
          padding: 0.6rem 0.5rem;
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground));
          border-bottom: 1px solid hsl(var(--border));
        }

        .calendar-wrapper .rbc-today {
          background-color: hsl(var(--primary) / 0.06);
        }

        .calendar-wrapper .rbc-off-range-bg {
          background-color: hsl(var(--muted) / 0.4);
        }

        .calendar-wrapper .rbc-off-range .rbc-button-link {
          color: hsl(var(--muted-foreground) / 0.5);
        }

        .calendar-wrapper .rbc-date-cell {
          padding: 4px 8px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .calendar-wrapper .rbc-date-cell.rbc-now .rbc-button-link {
          background-color: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-radius: 50%;
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }

        .calendar-wrapper .rbc-event {
          padding: 2px 6px;
          font-size: 0.78rem;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }

        .calendar-wrapper .rbc-event:hover {
          opacity: 1 !important;
          transform: translateY(-1px);
          cursor: pointer;
        }

        .calendar-wrapper .rbc-show-more {
          font-size: 0.75rem;
          color: hsl(var(--primary));
          font-weight: 600;
          padding: 1px 4px;
          border-radius: 4px;
          background: hsl(var(--primary) / 0.08);
        }

        .calendar-wrapper .rbc-toolbar {
          padding: 0 0 1rem;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }

        .calendar-wrapper .rbc-toolbar-label {
          font-size: 1rem;
          font-weight: 700;
          color: hsl(var(--foreground));
          letter-spacing: -0.01em;
        }

        .calendar-wrapper .rbc-btn-group {
          display: flex;
          gap: 2px;
        }

        .calendar-wrapper .rbc-toolbar button {
          color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border));
          background-color: hsl(var(--background));
          padding: 0.4rem 0.9rem;
          border-radius: 0.5rem;
          font-size: 0.8rem;
          font-weight: 500;
          transition: all 0.15s ease;
          cursor: pointer;
        }

        .calendar-wrapper .rbc-toolbar button:hover {
          background-color: hsl(var(--muted));
          border-color: hsl(var(--border));
        }

        .calendar-wrapper .rbc-toolbar button.rbc-active {
          background-color: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-color: hsl(var(--primary));
          box-shadow: 0 1px 4px hsl(var(--primary) / 0.3);
        }

        .calendar-wrapper .rbc-month-view {
          border: none;
          border-radius: 0;
        }

        .calendar-wrapper .rbc-month-row {
          border-color: hsl(var(--border));
        }

        .calendar-wrapper .rbc-day-bg + .rbc-day-bg,
        .calendar-wrapper .rbc-month-row + .rbc-month-row {
          border-color: hsl(var(--border));
        }

        .calendar-wrapper .rbc-time-view,
        .calendar-wrapper .rbc-agenda-view {
          border: none;
        }

        .calendar-wrapper .rbc-time-header {
          border-color: hsl(var(--border));
        }

        .calendar-wrapper .rbc-time-content {
          border-color: hsl(var(--border));
        }

        .calendar-wrapper .rbc-timeslot-group {
          border-color: hsl(var(--border) / 0.5);
        }

        .calendar-wrapper .rbc-time-slot {
          color: hsl(var(--muted-foreground));
          font-size: 0.75rem;
        }

        .calendar-wrapper .rbc-agenda-table {
          border-color: hsl(var(--border));
          font-size: 0.875rem;
        }

        .calendar-wrapper .rbc-agenda-date-cell,
        .calendar-wrapper .rbc-agenda-time-cell {
          color: hsl(var(--muted-foreground));
          font-size: 0.8rem;
        }

        @media (max-width: 640px) {
          .calendar-wrapper {
            height: calc(100vh - 440px) !important;
            min-height: 400px !important;
            padding: 0.75rem;
          }

          .calendar-wrapper .rbc-toolbar {
            font-size: 0.75rem;
          }

          .calendar-wrapper .rbc-toolbar button {
            padding: 0.3rem 0.6rem;
            font-size: 0.75rem;
          }

          .calendar-wrapper .rbc-header {
            padding: 0.25rem;
            font-size: 0.65rem;
          }

          .calendar-wrapper .rbc-event {
            font-size: 0.7rem;
            padding: 1px 3px;
          }

          .calendar-wrapper .rbc-toolbar-label {
            font-size: 0.875rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CalendarPage;

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useReminders, type CreateReminderInput } from '@/hooks/useReminders';
import { isCourtReminderDismissed, dismissCourtReminder } from '@/lib/localStorage-utils';

interface CourtDateReminderSuggestionProps {
  caseId: string;
  caseTitle: string;
  courtDate: string;
}

export function CourtDateReminderSuggestion({
  caseId,
  caseTitle,
  courtDate,
}: CourtDateReminderSuggestionProps) {
  const { t } = useTranslation('reminders');
  const [dismissed, setDismissed] = useState(false);
  const [hasReminder, setHasReminder] = useState(false);
  
  const { reminders, createReminder } = useReminders();

  // Check if a reminder already exists for this court date
  useEffect(() => {
    const courtDateTime = new Date(courtDate);
    const existing = reminders.some(
      (r) =>
        r.case_id === caseId &&
        r.reminder_type === 'court_hearing' &&
        new Date(r.event_datetime).toDateString() === courtDateTime.toDateString()
    );
    setHasReminder(existing);
  }, [reminders, caseId, courtDate]);

  // Check if dismissed using consolidated storage
  useEffect(() => {
    if (isCourtReminderDismissed(caseId, courtDate)) {
      setDismissed(true);
    }
  }, [caseId, courtDate]);

  const handleCreate = () => {
    const courtDateTime = new Date(courtDate);
    
    const data: CreateReminderInput = {
      title: caseTitle,
      description: t('type_court_hearing'),
      case_id: caseId,
      reminder_type: 'court_hearing',
      priority: 'high',
      event_datetime: courtDateTime.toISOString(),
      notify_before: [2880, 120], // 2 days and 2 hours before
    };

    createReminder.mutate(data, {
      onSuccess: () => {
        setHasReminder(true);
      },
    });
  };

  const handleDismiss = () => {
    dismissCourtReminder(caseId, courtDate);
    setDismissed(true);
  };

  // Don't show if dismissed, already has reminder, or court date is in the past
  if (dismissed || hasReminder || new Date(courtDate) < new Date()) {
    return null;
  }

  return (
    <Alert className="border-primary/50 bg-primary/5">
      <Bell className="h-4 w-4" />
      <AlertTitle>{t('court_date_suggestion')}</AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {new Date(courtDate).toLocaleDateString()}
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="w-full sm:w-auto"
            >
              {t('skip')}
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createReminder.isPending}
              className="w-full sm:w-auto"
            >
              <Bell className="h-4 w-4 mr-1 shrink-0" />
              <span className="truncate">{t('create_court_reminder')}</span>
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}

import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hy, enUS, ru } from 'date-fns/locale';
import {
  Clock,
  Calendar,
  Briefcase,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Gavel,
  Target,
  Users,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Reminder, ReminderType, ReminderPriority } from '@/hooks/useReminders';

const typeIcons: Record<ReminderType, React.ElementType> = {
  court_hearing: Gavel,
  deadline: Clock,
  task: Target,
  meeting: Users,
  other: HelpCircle,
};

const typeColors: Record<ReminderType, string> = {
  court_hearing: 'bg-red-500',
  deadline: 'bg-orange-500',
  task: 'bg-blue-500',
  meeting: 'bg-green-500',
  other: 'bg-gray-500',
};

const priorityColors: Record<ReminderPriority, string> = {
  low: 'bg-slate-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

interface ReminderListProps {
  reminders: Reminder[];
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  showDate?: boolean;
  compact?: boolean;
}

export function ReminderList({
  reminders,
  onComplete,
  onDismiss,
  onEdit,
  onDelete,
  showDate = true,
  compact = false,
}: ReminderListProps) {
  const { t, i18n } = useTranslation('reminders');

  const getLocale = () => {
    switch (i18n.language) {
      case 'hy': return hy;
      case 'ru': return ru;
      default: return enUS;
    }
  };

  if (reminders.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('no_reminders')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reminders.map((reminder) => {
        const TypeIcon = typeIcons[reminder.reminder_type];
        const isCompleted = reminder.status === 'completed';
        const isDismissed = reminder.status === 'dismissed';
        const isInactive = isCompleted || isDismissed;

        return (
          <div
            key={reminder.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border bg-card transition-all',
              isInactive && 'opacity-60',
              compact && 'p-2'
            )}
          >
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white',
                typeColors[reminder.reminder_type],
                compact && 'w-6 h-6'
              )}
            >
              <TypeIcon className={cn('h-4 w-4', compact && 'h-3 w-3')} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={cn(
                    'font-medium truncate',
                    isInactive && 'line-through',
                    compact && 'text-sm'
                  )}
                >
                  {reminder.title}
                </h4>
                <Badge
                  variant="secondary"
                  className={cn('text-white text-xs', priorityColors[reminder.priority])}
                >
                  {t(`priority_${reminder.priority}`)}
                </Badge>
                {isCompleted && (
                  <Badge variant="secondary" className="bg-green-500 text-white">
                    {t('status_completed')}
                  </Badge>
                )}
                {isDismissed && (
                  <Badge variant="secondary" className="bg-gray-500 text-white">
                    {t('status_dismissed')}
                  </Badge>
                )}
              </div>

              {reminder.description && !compact && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {reminder.description}
                </p>
              )}

              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                {showDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(reminder.event_datetime), 'PPP', {
                      locale: getLocale(),
                    })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(reminder.event_datetime), 'HH:mm')}
                </span>
                {reminder.case_id && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {t('linked_to_case')}
                  </span>
                )}
              </div>
            </div>

            {!isInactive && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                  onClick={() => onComplete(reminder.id)}
                  title={t('mark_complete')}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-600 hover:text-gray-700 hover:bg-gray-100"
                  onClick={() => onDismiss(reminder.id)}
                  title={t('dismiss')}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(reminder)}
                  title={t('edit')}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(reminder.id)}
                  title={t('delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

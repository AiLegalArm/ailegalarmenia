import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hy, enUS, ru } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ReminderList } from './ReminderList';
import { ReminderForm } from './ReminderForm';
import { useReminders, type Reminder, type CreateReminderInput } from '@/hooks/useReminders';

interface DateRemindersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
}

export function DateRemindersSheet({
  open,
  onOpenChange,
  selectedDate,
}: DateRemindersSheetProps) {
  const { t, i18n } = useTranslation('reminders');
  const [formOpen, setFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const { 
    reminders,
    createReminder,
    updateReminder,
    deleteReminder,
    completeReminder,
    dismissReminder,
  } = useReminders();

  const getLocale = () => {
    switch (i18n.language) {
      case 'hy': return hy;
      case 'ru': return ru;
      default: return enUS;
    }
  };

  // Filter reminders for selected date
  const dateReminders = reminders.filter((r) => {
    const reminderDate = new Date(r.event_datetime);
    return (
      reminderDate.getFullYear() === selectedDate.getFullYear() &&
      reminderDate.getMonth() === selectedDate.getMonth() &&
      reminderDate.getDate() === selectedDate.getDate()
    );
  });

  const handleSubmit = (data: CreateReminderInput) => {
    if (editingReminder) {
      updateReminder.mutate({ id: editingReminder.id, ...data }, {
        onSuccess: () => {
          setFormOpen(false);
          setEditingReminder(null);
        },
      });
    } else {
      createReminder.mutate(data, {
        onSuccess: () => {
          setFormOpen(false);
        },
      });
    }
  };

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setFormOpen(true);
  };

  const handleAddNew = () => {
    setEditingReminder(null);
    setFormOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center justify-between">
              <span>
                {format(selectedDate, 'PPPP', { locale: getLocale() })}
              </span>
              <Button size="sm" onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-1" />
                {t('add')}
              </Button>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4">
            <ReminderList
              reminders={dateReminders}
              onComplete={(id) => completeReminder.mutate(id)}
              onDismiss={(id) => dismissReminder.mutate(id)}
              onEdit={handleEdit}
              onDelete={(id) => deleteReminder.mutate(id)}
              showDate={false}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ReminderForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editingReminder}
        initialDate={selectedDate}
        isLoading={createReminder.isPending || updateReminder.isPending}
      />
    </>
  );
}

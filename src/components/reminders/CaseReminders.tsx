import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReminderList } from './ReminderList';
import { ReminderForm } from './ReminderForm';
import { useReminders, type Reminder, type CreateReminderInput } from '@/hooks/useReminders';

interface CaseRemindersProps {
  caseId: string;
  courtDate?: string | null;
}

export function CaseReminders({ caseId, courtDate }: CaseRemindersProps) {
  const { t } = useTranslation('reminders');
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

  // Filter reminders for this case
  const caseReminders = reminders.filter((r) => r.case_id === caseId);

  const handleSubmit = (data: CreateReminderInput) => {
    const submitData = { ...data, case_id: caseId };
    
    if (editingReminder) {
      updateReminder.mutate({ id: editingReminder.id, ...submitData }, {
        onSuccess: () => {
          setFormOpen(false);
          setEditingReminder(null);
        },
      });
    } else {
      createReminder.mutate(submitData, {
        onSuccess: () => setFormOpen(false),
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('reminders')}
          </CardTitle>
          <Button size="sm" onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-1" />
            {t('add')}
          </Button>
        </CardHeader>
        <CardContent>
          <ReminderList
            reminders={caseReminders}
            onComplete={(id) => completeReminder.mutate(id)}
            onDismiss={(id) => dismissReminder.mutate(id)}
            onEdit={handleEdit}
            onDelete={(id) => deleteReminder.mutate(id)}
            compact
          />
        </CardContent>
      </Card>

      <ReminderForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingReminder(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingReminder}
        initialDate={courtDate ? new Date(courtDate) : new Date()}
        isLoading={createReminder.isPending || updateReminder.isPending}
      />
    </>
  );
}

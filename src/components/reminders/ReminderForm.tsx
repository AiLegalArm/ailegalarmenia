import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCases } from '@/hooks/useCases';
import type { CreateReminderInput, Reminder, ReminderType, ReminderPriority } from '@/hooks/useReminders';

const reminderTypes: ReminderType[] = ['court_hearing', 'deadline', 'task', 'meeting', 'other'];
const priorities: ReminderPriority[] = ['low', 'medium', 'high', 'urgent'];
const notifyOptions = [
  { value: 15, label: '15_minutes' },
  { value: 30, label: '30_minutes' },
  { value: 60, label: '1_hour' },
  { value: 120, label: '2_hours' },
  { value: 1440, label: '1_day' },
  { value: 2880, label: '2_days' },
  { value: 10080, label: '1_week' },
];

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  case_id: z.string().optional().nullable(),
  reminder_type: z.enum(['court_hearing', 'deadline', 'task', 'meeting', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  event_date: z.date(),
  event_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  notify_before: z.array(z.number()).min(1, 'Select at least one notification time'),
});

type FormData = z.infer<typeof formSchema>;

interface ReminderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateReminderInput) => void;
  initialData?: Reminder | null;
  initialDate?: Date | null;
  isLoading?: boolean;
}

export function ReminderForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  initialDate,
  isLoading = false,
}: ReminderFormProps) {
  const { t } = useTranslation('reminders');
  const { cases } = useCases();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      case_id: null,
      reminder_type: 'task',
      priority: 'medium',
      event_date: new Date(),
      event_time: format(new Date(), 'HH:mm'),
      notify_before: [60],
    },
  });

  // Reset form when initialData or initialDate changes
  useEffect(() => {
    const targetDate = initialData
      ? new Date(initialData.event_datetime)
      : initialDate || new Date();

    form.reset({
      title: initialData?.title || '',
      description: initialData?.description || '',
      case_id: initialData?.case_id || null,
      reminder_type: initialData?.reminder_type || 'task',
      priority: initialData?.priority || 'medium',
      event_date: targetDate,
      event_time: format(targetDate, 'HH:mm'),
      notify_before: initialData?.notify_before || [60],
    });
  }, [initialData, initialDate, form]);

  const handleSubmit = (data: FormData) => {
    const datetime = new Date(data.event_date);
    const [hours, minutes] = data.event_time.split(':').map(Number);
    datetime.setHours(hours, minutes, 0, 0);

    onSubmit({
      title: data.title,
      description: data.description || undefined,
      case_id: data.case_id || null,
      reminder_type: data.reminder_type,
      priority: data.priority,
      event_datetime: datetime.toISOString(),
      notify_before: data.notify_before,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? t('edit_reminder') : t('add_reminder')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('title')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('title_placeholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('description_placeholder')}
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reminder_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('type')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_type')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reminderTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`type_${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('priority')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_priority')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priorities.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {t(`priority_${priority}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="case_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('linked_case')}</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === 'none' ? null : value)} 
                    value={field.value || 'none'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_case')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">{t('no_case')}</SelectItem>
                      {cases?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.case_number} - {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="event_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t('date')}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>{t('pick_date')}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="event_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('time')}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notify_before"
              render={() => (
                <FormItem>
                  <FormLabel>{t('notify_before')}</FormLabel>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {notifyOptions.map((option) => (
                      <FormField
                        key={option.value}
                        control={form.control}
                        name="notify_before"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(option.value)}
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  if (checked) {
                                    field.onChange([...current, option.value]);
                                  } else {
                                    field.onChange(
                                      current.filter((v: number) => v !== option.value)
                                    );
                                  }
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {t(option.label)}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? t('save') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

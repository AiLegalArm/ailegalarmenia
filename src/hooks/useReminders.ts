import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export type ReminderType = 'court_hearing' | 'deadline' | 'task' | 'meeting' | 'other';
export type ReminderStatus = 'active' | 'completed' | 'dismissed';
export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Reminder {
  id: string;
  user_id: string;
  case_id: string | null;
  title: string;
  description: string | null;
  reminder_type: ReminderType;
  priority: ReminderPriority;
  event_datetime: string;
  notify_before: number[];
  status: ReminderStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateReminderInput {
  title: string;
  description?: string;
  case_id?: string | null;
  reminder_type: ReminderType;
  priority: ReminderPriority;
  event_datetime: string;
  notify_before: number[];
}

export interface UpdateReminderInput extends Partial<CreateReminderInput> {
  status?: ReminderStatus;
}

export function useReminders(dateRange?: { start: Date; end: Date }) {
  const { user } = useAuth();
  const { t } = useTranslation('reminders');
  const queryClient = useQueryClient();

  const { data: reminders = [], isLoading, error } = useQuery({
    queryKey: ['reminders', user?.id, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('reminders')
        .select('*')
        .eq('user_id', user.id)
        .order('event_datetime', { ascending: true });

      if (dateRange) {
        query = query
          .gte('event_datetime', dateRange.start.toISOString())
          .lte('event_datetime', dateRange.end.toISOString());
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as Reminder[];
    },
    enabled: !!user,
  });

  const createReminder = useMutation({
    mutationFn: async (input: CreateReminderInput) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('reminders')
        .insert({
          ...input,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(t('reminder_created'));
    },
    onError: (error) => {
      console.error('Error creating reminder:', error);
      toast.error(t('reminder_create_error'));
    },
  });

  const updateReminder = useMutation({
    mutationFn: async ({ id, ...input }: UpdateReminderInput & { id: string }) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('reminders')
        .update(input)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(t('reminder_updated'));
    },
    onError: (error) => {
      console.error('Error updating reminder:', error);
      toast.error(t('reminder_update_error'));
    },
  });

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(t('reminder_deleted'));
    },
    onError: (error) => {
      console.error('Error deleting reminder:', error);
      toast.error(t('reminder_delete_error'));
    },
  });

  const completeReminder = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('reminders')
        .update({ status: 'completed' as ReminderStatus })
        .eq('id', id)
        .eq('user_id', user.id) // IDOR protection: only update own reminders
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(t('reminder_completed'));
    },
    onError: (error) => {
      console.error('Error completing reminder:', error);
      toast.error(t('reminder_update_error'));
    },
  });

  const dismissReminder = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('reminders')
        .update({ status: 'dismissed' as ReminderStatus })
        .eq('id', id)
        .eq('user_id', user.id) // IDOR protection: only update own reminders
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(t('reminder_dismissed'));
    },
    onError: (error) => {
      console.error('Error dismissing reminder:', error);
      toast.error(t('reminder_update_error'));
    },
  });

  // Get reminders for a specific date
  const getRemindersForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return reminders.filter(r => r.event_datetime.startsWith(dateStr));
  };

  // Get reminders for a specific case
  const getRemindersForCase = (caseId: string) => {
    return reminders.filter(r => r.case_id === caseId);
  };

  return {
    reminders,
    isLoading,
    error,
    createReminder,
    updateReminder,
    deleteReminder,
    completeReminder,
    dismissReminder,
    getRemindersForDate,
    getRemindersForCase,
  };
}

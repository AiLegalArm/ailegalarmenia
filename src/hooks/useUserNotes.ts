import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface UserNote {
  id: string;
  user_id: string;
  title: string;
  content_html: string;
  content_text: string;
  created_at: string;
  updated_at: string;
}

export function useUserNotes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['user-notes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as UserNote[];
    },
    enabled: !!user,
  });

  const createNote = useMutation({
    mutationFn: async (note: { title: string; content_html: string; content_text: string }) => {
      const { data, error } = await supabase
        .from('user_notes')
        .insert({ ...note, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notes'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; content_html?: string; content_text?: string }) => {
      const { error } = await supabase
        .from('user_notes')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notes'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_notes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notes'] });
    },
    onError: (e) => toast.error(e.message),
  });

  return { notes, isLoading, createNote, updateNote, deleteNote };
}

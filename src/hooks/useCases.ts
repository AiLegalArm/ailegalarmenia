import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';

type Case = Database['public']['Tables']['cases']['Row'];
type CaseInsert = Database['public']['Tables']['cases']['Insert'];
type CaseUpdate = Database['public']['Tables']['cases']['Update'];
type CaseStatus = Database['public']['Enums']['case_status'];
type CasePriority = Database['public']['Enums']['case_priority'];

export interface CaseFilters {
  status?: CaseStatus | 'all';
  priority?: CasePriority | 'all';
  search?: string;
  sortBy?: 'newest' | 'oldest' | 'priority';
}

// Escape special LIKE characters to prevent search manipulation
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

export function useCases(filters: CaseFilters = {}) {
  const { toast } = useToast();
  const { t } = useTranslation('cases');
  const queryClient = useQueryClient();

  const { data: cases, isLoading, error } = useQuery({
    queryKey: ['cases', filters],
    queryFn: async () => {
      let query = supabase
        .from('cases')
        .select('*')
        .is('deleted_at', null);

      // Apply status filter
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      // Apply priority filter
      if (filters.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }

      // Apply search filter with escaped special characters
      if (filters.search) {
        const escapedSearch = escapeLikePattern(filters.search);
        query = query.or(`title.ilike.%${escapedSearch}%,case_number.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%`);
      }

      // Apply sorting
      switch (filters.sortBy) {
        case 'oldest':
          query = query.order('created_at', { ascending: true });
          break;
        case 'priority':
          query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });
          break;
        case 'newest':
        default:
          query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Case[];
    },
  });

  const createCase = useMutation({
    mutationFn: async (newCase: CaseInsert) => {
      // Try insert; on duplicate case_number, auto-append suffix
      let attempt = 0;
      let caseToInsert = { ...newCase };
      const maxAttempts = 10;

      while (attempt < maxAttempts) {
        const { data, error } = await supabase
          .from('cases')
          .insert(caseToInsert)
          .select()
          .single();

        if (!error) return data as Case;

        if (error.message?.includes('cases_case_number_active_key') && attempt < maxAttempts - 1) {
          attempt++;
          caseToInsert = {
            ...newCase,
            case_number: `${newCase.case_number}-${attempt}`,
          };
          continue;
        }

        throw error;
      }
      throw new Error('Max attempts reached for case_number uniqueness');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast({
        title: t('case_created'),
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCase = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CaseUpdate }) => {
      const { data, error } = await supabase
        .from('cases')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast({
        title: t('case_updated'),
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteCase = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete via backend RPC (avoids RLS edge-cases on direct UPDATE)
      const { error } = await supabase.rpc('soft_delete_case', { p_case_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast({
        title: t('case_deleted'),
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    cases: cases || [],
    isLoading,
    error,
    createCase,
    updateCase,
    deleteCase,
  };
}

export function useCase(id: string | undefined) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return data as Case;
    },
    enabled: !!id,
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type KbCategory = Database['public']['Enums']['kb_category'];

export interface CategoryCount {
  category: KbCategory;
  count: number;
}

export function useKBCategoryCounts() {
  return useQuery({
    queryKey: ['kb-category-counts'],
    queryFn: async () => {
      // Use a raw count query per category to avoid the 1000-row limit
      // Fetch all rows but only the category column, paginating to get everything
      const counts = new Map<string, number>();
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('knowledge_base')
          .select('category', { count: 'exact', head: false })
          .eq('is_active', true)
          .range(from, from + pageSize - 1);

        if (error) throw error;

        for (const row of data || []) {
          const cat = row.category || 'other';
          counts.set(cat, (counts.get(cat) || 0) + 1);
        }

        if (!data || data.length < pageSize) {
          hasMore = false;
        } else {
          from += pageSize;
        }
      }

      return counts;
    },
  });
}

export function useKBCategoryDocuments(category: KbCategory | null) {
  return useQuery({
    queryKey: ['kb-category-docs', category],
    queryFn: async () => {
      if (!category) return [];

      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('is_active', true)
        .eq('category', category)
        .order('title', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!category,
  });
}

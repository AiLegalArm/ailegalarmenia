import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];
type KnowledgeBaseInsert = Database['public']['Tables']['knowledge_base']['Insert'];
type KnowledgeBaseUpdate = Database['public']['Tables']['knowledge_base']['Update'];
type KbCategory = Database['public']['Enums']['kb_category'];

export interface KBFilters {
  search?: string;
  category?: KbCategory | 'all';
  page?: number;
  pageSize?: number;
}

export interface KBSearchResult {
  id: string;
  title: string;
  content_text: string;
  category: KbCategory;
  source_name: string | null;
  version_date: string | null;
  rank: number | null;
  relevancePct?: number;
}

export interface KBChunkSearchResult {
  id: string;
  title: string;
  category: string;
  source_name: string | null;
  article_number: string | null;
  source_url: string | null;
  max_score: number;
  relevancePct: number;
  content_text: string; // first chunk excerpt as fallback
  chunks: Array<{
    doc_id: string;
    chunk_index: number;
    chunk_type: string;
    label: string | null;
    char_start: number;
    excerpt: string;
    full_text: string | null;
    score: number;
  }>;
}

export function useKnowledgeBase(filters: KBFilters = {}) {
  const { toast } = useToast();
  const { t } = useTranslation('kb');
  const queryClient = useQueryClient();

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const offset = (page - 1) * pageSize;

  // Chunk-level search + fallback direct search
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['kb-search', filters.search, filters.category],
    queryFn: async () => {
      if (!filters.search || filters.search.length < 2) return null;

      // Run chunk search and direct table search in parallel
      const chunkSearchPromise = supabase
        .rpc('search_kb_chunks', {
          p_query: filters.search,
          p_category: filters.category && filters.category !== 'all' ? filters.category : null,
          p_limit_chunks: 50,
          p_limit_docs: 10,
          p_chunks_per_doc: 3,
        })
        .then(res => res, () => ({ data: null, error: { message: 'chunk search failed' } }));

      // Direct ILIKE search on knowledge_base table (catches docs without chunks)
      const searchTerm = `%${filters.search}%`;
      let directQuery = supabase
        .from('knowledge_base')
        .select('id, title, content_text, category, source_name, source_url, article_number, version_date')
        .eq('is_active', true)
        .or(`title.ilike.${searchTerm},content_text.ilike.${searchTerm}`)
        .limit(20);

      if (filters.category && filters.category !== 'all') {
        directQuery = directQuery.eq('category', filters.category);
      }

      const directSearchPromise = directQuery.then(
        res => res,
        () => ({ data: null, error: { message: 'direct search failed' } })
      );

      const [chunkResult, directResult] = await Promise.all([chunkSearchPromise, directSearchPromise]);

      // Parse chunk results
      const chunkDocs: KBChunkSearchResult[] = [];
      if (chunkResult.data) {
        const parsed = chunkResult.data as unknown as {
          documents: Array<{
            id: string; title: string; category: string;
            source_name: string | null; article_number: string | null;
            source_url: string | null; max_score: number;
          }>;
          chunks: Array<{
            doc_id: string; chunk_index: number; chunk_type: string;
            label: string | null; char_start: number; excerpt: string;
            full_text: string | null; score: number;
          }>;
        };

        const chunksByDoc = new Map<string, typeof parsed.chunks>();
        for (const chunk of parsed.chunks || []) {
          const arr = chunksByDoc.get(chunk.doc_id) || [];
          arr.push(chunk);
          chunksByDoc.set(chunk.doc_id, arr);
        }

        const docs = parsed.documents || [];
        const globalMax = docs.reduce((mx, d) => Math.max(mx, Number(d.max_score) || 0), 0);

        for (const doc of docs) {
          const raw = Number(doc.max_score) || 0;
          const relevancePct = globalMax > 0 ? Math.round((raw / globalMax) * 100) : 100;
          const docChunks = chunksByDoc.get(doc.id) || [];
          const excerpt = docChunks[0]?.excerpt || '';
          chunkDocs.push({
            ...doc,
            relevancePct,
            content_text: excerpt.substring(0, 500),
            chunks: docChunks,
          });
        }
      }

      // Merge direct results (for docs not found via chunks)
      const seenIds = new Set(chunkDocs.map(d => d.id));
      if (directResult.data && Array.isArray(directResult.data)) {
        for (const row of directResult.data) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);
          chunkDocs.push({
            id: row.id,
            title: row.title,
            category: row.category,
            source_name: row.source_name,
            article_number: row.article_number,
            source_url: row.source_url,
            max_score: 0,
            relevancePct: 80, // direct match is relevant
            content_text: (row.content_text || '').substring(0, 500),
            chunks: [],
          });
        }
      }

      const q = (filters.search || '').trim();
      const isArticleQuery = /^(?:\u0540\u0578\u0564\u057E\u0561\u056E|\u0540\u0578\u0564\.?|\u0421\u0442\u0430\u0442\u044C\u044F|\u0441\u0442\.?|Article|Art\.?)\s*\d+/i.test(q);

      return chunkDocs.filter((doc) => {
        if (isArticleQuery) return true;
        return doc.relevancePct >= 50;
      });
    },
    enabled: !!filters.search && filters.search.length >= 2,
  });

  // List all documents with pagination
  const { data: listData, isLoading: isListing } = useQuery({
    queryKey: ['kb-list', filters.category, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_base')
        .select('id, title, content_text, category, source_url, source_name, version_date, article_number, uploaded_by, is_active, created_at, updated_at, current_version, embedding_status, content_hash', { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      return {
        items: data as KnowledgeBase[],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled: !filters.search || filters.search.length < 2,
  });

  // Create document (admin only)
  const createDocument = useMutation({
    mutationFn: async (doc: KnowledgeBaseInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('knowledge_base')
        .insert({
          ...doc,
          uploaded_by: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-search'] });
      toast({ title: t('document_uploaded') });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update document (admin only)
  const updateDocument = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: KnowledgeBaseUpdate }) => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-search'] });
      queryClient.invalidateQueries({ queryKey: ['kb-document'] });
      toast({ title: t('document_updated') });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Soft delete (deactivate) document (admin only)
  const deleteDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('knowledge_base')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-search'] });
      toast({ title: t('document_deleted') });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const isLoading = isSearching || isListing;
  const documents = filters.search && filters.search.length >= 2 
    ? searchResults || [] 
    : listData?.items || [];
  const pagination = listData ? {
    page: listData.page,
    pageSize: listData.pageSize,
    total: listData.total,
    totalPages: listData.totalPages,
  } : null;

  return {
    documents,
    pagination,
    isLoading,
    createDocument,
    updateDocument,
    deleteDocument,
  };
}

// Get single document
export function useKBDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['kb-document', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as KnowledgeBase;
    },
    enabled: !!id,
  });
}

// Get version history for a document
export function useKBVersions(kbId: string | undefined) {
  return useQuery({
    queryKey: ['kb-versions', kbId],
    queryFn: async () => {
      if (!kbId) return [];
      const { data, error } = await supabase
        .from('kb_versions')
        .select('*')
        .eq('kb_id', kbId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!kbId,
  });
}

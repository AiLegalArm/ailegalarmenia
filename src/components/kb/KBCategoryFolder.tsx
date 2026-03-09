import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { KBDocumentCard } from '@/components/kb/KBDocumentCard';
import { Folder, FolderOpen, ChevronRight, Loader2 } from 'lucide-react';

type KbCategory = Database['public']['Enums']['kb_category'];
type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];

interface Props {
  categoryKey: KbCategory;
  count: number;
  isAdmin: boolean;
  onEdit?: (doc: KnowledgeBase) => void;
  onDelete?: (id: string) => void;
}

export const KBCategoryFolder = ({ categoryKey, count, isAdmin, onEdit, onDelete }: Props) => {
  const { t } = useTranslation('kb');
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ['kb-category-docs', categoryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('is_active', true)
        .eq('category', categoryKey)
        .order('title', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const folderLabel = t(`category_${categoryKey}`, categoryKey);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          {isOpen ? (
            <FolderOpen className="h-5 w-5 text-primary" />
          ) : (
            <Folder className="h-5 w-5 text-primary" />
          )}
          <span className="flex-1 font-medium">{folderLabel}</span>
          <span className="text-sm text-muted-foreground">{count}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-2 grid gap-4 pl-6 sm:grid-cols-2 lg:grid-cols-3">
            {(docs || []).map((doc) => (
              <KBDocumentCard
                key={doc.id}
                document={doc}
                onView={(id) => navigate(`/kb/${id}`)}
                onEdit={isAdmin ? (id) => {
                  const docToEdit = docs?.find((d) => d.id === id);
                  if (docToEdit) onEdit?.(docToEdit);
                } : undefined}
                onDelete={isAdmin ? (id) => onDelete?.(id) : undefined}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

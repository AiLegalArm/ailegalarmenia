import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StickyNote, Save, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FileNotesProps {
  fileId: string;
  caseId: string;
  currentNotes: string | null;
}

export function FileNotes({ fileId, caseId, currentNotes }: FileNotesProps) {
  const { t } = useTranslation(['cases', 'common']);
  const [notes, setNotes] = useState(currentNotes || '');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const saveNotes = useMutation({
    mutationFn: async (newNotes: string) => {
      const { error } = await supabase
        .from('case_files')
        .update({ notes: newNotes || null })
        .eq('id', fileId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-files', caseId] });
      toast.success(t('cases:file_notes_saved', 'Notes saved'));
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSave = () => {
    saveNotes.mutate(notes);
  };

  const hasNotes = !!currentNotes?.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${hasNotes ? 'text-amber-500' : ''}`}
          title={t('cases:file_notes', 'Notes')}
        >
          <StickyNote className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              {t('cases:file_notes', 'Notes')}
            </h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('cases:file_notes_placeholder', 'What needs to be done with this file...')}
            rows={4}
            className="resize-none text-sm"
          />
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNotes(currentNotes || '');
                setOpen(false);
              }}
            >
              {t('common:cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveNotes.isPending}
            >
              {saveNotes.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              {t('common:save')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

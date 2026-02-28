import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Wand2, Pencil, Save, X, AlertTriangle } from 'lucide-react';
import { getFunctionsInvokeErrorMessage, isNoDataForExtractionMessage } from '@/lib/functionsInvokeError';

interface CaseFactsEditorProps {
  caseId: string;
  caseTitle: string;
  caseNumber: string;
  description?: string | null;
  facts?: string | null;
  legalQuestion?: string | null;
  aiCreditsExhausted: boolean;
  onCreditsExhausted: () => void;
}

export function CaseFactsEditor({
  caseId,
  caseTitle,
  caseNumber,
  description,
  facts,
  legalQuestion,
  aiCreditsExhausted,
  onCreditsExhausted
}: CaseFactsEditorProps) {
  const { t } = useTranslation(['cases', 'common', 'errors']);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editFacts, setEditFacts] = useState('');
  const [editLegalQuestion, setEditLegalQuestion] = useState('');
  const [isSavingFields, setIsSavingFields] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleStartEditFields = () => {
    setEditDescription(description || '');
    setEditFacts(facts || '');
    setEditLegalQuestion(legalQuestion || '');
    setIsEditingFields(true);
  };

  const handleCancelEditFields = () => {
    setIsEditingFields(false);
    setEditDescription('');
    setEditFacts('');
    setEditLegalQuestion('');
  };

  const handleSaveFields = async () => {
    setIsSavingFields(true);
    try {
      const { error } = await supabase
        .from('cases')
        .update({
          description: editDescription,
          facts: editFacts,
          legal_question: editLegalQuestion,
          updated_at: new Date().toISOString()
        })
        .eq('id', caseId);
      
      if (error) throw error;
      
      toast({ title: t('cases:fields_saved', 'Fields saved successfully') });
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      setIsEditingFields(false);
    } catch (error) {
      console.error('Save fields error:', error);
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSavingFields(false);
    }
  };

  const handleExtractFields = async () => {
    setIsExtracting(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      
      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const resp = await fetch(`${supabaseUrl}/functions/v1/extract-case-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${session?.access_token ?? supabaseKey}`,
        },
        body: JSON.stringify({ caseId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      const data = await resp.json();
      
      if (!resp.ok) {
        const parsedMsg = data?.error || data?.message || `HTTP ${resp.status}`;
        if (parsedMsg.includes('402') || parsedMsg.includes('Payment required') || parsedMsg.includes('credits')) {
          onCreditsExhausted();
          toast({ title: t('cases:ai_credits_exhausted'), variant: 'destructive' });
          return;
        }
        throw new Error(parsedMsg);
      }
      
      if (data.success) {
        toast({
          title: t('common:success', 'Success'),
          description: t('cases:fields_extracted', 'Facts and legal question extracted successfully'),
        });
        queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      } else {
        if (data.error?.includes('402') || data.error?.includes('credits')) {
          onCreditsExhausted();
          toast({ title: t('cases:ai_credits_exhausted'), variant: 'destructive' });
          return;
        }
        throw new Error(data.error || 'Extraction failed');
      }
    } catch (error) {
      console.error('Extraction error:', error);
      const rawMsg = error instanceof Error ? error.message : String(error);
      const errorMsg = isNoDataForExtractionMessage(rawMsg) ? t('cases:extraction_no_data') : rawMsg;
      
      if (rawMsg.includes('402') || rawMsg.includes('credits')) {
        onCreditsExhausted();
        toast({ title: t('cases:ai_credits_exhausted'), variant: 'destructive' });
        return;
      }
      
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: rawMsg.includes('abort') ? t('errors:timeout', 'Request timed out. Please try again.') : errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <Card className="mt-4 card-premium overflow-hidden max-w-full">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="w-full min-w-0 break-words leading-tight text-mobile-lg sm:text-lg" style={{ overflowWrap: 'anywhere' }}>
          {caseTitle} — {caseNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
        <div className="flex flex-wrap justify-center gap-2">
          {!isEditingFields ? (
            <>
              <Button variant="outline" size="sm" onClick={handleStartEditFields}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('cases:edit_fields', 'Edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtractFields}
                disabled={isExtracting}
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common:processing', 'Processing')}...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    {t('cases:auto_extract', 'Auto-extract')}
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEditFields}
                disabled={isSavingFields}
              >
                <X className="mr-2 h-4 w-4" />
                {t('cases:cancel_edit', 'Cancel')}
              </Button>
              <Button size="sm" onClick={handleSaveFields} disabled={isSavingFields}>
                {isSavingFields ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('cases:save_fields', 'Save')}
              </Button>
            </>
          )}
        </div>
        {aiCreditsExhausted && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t('cases:ai_credits_exhausted')}</AlertDescription>
          </Alert>
        )}
        
        {isEditingFields ? (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                {t('description')}
              </label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t('common:no_description', 'No description')}
                className="min-h-[100px]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                {t('cases:facts', 'Facts')} ({t('cases:facts_hy', '\u0553\u0561\u057D\u057F\u0565\u0580')})
              </label>
              <Textarea
                value={editFacts}
                onChange={(e) => setEditFacts(e.target.value)}
                placeholder={t('cases:no_facts')}
                className="min-h-[100px]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                {t('cases:legal_question', 'Legal Question')} ({t('cases:legal_question_hy', '\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u0561\u0580\u0581')})
              </label>
              <Textarea
                value={editLegalQuestion}
                onChange={(e) => setEditLegalQuestion(e.target.value)}
                placeholder={t('cases:no_legal_question')}
                className="min-h-[100px]"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {t('description')}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm border rounded-md p-3 bg-muted/50 min-h-[60px]" style={{ overflowWrap: 'anywhere' }}>
                {description || t('common:no_description', 'No description')}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {t('cases:facts', 'Facts')} ({t('cases:facts_hy', '\u0553\u0561\u057D\u057F\u0565\u0580')})
              </p>
              <p className="whitespace-pre-wrap break-words text-sm border rounded-md p-3 bg-muted/50 min-h-[60px]" style={{ overflowWrap: 'anywhere' }}>
                {facts || t('cases:no_facts')}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {t('cases:legal_question', 'Legal Question')} ({t('cases:legal_question_hy', '\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u0561\u0580\u0581')})
              </p>
              <p className="whitespace-pre-wrap break-words text-sm border rounded-md p-3 bg-muted/50 min-h-[60px]" style={{ overflowWrap: 'anywhere' }}>
                {legalQuestion || t('cases:no_legal_question')}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

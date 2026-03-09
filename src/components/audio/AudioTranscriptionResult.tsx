import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { 
  Edit, 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  BookOpen,
  Loader2,
  MessageSquare,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAudioTranscriptions, TranscriptionWithFile } from '@/hooks/useAudioTranscriptions';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

interface AudioTranscriptionResultProps {
  transcription: TranscriptionWithFile;
  caseId: string;
}

type KBCategory = Database['public']['Enums']['kb_category'];

const KB_CATEGORIES: KBCategory[] = [
  'constitution',
  'civil_code',
  'criminal_code',
  'labor_code',
  'family_code',
  'administrative_code',
  'tax_code',
  'court_practice',
  'legal_commentary',
  'other',
];

// Speaker color palettes using CSS variables for theme support
const SPEAKER_STYLES = [
  { label: 'text-blue-600 dark:text-blue-400', bubble: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' },
  { label: 'text-emerald-600 dark:text-emerald-400', bubble: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
  { label: 'text-purple-600 dark:text-purple-400', bubble: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800' },
  { label: 'text-orange-600 dark:text-orange-400', bubble: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800' },
  { label: 'text-rose-600 dark:text-rose-400', bubble: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800' },
];

function parseDialogue(text: string) {
  const combined = text.replace(/\r\n/g, '\n');
  
  // Broad speaker regex supporting Armenian, Russian, English labels
  const speakerPattern = '(?:\u054d\u057a\u056b\u056f\u0565\u0580|\u0421\u043f\u0438\u043a\u0435\u0440|Speaker|\u0413\u043e\u0432\u043e\u0440\u044f\u0449\u0438\u0439|\u053d\u0578\u057d\u0578\u0572)\\s*\\d+';
  
  // Try splitting on [MM:SS] Speaker patterns
  const splitRegex = new RegExp(`(?=\\[\\d{1,2}:\\d{2}\\]\\s*(?:${speakerPattern})\\s*:)`, 'gi');
  const parts = combined.split(splitRegex);
  
  // If no timestamp splits, try newline-based
  const lines = parts.length > 1 ? parts : combined.split('\n');
  
  const speakerRegex = new RegExp(`^(?:\\[(\\d{1,2}:\\d{2})\\]\\s*)?(${speakerPattern})\\s*:\\s*([\\s\\S]*)$`, 'i');
  
  const speakerMap: Record<string, number> = {};
  let speakerCount = 0;

  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: 'plain' as const, content: '' };

    const m = trimmed.match(speakerRegex);
    if (m) {
      const timestamp = m[1] || null;
      const speaker = m[2];
      const content = m[3].trim();
      if (!(speaker in speakerMap)) {
        speakerMap[speaker] = speakerCount % SPEAKER_STYLES.length;
        speakerCount++;
      }
      return { type: 'dialogue' as const, speaker, content, timestamp, styleIdx: speakerMap[speaker] };
    }
    return { type: 'plain' as const, content: trimmed };
  });
}

export function AudioTranscriptionResult({ transcription, caseId }: AudioTranscriptionResultProps) {
  const { t } = useTranslation(['audio', 'kb', 'common']);
  const { updateTranscription, addToKnowledgeBase, deleteTranscription } = useAudioTranscriptions(caseId);
  const { isAdmin, isClient } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(transcription.transcription_text);
  const [showKBDialog, setShowKBDialog] = useState(false);
  const [kbTitle, setKbTitle] = useState('');
  const [kbCategory, setKbCategory] = useState<KBCategory>('legal_commentary');

  const confidenceScore = transcription.confidence || 0;
  const confidencePercent = Math.round(Number(confidenceScore) * 100);
  const needsReview = transcription.needs_review;
  const isReviewed = !!transcription.reviewed_by;
  const canEdit = isAdmin || isClient;
  const canAddToKB = (isAdmin || isClient) && Number(confidenceScore) >= 0.5;

  const durationMinutes = transcription.duration_seconds 
    ? Math.floor(transcription.duration_seconds / 60) 
    : 0;
  const durationSecs = transcription.duration_seconds 
    ? Math.floor(transcription.duration_seconds % 60) 
    : 0;

  const dialogueLines = parseDialogue(transcription.transcription_text);
  const isDialogue = dialogueLines.some(l => l.type === 'dialogue');

  const getConfidenceBadge = () => {
    const score = Number(confidenceScore);
    if (score >= 0.85) {
      return <Badge variant="default" className="bg-green-500">{confidencePercent}%</Badge>;
    } else if (score >= 0.5) {
      return <Badge variant="secondary" className="bg-yellow-500 text-black">{confidencePercent}%</Badge>;
    } else {
      return <Badge variant="destructive">{confidencePercent}%</Badge>;
    }
  };

  const getStatusBadge = () => {
    if (isReviewed) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-600">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {t('audio:status_reviewed')}
        </Badge>
      );
    } else if (needsReview) {
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-600">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {t('audio:needs_review')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        {t('audio:status_pending')}
      </Badge>
    );
  };

  const handleSave = async () => {
    await updateTranscription.mutateAsync({
      id: transcription.id,
      transcriptionText: editedText,
      needsReview: false,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedText(transcription.transcription_text);
    setIsEditing(false);
  };

  const handleAddToKB = async () => {
    await addToKnowledgeBase.mutateAsync({
      transcriptionId: transcription.id,
      title: kbTitle,
      category: kbCategory,
    });
    setShowKBDialog(false);
    setKbTitle('');
  };

  return (
    <>
      <Card className="w-full overflow-hidden">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <CardTitle className="text-sm sm:text-base break-words leading-tight">
                {transcription.case_files?.original_filename || t('audio:transcription')}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {format(new Date(transcription.created_at), 'dd.MM.yyyy HH:mm')}
                </span>
                <span>
                  {t('audio:duration')}: {durationMinutes}:{durationSecs.toString().padStart(2, '0')}
                </span>
                {isDialogue && (
                  <span className="flex items-center gap-1 text-primary">
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    Диалог
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start">
              {getConfidenceBadge()}
              {getStatusBadge()}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 sm:px-6">
          {transcription.language && (
            <p className="text-xs text-muted-foreground mb-2">
              {t('audio:language')}: {transcription.language}
            </p>
          )}

          {isEditing ? (
            <Textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={10}
              className="font-mono text-sm w-full"
              aria-label={t('audio:edit_transcription')}
            />
          ) : isDialogue ? (
            <div className="rounded-md border bg-muted/20 p-3 sm:p-4 max-h-80 overflow-y-auto space-y-2">
              {dialogueLines.map((line, idx) => {
                if (line.type === 'dialogue') {
                  const style = SPEAKER_STYLES[line.styleIdx];
                  return (
                    <div key={idx} className={`rounded-lg border p-2.5 ${style.bubble}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${style.label}`}>
                          {line.speaker}
                        </span>
                        {line.timestamp && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            [{line.timestamp}]
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1 break-words">{line.content}</p>
                    </div>
                  );
                }
                if (!line.content.trim()) return null;
                return (
                  <p key={idx} className="text-sm text-muted-foreground px-1 break-words">{line.content}</p>
                );
              })}
            </div>
          ) : (
            <div className="bg-muted/50 rounded-md p-3 sm:p-4 max-h-64 overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap break-words">{transcription.transcription_text}</p>
            </div>
          )}

          {needsReview && !isEditing && (
            <div className="mt-3 p-2 sm:p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
              <p className="text-xs sm:text-sm text-orange-700 dark:text-orange-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{t('audio:low_quality_warning')}</span>
              </p>
            </div>
          )}
        </CardContent>

        {canEdit && (
          <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 pt-0 px-3 sm:px-6">
            {isEditing ? (
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateTranscription.isPending}
                  className="flex-1 sm:flex-none"
                >
                  {updateTranscription.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  <span className="truncate">{t('audio:save_changes')}</span>
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="flex-1 sm:flex-none">
                  <X className="h-4 w-4 mr-1" />
                  <span className="truncate">{t('audio:cancel')}</span>
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="w-full sm:w-auto">
                <Edit className="h-4 w-4 mr-1 shrink-0" />
                <span className="truncate">{t('audio:edit_transcription')}</span>
              </Button>
            )}

            {canAddToKB && !isEditing && (
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowKBDialog(true)}
                >
                  <BookOpen className="h-4 w-4 mr-1 shrink-0" />
                  <span className="truncate">{t('audio:add_to_kb')}</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteTranscription.mutate(transcription.id)}
                  disabled={deleteTranscription.isPending}
                >
                  {deleteTranscription.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1 shrink-0" />
                  )}
                  <span className="truncate">{t('common:delete', 'Удалить')}</span>
                </Button>
              </div>
            )}
          </CardFooter>
        )}
      </Card>

      <Dialog open={showKBDialog} onOpenChange={setShowKBDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('audio:add_to_kb')}</DialogTitle>
            <DialogDescription>
              {t('kb:add_document_description', 'Add this transcription to the knowledge base.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="kb-title">{t('kb:title')}</Label>
              <Input
                id="kb-title"
                value={kbTitle}
                onChange={(e) => setKbTitle(e.target.value)}
                placeholder={t('kb:title_placeholder', 'Enter document title')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-category">{t('kb:category')}</Label>
              <Select value={kbCategory} onValueChange={(v) => setKbCategory(v as KBCategory)}>
                <SelectTrigger id="kb-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KB_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`kb:categories.${cat}`, cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKBDialog(false)}>
              {t('audio:cancel')}
            </Button>
            <Button
              onClick={handleAddToKB}
              disabled={!kbTitle.trim() || addToKnowledgeBase.isPending}
            >
              {addToKnowledgeBase.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              {t('audio:add_to_kb')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

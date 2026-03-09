import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCases } from '@/hooks/useCases';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, 
  Scale, 
  LogOut, 
  Mic, 
  Upload, 
  Loader2,
  FileAudio,
  CheckCircle,
  AlertCircle,
  Save,
  FileText,
  Clock,
  User,
} from 'lucide-react';

const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
  'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac',
];
const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4', 'video/quicktime', 'video/webm',
  'video/x-msvideo', 'video/x-matroska',
];
const ALL_SUPPORTED_FORMATS = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS];
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ── Dialogue parser ──────────────────────────────────────────────────

interface DialogueLine {
  timestamp: string | null;
  speaker: string;
  speakerIndex: number;
  text: string;
}

const SPEAKER_COLORS = [
  'bg-primary/10 border-primary/30 text-foreground',
  'bg-green-500/10 border-green-500/30 text-foreground',
  'bg-orange-500/10 border-orange-500/30 text-foreground',
  'bg-purple-500/10 border-purple-500/30 text-foreground',
  'bg-pink-500/10 border-pink-500/30 text-foreground',
];

const SPEAKER_BADGE_COLORS = [
  'bg-primary text-primary-foreground',
  'bg-green-600 text-white',
  'bg-orange-500 text-white',
  'bg-purple-600 text-white',
  'bg-pink-600 text-white',
];

function parseDialogue(text: string): DialogueLine[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const speakerMap: Record<string, number> = {};
  let speakerCount = 0;

  return lines.map(line => {
    const trimmed = line.trim();

    // Match optional timestamp [MM:SS] or [H:MM:SS]
    const tsMatch = trimmed.match(/^\[(\d+:\d+(?::\d+)?)\]\s*/);
    const timestamp = tsMatch ? tsMatch[1] : null;
    const rest = tsMatch ? trimmed.slice(tsMatch[0].length) : trimmed;

    // Match speaker label (Russian / English / Armenian variants)
    const speakerMatch = rest.match(/^((?:Спикер|Speaker|Speakers?|Председатель|Судья|Прокурор|Защитник|Адвокат)\s*\d*)\s*:\s*/i);
    const speaker = speakerMatch ? speakerMatch[1].trim() : ('\u0421\u043f\u0438\u043a\u0435\u0440 1');
    const content = speakerMatch ? rest.slice(speakerMatch[0].length) : rest;

    if (!(speaker in speakerMap)) {
      speakerMap[speaker] = speakerCount++;
    }

    return {
      timestamp,
      speaker,
      speakerIndex: speakerMap[speaker],
      text: content.trim(),
    };
  }).filter(l => l.text.length > 0);
}

// ── Component ────────────────────────────────────────────────────────

const AudioTranscriptions = () => {
  const { t } = useTranslation(['audio', 'common', 'errors', 'cases']);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { cases, isLoading: casesLoading } = useCases({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<{
    success: boolean;
    transcription?: string;
    confidence_score?: number;
    language_detected?: string;
    duration_seconds?: number;
    error?: string;
  } | null>(null);

  // ── Save to My Documents ─────────────────────────────────────────

  const handleSaveToDocuments = async () => {
    if (!transcriptionResult?.transcription || !user) return;
    setIsSavingDoc(true);
    try {
      const caseTitle = cases.find(c => c.id === selectedCaseId)?.title || '';
      const date = new Date().toLocaleDateString('ru-RU');
      const fileName = selectedFile?.name || 'audio';

      const metaLines = [
        `\u0424\u0430\u0439\u043b: ${fileName}`,
        `\u042f\u0437\u044b\u043a: ${transcriptionResult.language_detected || '\u2014'}`,
        `\u0422\u043e\u0447\u043d\u043e\u0441\u0442\u044c: ${Math.round((transcriptionResult.confidence_score || 0) * 100)}%`,
      ].join('\n');

      const contentText = `${metaLines}\n\n${transcriptionResult.transcription}`;
      const title = `\u0422\u0440\u0430\u043d\u0441\u043a\u0440\u0438\u043f\u0446\u0438\u044f: ${fileName} (${date})${caseTitle ? ` \u2014 ${caseTitle}` : ''}`;

      const { error } = await supabase.from('generated_documents').insert({
        user_id: user.id,
        title,
        content_text: contentText,
        status: 'draft',
        case_id: selectedCaseId || null,
        metadata: {
          type: 'transcription',
          language: transcriptionResult.language_detected,
          confidence: transcriptionResult.confidence_score,
          source_file: fileName,
        },
      });

      if (error) throw error;

      toast({
        title: '\u0422\u0440\u0430\u043d\u0441\u043a\u0440\u0438\u043f\u0446\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430',
        description: '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d \u0432 \u00ab\u041c\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b\u00bb',
      });
    } catch (err) {
      console.error('Save transcription error:', err);
      toast({ title: t('common:error'), variant: 'destructive' });
    } finally {
      setIsSavingDoc(false);
    }
  };

  // ── File select ──────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const isM4A = fileExt === 'm4a';

    if (!ALL_SUPPORTED_FORMATS.includes(file.type) && !isM4A) {
      toast({ title: t('audio:unsupported_format'), variant: 'destructive' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: t('audio:file_too_large'), variant: 'destructive' });
      return;
    }

    setSelectedFile(file);
    setTranscriptionResult(null);
  };

  // ── Transcribe ───────────────────────────────────────────────────

  const handleUploadAndTranscribe = async () => {
    if (!selectedFile || !user) return;

    setIsUploading(true);
    setTranscriptionResult(null);

    try {
      const fileId = crypto.randomUUID();
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();

      let contentType = selectedFile.type;
      if (fileExt === 'm4a' || contentType === 'audio/x-m4a' || contentType === 'audio/m4a') {
        contentType = 'audio/mp4';
      }

      let signedUrl: string;
      let dbFileId: string | null = null;

      if (selectedCaseId) {
        // Upload linked to a case
        const storagePath = `${selectedCaseId}/${fileId}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('case-files')
          .upload(storagePath, selectedFile, { contentType });
        if (uploadError) throw uploadError;

        const { data: fileRecord, error: dbError } = await supabase
          .from('case_files')
          .insert({
            case_id: selectedCaseId,
            filename: `${fileId}.${fileExt}`,
            original_filename: selectedFile.name,
            storage_path: storagePath,
            file_type: contentType,
            file_size: selectedFile.size,
            hash_sha256: '',
            version: 1,
            uploaded_by: user.id,
          })
          .select()
          .single();

        if (dbError) {
          await supabase.storage.from('case-files').remove([storagePath]);
          throw dbError;
        }

        dbFileId = fileRecord.id;

        const { data: urlData } = await supabase.storage
          .from('case-files')
          .createSignedUrl(storagePath, 3600);
        if (!urlData?.signedUrl) throw new Error('Failed to get signed URL');
        signedUrl = urlData.signedUrl;
      } else {
        // Standalone upload — no case required
        const storagePath = `${user.id}/standalone/${fileId}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('case-files')
          .upload(storagePath, selectedFile, { contentType });
        if (uploadError) throw uploadError;

        const { data: urlData } = await supabase.storage
          .from('case-files')
          .createSignedUrl(storagePath, 3600);
        if (!urlData?.signedUrl) throw new Error('Failed to get signed URL');
        signedUrl = urlData.signedUrl;
      }

      const { data: result, error: fnError } = await supabase.functions.invoke('audio-transcribe', {
        body: {
          audioUrl: signedUrl,
          fileName: selectedFile.name,
          caseId: selectedCaseId || null,
          fileId: dbFileId,
        },
      });

      if (fnError) throw fnError;

      setTranscriptionResult({
        success: true,
        transcription: result.transcription,
        confidence_score: result.confidence_score,
        language_detected: result.language_detected,
        duration_seconds: result.duration_seconds,
      });

      toast({
        title: t('audio:processing_complete'),
        description: `${t('audio:confidence')}: ${Math.round((result.confidence_score || 0) * 100)}%`,
      });

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscriptionResult({
        success: false,
        error: error instanceof Error ? error.message : t('errors:transcription_failed'),
      });
      toast({
        title: t('audio:processing_failed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────

  const dialogueLines = transcriptionResult?.transcription
    ? parseDialogue(transcriptionResult.transcription)
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Scale className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{t('common:app_name')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Mic className="h-6 w-6 text-primary" />
            {t('audio:audio_transcription')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('audio:upload_description')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t('audio:upload_audio')}
              </CardTitle>
              <CardDescription>
                {t('audio:supported_formats')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Case Selection — optional */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  {t('audio:select_case')}
                  <Badge variant="outline" className="text-xs font-normal">
                    {t('common:optional', '\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e')}
                  </Badge>
                </Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('audio:select_case_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      — {t('common:without_case', '\u0411\u0435\u0437 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438 \u043a \u0434\u0435\u043b\u0443')} —
                    </SelectItem>
                    {casesLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      cases.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.case_number} - {c.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* File Input */}
              <div className="space-y-2">
                <Label>{t('audio:audio_file')}</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.flac,.aac,.mp4,.mov,.avi,.mkv"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </div>

              {/* Selected File Info */}
              {selectedFile && (
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <FileAudio className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium break-all text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              )}

              {/* Transcribe Button */}
              <Button
                onClick={handleUploadAndTranscribe}
                disabled={!selectedFile || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('audio:processing')}
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    {t('audio:transcribe')}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Result */}
          <Card>
            <CardHeader>
              <CardTitle>{t('audio:result')}</CardTitle>
            </CardHeader>
            <CardContent>
              {transcriptionResult ? (
                transcriptionResult.success ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">{t('audio:processing_complete')}</span>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('audio:confidence')}:</span>{' '}
                        <span className="font-medium">
                          {Math.round((transcriptionResult.confidence_score || 0) * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('audio:language')}:</span>{' '}
                        <span className="font-medium">{transcriptionResult.language_detected}</span>
                      </div>
                    </div>

                    {/* Dialogue view */}
                    <div className="rounded-lg border bg-muted/30 overflow-hidden">
                      <div className="max-h-96 overflow-y-auto p-3 space-y-2">
                        {dialogueLines.length > 0 ? (
                          dialogueLines.map((line, idx) => {
                            const colorClass = SPEAKER_COLORS[line.speakerIndex % SPEAKER_COLORS.length];
                            const badgeClass = SPEAKER_BADGE_COLORS[line.speakerIndex % SPEAKER_BADGE_COLORS.length];
                            return (
                              <div
                                key={idx}
                                className={`rounded-lg border p-3 ${colorClass}`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass} flex items-center gap-1`}>
                                    <User className="h-2.5 w-2.5" />
                                    {line.speaker}
                                  </span>
                                  {line.timestamp && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="h-2.5 w-2.5" />
                                      {line.timestamp}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm leading-relaxed">{line.text}</p>
                              </div>
                            );
                          })
                        ) : (
                          <p className="whitespace-pre-wrap text-sm p-1">
                            {transcriptionResult.transcription}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={handleSaveToDocuments}
                        disabled={isSavingDoc}
                        className="gap-2"
                      >
                        {isSavingDoc
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Save className="h-4 w-4" />
                        }
                        {t('audio:save_transcription', '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => navigate('/my-documents')}
                        className="gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        {t('audio:view_all_transcriptions', '\u041c\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span>{transcriptionResult.error}</span>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Mic className="h-12 w-12 mb-4 opacity-50" />
                  <p>{t('audio:no_result')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AudioTranscriptions;

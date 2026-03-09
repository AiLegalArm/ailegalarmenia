import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2, Music, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAudioTranscriptions } from '@/hooks/useAudioTranscriptions';
import type { Database } from '@/integrations/supabase/types';

type CaseFile = Database['public']['Tables']['case_files']['Row'];
type AudioTranscription = Database['public']['Tables']['audio_transcriptions']['Row'];

interface TranscriptionResult {
  fileRecord: CaseFile;
  transcription: Record<string, unknown>;
}

interface AudioUploadProps {
  caseId: string;
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
}

 const ACCEPTED_FORMATS = '.mp3,.wav,.m4a,.ogg,.webm,.flac,.mp4,.mov,.avi,.mkv';

export function AudioUpload({ caseId, onTranscriptionComplete }: AudioUploadProps) {
  const { t } = useTranslation(['audio', 'common']);
  const { uploadAndTranscribe } = useAudioTranscriptions(caseId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    
    try {
      const result = await uploadAndTranscribe.mutateAsync({ file, caseId });
      onTranscriptionComplete?.(result);
    } catch (error) {
      // Error handled by hook
    }
  }, [caseId, uploadAndTranscribe, onTranscriptionComplete]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const isProcessing = uploadAndTranscribe.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" aria-hidden="true" />
          {t('audio:upload_audio')}
        </CardTitle>
        <CardDescription>{t('audio:supported_formats')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label={t('audio:upload_audio')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            onChange={handleInputChange}
            className="hidden"
            aria-hidden="true"
            disabled={isProcessing}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('audio:processing')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                 <p className="text-sm font-medium">{t('audio:upload_audio_video')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                   {t('audio:supported_formats_video')}
                </p>
              </div>
            </div>
          )}
        </div>

        {uploadAndTranscribe.isError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {uploadAndTranscribe.error?.message || t('audio:processing_failed')}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

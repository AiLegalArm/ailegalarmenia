import { useTranslation } from 'react-i18next';
import { Music, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAudioTranscriptions } from '@/hooks/useAudioTranscriptions';
import { AudioTranscriptionResult } from './AudioTranscriptionResult';
import { AudioUpload } from './AudioUpload';

interface AudioTranscriptionListProps {
  caseId: string;
}

export function AudioTranscriptionList({ caseId }: AudioTranscriptionListProps) {
  const { t } = useTranslation(['audio', 'common']);
  const { transcriptions, isLoading } = useAudioTranscriptions(caseId);

  return (
    <div className="space-y-4 sm:space-y-6 w-full overflow-hidden">
      <AudioUpload caseId={caseId} />

      <Card className="w-full overflow-hidden">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Music className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('audio:transcriptions_list')}</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('audio:audio_history')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="sr-only">{t('common:loading')}</span>
            </div>
          ) : transcriptions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Music className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t('audio:no_transcriptions')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transcriptions.map((transcription) => (
                <AudioTranscriptionResult
                  key={transcription.id}
                  transcription={transcription}
                  caseId={caseId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

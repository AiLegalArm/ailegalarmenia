import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';

type AudioTranscription = Database['public']['Tables']['audio_transcriptions']['Row'];
type CaseFile = Database['public']['Tables']['case_files']['Row'];

export interface TranscriptionWithFile extends AudioTranscription {
  case_files: Pick<CaseFile, 'original_filename' | 'storage_path' | 'case_id'> | null;
}

const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg',      // MP3
  'audio/wav',       // WAV
  'audio/mp4',       // M4A
  'audio/x-m4a',     // M4A (alternative)
  'audio/m4a',       // M4A (alternative)
  'audio/aac',       // AAC
  'audio/ogg',       // OGG
  'audio/webm',      // WebM
  'audio/flac',      // FLAC
];
 
 const SUPPORTED_VIDEO_FORMATS = [
   'video/mp4',       // MP4
   'video/quicktime', // MOV
   'video/webm',      // WebM
   'video/x-msvideo', // AVI
   'video/x-matroska',// MKV
 ];
 
 const ALL_SUPPORTED_FORMATS = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function useAudioTranscriptions(caseId: string | undefined) {
  const { toast } = useToast();
  const { t } = useTranslation(['audio', 'errors']);
  const queryClient = useQueryClient();

  // Get all transcriptions for a case
  const { data: transcriptions, isLoading, error } = useQuery({
    queryKey: ['audio-transcriptions', caseId],
    queryFn: async () => {
      if (!caseId) return [];
      
      const { data, error } = await supabase
        .from('audio_transcriptions')
        .select(`
          *,
          case_files!inner (
            original_filename,
            storage_path,
            case_id
          )
        `)
        .eq('case_files.case_id', caseId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TranscriptionWithFile[];
    },
    enabled: !!caseId,
  });

  // Upload and transcribe audio
  const uploadAndTranscribe = useMutation({
    mutationFn: async ({ file, caseId }: { file: File; caseId: string }) => {
      // Validate file type
       if (!ALL_SUPPORTED_FORMATS.includes(file.type)) {
        throw new Error(t('audio:unsupported_format'));
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(t('audio:file_too_large'));
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate UUID for file
      const fileId = crypto.randomUUID();
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const storagePath = `${caseId}/${fileId}.${fileExt}`;

      // Normalize MIME type for M4A files (browser may report x-m4a which storage rejects)
      let contentType = file.type;
      if (fileExt === 'm4a' || file.type === 'audio/x-m4a' || file.type === 'audio/m4a') {
        contentType = 'audio/mp4';
      }

      // Upload to storage with correct content type
      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(storagePath, file, {
          contentType,
        });

      if (uploadError) throw uploadError;

      // Create case_files record
      const { data: fileRecord, error: dbError } = await supabase
        .from('case_files')
        .insert({
          case_id: caseId,
          filename: `${fileId}.${fileExt}`,
          original_filename: file.name,
          storage_path: storagePath,
          file_type: file.type,
          file_size: file.size,
          hash_sha256: '', // Will be computed
          version: 1,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from('case-files').remove([storagePath]);
        throw dbError;
      }

      // Get signed URL for the audio file
      const { data: signedUrlData } = await supabase.storage
        .from('case-files')
        .createSignedUrl(storagePath, 3600);

      if (!signedUrlData?.signedUrl) {
        throw new Error('Failed to get signed URL');
      }

      // Call edge function for transcription (with retry for transient failures)
      let transcriptionResult: { confidence_score?: number; [key: string]: unknown } | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error: fnError } = await supabase.functions
            .invoke('audio-transcribe', {
              body: {
                audioUrl: signedUrlData.signedUrl,
                fileName: file.name,
                caseId,
                fileId: fileRecord.id,
              },
            });

          if (fnError) {
            // "Failed to send a request to the Edge Function" = network/timeout
            const msg = fnError.message || String(fnError);
            if (msg.includes('Failed to send') && attempt < 1) {
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
            throw new Error(msg);
          }

          transcriptionResult = data;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < 1) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
        }
      }

      if (!transcriptionResult) {
        throw lastError || new Error(t('audio:processing_failed'));
      }

      return {
        fileRecord,
        transcription: transcriptionResult,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audio-transcriptions', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-files', caseId] });
      
      const confidence = Number(data.transcription.confidence_score) || 0;
      const confidencePercent = Math.round(confidence * 100);
      
      toast({
        title: t('audio:processing_complete'),
        description: `${t('audio:confidence')}: ${confidencePercent}%`,
        variant: confidence >= 0.5 ? 'default' : 'destructive',
      });
    },
    onError: (error) => {
      toast({
        title: t('audio:processing_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update transcription (edit reviewed text)
  const updateTranscription = useMutation({
    mutationFn: async ({ 
      id, 
      transcriptionText, 
      needsReview 
    }: { 
      id: string; 
      transcriptionText: string; 
      needsReview?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('audio_transcriptions')
        .update({
          transcription_text: transcriptionText,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          needs_review: needsReview ?? false,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio-transcriptions', caseId] });
      toast({
        title: t('audio:save_changes'),
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

  // Add to Knowledge Base
  const addToKnowledgeBase = useMutation({
    mutationFn: async ({ 
      transcriptionId, 
      title, 
      category 
    }: { 
      transcriptionId: string; 
      title: string; 
      category: Database['public']['Enums']['kb_category'];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get transcription
      const { data: transcription, error: fetchError } = await supabase
        .from('audio_transcriptions')
        .select('transcription_text')
        .eq('id', transcriptionId)
        .single();

      if (fetchError) throw fetchError;

      const contentText = transcription.transcription_text;

      // Create KB entry
      const { data, error } = await supabase
        .from('knowledge_base')
        .insert({
          title,
          content_text: contentText,
          category,
          source_name: 'Audio Transcription',
          uploaded_by: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: t('audio:kb_added'),
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

  // Delete transcription
  const deleteTranscription = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('audio_transcriptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio-transcriptions', caseId] });
      toast({
        title: t('audio:delete_transcription'),
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
    transcriptions: transcriptions || [],
    isLoading,
    error,
    uploadAndTranscribe,
    updateTranscription,
    addToKnowledgeBase,
    deleteTranscription,
  };
}

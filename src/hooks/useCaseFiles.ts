import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';

type CaseFile = Database['public']['Tables']['case_files']['Row'];

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useCaseFiles(caseId: string | undefined) {
  const { toast } = useToast();
  const { t } = useTranslation(['cases', 'errors']);
  const queryClient = useQueryClient();

  const { data: files, isLoading, error } = useQuery({
    queryKey: ['case-files', caseId],
    queryFn: async () => {
      if (!caseId) return [];
      const { data, error } = await supabase
        .from('case_files')
        .select('*')
        .eq('case_id', caseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CaseFile[];
    },
    enabled: !!caseId,
  });

  const uploadFile = useMutation({
    mutationFn: async ({ file, caseId }: { file: File; caseId: string }) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate UUID for file
      const fileId = crypto.randomUUID();
      const fileExt = file.name.split('.').pop();
      const storagePath = `${caseId}/${fileId}.${fileExt}`;

      // Compute SHA-256 hash
      const hash = await computeSHA256(file);

      // Check for existing file with same hash (versioning)
      const { data: existingFiles } = await supabase
        .from('case_files')
        .select('version')
        .eq('case_id', caseId)
        .eq('hash_sha256', hash)
        .order('version', { ascending: false })
        .limit(1);

      const version = existingFiles && existingFiles.length > 0 
        ? existingFiles[0].version + 1 
        : 1;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Determine file type
      const fileType = file.type || 'application/octet-stream';

      // Create database record
      const { data, error: dbError } = await supabase
        .from('case_files')
        .insert({
          case_id: caseId,
          filename: `${fileId}.${fileExt}`,
          original_filename: file.name,
          storage_path: storagePath,
          file_type: fileType,
          file_size: file.size,
          hash_sha256: hash,
          version,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) {
        // Rollback storage upload
        await supabase.storage.from('case-files').remove([storagePath]);
        throw dbError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-files', caseId] });
      toast({
        title: t('cases:file_uploaded', 'File uploaded successfully'),
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

  const deleteFile = useMutation({
    mutationFn: async (fileId: string) => {
      // Soft delete via backend RPC (avoids RLS edge-cases on direct UPDATE)
      // `rpc` names are type-checked against generated DB types; cast to avoid build break.
      const { error } = await (supabase as any).rpc('soft_delete_case_file', { p_file_id: fileId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-files', caseId] });
      toast({
        title: t('cases:file_deleted', 'File deleted'),
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

  const getFileUrl = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from('case-files')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry
    if (error) throw error;
    return data.signedUrl;
  };

  return {
    files: files || [],
    isLoading,
    error,
    uploadFile,
    deleteFile,
    getFileUrl,
  };
}

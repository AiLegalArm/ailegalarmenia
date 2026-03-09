import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download, 
  Loader2,
  File,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { useCaseFiles } from '@/hooks/useCaseFiles';
import { supabase } from '@/integrations/supabase/client';
import { BulkOcrButton } from './BulkOcrButton';
import { FileNotes } from './FileNotes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CaseFileUploadProps {
  caseId: string;
}

const fileTypeIcons: Record<string, React.ReactNode> = {
  'application/pdf': <FileText className="h-5 w-5 text-red-500" />,
  'image/': <File className="h-5 w-5 text-blue-500" />,
  'audio/': <File className="h-5 w-5 text-green-500" />,
  'default': <File className="h-5 w-5 text-gray-500" />,
};

function getFileIcon(fileType: string | null) {
  if (!fileType) return fileTypeIcons.default;
  for (const [key, icon] of Object.entries(fileTypeIcons)) {
    if (key !== 'default' && fileType.startsWith(key.replace('/', ''))) {
      return icon;
    }
  }
  if (fileType.includes('pdf')) return fileTypeIcons['application/pdf'];
  return fileTypeIcons.default;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function CaseFileUpload({ caseId }: CaseFileUploadProps) {
  const { t } = useTranslation(['cases', 'common', 'ocr']);
  const { files, isLoading, uploadFile, deleteFile, getFileUrl } = useCaseFiles(caseId);
  // Keep id separate from dialog open state to avoid race with Radix onOpenChange
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map(f => f.id)));
    }
  };

  // Fetch OCR results to know which files have been processed
  const { data: ocrResults } = useQuery({
    queryKey: ['ocr-results', caseId],
    queryFn: async () => {
      const fileIds = files.map(f => f.id);
      if (fileIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('ocr_results')
        .select('file_id')
        .in('file_id', fileIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: files.length > 0,
  });

  const existingOcrFileIds = new Set(ocrResults?.map(r => r.file_id) || []);
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'text/plain'];

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    for (const file of Array.from(selectedFiles)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: ${t('ocr:file_too_large', 'File too large (max 50MB)')}`);
        continue;
      }
      await uploadFile.mutateAsync({ file, caseId });
    }
    
    // Reset input
    e.target.value = '';
  }, [caseId, uploadFile, t]);

  const handleDownload = async (storagePath: string, filename: string) => {
    try {
      setDownloadingId(storagePath);
      const url = await getFileUrl(storagePath);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDelete = () => {
    if (!pendingDeleteFileId) return;
    deleteFile.mutate(pendingDeleteFileId);
    setDeleteDialogOpen(false);
    setPendingDeleteFileId(null);
  };

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="outline" disabled={uploadFile.isPending}>
          <label className="cursor-pointer">
            {uploadFile.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {t('cases:upload_file')}
            <Input
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.mp3,.wav,.m4a,.txt"
            />
          </label>
        </Button>
        <span className="text-xs text-muted-foreground">
          PDF, DOCX, JPG, PNG, MP3, WAV, M4A, TXT
        </span>
      </div>

      {/* Bulk OCR Button - now uses selected files if any */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <BulkOcrButton
            caseId={caseId}
            files={(selectedFileIds.size > 0 
              ? files.filter(f => selectedFileIds.has(f.id)) 
              : files
            ).map(f => ({
              id: f.id,
              original_filename: f.original_filename,
              storage_path: f.storage_path,
              file_type: f.file_type,
            }))}
            existingOcrFileIds={existingOcrFileIds}
            forceProcess={selectedFileIds.size > 0}
          />
          {selectedFileIds.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedFileIds(new Set())}
            >
              {t('common:clear_selection', 'Clear')}
            </Button>
          )}
        </div>
      )}

      {/* File List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            {t('cases:no_files', 'No files uploaded')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select All */}
          {files.length > 1 && (
            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                id="select-all"
                checked={selectedFileIds.size === files.length}
                onCheckedChange={toggleSelectAll}
              />
              <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
                {t('cases:select_all', 'Select all')}
              </label>
            </div>
          )}
          {files.map((file) => (
            <div
              key={file.id}
              className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                selectedFileIds.has(file.id) ? 'bg-primary/5 border-primary/30' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Checkbox
                  checked={selectedFileIds.has(file.id)}
                  onCheckedChange={() => toggleFileSelection(file.id)}
                  className="shrink-0"
                />
                {getFileIcon(file.file_type)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{file.original_filename}</p>
                    {existingOcrFileIds.has(file.id) && (
                      <span className="text-green-600 shrink-0" title={t('cases:ocr_completed', 'OCR completed')}>
                        <CheckCircle className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.file_size)} • v{file.version} • {format(new Date(file.created_at), 'dd.MM.yyyy')}
                  </p>
                  {file.notes && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 line-clamp-1">
                      📝 {file.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <FileNotes
                  fileId={file.id}
                  caseId={caseId}
                  currentNotes={file.notes}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDownload(file.storage_path, file.original_filename)}
                  disabled={downloadingId === file.storage_path}
                >
                  {downloadingId === file.storage_path ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={deleteFile.isPending}
                  onClick={() => {
                    setPendingDeleteFileId(file.id);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common:confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cases:confirm_delete_file', 'Are you sure you want to delete this file?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteFileId(null);
              }}
            >
              {t('common:cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

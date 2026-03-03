import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Upload, 
  FileText, 
  Trash2,
  File,
  X
} from 'lucide-react';

interface CaseFormFileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

function getFileIcon(fileType: string) {
  if (fileType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  if (fileType.startsWith('image/')) return <File className="h-4 w-4 text-blue-500" />;
  if (fileType.startsWith('audio/')) return <File className="h-4 w-4 text-green-500" />;
  return <File className="h-4 w-4 text-gray-500" />;
}

function formatFileSize(bytes: number): string {
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

export function CaseFormFileUpload({ files, onFilesChange }: CaseFormFileUploadProps) {
  const { t } = useTranslation(['cases', 'common']);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_FILES = 20;

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validFiles = Array.from(selectedFiles).filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        return false; // silently skip oversized
      }
      return true;
    });

    const combined = [...files, ...validFiles].slice(0, MAX_FILES);
    onFilesChange(combined);
    
    // Reset input
    e.target.value = '';
  }, [files, onFilesChange]);

  const removeFile = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  }, [files, onFilesChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('cases:files')}</label>
        <span className="text-xs text-muted-foreground">
          {t('common:optional')}
        </span>
      </div>

      {/* Upload Zone */}
      <div className="rounded-lg border-2 border-dashed p-4 transition-colors hover:border-primary/50">
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <Button asChild variant="link" className="h-auto p-0">
              <label className="cursor-pointer text-primary">
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
            <span className="text-sm text-muted-foreground"> {t('common:or')} drag & drop</span>
          </div>
          <p className="text-xs text-muted-foreground">
            PDF, DOCX, JPG, PNG, MP3, WAV, M4A, TXT
          </p>
        </div>
      </div>

      {/* Selected Files List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {files.length} {files.length === 1 ? 'file' : 'files'} selected
          </p>
          <div className="max-h-[150px] space-y-1 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-md border bg-muted/30 p-2"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {getFileIcon(file.type)}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

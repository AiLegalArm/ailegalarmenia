import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, 
  X, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle,
  FolderUp
} from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

interface KBMultiFileUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type FileStatus = 'pending' | 'uploading' | 'processing' | 'success' | 'error' | 'warning';

interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  title?: string;
  confidence?: number;
}

const categories = kbCategoryOptions;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function KBMultiFileUpload({ open, onOpenChange, onSuccess }: KBMultiFileUploadProps) {
  const { t } = useTranslation('kb');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<FileItem[]>([]);
  const [category, setCategory] = useState<KbCategory>('other');
  const [autoAdd, setAutoAdd] = useState(true);
  const [skipOnError, setSkipOnError] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: FileItem[] = [];
    
    for (const file of fileArray) {
      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({
          title: t('multi_upload_invalid_type'),
          description: file.name,
          variant: 'destructive',
        });
        continue;
      }
      
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: t('multi_upload_file_too_large'),
          description: file.name,
          variant: 'destructive',
        });
        continue;
      }
      
      validFiles.push({
        id: crypto.randomUUID(),
        file,
        status: 'pending',
        progress: 0,
      });
    }
    
    setFiles(prev => [...prev, ...validFiles]);
  }, [t, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFileStatus = (id: string, updates: Partial<FileItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const processFile = async (fileItem: FileItem): Promise<boolean> => {
    const { id, file } = fileItem;
    
    try {
      // Step 1: Upload to storage with sanitized filename
      updateFileStatus(id, { status: 'uploading', progress: 20 });
      
      // Generate safe filename: use UUID + extension only (no Armenian characters)
      const ext = file.name.split('.').pop() || 'pdf';
      const safeFileName = `kb-import/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(safeFileName, file);
      
      if (uploadError) throw new Error(uploadError.message);
      
      updateFileStatus(id, { progress: 40 });
      
      // Step 2: Get signed URL
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('case-files')
        .createSignedUrl(safeFileName, 3600);
      
      if (urlError || !signedUrlData?.signedUrl) {
        throw new Error('Failed to get signed URL');
      }
      
      updateFileStatus(id, { progress: 50 });
      
      // Step 3: OCR processing
      updateFileStatus(id, { status: 'processing', progress: 60 });
      
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-process', {
        body: {
          fileUrl: signedUrlData.signedUrl,
          fileName: file.name,
        },
      });
      
      if (ocrError) throw new Error(ocrError.message);
      if (!ocrResult?.success) throw new Error(ocrResult?.error || 'OCR failed');
      
      updateFileStatus(id, { progress: 80 });
      
      const extractedText = ocrResult.extracted_text || '';
      const confidence = ocrResult.confidence_score || 0;
      const needsReview = ocrResult.needs_review || confidence < 70;
      
      // Step 4: Add to knowledge base (if autoAdd is enabled)
      if (autoAdd && !needsReview) {
        const title = file.name.replace(/\.[^/.]+$/, '').replace(/^_+/, '');
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        
        const { error: insertError } = await supabase
          .from('knowledge_base')
          .insert({
            title,
            content_text: extractedText,
            category,
            source_name: file.name,
            uploaded_by: user.id,
            is_active: true,
            version_date: new Date().toISOString().split('T')[0],
          });
        
        if (insertError) throw new Error(insertError.message);
        
        updateFileStatus(id, { 
          status: 'success', 
          progress: 100,
          title,
          confidence,
        });
      } else if (needsReview) {
        updateFileStatus(id, { 
          status: 'warning', 
          progress: 100,
           title: file.name.replace(/\.[^/.]+$/, '').replace(/^_+/, ''),
          confidence,
          error: t('multi_upload_low_confidence'),
        });
      } else {
        updateFileStatus(id, { 
          status: 'success', 
          progress: 100,
           title: file.name.replace(/\.[^/.]+$/, '').replace(/^_+/, ''),
          confidence,
        });
      }
      
      return true;
    } catch (error) {
      updateFileStatus(id, { 
        status: 'error', 
        progress: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  };

  const handleStartUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;
    
    setIsProcessing(true);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const fileItem of pendingFiles) {
      const success = await processFile(fileItem);
      if (success) {
        successCount++;
      } else {
        errorCount++;
        if (!skipOnError) break;
      }
    }
    
    setIsProcessing(false);
    
    if (successCount > 0) {
      toast({
        title: t('multi_upload_complete'),
        description: t('multi_upload_results', { success: successCount, errors: errorCount }),
      });
      onSuccess();
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setFiles([]);
    setCategory('other');
    setAutoAdd(true);
    setSkipOnError(true);
    onOpenChange(false);
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const warningCount = files.filter(f => f.status === 'warning').length;
  const totalProgress = files.length > 0 
    ? files.reduce((acc, f) => acc + f.progress, 0) / files.length 
    : 0;

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case 'pending':
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusText = (fileItem: FileItem) => {
    switch (fileItem.status) {
      case 'pending':
        return t('multi_upload_status_pending');
      case 'uploading':
        return t('multi_upload_status_uploading');
      case 'processing':
        return t('multi_upload_status_processing');
      case 'success':
        return t('multi_upload_status_success');
      case 'error':
        return fileItem.error || t('multi_upload_status_error');
      case 'warning':
        return `${t('multi_upload_status_warning')} (${fileItem.confidence}%)`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5" />
            {t('multi_upload_title')}
          </DialogTitle>
          <DialogDescription>
            {t('multi_upload_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative cursor-pointer rounded-lg border-2 border-dashed p-8
              transition-colors text-center
              ${isDragOver 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {t('multi_upload_drop_hint')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('multi_upload_formats')}
            </p>
          </div>

          {/* Settings */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('categories')}</Label>
              <Select 
                value={category} 
                onValueChange={(v) => setCategory(v as KbCategory)}
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {t(cat.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="autoAdd" 
                  checked={autoAdd} 
                  onCheckedChange={(v) => setAutoAdd(v === true)}
                  disabled={isProcessing}
                />
                <Label htmlFor="autoAdd" className="text-sm cursor-pointer">
                  {t('multi_upload_auto_add')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="skipOnError" 
                  checked={skipOnError} 
                  onCheckedChange={(v) => setSkipOnError(v === true)}
                  disabled={isProcessing}
                />
                <Label htmlFor="skipOnError" className="text-sm cursor-pointer">
                  {t('multi_upload_skip_errors')}
                </Label>
              </div>
            </div>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('multi_upload_files_count', { count: files.length })}</Label>
                {isProcessing && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(totalProgress)}%
                  </span>
                )}
              </div>
              
              {isProcessing && (
                <Progress value={totalProgress} className="h-2" />
              )}
              
              <ScrollArea className="h-48 rounded border">
                <div className="space-y-1 p-2">
                  {files.map((fileItem) => (
                    <div 
                      key={fileItem.id}
                      className="flex items-center gap-2 rounded p-2 text-sm hover:bg-muted/50"
                    >
                      {getStatusIcon(fileItem.status)}
                      <span className="flex-1 truncate">{fileItem.file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {getStatusText(fileItem)}
                      </span>
                      {fileItem.status === 'pending' && !isProcessing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFile(fileItem.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              {/* Summary */}
              {(successCount > 0 || errorCount > 0 || warningCount > 0) && (
                <div className="flex gap-4 text-xs">
                  {successCount > 0 && (
                    <span className="text-green-600">✓ {successCount}</span>
                  )}
                  {warningCount > 0 && (
                    <span className="text-yellow-600">⚠ {warningCount}</span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-destructive">✗ {errorCount}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {t('common:cancel', 'Չեղարկել')}
          </Button>
          <Button 
            onClick={handleStartUpload} 
            disabled={pendingCount === 0 || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('multi_upload_processing')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t('multi_upload_start', { count: pendingCount })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

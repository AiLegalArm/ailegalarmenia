import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  X,
  FolderUp,
  FileJson
} from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

interface KBBulkImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type FileStatus = 'pending' | 'reading' | 'importing' | 'success' | 'error';

interface JsonFileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  fileName: string;
  category: KbCategory;
  imported?: number;
  itemCount?: number;
}

const categories = kbCategoryOptions;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function KBBulkImport({ open, onOpenChange, onSuccess }: KBBulkImportProps) {
  const { t } = useTranslation(['kb', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<JsonFileItem[]>([]);
  const [globalCategory, setGlobalCategory] = useState<KbCategory>('other');
  const [clearExisting, setClearExisting] = useState(false);
  const [skipOnError, setSkipOnError] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: JsonFileItem[] = [];
    
    for (const file of fileArray) {
      if (!file.name.endsWith('.json') && !file.name.endsWith('.jsonl')) {
        toast.error(`${file.name}: Only .json and .jsonl files are accepted`);
        continue;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: File too large (max 100MB)`);
        continue;
      }
      
      const fileName = file.name.replace(/\.(jsonl?|json)$/i, '').replace(/^_+/, '');
      
      validFiles.push({
        id: crypto.randomUUID(),
        file,
        status: 'pending',
        progress: 0,
        fileName,
        category: globalCategory,
      });
    }
    
    setFiles(prev => [...prev, ...validFiles]);
  }, [t, globalCategory]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
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

  const updateFile = (id: string, updates: Partial<JsonFileItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const processFile = async (fileItem: JsonFileItem, isFirst: boolean): Promise<boolean> => {
    const { id, file, category } = fileItem;
    
    try {
      updateFile(id, { status: 'reading', progress: 20 });
      
      const textContent = await file.text();
      let items: unknown[];

      if (file.name.endsWith('.jsonl')) {
        // JSONL: one JSON object per line
        items = textContent
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .flatMap(l => {
            try {
              const parsed = JSON.parse(l);
              return Array.isArray(parsed) ? parsed : [parsed];
            } catch { return []; }
          });
      } else {
        let jsonData: unknown;
        try {
          jsonData = JSON.parse(textContent);
        } catch {
          throw new Error('Invalid JSON format');
        }
        items = Array.isArray(jsonData) ? jsonData : [jsonData];
      }
      
      updateFile(id, { progress: 40, itemCount: items.length });
      
      updateFile(id, { status: 'importing', progress: 60 });
      
      const { data, error: fnError } = await supabase.functions.invoke('kb-import', {
        body: {
          jsonItems: items,
          category,
          clearExisting: isFirst && clearExisting,
        },
      });
      
      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);
      
      updateFile(id, { 
        status: 'success', 
        progress: 100,
        imported: data.imported,
      });
      
      return true;
    } catch (error) {
      updateFile(id, { 
        status: 'error', 
        progress: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  };

  const handleStartImport = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;
    
    setIsProcessing(true);
    
    let successCount = 0;
    let errorCount = 0;
    let totalImported = 0;
    
    for (let i = 0; i < pendingFiles.length; i++) {
      const fileItem = pendingFiles[i];
      const success = await processFile(fileItem, i === 0);
      
      if (success) {
        successCount++;
        const updatedFile = files.find(f => f.id === fileItem.id);
        if (updatedFile?.imported) {
          totalImported += updatedFile.imported;
        }
      } else {
        errorCount++;
        if (!skipOnError) break;
      }
    }
    
    setIsProcessing(false);
    
    if (successCount > 0) {
      toast.success(`${t('document_uploaded')}: ${successCount} files, ${totalImported} articles`);
      onSuccess();
      // Chunking is handled automatically by the pipeline
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setFiles([]);
    setGlobalCategory('other');
    setClearExisting(false);
    setSkipOnError(true);
    onOpenChange(false);
  };

  const handleGlobalCategoryChange = (newCategory: KbCategory) => {
    setGlobalCategory(newCategory);
    setFiles(prev => prev.map(f => 
      f.status === 'pending' ? { ...f, category: newCategory } : f
    ));
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const totalProgress = files.length > 0 
    ? files.reduce((acc, f) => acc + f.progress, 0) / files.length 
    : 0;
  const totalImported = files.reduce((acc, f) => acc + (f.imported || 0), 0);

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case 'pending':
        return <FileJson className="h-4 w-4 text-muted-foreground" />;
      case 'reading':
      case 'importing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (fileItem: JsonFileItem) => {
    switch (fileItem.status) {
      case 'pending':
        return t('multi_upload_status_pending');
      case 'reading':
        return t('common:loading');
      case 'importing':
        return `${fileItem.itemCount || '...'} items`;
      case 'success':
        return `${fileItem.imported || 0} imported`;
      case 'error':
        return fileItem.error || t('common:error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5" />
            {t('bulk_json_import_title', 'JSON Bulk Import')}
          </DialogTitle>
          <DialogDescription>
            {t('bulk_json_import_description', 'Upload JSON files with arrays of knowledge base entries')}
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
              accept=".json,.jsonl"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {t('multi_upload_drop_hint')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JSON / JSONL (max 100MB) — [{'{'}title, content_text, ...{'}'}]
            </p>
          </div>

          {/* Settings */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('categories')}</Label>
              <Select 
                value={globalCategory} 
                onValueChange={(v) => handleGlobalCategoryChange(v as KbCategory)}
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
                  id="clearExisting" 
                  checked={clearExisting} 
                  onCheckedChange={(v) => setClearExisting(v === true)}
                  disabled={isProcessing}
                />
                <Label htmlFor="clearExisting" className="text-sm cursor-pointer">
                  {t('bulk_clear_existing', 'Clear existing entries')}
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
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{fileItem.fileName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {fileItem.file.name}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {getStatusText(fileItem)}
                      </span>
                      {fileItem.status === 'pending' && !isProcessing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
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
              {(successCount > 0 || errorCount > 0) && (
                <div className="flex gap-4 text-xs">
                  {successCount > 0 && (
                    <span className="text-green-600">
                      {'\u2713'} {successCount} files ({totalImported} entries)
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-destructive">{'\u2717'} {errorCount}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {t('common:cancel')}
          </Button>
          <Button 
            onClick={handleStartImport} 
            disabled={pendingCount === 0 || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common:loading')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t('upload_document')} ({pendingCount})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

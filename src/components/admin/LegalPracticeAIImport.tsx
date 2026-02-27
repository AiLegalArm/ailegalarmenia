import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  X,
  Brain,
  Sparkles
} from 'lucide-react';

interface LegalPracticeAIImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FileStatus = 'pending' | 'reading' | 'analyzing' | 'success' | 'error';

interface TxtFileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  title?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function LegalPracticeAIImport({ open, onOpenChange }: LegalPracticeAIImportProps) {
  const { t } = useTranslation(['kb', 'common']);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<TxtFileItem[]>([]);
  const [skipOnError, setSkipOnError] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: TxtFileItem[] = [];
    
    for (const file of fileArray) {
      const isTxt = file.name.endsWith('.txt');
      const isJson = file.name.endsWith('.json');
      const isPdf = file.name.endsWith('.pdf');
      if (!isTxt && !isJson && !isPdf) {
        toast.error(`${file.name}: ${t('common:error')} - TXT/JSON/PDF only`);
        continue;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: File too large (max 50MB)`);
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
  }, [t]);

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

  const updateFile = (id: string, updates: Partial<TxtFileItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const processFile = async (fileItem: TxtFileItem): Promise<boolean> => {
    const { id, file } = fileItem;
    
    try {
      updateFile(id, { status: 'reading', progress: 20 });
      let textContent = '';

      if (file.name.endsWith('.pdf')) {
        // Convert PDF to base64 and extract text via edge function
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);
        updateFile(id, { progress: 35 });

        const { data: ocrData, error: ocrError } = await supabase.functions.invoke('kb-fetch-pdf-content', {
          body: { pdfBase64: base64, filename: file.name },
        });
        if (ocrError) throw ocrError;
        textContent = ocrData?.text || ocrData?.content || '';
        if (!textContent) throw new Error('PDF text extraction failed');
      } else {
        const rawContent = await file.text();
        textContent = rawContent;
        // For JSON files, extract content_text or stringify
        if (file.name.endsWith('.json')) {
          try {
            const parsed = JSON.parse(rawContent);
            if (typeof parsed === 'object' && parsed !== null) {
              textContent = parsed.content_text || parsed.content || parsed.text || parsed.body || JSON.stringify(parsed, null, 2);
            }
          } catch {
            // Use raw content if JSON parsing fails
          }
        }
      }

      updateFile(id, { progress: 40 });
      updateFile(id, { status: 'analyzing', progress: 60 });
      
      const { data, error: fnError } = await supabase.functions.invoke('legal-practice-import', {
        body: {
          textContent,
          fileName: file.name.replace(/\.(txt|json|pdf)$/i, '').replace(/^_+/, ''),
        },
      });
      
      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);
      
      updateFile(id, { 
        status: 'success', 
        progress: 100,
        title: data.extracted?.title || file.name,
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
      toast.success(`AI Import: ${successCount} ${'\u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569'}`);
      queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
      // Chunking is handled automatically by the pipeline
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setFiles([]);
    setSkipOnError(true);
    onOpenChange(false);
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const totalProgress = files.length > 0 
    ? files.reduce((acc, f) => acc + f.progress, 0) / files.length 
    : 0;

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case 'pending':
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'reading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'analyzing':
        return <Brain className="h-4 w-4 animate-pulse text-purple-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (fileItem: TxtFileItem) => {
    switch (fileItem.status) {
      case 'pending':
        return '\u054D\u057A\u0561\u057D\u0578\u0582\u0574 \u0567';
      case 'reading':
        return '\u053F\u0561\u0580\u0564\u0561\u0581\u0578\u0582\u0574...';
      case 'analyzing':
        return 'AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0574...';
      case 'success':
        return fileItem.title || '\u0540\u0561\u057B\u0578\u0572\u057E\u0565\u0581';
      case 'error':
        return fileItem.error || '\u054D\u056D\u0561\u056C';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI {'\u0544\u0561\u057D\u057D\u0561\u0575\u0561\u056F\u0561\u0576 \u056B\u0574\u057A\u0578\u0580\u057F'}
          </DialogTitle>
          <DialogDescription>
            {'\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 TXT \u0586\u0561\u0575\u056C\u0565\u0580 \u0587 AI-\u0568 \u056B\u0576\u0584\u0576\u0561\u0577\u056D\u0561\u057F\u0578\u0580\u0565\u0576 \u056F\u056C\u0578\u0582\u056E\u0584\u056B \u0562\u0578\u056C\u0578\u0580 \u0564\u0561\u0577\u057F\u0565\u0580\u0568'}
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
                ? 'border-purple-500 bg-purple-500/5' 
                : 'border-muted-foreground/25 hover:border-purple-500/50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Brain className="mx-auto h-10 w-10 text-purple-500" />
            <p className="mt-2 text-sm font-medium">
              {'\u0554\u0561\u0577\u0565\u0584 \u056F\u0561\u0574 \u0562\u0565\u0580\u0565\u0584 TXT / JSON / PDF \u0586\u0561\u0575\u056C\u0565\u0580'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              AI-{'\u0568 \u0561\u057E\u057F\u0578\u0574\u0561\u057F \u056C\u0580\u0561\u0581\u0576\u0565\u056C\u0578\u0582 \u0567 \u0562\u0578\u056C\u0578\u0580 \u0564\u0561\u0577\u057F\u0565\u0580\u0568'}
            </p>
          </div>

          {/* Settings */}
          <div className="flex items-center gap-2">
            <Checkbox 
              id="skipOnError" 
              checked={skipOnError} 
              onCheckedChange={(v) => setSkipOnError(v === true)}
              disabled={isProcessing}
            />
            <Label htmlFor="skipOnError" className="text-sm cursor-pointer">
              {'\u054D\u056D\u0561\u056C\u056B \u0564\u0565\u057A\u0584\u0578\u0582\u0574 \u0577\u0561\u0580\u0578\u0582\u0576\u0561\u056F\u0565\u056C'}
            </Label>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{files.length} {'\u0586\u0561\u0575\u056C'}</Label>
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
                        <p className="truncate font-medium">{fileItem.file.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 max-w-[200px] truncate">
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
                      {'\u2713'} {successCount}
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
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI {'\u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0574...'}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI {'\u053B\u0574\u057A\u0578\u0580\u057F'} ({pendingCount})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

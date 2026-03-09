import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  Download,
  Send,
  FileCheck
} from 'lucide-react';

// Constants
const CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_LANGUAGE = 'hy'; // Armenian
const SUCCESS_DIALOG_DELAY = 1500; // ms

interface CasePdfUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  onSuccess?: () => void;
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'extracted' | 'analyzing' | 'success' | 'error';

export function CasePdfUpload({ open, onOpenChange, caseId, onSuccess }: CasePdfUploadProps) {
  const { t } = useTranslation(['cases', 'common', 'ocr']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [storageFileName, setStorageFileName] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    if (!validTypes.includes(file.type)) {
      toast.error(t('ocr:unsupported_format'));
      return;
    }

    // Check file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('ocr:file_too_large'));
      return;
    }

    setSelectedFile(file);
    setStatus('idle');
    setError(null);
    setExtractedText('');
    setAiAnalysis('');
    setConfidence(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(10);
    setError(null);

    try {
      // 1. Upload file to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `case-${caseId}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;
      setStorageFileName(fileName);
      setProgress(30);

      // 2. Get signed URL for OCR
      const { data: signedData, error: signError } = await supabase.storage
        .from('case-files')
        .createSignedUrl(fileName, 3600);

      if (signError || !signedData?.signedUrl) throw signError || new Error('Failed to get signed URL');
      setProgress(40);

      // 3. Call OCR function
      setStatus('processing');
      
      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-process', {
        body: {
          fileUrl: signedData.signedUrl,
          fileName: selectedFile.name,
        },
      });

      if (ocrError) throw ocrError;
      setProgress(70);

      if (ocrData.error) {
        throw new Error(ocrData.error);
      }

      setExtractedText(ocrData.extracted_text || '');
      setConfidence(ocrData.confidence_score || null);
      setProgress(100);
      setStatus('extracted');

      // Show warning if low confidence
      if (ocrData.needs_review) {
        toast.warning(t('ocr:low_quality_warning'));
      } else {
        toast.success(t('ocr:processing_complete'));
      }

    } catch (err) {
      console.error('PDF upload error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
      toast.error(t('errors:upload_failed'));
    }
  };

  const handleExportTxt = () => {
    if (!extractedText) return;

    const blob = new Blob([extractedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedFile?.name.replace(/\.[^/.]+$/, '')}_extracted.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(t('cases:text_exported'));
  };

  const handleSendForAnalysis = async () => {
    if (!extractedText) return;

    setStatus('analyzing');
    setProgress(0);

    try {
      // Call AI analysis function (using existing legal analysis)
      const { data, error } = await supabase.functions.invoke('analyze-legal-case', {
        body: {
          caseId,
          role: 'advocate',
          facts: extractedText,
          legalQuestion: 'Analyze the content of this document',
        },
      });

      if (error) throw error;

      setAiAnalysis(data.analysis || 'Analysis completed');
      setProgress(100);
      toast.success(t('cases:analysis_complete'));
      setStatus('extracted'); // Return to extracted state to allow approval

    } catch (err) {
      console.error('AI analysis error:', err);
      toast.error(t('errors:analysis_failed'));
      setStatus('extracted');
    }
  };

  const handleAttachToCase = async () => {
    if (!selectedFile || !storageFileName) return;

    try {
      // Insert file record into case_files table
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: fileData, error: insertError } = await supabase
        .from('case_files')
        .insert({
          case_id: caseId,
          filename: selectedFile.name,
          original_filename: selectedFile.name,
          storage_path: storageFileName,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // If OCR was performed, save the result
      if (extractedText && fileData) {
        const { error: ocrError } = await supabase
          .from('ocr_results')
          .insert({
            file_id: fileData.id,
            extracted_text: extractedText,
            confidence: confidence,
            needs_review: confidence ? confidence < CONFIDENCE_THRESHOLD : false,
            language: DEFAULT_LANGUAGE,
          });

        if (ocrError) console.error('OCR result save error:', ocrError);
      }

      setStatus('success');
      toast.success(t('cases:file_attached_successfully'));
      
      if (onSuccess) {
        onSuccess();
      }

      // Reset after a short delay
      setTimeout(() => {
        handleClose();
      }, SUCCESS_DIALOG_DELAY);

    } catch (err) {
      console.error('Attach file error:', err);
      toast.error(t('errors:attach_failed'));
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setExtractedText('');
    setAiAnalysis('');
    setConfidence(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
    setStorageFileName(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('cases:attach_pdf_to_case')}
          </DialogTitle>
          <DialogDescription>
            {t('cases:pdf_upload_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection */}
          <div className="space-y-2">
            <Label>{t('common:files')}</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tiff"
                onChange={handleFileSelect}
                className="flex-1"
                disabled={status !== 'idle' && status !== 'extracted'}
              />
            </div>
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Upload Button */}
          {selectedFile && status === 'idle' && (
            <Button onClick={handleUpload} className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              {t('ocr:ocr_title')}
            </Button>
          )}

          {/* Progress */}
          {(status === 'uploading' || status === 'processing' || status === 'analyzing') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  {status === 'uploading' && t('common:loading')}
                  {status === 'processing' && t('ocr:processing')}
                  {status === 'analyzing' && t('cases:analyzing')}
                </span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Success - Show extracted text */}
          {status === 'extracted' && extractedText && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">{t('ocr:processing_complete')}</span>
                {confidence !== null && (
                  <Badge variant="outline">
                    {t('ocr:confidence')}: {(confidence * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('ocr:extracted_text')}</Label>
                <Textarea
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  className="min-h-[200px] max-h-60 overflow-y-auto font-mono text-sm"
                  placeholder={t('ocr:extracted_text')}
                />
                <p className="text-sm text-muted-foreground">
                  {extractedText.length} {t('common:characters')}
                </p>
              </div>

              {/* AI Analysis Result */}
              {aiAnalysis && (
                <div className="space-y-2">
                  <Label>{t('cases:ai_analysis_result')}</Label>
                  <div className="rounded-md border bg-muted/50 p-3">
                    <pre className="whitespace-pre-wrap text-sm">{aiAnalysis}</pre>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleExportTxt}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('cases:export_txt')}
                </Button>
                <Button variant="outline" onClick={handleSendForAnalysis}>
                  <Send className="mr-2 h-4 w-4" />
                  {t('cases:send_for_analysis')}
                </Button>
                <Button onClick={handleAttachToCase} className="flex-1">
                  <FileCheck className="mr-2 h-4 w-4" />
                  {t('cases:attach_to_case')}
                </Button>
              </div>
            </div>
          )}

          {/* Final Success */}
          {status === 'success' && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500 bg-green-500/10 p-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-400">
                {t('cases:file_attached_successfully')}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

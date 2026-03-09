import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

interface KBPdfUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data: {
    title: string;
    content_text: string;
    category: KbCategory;
    source_name: string;
  }) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

const categories = kbCategoryOptions;

export function KBPdfUpload({ open, onOpenChange, onSuccess }: KBPdfUploadProps) {
  const { t } = useTranslation(['kb', 'common', 'ocr']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<KbCategory>('other');
  const [extractedText, setExtractedText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(10);
    setError(null);

    try {
      // 1. Upload file to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `kb-import/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;
      setProgress(40);

      // 2. Get signed URL for OCR
      const { data: signedData, error: signError } = await supabase.storage
        .from('case-files')
        .createSignedUrl(fileName, 3600);

      if (signError || !signedData?.signedUrl) throw signError || new Error('Failed to get signed URL');
      setProgress(50);

      // 3. Call OCR function
      setStatus('processing');
      
      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-process', {
        body: {
          fileUrl: signedData.signedUrl,
          fileName: selectedFile.name,
        },
      });

      if (ocrError) throw ocrError;
      setProgress(90);

      if (ocrData.error) {
        throw new Error(ocrData.error);
      }

      setExtractedText(ocrData.extracted_text || '');
      setConfidence(ocrData.confidence_score || null);
      setProgress(100);
      setStatus('success');

      // Show warning if low confidence
      if (ocrData.needs_review) {
        toast.warning(t('ocr:low_quality_warning'));
      }

    } catch (err) {
      console.error('PDF upload error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
      toast.error(t('errors:upload_failed'));
    }
  };

  const handleAddToKB = () => {
    if (!extractedText) return;

    onSuccess({
      title: selectedFile?.name.replace(/\.[^/.]+$/, '') || 'Imported Document',
      content_text: extractedText,
      category,
      source_name: `PDF Import: ${selectedFile?.name || 'Unknown'}`,
    });

    // Reset state
    setSelectedFile(null);
    setExtractedText('');
    setConfidence(null);
    setStatus('idle');
    setProgress(0);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setExtractedText('');
    setConfidence(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('kb:upload_document')}
          </DialogTitle>
          <DialogDescription>
            {t('kb:supported_formats')}
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
              />
            </div>
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label>{t('kb:categories')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as KbCategory)}>
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

          {/* Upload Button */}
          {selectedFile && status === 'idle' && (
            <Button onClick={handleUpload} className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              {t('ocr:ocr_title')}
            </Button>
          )}

          {/* Progress */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  {status === 'uploading' ? t('common:loading') : t('ocr:processing')}
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
          {status === 'success' && extractedText && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">{t('ocr:processing_complete')}</span>
                {confidence !== null && (
                  <span className="text-sm text-muted-foreground">
                    ({t('ocr:confidence')}: {(confidence * 100).toFixed(0)}%)
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('ocr:extracted_text')}</Label>
                <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/50 p-3">
                  <pre className="whitespace-pre-wrap text-sm">{extractedText}</pre>
                </div>
                <p className="text-sm text-muted-foreground">
                  {extractedText.length} {t('common:characters', 'characters')}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  {t('common:cancel')}
                </Button>
                <Button onClick={handleAddToKB} className="flex-1">
                  {t('ocr:add_to_kb')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

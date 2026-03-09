import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getText } from "@/lib/i18n-utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, X, CheckCircle, AlertCircle, Files, Image, Brain } from "lucide-react";

interface UploadedFileState {
  id: string;
  file: File;
  status: "pending" | "processing" | "success" | "error";
  extractedText: string;
  errorMessage?: string;
}

interface DocumentFileUploadProps {
  onFileAnalyzed: (extractedText: string) => void;
  isDisabled?: boolean;
  documentType?: string; // appeal, cassation, etc.
  caseData?: {
    title?: string;
    case_number?: string;
    case_type?: string;
    court?: string;
    facts?: string;
    description?: string;
  };
}

// Helper to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result); // Return full data URL
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper to get MIME type
function getMimeType(file: File): string {
  if (file.type) return file.type;
  
  const ext = file.name.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword'
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export function DocumentFileUpload({ onFileAnalyzed, isDisabled, documentType, caseData }: DocumentFileUploadProps) {
  const { i18n, t } = useTranslation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileState[]>([]);
  const [analysisResult, setAnalysisResult] = useState<string>("");

  // Check if this is an appeal/cassation document type that needs AI analysis
  const needsAIAnalysis = documentType === 'appeal' || documentType === 'cassation' || 
                          (documentType?.includes('appeal') || documentType?.includes('cassation'));

  // Combine all extracted texts and send to parent
  const updateParentWithAllTexts = useCallback((files: UploadedFileState[], analysis?: string) => {
    if (analysis) {
      // If we have AI analysis, use that instead of raw extraction
      onFileAnalyzed(analysis);
    } else {
      const combinedText = files
        .filter(f => f.status === "success" && f.extractedText)
        .map((f, idx) => `--- FILE ${idx + 1}: ${f.file.name} ---\n${f.extractedText}`)
        .join("\n\n");
      onFileAnalyzed(combinedText);
    }
  }, [onFileAnalyzed]);

  const processFile = useCallback(async (fileState: UploadedFileState): Promise<UploadedFileState> => {
    const { file } = fileState;
    
    try {
      const fileName = file.name;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'].includes(ext);
      const isPdf = ext === 'pdf';
      const isDocx = ext === 'docx';
      const isDoc = ext === 'doc';
      const isText = ['txt', 'md'].includes(ext) || file.type.startsWith("text/");

      let text = "";

      // Handle legacy .doc files
      if (isDoc) {
        return { 
          ...fileState, 
          status: "error", 
          extractedText: "",
          errorMessage: i18n.language === 'hy' 
            ? '.doc \u0571\u0587\u0561\u0579\u0561\u0583\u0568 \u0579\u056B \u0561\u057B\u0561\u056F\u0581\u057E\u0578\u0582\u0574: \u0553\u0578\u056D\u0561\u0580\u056F\u0565\u0584 DOCX \u056F\u0561\u0574 PDF' 
            : i18n.language === 'en' 
            ? "Legacy .doc format not supported. Convert to DOCX or PDF." 
            : "\u0424\u043E\u0440\u043C\u0430\u0442 .doc \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F. \u041A\u043E\u043D\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0432 DOCX \u0438\u043B\u0438 PDF."
        };
      }

      // Handle plain text files - read directly
      if (isText) {
        text = await file.text();
      } 
      // Handle images, PDFs, DOCX - send to OCR function with base64
      else if (isImage || isPdf || isDocx) {
        const dataUrl = await fileToBase64(file);
        
        console.log(`Processing ${fileName}: size=${Math.round(dataUrl.length / 1024)}KB`);

        const { data, error } = await supabase.functions.invoke("ocr-process", {
          body: {
            fileUrl: dataUrl,
            fileName: fileName,
            language: i18n.language === "hy" ? "hye" : i18n.language === "ru" ? "rus" : "eng"
          }
        });

        if (error) {
          console.error("OCR error:", error);
          throw new Error(error.message || "OCR processing failed");
        }
        
        if (data?.error) {
          throw new Error(data.error);
        }
        
        // Handle both response formats
        text = data?.extracted_text || data?.text || "";
        
        if (!text) {
          throw new Error("No text extracted from file");
        }
      } else {
        throw new Error("Unsupported file type");
      }

      if (!text.trim()) {
        throw new Error("No text extracted");
      }

      return { ...fileState, status: "success", extractedText: text };
    } catch (error: any) {
      console.error("File processing error:", error);
      return { 
        ...fileState, 
        status: "error", 
        extractedText: "",
        errorMessage: error.message || "Failed to process file"
      };
    }
  }, [i18n.language]);

  // Run AI analysis on all files for complaint generation
  const runAIAnalysis = useCallback(async (files: UploadedFileState[]) => {
    const successFiles = files.filter(f => f.status === "success");
    if (successFiles.length === 0) return;

    setIsAnalyzing(true);
    
    try {
      // Prepare files for AI analysis
      const filesForAnalysis = await Promise.all(
        successFiles.map(async (f) => {
          const dataUrl = await fileToBase64(f.file);
          return {
            name: f.file.name,
            content: dataUrl,
            type: getMimeType(f.file)
          };
        })
      );

      const { data, error } = await supabase.functions.invoke("analyze-files-for-complaint", {
        body: {
          files: filesForAnalysis,
          caseData: caseData || null,
          documentType: documentType || 'appeal',
          language: i18n.language
        }
      });

      if (error) {
        console.error("AI analysis error:", error);
        toast({
          title: i18n.language === 'hy' ? '\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0571\u0561\u056D\u0578\u0572\u057E\u0565\u0581' : 
                 i18n.language === 'en' ? "Analysis failed" : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u043D\u0430\u043B\u0438\u0437\u0430",
          description: error.message,
          variant: "destructive",
        });
        // Fall back to raw text
        updateParentWithAllTexts(files);
        return;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const analysis = data?.analysis || "";
      setAnalysisResult(analysis);
      updateParentWithAllTexts(files, analysis);

      toast({
        title: i18n.language === 'hy' ? 'AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0561\u057E\u0561\u0580\u057F\u057E\u0561\u056E \u0567' : 
               i18n.language === 'en' ? "AI analysis complete" : "AI-\u0430\u043D\u0430\u043B\u0438\u0437 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D",
        description: i18n.language === 'hy' ? `${successFiles.length} \u0586\u0561\u0575\u056C \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u057E\u0565\u0581` : 
                     i18n.language === 'en' ? `${successFiles.length} file(s) analyzed` : 
                     `${successFiles.length} \u0444\u0430\u0439\u043B(\u043E\u0432) \u043F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043E`,
      });

    } catch (error: any) {
      console.error("AI analysis error:", error);
      toast({
        title: i18n.language === 'hy' ? '\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0571\u0561\u056D\u0578\u0572\u057E\u0565\u0581' : 
               i18n.language === 'en' ? "Analysis failed" : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u043D\u0430\u043B\u0438\u0437\u0430",
        description: error.message,
        variant: "destructive",
      });
      // Fall back to raw text
      updateParentWithAllTexts(files);
    } finally {
      setIsAnalyzing(false);
    }
  }, [caseData, documentType, i18n.language, toast, updateParentWithAllTexts]);

  const processAllFiles = useCallback(async (newFiles: UploadedFileState[]) => {
    setIsProcessing(true);
    
    const results: UploadedFileState[] = [];
    
    for (let i = 0; i < newFiles.length; i++) {
      // Update status to processing
      setUploadedFiles(prev => prev.map(f => 
        f.id === newFiles[i].id ? { ...f, status: "processing" } : f
      ));
      
      const result = await processFile(newFiles[i]);
      results.push(result);
      
      // Update with result
      setUploadedFiles(prev => {
        const updated = prev.map(f => f.id === result.id ? result : f);
        // Don't update parent yet if we need AI analysis
        if (!needsAIAnalysis) {
          updateParentWithAllTexts(updated);
        }
        return updated;
      });
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    if (successCount > 0 && !needsAIAnalysis) {
      toast({
        title: i18n.language === 'hy' ? '\u0556\u0561\u0575\u056C\u0565\u0580\u0568 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u057E\u0565\u0581' : 
               i18n.language === 'en' ? "Files analyzed" : "\u0424\u0430\u0439\u043B\u044B \u043F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u044B",
        description: i18n.language === 'hy' ? `${successCount} \u0586\u0561\u0575\u056C \u0574\u0577\u0561\u056F\u057E\u0565\u0581` : 
                     i18n.language === 'en' ? `${successCount} file(s) processed` : 
                     `${successCount} \u0444\u0430\u0439\u043B(\u043E\u0432) \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E`,
      });
    }

    if (errorCount > 0) {
      toast({
        title: i18n.language === 'hy' ? '\u0548\u0580\u0578\u0577 \u0586\u0561\u0575\u056C\u0565\u0580 \u0579\u0570\u0561\u057B\u0578\u0572\u057E\u0565\u0581\u056B\u0576' : 
               i18n.language === 'en' ? "Some files failed" : "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438",
        description: i18n.language === 'hy' ? `${errorCount} \u0586\u0561\u0575\u056C \u0579\u0574\u0577\u0561\u056F\u057E\u0565\u0581` : 
                     i18n.language === 'en' ? `${errorCount} file(s) failed` : 
                     `${errorCount} \u0444\u0430\u0439\u043B(\u043E\u0432) \u043D\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E`,
        variant: "destructive",
      });
    }

    setIsProcessing(false);

    // If we need AI analysis and have successful files, run it
    if (needsAIAnalysis && successCount > 0) {
      // Get all current files including new results
      setUploadedFiles(prev => {
        const allFiles = prev.map(f => {
          const newResult = results.find(r => r.id === f.id);
          return newResult || f;
        });
        // Run AI analysis on all successful files
        const allSuccessful = allFiles.filter(f => f.status === "success");
        if (allSuccessful.length > 0) {
          runAIAnalysis(allFiles);
        }
        return allFiles;
      });
    }
  }, [processFile, updateParentWithAllTexts, toast, i18n.language, needsAIAnalysis, runAIAnalysis]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFileStates: UploadedFileState[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Check file size (15MB limit for base64)
      if (file.size > 15 * 1024 * 1024) {
        toast({
          title: i18n.language === 'hy' ? "\u0556\u0561\u0575\u056C\u0568 \u0579\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0567" : 
                 i18n.language === 'en' ? "File too large" : "\u0424\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439",
          description: `${file.name}: max 15MB`,
          variant: "destructive",
        });
        continue;
      }
      
      newFileStates.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
        extractedText: ""
      });
    }

    if (newFileStates.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFileStates]);
      processAllFiles(newFileStates);
    }

    // Reset input
    e.target.value = '';
  }, [processAllFiles, toast, i18n.language]);

  const handleRemoveFile = useCallback((id: string) => {
    setUploadedFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (!needsAIAnalysis) {
        updateParentWithAllTexts(updated);
      } else if (updated.length === 0) {
        setAnalysisResult("");
        onFileAnalyzed("");
      }
      return updated;
    });
  }, [updateParentWithAllTexts, needsAIAnalysis, onFileAnalyzed]);

  const handleClearAll = useCallback(() => {
    setUploadedFiles([]);
    setAnalysisResult("");
    onFileAnalyzed("");
  }, [onFileAnalyzed]);

  // Manually trigger AI analysis
  const handleRunAnalysis = useCallback(() => {
    const successFiles = uploadedFiles.filter(f => f.status === "success");
    if (successFiles.length > 0) {
      runAIAnalysis(uploadedFiles);
    }
  }, [uploadedFiles, runAIAnalysis]);

  const successCount = uploadedFiles.filter(f => f.status === "success").length;
  const totalChars = uploadedFiles
    .filter(f => f.status === "success")
    .reduce((sum, f) => sum + f.extractedText.length, 0);

  // Labels based on language
  const labels = {
    uploadLabel: needsAIAnalysis 
      ? getText("\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 AI-\u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u0561\u0574\u0561\u0580", "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u043B\u044F AI-\u0430\u043D\u0430\u043B\u0438\u0437\u0430", "Upload documents for AI analysis")
      : getText("\u053F\u0561\u0574 \u057E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580", "\u0418\u043B\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B", "Or upload documents"),
    dropzone: getText("PDF, \u0576\u056F\u0561\u0580\u0576\u0565\u0580, \u057F\u0565\u0584\u057D\u057F", "PDF, \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F, \u0442\u0435\u043A\u0441\u0442", "PDF, images, text"),
    supports: getText("\u0531\u057B\u0561\u056F\u0581\u057E\u0578\u0582\u0574 \u0567 PDF, JPG, PNG, DOCX", "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 PDF, JPG, PNG, DOCX", "Supports PDF, JPG, PNG, DOCX"),
    files: getText(" \u0586\u0561\u0575\u056C", "\u0444\u0430\u0439\u043B(\u043E\u0432)", "file(s)"),
    chars: getText("\u0576\u0577\u0561\u0576", "\u0441\u0438\u043C\u0432", "chars"),
    clearAll: getText("\u0544\u0561\u0584\u0580\u0565\u056C", "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C", "Clear all"),
    waiting: getText("\u054D\u057A\u0561\u057D\u0578\u0582\u0574...", "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435...", "Waiting..."),
    analyzing: getText("\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0574...", "\u0410\u043D\u0430\u043B\u0438\u0437...", "Analyzing..."),
    failed: getText("\u054D\u056D\u0561\u056C", "\u041E\u0448\u0438\u0431\u043A\u0430", "Failed"),
    runAnalysis: getText("AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C AI-\u0430\u043D\u0430\u043B\u0438\u0437", "Run AI Analysis"),
    aiAnalyzing: getText("AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0574...", "AI-\u0430\u043D\u0430\u043B\u0438\u0437...", "AI analyzing..."),
    aiComplete: getText("AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0561\u057E\u0561\u0580\u057F\u057E\u0561\u056E \u0567", "AI-\u0430\u043D\u0430\u043B\u0438\u0437 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D", "AI analysis complete"),
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        {needsAIAnalysis ? <Brain className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        {labels.uploadLabel}
      </Label>

      {/* Upload Zone */}
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
        <input
          type="file"
          id="document-upload-multi"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.tif,.txt,.md,.docx"
          onChange={handleFileSelect}
          disabled={isDisabled || isProcessing || isAnalyzing}
          multiple
        />
        <label
          htmlFor="document-upload-multi"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Files className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {labels.dropzone}
          </span>
          <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
            <Image className="h-3 w-3" />
            {labels.supports}
          </span>
        </label>
      </div>

      {/* Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Files className="h-3 w-3" />
              {uploadedFiles.length} {labels.files}
              {successCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {totalChars} {labels.chars}
                </Badge>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isProcessing || isAnalyzing}
              className="text-xs h-7"
            >
              <X className="h-3 w-3 mr-1" />
              {labels.clearAll}
            </Button>
          </div>

          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {uploadedFiles.map((fileState) => (
              <div
                key={fileState.id}
                className="border rounded-lg p-3 bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {fileState.status === "processing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    ) : fileState.status === "success" ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : fileState.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{fileState.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fileState.status === "pending" && labels.waiting}
                        {fileState.status === "processing" && labels.analyzing}
                        {fileState.status === "success" && (
                          <>{fileState.extractedText.length} {labels.chars}</>
                        )}
                        {fileState.status === "error" && (
                          <span className="text-destructive">
                            {fileState.errorMessage || labels.failed}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(fileState.id)}
                    disabled={fileState.status === "processing" || isAnalyzing}
                    className="flex-shrink-0 h-7 w-7"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Preview extracted text - only show if not using AI analysis */}
                {!needsAIAnalysis && fileState.status === "success" && fileState.extractedText && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground bg-background/50 rounded p-2 max-h-16 overflow-auto whitespace-pre-wrap">
                      {fileState.extractedText.slice(0, 200)}
                      {fileState.extractedText.length > 200 && "..."}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* AI Analysis Status/Button */}
          {needsAIAnalysis && successCount > 0 && (
            <div className="border rounded-lg p-3 bg-primary/5">
              {isAnalyzing ? (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {labels.aiAnalyzing}
                </div>
              ) : analysisResult ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    {labels.aiComplete}
                  </div>
                  <p className="text-xs text-muted-foreground bg-background/50 rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">
                    {analysisResult.slice(0, 500)}
                    {analysisResult.length > 500 && "..."}
                  </p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunAnalysis}
                  disabled={isProcessing}
                  className="w-full"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  {labels.runAnalysis}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, X, FileText, Image, File, Loader2, 
  CheckCircle, AlertCircle, Eye, Paperclip 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// =============================================================================
// TYPES
// =============================================================================

export interface UploadedFile {
  id: string;
  file: File;
  description: string;
  status: "pending" | "processing" | "success" | "error";
  extractedText: string;
  errorMessage?: string;
  previewUrl?: string;
}

interface EnhancedFileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onExtractedTextChange: (text: string) => void;
  isDisabled?: boolean;
  maxFiles?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getFileIcon(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    return <Image className="h-4 w-4 text-green-500" />;
  }
  if (ext === "pdf") {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  if (["doc", "docx"].includes(ext)) {
    return <FileText className="h-4 w-4 text-blue-500" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" />;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EnhancedFileUpload({
  files,
  onFilesChange,
  onExtractedTextChange,
  isDisabled = false,
  maxFiles = 10
}: EnhancedFileUploadProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);

  // Labels
  const labels = {
    title: lang === "hy" ? "\u053f\u0561\u0574 \u057e\u0565\u0580\u0562\u0565\u057c\u0576\u0565\u0584 \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580" : lang === "ru" ? "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b" : "Upload documents",
    dropzone: lang === "hy" ? "PDF, \u0576\u056f\u0561\u0580\u0576\u0565\u0580, DOCX" : lang === "ru" ? "PDF, \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f, DOCX" : "PDF, images, DOCX",
    maxSize: lang === "hy" ? "\u0544\u0561\u0584\u057d. 15MB" : lang === "ru" ? "\u041c\u0430\u043a\u0441. 15MB" : "Max 15MB",
    description: lang === "hy" ? "\u0546\u056f\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : lang === "ru" ? "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435" : "Description",
    descPlaceholder: lang === "hy" ? "\u0555\u0580\u056b\u0576\u0561\u056f\u055d \u054a\u0561\u0575\u0574\u0561\u0576\u0561\u0563\u056b\u0580 01.01.2025" : lang === "ru" ? "\u041d\u0430\u043f\u0440.: \u0414\u043e\u0433\u043e\u0432\u043e\u0440 \u043e\u0442 01.01.2025" : "e.g. Contract from 01.01.2025",
    attachment: lang === "hy" ? "\u0540\u0561\u057e\u0565\u056c\u057e\u0561\u056e" : lang === "ru" ? "\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435" : "Attachment",
    processing: lang === "hy" ? "\u0544\u0577\u0561\u056f\u057e\u0578\u0582\u0574 \u0567..." : lang === "ru" ? "\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430..." : "Processing...",
    success: lang === "hy" ? "\u0544\u0577\u0561\u056f\u057e\u0565\u0581" : lang === "ru" ? "\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043e" : "Processed",
    error: lang === "hy" ? "\u054d\u056d\u0561\u056c" : lang === "ru" ? "\u041e\u0448\u0438\u0431\u043a\u0430" : "Error",
    preview: lang === "hy" ? "\u0544\u0561\u0575\u0580\u0561\u0564\u056b\u057f\u0565\u056c" : lang === "ru" ? "\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440" : "Preview",
    close: lang === "hy" ? "\u0553\u0561\u056f\u0565\u056c" : lang === "ru" ? "\u0417\u0430\u043a\u0440\u044b\u0442\u044c" : "Close",
  };

  // Process file with OCR
  const processFile = useCallback(async (uploadedFile: UploadedFile): Promise<UploadedFile> => {
    const { file } = uploadedFile;
    
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isImage = ["jpg", "jpeg", "png", "webp", "tiff", "tif"].includes(ext);
      const isPdf = ext === "pdf";
      const isDocx = ext === "docx";
      const isText = ["txt", "md"].includes(ext) || file.type.startsWith("text/");

      let text = "";

      if (isText) {
        text = await file.text();
      } else if (isImage || isPdf || isDocx) {
        const dataUrl = await fileToBase64(file);
        
        const { data, error } = await supabase.functions.invoke("ocr-process", {
          body: {
            fileUrl: dataUrl,
            fileName: file.name,
            language: lang === "hy" ? "hye" : lang === "ru" ? "rus" : "eng"
          }
        });

        if (error) throw new Error(error.message || "OCR failed");
        text = data?.extracted_text || data?.text || "";
        if (!text) throw new Error("No text extracted");
      } else {
        throw new Error("Unsupported file type");
      }

      // Create preview URL for images
      let previewUrl: string | undefined;
      if (isImage) {
        previewUrl = URL.createObjectURL(file);
      }

      return { ...uploadedFile, status: "success", extractedText: text, previewUrl };
    } catch (error: any) {
      console.error("File processing error:", error);
      return { 
        ...uploadedFile, 
        status: "error", 
        extractedText: "",
        errorMessage: error.message || "Processing failed"
      };
    }
  }, [lang]);

  // Update combined extracted text
  const updateCombinedText = useCallback((updatedFiles: UploadedFile[]) => {
    const combinedText = updatedFiles
      .filter(f => f.status === "success" && f.extractedText)
      .map((f, idx) => {
        const desc = f.description ? ` - ${f.description}` : "";
        return `--- ${labels.attachment} ${idx + 1}: ${f.file.name}${desc} ---\n${f.extractedText}`;
      })
      .join("\n\n");
    onExtractedTextChange(combinedText);
  }, [onExtractedTextChange, labels.attachment]);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`${file.name}: ${labels.maxSize}`);
        continue;
      }
      
      if (files.length + newFiles.length >= maxFiles) {
        toast.error(lang === "hy" ? `\u0544\u0561\u0584\u057d. ${maxFiles} \u0586\u0561\u0575\u056c` : lang === "ru" ? `\u041c\u0430\u043a\u0441. ${maxFiles} \u0444\u0430\u0439\u043b\u043e\u0432` : `Max ${maxFiles} files`);
        break;
      }

      newFiles.push({
        id: `file-${Date.now()}-${i}`,
        file,
        description: "",
        status: "pending",
        extractedText: ""
      });
    }

    if (newFiles.length === 0) return;

    // Add files immediately
    const allFiles = [...files, ...newFiles];
    onFilesChange(allFiles);

    // Process files
    setIsProcessing(true);
    
    for (let i = 0; i < newFiles.length; i++) {
      const fileToProcess = newFiles[i];
      
      // Update status to processing
      const updatingFiles = allFiles.map(f => 
        f.id === fileToProcess.id ? { ...f, status: "processing" as const } : f
      );
      onFilesChange(updatingFiles);
      
      const result = await processFile(fileToProcess);
      
      // Update with result
      const resultFiles = updatingFiles.map(f => f.id === result.id ? result : f);
      onFilesChange(resultFiles);
      updateCombinedText(resultFiles);
    }

    setIsProcessing(false);
    e.target.value = "";
  }, [files, maxFiles, onFilesChange, processFile, updateCombinedText, lang, labels.maxSize]);

  // Update file description
  const updateDescription = useCallback((id: string, description: string) => {
    const updated = files.map(f => f.id === id ? { ...f, description } : f);
    onFilesChange(updated);
    updateCombinedText(updated);
  }, [files, onFilesChange, updateCombinedText]);

  // Remove file
  const removeFile = useCallback((id: string) => {
    const file = files.find(f => f.id === id);
    if (file?.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }
    const updated = files.filter(f => f.id !== id);
    onFilesChange(updated);
    updateCombinedText(updated);
  }, [files, onFilesChange, updateCombinedText]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          {labels.title}
          {files.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {files.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Zone */}
        <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.txt,.docx"
            onChange={handleFileSelect}
            className="hidden"
            id="enhanced-file-upload"
            disabled={isDisabled || isProcessing}
          />
          <label
            htmlFor="enhanced-file-upload"
            className={cn(
              "cursor-pointer flex flex-col items-center gap-2",
              (isDisabled || isProcessing) && "cursor-not-allowed opacity-50"
            )}
          >
            {isProcessing ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {isProcessing ? labels.processing : labels.dropzone}
            </span>
            <span className="text-xs text-muted-foreground">{labels.maxSize}</span>
          </label>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-3">
              {files.map((uploadedFile, idx) => (
                <div
                  key={uploadedFile.id}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    uploadedFile.status === "error" && "border-destructive/50 bg-destructive/5",
                    uploadedFile.status === "success" && "border-green-500/30 bg-green-500/5",
                    uploadedFile.status === "processing" && "border-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Attachment Number */}
                    <Badge variant="outline" className="shrink-0 mt-1">
                      {idx + 1}
                    </Badge>

                    {/* File Icon & Preview */}
                    <div className="shrink-0">
                      {uploadedFile.previewUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(uploadedFile)}
                          className="w-12 h-12 rounded overflow-hidden border hover:ring-2 ring-primary"
                        >
                          <img
                            src={uploadedFile.previewUrl}
                            alt={uploadedFile.file.name}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-12 h-12 rounded border flex items-center justify-center bg-muted">
                          {getFileIcon(uploadedFile.file)}
                        </div>
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {uploadedFile.file.name}
                        </span>
                        {uploadedFile.status === "processing" && (
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        )}
                        {uploadedFile.status === "success" && (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        )}
                        {uploadedFile.status === "error" && (
                          <AlertCircle className="h-3 w-3 text-destructive" />
                        )}
                      </div>

                      {/* Description Input */}
                      <Input
                        value={uploadedFile.description}
                        onChange={(e) => updateDescription(uploadedFile.id, e.target.value)}
                        placeholder={labels.descPlaceholder}
                        className="h-8 text-sm"
                        disabled={uploadedFile.status === "processing"}
                      />

                      {/* Error Message */}
                      {uploadedFile.errorMessage && (
                        <p className="text-xs text-destructive">{uploadedFile.errorMessage}</p>
                      )}

                      {/* Extracted Text Preview */}
                      {uploadedFile.extractedText && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {uploadedFile.extractedText.substring(0, 150)}...
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      {uploadedFile.previewUrl && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setPreviewFile(uploadedFile)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeFile(uploadedFile.id)}
                        disabled={uploadedFile.status === "processing"}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Image Preview Modal */}
        {previewFile?.previewUrl && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewFile(null)}
          >
            <div className="relative max-w-3xl max-h-[90vh]">
              <img
                src={previewFile.previewUrl}
                alt={previewFile.file.name}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => setPreviewFile(null)}
              >
                <X className="h-4 w-4 mr-1" />
                {labels.close}
              </Button>
              <p className="text-white text-center mt-2 text-sm">
                {labels.attachment} {files.findIndex(f => f.id === previewFile.id) + 1}: {previewFile.file.name}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { UploadedFile } from "./types";

// =============================================================================
// FILE PROCESSING HOOK
// =============================================================================

interface UseComplaintFilesOptions {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  onFilesChange: (updater: (files: UploadedFile[]) => UploadedFile[]) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

export function useComplaintFiles({
  lang,
  getText,
  onFilesChange,
  onProcessingChange
}: UseComplaintFilesOptions) {
  
  // Process single file
  const processFile = useCallback(async (fileState: UploadedFile): Promise<UploadedFile> => {
    const { file } = fileState;
    
    try {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      const isText = file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md");
      const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                     file.name.endsWith(".docx");
      const isOldDoc = file.type === "application/msword" || file.name.endsWith(".doc");

      let text = "";

      if (isText) {
        text = await file.text();
      } else if (isOldDoc) {
        const msg =
          lang === "hy" ? "DOC format is not supported. Please save as DOCX or PDF." :
          lang === "ru" ? "Формат DOC не поддерживается. Сохраните как DOCX или PDF." :
          "DOC format is not supported. Please save as DOCX or PDF.";

        toast.error(msg);
        return { ...fileState, status: "error", extractedText: "", errorMessage: msg };
      } else if (isImage || isPdf || isDocx) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/complaints/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("case-files")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Retry signed URL generation
        let signedUrl: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from("case-files")
            .createSignedUrl(fileName, 300);

          if (!signedUrlError && signedUrlData?.signedUrl) {
            signedUrl = signedUrlData.signedUrl;
            break;
          }
        }

        if (!signedUrl) {
          throw new Error("Failed to create signed URL after retries");
        }

        const { data, error } = await supabase.functions.invoke("ocr-process", {
          body: {
            fileUrl: signedUrl,
            fileName: file.name,
            language: lang === "hy" ? "hye" : lang === "ru" ? "rus" : "eng"
          }
        });

        if (error) throw error;
        text = data.text || data.extracted_text || "";

        // Cleanup
        await supabase.storage.from("case-files").remove([fileName]);
      } else {
        throw new Error("Unsupported file type");
      }

      return { ...fileState, status: "success", extractedText: text };
    } catch (error) {
      console.error("File processing error:", error);
      const errorMessage = error instanceof Error ? error.message : "Processing failed";
      toast.error(errorMessage);
      return { ...fileState, status: "error", extractedText: "", errorMessage };
    }
  }, [lang]);

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.size > 10 * 1024 * 1024) {
        toast.error(getText(
          "\u0556\u0561\u0575\u056C\u0568 \u0579\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0567 (10\u0544\u0532)",
          "Файл слишком большой (10МБ)",
          "File too large (10MB max)"
        ));
        continue;
      }
      
      newFiles.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
        extractedText: ""
      });
    }

    if (newFiles.length === 0) return;

    onFilesChange(prev => [...prev, ...newFiles]);
    onProcessingChange(true);

    // Process files sequentially
    for (const fileState of newFiles) {
      onFilesChange(prev => 
        prev.map(f => f.id === fileState.id ? { ...f, status: "processing" } : f)
      );

      const result = await processFile(fileState);
      
      onFilesChange(prev => 
        prev.map(f => f.id === result.id ? result : f)
      );
    }

    onProcessingChange(false);
    e.target.value = '';
  }, [processFile, getText, onFilesChange, onProcessingChange]);

  // Remove file
  const removeFile = useCallback((id: string) => {
    onFilesChange(prev => prev.filter(f => f.id !== id));
  }, [onFilesChange]);

  return {
    handleFileUpload,
    removeFile
  };
}

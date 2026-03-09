import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { 
  Download, FileText, Edit, RotateCcw, 
  Save, X, Check, Copy, Loader2, FolderOpen 
} from "lucide-react";
import { toast } from "sonner";
import { exportDocumentToPDF } from "@/lib/pdfExportDocument";

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  title: string;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onSave?: () => Promise<boolean> | void;
  isGenerating?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DocumentPreviewModal({
  open,
  onOpenChange,
  content,
  title,
  onEdit,
  onRegenerate,
  onSave,
  isGenerating = false
}: DocumentPreviewModalProps) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const labels = {
    title: lang === "hy" ? "\u0553\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u056b \u0574\u0561\u0575\u0580\u0561\u0564\u056b\u057f\u0578\u0582\u0574" : lang === "ru" ? "\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430" : "Document Preview",
    edit: lang === "hy" ? "\u053d\u0574\u0562\u0561\u0563\u0580\u0565\u056c" : lang === "ru" ? "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c" : "Edit",
    save: lang === "hy" ? "\u054a\u0561\u0570\u057a\u0561\u0576\u0565\u056c" : lang === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c" : "Save",
    cancel: lang === "hy" ? "\u0549\u0565\u0572\u0561\u0580\u056f\u0565\u056c" : lang === "ru" ? "\u041e\u0442\u043c\u0435\u043d\u0430" : "Cancel",
    downloadPdf: lang === "hy" ? "\u0532\u0565\u057c\u0576\u0565\u056c PDF" : lang === "ru" ? "\u0421\u043a\u0430\u0447\u0430\u0442\u044c PDF" : "Download PDF",
    downloadDocx: lang === "hy" ? "\u0532\u0565\u057c\u0576\u0565\u056c DOCX" : lang === "ru" ? "\u0421\u043a\u0430\u0447\u0430\u0442\u044c DOCX" : "Download DOCX",
    regenerate: lang === "hy" ? "\u054e\u0565\u0580\u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056c" : lang === "ru" ? "\u041f\u0435\u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c" : "Regenerate",
    copy: lang === "hy" ? "\u054a\u0561\u057f\u0573\u0565\u0576\u0565\u056c" : lang === "ru" ? "\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c" : "Copy",
    copied: lang === "hy" ? "\u054a\u0561\u057f\u0573\u0565\u0576\u057e\u0565\u0581" : lang === "ru" ? "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e" : "Copied",
    close: lang === "hy" ? "\u0553\u0561\u056f\u0565\u056c" : lang === "ru" ? "\u0417\u0430\u043a\u0440\u044b\u0442\u044c" : "Close",
    saveDocument: lang === "hy" ? "\u054a\u0561\u0570\u057a\u0561\u0576\u0565\u056c \u0583\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569\u0568" : lang === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442" : "Save document",
    exporting: lang === "hy" ? "\u0531\u0580\u057f\u0561\u0570\u0561\u0576\u0578\u0582\u0574..." : lang === "ru" ? "\u042d\u043a\u0441\u043f\u043e\u0440\u0442..." : "Exporting...",
    saveToMyDocs: lang === "hy" ? "\u054a\u0561\u0570\u057a\u0561\u0576\u0565\u056c \u056b\u0574 \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u0582\u0574" : lang === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0432 \u043c\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b" : "Save to My Documents",
    saved: lang === "hy" ? "\u054a\u0561\u0570\u057a\u0561\u0576\u057e\u0565\u0581" : lang === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e" : "Saved",
    goToMyDocs: lang === "hy" ? "\u0531\u0576\u0581\u0576\u0565\u056c \u056b\u0574 \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580" : lang === "ru" ? "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u0432 \u043c\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b" : "Go to My Documents",
  };

  // Update edited content when content changes
  if (content !== editedContent && !isEditing) {
    setEditedContent(content);
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(isEditing ? editedContent : content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(labels.copied);
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      const contentToExport = isEditing ? editedContent : content;
      await exportDocumentToPDF({
        title: title || "document",
        content: contentToExport,
        createdAt: new Date(),
        language: lang as "hy" | "ru" | "en"
      });
      toast.success(lang === "hy" ? "PDF \u0562\u0565\u057c\u0576\u057e\u0565\u0581" : lang === "ru" ? "PDF \u0441\u043a\u0430\u0447\u0430\u043d" : "PDF downloaded");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error(lang === "hy" ? "PDF \u057d\u056d\u0561\u056c" : lang === "ru" ? "\u041e\u0448\u0438\u0431\u043a\u0430 PDF" : "PDF error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadDocx = () => {
    const contentToExport = isEditing ? editedContent : content;
    // Create a simple text file (DOCX generation requires external library)
    const blob = new Blob([contentToExport], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "document"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(lang === "hy" ? "\u0553\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u0562\u0565\u057c\u0576\u057e\u0565\u0581" : lang === "ru" ? "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0441\u043a\u0430\u0447\u0430\u043d" : "Document downloaded");
  };

  const handleSaveToMyDocs = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      const result = await onSave();
      if (result) {
        setIsSaved(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoToMyDocs = () => {
    onOpenChange(false);
    navigate("/my-documents");
  };

  const handleCancelEdit = () => {
    setEditedContent(content);
    setIsEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {labels.title}
            {title && <span className="text-muted-foreground font-normal">- {title}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 min-h-0">
          {isEditing ? (
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-[500px] font-mono text-sm resize-none"
              dir="auto"
            />
          ) : (
            <ScrollArea className="h-[500px] border rounded-lg p-4 bg-muted/30">
              <div 
                className="whitespace-pre-wrap font-serif text-sm leading-relaxed"
                dir="auto"
              >
                {content}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {/* Left side actions */}
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  {labels.cancel}
                </Button>
                <Button onClick={() => setIsEditing(false)}>
                  <Check className="h-4 w-4 mr-2" />
                  {labels.save}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  {labels.edit}
                </Button>
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  {copied ? labels.copied : labels.copy}
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
            {/* Save to My Documents button */}
            {isSaved ? (
              <Button onClick={handleGoToMyDocs} variant="default">
                <FolderOpen className="h-4 w-4 mr-2" />
                {labels.goToMyDocs}
              </Button>
            ) : (
              <Button
                onClick={handleSaveToMyDocs}
                disabled={isSaving || !onSave}
                variant="default"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {labels.saveToMyDocs}
              </Button>
            )}
            
            {/* Other actions */}
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isGenerating || !onRegenerate}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              {labels.regenerate}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadDocx}
            >
              <Download className="h-4 w-4 mr-2" />
              {labels.downloadDocx}
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {labels.downloadPdf}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

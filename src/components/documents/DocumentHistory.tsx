import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  History, Download, RotateCcw, FileText, 
  Calendar, Trash2, Eye, BookmarkPlus 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { hy, ru, enUS } from "date-fns/locale";
import { exportDocumentToPDF } from "@/lib/pdfExportDocument";

// =============================================================================
// TYPES
// =============================================================================

interface GeneratedDocument {
  id: string;
  title: string;
  content_text: string;
  created_at: string;
  status: string;
  template_id: string | null;
  sender_name: string | null;
  recipient_organization: string | null;
}

export interface DocumentHistoryProps {
  onLoadDocument?: (doc: GeneratedDocument) => void;
  onRepeat?: (doc: GeneratedDocument) => void;
  onPreview?: (doc: GeneratedDocument) => void;
  onClose?: () => void;
  maxItems?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DocumentHistory({ 
  onLoadDocument,
  onRepeat, 
  onPreview,
  onClose,
  maxItems = 15 
}: DocumentHistoryProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const labels = {
    title: lang === "hy" ? "\u0553\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580\u056b \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : lang === "ru" ? "\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432" : "Document History",
    empty: lang === "hy" ? "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u057e\u0561\u056e \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580 \u0579\u056f\u0561\u0576" : lang === "ru" ? "\u041d\u0435\u0442 \u0441\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432" : "No generated documents",
    repeat: lang === "hy" ? "\u053f\u0580\u056f\u0576\u0565\u056c" : lang === "ru" ? "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c" : "Repeat",
    download: lang === "hy" ? "\u0532\u0565\u057c\u0576\u0565\u056c" : lang === "ru" ? "\u0421\u043a\u0430\u0447\u0430\u0442\u044c" : "Download",
    preview: lang === "hy" ? "\u0534\u056b\u057f\u0565\u056c" : lang === "ru" ? "\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440" : "Preview",
    delete: lang === "hy" ? "\u054b\u0576\u057b\u0565\u056c" : lang === "ru" ? "\u0423\u0434\u0430\u043b\u0438\u0442\u044c" : "Delete",
    showMore: lang === "hy" ? "\u0551\u0578\u0582\u0575\u0581 \u057f\u0561\u056c \u0561\u057e\u0565\u056c\u056b\u0576" : lang === "ru" ? "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0435" : "Show more",
    showLess: lang === "hy" ? "\u0539\u0561\u0584\u0581\u0576\u0565\u056c" : lang === "ru" ? "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c" : "Show less",
    saveAsTemplate: lang === "hy" ? "\u054a\u0561\u0570\u057a\u0561\u0576\u0565\u056c \u0578\u0580\u057a\u0565\u057d \u0576\u0574\u0578\u0582\u0577" : lang === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043a\u0430\u043a \u0448\u0430\u0431\u043b\u043e\u043d" : "Save as template",
    draft: lang === "hy" ? "\u054d\u0587\u0561\u0563\u056b\u0580" : lang === "ru" ? "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a" : "Draft",
  };

  const getLocale = () => {
    switch (lang) {
      case "hy": return hy;
      case "ru": return ru;
      default: return enUS;
    }
  };

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("generated_documents")
        .select("id, title, content_text, created_at, status, template_id, sender_name, recipient_organization")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(maxItems);

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Delete document
  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("generated_documents")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setDocuments(prev => prev.filter(d => d.id !== id));
      toast.success(lang === "hy" ? "\u054b\u0576\u057b\u057e\u0565\u0581" : lang === "ru" ? "\u0423\u0434\u0430\u043b\u0435\u043d\u043e" : "Deleted");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(lang === "hy" ? "\u054d\u056d\u0561\u056c" : lang === "ru" ? "\u041e\u0448\u0438\u0431\u043a\u0430" : "Error");
    }
  };

  // Download as PDF
  const handleDownload = async (doc: GeneratedDocument) => {
    try {
      await exportDocumentToPDF({
        title: doc.title,
        content: doc.content_text,
        senderName: doc.sender_name || undefined,
        recipientOrganization: doc.recipient_organization || undefined,
        createdAt: new Date(doc.created_at),
        language: lang as "hy" | "ru" | "en"
      });
      toast.success(lang === "hy" ? "PDF \u0562\u0565\u057c\u0576\u057e\u0565\u0581" : lang === "ru" ? "PDF \u0441\u043a\u0430\u0447\u0430\u043d" : "PDF downloaded");
    } catch (error) {
      console.error("PDF export error:", error);
    }
  };

  // Save as template (stores in localStorage)
  const handleSaveAsTemplate = (doc: GeneratedDocument) => {
    try {
      const templates = JSON.parse(localStorage.getItem("documentTemplates") || "[]");
      const newTemplate = {
        id: `template-${Date.now()}`,
        name: doc.title,
        content: doc.content_text,
        createdAt: new Date().toISOString()
      };
      templates.unshift(newTemplate);
      localStorage.setItem("documentTemplates", JSON.stringify(templates.slice(0, 20)));
      toast.success(lang === "hy" ? "\u0546\u0574\u0578\u0582\u0577\u0568 \u057a\u0561\u0570\u057a\u0561\u0576\u057e\u0565\u0581" : lang === "ru" ? "\u0428\u0430\u0431\u043b\u043e\u043d \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d" : "Template saved");
    } catch (error) {
      console.error("Save template error:", error);
    }
  };

  const visibleDocuments = expanded ? documents : documents.slice(0, 5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            {labels.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            {labels.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {labels.empty}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          {labels.title}
          <Badge variant="secondary" className="ml-auto">{documents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ScrollArea className={cn(expanded ? "max-h-[500px]" : "max-h-[300px]")}>
          <div className="space-y-2 pr-4">
            {visibleDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{doc.title}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {labels.draft}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(doc.created_at), "d MMM yyyy, HH:mm", { locale: getLocale() })}
                    </div>
                    {doc.recipient_organization && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {doc.recipient_organization}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 mt-2 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (onLoadDocument) onLoadDocument(doc);
                      else if (onPreview) onPreview(doc);
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {labels.preview}
                  </Button>
                  {onRepeat && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onRepeat(doc)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {labels.repeat}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleDownload(doc)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    {labels.download}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleSaveAsTemplate(doc)}
                  >
                    <BookmarkPlus className="h-3 w-3 mr-1" />
                    {labels.saveAsTemplate}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(doc.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    {labels.delete}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {documents.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? labels.showLess : labels.showMore} ({documents.length - 5})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

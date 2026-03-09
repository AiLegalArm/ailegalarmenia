import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getText } from "@/lib/i18n-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Loader2, FileText, Gavel, Scale, Building2, Copy, Download, 
  Check, ArrowLeft, ArrowRight, AlertCircle, Edit, Eye, Save
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getReferencesText } from "@/lib/references-store";

// =============================================================================
// TYPES
// =============================================================================

interface CaseComplaintGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseData: {
    title?: string;
    case_number?: string;
    case_type?: string | null;
    court?: string | null;
    court_date?: string | null;
    facts?: string | null;
    description?: string | null;
    notes?: string | null;
  };
}

type ComplaintType = "appeal" | "cassation";
type CaseCategory = "criminal" | "civil" | "administrative";

interface GeneratorState {
  step: number;
  complaintType: ComplaintType | null;
  isLoadingFiles: boolean;
  isLoadingAnalyses: boolean;
  isGenerating: boolean;
  filesText: string;
  analysesText: string;
  additionalInfo: string;
  generatedContent: string;
  editedContent: string;
  isEditing: boolean;
  isSaving: boolean;
  progress: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CaseComplaintGenerator({ 
  open, 
  onOpenChange, 
  caseId, 
  caseData 
}: CaseComplaintGeneratorProps) {
  const { t, i18n } = useTranslation(['cases', 'common']);
  const lang = i18n.language;
  const { user } = useAuth();

  const [state, setState] = useState<GeneratorState>({
    step: 1,
    complaintType: null,
    isLoadingFiles: false,
    isLoadingAnalyses: false,
    isGenerating: false,
    filesText: "",
    analysesText: "",
    additionalInfo: "",
    generatedContent: "",
    editedContent: "",
    isEditing: false,
    isSaving: false,
    progress: 0,
  });

  // Using centralized getText from @/lib/i18n-utils

  // Determine case category from case_type
  const getCaseCategory = (): CaseCategory => {
    const caseType = caseData.case_type?.toLowerCase() || "";
    if (caseType.includes("criminal") || caseType.includes("\u0584\u0580\u0565\u0561\u056F\u0561\u0576") || caseType.includes("\u0443\u0433\u043E\u043B\u043E\u0432")) {
      return "criminal";
    }
    if (caseType.includes("admin") || caseType.includes("\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576") || caseType.includes("\u0430\u0434\u043C\u0438\u043D")) {
      return "administrative";
    }
    return "civil";
  };

  // Load case files with OCR text
  const loadCaseFiles = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingFiles: true }));
    try {
      // Get case files
      const { data: files, error: filesError } = await supabase
        .from("case_files")
        .select("id, filename, original_filename")
        .eq("case_id", caseId)
        .is("deleted_at", null);

      if (filesError) throw filesError;

      if (!files || files.length === 0) {
        setState(prev => ({ ...prev, isLoadingFiles: false }));
        return;
      }

      // Get OCR results for these files
      const fileIds = files.map(f => f.id);
      const { data: ocrResults, error: ocrError } = await supabase
        .from("ocr_results")
        .select("file_id, extracted_text")
        .in("file_id", fileIds);

      if (ocrError) throw ocrError;

      // Get audio transcriptions
      const { data: transcriptions, error: transError } = await supabase
        .from("audio_transcriptions")
        .select("file_id, transcription_text")
        .in("file_id", fileIds);

      if (transError) throw transError;

      // Combine all texts
      const textParts: string[] = [];
      
      for (const file of files) {
        const ocr = ocrResults?.find(o => o.file_id === file.id);
        const trans = transcriptions?.find(t => t.file_id === file.id);
        
        if (ocr?.extracted_text) {
          textParts.push(`--- ${file.original_filename} (OCR) ---\n${ocr.extracted_text}`);
        }
        if (trans?.transcription_text) {
          textParts.push(`--- ${file.original_filename} (\u0410\u0443\u0434\u0438\u043E) ---\n${trans.transcription_text}`);
        }
      }

      setState(prev => ({ 
        ...prev, 
        isLoadingFiles: false,
        filesText: textParts.join("\n\n") 
      }));
    } catch (error) {
      console.error("Error loading case files:", error);
      setState(prev => ({ ...prev, isLoadingFiles: false }));
      toast.error(getText(
        "\u054D\u056D\u0561\u056C \u0586\u0561\u0575\u056C\u0565\u0580\u056B \u0562\u0565\u057C\u0576\u0574\u0561\u0576 \u0570\u0565\u057F",
        "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0444\u0430\u0439\u043B\u043E\u0432",
        "Error loading files"
      ));
    }
  }, [caseId, getText]);

  // Load saved AI analyses (both single-agent and multi-agent)
  const loadSavedAnalyses = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingAnalyses: true }));
    try {
      // Load both ai_analysis and agent_analysis_runs in parallel
      const [singleResult, multiResult] = await Promise.all([
        supabase
          .from("ai_analysis")
          .select("role, response_text, created_at")
          .eq("case_id", caseId)
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_analysis_runs")
          .select("agent_type, summary, analysis_result, completed_at")
          .eq("case_id", caseId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false }),
      ]);

      const analysisParts: string[] = [];

      // Process single-agent analyses
      if (singleResult.data && singleResult.data.length > 0) {
        const latestByRole = new Map<string, string>();
        for (const item of singleResult.data) {
          if (!latestByRole.has(item.role)) {
            latestByRole.set(item.role, item.response_text);
          }
        }

        const roleLabels: Record<string, string> = {
          advocate: getText("\u054A\u0561\u0577\u057F\u057A\u0561\u0576", "\u0410\u0434\u0432\u043E\u043A\u0430\u0442", "Advocate"),
          prosecutor: getText("\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572", "\u041F\u0440\u043E\u043A\u0443\u0440\u043E\u0440", "Prosecutor"),
          judge: getText("\u0534\u0561\u057F\u0561\u057E\u0578\u0580", "\u0421\u0443\u0434\u044C\u044F", "Judge"),
          aggregator: getText("\u0531\u0563\u0580\u0565\u0563\u0561\u057F\u0578\u0580", "\u0410\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440", "Aggregator"),
        };

        latestByRole.forEach((text, role) => {
          const label = roleLabels[role] || role;
          analysisParts.push(`=== ${label} ===\n${text}`);
        });
      }

      // Process multi-agent analyses
      if (multiResult.data && multiResult.data.length > 0) {
        const latestByAgent = new Map<string, string>();
        for (const item of multiResult.data) {
          if (!latestByAgent.has(item.agent_type)) {
            const text = item.summary || item.analysis_result || "";
            if (text) latestByAgent.set(item.agent_type, text);
          }
        }

        latestByAgent.forEach((text, agentType) => {
          analysisParts.push(`=== ${getText("\u0544\u0578\u0582\u056C\u057F\u056B-\u0561\u0563\u0565\u0576\u057F", "\u041C\u0443\u043B\u044C\u0442\u0438-\u0430\u0433\u0435\u043D\u0442", "Multi-agent")}: ${agentType} ===\n${text}`);
        });
      }

      const finalText = analysisParts.join("\n\n---\n\n");
      console.log("[CaseComplaintGenerator] Analyses loaded:", analysisParts.length, "parts, text length:", finalText.length);
      setState(prev => ({ 
        ...prev, 
        isLoadingAnalyses: false,
        analysesText: finalText 
      }));
    } catch (error) {
      console.error("Error loading analyses:", error);
      setState(prev => ({ ...prev, isLoadingAnalyses: false }));
    }
  }, [caseId, getText]);

  // Initialize data when dialog opens
  const handleDialogOpen = useCallback((isOpen: boolean) => {
    if (isOpen) {
      setState({
        step: 1,
        complaintType: null,
        isLoadingFiles: false,
        isLoadingAnalyses: false,
        isGenerating: false,
        filesText: "",
        analysesText: "",
        additionalInfo: "",
        generatedContent: "",
        editedContent: "",
        isEditing: false,
        isSaving: false,
        progress: 0,
      });
      loadCaseFiles();
      loadSavedAnalyses();
    }
    onOpenChange(isOpen);
  }, [loadCaseFiles, loadSavedAnalyses, onOpenChange]);

  // Generate complaint
  const handleGenerate = async () => {
    if (!state.complaintType) {
      toast.error(getText(
        "\u0538\u0576\u057F\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
        "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043F \u0436\u0430\u043B\u043E\u0431\u044B",
        "Select complaint type"
      ));
      return;
    }

    const combinedText = [
      caseData.description ? `${getText("\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", "Description")}:\n${caseData.description}` : "",
      caseData.facts ? `${getText("\u0553\u0561\u057D\u057F\u0565\u0580", "\u0424\u0430\u043A\u0442\u044B", "Facts")}:\n${caseData.facts}` : "",
      caseData.notes ? `${getText("\u0546\u0578\u0569\u0565\u0580", "\u0417\u0430\u043C\u0435\u0442\u043A\u0438", "Notes")}:\n${caseData.notes}` : "",
      state.filesText ? `${getText("\u0556\u0561\u0575\u056C\u0565\u0580\u056B\u0581 \u057F\u0565\u0584\u057D\u057F", "\u0422\u0435\u043A\u0441\u0442 \u0438\u0437 \u0444\u0430\u0439\u043B\u043E\u0432", "Text from files")}:\n${state.filesText}` : "",
      state.analysesText ? `${getText("AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580", "AI \u0430\u043D\u0430\u043B\u0438\u0437\u044B", "AI Analyses")}:\n${state.analysesText}` : "",
      state.additionalInfo ? `${getText("\u053C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F", "Additional info")}:\n${state.additionalInfo}` : "",
    ].filter(Boolean).join("\n\n---\n\n");

    if (combinedText.length < 100) {
      toast.error(getText(
        "\u0531\u0576\u0562\u0561\u057E\u0561\u0580\u0561\u0580 \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0562\u0578\u0572\u0578\u0584\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580",
        "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438 \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0436\u0430\u043B\u043E\u0431\u044B",
        "Insufficient information for complaint generation"
      ));
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true, progress: 10, step: 3 }));

    try {
      const category = getCaseCategory();
      const courtType = state.complaintType === "appeal" ? "appellate" : "cassation";
      const complaintTypeId = `${category}_${state.complaintType}`;

      setState(prev => ({ ...prev, progress: 30 }));

      const requestBody: Record<string, unknown> = {
          courtType,
          category,
          complaintType: complaintTypeId,
          extractedText: combinedText.slice(0, 80000),
          language: "hy",
          caseDate: caseData.court_date || new Date().toISOString().split("T")[0],
        };
      const currentRefsText = getReferencesText(caseId);
      if (currentRefsText?.trim()) {
        requestBody.referencesText = currentRefsText;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const sessionData = await supabase.auth.getSession();
      const accessToken = sessionData.data.session?.access_token;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 310_000);

      let data: Record<string, unknown>;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-complaint`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${accessToken || supabaseKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Edge function returned ${res.status}: ${errBody}`);
        }
        data = await res.json();
      } catch (e: unknown) {
        clearTimeout(timeoutId);
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new Error("Request timed out after 5 minutes");
        }
        throw e;
      }

      setState(prev => ({ ...prev, progress: 90 }));

      const content = (data?.content || data?.complaint || "") as string;
      
      if (!content) {
        throw new Error("No content generated");
      }

      setState(prev => ({ 
        ...prev, 
        isGenerating: false, 
        generatedContent: content,
        editedContent: content,
        progress: 100 
      }));

      toast.success(getText(
        "\u0532\u0578\u0572\u0578\u0584\u0568 \u0570\u0561\u057B\u0578\u0572\u0578\u0582\u0569\u0575\u0561\u0574\u0562 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u0565\u056C \u0567",
        "\u0416\u0430\u043B\u043E\u0431\u0430 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0430",
        "Complaint generated successfully"
      ));

      // Auto-save immediately after generation
      if (user?.id) {
        try {
          const typeLabel = state.complaintType === "appeal" 
            ? getText("\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584", "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Appeal Complaint")
            : getText("\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584", "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Cassation Complaint");

          await supabase
            .from("generated_documents")
            .insert({
              user_id: user.id,
              case_id: caseId,
              title: `${typeLabel} - ${caseData.case_number || caseData.title}`,
              content_text: content,
              status: "draft",
              metadata: {
                complaint_type: state.complaintType,
                case_type: caseData.case_type,
                generated_at: new Date().toISOString(),
                auto_saved: true,
              }
            });

          toast.success(getText(
            "\u0532\u0578\u0572\u0578\u0584\u0568 \u0561\u057E\u057F\u0578\u0574\u0561\u057F \u057A\u0561\u0570\u057A\u0561\u0576\u057E\u0565\u056C \u0567",
            "\u0416\u0430\u043B\u043E\u0431\u0430 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430",
            "Complaint auto-saved"
          ));
        } catch (saveErr) {
          console.error("Auto-save error:", saveErr);
        }
      }
    } catch (error) {
      console.error("Generation error:", error);
      setState(prev => ({ ...prev, isGenerating: false, progress: 0 }));
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("402") || errorMessage.includes("credits")) {
        toast.error(getText(
          "AI \u056F\u0580\u0565\u0564\u056B\u057F\u0576\u0565\u0580\u0568 \u057D\u057A\u0561\u057C\u057E\u0565\u056C \u0565\u0576",
          "AI \u043A\u0440\u0435\u0434\u0438\u0442\u044B \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D\u044B",
          "AI credits exhausted"
        ));
      } else if (errorMessage.includes("429")) {
        toast.error(getText(
          "\u0549\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0577\u0561\u057F \u0570\u0561\u0580\u0581\u0578\u0582\u0574\u0576\u0565\u0580, \u0583\u0578\u0580\u0571\u0565\u0584 \u0576\u0578\u0580\u056B\u0581",
          "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435",
          "Too many requests, try later"
        ));
      } else {
        toast.error(getText(
          "\u054D\u056D\u0561\u056C \u0562\u0578\u0572\u0578\u0584\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0574\u0561\u0576 \u0570\u0565\u057F",
          "\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0436\u0430\u043B\u043E\u0431\u044B",
          "Error generating complaint"
        ));
      }
    }
  };

  const handleCopy = async () => {
    try {
      const contentToCopy = state.isEditing ? state.editedContent : state.generatedContent;
      await navigator.clipboard.writeText(contentToCopy);
      toast.success(getText("Պdelays\u0565\u0576\u057E\u0565\u056C \u0567", "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "Copied"));
    } catch {
      toast.error(getText("\u054D\u056D\u0561\u056C", "\u041E\u0448\u0438\u0431\u043A\u0430", "Error"));
    }
  };

  const handleDownload = () => {
    const contentToDownload = state.editedContent || state.generatedContent;
    const blob = new Blob([contentToDownload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const typeLabel = state.complaintType === "appeal" 
      ? getText("\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579", "\u0430\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F", "appeal")
      : getText("\u057E\u0573\u057C\u0561\u0562\u0565\u056F", "\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F", "cassation");
    a.download = `${typeLabel}_${caseData.case_number || "complaint"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save complaint to database
  const handleSaveComplaint = async () => {
    if (!user?.id) {
      toast.error(getText("\u0540\u0561\u0580\u056F\u0561\u057E\u0578\u0580 \u0567 \u0574\u0578\u0582\u057F\u0584 \u0563\u0578\u0580\u056E\u0565\u056C", "\u041D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F", "Authorization required"));
      return;
    }

    setState(prev => ({ ...prev, isSaving: true }));

    try {
      const contentToSave = state.editedContent || state.generatedContent;
      const typeLabel = state.complaintType === "appeal" 
        ? getText("\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584", "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Appeal Complaint")
        : getText("\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584", "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Cassation Complaint");

      const { error } = await supabase
        .from("generated_documents")
        .insert({
          user_id: user.id,
          case_id: caseId,
          title: `${typeLabel} - ${caseData.case_number || caseData.title}`,
          content_text: contentToSave,
          status: "draft",
          metadata: {
            complaint_type: state.complaintType,
            case_type: caseData.case_type,
            generated_at: new Date().toISOString(),
          }
        });

      if (error) throw error;

      toast.success(getText(
        "\u0532\u0578\u0572\u0578\u0584\u0568 \u057A\u0561\u0570\u057A\u0561\u0576\u057E\u0565\u056C \u0567",
        "\u0416\u0430\u043B\u043E\u0431\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430",
        "Complaint saved"
      ));

      // Update generated content with edited version
      setState(prev => ({ 
        ...prev, 
        isSaving: false,
        generatedContent: contentToSave,
        isEditing: false
      }));
    } catch (error) {
      console.error("Error saving complaint:", error);
      setState(prev => ({ ...prev, isSaving: false }));
      toast.error(getText(
        "\u054D\u056D\u0561\u056C \u057A\u0561\u0570\u057A\u0561\u0576\u0574\u0561\u0576 \u0570\u0565\u057F",
        "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
        "Error saving"
      ));
    }
  };

  const toggleEditMode = () => {
    setState(prev => ({ 
      ...prev, 
      isEditing: !prev.isEditing,
      // Reset edited content to generated if switching to edit mode
      editedContent: prev.isEditing ? prev.editedContent : prev.generatedContent
    }));
  };

  const isDataLoading = state.isLoadingFiles || state.isLoadingAnalyses;
  const hasData = !!(state.filesText || state.analysesText || caseData.facts || caseData.description);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {getText(
              "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C \u0562\u0578\u0572\u0578\u0584 \u0563\u0578\u0580\u056E\u056B \u0570\u056B\u0574\u0561\u0576 \u057E\u0580\u0561",
              "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0436\u0430\u043B\u043E\u0431\u0443 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0434\u0435\u043B\u0430",
              "Generate Complaint from Case"
            )}
          </DialogTitle>
          <DialogDescription>
            {getText(
              "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C \u0561\u057A\u0565\u056C\u0575\u0561\u0581\u056B\u0578\u0576 \u056F\u0561\u0574 \u057E\u0573\u057C\u0561\u0575\u056B\u0576 \u0562\u0578\u0572\u0578\u0584 \u0563\u0578\u0580\u056E\u056B \u0586\u0561\u0575\u056C\u0565\u0580\u056B \u0587 AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580\u056B \u0570\u056B\u0574\u0561\u0576 \u057E\u0580\u0561",
              "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u0430\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0443\u044E \u0438\u043B\u0438 \u043A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0443\u044E \u0436\u0430\u043B\u043E\u0431\u0443 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0444\u0430\u0439\u043B\u043E\u0432 \u0434\u0435\u043B\u0430 \u0438 AI \u0430\u043D\u0430\u043B\u0438\u0437\u043E\u0432",
              "Generate appeal or cassation complaint based on case files and AI analyses"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        {state.isGenerating && (
          <Progress value={state.progress} className="h-2" />
        )}

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Step 1: Select complaint type */}
            {state.step === 1 && (
              <div className="space-y-4">
                <div className="text-sm font-medium">
                  {getText("\u0538\u0576\u057F\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u057D\u0561\u056F\u0568", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043F \u0436\u0430\u043B\u043E\u0431\u044B", "Select complaint type")}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card 
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary",
                      state.complaintType === "appeal" && "border-primary bg-primary/5"
                    )}
                    onClick={() => setState(prev => ({ ...prev, complaintType: "appeal" }))}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
                        <Scale className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {getText("\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584", "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Appeal Complaint")}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {getText(
                            "\u0531\u057A\u0565\u056C\u0575\u0561\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
                            "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0441\u0443\u0434",
                            "Appellate Court"
                          )}
                        </p>
                      </div>
                      {state.complaintType === "appeal" && (
                        <Check className="h-5 w-5 text-primary ml-auto" />
                      )}
                    </CardContent>
                  </Card>

                  <Card 
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary",
                      state.complaintType === "cassation" && "border-primary bg-primary/5"
                    )}
                    onClick={() => setState(prev => ({ ...prev, complaintType: "cassation" }))}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
                        <Gavel className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {getText("\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584", "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Cassation Complaint")}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {getText(
                            "\u054E\u0573\u057C\u0561\u0562\u0565\u056F\u0561\u0575\u056B\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
                            "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0441\u0443\u0434",
                            "Cassation Court"
                          )}
                        </p>
                      </div>
                      {state.complaintType === "cassation" && (
                        <Check className="h-5 w-5 text-primary ml-auto" />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Data summary */}
                <div className="mt-6 p-4 rounded-lg border bg-muted/30">
                  <div className="text-sm font-medium mb-3">
                    {getText("Տվdelays\u0576\u0565\u0580\u056B \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u0576\u0565\u0580", "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0434\u0430\u043D\u043D\u044B\u0445", "Data sources")}:
                  </div>
                  
                  {isDataLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {getText("\u0532\u0565\u057C\u0576\u057E\u0578\u0582\u0574 \u0567...", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "Loading...")}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {state.analysesText && (
                        <Badge variant="default">
                          <Building2 className="h-3 w-3 mr-1" />
                          {getText("AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580", "AI \u0430\u043D\u0430\u043B\u0438\u0437\u044B", "AI Analyses")}
                        </Badge>
                      )}
                      {state.filesText && (
                        <Badge variant="secondary">
                          <FileText className="h-3 w-3 mr-1" />
                          {getText("\u0556\u0561\u0575\u056C\u0565\u0580", "\u0424\u0430\u0439\u043B\u044B", "Files")}
                        </Badge>
                      )}
                      {caseData.description && (
                        <Badge variant="outline">
                          {getText("\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", "Description")}
                        </Badge>
                      )}
                      {caseData.facts && (
                        <Badge variant="outline">
                          {getText("\u0553\u0561\u057D\u057F\u0565\u0580", "\u0424\u0430\u043A\u0442\u044B", "Facts")}
                        </Badge>
                      )}
                      {!hasData && (
                        <div className="flex items-center gap-2 text-amber-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-sm">
                            {getText(
                              "\u054F\u057E\u0575\u0561\u056C\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C",
                              "\u0414\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B",
                              "No data found"
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Additional info */}
            {state.step === 2 && (
              <div className="space-y-4">
                <div>
                  <Label>
                    {getText(
                      "\u053C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (\u0578\u0579 \u057A\u0561\u0580\u057F\u0561\u0564\u056B\u0580)",
                      "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
                      "Additional information (optional)"
                    )}
                  </Label>
                  <Textarea
                    value={state.additionalInfo}
                    onChange={(e) => setState(prev => ({ ...prev, additionalInfo: e.target.value }))}
                    placeholder={getText(
                      "\u0531\u057E\u0565\u056C\u0561\u0581\u0576\u0565\u056C \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u0574\u0561\u0576\u0580\u0561\u0574\u0561\u057D\u0576\u0565\u0580 \u056F\u0561\u0574 \u057A\u0561\u0570\u0561\u0576\u0584\u0576\u0565\u0580...",
                      "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0435\u0442\u0430\u043B\u0438 \u0438\u043B\u0438 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F...",
                      "Add additional details or requirements..."
                    )}
                    className="min-h-[150px]"
                  />
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    {getText(
                      "\u0532\u0578\u0572\u0578\u0584\u0568 \u056F\u0563\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u056B \u0563\u0578\u0580\u056E\u056B \u0586\u0561\u0575\u056C\u0565\u0580\u056B, AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580\u056B \u0587 \u0561\u0575\u057D \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u056B\u0574\u0561\u0576 \u057E\u0580\u0561\u0589",
                      "\u0416\u0430\u043B\u043E\u0431\u0430 \u0431\u0443\u0434\u0435\u0442 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0444\u0430\u0439\u043B\u043E\u0432 \u0434\u0435\u043B\u0430, AI \u0430\u043D\u0430\u043B\u0438\u0437\u043E\u0432 \u0438 \u044D\u0442\u043E\u0439 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438.",
                      "The complaint will be generated based on case files, AI analyses, and this additional information."
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Result */}
            {state.step === 3 && (
              <div className="space-y-4">
                {state.isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-lg font-medium">
                      {getText(
                        "\u0532\u0578\u0572\u0578\u0584\u0568 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u0578\u0582\u0574 \u0567...",
                        "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u0436\u0430\u043B\u043E\u0431\u044B...",
                        "Generating complaint..."
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {getText(
                        "\u054D\u0561 \u056F\u0561\u0580\u0578\u0572 \u0567 \u057F\u0587\u0565\u056C \u0574\u0565\u056F \u0580\u0578\u057A\u0565",
                        "\u042D\u0442\u043E \u043C\u043E\u0436\u0435\u0442 \u0437\u0430\u043D\u044F\u0442\u044C \u043E\u043A\u043E\u043B\u043E \u043C\u0438\u043D\u0443\u0442\u044B",
                        "This may take about a minute"
                      )}
                    </p>
                  </div>
                ) : state.generatedContent ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">
                        {getText("\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584", "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442", "Result")}
                      </h3>
                      <div className="flex gap-2">
                        <Button 
                          variant={state.isEditing ? "default" : "outline"} 
                          size="sm" 
                          onClick={toggleEditMode}
                        >
                          {state.isEditing ? (
                            <>
                              <Eye className="h-4 w-4 mr-2" />
                              {getText("\u0534\u056B\u057F\u0565\u056C", "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440", "Preview")}
                            </>
                          ) : (
                            <>
                              <Edit className="h-4 w-4 mr-2" />
                              {getText("\u053D\u0574\u0562\u0561\u0563\u0580\u0565\u056C", "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "Edit")}
                            </>
                          )}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                          <Copy className="h-4 w-4 mr-2" />
                          {getText("\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "Copy")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                          <Download className="h-4 w-4 mr-2" />
                          {getText("\u0546\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u056C", "\u0421\u043A\u0430\u0447\u0430\u0442\u044C", "Download")}
                        </Button>
                      </div>
                    </div>

                    {state.isEditing ? (
                      <Textarea
                        value={state.editedContent}
                        onChange={(e) => setState(prev => ({ ...prev, editedContent: e.target.value }))}
                        className="min-h-[400px] font-mono text-sm"
                        placeholder={getText(
                          "\u053D\u0574\u0562\u0561\u0563\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u0584\u057D\u057F\u0568...",
                          "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0436\u0430\u043B\u043E\u0431\u044B...",
                          "Edit complaint text..."
                        )}
                      />
                    ) : (
                      <div className="border rounded-lg p-4 bg-muted/30 max-h-[400px] overflow-auto">
                        <pre className="whitespace-pre-wrap text-sm font-mono">
                          {state.editedContent || state.generatedContent}
                        </pre>
                      </div>
                    )}

                    {/* Save button - shown when content exists */}
                    <div className="flex justify-end mt-4">
                      <Button 
                        onClick={handleSaveComplaint}
                        disabled={state.isSaving}
                      >
                        {state.isSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        {getText("\u054A\u0561\u0570\u057A\u0561\u0576\u0565\u056C", "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C", "Save")}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer with navigation */}
        <div className="flex justify-between pt-4 border-t">
          {state.step > 1 && !state.isGenerating ? (
            <Button 
              variant="outline" 
              onClick={() => setState(prev => ({ ...prev, step: prev.step - 1 }))}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {getText("\u0540\u0565\u057F", "\u041D\u0561\u0437\u0430\u0434", "Back")}
            </Button>
          ) : (
            <div />
          )}

          {state.step === 1 && (
            <Button 
              onClick={() => setState(prev => ({ ...prev, step: 2 }))}
              disabled={!state.complaintType || isDataLoading}
            >
              {getText("\u0540\u0561\u057B\u0578\u0580\u0564", "\u0414\u0430\u043B\u0435\u0435", "Next")}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}

          {state.step === 2 && (
            <Button 
              onClick={handleGenerate}
              disabled={!hasData}
            >
              {getText("\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C", "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "Generate")}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}

          {state.step === 3 && !state.isGenerating && (
            <Button onClick={() => onOpenChange(false)}>
              {getText("\u0553\u0561\u056F\u0565\u056C", "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", "Close")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

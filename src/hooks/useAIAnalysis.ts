import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export type AIRole = "advocate" | "prosecutor" | "judge" | "aggregator" | "precedent_citation" | "deadline_rules" | "legal_position_comparator" | "hallucination_audit" | "draft_deterministic" | "strategy_builder" | "evidence_weakness" | "risk_factors" | "law_update_summary" | "cross_exam";

interface AnalysisResult {
  role: AIRole;
  analysis: string;
  sources: Array<{ title: string; category: string; source_name: string }>;
  model: string;
  precedent_data?: unknown;
  deadline_data?: unknown;
  comparator_data?: unknown;
  audit_data?: unknown;
  draft_text?: string;
  strategy_data?: unknown;
  evidence_weakness_data?: unknown;
  risk_factors_data?: unknown;
  law_update_data?: unknown;
  cross_exam_data?: unknown;
}

interface FileAnalysisProgress {
  totalFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  completedFiles: string[];
  phase: 'per_file' | 'synthesis' | 'idle';
}

interface UseAIAnalysisReturn {
  isLoading: boolean;
  currentRole: AIRole | null;
  results: Record<AIRole, AnalysisResult | null>;
  creditsExhausted: boolean;
  fileProgress: FileAnalysisProgress | null;
  analyzeCase: (role: AIRole, caseId?: string, caseFacts?: string, legalQuestion?: string, referencesText?: string) => Promise<AnalysisResult | null>;
  analyzeCasePerFile: (role: AIRole, caseId: string, caseFacts?: string, legalQuestion?: string, referencesText?: string) => Promise<AnalysisResult | null>;
  runAllRoles: (caseId?: string, caseFacts?: string, legalQuestion?: string) => Promise<void>;
  clearResults: () => void;
  loadResults: (loadedResults: Partial<Record<AIRole, AnalysisResult | null>>) => void;
}

export function useAIAnalysis(): UseAIAnalysisReturn {
  const { t } = useTranslation(["ai", "cases"]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRole, setCurrentRole] = useState<AIRole | null>(null);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileAnalysisProgress | null>(null);
  const [results, setResults] = useState<Record<AIRole, AnalysisResult | null>>({
    advocate: null,
    prosecutor: null,
    judge: null,
    aggregator: null,
    precedent_citation: null,
    deadline_rules: null,
    legal_position_comparator: null,
    hallucination_audit: null,
    draft_deterministic: null,
    strategy_builder: null,
    evidence_weakness: null,
    risk_factors: null,
    law_update_summary: null,
    cross_exam: null,
  });

  const analyzeCase = useCallback(async (
    role: AIRole,
    caseId?: string,
    caseFacts?: string,
    legalQuestion?: string,
    referencesText?: string
  ): Promise<AnalysisResult | null> => {
    setIsLoading(true);
    setCurrentRole(role);
    setCreditsExhausted(false);
    
    try {
      const body: Record<string, string | undefined> = {
        role,
        caseFacts,
        legalQuestion,
      };
      
      if (caseId) {
        body.caseId = caseId;
      }

      if (referencesText?.trim()) {
        body.referencesText = referencesText;
      }
      
      // For aggregator, include previous responses
      if (role === "aggregator") {
        body.advocateResponse = results.advocate?.analysis || "";
        body.prosecutorResponse = results.prosecutor?.analysis || "";
        body.judgeResponse = results.judge?.analysis || "";
      }

      // Use raw fetch with extended timeout (150s) to avoid browser aborting long AI calls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 310_000);

      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      let response: Response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/ai-analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${session?.access_token ?? supabaseKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchErr: unknown) {
        clearTimeout(timeoutId);
        console.error("AI analysis error:", fetchErr);
        const errorMsg = fetchErr instanceof Error ? fetchErr.message : "";
        if (errorMsg.includes("402") || errorMsg.includes("Payment required") || errorMsg.includes("credits")) {
          setCreditsExhausted(true);
          toast.error(t("cases:ai_credits_exhausted"));
          return null;
        }
        toast.error(t("ai:analysis_failed"));
        return null;
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("AI analysis error:", response.status, errorText);
        if (response.status === 402 || errorText.includes("credits")) {
          setCreditsExhausted(true);
          toast.error(t("cases:ai_credits_exhausted"));
          return null;
        }
        toast.error(t("ai:analysis_failed"));
        return null;
      }

      const data = await response.json();

      if (data.error) {
        // Check for 402 in response data
        if (data.error.includes("402") || data.error.includes("credits") || data.error.includes("exhausted")) {
          setCreditsExhausted(true);
          toast.error(t("cases:ai_credits_exhausted"));
          return null;
        }
        toast.error(data.error);
        return null;
      }

      const result: AnalysisResult = {
        role: data.role,
        analysis: data.analysis,
        sources: data.sources || [],
        model: data.model_used || data.model,
        precedent_data: data.precedent_data || null,
        deadline_data: data.deadline_data || null,
        comparator_data: data.comparator_data || null,
        audit_data: data.audit_data || null,
        draft_text: data.draft_text || null,
        strategy_data: data.strategy_data || null,
      evidence_weakness_data: data.evidence_weakness_data || null,
        risk_factors_data: data.risk_factors_data || null,
        law_update_data: data.law_update_data || null,
        cross_exam_data: data.cross_exam_data || null,
      };

      setResults(prev => ({
        ...prev,
        [role]: result,
      }));

      toast.success(t("ai:analysis_complete"));
      return result;
      
    } catch (error) {
      console.error("AI analysis error:", error);
      const errorMsg = error instanceof Error ? error.message : "";
      if (errorMsg.includes("402") || errorMsg.includes("Payment required") || errorMsg.includes("credits")) {
        setCreditsExhausted(true);
        toast.error(t("cases:ai_credits_exhausted"));
        return null;
      }
      toast.error(t("ai:analysis_failed"));
      return null;
    } finally {
      setIsLoading(false);
      setCurrentRole(null);
    }
  }, [results, t]);

  /** Per-file analysis: analyze each file individually, then synthesize into a final report */
  const analyzeCasePerFile = useCallback(async (
    role: AIRole,
    caseId: string,
    caseFacts?: string,
    legalQuestion?: string,
    referencesText?: string
  ): Promise<AnalysisResult | null> => {
    setIsLoading(true);
    setCurrentRole(role);
    setCreditsExhausted(false);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${session?.access_token ?? supabaseKey}`,
      };

      // 1. Fetch list of case files
      const { data: caseFiles, error: filesError } = await supabase
        .from("case_files")
        .select("id, original_filename")
        .eq("case_id", caseId)
        .is("deleted_at", null);

      if (filesError || !caseFiles || caseFiles.length === 0) {
        // No files — fall back to regular analysis
        console.log("[per-file] No files found, falling back to regular analysis");
        setFileProgress(null);
        return analyzeCase(role, caseId, caseFacts, legalQuestion, referencesText);
      }

      // 2. Analyze each file individually
      const fileAnalyses: Array<{ fileName: string; analysis: string }> = [];
      setFileProgress({
        totalFiles: caseFiles.length,
        currentFileIndex: 0,
        currentFileName: caseFiles[0].original_filename,
        completedFiles: [],
        phase: 'per_file',
      });

      for (let i = 0; i < caseFiles.length; i++) {
        const file = caseFiles[i];
        setFileProgress(prev => prev ? {
          ...prev,
          currentFileIndex: i,
          currentFileName: file.original_filename,
          phase: 'per_file',
        } : null);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 310_000);

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/ai-analyze`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              role,
              caseId,
              caseFacts,
              legalQuestion,
              referencesText: referencesText?.trim() || undefined,
              fileId: file.id,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error(`[per-file] File ${file.original_filename} failed:`, response.status, errorText);
            if (response.status === 402) {
              setCreditsExhausted(true);
              toast.error(t("cases:ai_credits_exhausted"));
              setFileProgress(null);
              return null;
            }
            // Skip this file but continue
            fileAnalyses.push({ fileName: file.original_filename, analysis: `[Error: analysis failed for this file]` });
          } else {
            const data = await response.json();
            if (data.error) {
              fileAnalyses.push({ fileName: file.original_filename, analysis: `[Error: ${data.error}]` });
            } else {
              fileAnalyses.push({ fileName: file.original_filename, analysis: data.analysis || "" });
            }
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          console.error(`[per-file] File ${file.original_filename} fetch error:`, fetchErr);
          fileAnalyses.push({ fileName: file.original_filename, analysis: `[Error: request failed]` });
        }

        setFileProgress(prev => prev ? {
          ...prev,
          completedFiles: [...prev.completedFiles, file.original_filename],
        } : null);
      }

      // 3. Synthesis: send all per-file analyses for final report
      setFileProgress(prev => prev ? { ...prev, phase: 'synthesis', currentFileName: 'Synthesis...' } : null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 310_000);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/ai-analyze`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            role,
            caseId,
            caseFacts,
            legalQuestion,
            referencesText: referencesText?.trim() || undefined,
            fileAnalyses,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error("[per-file] Synthesis failed:", response.status, errorText);
          toast.error(t("ai:analysis_failed"));
          setFileProgress(null);
          return null;
        }

        const data = await response.json();
        if (data.error) {
          toast.error(data.error);
          setFileProgress(null);
          return null;
        }

        const result: AnalysisResult = {
          role: data.role,
          analysis: data.analysis,
          sources: data.sources || [],
          model: data.model_used || data.model,
          precedent_data: data.precedent_data || null,
          deadline_data: data.deadline_data || null,
          comparator_data: data.comparator_data || null,
          audit_data: data.audit_data || null,
          draft_text: data.draft_text || null,
          strategy_data: data.strategy_data || null,
          evidence_weakness_data: data.evidence_weakness_data || null,
          risk_factors_data: data.risk_factors_data || null,
          law_update_data: data.law_update_data || null,
          cross_exam_data: data.cross_exam_data || null,
        };

        setResults(prev => ({ ...prev, [role]: result }));
        toast.success(t("ai:analysis_complete"));
        setFileProgress(null);
        return result;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.error("[per-file] Synthesis fetch error:", fetchErr);
        toast.error(t("ai:analysis_failed"));
        setFileProgress(null);
        return null;
      }
    } catch (error) {
      console.error("[per-file] Error:", error);
      toast.error(t("ai:analysis_failed"));
      setFileProgress(null);
      return null;
    } finally {
      setIsLoading(false);
      setCurrentRole(null);
      setFileProgress(null);
    }
  }, [analyzeCase, t]);

  const runAllRoles = useCallback(async (
    caseId?: string,
    caseFacts?: string,
    legalQuestion?: string
  ): Promise<void> => {
    // Run advocate, prosecutor, judge in parallel
    const roles: AIRole[] = ["advocate", "prosecutor", "judge"];
    
    setIsLoading(true);
    
    try {
      const parallelResults = await Promise.all(
        roles.map(role => analyzeCase(role, caseId, caseFacts, legalQuestion))
      );
      
      // After all three complete, run aggregator with DIRECT results (not stale state)
      if (parallelResults.every(r => r !== null)) {
        const [advocateResult, prosecutorResult, judgeResult] = parallelResults;
        
        // Call aggregator with explicit previous responses
        setCurrentRole("aggregator");
        
        const body: Record<string, string | undefined> = {
          role: "aggregator",
          caseId,
          caseFacts,
          legalQuestion,
          advocateResponse: advocateResult?.analysis || "",
          prosecutorResponse: prosecutorResult?.analysis || "",
          judgeResponse: judgeResult?.analysis || "",
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 310_000);
        const session = (await supabase.auth.getSession()).data.session;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        let aggResponse: Response;
        try {
          aggResponse = await fetch(`${supabaseUrl}/functions/v1/ai-analyze`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Authorization": `Bearer ${session?.access_token ?? supabaseKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch {
          clearTimeout(timeoutId);
          toast.error(t("analysis_failed"));
          setCurrentRole(null);
          return;
        }
        clearTimeout(timeoutId);

        const data = aggResponse.ok ? await aggResponse.json() : null;

        if (data && !data.error) {
          const aggregatorResult: AnalysisResult = {
            role: data.role,
            analysis: data.analysis,
            sources: data.sources || [],
            model: data.model_used || data.model,
          };
          
          setResults(prev => ({
            ...prev,
            aggregator: aggregatorResult,
          }));
          
          toast.success(t("analysis_complete"));
        } else {
          console.error("Aggregator analysis error:", data?.error);
          toast.error(t("analysis_failed"));
        }
        
        setCurrentRole(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const clearResults = useCallback(() => {
    setResults({
      advocate: null,
      prosecutor: null,
      judge: null,
      aggregator: null,
      precedent_citation: null,
      deadline_rules: null,
      legal_position_comparator: null,
      hallucination_audit: null,
      draft_deterministic: null,
      strategy_builder: null,
      evidence_weakness: null,
      risk_factors: null,
      law_update_summary: null,
      cross_exam: null,
    });
    setCreditsExhausted(false);
  }, []);

  const loadResults = useCallback((loadedResults: Partial<Record<AIRole, AnalysisResult | null>>) => {
    setResults(prev => ({
      ...prev,
      ...loadedResults,
    }));
  }, []);

  return {
    isLoading,
    currentRole,
    results,
    creditsExhausted,
    fileProgress,
    analyzeCase,
    analyzeCasePerFile,
    runAllRoles,
    clearResults,
    loadResults,
  };
}

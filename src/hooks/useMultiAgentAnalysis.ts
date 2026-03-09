import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Json } from "@/integrations/supabase/types";
import type { 
  AgentType, 
  AgentAnalysisRun, 
  EvidenceItem, 
  CaseVolume,
  AggregatedReport,
  AgentFinding
} from "@/components/agents/types";

export interface MultiAgentFileProgress {
  totalFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  completedFiles: string[];
  phase: 'per_file' | 'synthesis' | 'idle';
}

// Type-safe casting functions for DB results
// Note: Using 'unknown' intermediate cast is the standard TypeScript pattern
// when the runtime shape is correct but types don't statically overlap
function castToAgentRuns(data: unknown[]): AgentAnalysisRun[] {
  return (data as AgentAnalysisRun[]).map(row => ({
    ...row,
    findings: row.findings as AgentFinding[] | undefined,
    sources_used: row.sources_used as Array<{ title: string; category: string }> | undefined,
  }));
}

function castToEvidenceItems(data: unknown[]): EvidenceItem[] {
  return data as EvidenceItem[];
}

function castToVolumes(data: unknown[]): CaseVolume[] {
  return data as CaseVolume[];
}

interface UseMultiAgentAnalysisReturn {
  isLoading: boolean;
  currentAgent: AgentType | null;
  runs: AgentAnalysisRun[];
  evidenceRegistry: EvidenceItem[];
  volumes: CaseVolume[];
  aggregatedReport: AggregatedReport | null;
  fileProgress: MultiAgentFileProgress | null;
  
  // Volume management
  loadVolumes: (caseId: string) => Promise<void>;
  createVolume: (caseId: string, data: Partial<CaseVolume>) => Promise<CaseVolume | null>;
  updateVolume: (volumeId: string, data: Partial<CaseVolume>) => Promise<void>;
  deleteVolume: (volumeId: string) => Promise<void>;
  
  // Agent execution
  runAgent: (caseId: string, agentType: AgentType, referencesText?: string) => Promise<AgentAnalysisRun | null>;
  runAllAgents: (caseId: string, referencesText?: string, selectedAgents?: AgentType[], options?: { fastMode?: boolean; skipCached?: boolean }) => Promise<void>;
  loadRuns: (caseId: string) => Promise<void>;
  hasRecentRun: (caseId: string, agentType: AgentType, maxAgeMinutes?: number) => boolean;
  
  // Evidence registry
  loadEvidenceRegistry: (caseId: string) => Promise<void>;
  updateEvidenceItem: (itemId: string, data: Partial<EvidenceItem>) => Promise<void>;
  
  // Aggregated report
  generateAggregatedReport: (caseId: string) => Promise<AggregatedReport | null>;
  loadAggregatedReport: (caseId: string) => Promise<void>;
}

export function useMultiAgentAnalysis(): UseMultiAgentAnalysisReturn {
  const { t } = useTranslation(["ai", "cases"]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentType | null>(null);
  const [runs, setRuns] = useState<AgentAnalysisRun[]>([]);
  const [evidenceRegistry, setEvidenceRegistry] = useState<EvidenceItem[]>([]);
  const [volumes, setVolumes] = useState<CaseVolume[]>([]);
  const [aggregatedReport, setAggregatedReport] = useState<AggregatedReport | null>(null);
  const [fileProgress, setFileProgress] = useState<MultiAgentFileProgress | null>(null);

  // Load volumes for a case
  const loadVolumes = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from("case_volumes")
      .select("*")
      .eq("case_id", caseId)
      .order("volume_number");
    
    if (error) {
      console.error("Error loading volumes:", error);
      toast.error(t("cases:error_loading_volumes"));
      return;
    }
    
    setVolumes(castToVolumes(data || []));
  }, [t]);

  // Create a new volume
  const createVolume = useCallback(async (caseId: string, data: Partial<CaseVolume>): Promise<CaseVolume | null> => {
    // Get next volume number
    const maxVolume = volumes.reduce((max, v) => Math.max(max, v.volume_number), 0);
    
    const { data: newVolume, error } = await supabase
      .from("case_volumes")
      .insert({
        case_id: caseId,
        volume_number: maxVolume + 1,
        title: data.title || `\u0540\u0561\u057f\u0578\u0580 ${maxVolume + 1}`,
        description: data.description,
        file_id: data.file_id,
        page_count: data.page_count
      })
      .select()
      .single();
    
    if (error) {
      console.error("Error creating volume:", error);
      toast.error(t("cases:error_creating_volume"));
      return null;
    }
    
    setVolumes(prev => [...prev, newVolume as CaseVolume]);
    toast.success(t("cases:volume_created"));
    return newVolume as CaseVolume;
  }, [volumes, t]);

  // Update volume
  const updateVolume = useCallback(async (volumeId: string, data: Partial<CaseVolume>) => {
    const { error } = await supabase
      .from("case_volumes")
      .update(data)
      .eq("id", volumeId);
    
    if (error) {
      console.error("Error updating volume:", error);
      toast.error(t("cases:error_updating_volume"));
      return;
    }
    
    setVolumes(prev => prev.map(v => v.id === volumeId ? { ...v, ...data } : v));
  }, [t]);

  // Delete volume
  const deleteVolume = useCallback(async (volumeId: string) => {
    const { error } = await supabase
      .from("case_volumes")
      .delete()
      .eq("id", volumeId);
    
    if (error) {
      console.error("Error deleting volume:", error);
      toast.error(t("cases:error_deleting_volume"));
      return;
    }
    
    setVolumes(prev => prev.filter(v => v.id !== volumeId));
    toast.success(t("cases:volume_deleted"));
  }, [t]);

  // Load agent runs
  const loadRuns = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from("agent_analysis_runs")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error loading runs:", error);
      return;
    }
    
    setRuns(castToAgentRuns(data || []));
  }, []);

  // Helper: call multi-agent-analyze with raw fetch (310s timeout)
  const callMultiAgent = useCallback(async (
    requestBody: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> => {
    const session = (await supabase.auth.getSession()).data.session;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 310_000);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/multi-agent-analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${session?.access_token ?? supabaseKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }, []);

  // Run a single agent (with per-file processing)
  const runAgent = useCallback(async (caseId: string, agentType: AgentType, referencesText?: string): Promise<AgentAnalysisRun | null> => {
    setIsLoading(true);
    setCurrentAgent(agentType);
    
    try {
      // Create run record
      const { data: run, error: createError } = await supabase
        .from("agent_analysis_runs")
        .insert({
          case_id: caseId,
          agent_type: agentType,
          status: "running",
          started_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        throw createError;
      }

      // Fetch case files for per-file analysis
      const { data: caseFiles } = await supabase
        .from("case_files")
        .select("id, original_filename")
        .eq("case_id", caseId)
        .is("deleted_at", null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;

      try {
        // Per-file mode: if there are files, analyze each one individually, then synthesize
        if (caseFiles && caseFiles.length > 0 && agentType !== "aggregator") {
          console.log(`[multi-agent] Per-file mode: ${caseFiles.length} files for ${agentType}`);
          
          const fileAnalyses: Array<{ fileName: string; analysis: string }> = [];
          setFileProgress({
            totalFiles: caseFiles.length,
            currentFileIndex: 0,
            currentFileName: caseFiles[0].original_filename,
            completedFiles: [],
            phase: 'per_file',
          });

          // Process all files in parallel
          const filePromises = caseFiles.map(async (file) => {
            try {
              const fileResult = await callMultiAgent({
                caseId,
                agentType,
                runId: run.id,
                fileId: file.id,
                ...(referencesText?.trim() ? { referencesText } : {}),
              });

              setFileProgress(prev => prev ? {
                ...prev,
                completedFiles: [...prev.completedFiles, file.original_filename],
              } : null);

              return {
                fileName: file.original_filename,
                analysis: fileResult.analysis || JSON.stringify(fileResult),
              };
            } catch (fileErr) {
              console.error(`[multi-agent] File ${file.original_filename} failed:`, fileErr);
              setFileProgress(prev => prev ? {
                ...prev,
                completedFiles: [...prev.completedFiles, file.original_filename],
              } : null);
              return {
                fileName: file.original_filename,
                analysis: `[Error: ${fileErr instanceof Error ? fileErr.message : "analysis failed"}]`,
              };
            }
          });

          const results = await Promise.all(filePromises);
          fileAnalyses.push(...results);

          // Synthesis phase
          setFileProgress(prev => prev ? {
            ...prev,
            phase: 'synthesis',
            currentFileName: 'Synthesis...',
          } : null);

          data = await callMultiAgent({
            caseId,
            agentType,
            runId: run.id,
            fileAnalyses,
            ...(referencesText?.trim() ? { referencesText } : {}),
          });

          setFileProgress(null);
        } else {
          // Fallback: full case mode (aggregator or no files)
          const requestBody: Record<string, unknown> = {
            caseId,
            agentType,
            runId: run.id,
          };
          if (referencesText?.trim()) {
            requestBody.referencesText = referencesText;
          }
          data = await callMultiAgent(requestBody);
        }
      } catch (fetchErr) {
        setFileProgress(null);
        // Update run with error
        await supabase
          .from("agent_analysis_runs")
          .update({
            status: "failed",
            error_message: fetchErr instanceof Error ? fetchErr.message : "Request failed",
            completed_at: new Date().toISOString()
          })
          .eq("id", run.id);
        
        throw fetchErr;
      }
      
      // Update run with results
      const updatedRun: AgentAnalysisRun = {
        ...run,
        status: "completed",
        completed_at: new Date().toISOString(),
        analysis_result: data.analysis,
        summary: data.summary,
        findings: data.findings || [],
        sources_used: data.sources || [],
        tokens_used: data.tokensUsed
      };
      
      await supabase
        .from("agent_analysis_runs")
        .update({
          status: "completed",
          completed_at: updatedRun.completed_at,
          analysis_result: updatedRun.analysis_result,
          summary: updatedRun.summary,
          findings: (updatedRun.findings || []) as unknown as Json,
          sources_used: (updatedRun.sources_used || []) as unknown as Json,
          tokens_used: updatedRun.tokens_used
        })
        .eq("id", run.id);
      
      // Save findings to separate table
      if (data.findings?.length > 0) {
        const findingsToInsert = data.findings.map((f: AgentFinding) => ({
          run_id: run.id,
          case_id: caseId,
          finding_type: f.finding_type,
          severity: f.severity,
          title: f.title,
          description: f.description,
          legal_basis: f.legal_basis || [],
          evidence_refs: f.evidence_refs || [],
          page_references: f.page_references || [],
          recommendation: f.recommendation || null
        }));
        
        await supabase.from("agent_findings").insert(findingsToInsert);
      }
      
      // If evidence collector, save to evidence registry
      if (agentType === "evidence_collector" && data.evidenceItems?.length > 0) {
        const evidenceToInsert = data.evidenceItems.map((e: Partial<EvidenceItem>, idx: number) => ({
          case_id: caseId,
          evidence_number: idx + 1,
          evidence_type: e.evidence_type || "document",
          title: e.title,
          description: e.description,
          page_reference: e.page_reference,
          source_document: e.source_document,
          admissibility_status: "pending_review",
          ai_analysis: e.ai_analysis
        }));
        
        await supabase.from("evidence_registry").insert(evidenceToInsert);
      }
      
      setRuns(prev => [updatedRun as AgentAnalysisRun, ...prev.filter(r => r.id !== run.id)]);
      toast.success(t("ai:analysis_complete"));
      
      return updatedRun as AgentAnalysisRun;
      
    } catch (error) {
      console.error("Agent run error:", error);
      toast.error(t("ai:analysis_failed"));
      return null;
    } finally {
      setIsLoading(false);
      setCurrentAgent(null);
      setFileProgress(null);
    }
  }, [callMultiAgent, t]);

  // Check if a recent completed run exists for this agent (caching)
  const hasRecentRun = useCallback((caseId: string, agentType: AgentType, maxAgeMinutes = 60): boolean => {
    const existing = runs.find(r => 
      r.case_id === caseId && 
      r.agent_type === agentType && 
      r.status === "completed" &&
      r.completed_at
    );
    if (!existing?.completed_at) return false;
    const age = Date.now() - new Date(existing.completed_at).getTime();
    return age < maxAgeMinutes * 60 * 1000;
  }, [runs]);

  // Run all (or selected) agents with PARALLEL execution phases
  const runAllAgents = useCallback(async (
    caseId: string, 
    referencesText?: string, 
    selectedAgents?: AgentType[],
    options?: { fastMode?: boolean; skipCached?: boolean }
  ) => {
    const defaultOrder: AgentType[] = [
      "evidence_collector",
      "evidence_admissibility",
      "charge_qualification",
      "procedural_violations",
      "substantive_violations",
      "defense_strategy",
      "prosecution_weaknesses",
      "rights_violations",
      "aggregator"
    ];
    
    let agentOrder = selectedAgents && selectedAgents.length > 0
      ? defaultOrder.filter(a => selectedAgents.includes(a))
      : defaultOrder;

    // Caching: skip agents with recent completed runs
    if (options?.skipCached) {
      const skipped = agentOrder.filter(a => hasRecentRun(caseId, a));
      if (skipped.length > 0) {
        console.log(`[multi-agent] Skipping cached agents: ${skipped.join(", ")}`);
        toast.info(`${skipped.length} ${t("ai:agents_cached_skip")}`);
      }
      agentOrder = agentOrder.filter(a => !hasRecentRun(caseId, a));
      if (agentOrder.length === 0) {
        toast.success(t("ai:all_agents_cached"));
        return;
      }
    }

    // Split into 3 phases for parallel execution:
    // Phase 1: evidence_collector (must run first, feeds other agents)
    // Phase 2: all middle agents (can run in parallel)
    // Phase 3: aggregator (must run last, synthesizes all)
    const phase1 = agentOrder.filter(a => a === "evidence_collector");
    const phase3 = agentOrder.filter(a => a === "aggregator");
    const phase2 = agentOrder.filter(a => a !== "evidence_collector" && a !== "aggregator");
    
    setIsLoading(true);
    let allSucceeded = true;
    
    try {
      // Phase 1: Evidence collector (sequential - required by others)
      for (const agentType of phase1) {
        const result = await runAgent(caseId, agentType, referencesText);
        if (!result) {
          allSucceeded = false;
          toast.error(`${t("ai:analysis_failed")}: ${agentType}`);
          return;
        }
      }

      // Phase 2: All middle agents IN PARALLEL (5-7x speedup!)
      if (phase2.length > 0) {
        const results = await Promise.allSettled(
          phase2.map(agentType => runAgent(caseId, agentType, referencesText))
        );
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "rejected" || (result.status === "fulfilled" && !result.value)) {
            allSucceeded = false;
            toast.error(`${t("ai:analysis_failed")}: ${phase2[i]}`);
          }
        }
      }

      // Phase 3: Aggregator (sequential - needs all results)
      if (allSucceeded) {
        // Reload runs to get latest results for aggregator
        await loadRuns(caseId);
        for (const agentType of phase3) {
          const result = await runAgent(caseId, agentType, referencesText);
          if (!result) {
            allSucceeded = false;
            toast.error(`${t("ai:analysis_failed")}: ${agentType}`);
          }
        }
      }
      
      if (allSucceeded) {
        toast.success(t("ai:all_agents_complete"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [runAgent, hasRecentRun, loadRuns, t]);

  // Load evidence registry
  const loadEvidenceRegistry = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from("evidence_registry")
      .select("*")
      .eq("case_id", caseId)
      .order("evidence_number");
    
    if (error) {
      console.error("Error loading evidence:", error);
      return;
    }
    
    setEvidenceRegistry(castToEvidenceItems(data || []));
  }, []);

  // Update evidence item
  const updateEvidenceItem = useCallback(async (itemId: string, data: Partial<EvidenceItem>) => {
    // Convert to DB-safe format
    const dbData: Record<string, unknown> = { ...data };
    if (data.metadata) {
      dbData.metadata = data.metadata as unknown as Json;
    }
    
    const { error } = await supabase
      .from("evidence_registry")
      .update(dbData)
      .eq("id", itemId);
    
    if (error) {
      console.error("Error updating evidence:", error);
      toast.error(t("cases:error_updating_evidence"));
      return;
    }
    
    setEvidenceRegistry(prev => prev.map(e => e.id === itemId ? { ...e, ...data } : e));
    toast.success(t("cases:evidence_updated"));
  }, [t]);

  // Generate aggregated report
  const generateAggregatedReport = useCallback(async (caseId: string): Promise<AggregatedReport | null> => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("multi-agent-analyze", {
        body: {
          caseId,
          agentType: "aggregator",
          generateReport: true
        }
      });
      
      if (error) throw error;
      
      // Save report
      const { data: report, error: saveError } = await supabase
        .from("aggregated_reports")
        .insert({
          case_id: caseId,
          report_type: "full_analysis",
          title: data.title,
          executive_summary: data.executiveSummary,
          evidence_summary: data.evidenceSummary,
          violations_summary: data.violationsSummary,
          defense_strategy: data.defenseStrategy,
          prosecution_weaknesses: data.prosecutionWeaknesses,
          recommendations: data.recommendations,
          full_report: data.fullReport,
          agent_runs: runs.map(r => r.id),
          statistics: data.statistics
        })
        .select()
        .single();
      
      if (saveError) throw saveError;
      
      setAggregatedReport(report as AggregatedReport);
      toast.success(t("ai:report_generated"));
      
      return report as AggregatedReport;
      
    } catch (error) {
      console.error("Report generation error:", error);
      toast.error(t("ai:report_failed"));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [runs, t]);

  // Load aggregated report
  const loadAggregatedReport = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from("aggregated_reports")
      .select("*")
      .eq("case_id", caseId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== "PGRST116") {
      console.error("Error loading report:", error);
      return;
    }
    
    setAggregatedReport(data as AggregatedReport | null);
  }, []);

  return {
    isLoading,
    currentAgent,
    runs,
    evidenceRegistry,
    volumes,
    aggregatedReport,
    fileProgress,
    loadVolumes,
    createVolume,
    updateVolume,
    deleteVolume,
    runAgent,
    runAllAgents,
    loadRuns,
    loadEvidenceRegistry,
    updateEvidenceItem,
    generateAggregatedReport,
    loadAggregatedReport,
    hasRecentRun,
  };
}

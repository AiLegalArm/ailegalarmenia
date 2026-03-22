import { useState, useCallback, useEffect, useRef } from 'react';
import { stripMarkdown } from '@/lib/strip-markdown';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAIAnalysis, type AIRole } from '@/hooks/useAIAnalysis';
import { useToast } from '@/hooks/use-toast';
import { useBackgroundQueue } from '@/hooks/useBackgroundQueue';
import { FeedbackStars } from '@/components/FeedbackStars';
import { PdfExportButton } from '@/components/PdfExportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { exportAnalysisToPDF, exportMultipleAnalysesToPDF } from '@/lib/pdfExport';
import { Loader2, Brain, Download, FileSignature, Save, AlertTriangle, Check, Scale, Timer, GitCompare, ShieldCheck, FileText, Target, Search, BarChart3, BookOpen, MessageSquareQuote } from 'lucide-react';
import { useReferencesText } from '@/lib/references-store';
import { PrecedentCitationView, type PrecedentCitationResult } from '@/components/cases/PrecedentCitationView';
import { DeadlineRulesView, type DeadlineRulesResult } from '@/components/cases/DeadlineRulesView';
import { LegalPositionComparatorView, type LegalPositionComparatorResult } from '@/components/cases/LegalPositionComparatorView';
import { HallucinationAuditView, type HallucinationAuditResult } from '@/components/cases/HallucinationAuditView';
import { StrategyBuilderView, type StrategyBuilderResult } from '@/components/cases/StrategyBuilderView';
import { EvidenceWeaknessView, type EvidenceWeaknessResult } from '@/components/cases/EvidenceWeaknessView';
import { RiskFactorsView, type RiskFactorsResult } from '@/components/cases/RiskFactorsView';
import { LawUpdateSummaryView, type LawUpdateSummaryResult } from '@/components/cases/LawUpdateSummaryView';
import { CrossExamView, type CrossExamResult } from '@/components/cases/CrossExamView';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CaseAIAnalysisPanelProps {
  caseId: string;
  facts?: string | null;
  legalQuestion?: string | null;
  caseNumber: string;
  caseTitle: string;
  aiCreditsExhausted: boolean;
  onOpenComplaintGenerator: () => void;
  /** @deprecated Use the centralized references store instead */
  referencesText?: string;
}

export function CaseAIAnalysisPanel({
  caseId,
  facts: _facts,
  legalQuestion,
  caseNumber,
  caseTitle,
  aiCreditsExhausted,
  onOpenComplaintGenerator,
  referencesText: _legacyReferencesText
}: CaseAIAnalysisPanelProps) {
  const facts = _facts ?? undefined;
  const storeText = useReferencesText(caseId);
  const referencesText = (_legacyReferencesText?.trim() ? _legacyReferencesText : storeText) ?? undefined;
  const { t, i18n } = useTranslation(['ai', 'cases', 'common', 'disclaimer', 'errors']);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const {
    isLoading: isAnalyzing,
    currentRole,
    results,
    fileProgress,
    analyzeCase,
    analyzeCasePerFile,
    clearResults,
    loadResults
  } = useAIAnalysis();

  const { enqueue, isProcessing: isQueueBusy } = useBackgroundQueue();
  
  const [enabledRoles, setEnabledRoles] = useState({
    advocate: true,
    prosecutor: true,
    judge: true,
  });
  
  const [savingAnalysisRole, setSavingAnalysisRole] = useState<AIRole | null>(null);
  const [savedAnalysisRoles, setSavedAnalysisRoles] = useState<Set<AIRole>>(new Set());
  const [loadingSavedAnalyses, setLoadingSavedAnalyses] = useState(false);
  const [precedentData, setPrecedentData] = useState<PrecedentCitationResult | null>(null);
  const [isPrecedentLoading, setIsPrecedentLoading] = useState(false);
  const [deadlineData, setDeadlineData] = useState<DeadlineRulesResult | null>(null);
  const [isDeadlineLoading, setIsDeadlineLoading] = useState(false);
  const [comparatorData, setComparatorData] = useState<LegalPositionComparatorResult | null>(null);
  const [isComparatorLoading, setIsComparatorLoading] = useState(false);
  const [auditData, setAuditData] = useState<HallucinationAuditResult | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [strategyData, setStrategyData] = useState<StrategyBuilderResult | null>(null);
  const [isStrategyLoading, setIsStrategyLoading] = useState(false);
  const [evidenceWeaknessData, setEvidenceWeaknessData] = useState<EvidenceWeaknessResult | null>(null);
  const [isEvidenceWeaknessLoading, setIsEvidenceWeaknessLoading] = useState(false);
  const [riskFactorsData, setRiskFactorsData] = useState<RiskFactorsResult | null>(null);
  const [isRiskFactorsLoading, setIsRiskFactorsLoading] = useState(false);
  const [lawUpdateData, setLawUpdateData] = useState<LawUpdateSummaryResult | null>(null);
  const [isLawUpdateLoading, setIsLawUpdateLoading] = useState(false);
  const [showLawUpdateDialog, setShowLawUpdateDialog] = useState(false);
  const [oldLawText, setOldLawText] = useState('');
  const [newLawText, setNewLawText] = useState('');
  const [crossExamData, setCrossExamData] = useState<CrossExamResult | null>(null);
  const [isCrossExamLoading, setIsCrossExamLoading] = useState(false);

  // If user clicks "Clear" while the initial saved-analyses load is still in-flight,
  // we must ignore that async result to prevent the content from "reappearing".
  const ignoreSavedAnalysesLoadRef = useRef(false);

  // Load previously saved analyses
  useEffect(() => {
    const loadSavedAnalyses = async () => {
      ignoreSavedAnalysesLoadRef.current = false;
      setLoadingSavedAnalyses(true);
      try {
        const { data, error } = await supabase
          .from('ai_analysis')
          .select('id, role, response_text, sources_used, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (ignoreSavedAnalysesLoadRef.current) return;

        if (data && data.length > 0) {
          const latestByRole = new Map<string, typeof data[0]>();
          for (const item of data) {
            if (!latestByRole.has(item.role)) {
              latestByRole.set(item.role, item);
            }
          }

          const savedRolesSet = new Set<AIRole>();
          const loadedResults: Partial<Record<AIRole, { role: AIRole; analysis: string; sources: Array<{ title: string; category: string; source_name: string }>; model: string } | null>> = {};
          
          latestByRole.forEach((item, role) => {
            const validRoles: AIRole[] = ['advocate', 'prosecutor', 'judge', 'aggregator'];
            if (validRoles.includes(role as AIRole)) {
              savedRolesSet.add(role as AIRole);
              const sources = Array.isArray(item.sources_used)
                ? (item.sources_used as Array<{ title: string; category: string; source_name: string }>)
                : [];
              loadedResults[role as AIRole] = {
                role: role as AIRole,
                analysis: item.response_text,
                sources,
                model: 'loaded'
              };
            }
          });

          loadResults(loadedResults);
          setSavedAnalysisRoles(savedRolesSet);
        }
      } catch (error) {
        console.error('Failed to load saved analyses:', error);
      } finally {
        setLoadingSavedAnalyses(false);
      }
    };

    loadSavedAnalyses();
  }, [caseId, loadResults]);


  const handleSaveAnalysis = useCallback(async (role: AIRole) => {
    if (!results[role]) return;
    
    setSavingAnalysisRole(role);
    try {
      const { error } = await supabase.from('ai_analysis').insert({
        case_id: caseId,
        role,
        response_text: results[role]!.analysis,
        sources_used: results[role]!.sources as unknown as Database['public']['Tables']['ai_analysis']['Insert']['sources_used'],
        created_by: user?.id,
      });
      
      if (error) throw error;
      
      setSavedAnalysisRoles(prev => new Set(prev).add(role));
      toast({ title: t('ai:feedback_submit_success') });
    } catch (error) {
      console.error('Save analysis error:', error);
      toast({ title: t('errors:operation_failed'), variant: 'destructive' });
    } finally {
      setSavingAnalysisRole(null);
    }
  }, [caseId, results, user?.id, toast, t]);

  const handleStartAnalysis = () => {
    const canRunAggregator = enabledRoles.advocate && enabledRoles.prosecutor && enabledRoles.judge;
    
    const rolesToRun: AIRole[] = [];
    if (enabledRoles.advocate) rolesToRun.push('advocate');
    if (enabledRoles.prosecutor) rolesToRun.push('prosecutor');
    if (enabledRoles.judge) rolesToRun.push('judge');
    
    if (rolesToRun.length === 0) {
      toast({
        title: i18n.language === 'hy' ? '\u0538\u0576\u057F\u0580\u0565\u0584 \u0563\u0578\u0576\u0565 \u0574\u0565\u056F \u0564\u0565\u0580' 
             : i18n.language === 'en' ? 'Select at least one role' 
             : '\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0440\u043E\u043B\u044C',
        variant: 'destructive'
      });
      return;
    }
    
    // Enqueue each role as a background task
    for (const role of rolesToRun) {
      const roleLabel = role === 'advocate' 
        ? (i18n.language === 'hy' ? '\u054a\u0561\u0577\u057f\u057a\u0561\u0576' : i18n.language === 'en' ? 'Advocate' : '\u0410\u0434\u0432\u043e\u043a\u0430\u0442')
        : role === 'prosecutor'
        ? (i18n.language === 'hy' ? '\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572' : i18n.language === 'en' ? 'Prosecutor' : '\u041f\u0440\u043e\u043a\u0443\u0440\u043e\u0440')
        : (i18n.language === 'hy' ? '\u0534\u0561\u057f\u0561\u057e\u0578\u0580' : i18n.language === 'en' ? 'Judge' : '\u0421\u0443\u0434\u044c\u044f');
      
      enqueue(
        `ai-${role}-${caseId}`,
        `AI: ${roleLabel}`,
        () => analyzeCasePerFile(role, caseId, facts || undefined, legalQuestion || '', referencesText)
      );
    }
    
    // Enqueue aggregator if all 3 roles selected
    if (canRunAggregator) {
      enqueue(
        `ai-aggregator-${caseId}`,
        `AI: ${i18n.language === 'hy' ? '\u0540\u0561\u0574\u0561\u0570\u0561\u057e\u0561\u0584' : i18n.language === 'en' ? 'Aggregator' : '\u0410\u0433\u0440\u0435\u0433\u0430\u0442\u043e\u0440'}`,
        () => analyzeCase('aggregator', caseId, facts || undefined, legalQuestion || '', referencesText)
      );
    }
  };

  // Helper to enqueue individual analysis functions
  const enqueueAnalysis = (id: string, label: string, fn: () => Promise<unknown>) => {
    enqueue(`analysis-${id}-${caseId}`, label, fn);
  };

  const handleExportSingleAnalysis = async (role: AIRole) => {
    if (!results[role]) return;
    
    await exportAnalysisToPDF({
      caseNumber,
      caseTitle,
      role,
      analysisText: results[role]!.analysis,
      sources: results[role]!.sources,
      createdAt: new Date(),
      language: 'hy'
    });
  };

  const handleExportAllAnalyses = async () => {
    const analyses = Object.entries(results)
      .filter((entry): entry is [string, NonNullable<typeof results[keyof typeof results]>] => entry[1] !== null)
      .map(([role, result]) => ({
        role,
        text: result.analysis,
        sources: result.sources
      }));
    
    if (analyses.length === 0) return;
    
    await exportMultipleAnalysesToPDF(caseNumber, caseTitle, analyses, 'hy');
  };
  
  const canEnableAggregator = enabledRoles.advocate && enabledRoles.prosecutor && enabledRoles.judge;

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {aiCreditsExhausted && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <AlertDescription className="break-words">{t('cases:ai_credits_exhausted_analysis')}</AlertDescription>
        </Alert>
      )}
      
      {/* AI Warning */}
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400 break-words">
          ⚠️ {t('disclaimer:ai_warning')}
        </p>
      </div>

      {/* Per-file analysis progress */}
      {fileProgress && (
        <Card className="overflow-hidden w-full">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">
                {fileProgress.phase === 'per_file' 
                  ? `${i18n.language === 'hy' ? ' Delays  Ö' : i18n.language === 'en' ? 'Analyzing file' : 'Анализ файла'} ${fileProgress.currentFileIndex + 1}/${fileProgress.totalFiles}`
                  : i18n.language === 'hy' ? 'Ամdelays  ' : i18n.language === 'en' ? 'Synthesizing final report...' : 'Синтез итогового отчёта...'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mb-2">{fileProgress.currentFileName}</p>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${fileProgress.phase === 'synthesis' ? 95 : ((fileProgress.completedFiles.length / fileProgress.totalFiles) * 90)}%` }}
              />
            </div>
            {fileProgress.completedFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {fileProgress.completedFiles.map((name, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                    <Check className="h-3 w-3 text-green-500" /> {name.substring(0, 20)}{name.length > 20 ? '...' : ''}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      <Card className="overflow-hidden w-full min-w-0">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg mb-3">{t('ai:analyze')}</CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <Button variant="outline" size="sm" onClick={onOpenComplaintGenerator} className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start">
                <FileSignature className="mr-1.5 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u0532\u0578\u0572\u0578\u0584' : i18n.language === 'en' ? 'Complaint' : '\u0416\u0430\u043B\u043E\u0431\u0430'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('precedent', i18n.language === 'hy' ? '\u0546\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580' : 'Precedents', async () => {
                  setIsPrecedentLoading(true);
                  setPrecedentData(null);
                  try {
                    const result = await analyzeCase('precedent_citation', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.precedent_data) setPrecedentData(result.precedent_data as PrecedentCitationResult);
                  } finally { setIsPrecedentLoading(false); }
                })}
                disabled={isPrecedentLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isPrecedentLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Scale className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u0546\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580' : i18n.language === 'en' ? 'Precedents' : '\u041F\u0440\u0435\u0446\u0435\u0434\u0435\u043D\u0442\u044B'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('deadline', 'Deadlines', async () => {
                  setIsDeadlineLoading(true); setDeadlineData(null);
                  try {
                    const result = await analyzeCase('deadline_rules', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.deadline_data) setDeadlineData(result.deadline_data as DeadlineRulesResult);
                  } finally { setIsDeadlineLoading(false); }
                })}
                disabled={isDeadlineLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isDeadlineLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Timer className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u053a\u0561\u0574\u056F\u0565\u057F\u0576\u0565\u0580' : i18n.language === 'en' ? 'Deadlines' : '\u0421\u0440\u043E\u043A\u0438'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('comparator', 'Compare', async () => {
                  setIsComparatorLoading(true); setComparatorData(null);
                  try {
                    const result = await analyzeCase('legal_position_comparator', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.comparator_data) setComparatorData(result.comparator_data as LegalPositionComparatorResult);
                  } finally { setIsComparatorLoading(false); }
                })}
                disabled={isComparatorLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isComparatorLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <GitCompare className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u0540\u0561\u0574\u0561\u0564\u0580\u0578\u0582\u0574' : i18n.language === 'en' ? 'Compare' : '\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('audit', 'Audit', async () => {
                  setIsAuditLoading(true); setAuditData(null);
                  try {
                    const result = await analyzeCase('hallucination_audit', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.audit_data) setAuditData(result.audit_data as HallucinationAuditResult);
                  } finally { setIsAuditLoading(false); }
                })}
                disabled={isAuditLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isAuditLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u054D\u057F\u0578\u0582\u0563\u0578\u0582\u0574' : i18n.language === 'en' ? 'Audit' : '\u0410\u0443\u0434\u0438\u057F'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('draft', 'Draft', async () => {
                  setIsDraftLoading(true); setDraftText(null);
                  try {
                    const result = await analyzeCase('draft_deterministic', caseId, facts, legalQuestion || '', referencesText);
                    if (result) setDraftText(result.draft_text || result.analysis || null);
                  } finally { setIsDraftLoading(false); }
                })}
                disabled={isDraftLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isDraftLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u0546\u0561\u056D\u0561\u0563\u056B\u056E' : i18n.language === 'en' ? 'Draft' : '\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('strategy', 'Strategy', async () => {
                  setIsStrategyLoading(true); setStrategyData(null);
                  try {
                    const result = await analyzeCase('strategy_builder', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.strategy_data) setStrategyData(result.strategy_data as StrategyBuilderResult);
                  } finally { setIsStrategyLoading(false); }
                })}
                disabled={isStrategyLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isStrategyLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Target className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u054C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576' : i18n.language === 'en' ? 'Strategy' : '\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('evidence-weakness', 'Weaknesses', async () => {
                  setIsEvidenceWeaknessLoading(true); setEvidenceWeaknessData(null);
                  try {
                    const result = await analyzeCase('evidence_weakness', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.evidence_weakness_data) setEvidenceWeaknessData(result.evidence_weakness_data as EvidenceWeaknessResult);
                  } finally { setIsEvidenceWeaknessLoading(false); }
                })}
                disabled={isEvidenceWeaknessLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isEvidenceWeaknessLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Search className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u0539\u0578\u0582\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580' : i18n.language === 'en' ? 'Weaknesses' : '\u0423\u044F\u0437\u0432\u0438\u043C\u043E\u0441\u0442\u0438'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('risk-factors', 'Risks', async () => {
                  setIsRiskFactorsLoading(true); setRiskFactorsData(null);
                  try {
                    const result = await analyzeCase('risk_factors', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.risk_factors_data) setRiskFactorsData(result.risk_factors_data as RiskFactorsResult);
                  } finally { setIsRiskFactorsLoading(false); }
                })}
                disabled={isRiskFactorsLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isRiskFactorsLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <BarChart3 className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u054C\u056B\u057D\u056F\u0565\u0580' : i18n.language === 'en' ? 'Risks' : '\u0420\u0438\u0441\u043A\u0438'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowLawUpdateDialog(true)}
                disabled={isLawUpdateLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isLawUpdateLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <BookOpen className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u0555\u0580\u0565\u0576\u0584\u056B \u0583\u0578\u0583\u0578\u056D.' : i18n.language === 'en' ? 'Law Changes' : '\u0418\u0437\u043C. \u0437\u0430\u043A\u043E\u043D\u0430'}
                </span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => enqueueAnalysis('cross-exam', 'Cross-Exam', async () => {
                  setIsCrossExamLoading(true); setCrossExamData(null);
                  try {
                    const result = await analyzeCase('cross_exam', caseId, facts, legalQuestion || '', referencesText);
                    if (result?.cross_exam_data) setCrossExamData(result.cross_exam_data as CrossExamResult);
                  } finally { setIsCrossExamLoading(false); }
                })}
                disabled={isCrossExamLoading || isAnalyzing || isQueueBusy}
                className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
              >
                {isCrossExamLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <MessageSquareQuote className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u053D\u0561\u0579\u0561\u0571\u0587' : i18n.language === 'en' ? 'Cross-Exam' : '\u041F\u0435\u0440\u0435\u043A\u0440\u0451\u0441\u0442\u043D\u044B\u0439'}
                </span>
              </Button>
              {Object.values(results).some(r => r !== null) && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      ignoreSavedAnalysesLoadRef.current = true;
                      clearResults();
                      setSavedAnalysisRoles(new Set());
                    }}
                    className="h-10 rounded-xl text-xs sm:text-sm w-full justify-start"
                  >
                    {t('common:clear', 'Clear')}
                  </Button>
                  <PdfExportButton onClick={handleExportAllAnalyses} />
                </>
              )}
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {!Object.values(results).some(r => r !== null) ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t('ai:analysis_placeholder', 'AI analysis will appear here')}
              </p>
              
              {/* Role Toggle Switches */}
              <div className="mb-6 p-3 sm:p-4 rounded-lg border bg-muted/30">
                <p className="text-sm font-medium mb-3">
                  {i18n.language === 'hy' ? '\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0565\u0580\u0565\u0580' 
                   : i18n.language === 'en' ? 'Analysis Roles' 
                   : '\u0420\u043E\u043B\u0438 \u0430\u043D\u0430\u043B\u0438\u0437\u0430'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="role-prosecutor"
                      checked={enabledRoles.prosecutor}
                      onCheckedChange={(checked) => setEnabledRoles(prev => ({ ...prev, prosecutor: checked }))}
                    />
                    <Label htmlFor="role-prosecutor" className="text-sm cursor-pointer">
                      {i18n.language === 'hy' ? '\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572' : i18n.language === 'en' ? 'Prosecutor' : '\u041F\u0440\u043E\u043A\u0443\u0440\u043E\u0440'}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="role-judge"
                      checked={enabledRoles.judge}
                      onCheckedChange={(checked) => setEnabledRoles(prev => ({ ...prev, judge: checked }))}
                    />
                    <Label htmlFor="role-judge" className="text-sm cursor-pointer">
                      {i18n.language === 'hy' ? '\u0534\u0561\u057F\u0561\u057E\u0578\u0580' : i18n.language === 'en' ? 'Judge' : '\u0421\u0443\u0434\u044C\u044F'}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="role-aggregator"
                      checked={canEnableAggregator}
                      disabled={true}
                      className={!canEnableAggregator ? 'opacity-50' : ''}
                    />
                    <Label 
                      htmlFor="role-aggregator" 
                      className={`text-sm ${!canEnableAggregator ? 'text-muted-foreground' : 'cursor-pointer'}`}
                    >
                      {i18n.language === 'hy' ? '\u0531\u0563\u0580\u0565\u0563\u0561\u057F\u0578\u0580' : i18n.language === 'en' ? 'Aggregator' : '\u0410\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440'}
                    </Label>
                  </div>
                </div>
                
                {!canEnableAggregator && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    {i18n.language === 'hy' 
                      ? '\u0531\u0563\u0580\u0565\u0563\u0561\u057F\u0578\u0580\u0568 \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B \u0567 \u0574\u056B\u0561\u0575\u0576 \u0561\u0575\u0576 \u0564\u0565\u057A\u0584\u0578\u0582\u0574, \u0565\u0580\u0562 \u0562\u0578\u056C\u0578\u0580 \u0564\u0565\u0580\u0565\u0580\u0568 \u0574\u056B\u0561\u0581\u057E\u0561\u056E \u0565\u0576' 
                      : i18n.language === 'en' 
                        ? 'Aggregator is only available when all roles are enabled' 
                        : '\u0410\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u0433\u0434\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B \u0432\u0441\u0435 \u0440\u043E\u043B\u0438'}
                  </p>
                )}
              </div>
              
              <Button className="w-full" onClick={handleStartAnalysis} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('ai:analyzing', 'Analyzing')} {currentRole ? `(${currentRole})` : ''}...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    {t('ai:start_analysis', 'Start Analysis')}
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-6">
              {(['advocate', 'prosecutor', 'judge', 'aggregator'] as AIRole[]).map((role) => {
                const result = results[role];
                if (!result) return null;
                
                return (
                  <div key={role} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h3 className="font-semibold text-lg capitalize">{role}</h3>
                      <div className="flex gap-2">
                        <Button 
                          variant={savedAnalysisRoles.has(role) ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleSaveAnalysis(role)}
                          disabled={savingAnalysisRole === role || savedAnalysisRoles.has(role)}
                        >
                          {savingAnalysisRole === role ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : savedAnalysisRoles.has(role) ? (
                            <Check className="mr-2 h-3 w-3" />
                          ) : (
                            <Save className="mr-2 h-3 w-3" />
                          )}
                          {savedAnalysisRoles.has(role) ? t('common:saved', 'Saved') : t('ai:save_analysis')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExportSingleAnalysis(role)}>
                          <Download className="mr-2 h-3 w-3" />
                          PDF
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm whitespace-pre-wrap mb-3">{stripMarkdown(result.analysis)}</div>
                    {result.sources && result.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          {t('ai:sources', 'Sources')}:
                        </p>
                        <ul className="text-xs space-y-1">
                          {result.sources.map((source, idx) => (
                            <li key={idx} className="text-muted-foreground">
                              \u2022 {source.title} ({source.category})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Precedent Citation Results */}
          {precedentData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0546\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576' 
                 : i18n.language === 'en' ? 'Precedent Analysis' 
                 : '\u0410\u043D\u0430\u043B\u0438\u0437 \u043F\u0440\u0435\u0446\u0435\u0434\u0435\u043D\u0442\u043E\u0432'}
              </h3>
              <PrecedentCitationView data={precedentData} />
            </div>
          )}

          {/* Deadline Rules Results */}
          {deadlineData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u053a\u0561\u0574\u056F\u0565\u057F\u0576\u0565\u0580' 
                 : i18n.language === 'en' ? 'Procedural Deadlines' 
                 : '\u041F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u0440\u043E\u043A\u0438'}
              </h3>
              <DeadlineRulesView data={deadlineData} />
            </div>
          )}

          {/* Legal Position Comparator Results */}
          {comparatorData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u053b\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0564\u056B\u0580\u0584\u0565\u0580\u056B \u0570\u0561\u0574\u0561\u0564\u0580\u0578\u0582\u0574' 
                 : i18n.language === 'en' ? 'Legal Position Comparison' 
                 : '\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u0430\u0432\u043E\u0432\u044B\u0445 \u043F\u043E\u0437\u0438\u0446\u0438\u0439'}
              </h3>
              <LegalPositionComparatorView data={comparatorData} />
            </div>
          )}

          {/* Hallucination Audit Results */}
          {auditData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0540\u0561\u056C\u0578\u0582\u0581\u056B\u0576\u0561\u0581\u056B\u0561\u0575\u056B \u0561\u0578\u0582\u0564\u056B\u057F' 
                 : i18n.language === 'en' ? 'Hallucination Audit' 
                 : '\u0410\u0443\u0434\u0438\u0442 \u0433\u0430\u043B\u043B\u044E\u0446\u0438\u043D\u0430\u0446\u0438\u0439'}
              </h3>
              <HallucinationAuditView data={auditData} />
            </div>
          )}

          {/* Draft Deterministic Results */}
          {draftText && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0546\u0561\u056D\u0561\u0563\u056B\u056E \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569' 
                 : i18n.language === 'en' ? 'Draft Document' 
                 : '\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430'}
              </h3>
              <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {draftText}
              </div>
            </div>
          )}

          {/* Strategy Builder Results */}
          {strategyData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u057C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576' 
                 : i18n.language === 'en' ? 'Litigation Strategy' 
                 : '\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430'}
              </h3>
              <StrategyBuilderView data={strategyData} language={i18n.language} />
            </div>
          )}

          {/* Evidence Weakness Detector Results */}
          {evidenceWeaknessData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0569\u0578\u0582\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580' 
                 : i18n.language === 'en' ? 'Evidence Weakness Analysis' 
                 : '\u0410\u043D\u0430\u043B\u0438\u0437 \u0443\u044F\u0437\u0432\u0438\u043C\u043E\u0441\u0442\u0435\u0439 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432'}
              </h3>
              <EvidenceWeaknessView data={evidenceWeaknessData} language={i18n.language} />
            </div>
          )}

          {/* Risk Factors Results */}
          {riskFactorsData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u054C\u056B\u057D\u056F\u056B \u0563\u0578\u0580\u056E\u0578\u0576\u0576\u0565\u0580' 
                 : i18n.language === 'en' ? 'Risk Factor Analysis' 
                 : '\u0410\u043D\u0430\u043B\u0438\u0437 \u0444\u0430\u043A\u0442\u043E\u0440\u043E\u0432 \u0440\u0438\u0441\u043A\u0430'}
              </h3>
              <RiskFactorsView data={riskFactorsData} language={i18n.language} />
            </div>
          )}

          {/* Law Update Summary Results */}
          {lawUpdateData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u0555\u0580\u0565\u0576\u0584\u056B \u0583\u0578\u0583\u0578\u056D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580' 
                 : i18n.language === 'en' ? 'Law Update Summary' 
                 : '\u0421\u0432\u043E\u0434\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0437\u0430\u043A\u043E\u043D\u0430'}
              </h3>
              <LawUpdateSummaryView data={lawUpdateData} language={i18n.language} />
            </div>
          )}

          {/* Cross-Examination Results */}
          {crossExamData && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">
                {i18n.language === 'hy' ? '\u053D\u0561\u0579\u0561\u0571\u0587 \u0570\u0561\u0580\u0581\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576' 
                 : i18n.language === 'en' ? 'Cross-Examination Questions' 
                 : '\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u0435\u0440\u0435\u043A\u0440\u0451\u0441\u0442\u043D\u043E\u0433\u043E \u0434\u043E\u043F\u0440\u043E\u0441\u0430'}
              </h3>
              <CrossExamView data={crossExamData} language={i18n.language} />
            </div>
          )}

          {Object.values(results).some(r => r !== null) && (
            <div className="mt-6 pt-6 border-t">
              <FeedbackStars caseId={caseId} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Law Update Summary Dialog */}
      <Dialog open={showLawUpdateDialog} onOpenChange={setShowLawUpdateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {i18n.language === 'hy' ? '\u0540\u056B\u0576 \u057F\u0561\u0580\u0562\u0565\u0580\u0561\u056F \u0568\u0576\u0564. \u0576\u0578\u0580 \u057F\u0561\u0580\u0562\u0565\u0580\u0561\u056F' 
               : i18n.language === 'en' ? 'Compare Law Versions' 
               : '\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0432\u0435\u0440\u0441\u0438\u0439 \u0437\u0430\u043A\u043E\u043D\u0430'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {i18n.language === 'hy' ? '\u0540\u056B\u0576 \u057F\u0561\u0580\u0562\u0565\u0580\u0561\u056F' : i18n.language === 'en' ? 'Old Version' : '\u0421\u0442\u0430\u0440\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F'}
              </label>
              <Textarea 
                value={oldLawText}
                onChange={(e) => setOldLawText(e.target.value)}
                placeholder={i18n.language === 'hy' ? '\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u0584 \u0570\u056B\u0576 \u057F\u0565\u0584\u057D\u057F\u0568...' : i18n.language === 'en' ? 'Paste old law text here...' : '\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0442\u0430\u0440\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u043A\u043E\u043D\u0430...'}
                className="min-h-[150px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                {i18n.language === 'hy' ? '\u0546\u0578\u0580 \u057F\u0561\u0580\u0562\u0565\u0580\u0561\u056F' : i18n.language === 'en' ? 'New Version' : '\u041D\u043E\u0432\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F'}
              </label>
              <Textarea 
                value={newLawText}
                onChange={(e) => setNewLawText(e.target.value)}
                placeholder={i18n.language === 'hy' ? '\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u0584 \u0576\u0578\u0580 \u057F\u0565\u0584\u057D\u057F\u0568...' : i18n.language === 'en' ? 'Paste new law text here...' : '\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u043A\u043E\u043D\u0430...'}
                className="min-h-[150px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLawUpdateDialog(false)}>
              {t('common:cancel', 'Cancel')}
            </Button>
            <Button 
              onClick={async () => {
                if (!oldLawText.trim() || !newLawText.trim()) {
                  toast({ title: i18n.language === 'en' ? 'Both text fields are required' : 'Оба поля обязательны', variant: 'destructive' });
                  return;
                }
                setShowLawUpdateDialog(false);
                setIsLawUpdateLoading(true);
                setLawUpdateData(null);
                try {
                  const { data, error } = await supabase.functions.invoke('ai-analyze', {
                    body: {
                      role: 'law_update_summary',
                      oldLawText: oldLawText.trim(),
                      newLawText: newLawText.trim(),
                    },
                  });
                  if (!error && data && !data.error) {
                    if (data.law_update_data) {
                      setLawUpdateData(data.law_update_data as LawUpdateSummaryResult);
                    }
                  } else {
                    toast({ title: t('ai:analysis_failed'), variant: 'destructive' });
                  }
                } catch {
                  toast({ title: t('ai:analysis_failed'), variant: 'destructive' });
                } finally {
                  setIsLawUpdateLoading(false);
                }
              }}
              disabled={!oldLawText.trim() || !newLawText.trim()}
            >
              <BookOpen className="mr-2 h-4 w-4" />
              {i18n.language === 'hy' ? '\u0540\u0561\u0574\u0565\u0574\u0561\u057F\u0565\u056C' : i18n.language === 'en' ? 'Compare' : '\u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

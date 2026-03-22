import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useCase, useCases } from '@/hooks/useCases';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { CaseDetailHeader } from '@/components/cases/CaseDetailHeader';
import { CaseDetailInfo } from '@/components/cases/CaseDetailInfo';
import { CaseFactsEditor } from '@/components/cases/CaseFactsEditor';
import { CaseAIAnalysisPanel } from '@/components/cases/CaseAIAnalysisPanel';
import { CaseForm } from '@/components/cases/CaseForm';
import { CaseTimeline } from '@/components/cases/CaseTimeline';
import { CaseFileUpload } from '@/components/cases/CaseFileUpload';
import { CasePdfUpload } from '@/components/cases/CasePdfUpload';
import { CaseComments } from '@/components/cases/CaseComments';
import { DocumentGeneratorDialog } from '@/components/documents/DocumentGeneratorDialog';
import { CaseComplaintGenerator } from '@/components/cases/CaseComplaintGenerator';
import { CaseReminders, CourtDateReminderSuggestion } from '@/components/reminders';
import { MultiAgentPanel } from '@/components/agents/MultiAgentPanel';

import { ChatBubble } from '@/components/chat/ChatBubble';
import { NotesBubble } from '@/components/notes/NotesBubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PdfExportButton } from '@/components/PdfExportButton';
import { exportCaseDetailToPDF } from '@/lib/pdfExport';
import { exportFullCaseReportToPDF } from '@/lib/pdfExportFullReport';
import type { FullCaseReportData } from '@/lib/pdfExportFullReport';
import { format } from 'date-fns';
import {
  Edit,
  Trash2,
  Loader2,
  Brain,
  FilePlus,
  Music,
  Bell,
  Bot,
  Download,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusColors: Record<string, string> = {
  open: 'bg-green-500/10 text-green-700 dark:text-green-400',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  closed: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
  archived: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

const priorityColors: Record<string, string> = {
  low: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
  medium: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  urgent: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const CaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(['cases', 'common', 'ai', 'disclaimer', 'reminders']);
  const { user, signOut, isClient, isAdmin, isLawyer, isAuditor } = useAuth();

  const { data: caseData, isLoading } = useCase(id);
  const { updateCase, deleteCase } = useCases();

  const [editFormOpen, setEditFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [documentGeneratorOpen, setDocumentGeneratorOpen] = useState(false);
  const [complaintGeneratorOpen, setComplaintGeneratorOpen] = useState(false);
  const [preselectedDocumentType, setPreselectedDocumentType] = useState<'appeal' | 'cassation' | null>(null);
  const [aiCreditsExhausted, setAiCreditsExhausted] = useState(false);

  const { toast } = useToast();

  const handleUpdate = (data: Database['public']['Tables']['cases']['Update']) => {
    if (id) {
      updateCase.mutate(
        { id, updates: data },
        { onSuccess: () => setEditFormOpen(false) }
      );
    }
  };

  const handleDelete = () => {
    if (id) {
      deleteCase.mutate(id, {
        onSuccess: () => navigate('/dashboard'),
      });
    }
  };

  const handleExportCaseDetails = async () => {
    if (!caseData) return;

    const { data: files } = await supabase
      .from('case_files')
      .select('id, original_filename, created_at, file_size')
      .eq('case_id', caseData.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const { data: analyses } = await supabase
      .from('ai_analysis')
      .select('id, role, created_at')
      .eq('case_id', caseData.id)
      .order('created_at', { ascending: false });

    const timeline: Array<{ type: string; title: string; description?: string; timestamp: string }> = [];

    timeline.push({
      type: 'created',
      title: '\u0533\u0578\u0580\u056E\u0568 \u057D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567',
      timestamp: caseData.created_at,
    });

    files?.forEach(file => {
      timeline.push({
        type: 'file',
        title: '\u0556\u0561\u0575\u056C\u056B \u057E\u0565\u0580\u0562\u0565\u057C\u0576\u0578\u0582\u0574',
        description: file.original_filename,
        timestamp: file.created_at,
      });
    });

    const roleLabels: Record<string, string> = {
      advocate: '\u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576 (\u054A\u0561\u0577\u057F\u057A\u0561\u0576)',
      prosecutor: '\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572',
      judge: '\u0534\u0561\u057F\u0561\u057E\u0578\u0580',
      aggregator: '\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
    };

    analyses?.forEach(analysis => {
      timeline.push({
        type: 'analysis',
        title: 'AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
        description: roleLabels[analysis.role] || analysis.role,
        timestamp: analysis.created_at,
      });
    });

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    await exportCaseDetailToPDF({
      caseNumber: caseData.case_number,
      caseTitle: caseData.title,
      description: caseData.description || undefined,
      facts: caseData.facts || undefined,
      legalQuestion: caseData.legal_question || undefined,
      status: caseData.status,
      priority: caseData.priority,
      courtName: caseData.court_name || undefined,
      courtDate: caseData.court_date ? format(new Date(caseData.court_date), 'dd.MM.yyyy') : undefined,
      notes: caseData.notes || undefined,
      createdAt: new Date(caseData.created_at),
      updatedAt: new Date(caseData.updated_at),
      files: files?.map(f => ({
        original_filename: f.original_filename,
        file_size: f.file_size ?? 0,
        created_at: f.created_at
      })),
      timeline,
      userName: user?.email,
      language: 'hy'
    });
  };

  const handleExportFullReport = async () => {
    if (!caseData) return;

    try {
      toast({ title: t('common:loading', 'Loading...'), description: t('cases:generating_report', 'Generating full report...') });

      // Fetch all data in parallel
      const [filesRes, analysesRes, agentRunsRes, findingsRes, evidenceRes, reportRes] = await Promise.all([
        supabase.from('case_files').select('original_filename, file_size, created_at').eq('case_id', caseData.id).is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('ai_analysis').select('role, response_text, created_at, sources_used').eq('case_id', caseData.id).order('created_at', { ascending: false }),
        supabase.from('agent_analysis_runs').select('agent_type, status, summary, analysis_result, completed_at, tokens_used').eq('case_id', caseData.id).order('created_at', { ascending: false }),
        supabase.from('agent_findings').select('title, description, severity, finding_type, legal_basis, recommendation').eq('case_id', caseData.id),
        supabase.from('evidence_registry').select('evidence_number, title, evidence_type, admissibility_status, description, ai_analysis, admissibility_notes').eq('case_id', caseData.id).order('evidence_number'),
        supabase.from('aggregated_reports').select('*').eq('case_id', caseData.id).order('generated_at', { ascending: false }).limit(1),
      ]);

      // Build timeline
      const timeline: Array<{ type: string; title: string; description?: string; timestamp: string }> = [];
      timeline.push({ type: 'created', title: t('cases:case_created', 'Case created'), timestamp: caseData.created_at });
      filesRes.data?.forEach(f => timeline.push({ type: 'file', title: t('cases:file_upload', 'File upload'), description: f.original_filename, timestamp: f.created_at }));
      analysesRes.data?.forEach(a => timeline.push({ type: 'analysis', title: 'AI Analysis', description: a.role, timestamp: a.created_at }));
      agentRunsRes.data?.filter(r => r.completed_at).forEach(r => timeline.push({ type: 'agent', title: 'Agent: ' + r.agent_type, timestamp: r.completed_at! }));
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const aggReport = reportRes.data?.[0];

      await exportFullCaseReportToPDF({
        caseNumber: caseData.case_number,
        caseTitle: caseData.title,
        description: caseData.description || undefined,
        facts: caseData.facts || undefined,
        legalQuestion: caseData.legal_question || undefined,
        status: caseData.status,
        priority: caseData.priority,
        caseType: caseData.case_type || undefined,
        courtName: caseData.court_name || undefined,
        courtDate: caseData.court_date ? format(new Date(caseData.court_date), 'dd.MM.yyyy') : undefined,
        notes: caseData.notes || undefined,
        createdAt: new Date(caseData.created_at),
        updatedAt: new Date(caseData.updated_at),
        userName: user?.email,
        language: 'hy',
        files: filesRes.data?.map(f => ({ original_filename: f.original_filename, file_size: f.file_size ?? 0, created_at: f.created_at })),
        timeline,
        aiAnalyses: analysesRes.data?.map(a => ({ role: a.role, response_text: a.response_text, created_at: a.created_at, sources_used: a.sources_used })),
        agentRuns: agentRunsRes.data?.map(r => ({ agent_type: r.agent_type, status: r.status, summary: r.summary || undefined, analysis_result: r.analysis_result || undefined, completed_at: r.completed_at || undefined, tokens_used: r.tokens_used || undefined })),
        findings: findingsRes.data?.map(f => ({ title: f.title, description: f.description, severity: f.severity || undefined, finding_type: f.finding_type, legal_basis: f.legal_basis || undefined, recommendation: f.recommendation || undefined })),
        evidence: evidenceRes.data?.map(e => ({ evidence_number: e.evidence_number, title: e.title, evidence_type: e.evidence_type, admissibility_status: e.admissibility_status || undefined, description: e.description || undefined, ai_analysis: e.ai_analysis || undefined, admissibility_notes: e.admissibility_notes || undefined })),
        aggregatedReport: aggReport ? {
          title: aggReport.title,
          executive_summary: aggReport.executive_summary || undefined,
          evidence_summary: aggReport.evidence_summary || undefined,
          violations_summary: aggReport.violations_summary || undefined,
          defense_strategy: aggReport.defense_strategy || undefined,
          prosecution_weaknesses: aggReport.prosecution_weaknesses || undefined,
          recommendations: aggReport.recommendations || undefined,
          full_report: aggReport.full_report || undefined,
          generated_at: aggReport.generated_at,
        } : undefined,
      });

      toast({ title: t('common:success', 'Success'), description: t('common:pdf_exported', 'PDF exported') });
    } catch (error) {
      console.error('Full report export error:', error);
      toast({ title: t('common:error', 'Error'), variant: 'destructive' });
    }
  };

  const canEdit = isClient || isAdmin || isLawyer;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">{t('cases:case_not_found', 'Case not found')}</p>
        <Button className="mt-4" onClick={() => navigate('/dashboard')}>
          {t('common:back', 'Back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <CaseDetailHeader userEmail={user?.email} onSignOut={signOut} />

      {/* Main Content - Mobile-first with safe areas */}
      <main className="mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-safe max-w-full overflow-hidden lg:max-w-7xl">
        {/* Case Header - Premium mobile card */}
        <div className="card-premium p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="space-y-4">
            {/* Title Section */}
            <div>
              <h2 className="text-mobile-xl sm:text-2xl lg:text-3xl font-bold leading-tight line-clamp-2">
                {caseData.title}
              </h2>
              <p className="mt-2 text-mobile-sm sm:text-sm text-muted-foreground font-medium">
                {caseData.case_number}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className={`${statusColors[caseData.status]} min-h-[32px] px-3 py-1.5 text-mobile-sm rounded-full`}>
                  {t(`status_${caseData.status}`)}
                </Badge>
                <Badge className={`${priorityColors[caseData.priority]} min-h-[32px] px-3 py-1.5 text-mobile-sm rounded-full`}>
                  {t(`priority_${caseData.priority}`)}
                </Badge>
              </div>
            </div>

            {/* Action Buttons - Touch-friendly */}
            {canEdit && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setEditFormOpen(true)}
                  className="h-12 sm:h-11 rounded-xl text-mobile-sm sm:text-sm font-medium shadow-soft active:scale-[0.98] transition-transform"
                >
                  <Edit className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                  <span className="truncate">
                    {i18n.language === 'hy' ? '\u053D\u0574\u0562\u0561\u0563\u0580\u0565\u056C' : t('edit_case')}
                  </span>
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="h-12 sm:h-11 rounded-xl text-mobile-sm sm:text-sm font-medium shadow-soft active:scale-[0.98] transition-transform"
                >
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                  <span className="truncate">
                    {i18n.language === 'hy' ? '\u054B\u0576\u057B\u0565\u056C' : t('delete_case')}
                  </span>
                </Button>
              </div>
            )}

            {/* Full Report Export Button */}
            <div className="pt-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleExportFullReport}
                className="w-full h-12 sm:h-11 rounded-xl text-mobile-sm sm:text-sm font-medium shadow-soft active:scale-[0.98] transition-transform"
              >
                <Download className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                <span className="truncate">
                  {i18n.language === 'hy' ? '\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u0566\u0565\u056F\u0578\u0582\u0575\u0581 (PDF)' : i18n.language === 'ru' ? '\u041F\u043E\u043B\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442 (PDF)' : 'Full Report (PDF)'}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* Court Date Reminder Suggestion */}
        {caseData.court_date && (
          <div className="mb-4 sm:mb-6">
            <CourtDateReminderSuggestion
              caseId={caseData.id}
              caseTitle={caseData.title}
              courtDate={caseData.court_date}
            />
          </div>
        )}

        {/* Case Details & Tabs - Stack on mobile, grid on desktop */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 w-full min-w-0">
          {/* Main Content */}
          <div className="lg:col-span-2 min-w-0 overflow-hidden">
            <Tabs defaultValue="details" className="w-full min-w-0">
              {/* Tab Navigation - Horizontal scroll on mobile */}
              <div className="overflow-x-auto scrollbar-thin pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabsList className="inline-flex min-w-max gap-1 rounded-xl bg-muted/50 p-1.5">
                  <TabsTrigger
                    value="details"
                    className="min-h-[44px] px-3 sm:px-4 rounded-lg text-mobile-sm sm:text-sm font-medium data-[state=active]:shadow-soft whitespace-nowrap"
                  >
                    {t('common:details', 'Details')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="files"
                    className="min-h-[44px] px-3 sm:px-4 rounded-lg text-mobile-sm sm:text-sm font-medium data-[state=active]:shadow-soft whitespace-nowrap"
                  >
                    {t('files')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="reminders"
                    className="min-h-[44px] px-3 sm:px-4 rounded-lg text-mobile-sm sm:text-sm font-medium data-[state=active]:shadow-soft whitespace-nowrap"
                  >
                    <Bell className="h-4 w-4 mr-1 sm:mr-2 shrink-0" />
                    <span>{t('reminders:reminders')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="analysis"
                    className="min-h-[44px] px-3 sm:px-4 rounded-lg text-mobile-sm sm:text-sm font-medium data-[state=active]:shadow-soft whitespace-nowrap"
                  >
                    <Brain className="h-4 w-4 mr-1 sm:mr-2 shrink-0" />
                    <span>{t('ai:analyze')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="agents"
                    className="min-h-[44px] px-3 sm:px-4 rounded-lg text-mobile-sm sm:text-sm font-medium data-[state=active]:shadow-soft whitespace-nowrap"
                  >
                    <Bot className="h-4 w-4 mr-1 sm:mr-2 shrink-0" />
                    <span>{t('ai:multi_agent_analysis', 'Multi-Agent')}</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="details" className="mt-4 sm:mt-6">
                <CaseFactsEditor
                  caseId={caseData.id}
                  caseTitle={caseData.title}
                  caseNumber={caseData.case_number}
                  description={caseData.description}
                  facts={caseData.facts}
                  legalQuestion={caseData.legal_question}
                  aiCreditsExhausted={aiCreditsExhausted}
                  onCreditsExhausted={() => setAiCreditsExhausted(true)}
                />

                {caseData.notes && (
                  <Card className="mt-4 card-premium overflow-hidden">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-mobile-lg sm:text-lg">{t('notes')}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                      <p className="whitespace-pre-wrap text-mobile-sm sm:text-sm leading-relaxed">{caseData.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="files" className="mt-4 sm:mt-6">
                <Card className="card-premium overflow-hidden">
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <CardTitle className="text-mobile-lg sm:text-lg">{t('files')}</CardTitle>
                      <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                        <Button
                          variant="outline"
                          onClick={() => setPdfUploadOpen(true)}
                          className="h-11 rounded-xl text-mobile-sm sm:text-sm shadow-soft active:scale-[0.98] transition-transform"
                        >
                          <FilePlus className="mr-2 h-4 w-4" />
                          <span className="truncate">{t('pdf_ocr')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => navigate(`/cases/${caseData.id}/transcriptions`)}
                          className="h-11 rounded-xl text-mobile-sm sm:text-sm shadow-soft active:scale-[0.98] transition-transform"
                        >
                          <Music className="mr-2 h-4 w-4" />
                          <span className="truncate">{t('audio_transcription', '\u0531\u0578\u0582\u0564\u056B\u0578')}</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                    <CaseFileUpload caseId={caseData.id} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reminders" className="mt-4">
                <CaseReminders caseId={caseData.id} courtDate={caseData.court_date} />
              </TabsContent>

              <TabsContent value="analysis" className="mt-4">
                <CaseAIAnalysisPanel
                  caseId={caseData.id}
                  facts={caseData.facts}
                  legalQuestion={caseData.legal_question}
                  caseNumber={caseData.case_number}
                  caseTitle={caseData.title}
                  aiCreditsExhausted={aiCreditsExhausted}
                  onOpenComplaintGenerator={() => setComplaintGeneratorOpen(true)}
                  referencesText={undefined}
                />
              </TabsContent>

              <TabsContent value="agents" className="mt-4">
                <MultiAgentPanel
                  caseId={caseData.id}
                  caseFacts={caseData.facts || undefined}
                  caseType={caseData.case_type || undefined}
                  partyRole={caseData.party_role || undefined}
                />
              </TabsContent>

            </Tabs>
          </div>

          {/* Sidebar */}
          <CaseDetailInfo
            caseId={caseData.id}
            courtName={caseData.court_name}
            courtDate={caseData.court_date}
            createdAt={caseData.created_at}
            updatedAt={caseData.updated_at}
            isAdmin={isAdmin}
            isAuditor={isAuditor}
          />
        </div>

        {/* Legal Disclaimer - Premium styling */}
        <div className="mt-6 sm:mt-8 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5 shadow-soft">
          <p className="text-mobile-sm sm:text-sm text-muted-foreground leading-relaxed">
            ⚠️ {t('disclaimer:main')}
          </p>
        </div>
      </main>

      {/* Edit Form */}
      <CaseForm
        open={editFormOpen}
        onOpenChange={setEditFormOpen}
        onSubmit={handleUpdate}
        initialData={caseData}
        isLoading={updateCase.isPending}
      />

      {/* PDF Upload */}
      <CasePdfUpload
        open={pdfUploadOpen}
        onOpenChange={setPdfUploadOpen}
        caseId={caseData.id}
        onSuccess={() => setPdfUploadOpen(false)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_case')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm_delete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common:delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Generator Dialog */}
      <DocumentGeneratorDialog
        open={documentGeneratorOpen}
        onOpenChange={(open) => {
          setDocumentGeneratorOpen(open);
          if (!open) setPreselectedDocumentType(null);
        }}
        preselectedType={preselectedDocumentType}
        caseData={caseData ? {
          id: caseData.id,
          title: caseData.title,
          case_number: caseData.case_number,
          case_type: caseData.case_type || undefined,
          court: caseData.court || undefined,
          facts: caseData.facts || undefined,
          legal_question: caseData.legal_question || undefined,
          description: caseData.description || undefined,
          notes: caseData.notes || undefined,
        } : undefined}
      />

      {/* Case Complaint Generator Dialog */}
      {caseData && (
        <CaseComplaintGenerator
          open={complaintGeneratorOpen}
          onOpenChange={setComplaintGeneratorOpen}
          caseId={caseData.id}
          caseData={{
            title: caseData.title,
            case_number: caseData.case_number,
            case_type: caseData.case_type,
            court: caseData.court,
            court_date: caseData.court_date,
            facts: caseData.facts,
            description: caseData.description,
            notes: caseData.notes,
          }}
        />
      )}

      {/* Persistent floating bubbles */}
      <ChatBubble />
      <NotesBubble />
    </div>
  );
};

export default CaseDetail;

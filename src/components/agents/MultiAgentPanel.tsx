import { useEffect, useState } from "react";
import { useReferencesText } from "@/lib/references-store";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, FileStack, ClipboardList, FileText, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useMultiAgentAnalysis } from "@/hooks/useMultiAgentAnalysis";
import { AGENT_CONFIGS, type AgentType, type AgentRunStatus } from "./types";
import { VolumeManager } from "./VolumeManager";
import { EvidenceRegistry } from "./EvidenceRegistry";
import { AgentRunCard } from "./AgentRunCard";
import { AggregatedReportView } from "./AggregatedReportView";
import { GenerateComplaintButton } from "./GenerateComplaintButton";

// Party role options by case type
const CIVIL_ROLES = [
  { value: 'claimant', labelKey: 'party_role_claimant' },
  { value: 'defendant', labelKey: 'party_role_defendant' },
  { value: 'third_party', labelKey: 'party_role_third_party' },
];
const ADMINISTRATIVE_ROLES = [
  { value: 'applicant', labelKey: 'party_role_applicant' },
  { value: 'administrative_body', labelKey: 'party_role_administrative_body' },
  { value: 'interested_party', labelKey: 'party_role_interested_party' },
];
const CRIMINAL_ROLES = [
  { value: 'defendant', labelKey: 'party_role_criminal_defendant' },
  { value: 'defense', labelKey: 'party_role_defense' },
  { value: 'prosecutor', labelKey: 'party_role_prosecutor' },
  { value: 'victim', labelKey: 'party_role_victim' },
];

function getPartyRolesForType(caseType?: string) {
  switch (caseType) {
    case 'civil': return CIVIL_ROLES;
    case 'administrative': return ADMINISTRATIVE_ROLES;
    case 'criminal': return CRIMINAL_ROLES;
  default: return [
      ...CRIMINAL_ROLES.map(r => ({ ...r, value: `criminal_${r.value}` })),
      ...CIVIL_ROLES.map(r => ({ ...r, value: `civil_${r.value}` })),
      ...ADMINISTRATIVE_ROLES.map(r => ({ ...r, value: `admin_${r.value}` })),
    ];
  }
}

interface MultiAgentPanelProps {
  caseId: string;
  caseFacts?: string;
  caseType?: string;
  partyRole?: string;
}

export function MultiAgentPanel({ caseId, caseFacts, caseType, partyRole }: MultiAgentPanelProps) {
  const { t, i18n } = useTranslation(["ai", "cases"]);
  const lang = i18n.language;
  const [activeTab, setActiveTab] = useState("volumes");
  const [selectedRole, setSelectedRole] = useState(partyRole || "");

  const getAgentName = (agent: typeof AGENT_CONFIGS[0]) => {
    if (lang === 'hy') return agent.nameHy;
    if (lang === 'ru') return agent.nameRu;
    return agent.name;
  };

  const referencesText = useReferencesText(caseId);

  
  const {
    isLoading,
    currentAgent,
    runs,
    evidenceRegistry,
    volumes,
    aggregatedReport,
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
    loadAggregatedReport
  } = useMultiAgentAnalysis();

  // Load data on mount
  useEffect(() => {
    loadVolumes(caseId);
    loadRuns(caseId);
    loadEvidenceRegistry(caseId);
    loadAggregatedReport(caseId);
  }, [caseId, loadVolumes, loadRuns, loadEvidenceRegistry, loadAggregatedReport]);

  // Calculate progress
  const completedAgents = runs.filter(r => r.status === "completed").length;
  const totalAgents = AGENT_CONFIGS.length;
  const progress = (completedAgents / totalAgents) * 100;

  const getStatusIcon = (status: AgentRunStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAgentRunStatus = (agentType: AgentType): AgentRunStatus | null => {
    const run = runs.find(r => r.agent_type === agentType);
    return run?.status || null;
  };

  return (
    <div className="space-y-3 sm:space-y-4 w-full overflow-x-hidden">
      {/* Header - Compact card */}
      <Card className="card-premium">
        <CardHeader className="pb-3 px-3 sm:px-4 pt-3 sm:pt-4">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <span className="text-base sm:text-lg shrink-0">🤖</span>
              <span className="break-words">{t("ai:multi_agent_analysis")}</span>
            </CardTitle>
            <CardDescription className="text-[11px] sm:text-xs leading-relaxed">
              {t("ai:multi_agent_description")}
            </CardDescription>
            
            {/* Party Role Selector */}
            <div className="pt-1">
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("cases:select_party_role")} />
                </SelectTrigger>
                <SelectContent>
                  {getPartyRolesForType(caseType).map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {t(`cases:${role.labelKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons - Stack vertically on mobile */}
            <div className="flex flex-col sm:flex-row gap-2 w-full pt-1">
              <Button
                onClick={() => runAllAgents(caseId, referencesText || undefined)}
                disabled={isLoading || volumes.length === 0}
                size="sm"
                className="w-full sm:flex-1 h-9 rounded-lg text-xs font-medium"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    <span className="truncate">{t("ai:run_all_agents")}</span>
                  </>
                )}
              </Button>
              <GenerateComplaintButton
                caseId={caseId}
                runs={runs}
                evidenceRegistry={evidenceRegistry}
                aggregatedReport={aggregatedReport}
              />
            </div>
          </div>
          
          {/* Progress bar */}
          {completedAgents > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
              <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                <span>{t("ai:agents_completed")}</span>
                <span className="font-medium">{completedAgents}/{totalAgents}</span>
              </div>
              <Progress value={progress} className="h-1.5 sm:h-2 rounded-full w-full" />
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Agent Status Grid - Compact horizontal scroll */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
        <div className="flex gap-1.5 sm:grid sm:grid-cols-5 lg:grid-cols-9 sm:gap-2 min-w-max sm:min-w-0">
          {AGENT_CONFIGS.map((agent) => {
            const status = getAgentRunStatus(agent.type);
            const isCurrentAgent = currentAgent === agent.type;
            
            return (
              <Card 
                key={agent.type}
                className={`cursor-pointer transition-all duration-300 active:scale-[0.96] w-14 sm:w-auto shrink-0 ${
                  isCurrentAgent
                    ? "ring-2 ring-primary shadow-lg shadow-primary/25 animate-pulse scale-105"
                    : ""
                } ${status === "completed" ? "bg-accent/50 ring-1 ring-green-500/30" : ""} ${status === "failed" ? "ring-1 ring-destructive/30" : ""}`}
                onClick={() => !isLoading && runAgent(caseId, agent.type, referencesText || undefined)}
              >
                <CardContent className="p-1.5 sm:p-2 text-center flex flex-col items-center justify-center h-full min-h-[52px] sm:min-h-[60px] relative overflow-hidden">
                  {isCurrentAgent && (
                    <div className="absolute inset-0 bg-primary/10 animate-[pulse_1.5s_ease-in-out_infinite]" />
                  )}
                  <div className={`text-sm sm:text-lg mb-0.5 relative z-10 ${isCurrentAgent ? "animate-bounce" : ""}`}>
                    {agent.icon}
                  </div>
                  <div className={`text-[8px] sm:text-[10px] font-medium truncate w-full leading-tight relative z-10 ${isCurrentAgent ? "text-primary font-bold" : ""}`} title={getAgentName(agent)}>
                    {getAgentName(agent).split(" ")[0]}
                  </div>
                  <div className="mt-0.5 flex justify-center relative z-10">
                    {isCurrentAgent ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    ) : status ? getStatusIcon(status) : (
                      <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-muted" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Main Content Tabs - Compact */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
          <TabsList className="inline-flex w-max sm:w-full sm:grid sm:grid-cols-4 h-auto p-0.5 gap-0.5 rounded-lg bg-muted/50">
            <TabsTrigger value="volumes" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <FileStack className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <Badge variant="secondary" className="text-[9px] px-1 h-4">{volumes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="agents" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <Badge variant="secondary" className="text-[9px] px-1 h-4">{runs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="evidence" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <ClipboardList className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <Badge variant="secondary" className="text-[9px] px-1 h-4">{evidenceRegistry.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="report" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="volumes" className="mt-4">
          <VolumeManager
            caseId={caseId}
            volumes={volumes}
            onCreateVolume={(data) => createVolume(caseId, data)}
            onUpdateVolume={updateVolume}
            onDeleteVolume={deleteVolume}
          />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {AGENT_CONFIGS.map((agent) => {
                const agentRuns = runs.filter(r => r.agent_type === agent.type);
                const latestRun = agentRuns[0];
                
                return (
                  <AgentRunCard
                    key={agent.type}
                    agent={agent}
                    run={latestRun}
                    isRunning={currentAgent === agent.type}
                    onRun={() => runAgent(caseId, agent.type, referencesText || undefined)}
                    disabled={isLoading}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <EvidenceRegistry
            caseId={caseId}
            items={evidenceRegistry}
            volumes={volumes}
            onUpdateItem={updateEvidenceItem}
          />
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <AggregatedReportView
            caseId={caseId}
            report={aggregatedReport}
            runs={runs}
            evidenceCount={evidenceRegistry.length}
            onGenerateReport={() => generateAggregatedReport(caseId)}
            isGenerating={isLoading && currentAgent === "aggregator"}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

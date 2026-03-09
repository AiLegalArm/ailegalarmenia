import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Target, Shield, AlertTriangle, FileQuestion, Swords, Scale, ChevronRight } from 'lucide-react';

export interface StrategyStageArgument {
  argument: string;
  grounding: 'fact' | 'norm' | 'precedent' | 'needs_support';
  ref: string;
}

export interface StrategyStage {
  stage: string;
  key_arguments: StrategyStageArgument[];
  evidence_plan: string[];
  procedural_motions: string[];
  opponent_expected_attacks: string[];
  risk_notes: string[];
}

export interface StrategyBuilderResult {
  strategic_goal: string;
  win_conditions: string[];
  stage_plan: StrategyStage[];
  fallback_strategy: string;
  missing_information: string[];
}

const groundingColors: Record<string, string> = {
  fact: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  norm: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  precedent: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  needs_support: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const stageLabels: Record<string, Record<string, string>> = {
  first_instance: { hy: '\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576', en: 'First Instance', ru: '\u041F\u0435\u0440\u0432\u0430\u044F \u0438\u043D\u0441\u0442\u0430\u043D\u0446\u0438\u044F' },
  appeal: { hy: '\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576', en: 'Appeal', ru: '\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u044F' },
  cassation: { hy: '\u054E\u0573\u057C\u0561\u0562\u0565\u056F', en: 'Cassation', ru: '\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u044F' },
};

function getStageName(stage: string, lang: string): string {
  const labels = stageLabels[stage];
  if (labels) return labels[lang] || labels.en || stage;
  return stage;
}

interface StrategyBuilderViewProps {
  data: StrategyBuilderResult;
  language?: string;
}

export function StrategyBuilderView({ data, language = 'en' }: StrategyBuilderViewProps) {
  const t = (hy: string, en: string, ru: string) =>
    language === 'hy' ? hy : language === 'ru' ? ru : en;

  return (
    <div className="space-y-4">
      {/* Strategic Goal */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <Target className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm mb-1">
                {t('\u054C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u057A\u0561\u057F\u0561\u056F', 'Strategic Goal', '\u0421\u0442\u0440\u0561\u0442\u0435\u0433\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0446\u0435\u043B\u044C')}
              </p>
              <p className="text-sm">{data.strategic_goal}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Win Conditions */}
      {data.win_conditions?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              {t('\u0540\u0561\u0572\u0569\u0561\u0576\u0561\u056F\u056B \u057A\u0561\u0575\u0574\u0561\u0576\u0576\u0565\u0580', 'Win Conditions', '\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u043E\u0431\u0565\u0434\u044B')}
            </p>
            <ul className="space-y-1">
              {data.win_conditions.map((cond, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <ChevronRight className="h-3 w-3 mt-1.5 shrink-0 text-green-600" />
                  <span>{cond}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stage Plans */}
      {data.stage_plan?.map((stage, idx) => (
        <Card key={idx} className="border-l-4 border-l-primary">
          <CardContent className="pt-4 space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Scale className="h-4 w-4" />
              {getStageName(stage.stage, language || 'en')}
            </h4>

            {/* Key Arguments */}
            {stage.key_arguments?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('\u0540\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0580\u056F\u0576\u0565\u0580', 'Key Arguments', '\u041A\u043B\u044E\u0447\u0435\u0432\u044B\u0435 \u0430\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u044B')}
                </p>
                <div className="space-y-2">
                  {stage.key_arguments.map((arg, i) => (
                    <div key={i} className="text-sm border rounded p-2 bg-muted/20">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Badge className={`text-[10px] shrink-0 ${groundingColors[arg.grounding] || ''}`}>
                          {arg.grounding}
                        </Badge>
                        <span>{arg.argument}</span>
                      </div>
                      {arg.ref && (
                        <p className="text-xs text-muted-foreground mt-1 pl-1">{'\u2192'} {arg.ref}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Plan */}
            {stage.evidence_plan?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u057A\u056C\u0561\u0576', 'Evidence Plan', '\u041F\u043B\u0430\u043D \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432')}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.evidence_plan.map((item, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-muted-foreground">{'\u2022'}</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Procedural Motions */}
            {stage.procedural_motions?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0574\u056B\u057B\u0576\u0578\u0580\u0564\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580', 'Procedural Motions', '\u041F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u0445\u043E\u0434\u0430\u0442\u0430\u0439\u0441\u0442\u0432\u0430')}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.procedural_motions.map((item, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-muted-foreground">{'\u2022'}</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Opponent Expected Attacks */}
            {stage.opponent_expected_attacks?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Swords className="h-3 w-3" />
                  {t('\u0540\u0561\u056F\u0561\u057C\u0561\u056F\u0578\u0580\u0564\u056B \u057D\u057A\u0561\u057D\u057E\u0578\u0572 \u0563\u0580\u0578\u0570\u0576\u0565\u0580', 'Expected Opponent Attacks', '\u041E\u0436\u0438\u0434\u0430\u0435\u043C\u044B\u0435 \u0430\u0442\u0430\u043A\u0438 \u043E\u043F\u043F\u043E\u043D\u0435\u043D\u0442\u0430')}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.opponent_expected_attacks.map((item, i) => (
                    <li key={i} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                      <span>{'\u2694'}</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risk Notes */}
            {stage.risk_notes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  {t('\u054C\u056B\u057D\u056F\u0565\u0580', 'Risks', '\u0420\u0438\u0441\u043A\u0438')}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.risk_notes.map((item, i) => (
                    <li key={i} className="flex items-start gap-1 text-red-600 dark:text-red-400">
                      <span>{'\u26A0'}</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Fallback Strategy */}
      {data.fallback_strategy && (
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <p className="font-semibold text-sm mb-1">
              {t('\u054A\u0561\u0570\u0578\u0582\u057D\u057F\u0561\u0575\u056B\u0576 \u057C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Fallback Strategy', '\u0417\u0430\u043F\u0430\u0441\u043D\u0430\u044F \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F')}
            </p>
            <p className="text-sm text-muted-foreground">{data.fallback_strategy}</p>
          </CardContent>
        </Card>
      )}

      {/* Missing Information */}
      {data.missing_information?.length > 0 && (
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4">
            <p className="font-semibold text-sm mb-2 flex items-center gap-2">
              <FileQuestion className="h-4 w-4 text-amber-600" />
              {t('\u0532\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0572 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Missing Information', '\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F')}
            </p>
            <ul className="text-sm space-y-1">
              {data.missing_information.map((item, i) => (
                <li key={i} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                  <span>?</span> {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Shield, TrendingUp, Info, BarChart3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export interface RiskFactorsResult {
  confidence_level: string;
  risk_factors: Array<{
    factor: string;
    grounding: string;
    ref: string;
    severity: string;
  }>;
  mitigating_factors: Array<{
    factor: string;
    grounding: string;
    ref: string;
    strength: string;
  }>;
  recommended_scoring_inputs: {
    precedent_support: number;
    procedural_defects: number;
    evidence_strength: number;
    legal_clarity: number;
  };
  estimated_outcome: {
    range_percent: string;
    note: string;
  };
  missing_information: string[];
}

interface RiskFactorsViewProps {
  data: RiskFactorsResult;
  language?: string;
}

const severityColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'outline';
  }
};

const groundingLabel = (g: string, lang: string) => {
  const map: Record<string, Record<string, string>> = {
    fact: { hy: '\u0553\u0561\u057D\u057F', en: 'Fact', ru: '\u0424\u0430\u043A\u0442' },
    norm: { hy: '\u0546\u0578\u0580\u0574', en: 'Norm', ru: '\u041D\u043E\u0440\u043C\u0430' },
    precedent: { hy: '\u0546\u0561\u056D\u0561\u0564\u0565\u057A', en: 'Precedent', ru: '\u041F\u0440\u0435\u0446\u0435\u0434\u0435\u043D\u0442' },
  };
  return map[g]?.[lang] || g;
};

const confidenceColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'high': return 'text-green-600 dark:text-green-400';
    case 'medium': return 'text-amber-600 dark:text-amber-400';
    case 'low': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
  }
};

export function RiskFactorsView({ data, language = 'en' }: RiskFactorsViewProps) {
  const t = (hy: string, en: string, ru: string) =>
    language === 'hy' ? hy : language === 'ru' ? ru : en;

  const scoring = data.recommended_scoring_inputs;

  return (
    <div className="space-y-4">
      {/* Confidence & Outcome Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('\u054E\u057D\u057F\u0561\u0570\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Confidence', '\u0423\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0441\u0442\u044C')}</span>
            </div>
            <span className={`text-lg font-bold uppercase ${confidenceColor(data.confidence_level)}`}>
              {data.confidence_level}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('\u053F\u0561\u0576\u056D\u0561\u057F\u0565\u057D\u0578\u0582\u0574', 'Estimated Outcome', '\u041F\u0440\u043E\u0433\u043D\u043E\u0437')}</span>
            </div>
            <span className="text-lg font-bold">
              {data.estimated_outcome.range_percent === 'unknown' ? '\u2014' : data.estimated_outcome.range_percent + '%'}
            </span>
            {data.estimated_outcome.note && (
              <p className="text-xs text-muted-foreground mt-1">{data.estimated_outcome.note}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scoring Inputs */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('\u0533\u0576\u0561\u0570\u0561\u057F\u0574\u0561\u0576 \u0574\u0578\u0582\u057F\u0584\u0565\u0580', 'Scoring Inputs', '\u041E\u0446\u0435\u043D\u043E\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435')}
          </h4>
          {[
            { label: t('\u0546\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580\u056B \u0561\u057B\u0561\u056F\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Precedent Support', '\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u043F\u0440\u0435\u0446\u0435\u0434\u0435\u043D\u0442\u043E\u0432'), value: scoring.precedent_support },
            { label: t('\u0538\u0576\u0569\u0561\u0581\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u0569\u0565\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580', 'Procedural Defects', '\u041F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0435\u0444\u0435\u043A\u0442\u044B'), value: scoring.procedural_defects },
            { label: t('\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0578\u0582\u056A', 'Evidence Strength', '\u0421\u0438\u043B\u0430 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432'), value: scoring.evidence_strength },
            { label: t('\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u057A\u0561\u0580\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Legal Clarity', '\u041F\u0440\u0430\u0432\u043E\u0432\u0430\u044F \u044F\u0441\u043D\u043E\u0441\u0442\u044C'), value: scoring.legal_clarity },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{label}</span>
                <span className="font-mono">{value}/100</span>
              </div>
              <Progress value={value} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Risk Factors */}
      {data.risk_factors?.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t('\u054C\u056B\u057D\u056F\u056B \u0563\u0578\u0580\u056E\u0578\u0576\u0576\u0565\u0580', 'Risk Factors', '\u0424\u0430\u043A\u0442\u043E\u0440\u044B \u0440\u0438\u0441\u043A\u0430')} ({data.risk_factors.length})
            </h4>
            {data.risk_factors.map((rf, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{rf.factor}</p>
                  <Badge variant={severityColor(rf.severity)} className="shrink-0">
                    {rf.severity}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {groundingLabel(rf.grounding, language || 'en')}
                  </Badge>
                  {rf.ref && (
                    <span className="text-xs text-muted-foreground">{rf.ref}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Mitigating Factors */}
      {data.mitigating_factors?.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
              <Shield className="h-4 w-4" />
              {t('\u0544\u0565\u0572\u0574\u0561\u0581\u0576\u0578\u0572 \u0563\u0578\u0580\u056E\u0578\u0576\u0576\u0565\u0580', 'Mitigating Factors', '\u0421\u043C\u044F\u0433\u0447\u0430\u044E\u0449\u0438\u0435 \u0444\u0430\u043A\u0442\u043E\u0440\u044B')} ({data.mitigating_factors.length})
            </h4>
            {data.mitigating_factors.map((mf, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{mf.factor}</p>
                  <Badge variant={mf.strength === 'high' ? 'default' : mf.strength === 'medium' ? 'secondary' : 'outline'} className="shrink-0">
                    {mf.strength}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {groundingLabel(mf.grounding, language || 'en')}
                  </Badge>
                  {mf.ref && (
                    <span className="text-xs text-muted-foreground">{mf.ref}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Missing Information */}
      {data.missing_information?.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold text-sm mb-1">{t('\u0532\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0572 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Missing Information', '\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              {data.missing_information.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

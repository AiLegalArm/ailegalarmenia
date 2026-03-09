import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ShieldAlert, UserX, FileWarning, Info } from 'lucide-react';

export interface EvidenceWeaknessResult {
  inadmissible_evidence_candidates: Array<{
    evidence_item: string;
    issue: string;
    basis_type: string;
    basis_ref: string;
    impact: string;
    recommendation: string;
  }>;
  procedural_violations_detected: Array<{
    violation: string;
    affected_evidence: string;
    legal_basis: string;
    severity: string;
  }>;
  credibility_issues: Array<{
    subject: string;
    issue: string;
    indicators: string[];
    impact: string;
  }>;
  overall_impact_summary: string;
  missing_information: string[];
  analysis_status?: string;
  data_gaps_present?: boolean;
  evidence_items_analyzed?: number;
  kb_citations_used?: boolean;
}

const impactColor = (impact: string) => {
  switch (impact?.toLowerCase()) {
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'outline';
  }
};

const basisBadge = (type: string) => {
  switch (type) {
    case 'norm': return <Badge variant="default" className="text-xs">Norm</Badge>;
    case 'fact': return <Badge variant="secondary" className="text-xs">Fact</Badge>;
    case 'precedent': return <Badge variant="default" className="text-xs">Precedent</Badge>;
    default: return <Badge variant="outline" className="text-xs">Unverified</Badge>;
  }
};

interface Props {
  data: EvidenceWeaknessResult;
  language?: string;
}

export function EvidenceWeaknessView({ data, language = 'en' }: Props) {
  const t = (hy: string, en: string, ru: string) =>
    language === 'hy' ? hy : language === 'ru' ? ru : en;

  const totalFindings =
    (data.inadmissible_evidence_candidates?.length || 0) +
    (data.procedural_violations_detected?.length || 0) +
    (data.credibility_issues?.length || 0);

  const highCount = [
    ...(data.inadmissible_evidence_candidates || []),
    ...(data.credibility_issues || []),
  ].filter(i => i.impact === 'high').length +
    (data.procedural_violations_detected || []).filter(v => v.severity === 'high').length;

  return (
    <div className="space-y-4">
      {/* Summary Alert */}
      {highCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t(
              `\u0540\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0565\u056C \u0567\u055D ${highCount} \u0562\u0561\u0580\u0571\u0580 \u056F\u0561\u0580\u0587\u0578\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0569\u0578\u0582\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576`,
              `${highCount} high-impact weakness(es) detected in evidence`,
              `\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E: ${highCount} \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0443\u044F\u0437\u0432\u0438\u043C\u043E\u0441\u0442\u0435\u0439 \u0432 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430\u0445`
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {t('\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580', 'Findings', '\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B')}: {totalFindings}
        </Badge>
        {data.evidence_items_analyzed != null && (
          <Badge variant="outline">
            {t('\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u057E\u0561\u056E', 'Items analyzed', '\u041F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043E')}: {data.evidence_items_analyzed}
          </Badge>
        )}
        {data.data_gaps_present && (
          <Badge variant="secondary">DATA_GAPS</Badge>
        )}
      </div>

      {/* Inadmissible Evidence Candidates */}
      {data.inadmissible_evidence_candidates?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              {t('\u0539\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0561\u0576 \u057C\u056B\u057D\u056F\u0565\u0580', 'Admissibility Risks', '\u0420\u0438\u0441\u043A\u0438 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0441\u0442\u0438')}
            </h4>
            <div className="space-y-3">
              {data.inadmissible_evidence_candidates.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{item.evidence_item}</span>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant={impactColor(item.impact)}>{item.impact}</Badge>
                      {basisBadge(item.basis_type)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.issue}</p>
                  {item.basis_ref && (
                    <p className="text-xs text-muted-foreground italic">{item.basis_ref}</p>
                  )}
                  {item.recommendation && (
                    <p className="text-xs bg-muted/50 rounded p-2">
                      {'\uD83D\uDCA1'} {item.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Procedural Violations */}
      {data.procedural_violations_detected?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <FileWarning className="h-4 w-4 text-amber-500" />
              {t('\u0538\u0576\u0569\u0561\u0581\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580', 'Procedural Violations', '\u041F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F')}
            </h4>
            <div className="space-y-3">
              {data.procedural_violations_detected.map((v, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{v.violation}</span>
                    <Badge variant={impactColor(v.severity)}>{v.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('\u0531\u0566\u0564\u0565\u0581\u057E\u0578\u0572', 'Affected', '\u0417\u0430\u0442\u0440\u043E\u043D\u0443\u0442\u043E')}: {v.affected_evidence}
                  </p>
                  <p className="text-xs text-muted-foreground italic">{v.legal_basis}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credibility Issues */}
      {data.credibility_issues?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <UserX className="h-4 w-4 text-orange-500" />
              {t('\u054E\u057D\u057F\u0561\u0570\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0561\u0576 \u056D\u0576\u0564\u056B\u0580\u0576\u0565\u0580', 'Credibility Issues', '\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u044B \u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u043E\u0441\u0442\u0438')}
            </h4>
            <div className="space-y-3">
              {data.credibility_issues.map((c, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{c.subject}</span>
                    <Badge variant={impactColor(c.impact)}>{c.impact}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.issue}</p>
                  {c.indicators?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.indicators.filter(Boolean).map((ind, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{ind}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Impact Summary */}
      {data.overall_impact_summary && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <Info className="h-4 w-4" />
              {t('\u0538\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u0561\u0566\u0564\u0565\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Overall Impact', '\u041E\u0431\u0449\u0435\u0435 \u0432\u043B\u0438\u044F\u043D\u0438\u0435')}
            </h4>
            <p className="text-sm whitespace-pre-wrap">{data.overall_impact_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Missing Information */}
      {data.missing_information?.filter(Boolean).length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold text-sm mb-2">
              {t('\u0532\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0572 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Missing Information', '\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F')}
            </h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {data.missing_information.filter(Boolean).map((m, i) => (
                <li key={i}>{'\u2022'} {m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

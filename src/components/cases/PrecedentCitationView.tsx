import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Scale, AlertTriangle, BookOpen, Quote } from 'lucide-react';

interface Precedent {
  court: string;
  case_number: string;
  date: string;
  legal_position_summary: string;
  direct_quote: string;
  applicability_to_current_case: string;
  binding_status: string;
  source_doc_id: string;
  source_locator: string;
}

interface ConflictingPrecedent {
  court: string;
  case_number: string;
  date: string;
  conflict_summary: string;
  risk_note: string;
  source_doc_id: string;
  source_locator: string;
}

export interface PrecedentCitationResult {
  precedent_analysis: Precedent[];
  conflicting_precedents: ConflictingPrecedent[];
  absence_of_precedent_note: string;
}

interface PrecedentCitationViewProps {
  data: PrecedentCitationResult;
}

export function PrecedentCitationView({ data }: PrecedentCitationViewProps) {
  const hasPrecedents = data.precedent_analysis?.length > 0;
  const hasConflicts = data.conflicting_precedents?.length > 0;

  return (
    <div className="space-y-4">
      {data.absence_of_precedent_note && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{data.absence_of_precedent_note}</AlertDescription>
        </Alert>
      )}

      {hasPrecedents && (
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <Scale className="h-4 w-4" />
            {"\u0546\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580"} / Precedents ({data.precedent_analysis.length})
          </h4>
          {data.precedent_analysis.map((p, i) => (
            <Card key={i} className="border-l-4 border-l-primary">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 shrink-0" />
                    {p.court}
                    {p.case_number !== 'N/A' && (
                      <span className="text-muted-foreground font-normal">#{p.case_number}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {p.date !== 'N/A' && (
                      <span className="text-xs text-muted-foreground">{p.date}</span>
                    )}
                    <Badge variant={p.binding_status === 'binding' ? 'default' : 'secondary'} className="text-xs">
                      {p.binding_status === 'binding' ? '\u054A\u0561\u0580\u057F\u0561\u0564\u056B\u0580' : '\u0540\u0561\u0574\u0578\u0566\u056B\u0579'}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                <p className="text-sm">{p.legal_position_summary}</p>
                {p.direct_quote && (
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-3 py-1 text-sm italic text-muted-foreground flex items-start gap-2">
                    <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{"\u00AB"}{p.direct_quote}{"\u00BB"}</span>
                  </blockquote>
                )}
                <p className="text-sm text-primary/80">
                  <strong>{"\u053F\u056B\u0580\u0561\u057C\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576"}:</strong> {p.applicability_to_current_case}
                </p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>DocID: {p.source_doc_id?.substring(0, 8)}{"\u2026"}</span>
                  <span>Loc: {p.source_locator}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasConflicts && (
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {"\u0540\u0561\u056F\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580"} / Conflicts ({data.conflicting_precedents.length})
          </h4>
          {data.conflicting_precedents.map((c, i) => (
            <Card key={i} className="border-l-4 border-l-destructive">
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{c.court} {c.case_number !== 'N/A' ? `#${c.case_number}` : ''}</span>
                  {c.date !== 'N/A' && <span className="text-xs text-muted-foreground">{c.date}</span>}
                </div>
                <p className="text-sm">{c.conflict_summary}</p>
                <p className="text-sm text-destructive">
                  {"\u26A0\uFE0F"} {c.risk_note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!hasPrecedents && !hasConflicts && !data.absence_of_precedent_note && (
        <p className="text-sm text-muted-foreground">{"\u0546\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C"}</p>
      )}
    </div>
  );
}

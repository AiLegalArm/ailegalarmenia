import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle, HelpCircle, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ComparatorCase {
  case_number: string;
  date: string;
  legal_position_summary: string;
  direct_quote: string;
  relevance: string;
  binding_status: 'binding' | 'persuasive';
  source_doc_id: string;
  source_locator: string;
}

export interface ComparatorConsistencyLevel {
  status: 'consistent' | 'partial' | 'contradictory' | 'insufficient_context' | 'not_applicable';
  supporting_cases: ComparatorCase[];
}

export interface LegalPositionComparatorResult {
  current_position_summary: string;
  consistency: {
    cassation: ComparatorConsistencyLevel;
    constitutional_court: ComparatorConsistencyLevel;
    echr: ComparatorConsistencyLevel;
  };
  normative_alignment: string;
  risk_of_reversal_level: 'low' | 'medium' | 'high' | 'unknown';
  missing_information: string[];
}

interface Props {
  data: LegalPositionComparatorResult;
}

function t3(lang: string, hy: string, en: string, ru: string): string {
  if (lang === 'en') return en;
  if (lang === 'ru') return ru;
  return hy;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'consistent': return <CheckCircle className="h-4 w-4 text-primary" />;
    case 'contradictory': return <XCircle className="h-4 w-4 text-destructive" />;
    case 'partial': return <AlertTriangle className="h-4 w-4 text-accent-foreground" />;
    default: return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function StatusBadge({ status, lang }: { status: string; lang: string }) {
  const variant = status === 'consistent' ? 'default' as const
    : status === 'contradictory' ? 'destructive' as const
    : 'secondary' as const;
  
  const labels: Record<string, string> = {
    consistent: t3(lang, '\u0540\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576', 'Consistent', '\u0421\u043E\u0433\u043B\u0430\u0441\u0443\u0435\u0442\u0441\u044F'),
    partial: t3(lang, '\u0544\u0561\u057D\u0576\u0561\u056F\u056B', 'Partial', '\u0427\u0430\u0441\u0442\u0438\u0447\u043D\u043E'),
    contradictory: t3(lang, '\u0540\u0561\u056F\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Contradictory', '\u041F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447\u0438\u0442'),
    insufficient_context: t3(lang, '\u0531\u0576\u0562\u0561\u057E\u0561\u0580\u0561\u0580', 'Insufficient', '\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E'),
    not_applicable: t3(lang, '\u0549\u056B \u056F\u056B\u0580\u0561\u057C\u057E\u0578\u0582\u0574', 'N/A', '\u041D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043C\u043E'),
  };

  return <Badge variant={variant}>{labels[status] || status}</Badge>;
}

function RiskBadge({ level, lang }: { level: string; lang: string }) {
  const config: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }> = {
    low: { variant: 'default', label: t3(lang, '\u0551\u0561\u056E\u0580', 'Low', '\u041D\u0438\u0437\u043A\u0438\u0439') },
    medium: { variant: 'secondary', label: t3(lang, '\u0544\u056B\u057B\u056B\u0576', 'Medium', '\u0421\u0440\u0435\u0434\u043D\u0438\u0439') },
    high: { variant: 'destructive', label: t3(lang, '\u0532\u0561\u0580\u0571\u0580', 'High', '\u0412\u044B\u0441\u043E\u043A\u0438\u0439') },
    unknown: { variant: 'outline', label: t3(lang, '\u0531\u0576\u0570\u0561\u0575\u057F', 'Unknown', '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E') },
  };
  const c = config[level] || config.unknown;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function CourtSection({ title, data, lang }: { title: string; data: ComparatorConsistencyLevel; lang: string }) {
  if (data.status === 'not_applicable') return null;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusIcon status={data.status} />
        <h4 className="font-semibold text-sm">{title}</h4>
        <StatusBadge status={data.status} lang={lang} />
      </div>
      
      {data.supporting_cases && data.supporting_cases.length > 0 && (
        <div className="space-y-2 ml-6">
          {data.supporting_cases.map((c, i) => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-medium text-sm">{c.case_number}</span>
                  <div className="flex items-center gap-2">
                    {c.date && <span className="text-xs text-muted-foreground">{c.date}</span>}
                    <Badge variant={c.binding_status === 'binding' ? 'default' : 'outline'} className="text-xs">
                      {c.binding_status === 'binding' 
                        ? t3(lang, '\u054A\u0561\u0580\u057F\u0561\u0564\u056B\u0580', 'Binding', '\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439')
                        : t3(lang, '\u0540\u0561\u0574\u0578\u0566\u056B\u0579', 'Persuasive', '\u0423\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439')}
                    </Badge>
                  </div>
                </div>
                {c.legal_position_summary && (
                  <p className="text-sm">{c.legal_position_summary}</p>
                )}
                {c.direct_quote && (
                  <blockquote className="text-xs italic border-l-2 border-primary/50 pl-2 text-muted-foreground">
                    \u00AB{c.direct_quote}\u00BB
                  </blockquote>
                )}
                {c.relevance && (
                  <p className="text-xs text-muted-foreground">
                    <Scale className="h-3 w-3 inline mr-1" />
                    {c.relevance}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function LegalPositionComparatorView({ data }: Props) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.current_position_summary && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">
              {t3(lang, '\u0536\u0562\u0561\u0572\u0565\u0581\u0580\u0561\u056E \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0564\u056B\u0580\u0584\u0568', 'Current Legal Position', '\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u043F\u0440\u0430\u0432\u043E\u0432\u0430\u044F \u043F\u043E\u0437\u0438\u0446\u0438\u044F')}
            </h4>
            <p className="text-sm">{data.current_position_summary}</p>
          </CardContent>
        </Card>
      )}

      {data.risk_of_reversal_level && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {t3(lang, '\u054E\u0565\u0580\u0561\u0581\u0574\u0561\u0576 \u057C\u056B\u057D\u056F', 'Reversal Risk', '\u0420\u0438\u0441\u043A \u043E\u0442\u043C\u0435\u043D\u044B')}:
          </span>
          <RiskBadge level={data.risk_of_reversal_level} lang={lang} />
        </div>
      )}

      {data.consistency?.cassation && (
        <CourtSection 
          title={t3(lang, '\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576', 'Cassation Court RA', '\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0441\u0443\u0434 \u0420\u0410')} 
          data={data.consistency.cassation}
          lang={lang}
        />
      )}
      {data.consistency?.constitutional_court && (
        <CourtSection 
          title={t3(lang, '\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576', 'Constitutional Court RA', '\u041A\u043E\u043D\u0441\u0442\u0438\u0442\u0443\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0441\u0443\u0434 \u0420\u0410')} 
          data={data.consistency.constitutional_court}
          lang={lang}
        />
      )}
      {data.consistency?.echr && (
        <CourtSection 
          title={t3(lang, '\u0544\u053B\u0535\u0534', 'ECHR', '\u0415\u0421\u041F\u0427')} 
          data={data.consistency.echr}
          lang={lang}
        />
      )}

      {data.normative_alignment && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">
              {t3(lang, '\u0546\u0578\u0580\u0574\u0561\u057F\u056B\u057E \\u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Normative Alignment', '\u041D\u043E\u0440\u043C\u0430\u0442\u0438\u0432\u043D\u043E\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435')}
            </h4>
            <p className="text-sm">{data.normative_alignment}</p>
          </CardContent>
        </Card>
      )}

      {data.missing_information && data.missing_information.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <AlertDescription>
            <p className="font-medium text-sm mb-1">
              {t3(lang, '\u0532\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0572 \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Missing Information', '\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F')}:
            </p>
            <ul className="text-sm list-disc list-inside space-y-0.5">
              {data.missing_information.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

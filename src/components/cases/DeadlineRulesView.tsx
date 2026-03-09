import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Clock, FileText, HelpCircle } from 'lucide-react';

export interface DeadlineRule {
  procedure_type: string;
  stage: string;
  deadline_purpose: string;
  legal_basis_article: string;
  triggering_event: string;
  required_dates_to_compute: string[];
  deadline_rule_text: string;
  risk_note: string;
}

export interface DeadlineRulesResult {
  identified_deadlines: DeadlineRule[];
  critical_risk_alert: string;
  missing_information: string[];
  unverified_references: string[];
}

interface DeadlineRulesViewProps {
  data: DeadlineRulesResult;
}

export function DeadlineRulesView({ data }: DeadlineRulesViewProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const t = (hy: string, en: string, ru: string) =>
    lang === 'hy' ? hy : lang === 'en' ? en : ru;

  const procedureLabel = (type: string) => {
    const labels: Record<string, string> = {
      civil: t('\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576', 'Civil', '\u0413\u0440\u0430\u0436\u0434\u0430\u0456\u0441\u043A\u043E\u0435'),
      criminal: t('\u0554\u0580\u0565\u0561\u056F\u0561\u0576', 'Criminal', '\u0423\u0433\u043E\u043B\u043E\u0432\u043D\u043E\u0435'),
      administrative: t('\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576', 'Administrative', '\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043D\u043E\u0435'),
      constitutional: t('\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576', 'Constitutional', '\u041A\u043E\u043D\u0441\u0442\u0438\u0442\u0443\u0446\u0438\u043E\u043D\u043D\u043E\u0435'),
      echr: t('\u0544\u053B\u0531\u0534', 'ECHR', '\u0415\u0421\u041F\u0427'),
    };
    return labels[type] || type;
  };

  const isUnverified = (article: string) => article.startsWith('UNVERIFIED');

  return (
    <div className="space-y-4">
      {/* Critical Risk Alert */}
      {data.critical_risk_alert && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <AlertDescription className="break-words font-medium">
            {data.critical_risk_alert}
          </AlertDescription>
        </Alert>
      )}

      {/* Deadline Cards */}
      {data.identified_deadlines.length > 0 ? (
        <div className="space-y-3">
          {data.identified_deadlines.map((deadline, idx) => (
            <Card key={idx} className="border-l-4 border-l-primary/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {procedureLabel(deadline.procedure_type)}
                    </Badge>
                    {deadline.stage && (
                      <Badge variant="secondary" className="text-xs">
                        {deadline.stage}
                      </Badge>
                    )}
                    {isUnverified(deadline.legal_basis_article) && (
                      <Badge variant="destructive" className="text-xs">
                        {t('\u0549\u057D\u057F\u0578\u0582\u0563\u057E\u0561\u056E', 'Unverified', '\u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E')}
                      </Badge>
                    )}
                  </div>
                </div>

                <h4 className="font-semibold text-sm">{deadline.deadline_purpose}</h4>

                <div className="grid gap-2 text-sm">
                  {/* Legal Basis */}
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {t('\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u056B\u0574\u0584', 'Legal basis', '\u041F\u0440\u0430\u0432\u043E\u0432\u043E\u0435 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435')}:{' '}
                      </span>
                      <span className={isUnverified(deadline.legal_basis_article) ? 'text-destructive' : ''}>
                        {deadline.legal_basis_article}
                      </span>
                    </div>
                  </div>

                  {/* Deadline Rule */}
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {t('\u053a\u0561\u0574\u056F\u0565\u057F', 'Deadline', '\u0421\u0440\u043E\u043A')}:{' '}
                      </span>
                      <span className="font-medium">{deadline.deadline_rule_text}</span>
                    </div>
                  </div>

                  {/* Triggering Event */}
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground text-xs mt-1 shrink-0">\u25B6</span>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {t('\u0533\u0578\u0580\u056E\u0561\u0580\u056F\u0578\u0572', 'Trigger', '\u0422\u0440\u0438\u0433\u0433\u0435\u0440')}:{' '}
                      </span>
                      {deadline.triggering_event}
                    </div>
                  </div>

                  {/* Required Dates */}
                  {deadline.required_dates_to_compute.length > 0 && (
                    <div className="flex items-start gap-2">
                      <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-accent-foreground" />
                      <div>
                        <span className="font-medium text-accent-foreground">
                          {t('\u0531\u0576\u0570\u0580\u0561\u056A\u0565\u0577\u057F \u0561\u0574\u057D\u0561\u0569\u057E\u0565\u0580', 'Required dates', '\u041D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u044B\u0435 \u0434\u0430\u0442\u044B')}:{' '}
                        </span>
                        {deadline.required_dates_to_compute.join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Risk Note */}
                  {deadline.risk_note && (
                    <div className="mt-1 p-2 rounded bg-destructive/10 text-destructive text-xs">
                      \u26A0\uFE0F {deadline.risk_note}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(
            '\u053a\u0561\u0574\u056F\u0565\u057F\u0576\u0565\u0580 \u0579\u0565\u0576 \u0570\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0565\u056C \u057F\u0580\u0561\u0574\u0561\u0564\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0565\u0580\u056B \u0570\u0561\u0574\u0561\u0580:',
            'No procedural deadlines identified for the provided facts.',
            '\u041F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u0440\u043E\u043A\u0438 \u043D\u0435 \u0432\u044B\u044F\u0432\u043B\u0435\u043D\u044B \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0438 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u0444\u0430\u043A\u0442\u043E\u0432.'
          )}
        </p>
      )}

      {/* Missing Information */}
      {data.missing_information.length > 0 && (
        <div className="rounded-lg border border-accent bg-accent/10 p-3">
          <p className="text-sm font-medium text-accent-foreground mb-2">
            {t('\u0532\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0572 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576', 'Missing Information', '\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F')}
          </p>
          <ul className="text-sm text-accent-foreground space-y-1">
            {data.missing_information.map((info, idx) => (
              <li key={idx}>\u2022 {info}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Unverified References */}
      {data.unverified_references.length > 0 && (
        <div className="rounded-lg border border-muted p-3">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {t('\u0549\u057D\u057F\u0578\u0582\u0563\u057E\u0561\u056E \u0570\u0572\u0578\u0582\u0574\u0576\u0565\u0580', 'Unverified References', '\u041D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438')}
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {data.unverified_references.map((ref, idx) => (
              <li key={idx}>\u2022 {ref}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

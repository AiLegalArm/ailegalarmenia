import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, Shield, ShieldAlert } from 'lucide-react';

export interface HallucinationAuditResult {
  verified: Array<{ type: string; value: string; source_ref: string }>;
  invalid: Array<{ type: string; value: string; reason: string }>;
  unverified: Array<{ type: string; value: string; reason: string }>;
  jurisdiction_violations: string[];
  hallucination_risk_detected: boolean;
}

interface Props {
  data: HallucinationAuditResult;
}

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    article: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    case: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    quote: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    other: 'bg-muted text-muted-foreground',
  };
  return <Badge variant="outline" className={`text-xs ${colors[type] || colors.other}`}>{type}</Badge>;
}

export function HallucinationAuditView({ data }: Props) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const totalRefs = data.verified.length + data.invalid.length + data.unverified.length;
  const riskDetected = data.hallucination_risk_detected;

  const label = (hy: string, en: string, ru: string) =>
    lang === 'hy' ? hy : lang === 'en' ? en : ru;

  return (
    <div className="space-y-4">
      {/* Risk Summary */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
        riskDetected
          ? 'border-destructive/50 bg-destructive/10'
          : 'border-green-500/50 bg-green-500/10'
      }`}>
        {riskDetected ? (
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
        ) : (
          <Shield className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
        )}
        <div>
          <p className="font-medium text-sm">
            {riskDetected
              ? label('\u0540\u0561\u056C\u0578\u0582\u0581\u056B\u0576\u0561\u0581\u056B\u0561\u0575\u056B \u057C\u056B\u057D\u056F \u0570\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0565\u056C \u0567', 'Hallucination risk detected', '\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D \u0440\u0438\u0441\u043A \u0433\u0430\u043B\u043B\u044E\u0446\u0438\u043D\u0430\u0446\u0438\u0438')
              : label('\u0540\u0561\u056C\u0578\u0582\u0581\u056B\u0576\u0561\u0581\u056B\u0561\u0575\u056B \u057C\u056B\u057D\u056F \u0579\u056B \u0570\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0565\u056C', 'No hallucination risk detected', '\u0420\u0438\u0441\u043A \u0433\u0430\u043B\u043B\u044E\u0446\u0438\u043D\u0430\u0446\u0438\u0438 \u043D\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D')}
          </p>
          <p className="text-xs text-muted-foreground">
            {label(
              `${totalRefs} \u0570\u0572\u0578\u0582\u0574 \u057D\u057F\u0578\u0582\u0563\u057E\u0561\u056E\u055D ${data.verified.length} \u0570\u0561\u057D\u057F\u0561\u057F\u057E\u0561\u056E, ${data.invalid.length} \u0561\u0576\u057E\u0561\u057E\u0565\u0580, ${data.unverified.length} \u0579\u057D\u057F\u0578\u0582\u0563\u057E\u0561\u056E`,
              `${totalRefs} references checked: ${data.verified.length} verified, ${data.invalid.length} invalid, ${data.unverified.length} unverified`,
              `${totalRefs} \u0441\u0441\u044B\u043B\u043E\u043A \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E: ${data.verified.length} \u043F\u043E\u0434\u0442\u0432., ${data.invalid.length} \u043D\u0435\u0432\u0430\u043B\u0438\u0434., ${data.unverified.length} \u043D\u0435\u043F\u0440\u043E\u0432.`
            )}
          </p>
        </div>
      </div>

      {/* Invalid References */}
      {data.invalid.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <XCircle className="h-4 w-4" />
            {label('\u0531\u0576\u057E\u0561\u057E\u0565\u0580 \u0570\u0572\u0578\u0582\u0574\u0576\u0565\u0580', 'Invalid References', '\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438')} ({data.invalid.length})
          </h4>
          <div className="space-y-2">
            {data.invalid.map((item, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="flex items-start gap-2">
                  {typeBadge(item.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{item.value}</p>
                    <p className="text-xs text-destructive mt-1">{item.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unverified References */}
      {data.unverified.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <HelpCircle className="h-4 w-4" />
            {label('\u0549\u057D\u057F\u0578\u0582\u0563\u057E\u0561\u056E \u0570\u0572\u0578\u0582\u0574\u0576\u0565\u0580', 'Unverified References', '\u041D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438')} ({data.unverified.length})
          </h4>
          <div className="space-y-2">
            {data.unverified.map((item, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-start gap-2">
                  {typeBadge(item.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{item.value}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{item.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verified References */}
      {data.verified.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {label('\u0540\u0561\u057D\u057F\u0561\u057F\u057E\u0561\u056E \u0570\u0572\u0578\u0582\u0574\u0576\u0565\u0580', 'Verified References', '\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438')} ({data.verified.length})
          </h4>
          <div className="space-y-2">
            {data.verified.map((item, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                <div className="flex items-start gap-2">
                  {typeBadge(item.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.source_ref}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jurisdiction Violations */}
      {data.jurisdiction_violations.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {label('\u053b\u0580\u0561\u057E\u0561\u0566\u0578\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580', 'Jurisdiction Violations', '\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u044E\u0440\u0438\u0441\u0434\u0438\u043A\u0446\u0438\u0438')} ({data.jurisdiction_violations.length})
          </h4>
          <ul className="space-y-1 pl-6 list-disc">
            {data.jurisdiction_violations.map((v, idx) => (
              <li key={idx} className="text-sm text-destructive">{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

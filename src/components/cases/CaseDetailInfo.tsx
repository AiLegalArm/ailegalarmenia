import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { FileText, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseTimeline } from './CaseTimeline';
import { CaseComments } from './CaseComments';

interface CaseDetailInfoProps {
  caseId: string;
  courtName?: string | null;
  courtDate?: string | null;
  createdAt: string;
  updatedAt: string;
  isAdmin: boolean;
  isAuditor: boolean;
}

export function CaseDetailInfo({
  caseId,
  courtName,
  courtDate,
  createdAt,
  updatedAt,
  isAdmin,
  isAuditor
}: CaseDetailInfoProps) {
  const { t } = useTranslation(['cases', 'common']);

  return (
    <div className="space-y-4 sm:space-y-6 overflow-hidden max-w-full">
      {/* Case Info */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-mobile-lg sm:text-lg">{t('common:information', 'Information')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          {courtName && (
            <div className="flex items-start gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t('cases:court_name')}</p>
                <p className="text-mobile-sm sm:text-sm break-words" style={{ overflowWrap: 'anywhere' }}>{courtName}</p>
              </div>
            </div>
          )}
          {courtDate && (
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">{t('cases:court_date')}</p>
                <p className="text-mobile-sm sm:text-sm">{format(new Date(courtDate), 'dd.MM.yyyy')}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{t('cases:created_at')}</p>
            <p className="text-mobile-sm sm:text-sm">{format(new Date(createdAt), 'dd.MM.yyyy HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('cases:updated_at')}</p>
            <p className="text-mobile-sm sm:text-sm">{format(new Date(updatedAt), 'dd.MM.yyyy HH:mm')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-mobile-lg sm:text-lg">{t('cases:case_timeline')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <CaseTimeline caseId={caseId} />
        </CardContent>
      </Card>

      {/* Team Leader Comments - visible to admins and team leaders (auditors) */}
      {(isAdmin || isAuditor) && <CaseComments caseId={caseId} />}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  FileText, 
  MoreVertical, 
  Eye, 
  Edit, 
  Trash2,
  AlertCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type Case = Database['public']['Tables']['cases']['Row'];

interface CaseCardProps {
  caseData: Case;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

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

export function CaseCard({ caseData, onView, onEdit, onDelete }: CaseCardProps) {
  const { t } = useTranslation('cases');

  // Check if court date is urgent (less than 7 days from today, but still in the future)
  const isCourtDateUrgent = () => {
    if (!caseData.court_date) return false;
    const courtDate = new Date(caseData.court_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
    courtDate.setHours(0, 0, 0, 0);
    
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);
    
    return courtDate >= today && courtDate <= sevenDaysFromNow;
  };

  const courtDateBadgeColor = isCourtDateUrgent() 
    ? 'bg-red-500/10 text-red-700 dark:text-red-400'
    : 'bg-blue-500/10 text-blue-700 dark:text-blue-400';

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold leading-tight">
            {caseData.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {caseData.case_number}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(caseData.id)}>
              <Eye className="mr-2 h-4 w-4" />
              {t('view_case')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(caseData.id)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit_case')}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(caseData.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete_case')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {caseData.description && (
          <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
            {caseData.description}
          </p>
        )}
        
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusColors[caseData.status]}>
            {t(`status_${caseData.status}`)}
          </Badge>
          <Badge className={priorityColors[caseData.priority]}>
            {t(`priority_${caseData.priority}`)}
          </Badge>
          <Badge className={courtDateBadgeColor}>
            {caseData.court_date 
              ? `${t('court_hearing')}՝ ${format(new Date(caseData.court_date), 'yyyy-MM-dd')}`
              : t('no_court_date')}
          </Badge>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          {caseData.court_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(caseData.court_date), 'dd.MM.yyyy')}</span>
            </div>
          )}
          {caseData.court_name && (
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span className="truncate max-w-[150px]">{caseData.court_name}</span>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {t('created_at')}: {format(new Date(caseData.created_at), 'dd.MM.yyyy HH:mm')}
        </div>
      </CardContent>
    </Card>
  );
}

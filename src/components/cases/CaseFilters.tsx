import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { CaseFilters as CaseFiltersType } from '@/hooks/useCases';

interface CaseFiltersProps {
  filters: CaseFiltersType;
  onFiltersChange: (filters: CaseFiltersType) => void;
}

export function CaseFilters({ filters, onFiltersChange }: CaseFiltersProps) {
  const { t } = useTranslation('cases');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('search_cases')}
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      {/* Status Filter */}
      <Select
        value={filters.status || 'all'}
        onValueChange={(value) => onFiltersChange({ ...filters, status: value as CaseFiltersType['status'] })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t('filter_by_status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filter_by_status')}</SelectItem>
          <SelectItem value="open">{t('status_open')}</SelectItem>
          <SelectItem value="in_progress">{t('status_in_progress')}</SelectItem>
          <SelectItem value="pending">{t('status_pending')}</SelectItem>
          <SelectItem value="closed">{t('status_closed')}</SelectItem>
          <SelectItem value="archived">{t('status_archived')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority Filter */}
      <Select
        value={filters.priority || 'all'}
        onValueChange={(value) => onFiltersChange({ ...filters, priority: value as CaseFiltersType['priority'] })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t('filter_by_priority')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filter_by_priority')}</SelectItem>
          <SelectItem value="low">{t('priority_low')}</SelectItem>
          <SelectItem value="medium">{t('priority_medium')}</SelectItem>
          <SelectItem value="high">{t('priority_high')}</SelectItem>
          <SelectItem value="urgent">{t('priority_urgent')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select
        value={filters.sortBy || 'newest'}
        onValueChange={(value) => onFiltersChange({ ...filters, sortBy: value as CaseFiltersType['sortBy'] })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t('sort_by')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">{t('sort_newest')}</SelectItem>
          <SelectItem value="oldest">{t('sort_oldest')}</SelectItem>
          <SelectItem value="priority">{t('sort_priority')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

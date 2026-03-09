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
import type { KBFilters } from '@/hooks/useKnowledgeBase';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

interface KBSearchFiltersProps {
  filters: KBFilters;
  onFiltersChange: (filters: KBFilters) => void;
}

const categories: { value: KbCategory | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'categories' },
  ...kbCategoryOptions,
];

export function KBSearchFilters({ filters, onFiltersChange }: KBSearchFiltersProps) {
  const { t } = useTranslation('kb');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('search_kb')}
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value, page: 1 })}
          className="pl-9"
        />
      </div>

      {/* Category Filter */}
      <Select
        value={filters.category || 'all'}
        onValueChange={(value) => onFiltersChange({ ...filters, category: value as KBFilters['category'], page: 1 })}
      >
        <SelectTrigger className="w-full sm:w-[220px]">
          <SelectValue placeholder={t('categories')} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px] overflow-y-auto">
          {categories.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>
              {t(cat.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

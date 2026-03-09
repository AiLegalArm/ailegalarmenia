import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface KBPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const KBPagination = React.forwardRef<HTMLDivElement, KBPaginationProps>(function KBPagination({ page, totalPages, total, onPageChange }, ref) {
  const { t } = useTranslation('kb');

  if (totalPages <= 1) return null;

  return (
    <div ref={ref} className="flex items-center justify-between border-t pt-4">
      <p className="text-sm text-muted-foreground">
        {t('results_found', { count: total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

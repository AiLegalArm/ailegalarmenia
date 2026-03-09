import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, User } from 'lucide-react';
import { useKBVersions } from '@/hooks/useKnowledgeBase';
import { Loader2 } from 'lucide-react';

interface KBVersionHistoryProps {
  kbId: string;
}

export function KBVersionHistory({ kbId }: KBVersionHistoryProps) {
  const { t } = useTranslation(['kb', 'common']);
  const { data: versions, isLoading } = useKBVersions(kbId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t('common:no_history', 'No version history')}
      </p>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-4">
        {versions.map((version) => (
          <div key={version.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline">v{version.version_number}</Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(new Date(version.changed_at), 'dd.MM.yyyy HH:mm')}
              </div>
            </div>
            <p className="mt-2 text-sm font-medium">{version.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {version.content_text.substring(0, 150)}...
            </p>
            {version.change_reason && (
              <p className="mt-2 text-xs italic text-muted-foreground">
                {version.change_reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

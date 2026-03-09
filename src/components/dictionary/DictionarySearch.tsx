import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, BookOpenText, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useDictionarySearch, type DictionaryResult } from '@/hooks/useDictionarySearch';

function ResultCard({ item, query }: { item: DictionaryResult; query: string }) {
  const { t } = useTranslation('dictionary');
  const [formsOpen, setFormsOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const forms = Array.isArray(item.forms) ? item.forms : [];
  const examples = Array.isArray(item.examples) ? item.examples : [];

  return (
    <Card className="transition-shadow hover:shadow-medium">
      <CardContent className="pt-4 pb-3 px-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold text-foreground">{item.lemma}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.part_of_speech && (
              <Badge variant="secondary" className="text-xs">
                {item.part_of_speech}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs capitalize">
              {item.match_type}
            </Badge>
          </div>
        </div>

        {item.definition && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{item.definition}</p>
        )}

        {forms.length > 0 && (
          <Collapsible open={formsOpen} onOpenChange={setFormsOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {formsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {t('forms', {defaultValue: '\u0541\u0587\u0565\u0580'})} ({forms.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <div className="flex flex-wrap gap-1.5">
                {forms.map((f, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal">
                    {typeof f === 'string' ? f : JSON.stringify(f)}
                  </Badge>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {examples.length > 0 && (
          <Collapsible open={examplesOpen} onOpenChange={setExamplesOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {examplesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {t('examples', {defaultValue: '\u0555\u0580\u056B\u0576\u0561\u056F\u0576\u0565\u0580'})} ({examples.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {examples.map((ex, i) => (
                <p key={i} className="text-xs text-muted-foreground italic pl-3 border-l-2 border-primary/20">
                  {typeof ex === 'string' ? ex : JSON.stringify(ex)}
                </p>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

export function DictionarySearch() {
  const { t } = useTranslation('dictionary');
  const [query, setQuery] = useState('');
  const { results, isLoading, error, latencyMs, search, clear } = useDictionarySearch();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSearch = useCallback(
    (val: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!val.trim()) {
        clear();
        return;
      }
      timerRef.current = setTimeout(() => search(val), 300);
    },
    [search, clear]
  );

  useEffect(() => {
    debouncedSearch(query);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debouncedSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (timerRef.current) clearTimeout(timerRef.current);
      search(query);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('search_placeholder', {defaultValue: '\u0548\u0580\u0578\u0576\u0565\u056C \u0562\u0561\u057C...'})}
          className="pl-9"
          autoFocus
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Stats */}
      {latencyMs !== null && results.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {results.length} {t('results_found', {defaultValue: '\u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584'})} ({latencyMs}ms)
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* No results */}
      {!isLoading && !error && query.trim() && results.length === 0 && (
        <div className="flex flex-col items-center py-10 text-muted-foreground">
          <BookOpenText className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">{t('no_results', {defaultValue: '\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u056F\u0561\u0576'})}</p>
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        {results.map((item) => (
          <ResultCard key={item.id} item={item} query={query} />
        ))}
      </div>
    </div>
  );
}

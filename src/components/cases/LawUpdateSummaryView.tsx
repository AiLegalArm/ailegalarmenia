import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileEdit, Trash2, PlusCircle, Info } from 'lucide-react';

export interface AmendedArticle {
  article: string;
  old_text_excerpt: string;
  new_text_excerpt: string;
  change_type: string;
  description: string;
}

export interface SimpleArticle {
  article: string;
  description: string;
}

export interface LawUpdateSummaryResult {
  amended_articles: AmendedArticle[];
  repealed_articles: SimpleArticle[];
  new_articles: SimpleArticle[];
  summary: string;
  practice_impact_notes: string;
}

interface Props {
  data: LawUpdateSummaryResult;
  language?: string;
}

const changeTypeBadge = (type: string) => {
  switch (type) {
    case 'substantive':
      return <Badge variant="destructive" className="text-xs">Substantive</Badge>;
    case 'editorial':
      return <Badge variant="secondary" className="text-xs">Editorial</Badge>;
    case 'scope_change':
      return <Badge className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">Scope</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
};

export function LawUpdateSummaryView({ data, language = 'en' }: Props) {
  const t = (hy: string, en: string, ru: string) =>
    language === 'hy' ? hy : language === 'ru' ? ru : en;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {t('\u0531\u0574\u0583\u0578\u0583\u0578\u0582\u0574', 'Summary', '\u0420\u0435\u0437\u044E\u043C\u0435')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Amended Articles */}
      {data.amended_articles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-amber-500" />
              {t('\u0553\u0578\u0583\u0578\u056D\u057E\u0561\u056E \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580', 'Amended Articles', '\u0418\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0435 \u0441\u0442\u0430\u0442\u044C\u0438')} ({data.amended_articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.amended_articles.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.article}</span>
                  {changeTypeBadge(item.change_type)}
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {item.old_text_excerpt && (
                  <div className="bg-destructive/10 rounded p-2">
                    <p className="text-xs font-medium text-destructive mb-1">{t('\u0540\u056B\u0576 \u057F\u0565\u0584\u057D\u057F', 'Old Text', '\u0421\u0442\u0430\u0440\u044B\u0439 \u0442\u0435\u043A\u0441\u0442')}:</p>
                    <p className="text-xs text-muted-foreground">{item.old_text_excerpt}</p>
                  </div>
                )}
                {item.new_text_excerpt && (
                  <div className="bg-green-500/10 rounded p-2">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">{t('\u0546\u0578\u0580 \u057F\u0565\u0584\u057D\u057F', 'New Text', '\u041D\u043E\u0432\u044B\u0439 \u0442\u0435\u043A\u0441\u0442')}:</p>
                    <p className="text-xs text-muted-foreground">{item.new_text_excerpt}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Repealed Articles */}
      {data.repealed_articles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {t('\u0548\u0582\u056A\u0568 \u056F\u0578\u0580\u0581\u0580\u0561\u056E \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580', 'Repealed Articles', '\u041E\u0442\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0435 \u0441\u0442\u0430\u0442\u044C\u0438')} ({data.repealed_articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.repealed_articles.map((item, idx) => (
              <div key={idx} className="border border-destructive/20 rounded-lg p-3">
                <span className="font-medium text-sm">{item.article}</span>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* New Articles */}
      {data.new_articles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-green-600" />
              {t('\u0546\u0578\u0580 \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580', 'New Articles', '\u041D\u043E\u0432\u044B\u0435 \u0441\u0442\u0430\u0442\u044C\u0438')} ({data.new_articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.new_articles.map((item, idx) => (
              <div key={idx} className="border border-green-500/20 rounded-lg p-3">
                <span className="font-medium text-sm">{item.article}</span>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Practice Impact */}
      {data.practice_impact_notes && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('\u0531\u0566\u0564\u0565\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u057E\u0580\u0561', 'Practice Impact', '\u0412\u043B\u0438\u044F\u043D\u0438\u0435 \u043D\u0430 \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0443')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.practice_impact_notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface CrossExamResult {
  cross_examination_strategy: string;
  question_blocks: Array<{
    objective: string;
    target: 'witness' | 'expert' | 'victim' | 'party';
    questions: string[];
  }>;
}

interface CrossExamViewProps {
  data: CrossExamResult;
  language?: string;
}

const TARGET_LABELS: Record<string, { en: string; hy: string; ru: string; color: string }> = {
  witness: { en: 'Witness', hy: '\u054E\u056F\u0561', ru: '\u0421\u0432\u0438\u0434\u0435\u0442\u0435\u043B\u044C', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  expert: { en: 'Expert', hy: '\u0553\u0578\u0580\u0571\u0561\u0563\u0565\u057F', ru: '\u042D\u043A\u0441\u043F\u0435\u0440\u0442', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  victim: { en: 'Victim', hy: '\u054F\u0578\u0582\u056A\u0578\u0572', ru: '\u041F\u043E\u0442\u0435\u0440\u043F\u0435\u0432\u0448\u0438\u0439', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  party: { en: 'Party', hy: '\u053F\u0578\u0572\u0574', ru: '\u0421\u0442\u043E\u0440\u043E\u043D\u0430', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
};

export function CrossExamView({ data, language = 'en' }: CrossExamViewProps) {
  const lang = language === 'hy' ? 'hy' : language === 'ru' ? 'ru' : 'en';
  const [isOpen, setIsOpen] = useState(false);
  const hasMultipleBlocks = (data.question_blocks?.length || 0) > 2;

  const content = (
    <div className="space-y-4">
      {/* Strategy Overview */}
      {data.cross_examination_strategy && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">
              {lang === 'hy' ? '\u053D\u0561\u0579\u0561\u0571\u0587 \u0570\u0561\u0580\u0581\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u057C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576' : lang === 'ru' ? '\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F \u043F\u0435\u0440\u0435\u043A\u0440\u0451\u0441\u0442\u043D\u043E\u0433\u043E \u0434\u043E\u043F\u0440\u043E\u0441\u0430' : 'Cross-Examination Strategy'}
            </h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.cross_examination_strategy}</p>
          </CardContent>
        </Card>
      )}

      {/* Question Blocks */}
      {data.question_blocks?.map((block, blockIdx) => {
        const targetInfo = TARGET_LABELS[block.target] || TARGET_LABELS.witness;
        return (
          <Card key={blockIdx}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge className={targetInfo.color}>
                  {targetInfo[lang]}
                </Badge>
                <h4 className="font-semibold text-sm">{block.objective}</h4>
              </div>
              <ol className="space-y-2 list-decimal list-inside">
                {block.questions?.map((q, qIdx) => (
                  <li key={qIdx} className="text-sm text-foreground pl-1">
                    {q}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}

      {(!data.question_blocks || data.question_blocks.length === 0) && (
        <p className="text-sm text-muted-foreground italic">
          {lang === 'en' ? 'No question blocks generated.' : lang === 'ru' ? '\u0411\u043B\u043E\u043A\u0438 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432 \u043D\u0435 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u044B.' : '\u0540\u0561\u0580\u0581\u0565\u0580\u056B \u0562\u056C\u0578\u056F\u0576\u0565\u0580 \u0579\u0565\u0576 \u0571\u0587\u0561\u057E\u0578\u0580\u057E\u0565\u056C\u0589'}
        </p>
      )}
    </div>
  );

  if (hasMultipleBlocks) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          {data.question_blocks?.length || 0} {lang === 'en' ? 'question blocks' : lang === 'ru' ? '\u0431\u043B\u043E\u043A\u043E\u0432 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432' : '\u0570\u0561\u0580\u0581\u0565\u0580\u056B \u0562\u056C\u0578\u056F\u0576\u0565\u0580'}
        </CollapsibleTrigger>
        <CollapsibleContent>{content}</CollapsibleContent>
      </Collapsible>
    );
  }

  return content;
}

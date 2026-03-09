import { useState } from 'react';
import { StickyNote, X } from 'lucide-react';
import { NotesPanel } from './NotesPanel';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';

export function NotesBubble() {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-4 right-[4.5rem] sm:bottom-6 sm:right-24 z-50 flex flex-col items-end gap-2 pb-safe">
          {showTooltip && (
            <div className="relative flex items-center">
              <div className="bg-card border shadow-lg rounded-2xl rounded-br-sm px-4 py-2 text-sm font-medium text-foreground max-w-[200px] text-right animate-in fade-in slide-in-from-bottom-2 duration-500">
                {t('my_notes', '\u041c\u043e\u0438 \u0437\u0430\u043f\u0438\u0441\u0438')}
              </div>
              <button
                className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowTooltip(false); }}
                aria-label="Close hint"
              >
                <X className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            </div>
          )}

          <button
            onClick={() => setIsOpen(true)}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className={cn(
              "group relative h-14 w-14 rounded-full bg-secondary text-secondary-foreground shadow-2xl",
              "flex items-center justify-center transition-all duration-300",
              "hover:scale-110 hover:shadow-secondary/30 hover:shadow-2xl",
              "animate-in zoom-in duration-300 border border-border"
            )}
            aria-label={t('my_notes', '\u041c\u043e\u0438 \u0437\u0430\u043f\u0438\u0441\u0438')}
          >
            <StickyNote className="h-6 w-6 transition-transform group-hover:scale-110" />
          </button>
        </div>
      )}

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" side="right">
          <div className="h-full flex flex-col">
            <NotesPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

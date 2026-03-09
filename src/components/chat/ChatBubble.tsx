import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { LegalChatBot } from './LegalChatBot';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function ChatBubble() {
  const { t } = useTranslation('ai');
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);

  const handleOpen = () => {
    setIsOpen(true);
    setShowTooltip(false);
  };

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-2 pb-safe">
          {showTooltip && (
            <div className="relative flex items-center">
              <div className="bg-card border shadow-lg rounded-2xl rounded-br-sm px-4 py-2 text-sm font-medium text-foreground max-w-[200px] text-right animate-in fade-in slide-in-from-bottom-2 duration-500">
                {t('chat_bubble_hint')}
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
            onClick={handleOpen}
            className={cn(
              "group relative h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-2xl",
              "flex items-center justify-center transition-all duration-300",
              "hover:scale-110 hover:shadow-primary/30 hover:shadow-2xl",
              "animate-in zoom-in duration-300"
            )}
            aria-label={t('ai_name', 'AI Legal Chat')}
          >
            <MessageCircle className="h-6 w-6 transition-transform group-hover:scale-110" />
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-60" />
          </button>
        </div>
      )}

      <LegalChatBot
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
}

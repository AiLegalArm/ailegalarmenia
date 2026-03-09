import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageCircle, 
  Send, 
  Loader2, 
  Bot, 
  User,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { stripMarkdown } from '@/lib/strip-markdown';
import { useReferencesText } from '@/lib/references-store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legal-chat`;

// Armenian greeting
const GREETING_MESSAGE = "\u0532\u0561\u0580\u0587 \u0541\u0565\u0566\u0589 \u0535\u057D Ai Legal Armenia-\u056B \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0585\u0563\u0576\u0561\u056F\u0561\u0576\u0576 \u0565\u0574\u0589\n\u053F\u0561\u0580\u0578\u0572 \u0565\u0574 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0565\u056C \u0574\u056B\u0561\u0575\u0576 \u0540\u0540 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u056B\u0576 \u057E\u0565\u0580\u0561\u0562\u0565\u0580\u0578\u0572 \u0570\u0561\u0580\u0581\u0565\u0580\u056B\u0576 \u0587 \u0570\u0561\u0580\u0581\u0565\u0580\u056B\u0576 Ai Legal Armenia \u056E\u0580\u0561\u0563\u0580\u056B \u0574\u0561\u057D\u056B\u0576\u055D\n\u0570\u056B\u0574\u0576\u057E\u0565\u056C\u0578\u057E \u0562\u0561\u0581\u0561\u057C\u0561\u057A\u0565\u057D \u0563\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u056B \u057E\u0580\u0561\u0589\n\n\u053B\u0576\u0579\u057A\u0565\u055E\u057D \u056F\u0561\u0580\u0578\u0572 \u0565\u0574 \u0585\u0563\u0576\u0565\u056C \u0541\u0565\u0566\u0589";

interface LegalChatBotProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  referencesText?: string;
  caseId?: string;
}

export function LegalChatBot({ isOpen: controlledIsOpen, onOpenChange, referencesText: propReferencesText, caseId }: LegalChatBotProps = {}) {
  const { t } = useTranslation('ai');
  const storeKey = caseId ?? "_global";
  const storeReferencesText = useReferencesText(storeKey);
  const effectiveReferencesText = propReferencesText || storeReferencesText;
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  };
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: GREETING_MESSAGE }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = useCallback(async (userMessage: string) => {
    setIsLoading(true);
    let assistantContent = '';

    try {
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.slice(1), // Skip greeting
          ...(effectiveReferencesText?.trim() ? { referencesText: effectiveReferencesText } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          const rawLine = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                if (updated[updated.length - 1]?.role === 'assistant') {
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                }
                return updated;
              });
            }
          } catch {
            // Incomplete JSON, put back
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (textBuffer.trim()) {
        for (const raw of textBuffer.split('\n')) {
          if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
            }
          } catch { /* ignore */ }
        }
        if (assistantContent) {
          setMessages(prev => {
            const updated = [...prev];
            if (updated[updated.length - 1]?.role === 'assistant') {
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
            }
            return updated;
          });
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : '\u054D\u056D\u0561\u056C \u0561\u057C\u0561\u057B\u0561\u0581\u0561\u057E';
      setMessages(prev => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.role === 'assistant' && updated[updated.length - 1].content === '') {
          updated[updated.length - 1] = { role: 'assistant', content: `\u054D\u056D\u0561\u056C: ${errorMessage}` };
        } else {
          updated.push({ role: 'assistant', content: `\u054D\u056D\u0561\u056C: ${errorMessage}` });
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    streamChat(userMessage);
  }, [input, isLoading, streamChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Card
      className={cn(
        "fixed z-50 shadow-2xl transition-all duration-300 overflow-hidden",
        isExpanded
          ? "inset-4 sm:left-auto sm:top-auto sm:bottom-4 sm:right-4 sm:h-[90vh] sm:w-[600px]"
          : "bottom-4 right-4 h-[500px] w-[calc(100vw-32px)] max-w-[380px] sm:w-[380px]"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b p-3 min-w-0">
        <CardTitle className="flex items-center gap-2 text-base min-w-0">
          <Bot className="h-5 w-5 text-primary shrink-0" />
          <span className="truncate">{t('ai_name')}</span>
        </CardTitle>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex h-[calc(100%-120px)] flex-col p-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    msg.role === 'user' ? "bg-primary" : "bg-muted"
                  )}
                >
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.role === 'assistant' ? stripMarkdown(msg.content || '\u2026') : msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('analyzing')}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('enter_case_details')}
              className="min-h-[40px] max-h-[120px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t('legal_only_warning')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

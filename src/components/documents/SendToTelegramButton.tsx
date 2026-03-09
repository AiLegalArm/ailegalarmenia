import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { getText } from '@/lib/i18n-utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Send, Loader2, AlertCircle, Settings } from 'lucide-react';
import { TelegramSettings } from '@/components/profile/TelegramSettings';

interface SendToTelegramButtonProps {
  documentTitle: string;
  documentContent: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const SendToTelegramButton = ({
  documentTitle,
  documentContent,
  variant = 'outline',
  size = 'sm',
}: SendToTelegramButtonProps) => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Using centralized getText from @/lib/i18n-utils

  const checkTelegramSettings = async () => {
    if (!user) return;

    setIsChecking(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data?.telegram_chat_id) {
        setChatId(data.telegram_chat_id);
        setShowConfirm(true);
      } else {
        setChatId(null);
        setShowSettings(true);
      }
    } catch (error) {
      console.error('Error checking settings:', error);
      toast({
        title: getText('Сխал', 'Ошибка', 'Error'),
        description: getText(
          'Չdelays',
          'Не удалось проверить настройки',
          'Failed to check settings'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const formatDocumentForTelegram = (title: string, content: string): string => {
    // Escape HTML special characters for Telegram
    const escapeHtml = (text: string) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Truncate content if too long (Telegram has 4096 char limit)
    const maxContentLength = 3500;
    let truncatedContent = content;
    let isTruncated = false;

    if (content.length > maxContentLength) {
      truncatedContent = content.substring(0, maxContentLength);
      isTruncated = true;
    }

    let message = `📄 <b>${escapeHtml(title)}</b>\n\n`;
    message += escapeHtml(truncatedContent);

    if (isTruncated) {
      message += '\n\n<i>... [' + getText('Կdelays', 'сокращено', 'truncated') + ']</i>';
    }

    return message;
  };

  const handleSend = async () => {
    if (!chatId || !user) return;

    setIsSending(true);
    try {
      const message = formatDocumentForTelegram(documentTitle, documentContent);

      const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
        body: {
          chatId,
          message,
          parseMode: 'HTML',
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: getText('Ուdelays', 'Отправлено', 'Sent'),
          description: getText(
            'Փdelays Telegram',
            'Документ отправлен в Telegram',
            'Document sent to Telegram'
          ),
        });
        setShowConfirm(false);
      } else {
        throw new Error(data?.error || 'Failed to send');
      }
    } catch (error) {
      console.error('Send error:', error);
      toast({
        title: getText('Сխал', 'Ошибка', 'Error'),
        description: getText(
          'Չdelays',
          'Не удалось отправить в Telegram',
          'Failed to send to Telegram'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={checkTelegramSettings}
        disabled={isChecking}
      >
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4 mr-1" />
        )}
        Telegram
      </Button>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {getText(' Delays Telegram', 'Отправить в Telegram', 'Send to Telegram')}
            </DialogTitle>
            <DialogDescription>
              {getText(
                'Փdelays delays: Telegram?',
                `Отправить документ "${documentTitle}" в ваш Telegram?`,
                `Send document "${documentTitle}" to your Telegram?`
              )}
            </DialogDescription>
          </DialogHeader>

          {documentContent.length > 3500 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/50">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {getText(
                  'Delays',
                  'Документ будет сокращён из-за ограничений Telegram',
                  'Document will be truncated due to Telegram limits'
                )}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              {getText('Չdelays', 'Отмена', 'Cancel')}
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              {getText('Уdelays', 'Отправить', 'Send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {getText('Delays Telegram', 'Настройка Telegram', 'Setup Telegram')}
            </DialogTitle>
            <DialogDescription>
              {getText(
                'Delays:',
                'Для отправки документов настройте Telegram',
                'Configure Telegram to send documents'
              )}
            </DialogDescription>
          </DialogHeader>
          <TelegramSettings
            onClose={() => {
              setShowSettings(false);
              // Re-check after settings saved
              checkTelegramSettings();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

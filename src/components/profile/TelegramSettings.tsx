import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getText } from '@/lib/i18n-utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Bell, ExternalLink, Copy, Check, Key, RefreshCw } from 'lucide-react';

const BOT_USERNAME = '@AiLegalArmenia';
const VERIFICATION_CODE_EXPIRY_MINUTES = 10;

interface TelegramSettingsProps {
  onClose?: () => void;
}

// Generate a secure 6-character verification code
function generateVerificationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars (0,O,1,I)
  let code = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export const TelegramSettings = ({ onClose }: TelegramSettingsProps) => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [chatId, setChatId] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      
      try {
        const { data } = await supabase
          .from('profiles')
          .select('telegram_chat_id, notification_preferences')
          .eq('id', user.id)
          .single();

        if (data) {
          setChatId(data.telegram_chat_id || '');
          const prefs = data.notification_preferences as any;
          setNotificationsEnabled(prefs?.telegram_enabled !== false);
        }
      } catch (error) {
        console.error('Error loading telegram settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  const handleGenerateCode = async () => {
    if (!user) return;
    setIsGeneratingCode(true);

    try {
      // Delete any existing unused codes for this user
      await supabase
        .from('telegram_verification_codes')
        .delete()
        .eq('user_id', user.id)
        .is('used_at', null);

      // Generate new code
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

      const { error } = await supabase
        .from('telegram_verification_codes')
        .insert({
          user_id: user.id,
          code,
          expires_at: expiresAt.toISOString(),
        });

      if (error) throw error;

      setVerificationCode(code);
      setCodeExpiresAt(expiresAt);

      toast({
        title: getText('\u053F\u0578\u0564\u0568 \u057D\u057F\u0565\u0572\u056E\u057E\u0565\u0581', '\u041A\u043E\u0434 \u0441\u043E\u0437\u0434\u0430\u043D', 'Code generated'),
        description: getText(
          `\u0553\u0578\u0572\u0561\u0576\u0581\u0565\u0584 Telegram \u0562\u0578\u057F\u056B\u0576\u055D /verify ${code}`,
          `\u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0431\u043E\u0442\u0443: /verify ${code}`,
          `Send to bot: /verify ${code}`
        ),
      });
    } catch (error) {
      console.error('Error generating verification code:', error);
      toast({
        title: getText('\u054D\u056D\u0561\u056C', '\u041E\u0448\u0438\u0431\u043A\u0430', 'Error'),
        description: getText(
          '\u0549\u0570\u0561\u057B\u0578\u0572\u057E\u0565\u0581 \u056F\u0578\u0564 \u057D\u057F\u0565\u0572\u056E\u0565\u056C',
          '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u043E\u0434',
          'Failed to generate code'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const copyVerificationCode = () => {
    if (verificationCode) {
      navigator.clipboard.writeText(`/verify ${verificationCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: {
            telegram_enabled: notificationsEnabled,
          },
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: getText('\u054A\u0561\u0570\u057A\u0561\u0576\u057E\u0565\u0581', '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E', 'Saved'),
      });
    } catch (error) {
      toast({
        title: getText('\u054D\u056D\u0561\u056C', '\u041E\u0448\u0438\u0431\u043A\u0430', 'Error'),
        description: getText('\u0549\u0570\u0561\u057B\u0578\u0572\u057E\u0565\u0581 \u057A\u0561\u0570\u0565\u056C', '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C', 'Failed to save'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!chatId) return;
    setIsTesting(true);

    try {
      const { error } = await supabase.functions.invoke('send-telegram-notification', {
        body: {
          chatId,
          message: getText(
            '\u0553\u0578\u0580\u0571\u0561\u0580\u056F\u0574\u0561\u0576 \u0570\u0561\u0572\u0578\u0580\u0564\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u055D LexAssistant-\u056B\u0581\u0589',
            '\u0422\u0435\u0441\u0442\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442 LexAssistant.',
            'Test notification from LexAssistant.'
          ),
        },
      });

      if (error) throw error;

      toast({
        title: getText('\u0540\u0561\u0572\u0578\u0580\u0564\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0578\u0582\u0572\u0561\u0580\u056F\u057E\u0565\u0581', '\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E', 'Message sent'),
      });
    } catch (error) {
      toast({
        title: getText('\u054D\u056D\u0561\u056C', '\u041E\u0448\u0438\u0431\u043A\u0430', 'Error'),
        description: getText('\u054D\u057F\u0578\u0582\u0563\u0565\u0584 Chat ID-\u0576', '\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 Chat ID', 'Check your Chat ID'),
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyBotLink = () => {
    navigator.clipboard.writeText(`https://t.me/${BOT_USERNAME.replace('@', '')}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const isLinked = !!chatId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          {getText('Telegram \u056F\u0561\u057A\u0561\u056F\u0581\u0578\u0582\u0574', '\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 Telegram', 'Telegram Settings')}
        </CardTitle>
        <CardDescription>
          {getText(
            '\u053F\u0561\u057A\u0565\u0584 \u0571\u0565\u0580 Telegram-\u0568 \u056E\u0561\u0576\u0578\u0582\u0581\u0578\u0582\u0574\u0576\u0565\u0580 \u057D\u057F\u0561\u0576\u0561\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580',
            '\u041F\u043E\u043B\u0443\u0447\u0430\u0439\u0442\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0445 \u0437\u0430\u0441\u0435\u0434\u0430\u043D\u0438\u044F\u0445 \u0438 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430\u0445 \u0432 Telegram',
            'Receive court hearing and deadline notifications via Telegram'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        {isLinked ? (
          <div className="rounded-lg border border-primary/50 bg-primary/10 p-4">
            <p className="text-sm font-medium text-primary flex items-center gap-2">
              <Check className="h-4 w-4" />
              {getText('\u0540\u0561\u0577\u056B\u057E\u0568 \u056F\u0561\u057A\u0561\u056F\u0581\u057E\u0561\u056E \u0567', '\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D', 'Account connected')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Chat ID: {chatId}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-4">
            <p className="text-sm font-medium">
              {getText('\u0540\u0580\u0561\u0570\u0561\u0576\u0563\u0576\u0565\u0580\u055D', '\u041A\u0430\u043A \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C:', 'How to connect:')}
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                {getText(
                  '\u0532\u0561\u0581\u0565\u0584 Telegram \u0562\u0578\u057F\u0568',
                  '\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u0430\u0448\u0435\u0433\u043E \u0431\u043E\u0442\u0430 \u0432 Telegram:',
                  'Open our bot in Telegram:'
                )}{' '}
                <Button
                  variant="link"
                  className="h-auto p-0 text-primary"
                  onClick={() => window.open(`https://t.me/${BOT_USERNAME.replace('@', '')}`, '_blank')}
                >
                  {BOT_USERNAME}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </li>
              <li>
                {getText(
                  '\u054D\u0565\u0572\u0574\u0565\u0584 "\u054D\u057F\u0561\u0576\u0561\u056C \u056F\u0578\u0564" \u056F\u0578\u0573\u0561\u056F\u0568',
                  '\u041D\u0430\u0436\u043C\u0438\u0442\u0435 "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043A\u043E\u0434" \u043D\u0438\u0436\u0435',
                  'Click "Get verification code" below'
                )}
              </li>
              <li>
                {getText(
                  '\u0548\u0582\u0572\u0561\u0580\u056F\u0565\u0584 \u056F\u0578\u0564\u0568 \u0562\u0578\u057F\u056B\u0576',
                  '\u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u043A\u043E\u0434 \u0431\u043E\u0442\u0443',
                  'Send the code to the bot'
                )}
              </li>
            </ol>
            
            <Button variant="outline" size="sm" onClick={copyBotLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {getText('\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C \u0570\u0572\u0578\u0582\u0574\u0568', '\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443', 'Copy bot link')}
            </Button>
          </div>
        )}

        {/* Verification Code Section */}
        {!isLinked && (
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              {getText('\u054D\u057F\u0578\u0582\u0563\u0574\u0561\u0576 \u056F\u0578\u0564', '\u041A\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F', 'Verification code')}
            </Label>
            
            {verificationCode && codeExpiresAt && codeExpiresAt > new Date() ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`/verify ${verificationCode}`}
                    className="font-mono text-center text-lg"
                  />
                  <Button variant="outline" onClick={copyVerificationCode}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getText(
                    `\u053F\u0578\u0564\u0568 \u0563\u0578\u0580\u056E\u0578\u0582\u0574 \u0567 ${VERIFICATION_CODE_EXPIRY_MINUTES} \u0580\u0578\u057A\u0565`,
                    `\u041A\u043E\u0434 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D ${VERIFICATION_CODE_EXPIRY_MINUTES} \u043C\u0438\u043D\u0443\u0442`,
                    `Code valid for ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes`
                  )}
                </p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleGenerateCode}
                  disabled={isGeneratingCode}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isGeneratingCode ? 'animate-spin' : ''}`} />
                  {getText('\u0546\u0578\u0580 \u056F\u0578\u0564', '\u041D\u043E\u0432\u044B\u0439 \u043A\u043E\u0434', 'New code')}
                </Button>
              </div>
            ) : (
              <Button onClick={handleGenerateCode} disabled={isGeneratingCode}>
                {isGeneratingCode ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Key className="h-4 w-4 mr-2" />
                )}
                {getText('\u054D\u057F\u0561\u0576\u0561\u056C \u056F\u0578\u0564', '\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043A\u043E\u0434', 'Get verification code')}
              </Button>
            )}
          </div>
        )}

        {/* Test Connection (only when linked) */}
        {isLinked && (
          <div className="space-y-2">
            <Label>{getText('\u054D\u057F\u0578\u0582\u0563\u0565\u056C \u056F\u0561\u057A\u0568', '\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0432\u044F\u0437\u044C', 'Test connection')}</Label>
            <Button variant="outline" onClick={handleTest} disabled={isTesting}>
              {isTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {getText('\u0548\u0582\u0572\u0561\u0580\u056F\u0565\u056C \u0569\u0565\u057D\u057F', '\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0442\u0435\u0441\u0442', 'Send test')}
            </Button>
          </div>
        )}

        {/* Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {getText('\u053E\u0561\u0576\u0578\u0582\u0581\u0578\u0582\u0574\u0576\u0565\u0580', '\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F', 'Notifications')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {getText(
                '\u053F\u0561\u057A\u0565\u0584\u055D \u056E\u0561\u0576\u0578\u0582\u0581\u0578\u0582\u0574\u0576\u0565\u0580',
                '\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E \u043F\u0440\u0435\u0434\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u0441\u043E\u0431\u044B\u0442\u0438\u044F\u0445',
                'Receive notifications about upcoming events'
              )}
            </p>
          </div>
          <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              {getText('\u0549\u0565\u0572\u0561\u0580\u056F\u0565\u056C', '\u041E\u0442\u043C\u0435\u043D\u0430', 'Cancel')}
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {getText('\u054A\u0561\u0570\u0565\u056C', '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C', 'Save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
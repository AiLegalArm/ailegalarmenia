import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Eye, EyeOff, Copy, KeyRound } from 'lucide-react';

interface ResetPasswordDialogProps {
  user: { id: string; username: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ username: string; password: string } | null>(null);

  const resetPassword = useMutation({
    mutationFn: async (data: { user_id: string; new_password: string }) => {
      const response = await supabase.functions.invoke('admin-reset-password', {
        body: data,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to reset password');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Пароль изменён' });
      setSuccessInfo({ 
        username: user?.username || '', 
        password: newPassword 
      });
    },
    onError: (error) => {
      toast({
        title: '\u041E\u0448\u0438\u0431\u043A\u0430',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!user || !newPassword) return;
    if (newPassword.length < 6) {
      toast({ title: '\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043C\u0438\u043D\u0438\u043C\u0443\u043C 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432', variant: 'destructive' });
      return;
    }
    resetPassword.mutate({
      user_id: user.id,
      new_password: newPassword,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: '\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E' });
  };

  const handleClose = () => {
    onOpenChange(false);
    setSuccessInfo(null);
    setNewPassword(generatePassword());
  };

  if (successInfo) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <KeyRound className="h-5 w-5" />
              Пароль изменён
            </DialogTitle>
            <DialogDescription>
              Сохраните данные и передайте пользователю
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Логин</p>
                  <p className="font-mono font-medium">{successInfo.username}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(successInfo.username)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Новый пароль</p>
                  <p className="font-mono font-medium">{successInfo.password}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(successInfo.password)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => copyToClipboard(`Логин: ${successInfo.username}\nНовый пароль: ${successInfo.password}`)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Копировать всё
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Сбросить пароль
          </DialogTitle>
          <DialogDescription>
            Установите новый пароль для <strong>@{user?.username}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Новый пароль *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewPassword(generatePassword())}
              >
                Генерировать
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Минимум 6 символов</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={resetPassword.isPending}>
            {resetPassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сбросить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

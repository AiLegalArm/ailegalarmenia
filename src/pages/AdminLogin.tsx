import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { getLoginEmailCandidates } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Shield, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

type LoginValues = z.infer<typeof loginSchema>;

const AdminLogin = () => {
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const navigate = useNavigate();
  const { signIn, signOut, isAdmin, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (user && isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [user, isAdmin, authLoading, navigate]);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const handleLogin = async (values: LoginValues) => {
    setIsLoading(true);

    try {
      const emailCandidates = getLoginEmailCandidates(values.username);
      let signedIn = false;
      let lastError: Error | null = null;

      for (const email of emailCandidates) {
        try {
          await signIn(email, values.password);
          signedIn = true;
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
        }
      }

      if (!signedIn) {
        throw lastError ?? new Error(t('invalid_credentials', 'Invalid username or password'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isConnectionIssue = /load failed|failed to fetch|network|timeout|connection terminated/i.test(message);

      toast({
        title: t('errors:login_failed', 'Login failed'),
        description: isConnectionIssue
          ? `${t('errors:connection_lost', 'Connection lost')}. ${t('errors:try_again', 'Try again')}`
          : t('invalid_credentials', 'Invalid username or password'),
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    if (!isAdmin) {
      const handleUnauthorizedAdminLogin = async () => {
        try {
          await signOut();
        } catch (error) {
          console.error('Failed to sign out non-admin user from admin flow', error);
        } finally {
          toast({
            title: t('errors:access_denied', 'Access denied'),
            description: t('errors:admin_access_required', 'Administrator access is required to use the admin panel.'),
            variant: 'destructive',
          });
          setIsLoading(false);
        }
      };

      void handleUnauthorizedAdminLogin();
    }
  }, [authLoading, isAdmin, signOut, t, toast, user]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Ադմին պանել</CardTitle>
          <CardDescription>Միայն ադմինիստրատորների համար</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('username')}</FormLabel>
                    <FormControl>
                      <Input type="text" autoComplete="username" placeholder="admin" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('password')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Մուտք
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Սա պաշտպանված տարածք է։ Չթույլատրված մուտքը արգելվում է։
      </p>
    </div>
  );
};

export default AdminLogin;

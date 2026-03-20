import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseStorageKey } from '@/lib/supabase-storage-key';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Scale, Loader2 } from 'lucide-react';
import logo from '@/assets/logo.png';

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

type LoginValues = z.infer<typeof loginSchema>;

const Login = () => {
  const { t } = useTranslation(['auth', 'common', 'disclaimer', 'errors']);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const normalizeUsername = useMemo(
    () => (raw: string) => raw.trim().replace(/^@+/, '').toLowerCase(),
    []
  );

  const handleLogin = async (values: LoginValues) => {
    setIsLoading(true);
    try {
      const rawUsername = values.username.trim().replace(/^@+/, '');
      const username = normalizeUsername(values.username);
      const internalEmail = `${username}@app.internal`;
      
      await signIn(internalEmail, values.password);
      
      if (!rememberMe) {
        const sessionKey = getSupabaseStorageKey();
        const sessionData = localStorage.getItem(sessionKey);
        if (sessionData) {
          sessionStorage.setItem(sessionKey, sessionData);
          localStorage.removeItem(sessionKey);
        }
      }
      
      navigate('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isConnectionIssue = /load failed|failed to fetch|network|timeout|connection terminated/i.test(message);

      toast({
        title: t('errors:login_failed', 'Login failed'),
        description: isConnectionIssue
          ? `${t('errors:connection_lost', 'Connection lost')}. ${t('errors:try_again', 'Try again')}`
          : t('invalid_credentials', 'Invalid username or password'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background overflow-hidden">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/6 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-accent/20 blur-3xl" />
      </div>

      {/* Skip link */}
      <a 
        href="#auth-form" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded"
      >
        {t('skip_to_form', 'Skip to login form')}
      </a>

      {/* Header */}
      <header className="relative border-b border-border/50 bg-card/80 backdrop-blur-xl" role="banner">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="h-8 w-8 object-contain" />
            <h1 className="text-lg font-bold tracking-tight">{t('common:app_name')}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content */}
      <main 
        id="main-content" 
        className="relative container mx-auto flex flex-1 items-center justify-center px-4 py-12"
        role="main"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <Card className="border-border/60 bg-card/90 backdrop-blur-sm shadow-elevated" id="auth-form">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 inline-flex rounded-2xl bg-primary/10 p-3">
                <Scale className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="text-2xl">{t('welcome', 'Welcome')}</CardTitle>
              <CardDescription className="text-base">
                {t('auth_description', 'Sign in to access your legal cases')}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Form {...loginForm}>
                <form 
                  onSubmit={loginForm.handleSubmit(handleLogin)} 
                  className="space-y-5"
                  aria-label={t('login_form', 'Login form')}
                >
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('username', 'Username')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="text" 
                            autoComplete="username"
                            placeholder={t('username_placeholder', 'Enter your username')}
                            aria-describedby="login-username-error"
                            onChange={(e) => field.onChange(e.target.value)}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage id="login-username-error" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('password')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            autoComplete="current-password"
                            aria-describedby="login-password-error"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage id="login-password-error" />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="remember-me"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <label 
                      htmlFor="remember-me" 
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {t('remember_me')}
                    </label>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full rounded-xl h-12 text-base shadow-lg shadow-primary/20" 
                    disabled={isLoading}
                    aria-busy={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {t('login')}
                  </Button>

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t('contact_admin', 'Contact administrator for account access')}
                    </p>
                    <a 
                      href="tel:+37410123456" 
                      className="text-primary hover:underline flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <span>📞</span> +374 10 123 456
                    </a>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-border/50 py-4" role="contentinfo">
        <div className="container mx-auto px-4">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3" role="alert">
            <p className="text-center text-xs text-muted-foreground">
              ⚠️ {t('disclaimer:main')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Login;

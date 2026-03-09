import { lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCase } from '@/hooks/useCases';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const AudioTranscriptionList = lazy(() =>
  import('@/components/audio/AudioTranscriptionList').then((m) => ({
    default: m.AudioTranscriptionList,
  }))
);

export default function CaseTranscriptions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['audio', 'common', 'cases']);
  const { data: caseData, isLoading: caseLoading } = useCase(id);
  const { user, signOut } = useAuth();

  if (caseLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">{t('common:loading')}</span>
      </div>
    );
  }

  if (!id || !caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {t('cases:case_not_found', 'Case not found')}
          </h1>
          <Button onClick={() => navigate('/dashboard')}>
            {t('common:go_to_dashboard', 'Go to Dashboard')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-primary focus:text-primary-foreground"
      >
        {t('common:skip_to_content', 'Skip to main content')}
      </a>

      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/cases/${id}`)}
              aria-label={t('audio:back_to_case')}
              className="shrink-0 px-2 sm:px-3"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('audio:back_to_case')}</span>
            </Button>
            <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
              {t('audio:audio_title')}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
            <LanguageSwitcher />
            {user && (
              <Button variant="outline" size="sm" onClick={() => signOut()} className="shrink-0">
                {t('common:logout', 'Logout')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="container mx-auto px-4 py-4 sm:py-6 max-w-full">
        <div className="mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground break-words">
            {caseData.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('cases:case_number', 'Case')}: {caseData.case_number || id.slice(0, 8)}
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <AudioTranscriptionList caseId={id} />
        </Suspense>
      </main>

      {/* Legal Disclaimer */}
      <footer className="border-t bg-muted/30 mt-8">
        <div className="container mx-auto px-4 py-4">
          <p className="text-xs text-muted-foreground text-center">
            {t('disclaimer:ai_warning')}
          </p>
        </div>
      </footer>
    </div>
  );
}

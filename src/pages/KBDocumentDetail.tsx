import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKBDocument } from '@/hooks/useKnowledgeBase';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { KBVersionHistory } from '@/components/kb/KBVersionHistory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { 
  Scale, 
  ArrowLeft, 
  Calendar,
  FileText,
  ExternalLink,
  Loader2,
  LogOut,
  History,
  BookOpen
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type KbCategory = Database['public']['Enums']['kb_category'];

const categoryColors: Partial<Record<KbCategory, string>> = {
  constitution: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  civil_code: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  criminal_code: 'bg-red-500/10 text-red-700 dark:text-red-400',
  labor_code: 'bg-green-500/10 text-green-700 dark:text-green-400',
  family_code: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  administrative_code: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  tax_code: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  court_practice: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  legal_commentary: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  other: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
};

const getCategoryColor = (category: KbCategory): string => {
  return categoryColors[category] || 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
};

const KBDocumentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['kb', 'common', 'disclaimer']);
  const { user, signOut, isAdmin } = useAuth();
  
  const { data: document, isLoading } = useKBDocument(id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">{t('no_results')}</p>
        <Button className="mt-4" onClick={() => navigate('/kb')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                {user.email}
              </span>
            )}
            <LanguageSwitcher />
            {user && (
              <Button variant="ghost" size="icon" onClick={() => signOut()}>
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Back Button */}
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/kb')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('knowledge_base')}
        </Button>

        {/* Document Header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={getCategoryColor(document.category)}>
              {t(`category_${document.category}`)}
            </Badge>
            {document.article_number && (
              <Badge variant="outline">{document.article_number}</Badge>
            )}
          </div>
          <h2 className="mt-3 text-2xl font-bold">{document.title}</h2>
        </div>

        {/* Content & Sidebar */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="content" className="w-full">
              <TabsList>
                <TabsTrigger value="content">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t('document_content')}
                </TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="history">
                    <History className="mr-2 h-4 w-4" />
                    {t('common:history', 'History')}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="content" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {document.content_text}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {isAdmin && (
                <TabsContent value="history" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('common:version_history', 'Version History')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <KBVersionHistory kbId={document.id} />
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('common:information', 'Information')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {document.source_name && (
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('source_name')}</p>
                      <p className="text-sm">{document.source_name}</p>
                    </div>
                  </div>
                )}
                {document.version_date && (
                  <div className="flex items-start gap-2">
                    <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('version_date')}</p>
                      <p className="text-sm">{format(new Date(document.version_date), 'dd.MM.yyyy')}</p>
                    </div>
                  </div>
                )}
                {document.source_url && (
                  <div className="flex items-start gap-2">
                    <ExternalLink className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('source_url')}</p>
                      <a 
                        href={document.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {t('common:open_link', 'Open Link')}
                      </a>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{t('common:updated_at', 'Updated')}</p>
                  <p className="text-sm">{format(new Date(document.updated_at), 'dd.MM.yyyy HH:mm')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            ⚠️ {t('disclaimer:main')}
          </p>
        </div>
      </main>
    </div>
  );
};

export default KBDocumentDetail;

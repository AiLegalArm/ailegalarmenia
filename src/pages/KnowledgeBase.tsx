import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { KBSearchFilters } from '@/components/kb/KBSearchFilters';
import { allowedCategories } from '@/components/kb/kbCategories';
import { KBCategoryFolder } from '@/components/kb/KBCategoryFolder';
import { KBDocumentCard } from '@/components/kb/KBDocumentCard';
import { KBDocumentForm } from '@/components/kb/KBDocumentForm';
import { KBPdfUpload } from '@/components/kb/KBPdfUpload';
import { KBBulkImport } from '@/components/kb/KBBulkImport';
import { KBMultiFileUpload } from '@/components/kb/KBMultiFileUpload';
import { KBSearchPanel } from '@/components/kb/KBSearchPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKBCategoryCounts } from '@/hooks/useKBCategoryCounts';
import { useKnowledgeBase, type KBFilters } from '@/hooks/useKnowledgeBase';
import { useAuth } from '@/hooks/useAuth';
import { 
  Scale, 
  Loader2,
  LogOut,
  BookOpen,
  ArrowLeft,
  Gavel,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];

const KnowledgeBasePage = () => {
  const { t } = useTranslation(['kb', 'common', 'disclaimer']);
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  
  const [filters, setFilters] = useState<KBFilters>({ page: 1, pageSize: 200 });
  const [formOpen, setFormOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [multiFileUploadOpen, setMultiFileUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeBase | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const { data: categoryCounts, isLoading: isCountsLoading } = useKBCategoryCounts();

  // Search results (only used when searching)
  const { 
    documents: searchResults, 
    isLoading: isSearching, 
    createDocument, 
    updateDocument, 
    deleteDocument 
  } = useKnowledgeBase(filters);

  const isSearchMode = !!filters.search && filters.search.length >= 2;

  // Sort categories by translated label
  const sortedCategories = useMemo(() => {
    return [...allowedCategories].sort((a, b) => {
      const labelA = t(`category_${a}`, a);
      const labelB = t(`category_${b}`, b);
      return labelA.localeCompare(labelB);
    });
  }, [t]);

  // Total document count
  const totalDocs = useMemo(() => {
    if (!categoryCounts) return 0;
    let sum = 0;
    categoryCounts.forEach((v) => { sum += v; });
    return sum;
  }, [categoryCounts]);

  const handleCreate = (data: Database['public']['Tables']['knowledge_base']['Insert']) => {
    createDocument.mutate(data, {
      onSuccess: () => {
        setFormOpen(false);
        setPdfUploadOpen(false);
      },
    });
  };

  const handlePdfImport = (data: {
    title: string;
    content_text: string;
    category: Database['public']['Enums']['kb_category'];
    source_name: string;
  }) => {
    createDocument.mutate(data, {
      onSuccess: () => setPdfUploadOpen(false),
    });
  };

  const handleUpdate = (data: Database['public']['Tables']['knowledge_base']['Update']) => {
    if (editingDoc) {
      updateDocument.mutate(
        { id: editingDoc.id, updates: data },
        { onSuccess: () => setEditingDoc(null) }
      );
    }
  };

  const handleDeleteConfirm = () => {
    if (deletingDocId) {
      deleteDocument.mutate(deletingDocId);
      setDeletingDocId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold hidden sm:block">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:block truncate max-w-[120px]">
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
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Back')}
        </Button>

        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">{t('knowledge_base')}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('common:legal_documents', 'Legal documents and articles')}
                  {totalDocs > 0 && ` \u2014 ${totalDocs}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs: Legislation + Judicial Practice */}
        <Tabs defaultValue="legislation" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="legislation" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              {t('tab_legislation', '\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576')}
            </TabsTrigger>
            <TabsTrigger value="practice" className="gap-1.5">
              <Gavel className="h-4 w-4" />
              {t('tab_practice', '\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561')}
            </TabsTrigger>
          </TabsList>

          {/* Legislation Tab */}
          <TabsContent value="legislation">
            {/* Search & Filters */}
            <div className="mb-6">
              <KBSearchFilters filters={filters} onFiltersChange={setFilters} />
            </div>

            {isSearchMode ? (
              /* Search Results */
              isSearching ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                  <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-lg font-medium text-muted-foreground">
                    {t('no_results')}
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {t('results_found', { count: searchResults.length })}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {searchResults.map((doc) => (
                      <KBDocumentCard
                        key={doc.id}
                        document={doc}
                        onView={(id) => navigate(`/kb/${id}`)}
                        isAdmin={isAdmin}
                        rank={'relevancePct' in doc ? (doc.relevancePct as number) : 'rank' in doc ? (doc.rank as number) : undefined}
                        searchQuery={filters.search}
                      />
                    ))}
                  </div>
                </>
              )
            ) : (
              /* Category Folders */
              isCountsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedCategories.map((cat) => {
                    const count = categoryCounts?.get(cat) || 0;
                    return (
                      <KBCategoryFolder
                        key={cat}
                        categoryKey={cat}
                        count={count}
                        isAdmin={isAdmin}
                        onEdit={(doc) => setEditingDoc(doc)}
                        onDelete={(id) => setDeletingDocId(id)}
                      />
                    );
                  })}
                </div>
              )
            )}
          </TabsContent>

          {/* Judicial Practice Tab */}
          <TabsContent value="practice">
            <KBSearchPanel />
          </TabsContent>
        </Tabs>

        {/* Legal Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400">
            {'\u26A0\uFE0F'} {t('disclaimer:main')}
          </p>
        </div>
      </main>

      {/* Create/Edit Form */}
      <KBDocumentForm
        open={formOpen || !!editingDoc}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingDoc(null);
          }
        }}
        onSubmit={editingDoc ? handleUpdate : handleCreate}
        initialData={editingDoc}
        isLoading={createDocument.isPending || updateDocument.isPending}
      />

      {/* PDF Upload */}
      <KBPdfUpload
        open={pdfUploadOpen}
        onOpenChange={setPdfUploadOpen}
        onSuccess={handlePdfImport}
      />

      {/* Bulk Import (TXT) */}
      <KBBulkImport
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onSuccess={() => {
          setBulkImportOpen(false);
          setFilters({ ...filters });
        }}
      />

      {/* Multi-File Upload (Bulk PDF/Images) */}
      <KBMultiFileUpload
        open={multiFileUploadOpen}
        onOpenChange={setMultiFileUploadOpen}
        onSuccess={() => {
          setMultiFileUploadOpen(false);
          setFilters({ ...filters });
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDocId} onOpenChange={() => setDeletingDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_document')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm_delete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t('common:delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default KnowledgeBasePage;

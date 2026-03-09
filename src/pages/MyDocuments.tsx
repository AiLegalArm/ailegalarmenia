import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getText } from '@/lib/i18n-utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Scale,
  ArrowLeft,
  FileText,
  Edit,
  Trash2,
  Download,
  Loader2,
  Search,
  Calendar,
  Save,
  X,
  LogOut,
  FolderOpen,
  Settings,
} from 'lucide-react';
import { exportDocumentToPDF } from '@/lib/pdfExportDocument';
import { SendToTelegramButton } from '@/components/documents/SendToTelegramButton';
import { TelegramSettings } from '@/components/profile/TelegramSettings';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface GeneratedDocument {
  id: string;
  title: string;
  content_text: string;
  status: string;
  case_id: string | null;
  template_id: string | null;
  recipient_name: string | null;
  recipient_organization: string | null;
  sender_name: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
}

const MyDocuments = () => {
  const { t, i18n } = useTranslation(['common', 'cases']);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut, loading: authLoading } = useAuth();
  
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<GeneratedDocument | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      fetchDocuments();
    } else if (!authLoading && !user) {
      setIsLoading(false);
    }
  }, [user, authLoading]);

  const fetchDocuments = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: unknown) {
      console.error('Error fetching documents:', error);
      toast({
        title: t('common:error'),
        description: t('cases:loading_error'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDocument = (doc: GeneratedDocument) => {
    setSelectedDocument(doc);
    setEditedContent(doc.content_text);
    setEditedTitle(doc.title);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!selectedDocument) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('generated_documents')
        .update({
          title: editedTitle,
          content_text: editedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedDocument.id);

      if (error) throw error;

      // Update local state
      setDocuments(docs =>
        docs.map(d =>
          d.id === selectedDocument.id
            ? { ...d, title: editedTitle, content_text: editedContent, updated_at: new Date().toISOString() }
            : d
        )
      );
      setSelectedDocument({ ...selectedDocument, title: editedTitle, content_text: editedContent });
      setIsEditing(false);

      toast({
        title: t('cases:document_saved'),
        description: t('cases:changes_saved_successfully'),
      });
    } catch (error: unknown) {
      console.error('Save error:', error);
      toast({
        title: t('common:error'),
        description: t('cases:save_error'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const { error } = await supabase
        .from('generated_documents')
        .delete()
        .eq('id', deletingId);

      if (error) throw error;

      setDocuments(docs => docs.filter(d => d.id !== deletingId));
      if (selectedDocument?.id === deletingId) {
        setSelectedDocument(null);
      }
      setDeletingId(null);

      toast({
        title: t('cases:document_deleted'),
        description: t('cases:document_deleted_success'),
      });
    } catch (error: unknown) {
      console.error('Delete error:', error);
      toast({
        title: t('common:error'),
        description: t('cases:delete_error'),
        variant: 'destructive',
      });
    }
  };

  const handleExportPDF = async (doc: GeneratedDocument) => {
    setIsExporting(true);
    try {
      await exportDocumentToPDF({
        title: doc.title,
        content: doc.content_text,
        recipientName: doc.recipient_name || undefined,
        recipientOrganization: doc.recipient_organization || undefined,
        senderName: doc.sender_name || undefined,
        createdAt: new Date(doc.created_at),
        language: i18n.language as 'hy' | 'ru' | 'en',
      });
      
      toast({
        title: t('cases:export_success'),
        description: t('cases:pdf_exported_success'),
      });
    } catch (error: unknown) {
      console.error('Export error:', error);
      toast({
        title: t('common:error'),
        description: t('cases:export_error'),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language === 'hy' ? 'hy-AM' : i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'final': return 'default';
      case 'sent': return 'outline';
      default: return 'secondary';
    }
  };

  // Using centralized getText from @/lib/i18n-utils

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Telegram Settings */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Telegram</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <TelegramSettings />
                </div>
              </SheetContent>
            </Sheet>
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {getText('\u053b\u0574 \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580\u0568', '\u041c\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'My Documents')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {getText(
              '\u054a\u0561\u0570\u057a\u0561\u0576\u057e\u0561\u056e \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580 \u0587 AI \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u056b\u0561\u0576\u0565\u0580',
              '\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u0438 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 AI',
              'Saved documents and AI generations'
            )}
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={getText('\u0548\u0580\u0578\u0576\u0565\u056c...', '\u041f\u043e\u0438\u0441\u043a...', 'Search...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Documents Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              {searchQuery
                ? getText('\u0553\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580 \u0579\u0565\u0576 \u0563\u057f\u0576\u057e\u0565\u056c', '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b', 'No documents found')
                : getText('\u0534\u0565\u057c \u057a\u0561\u0570\u057a\u0561\u0576\u057e\u0561\u056e \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580 \u0579\u056f\u0561\u0576', '\u0423 \u0432\u0430\u0441 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0445 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432', 'You have no saved documents yet')
              }
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {getText(
                '\u054d\u057f\u0565\u0572\u056e\u0565\u0584 \u0583\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569 \u0563\u0565\u0576\u0565\u0580\u0561\u057f\u0578\u0580\u0578\u057e',
                '\u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0447\u0435\u0440\u0435\u0437 \u0433\u0435\u043d\u0435\u0440\u0430\u0442\u043e\u0440 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432',
                'Create a document using the document generator'
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden" onClick={() => handleOpenDocument(doc)}>
                <CardHeader className="pb-2 min-w-0">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <CardTitle className="text-base line-clamp-2 break-words min-w-0">{doc.title}</CardTitle>
                    <Badge variant={getStatusColor(doc.status)} className="shrink-0">{doc.status}</Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span className="truncate">{formatDate(doc.created_at)}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                  <p className="text-sm text-muted-foreground line-clamp-3 break-words">
                    {doc.content_text.substring(0, 150)}...
                  </p>
                </CardContent>
                <CardFooter className="pt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDocument(doc);
                      setIsEditing(true);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1 shrink-0" />
                    <span className="truncate">{t('common:edit')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportPDF(doc);
                    }}
                    disabled={isExporting}
                  >
                    <Download className="h-4 w-4 mr-1 shrink-0" />
                    PDF
                  </Button>
                  <div onClick={(e) => e.stopPropagation()}>
                    <SendToTelegramButton
                      documentTitle={doc.title}
                      documentContent={doc.content_text}
                      size="sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(doc.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Document Editor Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] p-4 sm:p-6">
          <DialogHeader className="min-w-0">
            {isEditing ? (
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="text-base sm:text-lg font-semibold"
              />
            ) : (
              <DialogTitle className="text-base sm:text-xl break-words">{selectedDocument?.title}</DialogTitle>
            )}
          </DialogHeader>
          
          <ScrollArea className="h-[60vh]">
            {isEditing ? (
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[55vh] font-serif text-sm leading-relaxed"
              />
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                  {selectedDocument?.content_text}
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  <X className="h-4 w-4 mr-2" />
                  {t('common:cancel')}
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {t('common:save')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  {t('common:edit')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => selectedDocument && handleExportPDF(selectedDocument)}
                  disabled={isExporting}
                >
                  {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {getText('\u0531\u0580\u057f\u0561\u0570\u0561\u0576\u0565\u056c PDF', '\u042d\u043a\u0441\u043f\u043e\u0440\u0442 PDF', 'Export PDF')}
                </Button>
                {selectedDocument && (
                  <SendToTelegramButton
                    documentTitle={selectedDocument.title}
                    documentContent={selectedDocument.content_text}
                    variant="outline"
                  />
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {getText('\u054b\u0576\u057b\u0565\u055e\u056c \u0583\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569\u0568', '\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442?', 'Delete document?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {getText(
                '\u0531\u0575\u057d \u0563\u0578\u0580\u056e\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0570\u0576\u0561\u0580\u0561\u057e\u0578\u0580 \u0579\u0567 \u0570\u0565\u057f \u057e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c\u0589',
                '\u042d\u0442\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043c\u0435\u043d\u0438\u0442\u044c. \u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043b\u0451\u043d \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430.',
                'This action cannot be undone. The document will be permanently deleted.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MyDocuments;

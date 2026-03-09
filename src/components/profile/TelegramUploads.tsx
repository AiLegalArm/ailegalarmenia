import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { getText } from '@/lib/i18n-utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FileText, Image, Download, Trash2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface TelegramUpload {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string;
}

export const TelegramUploads = () => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Using centralized getText from @/lib/i18n-utils

  const { data: uploads, isLoading } = useQuery({
    queryKey: ['telegram-uploads', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await (supabase as any)
        .from('telegram_uploads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TelegramUpload[];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (upload: TelegramUpload) => {
      const { error: storageError } = await supabase.storage
        .from('telegram-uploads')
        .remove([upload.storage_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await (supabase as any)
        .from('telegram_uploads')
        .delete()
        .eq('id', upload.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-uploads'] });
      toast({
        title: getText('\u0556\u0561\u0575\u056C\u0568 \u057B\u0576\u057B\u057E\u0565\u0581', '\u0424\u0430\u0439\u043B \u0443\u0434\u0430\u043B\u0451\u043D', 'File deleted'),
      });
    },
    onError: () => {
      toast({
        title: getText('\u054D\u056D\u0561\u056C', '\u041E\u0448\u0438\u0431\u043A\u0430', 'Error'),
        description: getText('\u0549\u0570\u0561\u057B\u0578\u0572\u057E\u0565\u0581 \u057B\u0576\u057B\u0565\u056C \u0586\u0561\u0575\u056C\u0568', '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B', 'Failed to delete file'),
        variant: 'destructive',
      });
    },
  });

  const downloadFile = async (upload: TelegramUpload) => {
    try {
      const { data, error } = await supabase.storage
        .from('telegram-uploads')
        .createSignedUrl(upload.storage_path, 3600);

      if (error) throw error;

      window.open(data.signedUrl, '_blank');
    } catch (error) {
      toast({
        title: getText('\u054D\u056D\u0561\u056C', '\u041E\u0448\u0438\u0431\u043A\u0430', 'Error'),
        description: getText('\u0549\u0570\u0561\u057B\u0578\u0572\u057E\u0565\u0581 \u0576\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u056C \u0586\u0561\u0575\u056C\u0568', '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0444\u0430\u0439\u043B', 'Failed to download file'),
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string | null) => {
    if (mimeType?.startsWith('image/')) {
      return <Image className="h-5 w-5 text-primary" />;
    }
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!uploads || uploads.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{getText('\u0532\u0565\u057C\u0576\u057E\u0561\u056E \u0586\u0561\u0575\u056C\u0565\u0580 \u0579\u056F\u0561\u0576', '\u041D\u0435\u0442 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0444\u0430\u0439\u043B\u043E\u0432', 'No uploaded files')}</p>
          <p className="text-sm mt-2">
            {getText(
              '\u0548\u0582\u0572\u0561\u0580\u056F\u0565\u0584 \u0586\u0561\u0575\u056C Telegram \u0562\u0578\u057F\u056B\u0576',
              '\u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0444\u0430\u0439\u043B \u0431\u043E\u0442\u0443 \u0432 Telegram',
              'Send a file to the Telegram bot'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {uploads.map((upload) => (
        <Card key={upload.id} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {getFileIcon(upload.file_type)}
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{upload.original_filename}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatFileSize(upload.file_size)}</span>
                  <span>•</span>
                  <span>{format(new Date(upload.created_at), 'dd.MM.yyyy HH:mm')}</span>
                </div>
                {upload.caption && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {upload.caption}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => downloadFile(upload)}
                  title={getText('\u0546\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u056C', '\u0421\u043A\u0430\u0447\u0430\u0442\u044C', 'Download')}
                >
                  <Download className="h-4 w-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      title={getText('\u054B\u0576\u057B\u0565\u056C', '\u0423\u0434\u0430\u043B\u0438\u0442\u044C', 'Delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {getText('\u054B\u0576\u057B\u0565\u055E\u056C \u0586\u0561\u0575\u056C\u0568\u055E', '\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B?', 'Delete file?')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {getText(
                          '\u0556\u0561\u0575\u056C\u0568 \u056F\u057B\u0576\u057B\u057E\u056B \u0561\u0576\u057E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0565\u056C\u056B\u0578\u0580\u0565\u0576\u0589',
                          '\u0424\u0430\u0439\u043B \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043B\u0451\u043D \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E.',
                          'The file will be permanently deleted.'
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {getText('\u0549\u0565\u0572\u0561\u0580\u056F\u0565\u056C', '\u041E\u0442\u043C\u0435\u043D\u0430', 'Cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(upload)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {getText('\u054B\u0576\u057B\u0565\u056C', '\u0423\u0434\u0430\u043B\u0438\u0442\u044C', 'Delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

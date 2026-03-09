import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];
type KnowledgeBaseInsert = Database['public']['Tables']['knowledge_base']['Insert'];

const kbFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(500),
  content_text: z.string().min(10, 'Content must be at least 10 characters'),
  category: z.string(),
  article_number: z.string().max(50).optional(),
  source_name: z.string().max(200).optional(),
  source_url: z.string().url().optional().or(z.literal('')),
  version_date: z.string().optional(),
});

type KBFormValues = z.infer<typeof kbFormSchema>;

interface KBDocumentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: KnowledgeBaseInsert) => void;
  initialData?: KnowledgeBase | null;
  isLoading?: boolean;
}

const categories = kbCategoryOptions;

export function KBDocumentForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialData,
  isLoading 
}: KBDocumentFormProps) {
  const { t } = useTranslation(['kb', 'common']);

  const form = useForm<KBFormValues>({
    resolver: zodResolver(kbFormSchema),
    defaultValues: {
      title: '',
      content_text: '',
      category: 'other',
      article_number: '',
      source_name: '',
      source_url: '',
      version_date: '',
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        title: initialData.title,
        content_text: initialData.content_text,
        category: initialData.category,
        article_number: initialData.article_number || '',
        source_name: initialData.source_name || '',
        source_url: initialData.source_url || '',
        version_date: initialData.version_date 
          ? new Date(initialData.version_date).toISOString().split('T')[0] 
          : '',
      });
    } else {
      form.reset({
        title: '',
        content_text: '',
        category: 'other',
        article_number: '',
        source_name: '',
        source_url: '',
        version_date: '',
      });
    }
  }, [initialData, form]);

  const handleSubmit = (values: KBFormValues) => {
    onSubmit({
      title: values.title,
      content_text: values.content_text,
      category: values.category as KbCategory,
      article_number: values.article_number || null,
      source_name: values.source_name || null,
      source_url: values.source_url || null,
      version_date: values.version_date || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>
            {initialData ? t('edit_document') : t('add_document')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('document_title')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="RA Civil Code Article 1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('categories')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {t(cat.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="article_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('article_number')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="15" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="content_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('document_content')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={10} className="font-mono text-sm" />
                  </FormControl>
                  <FormDescription>
                    {field.value.length} characters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="source_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('source_name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="RA National Assembly" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="version_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('version_date')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('source_url')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://..." type="url" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common:save')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

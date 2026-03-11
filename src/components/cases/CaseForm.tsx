import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { CaseFormFileUpload } from './CaseFormFileUpload';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CalendarIcon, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type Case = Database['public']['Tables']['cases']['Row'];
type CaseInsert = Database['public']['Tables']['cases']['Insert'];

// Stage definitions - unified for all case types as per requirements
const CASE_STAGES = [
  { value: 'preliminary', label: 'stage_1' },
  { value: 'first_instance', label: 'stage_2' },
  { value: 'appeal', label: 'stage_3' },
  { value: 'cassation', label: 'stage_4' },
  { value: 'echr', label: 'stage_echr' },
] as const;

// =============================================================================
// PARTY ROLE DEFINITIONS BY PROCEDURE TYPE
// =============================================================================

// Civil procedure roles
const CIVIL_PARTY_ROLES = [
  { value: 'claimant', labelKey: 'party_role_claimant' },
  { value: 'defendant', labelKey: 'party_role_defendant' },
  { value: 'third_party', labelKey: 'party_role_third_party' },
] as const;

// Administrative procedure roles
const ADMINISTRATIVE_PARTY_ROLES = [
  { value: 'applicant', labelKey: 'party_role_applicant' },
  { value: 'administrative_body', labelKey: 'party_role_administrative_body' },
  { value: 'interested_party', labelKey: 'party_role_interested_party' },
] as const;

// Criminal procedure roles
const CRIMINAL_PARTY_ROLES = [
  { value: 'defendant', labelKey: 'party_role_criminal_defendant' },
  { value: 'defense', labelKey: 'party_role_defense' },
  { value: 'prosecutor', labelKey: 'party_role_prosecutor' },
  { value: 'victim', labelKey: 'party_role_victim' },
] as const;

// ECHR procedure roles
const ECHR_PARTY_ROLES = [
  { value: 'applicant', labelKey: 'party_role_echr_applicant' },
  { value: 'government', labelKey: 'party_role_echr_government' },
] as const;

// Helper to get party roles based on case type
function getPartyRolesForCaseType(caseType: string) {
  switch (caseType) {
    case 'civil':
      return CIVIL_PARTY_ROLES;
    case 'administrative':
      return ADMINISTRATIVE_PARTY_ROLES;
    case 'criminal':
      return CRIMINAL_PARTY_ROLES;
    case 'echr':
      return ECHR_PARTY_ROLES;
    default:
      return CIVIL_PARTY_ROLES;
  }
}

// Court list as per requirements
const COURTS = [
  { value: 'Մարդու իրավունքների եվրոպական դատարան (ՄԻԵԴ)', label: 'court_echr' },
  { value: 'Սահմանադրական դատարան', label: 'court_constitutional' },
  { value: 'Վճռաբեկ դատարան', label: 'court_cassation' },
  { value: 'Վերաքննիչ քաղաքացիական դատարան', label: 'court_civil_appeal' },
  { value: 'Վերաքննիչ քրեական դատարան', label: 'court_criminal_appeal' },
  { value: 'Վերաքննիչ վարչական դատարան', label: 'court_administrative_appeal' },
  { value: 'Հակակոռուպցիոն դատարան', label: 'court_anticorruption' },
  { value: 'Հակակոռուպցիոն վերաքննիչ դատարան', label: 'court_anticorruption_appeal' },
  { value: 'Վարչական դատարան', label: 'court_administrative' },
  { value: 'Երևան քաղաքի ընդհանուր իրավասության քրեական դատարան', label: 'court_yerevan_criminal' },
  { value: 'Երևան քաղաքի ընդհանուր իրավասության քաղաքացիական դատարան', label: 'court_yerevan_civil' },
  { value: 'Արագածոտնի մարզի ընդհանուր իրավասության դատարան', label: 'court_aragatsotn' },
  { value: 'Արարատի և Վայոց ձորի մարզերի ընդհանուր իրավասության դատարան', label: 'court_ararat_vayots_dzor' },
  { value: 'Գեղարքունիքի մարզի ընդհանուր իրավասության դատարան', label: 'court_gegharkunik' },
  { value: 'Լոռու մարզի ընդհանուր իրավասության դատարան', label: 'court_lori' },
  { value: 'Կոտայքի մարզի ընդհանուր իրավասության դատարան', label: 'court_kotayk' },
  { value: 'Շիրակի մարزի ընդհանուր իրավասության դատարան', label: 'court_shirak' },
  { value: 'Սյունիքի մарзի ընդհանուր իրավасության դатаран', label: 'court_syunik' },
  { value: 'Տавушի марзи ընдhanur иравасутян датаран', label: 'court_tavush' },
  { value: 'Արмавири марзи ընдhanur иравасутян датаран', label: 'court_armavir' },
] as const;

interface CaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CaseInsert, files?: File[]) => void;
  initialData?: Case | null;
  isLoading?: boolean;
}

export function CaseForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading
}: CaseFormProps) {
  const { t } = useTranslation('cases');
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  // extractedFacts/LegalQuestion no longer needed — fields are in the form schema
  const [autoFillProgress, setAutoFillProgress] = useState(0);
  const [autoFillStage, setAutoFillStage] = useState('');

  const caseFormSchema = z.object({
    case_number: z.string().optional().default(''),
    title: z.string().optional().default(''),
    description: z.string().optional(),
    facts: z.string().optional(),
    legal_question: z.string().optional(),
    case_type: z.enum(['criminal', 'civil', 'administrative', 'echr']).optional().default('criminal'),
    party_role: z.string().min(1, { message: 'required' }),
    appeal_party_role: z.enum(['appellant', 'respondent'], { required_error: 'required' }),
    current_stage: z.string().optional().default('preliminary'),
    status: z.enum(['open', 'in_progress', 'pending', 'closed', 'archived']).optional().default('open'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
    court_name: z.string().min(1, { message: 'required' }),
    court_date: z.string().optional(),
    notes: z.string().optional(),
  });

  type CaseFormValues = z.infer<typeof caseFormSchema>;

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseFormSchema),
    defaultValues: {
      case_number: '',
      title: '',
      description: '',
      facts: '',
      legal_question: '',
      case_type: 'criminal',
      party_role: undefined,
      appeal_party_role: undefined,
      current_stage: 'preliminary',
      status: 'open',
      priority: 'medium',
      court_name: '',
      court_date: '',
      notes: '',
    },
  });

  // Watch case_type to update party_role options dynamically
  const watchedCaseType = form.watch('case_type');

  useEffect(() => {
    if (initialData) {
      const courtDate = initialData.court_date
        ? new Date(initialData.court_date)
        : undefined;

      setSelectedDate(courtDate);

      const caseType = (initialData.case_type || 'criminal') as 'criminal' | 'civil' | 'administrative' | 'echr';
      const currentStage = initialData.current_stage || 'preliminary';

      // Backward compatibility: if court exists but court_name doesn't, use court
      const courtName = initialData.court_name || initialData.court || '';

      form.reset({
        case_number: initialData.case_number,
        title: initialData.title,
        description: initialData.description || '',
        facts: initialData.facts || '',
        legal_question: initialData.legal_question || '',
        case_type: caseType,
        party_role: (initialData.party_role as 'claimant' | 'defendant') || undefined,
        appeal_party_role: (initialData.appeal_party_role as 'appellant' | 'respondent') || undefined,
        current_stage: currentStage,
        status: initialData.status,
        priority: initialData.priority,
        court_name: courtName,
        court_date: initialData.court_date
          ? new Date(initialData.court_date).toISOString().split('T')[0]
          : '',
        notes: initialData.notes || '',
      });
    } else {
      setSelectedDate(undefined);
      setPendingFiles([]);
      form.reset({
        case_number: '',
        title: '',
        description: '',
        facts: '',
        legal_question: '',
        case_type: 'criminal',
        party_role: undefined,
        appeal_party_role: undefined,
        current_stage: 'preliminary',
        status: 'open',
        priority: 'medium',
        court_name: '',
        court_date: '',
        notes: '',
      });
    }
  }, [initialData, form]);

  const handleAutoFill = useCallback(async () => {
    if (pendingFiles.length === 0) {
      toast({ title: t('add_files_first'), variant: 'destructive' });
      return;
    }
    setIsAutoFilling(true);
    setAutoFillProgress(0);
    setAutoFillStage(t('uploading_files'));

    // Simulated progress intervals
    const progressStages = [
      { at: 500, progress: 10, stage: t('uploading_files') },
      { at: 2000, progress: 25, stage: t('uploading_files') },
      { at: 4000, progress: 40, stage: t('analyzing_documents') },
      { at: 8000, progress: 55, stage: t('analyzing_documents') },
      { at: 15000, progress: 65, stage: t('extracting_fields') },
      { at: 25000, progress: 75, stage: t('extracting_fields') },
      { at: 40000, progress: 82, stage: t('extracting_fields') },
      { at: 60000, progress: 88, stage: t('extracting_fields') },
      { at: 90000, progress: 92, stage: t('extracting_fields') },
    ];
    const timers = progressStages.map(({ at, progress, stage }) =>
      setTimeout(() => {
        setAutoFillProgress(progress);
        setAutoFillStage(stage);
      }, at)
    );
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload files to Storage and collect references
      const fileRefs: Array<{
        bucket: string;
        path: string;
        name: string;
        mime: string;
        size: number;
      }> = [];

      for (const file of pendingFiles.slice(0, 5)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._\u0531-\u058F-]/g, '_');
        const storagePath = `${user.id}/autofill/${Date.now()}_${safeName}`;
        const mime = file.type || 'application/octet-stream';

        const { error: uploadError } = await supabase.storage
          .from('case-files')
          .upload(storagePath, file, {
            contentType: mime,
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload failed for', file.name, uploadError);
          throw new Error(`Upload failed: ${file.name}`);
        }

        fileRefs.push({
          bucket: 'case-files',
          path: storagePath,
          name: file.name,
          mime,
          size: file.size,
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);

      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${supabaseUrl}/functions/v1/extract-case-form-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${session?.access_token ?? supabaseKey}`,
        },
        body: JSON.stringify({ files: fileRefs }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      if (!data?.success || !data?.fields) throw new Error(data?.error || 'Extraction failed');

      const f = data.fields;
      if (f.case_number) form.setValue('case_number', f.case_number);
      if (f.title) form.setValue('title', f.title);
      if (f.description) form.setValue('description', f.description);
      if (f.case_type && ['criminal', 'civil', 'administrative', 'echr'].includes(f.case_type)) {
        form.setValue('case_type', f.case_type);
      }
      if (f.party_role) form.setValue('party_role', f.party_role);
      if (f.court_name) form.setValue('court_name', f.court_name);
      if (f.current_stage && ['pretrial', 'preliminary', 'first_instance', 'appeal', 'cassation', 'enforcement', 'echr'].includes(f.current_stage)) {
        form.setValue('current_stage', f.current_stage === 'pretrial' ? 'preliminary' : f.current_stage);
      }
      if (f.facts) {
        const factsValue = Array.isArray(f.facts) ? f.facts.join('\n') : String(f.facts);
        form.setValue('facts', factsValue);
      }
      if (f.legal_question) {
        const lqValue = Array.isArray(f.legal_question) ? f.legal_question.join('\n') : String(f.legal_question);
        form.setValue('legal_question', lqValue);
      }

      setAutoFillProgress(100);
      setAutoFillStage(t('auto_fill_complete'));
      toast({ title: t('auto_fill_success') });
    } catch (err) {
      console.error('Auto-fill error:', err);
      toast({
        title: t('auto_fill_failed'),
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      timers.forEach(clearTimeout);
      setIsAutoFilling(false);
      setTimeout(() => {
        setAutoFillProgress(0);
        setAutoFillStage('');
      }, 2000);
    }
  }, [pendingFiles, form, t, toast]);

  const handleSubmit = (values: CaseFormValues) => {
    onSubmit({
      case_number: values.case_number || `DRAFT-${Date.now()}`,
      title: values.title || t('untitled_case', 'Untitled'),
      case_type: values.case_type || 'criminal',
      party_role: values.party_role || null,
      appeal_party_role: values.appeal_party_role || null,
      current_stage: values.current_stage || 'preliminary',
      court: values.court_name || 'Не указан',
      status: values.status || 'open',
      priority: values.priority || 'medium',
      court_date: values.court_date ? new Date(values.court_date).toISOString() : null,
      description: values.description || null,
      court_name: values.court_name || 'Не указан',
      notes: values.notes || null,
      facts: values.facts || null,
      legal_question: values.legal_question || null,
    }, pendingFiles.length > 0 ? pendingFiles : undefined);

    setPendingFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {initialData ? t('edit_case') : t('new_case')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="case_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('case_number')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ԳԴ-2024-001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('case_title')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="case_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('case_type')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_case_type')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="criminal">{t('type_criminal')}</SelectItem>
                        <SelectItem value="civil">{t('type_civil')}</SelectItem>
                        <SelectItem value="administrative">{t('type_administrative')}</SelectItem>
                        <SelectItem value="echr">{t('type_echr')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="party_role"
                render={({ field }) => {
                  const partyRoles = getPartyRolesForCaseType(watchedCaseType);
                  return (
                    <FormItem>
                      <FormLabel>{t('party_role')} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('select_party_role')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {partyRoles.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {t(role.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="current_stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('current_stage')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_stage')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CASE_STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {t(stage.label)}
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
                name="appeal_party_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('appeal_party_role')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_appeal_party_role')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="appellant">{t('appeal_role_appellant')}</SelectItem>
                        <SelectItem value="respondent">{t('appeal_role_respondent')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="court_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('court_name')} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_court')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COURTS.map((court) => (
                        <SelectItem key={court.value} value={court.value}>
                          {t(court.label)}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('description')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="facts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('facts')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={5} placeholder={t('facts_placeholder')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('legal_question')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder={t('legal_question_placeholder')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="open">{t('status_open')}</SelectItem>
                        <SelectItem value="in_progress">{t('status_in_progress')}</SelectItem>
                        <SelectItem value="pending">{t('status_pending')}</SelectItem>
                        <SelectItem value="closed">{t('status_closed')}</SelectItem>
                        <SelectItem value="archived">{t('status_archived')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('priority')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">{t('priority_low')}</SelectItem>
                        <SelectItem value="medium">{t('priority_medium')}</SelectItem>
                        <SelectItem value="high">{t('priority_high')}</SelectItem>
                        <SelectItem value="urgent">{t('priority_urgent')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="court_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('court_date')}</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(new Date(field.value), "PPP")
                          ) : (
                            <span>{t('pick_date')}</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const formattedDate = format(date, 'yyyy-MM-dd');
                            field.onChange(formattedDate);
                            setSelectedDate(date);
                          } else {
                            field.onChange('');
                            setSelectedDate(undefined);
                          }
                        }}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('notes')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Upload Section - only for new cases */}
            {!initialData && (
              <div className="space-y-3">
                <CaseFormFileUpload
                  files={pendingFiles}
                  onFilesChange={setPendingFiles}
                />
                {pendingFiles.length > 0 && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAutoFill}
                      disabled={isAutoFilling}
                      className="w-full"
                    >
                      {isAutoFilling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      {isAutoFilling ? t('auto_filling') : t('auto_fill_from_files')}
                    </Button>
                    {(isAutoFilling || autoFillProgress > 0) && (
                      <div className="space-y-1">
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                            style={{ width: `${autoFillProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          {autoFillStage} {autoFillProgress > 0 && `(${autoFillProgress}%)`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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

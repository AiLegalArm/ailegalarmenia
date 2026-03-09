-- Create enum for document categories
CREATE TYPE public.document_category AS ENUM (
  'general',
  'civil_process',
  'criminal_process',
  'administrative_process',
  'constitutional',
  'international',
  'pre_trial',
  'contract'
);

-- Create table for document templates
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category document_category NOT NULL,
  subcategory TEXT,
  name_hy TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  template_structure JSONB NOT NULL DEFAULT '{}',
  required_fields TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for generated documents
CREATE TABLE public.generated_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  recipient_name TEXT,
  recipient_position TEXT,
  recipient_organization TEXT,
  sender_name TEXT,
  sender_address TEXT,
  sender_contact TEXT,
  content_text TEXT NOT NULL,
  source_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

-- RLS for templates (readable by all authenticated users)
CREATE POLICY "Templates are viewable by authenticated users"
ON public.document_templates
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS for generated documents
CREATE POLICY "Users can view their own documents"
ON public.generated_documents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own documents"
ON public.generated_documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON public.generated_documents
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON public.generated_documents
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_generated_documents_updated_at
BEFORE UPDATE ON public.generated_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert all document templates
INSERT INTO public.document_templates (category, subcategory, name_hy, name_ru, name_en, required_fields) VALUES
-- General documents
('general', NULL, 'Դdelays', 'Заявление', 'Application', ARRAY['recipient', 'subject', 'content']),
('general', NULL, 'Բdelays', 'Жалоба', 'Complaint', ARRAY['recipient', 'subject', 'content', 'grounds']),
('general', NULL, 'Միdelays', 'Ходатайство', 'Petition', ARRAY['recipient', 'subject', 'content', 'request']),
('general', NULL, 'Բացdelays', 'Объяснение', 'Explanation', ARRAY['recipient', 'subject', 'content']),
('general', NULL, 'Առdelays', 'Возражение', 'Objection', ARRAY['recipient', 'subject', 'content', 'grounds']),
('general', NULL, 'Պdelays', 'Отзыв', 'Response', ARRAY['recipient', 'subject', 'content']),
('general', NULL, 'Լdelays', 'Дополнение/уточнение', 'Amendment/Clarification', ARRAY['recipient', 'original_doc', 'content']),

-- Civil process
('civil_process', 'claim', 'Հdelays', 'Исковое заявление', 'Statement of Claim', ARRAY['court', 'plaintiff', 'defendant', 'subject', 'facts', 'legal_grounds', 'claims']),
('civil_process', 'response', 'Delays', 'Отзыв на иск', 'Response to Claim', ARRAY['court', 'case_number', 'content']),
('civil_process', 'objection', 'Առdelay', 'Возражение на отзыв', 'Objection to Response', ARRAY['court', 'case_number', 'content']),
('civil_process', 'motion', 'Միdelays restore', 'Ходатайство о восстановлении срока', 'Motion to Restore Deadline', ARRAY['court', 'case_number', 'missed_deadline', 'reasons']),
('civil_process', 'motion', 'Միdelay measures', 'Ходатайство о принятии обеспечительных мер', 'Motion for Interim Measures', ARRAY['court', 'case_number', 'measures_requested', 'grounds']),
('civil_process', 'motion', 'Միdelay suspend', 'Ходатайство о приостановлении производства', 'Motion to Suspend Proceedings', ARRAY['court', 'case_number', 'grounds']),
('civil_process', 'motion', 'Միdelay expert', 'Ходатайство о назначении экспертизы', 'Motion for Expert Examination', ARRAY['court', 'case_number', 'expert_type', 'questions']),
('civil_process', 'motion', 'Միdelay witness', 'Ходатайство о вызове свидетеля', 'Motion to Summon Witness', ARRAY['court', 'case_number', 'witness_info', 'testimony_subject']),
('civil_process', 'appeal', 'Վdelays appeal', 'Апелляционная жалоба', 'Appeal', ARRAY['court', 'case_number', 'decision_appealed', 'grounds']),
('civil_process', 'cassation', 'Վdelay cassation', 'Кассационная жалоба', 'Cassation Appeal', ARRAY['court', 'case_number', 'decision_appealed', 'grounds']),
('civil_process', 'review', 'Delays new', 'Заявление о пересмотре по новым обстоятельствам', 'Motion for Review on New Circumstances', ARRAY['court', 'case_number', 'new_circumstances']),
('civil_process', 'enforcement', 'Delays exec', 'Заявление о выдаче исполнительного листа', 'Request for Writ of Execution', ARRAY['court', 'case_number', 'decision_info']),

-- Criminal process
('criminal_process', 'crime_report', 'Հdelays crime', 'Заявление о преступлении', 'Crime Report', ARRAY['recipient', 'crime_description', 'evidence', 'victim_info']),
('criminal_process', 'defense_motion', 'Delays defense', 'Ходатайство защитника', 'Defense Motion', ARRAY['case_number', 'request', 'grounds']),
('criminal_process', 'complaint_investigator', 'Բdelay inv', 'Жалоба на действия/бездействие следователя', 'Complaint Against Investigator', ARRAY['recipient', 'investigator', 'actions_complained', 'grounds']),
('criminal_process', 'complaint_detention', 'Բdelay detention', 'Жалоба на меру пресечения', 'Complaint Against Detention Measure', ARRAY['court', 'case_number', 'measure', 'grounds']),
('criminal_process', 'appeal', 'Delays crim appeal', 'Апелляционная/кассационная жалоба по уголовному делу', 'Criminal Appeal', ARRAY['court', 'case_number', 'sentence_appealed', 'grounds']),
('criminal_process', 'termination', 'Delays terminate', 'Заявление о прекращении уголовного преследования', 'Motion to Terminate Criminal Prosecution', ARRAY['recipient', 'case_number', 'grounds']),
('criminal_process', 'bail_change', 'Մdelay bail', 'Ходатайство об изменении меры пресечения', 'Motion to Change Preventive Measure', ARRAY['court', 'case_number', 'current_measure', 'proposed_measure', 'grounds']),

-- Administrative process
('administrative_process', 'claim', 'Delays admin', 'Административный иск', 'Administrative Claim', ARRAY['court', 'plaintiff', 'defendant_authority', 'challenged_act', 'grounds', 'claims']),
('administrative_process', 'complaint_act', 'Delays act', 'Жалоба на административный акт', 'Complaint Against Administrative Act', ARRAY['recipient', 'act_details', 'grounds']),
('administrative_process', 'complaint_inaction', 'Delays inaction', 'Жалоба на бездействие органа', 'Complaint Against Authority Inaction', ARRAY['recipient', 'authority', 'required_action', 'grounds']),
('administrative_process', 'motion_suspend', 'Мdelay suspend act', 'Ходатайство о приостановлении акта', 'Motion to Suspend Act', ARRAY['court', 'case_number', 'act_details', 'grounds']),
('administrative_process', 'appeal', 'Delays admin appeal', 'Апелляционная/кассационная жалоба', 'Administrative Appeal', ARRAY['court', 'case_number', 'decision_appealed', 'grounds']),

-- Constitutional
('constitutional', 'application', 'Delays const', 'Обращение в Конституционный суд РА', 'Application to Constitutional Court', ARRAY['applicant', 'challenged_norm', 'constitutional_grounds', 'claims']),
('constitutional', 'supplement', 'Delays const add', 'Дополнение к обращению', 'Supplement to Application', ARRAY['case_number', 'content']),
('constitutional', 'amicus', 'Delays amicus', 'Мнение заинтересованной стороны (amicus curiae)', 'Amicus Curiae Brief', ARRAY['case_number', 'interested_party', 'opinion']),

-- International (ECHR)
('international', 'echr_application', 'Delays ECHR', 'Жалоба в ЕСПЧ', 'ECHR Application', ARRAY['applicant', 'respondent_state', 'facts', 'violated_articles', 'domestic_remedies']),
('international', 'echr_supplement', 'Delays ECHR add', 'Дополнение к жалобе в ЕСПЧ', 'Supplement to ECHR Application', ARRAY['application_number', 'content']),
('international', 'echr_observations', 'Delays ECHR obj', 'Возражение на позицию государства', 'Observations on Government Position', ARRAY['application_number', 'government_position', 'response']),
('international', 'rule39', 'Delays Rule39', 'Ходатайство о срочных мерах (Rule 39)', 'Request for Interim Measures (Rule 39)', ARRAY['applicant', 'urgency_grounds', 'measures_requested']),

-- Pre-trial
('pre_trial', 'pretrial_claim', 'Delays pretrial', 'Досудебная претензия', 'Pre-trial Claim', ARRAY['recipient', 'subject', 'demands', 'deadline']),
('pre_trial', 'demand', 'Delays demand', 'Требование', 'Demand', ARRAY['recipient', 'subject', 'content']),
('pre_trial', 'notice', 'Delays notice', 'Уведомление', 'Notice', ARRAY['recipient', 'subject', 'content']),
('pre_trial', 'claim_response', 'Delays response', 'Ответ на претензию', 'Response to Claim', ARRAY['original_claim', 'response']),
('pre_trial', 'info_request', 'Delays info', 'Запрос информации', 'Information Request', ARRAY['recipient', 'info_requested', 'legal_basis']),
('pre_trial', 'legal_opinion', 'Delays opinion', 'Правовое заключение (Legal Opinion)', 'Legal Opinion', ARRAY['subject', 'facts', 'analysis', 'conclusion']),

-- Contract documents
('contract', 'contract', 'Delays contract', 'Договор', 'Contract', ARRAY['parties', 'subject', 'terms', 'obligations']),
('contract', 'amendment', 'Delays amend', 'Дополнительное соглашение', 'Amendment Agreement', ARRAY['original_contract', 'changes']),
('contract', 'protocol', 'Delays protocol', 'Протокол разногласий', 'Protocol of Disagreements', ARRAY['original_contract', 'disagreements']),
('contract', 'termination', 'Delays term', 'Расторжение договора', 'Contract Termination', ARRAY['original_contract', 'termination_grounds']),
('contract', 'power_of_attorney', 'Delays poa', 'Доверенность', 'Power of Attorney', ARRAY['principal', 'agent', 'powers', 'validity']),
('contract', 'receipt', 'Delays receipt', 'Расписка', 'Receipt', ARRAY['parties', 'subject', 'amount']);
-- =============================================
-- AI LEGAL ARMENIA - ПОЛНАЯ СХЕМА БАЗЫ ДАННЫХ
-- =============================================

-- 1. ENUM для ролей пользователей
CREATE TYPE public.app_role AS ENUM ('admin', 'lawyer', 'client', 'auditor');

-- 2. ENUM для статуса дел
CREATE TYPE public.case_status AS ENUM ('open', 'in_progress', 'pending', 'closed', 'archived');

-- 3. ENUM для приоритета дел
CREATE TYPE public.case_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- 4. ENUM для категорий Knowledge Base
CREATE TYPE public.kb_category AS ENUM (
  'constitution', 
  'civil_code', 
  'criminal_code', 
  'labor_code', 
  'family_code',
  'administrative_code',
  'tax_code',
  'court_practice',
  'legal_commentary',
  'other'
);

-- =============================================
-- ТАБЛИЦЫ
-- =============================================

-- 5. Profiles (профили пользователей)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. User Roles (роли в ОТДЕЛЬНОЙ таблице!)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- 7. Cases (юридические дела)
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status case_status NOT NULL DEFAULT 'open',
  priority case_priority NOT NULL DEFAULT 'medium',
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lawyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  court_name TEXT,
  court_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ -- soft delete
);

-- 8. Case Files (файлы дел)
CREATE TABLE public.case_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  hash_sha256 TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ -- soft delete
);

-- 9. Knowledge Base (база знаний законодательства РА)
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  category kb_category NOT NULL DEFAULT 'other',
  source_url TEXT,
  source_name TEXT,
  version_date DATE,
  article_number TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Audit Logs (журнал аудита)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. OCR Results (результаты OCR)
CREATE TABLE public.ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.case_files(id) ON DELETE CASCADE,
  extracted_text TEXT NOT NULL,
  confidence NUMERIC(5,2),
  language TEXT DEFAULT 'hy',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Audio Transcriptions (транскрипции аудио)
CREATE TABLE public.audio_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.case_files(id) ON DELETE CASCADE,
  transcription_text TEXT NOT NULL,
  confidence NUMERIC(5,2),
  duration_seconds INTEGER,
  language TEXT DEFAULT 'hy-AM',
  speaker_labels JSONB,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. AI Analysis Results (результаты AI анализа)
CREATE TABLE public.ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('advocate', 'prosecutor', 'judge', 'aggregator')),
  prompt_used TEXT,
  response_text TEXT NOT NULL,
  sources_used JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. User Feedback (обратная связь)
CREATE TABLE public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  analysis_id UUID REFERENCES public.ai_analysis(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- GIN ИНДЕКСЫ ДЛЯ FULL-TEXT SEARCH
-- =============================================

-- Full-text search по Knowledge Base
CREATE INDEX idx_kb_content_gin ON public.knowledge_base 
  USING GIN (to_tsvector('simple', content_text));

CREATE INDEX idx_kb_title_gin ON public.knowledge_base 
  USING GIN (to_tsvector('simple', title));

-- Full-text search по Cases
CREATE INDEX idx_cases_description_gin ON public.cases 
  USING GIN (to_tsvector('simple', COALESCE(description, '')));

CREATE INDEX idx_cases_title_gin ON public.cases 
  USING GIN (to_tsvector('simple', title));

-- Full-text search по OCR Results
CREATE INDEX idx_ocr_text_gin ON public.ocr_results 
  USING GIN (to_tsvector('simple', extracted_text));

-- Full-text search по Audio Transcriptions
CREATE INDEX idx_audio_text_gin ON public.audio_transcriptions 
  USING GIN (to_tsvector('simple', transcription_text));

-- =============================================
-- ДОПОЛНИТЕЛЬНЫЕ ИНДЕКСЫ
-- =============================================

CREATE INDEX idx_cases_status ON public.cases(status);
CREATE INDEX idx_cases_lawyer ON public.cases(lawyer_id);
CREATE INDEX idx_cases_client ON public.cases(client_id);
CREATE INDEX idx_case_files_case ON public.case_files(case_id);
CREATE INDEX idx_kb_category ON public.knowledge_base(category);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at);

-- =============================================
-- SECURITY DEFINER ФУНКЦИЯ ДЛЯ ПРОВЕРКИ РОЛЕЙ
-- =============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Функция для получения всех ролей пользователя
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(role) FROM public.user_roles WHERE user_id = _user_id
$$;

-- =============================================
-- ТРИГГЕР ДЛЯ АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ updated_at
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kb_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ТРИГГЕР ДЛЯ АВТОМАТИЧЕСКОГО СОЗДАНИЯ ПРОФИЛЯ
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- По умолчанию новый пользователь получает роль 'client'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS на всех таблицах
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS: PROFILES
-- =============================================

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Lawyers can view client profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'lawyer') 
    AND id IN (SELECT client_id FROM public.cases WHERE lawyer_id = auth.uid())
  );

-- =============================================
-- RLS: USER ROLES
-- =============================================

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS: CASES
-- =============================================

CREATE POLICY "Lawyers can view their cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (
    lawyer_id = auth.uid() 
    AND deleted_at IS NULL
  );

CREATE POLICY "Clients can view their cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid() 
    AND deleted_at IS NULL
  );

CREATE POLICY "Admins can view all cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Auditors can view all cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
  );

CREATE POLICY "Lawyers can create cases"
  ON public.cases FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'lawyer') 
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Lawyers can update their cases"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (
    lawyer_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete cases"
  ON public.cases FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS: CASE FILES
-- =============================================

CREATE POLICY "Users can view files of their cases"
  ON public.case_files FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND case_id IN (
      SELECT id FROM public.cases 
      WHERE lawyer_id = auth.uid() 
         OR client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all files"
  ON public.case_files FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Lawyers can upload files"
  ON public.case_files FOR INSERT
  TO authenticated
  WITH CHECK (
    case_id IN (SELECT id FROM public.cases WHERE lawyer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Lawyers can update their files"
  ON public.case_files FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- =============================================
-- RLS: KNOWLEDGE BASE
-- =============================================

CREATE POLICY "Everyone can read active KB"
  ON public.knowledge_base FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage KB"
  ON public.knowledge_base FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS: AUDIT LOGS
-- =============================================

CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Auditors can view all audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'auditor'));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================
-- RLS: OCR RESULTS
-- =============================================

CREATE POLICY "Users can view OCR of their files"
  ON public.ocr_results FOR SELECT
  TO authenticated
  USING (
    file_id IN (
      SELECT cf.id FROM public.case_files cf
      JOIN public.cases c ON cf.case_id = c.id
      WHERE c.lawyer_id = auth.uid() OR c.client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all OCR"
  ON public.ocr_results FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Lawyers can create OCR results"
  ON public.ocr_results FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'lawyer') 
    OR public.has_role(auth.uid(), 'admin')
  );

-- =============================================
-- RLS: AUDIO TRANSCRIPTIONS
-- =============================================

CREATE POLICY "Users can view transcriptions of their files"
  ON public.audio_transcriptions FOR SELECT
  TO authenticated
  USING (
    file_id IN (
      SELECT cf.id FROM public.case_files cf
      JOIN public.cases c ON cf.case_id = c.id
      WHERE c.lawyer_id = auth.uid() OR c.client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all transcriptions"
  ON public.audio_transcriptions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Lawyers can create transcriptions"
  ON public.audio_transcriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'lawyer') 
    OR public.has_role(auth.uid(), 'admin')
  );

-- =============================================
-- RLS: AI ANALYSIS
-- =============================================

CREATE POLICY "Users can view AI analysis of their cases"
  ON public.ai_analysis FOR SELECT
  TO authenticated
  USING (
    case_id IN (
      SELECT id FROM public.cases 
      WHERE lawyer_id = auth.uid() OR client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all AI analysis"
  ON public.ai_analysis FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Lawyers can create AI analysis"
  ON public.ai_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'lawyer') 
    OR public.has_role(auth.uid(), 'admin')
  );

-- =============================================
-- RLS: USER FEEDBACK
-- =============================================

CREATE POLICY "Users can view own feedback"
  ON public.user_feedback FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all feedback"
  ON public.user_feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create feedback"
  ON public.user_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- ФУНКЦИЯ ДЛЯ RAG ПОИСКА ПО KNOWLEDGE BASE
-- =============================================

CREATE OR REPLACE FUNCTION public.search_knowledge_base(
  search_query TEXT,
  result_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content_text TEXT,
  category kb_category,
  source_name TEXT,
  version_date DATE,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    kb.id,
    kb.title,
    kb.content_text,
    kb.category,
    kb.source_name,
    kb.version_date,
    ts_rank(
      to_tsvector('simple', kb.title || ' ' || kb.content_text),
      plainto_tsquery('simple', search_query)
    ) as rank
  FROM public.knowledge_base kb
  WHERE 
    kb.is_active = true
    AND (
      to_tsvector('simple', kb.title || ' ' || kb.content_text) 
      @@ plainto_tsquery('simple', search_query)
    )
  ORDER BY rank DESC
  LIMIT result_limit
$$;

-- =============================================
-- ФУНКЦИЯ ДЛЯ ЗАПИСИ В AUDIT LOG
-- =============================================

CREATE OR REPLACE FUNCTION public.log_audit(
  _action TEXT,
  _table_name TEXT DEFAULT NULL,
  _record_id UUID DEFAULT NULL,
  _details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (auth.uid(), _action, _table_name, _record_id, _details)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;
-- =============================================================================
-- MULTI-AGENT ANALYSIS SYSTEM TABLES
-- =============================================================================

-- Enum for agent types
CREATE TYPE public.agent_type AS ENUM (
  'evidence_collector',      -- Сбор и каталогизация доказательств
  'evidence_admissibility',  -- Анализ допустимости доказательств
  'charge_qualification',    -- Проверка квалификации обвинения
  'procedural_violations',   -- Поиск процедурных нарушений УПК
  'substantive_violations',  -- Нарушения материального права
  'defense_strategy',        -- Стратегия защиты
  'prosecution_weaknesses',  -- Слабости обвинения
  'rights_violations',       -- Нарушения прав (Конституция + ЕСПЧ)
  'aggregator'               -- Финальная агрегация
);

-- Enum for evidence types
CREATE TYPE public.evidence_type AS ENUM (
  'document',           -- Документ
  'testimony',          -- Показания
  'expert_conclusion',  -- Заключение эксперта
  'physical',           -- Вещественное
  'protocol',           -- Протокол следственного действия
  'audio_video',        -- Аудио/видео запись
  'other'               -- Иное
);

-- Enum for evidence admissibility status
CREATE TYPE public.evidence_status AS ENUM (
  'admissible',         -- Допустимо
  'inadmissible',       -- Недопустимо
  'questionable',       -- Под вопросом
  'pending_review'      -- Ожидает проверки
);

-- Enum for agent run status
CREATE TYPE public.agent_run_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

-- =============================================================================
-- CASE VOLUMES TABLE - Тома дела
-- =============================================================================
CREATE TABLE public.case_volumes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  volume_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_id UUID REFERENCES public.case_files(id) ON DELETE SET NULL,
  page_count INTEGER,
  ocr_completed BOOLEAN DEFAULT FALSE,
  ocr_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(case_id, volume_number)
);

-- =============================================================================
-- AGENT ANALYSIS RUNS - Запуски анализа агентов
-- =============================================================================
CREATE TABLE public.agent_analysis_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  agent_type public.agent_type NOT NULL,
  status public.agent_run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  analysis_result TEXT,
  summary TEXT,
  findings JSONB DEFAULT '[]'::jsonb,
  sources_used JSONB DEFAULT '[]'::jsonb,
  tokens_used INTEGER,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- EVIDENCE REGISTRY - Реестр доказательств
-- =============================================================================
CREATE TABLE public.evidence_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  volume_id UUID REFERENCES public.case_volumes(id) ON DELETE SET NULL,
  evidence_number INTEGER NOT NULL,
  evidence_type public.evidence_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  page_reference TEXT,                    -- Например: "Том 2, стр. 45-48"
  source_document TEXT,                   -- Название исходного документа
  date_obtained DATE,                     -- Дата получения
  obtained_by TEXT,                       -- Кем получено
  admissibility_status public.evidence_status DEFAULT 'pending_review',
  admissibility_notes TEXT,               -- Заметки по допустимости
  related_articles TEXT[],                -- Связанные статьи УК/УПК
  violations_found TEXT[],                -- Обнаруженные нарушения
  defense_arguments TEXT,                 -- Аргументы защиты
  prosecution_position TEXT,              -- Позиция обвинения
  ai_analysis TEXT,                       -- AI анализ
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(case_id, evidence_number)
);

-- =============================================================================
-- AGENT FINDINGS - Находки агентов (детализация)
-- =============================================================================
CREATE TABLE public.agent_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.agent_analysis_runs(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL,             -- violation, weakness, argument, etc.
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  legal_basis TEXT[],                     -- Правовое основание
  evidence_refs UUID[],                   -- Ссылки на доказательства
  volume_refs UUID[],                     -- Ссылки на тома
  page_references TEXT[],                 -- Ссылки на страницы
  recommendation TEXT,                    -- Рекомендация
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- AGGREGATED REPORTS - Агрегированные отчёты
-- =============================================================================
CREATE TABLE public.aggregated_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'full_analysis',
  title TEXT NOT NULL,
  executive_summary TEXT,                 -- Краткое резюме
  evidence_summary TEXT,                  -- Сводка по доказательствам
  violations_summary TEXT,                -- Сводка нарушений
  defense_strategy TEXT,                  -- Стратегия защиты
  prosecution_weaknesses TEXT,            -- Слабости обвинения
  recommendations TEXT,                   -- Рекомендации
  full_report TEXT,                       -- Полный отчёт
  agent_runs UUID[],                      -- ID запусков агентов
  statistics JSONB DEFAULT '{}'::jsonb,   -- Статистика
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX idx_case_volumes_case ON public.case_volumes(case_id);
CREATE INDEX idx_agent_runs_case ON public.agent_analysis_runs(case_id);
CREATE INDEX idx_agent_runs_status ON public.agent_analysis_runs(status);
CREATE INDEX idx_evidence_registry_case ON public.evidence_registry(case_id);
CREATE INDEX idx_evidence_registry_status ON public.evidence_registry(admissibility_status);
CREATE INDEX idx_agent_findings_run ON public.agent_findings(run_id);
CREATE INDEX idx_agent_findings_case ON public.agent_findings(case_id);
CREATE INDEX idx_aggregated_reports_case ON public.aggregated_reports(case_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE TRIGGER update_case_volumes_updated_at
  BEFORE UPDATE ON public.case_volumes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_runs_updated_at
  BEFORE UPDATE ON public.agent_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_evidence_registry_updated_at
  BEFORE UPDATE ON public.evidence_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================
ALTER TABLE public.case_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregated_reports ENABLE ROW LEVEL SECURITY;

-- Case Volumes policies
CREATE POLICY "Users can view volumes of accessible cases"
  ON public.case_volumes FOR SELECT
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can create volumes for accessible cases"
  ON public.case_volumes FOR INSERT
  WITH CHECK (public.user_can_access_case(case_id));

CREATE POLICY "Users can update volumes of accessible cases"
  ON public.case_volumes FOR UPDATE
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can delete volumes of accessible cases"
  ON public.case_volumes FOR DELETE
  USING (public.user_can_access_case(case_id));

-- Agent Analysis Runs policies
CREATE POLICY "Users can view runs of accessible cases"
  ON public.agent_analysis_runs FOR SELECT
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can create runs for accessible cases"
  ON public.agent_analysis_runs FOR INSERT
  WITH CHECK (public.user_can_access_case(case_id));

CREATE POLICY "Users can update runs of accessible cases"
  ON public.agent_analysis_runs FOR UPDATE
  USING (public.user_can_access_case(case_id));

-- Evidence Registry policies
CREATE POLICY "Users can view evidence of accessible cases"
  ON public.evidence_registry FOR SELECT
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can create evidence for accessible cases"
  ON public.evidence_registry FOR INSERT
  WITH CHECK (public.user_can_access_case(case_id));

CREATE POLICY "Users can update evidence of accessible cases"
  ON public.evidence_registry FOR UPDATE
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can delete evidence of accessible cases"
  ON public.evidence_registry FOR DELETE
  USING (public.user_can_access_case(case_id));

-- Agent Findings policies
CREATE POLICY "Users can view findings of accessible cases"
  ON public.agent_findings FOR SELECT
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can create findings for accessible cases"
  ON public.agent_findings FOR INSERT
  WITH CHECK (public.user_can_access_case(case_id));

-- Aggregated Reports policies
CREATE POLICY "Users can view reports of accessible cases"
  ON public.aggregated_reports FOR SELECT
  USING (public.user_can_access_case(case_id));

CREATE POLICY "Users can create reports for accessible cases"
  ON public.aggregated_reports FOR INSERT
  WITH CHECK (public.user_can_access_case(case_id));
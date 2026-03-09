// =============================================================================
// MULTI-AGENT SYSTEM TYPES
// =============================================================================

// Frontend AgentType (used in multi-agent UI)
export type AgentType = 
  | 'evidence_collector'
  | 'evidence_admissibility'
  | 'charge_qualification'
  | 'procedural_violations'
  | 'substantive_violations'
  | 'defense_strategy'
  | 'prosecution_weaknesses'
  | 'rights_violations'
  | 'aggregator';

// Backend AnalysisType (used in ai-analyze edge function)
// Maps to supabase/functions/ai-analyze/system.ts ANALYSIS_TYPES
export type AnalysisType = 
  | 'defense_analysis'
  | 'prosecution_analysis'
  | 'judge_analysis'
  | 'aggregator'
  | 'evidence_admissibility'
  | 'charge_qualification'
  | 'procedural_violations'
  | 'substantive_law_violations'
  | 'fair_trial_and_rights';

// Mapping from frontend AgentType to backend AnalysisType
export const AGENT_TO_ANALYSIS_TYPE: Record<AgentType, AnalysisType> = {
  evidence_collector: 'evidence_admissibility',
  evidence_admissibility: 'evidence_admissibility',
  charge_qualification: 'charge_qualification',
  procedural_violations: 'procedural_violations',
  substantive_violations: 'substantive_law_violations',
  defense_strategy: 'defense_analysis',
  prosecution_weaknesses: 'prosecution_analysis',
  rights_violations: 'fair_trial_and_rights',
  aggregator: 'aggregator',
};

export type EvidenceType = 
  | 'document'
  | 'testimony'
  | 'expert_conclusion'
  | 'physical'
  | 'protocol'
  | 'audio_video'
  | 'other';

export type EvidenceStatus = 
  | 'admissible'
  | 'inadmissible'
  | 'questionable'
  | 'pending_review';

export type AgentRunStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface CaseVolume {
  id: string;
  case_id: string;
  volume_number: number;
  title: string;
  description?: string;
  file_id?: string;
  page_count?: number;
  ocr_completed: boolean;
  ocr_text?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentAnalysisRun {
  id: string;
  case_id: string;
  agent_type: AgentType;
  status: AgentRunStatus;
  started_at?: string;
  completed_at?: string;
  analysis_result?: string;
  summary?: string;
  findings?: AgentFinding[];
  sources_used?: Array<{ title: string; category: string }>;
  tokens_used?: number;
  error_message?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentFinding {
  id?: string;
  run_id?: string;
  case_id?: string;
  finding_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  legal_basis?: string[];
  evidence_refs?: string[];
  volume_refs?: string[];
  page_references?: string[];
  recommendation?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface EvidenceItem {
  id: string;
  case_id: string;
  volume_id?: string;
  evidence_number: number;
  evidence_type: EvidenceType;
  title: string;
  description?: string;
  page_reference?: string;
  source_document?: string;
  date_obtained?: string;
  obtained_by?: string;
  admissibility_status: EvidenceStatus;
  admissibility_notes?: string;
  related_articles?: string[];
  violations_found?: string[];
  defense_arguments?: string;
  prosecution_position?: string;
  ai_analysis?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AggregatedReport {
  id: string;
  case_id: string;
  report_type: string;
  title: string;
  executive_summary?: string;
  evidence_summary?: string;
  violations_summary?: string;
  defense_strategy?: string;
  prosecution_weaknesses?: string;
  recommendations?: string;
  full_report?: string;
  agent_runs?: string[];
  statistics?: Record<string, unknown>;
  generated_at: string;
  created_by?: string;
}

// Agent configuration
export interface AgentConfig {
  type: AgentType;
  name: string;
  nameHy: string;
  nameRu: string;
  description: string;
  descriptionHy: string;
  descriptionRu: string;
  icon: string;
  color: string;
  order: number;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    type: 'evidence_collector',
    name: 'Evidence Collector',
    nameHy: 'Ապացույցների հավաքող',
    nameRu: 'Сбор доказательств',
    description: 'Catalogs all evidence from case volumes',
    descriptionHy: 'Կատալոգավորում է գործի բոլոր ապացույցները',
    descriptionRu: 'Каталогизирует все доказательства из томов дела',
    icon: '\uD83D\uDD0D',
    color: 'bg-blue-500',
    order: 1
  },
  {
    type: 'evidence_admissibility',
    name: 'Evidence Admissibility',
    nameHy: 'Ապացույցների թույլատրելիություն',
    nameRu: 'Допустимость доказательств',
    description: 'Analyzes admissibility of each evidence',
    descriptionHy: 'Վերլուծում է ապացույցների թույլատրելիությունը',
    descriptionRu: 'Анализирует допустимость каждого доказательства',
    icon: '\u2696\uFE0F',
    color: 'bg-amber-500',
    order: 2
  },
  {
    type: 'charge_qualification',
    name: 'Charge Qualification',
    nameHy: 'Մեղադրանքի որակավորում',
    nameRu: 'Квалификация обвинения',
    description: 'Verifies correctness of criminal charges',
    descriptionHy: 'Ստուգում է մեղադրանքի որակավորման ճիշտությունը',
    descriptionRu: 'Проверяет правильность квалификации обвинения',
    icon: '\uD83D\uDCCB',
    color: 'bg-purple-500',
    order: 3
  },
  {
    type: 'procedural_violations',
    name: 'Procedural Violations',
    nameHy: 'Դատավարական խախտումներ',
    nameRu: 'Процессуальные нарушения',
    description: 'Finds CPC violations',
    descriptionHy: 'Հայտնաբերում է ՔԴՕ-ի խախտումները',
    descriptionRu: 'Выявляет нарушения УПК',
    icon: '\uD83D\uDEA8',
    color: 'bg-red-500',
    order: 4
  },
  {
    type: 'substantive_violations',
    name: 'Substantive Violations',
    nameHy: 'Կազմական խախտումներ',
    nameRu: 'Нарушения норм УК',
    description: 'Finds Criminal Code violations',
    descriptionHy: 'Հայտնաբերում է ՔՕ-ի նորմերի խախտումները',
    descriptionRu: 'Выявляет нарушения норм Уголовного кодекса',
    icon: '\uD83D\uDCDC',
    color: 'bg-orange-500',
    order: 5
  },
  {
    type: 'defense_strategy',
    name: 'Defense Strategy',
    nameHy: 'Պաշտպանության ռազմավարություն',
    nameRu: 'Стратегия защиты',
    description: 'Builds defense arguments',
    descriptionHy: 'Կազմում է պաշտպանության փաստարկները',
    descriptionRu: 'Формирует аргументы защиты',
    icon: '\uD83D\uDEE1\uFE0F',
    color: 'bg-green-500',
    order: 6
  },
  {
    type: 'prosecution_weaknesses',
    name: 'Prosecution Weaknesses',
    nameHy: 'Մեղադրանքի թույլ կողմերը',
    nameRu: 'Слабости обвинения',
    description: 'Identifies prosecution gaps',
    descriptionHy: 'Հայտնաբերում է մեղադրանքի թույլ կողմերը',
    descriptionRu: 'Выявляет слабые места обвинения',
    icon: '\u26A0\uFE0F',
    color: 'bg-yellow-500',
    order: 7
  },
  {
    type: 'rights_violations',
    name: 'Rights Violations',
    nameHy: 'Իրավունքների խախտումներ',
    nameRu: 'Нарушения прав',
    description: 'Finds Constitution & ECHR violations',
    descriptionHy: 'Սահմանադրության և ՄԻԵԴ-ի խախտումները',
    descriptionRu: 'Нарушения Конституции и ЕКПЧ',
    icon: '\uD83D\uDCDC',
    color: 'bg-indigo-500',
    order: 8
  },
  {
    type: 'aggregator',
    name: 'Aggregator',
    nameHy: 'Ագրեգատոր',
    nameRu: 'Агрегатор',
    description: 'Synthesizes all analyses into final report',
    descriptionHy: 'Համադրում է բոլոր վերլուծությունները վերջնական զեկույցում',
    descriptionRu: 'Объединяет все анализы в итоговый отчёт',
    icon: '\uD83E\uDDE0',
    color: 'bg-teal-500',
    order: 9
  }
];

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, { en: string; hy: string; ru: string }> = {
  document: { en: 'Document', hy: 'Փաստաթուղթ', ru: 'Документ' },
  testimony: { en: 'Testimony', hy: 'Ցուցմունք', ru: 'Показание' },
  expert_conclusion: { en: 'Expert Conclusion', hy: 'Փորձագիտական եզրակացություն', ru: 'Заключение эксперта' },
  physical: { en: 'Physical Evidence', hy: 'Իրային ապացույց', ru: 'Вещественное доказательство' },
  protocol: { en: 'Protocol', hy: 'Արձանագրություն', ru: 'Протокол' },
  audio_video: { en: 'Audio/Video', hy: 'Աուդիո/Վիդեո', ru: 'Аудио/Видео' },
  other: { en: 'Other', hy: 'Այլ', ru: 'Другое' }
};

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, { en: string; hy: string; ru: string; color: string }> = {
  admissible: { en: 'Admissible', hy: 'Թույլատրելի', ru: 'Допустимо', color: 'bg-green-100 text-green-800' },
  inadmissible: { en: 'Inadmissible', hy: 'Անթույլատրելի', ru: 'Недопустимо', color: 'bg-red-100 text-red-800' },
  questionable: { en: 'Questionable', hy: 'Կասկածելի', ru: 'Спорно', color: 'bg-yellow-100 text-yellow-800' },
  pending_review: { en: 'Pending Review', hy: 'Սպասում է արժեկին', ru: 'На проверке', color: 'bg-gray-100 text-gray-800' }
};

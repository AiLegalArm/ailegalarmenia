# Task 01 — Full Project Architecture Audit
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6 (acting as senior architect/evaluator)

---

## 1. Project Identity

**Product:** AI Legal Armenia — Legal AI Platform for the Republic of Armenia  
**Stack:** React + Vite SPA → Supabase (Postgres + Edge Functions + Auth + Storage) → AI Gateway (lovable.dev)  
**Deployment Model:** Static frontend + serverless backend (Deno Edge Functions on Supabase)  
**Target users:** Admin, Lawyer, Client, Auditor  

---

## 2. Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React SPA)                    │
│  Vite + TypeScript + React Router v6 + TanStack Query       │
│  Radix UI + Tailwind CSS + shadcn/ui + framer-motion        │
│                                                             │
│  Pages: Index, Login, AdminLogin, Dashboard, CalendarPage,  │
│  CaseDetail, CaseTranscriptions, AudioTranscriptions,       │
│  KnowledgeBase, KBDocumentDetail, AdminPanel, MyDocuments   │
│                                                             │
│  Key Components:                                            │
│  ├─ ProtectedRoute (role-based guard)                       │
│  ├─ LegalChatBot (AI chat interface)                        │
│  ├─ CaseAIAnalysisPanel (multi-agent analysis)             │
│  ├─ AdminPanel (admin-only area)                            │
│  ├─ KnowledgeBase (KB management)                           │
│  └─ GlobalQueueBar (background job tracking)                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (Supabase JS SDK)
┌──────────────────────────▼──────────────────────────────────┐
│                  SUPABASE BACKEND                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              AUTH (Supabase Auth)                   │   │
│  │  Custom domain pattern: username@app.internal        │   │
│  │  Roles: admin | lawyer | client | auditor           │   │
│  │  Role storage: user_roles table + has_role() RPC    │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │           POSTGRESQL DATABASE (185 migrations)       │  │
│  │  Core tables:                                        │  │
│  │  ├─ profiles, user_roles, role_limits, teams         │  │
│  │  ├─ cases, case_files, case_volumes, case_comments   │  │
│  │  ├─ agent_analysis_runs, agent_findings, agent_jobs  │  │
│  │  ├─ knowledge_base, knowledge_base_chunks            │  │
│  │  ├─ legal_practice_kb, legal_practice_kb_chunks      │  │
│  │  ├─ legal_documents, legal_chunks                    │  │
│  │  ├─ generated_documents, document_templates          │  │
│  │  ├─ audio_transcriptions, ocr_results               │  │
│  │  ├─ notifications, reminders                         │  │
│  │  ├─ ai_prompts, ai_prompt_versions                  │  │
│  │  ├─ ai_analysis, aggregated_reports                  │  │
│  │  ├─ eval_suites, eval_runs, eval_run_results        │  │
│  │  ├─ encrypted_pii, audit_logs, error_logs           │  │
│  │  ├─ translations_cache, armenian_dictionary         │  │
│  │  ├─ telegram_uploads, telegram_verification_codes   │  │
│  │  ├─ api_usage, app_settings, user_feedback          │  │
│  │  └─ practice_chunk_jobs, kb_versions               │  │
│  │                                                      │  │
│  │  Key enums: app_role, case_type, case_status,       │  │
│  │  case_priority, agent_type, agent_run_status        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           SUPABASE STORAGE                          │   │
│  │  Case files (PDFs, docs), audio files, OCR outputs  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        EDGE FUNCTIONS (~40 Deno functions)          │   │
│  │  See Section 4 for full list and classification     │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              AI GATEWAY (ai.gateway.lovable.dev)            │
│                                                             │
│  Model routing via openai-router.ts + gateway-bypass.ts:   │
│  ├─ claude-3.5-sonnet: legal-chat, ai-analyze,            │
│  │   generate-complaint, generate-document, multi-agent    │
│  ├─ gemini-2.5-pro: kb-search-assistant, legal-practice-  │
│  │   import, precedent_citation, cross_exam, law_update   │
│  ├─ gpt-4.1-mini: legal-practice-enrich, utilities        │
│  └─ text-embedding-*: embeddings-generate                  │
└─────────────────────────────────────────────────────────────┘

EXTERNAL INTEGRATIONS:
  ├─ Telegram Bot (webhook + notifications)
  ├─ ARLIS (Armenian legal database — bulk import pipeline)
  └─ ECHR (European Court of Human Rights — case import)
```

---

## 3. Module Inventory

### Frontend Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Auth | `src/hooks/useAuth.ts`, `src/lib/auth.ts` | Session management, role checking |
| Router/Guards | `src/App.tsx`, `src/components/ProtectedRoute.tsx` | Role-based routing |
| Cases | `src/components/cases/`, `src/hooks/useCases.ts` | Case CRUD, files, comments |
| AI Analysis | `src/components/cases/CaseAIAnalysisPanel.tsx`, `useMultiAgentAnalysis.ts` | Multi-agent analysis UI |
| Legal Chat | `src/components/chat/LegalChatBot.tsx` | AI chat interface |
| Knowledge Base | `src/components/kb/`, `src/hooks/useKnowledgeBase.ts` | KB management UI |
| Admin Panel | `src/components/admin/`, `src/pages/AdminPanel.tsx` | Admin-only management |
| Documents | `src/pages/MyDocuments.tsx`, `src/lib/pdf/`, `src/lib/pdfExport*.ts` | Document generation + PDF export |
| Audio/OCR | `src/pages/AudioTranscriptions.tsx`, `src/hooks/useAudioTranscriptions.ts` | Audio transcription management |
| Dictionary | `src/components/dictionary/` | Armenian legal dictionary |
| Background Queue | `src/hooks/useBackgroundQueue.tsx`, `src/components/GlobalQueueBar.tsx` | Async job tracking UI |
| i18n | `src/i18n/`, `src/translation/` | Multilingual (Armenian, Russian, English) |

### Backend Modules (Edge Functions)

#### AI Layer
| Function | Model | Purpose |
|----------|-------|---------|
| `legal-chat` | Claude 3.5 Sonnet | Primary legal AI assistant |
| `ai-analyze` | Claude 3.5 Sonnet | Case analysis (8 sub-roles) |
| `multi-agent-analyze` | Claude 3.5 Sonnet | Multi-agent orchestration |
| `generate-complaint` | Claude 3.5 Sonnet | Complaint drafting |
| `generate-document` | Claude 3.5 Sonnet | Legal document generation |
| `admin-ai-chat` | Claude 3.5 Sonnet | Admin AI assistant |
| `analyze-files-for-complaint` | Claude 3.5 Sonnet | File analysis for complaints |
| `extract-case-fields` | Claude 3.5 Sonnet | Structured case data extraction |
| `kb-search-assistant` | Gemini 2.5 Pro | KB search reasoning |
| `legal-practice-enrich` | GPT-4.1-mini | Practice KB enrichment |
| `legal-practice-import` | Gemini 2.5 Pro | Practice import with JSON output |

#### RAG / Knowledge Base Layer
| Function | Purpose |
|----------|---------|
| `kb-search` | Vector search in legislation KB |
| `kb-unified-search` | Unified search across all KBs |
| `vector-search` | General vector search |
| `embeddings-generate` | Text embedding generation |
| `ingest-document` | Document ingestion pipeline |
| `legal-chunker` | Document chunking |
| `legal-document-normalizer` | Document normalization |
| `kb-import` | Bulk KB import |
| `kb-scrape-batch` | Web scraping for KB |
| `kb-fetch-pdf-content` | PDF content extraction |
| `kb-get-chunk` | Single chunk retrieval |
| `kb-table-screenshots` | Table extraction from docs |
| `norm-ref-extractor` | Legal norm reference extraction |

#### Data Pipeline
| Function | Purpose |
|----------|---------|
| `pipeline-tick` | Pipeline orchestration tick |
| `practice-pipeline-orchestrator` | Practice KB pipeline |
| `practice-chunk-enqueue` | Queue chunking jobs |
| `practice-chunk-worker` | Process chunk jobs |
| `practice-embed-worker` | Process embedding jobs |
| `practice-ai-enrich-worker` | Process AI enrichment |
| `rechunk-backfill` | Backfill chunking |
| `legal-practice-import` | Import legal practice data |
| `echr-import` | ECHR cases import |
| `dictionary-import-run` | Dictionary import |
| `dictionary-import-validate` | Validate dictionary import |
| `ocr-process` | OCR document processing |
| `audio-transcribe` | Audio transcription (Whisper) |

#### Admin Functions
| Function | Purpose |
|----------|---------|
| `admin-create-user` | Create user accounts |
| `admin-delete-user` | Delete user accounts |
| `admin-reset-password` | Reset user passwords |
| `admin-ai-chat` | Admin AI assistant |
| `export-data` | Data export |
| `data-sync-to-live` | Sync data to production |
| `eval-runner` | Run evaluation suites |

#### Notifications/Integrations
| Function | Purpose |
|----------|---------|
| `send-telegram-notification` | Telegram push notifications |
| `telegram-webhook` | Incoming Telegram messages |
| `process-reminder-notifications` | Scheduled reminder processing |
| `translate-to-armenian` | Translation service |

#### Shared Libraries (`_shared/`)
| Module | Purpose |
|--------|---------|
| `openai-router.ts` | Central AI model routing |
| `gateway-bypass.ts` | Direct AI gateway calls |
| `prompt-armor.ts` | Prompt injection protection |
| `pii-redactor.ts` | PII redaction in logs |
| `rag-search.ts` | RAG retrieval utilities |
| `token-budget.ts` | Token budget management |
| `safe-logger.ts` | Sanitized logging |
| `edge-security.ts` | CORS + security headers |
| `rate-limiter.ts` | Rate limiting |
| `chunker.ts` | Text chunking logic |
| `embeddings.ts` | Embedding utilities |
| `ai-provider.ts` | AI provider abstraction |

---

## 4. Dependency Map

### Frontend Critical Dependencies
- `@supabase/supabase-js` — database, auth, storage, functions client
- `@tanstack/react-query` — server state management
- `react-router-dom` — client-side routing
- `react-hook-form` + `zod` — form validation
- `@tiptap/*` — rich text editor (for document editing)
- `jspdf` + `docx` — PDF and Word export
- `i18next` + `react-i18next` — internationalization
- `gpt-3-encoder` — token counting
- `pdf-parse` — PDF text extraction (client-side)

### AI Model Dependencies (via Gateway)
- `anthropic/claude-3.5-sonnet` — primary legal reasoning
- `google/gemini-2.5-pro` — JSON-mode structured output
- `openai/gpt-4.1-mini` — enrichment utilities
- `openai/text-embedding-*` — vector embeddings

### External Integrations
- Telegram Bot API — notifications
- ARLIS (Armenian legal database) — content import
- ECHR case database — European court cases

---

## 5. Auth & Role Architecture

```
Supabase Auth (email/password)
    ↓
profiles table (id, full_name, avatar_url, ...)
    ↓
user_roles table (user_id, role: app_role enum)
    ↓
has_role(user_id, role) — SQL RPC function
get_user_roles(user_id) — SQL RPC function
    ↓
ProtectedRoute.tsx → requiredRole prop
    ↓
role enforcement: admin | lawyer | client | auditor

Login domain: username@app.internal (internal auth only)
Admin login: separate /admin/login route
```

**Critical observation:** JWT verify is disabled for 3 functions:
- `send-telegram-notification` — `verify_jwt = false`
- `process-reminder-notifications` — `verify_jwt = false`
- `telegram-webhook` — `verify_jwt = false`
- `extract-case-form-fields` — `verify_jwt = false`

---

## 6. Knowledge Base Architecture

```
Two-KB system:
1. legislation_kb (knowledge_base + knowledge_base_chunks tables)
   → Armenian legislation: Criminal Code, Civil Code, etc.
   → Chunked + embedded with pgvector

2. legal_practice_kb (legal_practice_kb + legal_practice_kb_chunks tables)
   → Cassation Court + ECHR precedents
   → Enriched with AI (legal-practice-enrich)
   → decision_map, echr_article fields

Vector search: pgvector (similarity search)
Embedding model: openai/text-embedding-* (via embeddings-generate)
Retrieval: rag-search.ts → searchKB() + searchPractice()
```

---

## 7. Critical Zones (Risk Areas)

| Zone | Risk Level | Notes |
|------|-----------|-------|
| JWT-disabled functions | HIGH | 4 functions accept unauthenticated requests |
| LOVABLE_API_KEY | HIGH | Single key for all AI calls — no per-function isolation |
| PII in encrypted_pii table | HIGH | Encryption key management not visible in code |
| 185 migrations (no rollback plan visible) | MEDIUM | Large migration history, hard to rollback |
| AI model routing (gateway-bypass) | MEDIUM | If gateway is down, all AI features fail |
| Single-tenant vs multi-tenant ambiguity | MEDIUM | Teams exist but ownership isolation not clear |
| Telegram webhook (no JWT) | MEDIUM | Relies on Telegram signature verification only |
| Script directory (40+ operational scripts) | MEDIUM | Many raw scripts with direct DB access — cleanup needed |
| test files mixed with prod code | LOW-MEDIUM | `.test.ts` files in `_shared/` — should be CI-only |
| `data/` directory (large batch files) | LOW | May contain sensitive legal data |

---

## 8. Architecture Verdict

**Overall architecture: SOLID with identifiable risks.**

The system is a well-structured legal AI SaaS with:
- Clear separation of frontend / backend / AI layer
- Proper role-based access control in routing
- Dual-KB RAG system (legislation + practice)
- Mature pipeline for data ingestion (ARLIS, ECHR)
- Centralized AI model governance (MODEL_MAP)
- Security tooling: prompt-armor, PII redactor, rate-limiter, safe-logger

**Critical issues to address before sale:**
1. JWT-disabled edge functions — verify necessity and add alternative auth
2. LOVABLE_API_KEY scope and rotation policy
3. PII encryption key management review
4. Clean up `scripts/` directory (40+ operational scripts, not production code)
5. Clarify data/tenant isolation boundaries
6. Review `data/` directory contents for sensitive data

---

*Audit continues: Task 02 → End-to-End System Logic Analysis*

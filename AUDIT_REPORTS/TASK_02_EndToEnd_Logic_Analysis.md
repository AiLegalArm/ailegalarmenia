# Task 02 — End-to-End System Logic Analysis
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6

---

## 1. System User Scenarios (Intended vs. Actual)

### Scenario A: Lawyer — Case Management + AI Analysis

**Intended flow:**
1. Lawyer logs in → Dashboard → sees only their own cases → creates/edits cases → uploads files → runs AI analysis → generates legal document or complaint

**Actual implementation:**
1. Login: `signInWithPassword()` via Supabase Auth → session stored → `useAuth()` hook fetches roles via `get_user_roles()` RPC
2. Dashboard: `useCases()` query fetches cases via Supabase with RLS — BUT: **no explicit role filter in the client query**. RLS enforces `lawyer_id = auth.uid()` at DB level ✓
3. Case creation: `createCase()` mutation with auto-duplicate-number retry logic ✓
4. File upload: direct to Supabase Storage, 50MB limit enforced client-side ✓ (no server-side enforcement — see Issue #1)
5. AI Analysis: `useMultiAgentAnalysis.runAgent()` → `supabase.functions.invoke('multi-agent-analyze')` → Claude 3.5 Sonnet via AI Gateway
6. Complaint generation: `ComplaintWizard` → `analyze-files-for-complaint` + `generate-complaint` → returns structured text ✓
7. Document export: PDF via `jspdf`, Word via `docx` library — **client-side generation** (no server signature, no watermark)

**Gap #1 — File size enforcement:** 50MB is client-side only. Edge function `ingest-document` or Storage RLS could bypass this.

**Gap #2 — Document authenticity:** Generated documents have no server-side signing, no audit trail in `generated_documents` table verified at export time.

---

### Scenario B: Client — View Their Cases

**Intended flow:** Client logs in → sees only their own cases (read-only) → can view files, comments → cannot create cases or run AI

**Actual implementation:**
- RLS: `client_id = auth.uid()` for case SELECT ✓
- Dashboard does NOT show "Create case" or "Run AI analysis" for clients — controlled by `isClient` flag from `useAuth()` ✓
- KB access: `knowledge_base` RLS = "Everyone can read active KB" — clients can read KB documents ✓ (likely intended)
- **Gap #3:** No explicit read-only enforcement for files and comments at component level — relies entirely on RLS. If RLS has gaps, client could access data.

---

### Scenario C: Admin — User & System Management

**Intended flow:** Admin logs in via `/admin/login` → `AdminPanel` → manages users, KB, prompts, AI evaluation, data sync

**Actual implementation:**
- Separate admin login route with `requiredRole="admin"` guard ✓
- `AdminPanel` has tabs: User Management, KB, Legal Practice KB, AI Chat, Prompt Manager, Data Migration, Eval
- User operations via `admin-create-user`, `admin-delete-user`, `admin-reset-password` edge functions ✓
- Prompt management: `PromptManager` + `PromptFilesEditor` → writes to `ai_prompts` table ✓
- **Gap #4:** `data-sync-to-live` function — scope and safety not verified. Name suggests it syncs from staging to production — **critical function that could overwrite live data**.

---

### Scenario D: Legal Chat (AI Assistant)

**Intended flow:** Any logged-in user → opens chat bubble → asks legal question → AI responds with RA law citations

**Actual implementation:**
1. `LegalChatBot` component calls `legal-chat` edge function directly via `fetch()` (not `supabase.functions.invoke()`) — streams response
2. Passes `Authorization: Bearer {session.access_token}` ✓
3. `legal-chat` calls `searchKB()` + `searchPractice()` from `rag-search.ts` → vector search in two KBs
4. Formats context + passes to Claude 3.5 Sonnet via AI gateway
5. Returns streamed text response
6. References extracted via `parseReferencesText()` and shown in UI

**Verified alignment:** This flow appears functionally correct. The RAG layer properly separates legislation vs practice indexes.

**Gap #5:** Chat history is NOT persisted to database (only in-memory React state). If user refreshes, conversation is lost. No audit trail of AI chat responses.

---

### Scenario E: Knowledge Base Import Pipeline

**Intended flow:** Admin uploads docs → system chunks → embeds → stores in pgvector → searchable by AI functions

**Actual implementation:**
```
Upload → ingest-document (normalization) → legal-chunker (chunking)
       → embeddings-generate (OpenAI embeddings) → stored in knowledge_base_chunks
       → vector-search (pgvector similarity search) used by rag-search.ts
```

**Gap #6:** Pipeline is multi-step with separate edge functions. No atomic transaction wrapping. If embedding step fails, doc is partially ingested (normalized + chunked but not embedded) — creates "dead" chunks.

**Gap #7:** Practice KB pipeline (practice-pipeline-orchestrator) adds AI enrichment step (`legal-practice-enrich` with GPT-4.1-mini). Enrichment quality is not validated before writing to DB.

---

### Scenario F: Telegram Integration

**Intended flow:** Users link Telegram → receive reminders/notifications via bot → can upload files via Telegram

**Actual implementation:**
- `telegram-webhook` receives messages (NO JWT verify) → processes uploads
- `send-telegram-notification` (NO JWT verify) → sends push
- `process-reminder-notifications` (NO JWT verify) → scheduled job trigger
- **Gap #8:** No Telegram signature verification found in `telegram-webhook`. Only relies on URL secrecy. This is a HIGH SECURITY RISK — any entity knowing the webhook URL can trigger the function.

---

## 2. Data Flow Map

```
USER ACTION → FRONTEND HOOK → SUPABASE CLIENT → EDGE FUNCTION → AI GATEWAY
                                     ↓                ↓
                              POSTGRES (RLS)    KNOWLEDGE BASE
                                     ↓                ↓
                              STORAGE (Files)  VECTOR SEARCH (pgvector)
```

---

## 3. Logic Mismatches Summary

| # | Type | Location | Severity |
|---|------|----------|---------|
| 1 | Gap | File upload size — client-side only | MEDIUM |
| 2 | Gap | Generated documents not signed/auditable | MEDIUM |
| 3 | Gap | Client access relies 100% on RLS, no defense-in-depth | MEDIUM |
| 4 | Gap | `data-sync-to-live` scope undefined — potential data overwrite | HIGH |
| 5 | Gap | Chat history not persisted — no AI response audit trail | MEDIUM |
| 6 | Gap | KB pipeline not atomic — partial ingestion on failure | HIGH |
| 7 | Gap | AI enrichment quality not validated before DB write | MEDIUM |
| 8 | Security | Telegram webhook has no signature verification | HIGH |
| 9 | Gap | `extract-case-form-fields` runs without JWT — purpose unclear | HIGH |

---

## 4. System Logic Verdict

**Will the system work as designed?**

**Mostly YES — but with critical gaps:**

- Core lawyer flow (case management + AI analysis) works end-to-end ✓
- RLS is in place and correctly structured for the role model ✓
- RAG pipeline is architecturally sound ✓
- Legal chat streaming works ✓

**Issues that could block commercial use:**
1. Telegram webhook security (no signature check) — easy exploit vector
2. `extract-case-form-fields` without JWT — must investigate
3. KB pipeline atomicity — orphaned chunks will degrade retrieval quality over time
4. `data-sync-to-live` undefined risk

---

*Audit continues: Task 03 → Full Functionality Audit*

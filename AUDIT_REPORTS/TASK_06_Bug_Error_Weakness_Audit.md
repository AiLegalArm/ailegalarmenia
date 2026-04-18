# Task 06 — Bug, Error, and Weakness Audit
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6

---

## Master Bug Register

### 🔴 CRITICAL

| ID | Title | Location | Impact |
|----|-------|----------|--------|
| BUG-C1 | Cost tracking broken — Claude models not in MODEL_PRICING map | `_shared/rate-limiter.ts` | Monthly cost budget caps non-functional for primary AI models |
| BUG-C2 | ai-analyze, multi-agent hardcoded cost = `tokens × 0.000001` | `ai-analyze/index.ts:1271`, `multi-agent-analyze/index.ts:752,809,1001` | Stored cost ~3–15× lower than real. Budget tracking wrong. Operators cannot control spend |

---

### 🔴 HIGH

| ID | Title | Location | Impact |
|----|-------|----------|--------|
| BUG-H1 | `getClaims()` used instead of `getUser()` in 5 functions | `admin-ai-chat`, `dictionary-import-run`, `dictionary-import-validate`, `dictionary-search`, `extract-case-form-fields` | JWT validated by signature only — no server-side revocation check |
| BUG-H2 | `eval-runner` no role restriction — any authenticated user can trigger AI evals | `eval-runner/index.ts` | AI credit abuse by non-admin users |
| BUG-H3 | `data-sync-to-live` no dry-run/rollback mode | `data-sync-to-live/index.ts` | One wrong call corrupts production data |
| BUG-H4 | KB pipeline not atomic — partial ingestion on embedding failure | `ingest-document → legal-chunker → embeddings-generate` chain | Orphaned chunks without embeddings, degraded retrieval quality |

---

### 🟡 MEDIUM

| ID | Title | Location | Impact |
|----|-------|----------|--------|
| BUG-M1 | `verify_jwt = false` for 7 functions that do manual JWT check | `config.toml` | Supabase infra-level JWT check bypassed, relies solely on manual check |
| BUG-M2 | File upload size limit client-side only (50MB) | `Dashboard.tsx:MAX_UPLOAD_SIZE` | Users can bypass by uploading directly to Storage API |
| BUG-M3 | Audio transcription — no deduplication | `audio-transcribe/index.ts` | Duplicate jobs, duplicate DB records |
| BUG-M4 | Chat history not persisted — no AI response audit trail | `LegalChatBot.tsx` | Audit/compliance gap; conversation lost on page refresh |
| BUG-M5 | Soft-delete in `cases` but hard-delete cascade on `agent_analysis_runs` | DB migrations | Deleted cases still CASCADE-delete agent analysis data permanently |
| BUG-M6 | 39 TypeScript `as any` / `@ts-ignore` suppressions in frontend | Various components | Runtime type safety holes, potential undefined errors |
| BUG-M7 | Deprecated `model-config.ts` file still exists in `_shared/` | `_shared/model-config.ts` | Confusion, potential dead import |
| BUG-M8 | `vector-search` is single point of failure for all AI functions | Architecture | Any vector-search downtime breaks legal-chat, ai-analyze, multi-agent |
| BUG-M9 | 170 raw `console.log/console.warn` in edge functions | Various edge functions | Operational data leaks to Supabase logs, inconsistent with safe-logger |
| BUG-M10 | OCR rate limit backoff hardcoded at 30s | `BulkOcrButton.tsx` | No exponential backoff — may still hit rate limits repeatedly |

---

### 🟢 LOW

| ID | Title | Location | Impact |
|----|-------|----------|--------|
| BUG-L1 | Generated documents not stored in `generated_documents` table at export | `pdfExport*.ts`, `docx` generation | No post-export audit trail |
| BUG-L2 | Background queue in-memory only — lost on page refresh | `useBackgroundQueue.tsx` | Long queued tasks disappear on browser refresh |
| BUG-L3 | Password shown in plaintext in admin UI after creation | `UserManagement.tsx:787` | Expected admin UX, but password stays in React state |
| BUG-L4 | `gpt-3-encoder` package used client-side for token counting | `package.json` | Outdated OpenAI tokenizer — imprecise for Claude/Gemini models |
| BUG-L5 | Scripts directory contains 50+ operational scripts mixed with prod repo | `/scripts/` | Sensitive script exposure in codebase |

---

## 2. Severity Matrix

```
CRITICAL: Must fix before any commercial use
  BUG-C1, BUG-C2 — Cost tracking fundamentally broken

HIGH: Must fix before commercial deployment  
  BUG-H1, BUG-H2, BUG-H3, BUG-H4

MEDIUM: Should fix before sale, acceptable with workarounds
  BUG-M1 through BUG-M10

LOW: Post-sale backlog acceptable
  BUG-L1 through BUG-L5
```

---

## 3. Root Cause Analysis

### BUG-C1 + BUG-C2: Cost Tracking System (Root Cause)

**Root cause:** The project began with OpenAI models (GPT-5, Gemini) in the pricing map, then migrated to Claude 3.5 Sonnet as primary model — but `MODEL_PRICING` was never updated.

Two separate failures compound:
1. `checkRateLimits()` in `rate-limiter.ts` → monthly cost limit cannot fire for Claude
2. `log_api_usage` in `ai-analyze` / `multi-agent-analyze` → hardcodes `cost = tokens × 0.000001` instead of calling `computeCost()` from `rate-limiter.ts`

**Actual Claude 3.5 Sonnet pricing (approximate via gateway):**
- Input: ~$0.003/1K tokens
- Output: ~$0.015/1K tokens  
- Current hardcoded: $0.001/1K total

**Underestimation: 3–15× depending on output/input ratio.**

---

### BUG-H1: `getClaims()` vs `getUser()`

**Root cause:** `auth.getClaims()` is a client-side JWT decode that validates signature only. `auth.getUser()` makes a round-trip to the Supabase auth server to verify the token is not revoked. If a user is deleted or their session is revoked, `getClaims()` will still return valid data until the JWT expires.

**Affected functions:** admin-ai-chat, dictionary-import-run, dictionary-import-validate, dictionary-search, extract-case-form-fields.

**Fix:** Replace `supabase.auth.getClaims(token)` with `supabase.auth.getUser(token)` in all 5 functions.

---

### BUG-H4: KB Pipeline Atomicity

**Root cause:** The pipeline is split across 3 separate edge functions called in sequence. Each is a separate HTTP request. If `embeddings-generate` fails (network timeout, AI gateway error), the document is in `knowledge_base` and `knowledge_base_chunks` tables but has no vector embeddings. Subsequent RAG searches won't find it.

**Fix:** Track embedding status in a dedicated column (`embedding_status: pending | completed | failed`) and build a backfill mechanism.

---

## 4. Architectural Weaknesses

1. **No health check endpoint** — no way to verify system operational status without a real user action.
2. **No circuit breaker for AI gateway** — if AI gateway is down, all user-facing AI calls fail with unhandled errors.
3. **No request ID propagation in frontend** — frontend cannot correlate its requests with edge function logs for debugging.
4. **Supabase edge function cold starts** — no warm-up strategy for latency-sensitive legal-chat.

---

## 5. Fixes Required in Task 07

Priority order:
1. **FIX-1:** Add Claude model pricing to `MODEL_PRICING` in `rate-limiter.ts` ← CRITICAL
2. **FIX-2:** Replace hardcoded cost in `ai-analyze` and `multi-agent-analyze` with `computeCost()` ← CRITICAL  
3. **FIX-3:** Replace `getClaims()` with `getUser()` in 5 edge functions ← HIGH
4. **FIX-4:** Add admin role guard to `eval-runner` ← HIGH
5. **FIX-5:** Add KB pipeline `embedding_status` tracking column (as migration) ← HIGH

---

*Audit continues: Task 07 → Iterative Fix and Validation Cycle*

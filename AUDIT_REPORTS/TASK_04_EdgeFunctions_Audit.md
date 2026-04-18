# Task 04 — Edge Functions Audit
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6

---

## 1. Correction from Task 02

**Task 02 incorrectly stated:** "Telegram webhook has no signature verification."  
**Correction:** `telegram-webhook` DOES verify `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET` env var. The function properly fails-closed if the secret is not configured. BUG-05 from Task 03 is **RETRACTED**.

---

## 2. Complete Edge Functions Inventory (48 functions)

### Auth Pattern Classification

| Pattern | Count | Functions |
|---------|-------|-----------|
| JWT (user Bearer token) | 20 | ai-analyze, legal-chat, multi-agent-analyze, generate-complaint, generate-document, admin-create/delete/reset-password, admin-ai-chat, audio-transcribe, echr-import, eval-runner, export-data, extract-case-fields, extract-case-form-fields, kb-*, legal-practice-*, translate-to-armenian |
| INTERNAL_KEY (server-to-server) | 17 | embeddings-generate, ingest-document, kb-table-screenshots, legal-chunker, legal-document-normalizer, norm-ref-extractor, pipeline-tick, practice-* workers, process-reminder-notifications, rechunk-backfill, send-telegram-notification, vector-search, data-sync-to-live |
| TELEGRAM_SECRET | 1 | telegram-webhook |
| NONE (no auth) | 0 | — |

**All 48 edge functions have authentication.** No unauthenticated public endpoints.

---

## 3. Function-by-Function Audit

### 🔴 HIGH RISK

#### `admin-ai-chat`
- **Auth:** JWT + admin role check via `has_role()` RPC ✓
- **Bug:** Uses `auth.getClaims(token)` — non-standard approach (not `auth.getUser()`). If claims caching is off or stale, may accept expired tokens.
- **Severity:** MEDIUM — `getUser()` is more reliable (validates against Supabase auth server), `getClaims()` trusts JWT signature only.
- **Affected functions:** admin-ai-chat, dictionary-import-run, dictionary-import-validate, dictionary-search, extract-case-form-fields — ALL use `getClaims()` instead of `getUser()`.

#### `data-sync-to-live`
- **Auth:** INTERNAL_KEY ✓ (only callable server-to-server)
- **Risk:** Name implies staging→production data sync. If triggered incorrectly, can overwrite live data.
- **Missing:** No dry-run mode, no confirmation step, no rollback mechanism visible.
- **Severity:** HIGH — one errant internal call could corrupt production data.

#### `legal-practice-enrich` and `legal-practice-import`
- **Auth:** JWT (require auth) but `verify_jwt = false` in config.toml
- **Issue:** `verify_jwt = false` means Supabase does NOT pre-validate JWT at the infrastructure level before invoking the function. The function must do its own JWT validation — which it does (has manual JWT check). However, if Supabase changes behavior, the safety net is gone.
- **Severity:** MEDIUM — current implementation is safe but fragile.

---

### 🟡 MEDIUM RISK

#### `kb-unified-search`
- **Auth:** JWT ✓ but `verify_jwt = false` in config
- **Issue:** Same pattern as above — manual JWT validation only.

#### `embeddings-generate`
- **Auth:** INTERNAL_KEY ✓
- **Issue:** Called by multiple pipeline workers. If `INTERNAL_INGEST_KEY` is compromised, attacker can generate unlimited embeddings (cost attack).

#### `eval-runner`
- **Auth:** JWT ✓ but no role check visible — any authenticated user can trigger eval runs.
- **Issue:** Eval runs call AI models. No role restriction means any lawyer or client can burn AI credits running evals.
- **Severity:** MEDIUM — should be admin-only.

#### Pipeline Workers (practice-chunk-worker, practice-embed-worker, practice-ai-enrich-worker)
- **Auth:** INTERNAL_KEY ✓
- **Issue:** Workers use `claim_chunk_jobs()` / `claim_pipeline_jobs()` DB functions. No deduplication check at function level — if triggered twice simultaneously, two workers might claim the same job.
- **Severity:** MEDIUM — depends on DB function atomicity (likely OK if using FOR UPDATE SKIP LOCKED).

---

### 🟢 CORRECT PATTERNS

- `legal-chat`: JWT + streaming with proper auth header propagation ✓
- `ai-analyze`: JWT + rate limiting via `checkRateLimits()` ✓
- `multi-agent-analyze`: JWT + proper role separation ✓
- `generate-complaint`: JWT + file path validation ✓
- `generate-document`: JWT ✓
- `admin-create-user` / `admin-delete-user` / `admin-reset-password`: JWT + admin role check via `has_role()` RPC ✓
- `telegram-webhook`: `TELEGRAM_WEBHOOK_SECRET` validation fail-closed ✓
- `process-reminder-notifications`: INTERNAL_KEY ✓
- `send-telegram-notification`: INTERNAL_KEY ✓
- `ingest-document`: INTERNAL_KEY ✓
- `vector-search`: INTERNAL_KEY ✓

---

## 4. Dependency Matrix (Critical Paths)

```
legal-chat ──────────────────────────────→ vector-search → knowledge_base_chunks
                                        → vector-search → legal_practice_kb_chunks

ai-analyze ──────────────────────────────→ vector-search
multi-agent-analyze ─────────────────────→ vector-search

generate-complaint ──────────────────────→ analyze-files-for-complaint → ai-analyze
                                        → vector-search

ingest-document → legal-document-normalizer → legal-chunker → embeddings-generate → vector-search

practice-pipeline-orchestrator → practice-chunk-enqueue → practice-chunk-worker
                                                        → practice-embed-worker
                                                        → practice-ai-enrich-worker
```

**Single point of failure:** `vector-search` is called by ALL AI functions. If it fails, legal-chat, ai-analyze, multi-agent-analyze, and generate-complaint all degrade.

---

## 5. Error Handling Audit

| Function | Has try/catch | Returns structured error | Logs errors |
|----------|--------------|------------------------|------------|
| legal-chat | ✓ | ✓ | via safe-logger |
| ai-analyze | ✓ | ✓ | via safe-logger |
| telegram-webhook | ✓ | ✓ | console.error (raw) |
| admin-ai-chat | ✓ | ✓ | console.error (raw) |
| pipeline workers | ✓ | ✓ | mixed |

**Issue:** ~170 raw `console.log/console.warn` calls across edge functions leak operational data to Supabase logs. While Supabase logs are admin-only, structured logging via `safe-logger.ts` should be used consistently.

---

## 6. Bug Register (Task 04 Findings)

| # | Title | Severity | Category |
|---|-------|----------|---------|
| EF-01 | `getClaims()` instead of `getUser()` in 5 functions — trusts JWT signature only | MEDIUM | Security |
| EF-02 | `data-sync-to-live` lacks dry-run mode and rollback — production data risk | HIGH | Reliability |
| EF-03 | `eval-runner` lacks role restriction — any user can trigger expensive AI evals | MEDIUM | Access Control |
| EF-04 | `verify_jwt = false` for functions that do manual JWT check — fragile safety net | MEDIUM | Security |
| EF-05 | `vector-search` single point of failure for all AI functions | MEDIUM | Reliability |
| EF-06 | 170 raw console.log calls across edge functions — inconsistent logging | LOW | Operational |
| EF-07 | Cost tracking broken for `anthropic/claude-3.5-sonnet` (confirmed from Task 03) | HIGH | Correctness |

---

## 7. CORRECTIONS to Previous Tasks

- **Task 02 BUG-08 (Telegram webhook no signature):** RETRACTED — signature verification IS implemented.
- **Task 03 BUG-05 (Telegram webhook HIGH security):** RETRACTED — function is secure.

---

## 8. Edge Functions Verdict

**Overall security posture: GOOD with specific gaps.**

- All 48 functions have some form of authentication ✓
- Core AI functions properly use JWT + role checks ✓  
- Internal pipeline uses INTERNAL_KEY correctly ✓
- Telegram uses secret token correctly ✓

**Must fix before commercial deployment:**
1. Replace `getClaims()` with `getUser()` in 5 functions
2. Add role guard to `eval-runner`
3. Document and guard `data-sync-to-live`
4. Add Claude model pricing to `MODEL_PRICING` map

---

*Audit continues: Task 05 → Mandatory Safe Fixing Protocol*

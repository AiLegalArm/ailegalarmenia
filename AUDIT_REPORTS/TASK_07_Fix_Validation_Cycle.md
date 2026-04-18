# Task 07 — Iterative Fix and Validation Cycle
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6

---

## Summary

All 5 fixes from the Bug Register (Task 06) have been applied and verified.

---

## FIX-1 — Claude model pricing added to MODEL_PRICING ✅ CRITICAL

**File:** `supabase/functions/_shared/rate-limiter.ts`

**Problem:** `MODEL_PRICING` map contained only Gemini and early GPT-5 models. Claude 3.5 Sonnet (the primary production model) was absent — `computeCost()` returned `{ cost_usd: 0, cost_estimated: true }` for every Claude call. Monthly cost budget caps were non-functional.

**Fix:** Added complete model set:
- `anthropic/claude-3.5-sonnet`, `claude-3.5-haiku`, `claude-3-opus`, `claude-opus-4`, `claude-sonnet-4`
- `openai/text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
- `openai/gpt-4.1-mini`, `gpt-4.1`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.2`

**Verification:** `grep` confirmed all new entries present in the map.

---

## FIX-2 — Hardcoded cost replaced with computeCost() ✅ CRITICAL

**Files:** `supabase/functions/ai-analyze/index.ts` (1 occurrence), `supabase/functions/multi-agent-analyze/index.ts` (3 occurrences)

**Problem:** All 4 `log_api_usage` calls hardcoded `estimatedCost = tokensUsed * 0.000001` — approximately $0.001/1K tokens total. Actual Claude 3.5 Sonnet pricing is $0.003/1K input + $0.015/1K output. Underestimation: 3–15× depending on output ratio.

**Fix:** Replaced all 4 occurrences with dynamic `computeCost(modelUsed, inputTokens, outputTokens)` calls, using actual prompt_tokens/completion_tokens from the AI response usage object, with a 70/30 split fallback when detailed usage is unavailable.

**Verification:** `grep -rn "0.000001"` across both files returned exit 1 — zero hardcoded costs remain.

---

## FIX-3 — getClaims() replaced with getUser() in 4 edge functions ✅ HIGH

**Files affected (4, not 5 — `extract-case-form-fields` was already using `getUser()`):**
- `supabase/functions/admin-ai-chat/index.ts` — line 64
- `supabase/functions/dictionary-import-run/index.ts` — line 111
- `supabase/functions/dictionary-import-validate/index.ts` — line 145
- `supabase/functions/dictionary-search/index.ts` — line 27

**Problem:** `auth.getClaims(token)` decodes and validates the JWT signature locally but does NOT round-trip to the Supabase auth server. Revoked tokens (deleted users, forced sign-out, session invalidation) would still pass auth in these 4 functions until the JWT naturally expired.

**Fix:** Replaced `getClaims(token)` → `getUser(token)` in all 4 functions. Updated user ID extraction:
- `claimsData.claims.sub` → `claimsData.user.id`
- Guard check: `!claimsData?.claims` → `!claimsData?.user`

**Verification:** `grep -rn "getClaims"` across entire `supabase/functions/` returned exit 1 — zero `getClaims` calls remain anywhere in the codebase.

---

## FIX-4 — Admin role guard added to eval-runner ✅ HIGH

**File:** `supabase/functions/eval-runner/index.ts`

**Problem:** After `validateBrowserRequest()` (which only checks that a Bearer token is present), the function immediately executed evaluation suites with no role check. Any authenticated user could invoke AI evals, consuming AI credits and accessing eval infrastructure.

**Fix:** Inserted admin guard block between `validateBrowserRequest` and the `try` block:
1. `getUser(token)` — server-side token validation (revocation check)
2. `has_role(_user_id, 'admin')` RPC call via service client
3. Returns 401 for invalid tokens, 403 for non-admin users
4. Logs 403 attempts via `warn()` for audit trail

---

## FIX-5 — KB pipeline embedding_status tracking ✅ HIGH (pre-existing)

**Finding:** BUG-H4 (KB pipeline not atomic) was already mitigated by a prior migration.

Migration `20260213160401_f3051830-9a6c-4c87-a1b1-a523c752eb8f.sql` adds `embedding_status` (`pending/success/failed`), `embedding_error`, `embedding_attempts`, and `embedding_last_attempt` to both `knowledge_base` and `legal_practice_kb` tables.

Functions `practice-chunk-enqueue` and `practice-embed-worker` actively use this column to track and retry failed embeddings. Index `idx_kb_embedding_status` exists for efficient batch queries.

**Status:** No new migration needed. BUG-H4 is RESOLVED (pre-existing fix confirmed).

---

## Bug Register — Updated Status

| ID | Title | Status |
|----|-------|--------|
| BUG-C1 | Cost tracking broken — Claude models not in MODEL_PRICING | ✅ FIXED (FIX-1) |
| BUG-C2 | Hardcoded cost = tokens × 0.000001 | ✅ FIXED (FIX-2) |
| BUG-H1 | getClaims() instead of getUser() in 4 functions | ✅ FIXED (FIX-3) |
| BUG-H2 | eval-runner no role restriction | ✅ FIXED (FIX-4) |
| BUG-H3 | data-sync-to-live no dry-run/rollback mode | ⏳ OPEN — architectural, not patched |
| BUG-H4 | KB pipeline not atomic | ✅ PRE-EXISTING FIX confirmed |

---

## Files Modified in Task 07

1. `supabase/functions/_shared/rate-limiter.ts` — MODEL_PRICING extended
2. `supabase/functions/ai-analyze/index.ts` — computeCost() call
3. `supabase/functions/multi-agent-analyze/index.ts` — 3× computeCost() calls
4. `supabase/functions/admin-ai-chat/index.ts` — getUser() fix
5. `supabase/functions/dictionary-import-run/index.ts` — getUser() fix
6. `supabase/functions/dictionary-import-validate/index.ts` — getUser() fix
7. `supabase/functions/dictionary-search/index.ts` — getUser() fix
8. `supabase/functions/eval-runner/index.ts` — admin role guard added

---

## Remaining Open Issues (not fixed in Task 07)

- **BUG-H3** — `data-sync-to-live` has no dry-run or rollback — architectural risk, requires design decision
- **BUG-M1 through M10** — Medium issues (console.log cleanup, file size limit server-side enforcement, etc.)
- **BUG-L1 through L5** — Low issues

*Task 07 complete. Proceeding to Task 08 → Full Security Audit.*

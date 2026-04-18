# Task 12 — Dead Code and Project Garbage Audit
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6  
**Total Identified for Removal: ~11.5MB across 54 items**

---

## Summary

No critical dead code threatens system stability. The largest waste is build artifacts, unused shadcn/ui components, and one-time migration scripts that have completed their purpose. No duplicate npm dependencies found.

---

## Category 1 — Unused UI Components (16 files, ~200KB)

All 16 components are from the shadcn/ui library — installed but never imported anywhere in the codebase.

| Component | Location |
|-----------|----------|
| aspect-ratio.tsx | src/components/ui/ |
| breadcrumb.tsx | src/components/ui/ |
| carousel.tsx | src/components/ui/ |
| chart.tsx | src/components/ui/ |
| command.tsx | src/components/ui/ |
| context-menu.tsx | src/components/ui/ |
| drawer.tsx | src/components/ui/ |
| hover-card.tsx | src/components/ui/ |
| input-otp.tsx | src/components/ui/ |
| menubar.tsx | src/components/ui/ |
| navigation-menu.tsx | src/components/ui/ |
| pagination.tsx | src/components/ui/ |
| resizable.tsx | src/components/ui/ |
| sidebar.tsx | src/components/ui/ |
| slider.tsx | src/components/ui/ |
| toggle-group.tsx | src/components/ui/ |

**Safe to remove:** YES. No imports found across entire `src/`. Verified by grep.

---

## Category 2 — Orphaned Shared Edge Function Modules

| Module | Status | Evidence |
|--------|--------|---------|
| `_shared/embedding-segmentation.ts` | DEAD | Zero imports across all edge functions |
| `_shared/model-config.ts` | DEPRECATED | Comments in 8+ functions: "model-config import removed — all AI calls routed via openai-router.ts" |

**`embedding-segmentation.ts`:** Safe to remove (NEEDS_VERIFICATION — grep one more time before deleting).

**`model-config.ts`:** File is preserved for reference only. Flagged in BUG-M7 (Task 06). Safe to archive or delete once final confirmation that openai-router.ts is the sole routing path.

---

## Category 3 — Build and Temporary Artifacts

| Item | Size | Status |
|------|------|--------|
| `dist/` | 8.6MB | Old production build — should not be in repository |
| `output/` | 2MB | Test cache, language model run results (gemma4, noop), translation cache |
| `temp/` | 92KB | Chunker build outputs, test content, pipeline status files |

**All three are safe to delete.** These are ephemeral artifacts that should never be committed to version control. Add `dist/`, `output/`, `temp/` to `.gitignore` if not already present.

---

## Category 4 — Completed One-Time Migration Scripts (30+ files, ~240KB)

Located in `scripts/`. These scripts completed their purpose (bulk import, embedding backfill, ECHR data processing) and are no longer operationally needed.

**Safe to archive/remove:**
- `echr_full_workflow.py` (51KB) — one-time ECHR import, complete
- `generate_arlis_embedding_json.py` (30KB) — one-time embedding prep
- `convert_arlis_legal_practice.py` (18KB) — one-time format conversion
- `backfill-embedding-legacy-768.ts` (18KB) — legacy embedding backfill (768-dim, superseded)
- All `run_arlis_*.py` scripts (6 files, 5–7KB each) — one-time batch runs
- All `load_echr_*.py` scripts (3 files) — one-time data load
- General one-time embedding loaders (10+ files)

**Scripts worth keeping:**
- `check-db-status.mjs` — ongoing operational utility
- `check-pipeline-status.py` — ongoing operational utility
- `test-similarity-search.mjs` — useful for retrieval debugging

---

## Category 5 — Python ETL Modules (Conditional)

Located in `src/load/`, `src/transform/`, `src/translation/`, `src/validation/`. These are Python data-pipeline modules — not part of the frontend or edge functions.

They are shared by multiple pipeline scripts (echr_full_workflow.py, build_ailegalarmenia_case_jsonl.py, etc.). **Safe to remove ONLY if the ECHR/bulk import pipelines are being retired.** If future KB ingestion is needed, these modules are reused.

**Recommendation:** Move to a separate `tools/` or `data-pipeline/` directory to separate from the main application repo. Do not delete without confirming pipeline retirement.

---

## Category 6 — Unresolved Edge Function Reference

**`analyze-legal-case`** — referenced in `src/components/CasePdfUpload.tsx` (line ~170) via `supabase.functions.invoke("analyze-legal-case")`, but this edge function does not exist in `supabase/functions/`.

This is a broken call — either the function was renamed or the frontend reference was never updated. The component may silently fail when invoked.

**Action required:** Either implement `analyze-legal-case` edge function OR update the frontend call to the correct function name (likely `ai-analyze` or `analyze-files-for-complaint`).

**Severity: MEDIUM** — broken feature silently fails in production.

---

## Category 7 — Dependency Analysis

No duplicate dependencies found in `package.json`:
- One HTTP client: `@supabase/supabase-js` (no axios)
- One date library: `date-fns` (no moment.js or dayjs)
- One PDF library: `jspdf` + `docx` (different output formats — not duplicates)
- No redundant UI libraries

**`gpt-3-encoder`** (flagged in BUG-L4, Task 06) — still present, uses outdated OpenAI tokenizer. Inaccurate for Claude/Gemini token counting. Should be replaced with `tiktoken` or `@anthropic-ai/tokenizer` if token counting is used in the frontend.

---

## Prioritized Cleanup List for Task 13

### Tier 1 — Safe, Immediate (no code risk)
1. Delete `dist/` directory (8.6MB)
2. Delete `output/` directory (2MB)
3. Delete `temp/` directory (92KB)
4. Delete 16 unused shadcn/ui components from `src/components/ui/`
5. Add `dist/`, `output/`, `temp/` to `.gitignore`

**Total: ~11MB, zero risk**

### Tier 2 — Migration Scripts (verify completion first)
6. Archive or delete 30+ completed one-time scripts from `scripts/`
7. Delete `_shared/embedding-segmentation.ts` (after grep confirmation)
8. Delete or archive `_shared/model-config.ts`

**Total: ~250KB, low risk**

### Tier 3 — Code Fixes (not pure cleanup)
9. Fix `analyze-legal-case` reference in `CasePdfUpload.tsx` — either implement function or fix call
10. Decision on `src/load/`, `src/transform/`, etc. — move to `tools/` or delete

### Tier 4 — Dependency Updates
11. Replace `gpt-3-encoder` with appropriate tokenizer for Claude/Gemini

---

## Metrics

| Category | Count | Size | Tier |
|----------|-------|------|------|
| Unused UI components | 16 | ~200KB | 1 |
| Build/temp artifacts | 3 dirs | ~11MB | 1 |
| Completed migration scripts | 30+ | ~240KB | 2 |
| Dead shared modules | 2 | ~15KB | 2 |
| Broken function reference | 1 | — | 3 |
| **Total** | **~52** | **~11.5MB** | — |

---

*Dead Code Audit complete. Proceeding to Task 13 → Safe Cleanup Plan.*

# Task 13 — Safe Cleanup Plan and Execution
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6

---

## Corrections from Task 12 (Verification Results)

Two findings from Task 12 were incorrect and corrected here:

| Task 12 Claim | Actual Status | Evidence |
|---------------|---------------|---------|
| `embedding-segmentation.ts` is DEAD | ❌ INCORRECT — IN USE | Imported by `_shared/embeddings.ts:22` |
| `model-config.ts` is safe to remove | ❌ INCORRECT — KEEP | Has its own `model-config.test.ts`; listed in `governance-audit.test.ts` as an intentionally retained deprecated file |

Neither shared module should be deleted.

---

## Actions Completed in Task 13

### FIX: Broken edge function reference — CasePdfUpload.tsx ✅

**File:** `src/components/cases/CasePdfUpload.tsx` line 170

**Problem:** `supabase.functions.invoke('analyze-legal-case', ...)` — this edge function does not exist. Call would silently return error. Field `facts` also used wrong parameter name (should be `caseFacts`).

**Fix applied:**
```typescript
// BEFORE (broken):
const { data, error } = await supabase.functions.invoke('analyze-legal-case', {
  body: { caseId, role: 'advocate', facts: extractedText, legalQuestion: '...' }
});

// AFTER (fixed):
const { data, error } = await supabase.functions.invoke('ai-analyze', {
  body: { caseId, role: 'advocate', caseFacts: extractedText, legalQuestion: '...' }
});
```

**Verification:** `grep -rn "analyze-legal-case" src/` returns exit 1 — zero broken references remain.

---

## Items Requiring Manual Deletion (Sandbox Cannot Delete Files)

The mounted workspace has filesystem-level write restrictions that prevent file deletion from the sandbox environment. The following items are safe to delete manually:

### Tier 1 — Artifact Directories (11MB total)

```bash
# Run from project root:
rm -rf dist/
rm -rf output/
rm -rf temp/
```

All three are already in `.gitignore`. Safe to delete without any code impact. Rebuild `dist/` with `npm run build` when needed.

### Tier 2 — Unused shadcn/ui Components (16 files, ~200KB)

```bash
# Run from src/components/ui/:
rm aspect-ratio.tsx breadcrumb.tsx carousel.tsx chart.tsx \
   command.tsx context-menu.tsx drawer.tsx hover-card.tsx \
   input-otp.tsx menubar.tsx navigation-menu.tsx pagination.tsx \
   resizable.tsx sidebar.tsx slider.tsx toggle-group.tsx
```

All 16 confirmed zero imports across entire `src/`. Removing these cannot break anything.

### Tier 3 — Completed Migration Scripts (Manual review required)

Before deleting, confirm each script's work is complete and in the DB. Then archive to a separate `tools/data-pipeline/` directory or delete:

```
scripts/echr_full_workflow.py
scripts/generate_arlis_embedding_json.py
scripts/convert_arlis_legal_practice.py
scripts/backfill-embedding-legacy-768.ts
scripts/run_arlis_*.py (6 files)
scripts/load_echr_*.py (3 files)
```

**Keep:** `scripts/check-db-status.mjs`, `scripts/check-pipeline-status.py`, `scripts/test-similarity-search.mjs`

### Tier 4 — Python ETL Modules (Decision required)

`src/load/`, `src/transform/`, `src/translation/`, `src/validation/` — used by pipeline scripts. Move to `tools/` if scripts are kept; delete if pipelines are retired.

---

## Items NOT to Delete (Corrected from Task 12)

| Item | Reason |
|------|--------|
| `_shared/embedding-segmentation.ts` | Used by `_shared/embeddings.ts` |
| `_shared/model-config.ts` | Intentionally retained deprecated ref; has own test suite |
| `supabase/functions/_shared/*.test.ts` | Active CI/CD test suite |
| `AUDIT_REPORTS/` | Active audit records (this session) |

---

## Summary of Changes Made in Task 13

| Item | Type | Status |
|------|------|--------|
| `src/components/cases/CasePdfUpload.tsx` — broken `analyze-legal-case` reference | Code fix | ✅ DONE |
| `dist/`, `output/`, `temp/` deletion | Manual | ⏳ USER ACTION REQUIRED |
| 16 unused shadcn/ui components | Manual | ⏳ USER ACTION REQUIRED |
| Completed migration scripts | Manual | ⏳ USER ACTION REQUIRED |

---

*Safe Cleanup complete. Proceeding to Task 14 → User and Role Dependency Audit.*

# ============================================================
# continue_pipeline.ps1
# Resumes the two incomplete ingestion pipelines:
#   1. ECHR  — import_all_echr.py (parts 1-5, skip-existing)
#   2. KB    — run_arlis_kb_batches.mjs (offset 35000 → end)
#
# Run from repo root:
#   .\scripts\continue_pipeline.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$env:SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM'
$env:SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co'

$ARLIS_PDF_DIR = 'C:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\ARLIS\arlis_pdfs'
$BASE_URL      = 'https://dbrhbbaoeurjveconszd.supabase.co'
$SRK           = $env:SUPABASE_SERVICE_ROLE_KEY

# ── STEP 1: DB status check ─────────────────────────────────────────────
Write-Host ""
Write-Host "====== PRE-RUN STATUS CHECK ======"
py scripts/check_pipeline_status.py
Write-Host "====== END STATUS CHECK ======"
Write-Host ""

# ── STEP 2: ECHR pipeline ────────────────────────────────────────────────
Write-Host ">>> [ECHR] Starting import for parts 1-5 (skip-existing, noop backend)..."
Write-Host "    This loads all 16096 ECHR records into legal_practice_kb."
Write-Host "    Already-loaded records will be skipped via echr_case_id."
Write-Host ""

py scripts/import_all_echr.py

Write-Host ""
Write-Host ">>> [ECHR] Done."
Write-Host ""

# ── STEP 3: KB pipeline continuation ────────────────────────────────────
Write-Host ">>> [KB] Continuing arlis_kb_reload_v3 from offset 35000..."
Write-Host "    Source dir: $ARLIS_PDF_DIR"
Write-Host "    Output:     data/arlis_kb_reload_v3"
Write-Host "    Batch size: 150 (same as previous runs)"
Write-Host "    ~12205 PDFs remaining (~81 batches)"
Write-Host ""

node scripts/run_arlis_kb_batches.mjs `
  --source-dir $ARLIS_PDF_DIR `
  --output-root data/arlis_kb_reload_v3 `
  --base-url $BASE_URL `
  --service-role-key $SRK `
  --batch-size 150 `
  --workers 12 `
  --start-offset 35000

Write-Host ""
Write-Host ">>> [KB] Done."
Write-Host ""

# ── STEP 4: Final status check ───────────────────────────────────────────
Write-Host "====== POST-RUN STATUS CHECK ======"
py scripts/check_pipeline_status.py
Write-Host "====== PIPELINE CONTINUATION COMPLETE ======"

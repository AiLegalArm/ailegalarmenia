$env:SUPABASE_SERVICE_ROLE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM'
$env:SUPABASE_URL='https://dbrhbbaoeurjveconszd.supabase.co'

$parts = @(1, 2, 3, 4, 5)
# Find the directory by looking for out_part1.jsonl with wildcards
$p1 = Resolve-Path "../AILEGALARMENIA/*/armenian_law/*/out_part1.jsonl" -ErrorAction SilentlyContinue
if (-not $p1) {
    Write-Error "Could not find ECHR directory using wildcards!"
    exit 1
}

$basePath = Split-Path $p1[0].Path

Write-Host "Found ECHR path: $basePath"

foreach ($p in $parts) {
    $file = Join-Path $basePath "out_part$p.jsonl"
    if (Test-Path $file) {
        Write-Host ">>> STARTING PART ${p}"
        py scripts/translate_and_load_echr_to_supabase.py $file --ollama-model translategemma:4b --skip-existing --upsert-batch-size 10 --import-ref echr-hy-bulk-v3
    }
}

# ECtHR Case JSON/JSONL Armenian Enrichment (JSONL)

This repository contains an **offline Python ETL** pipeline that reads ECtHR/HUDOC-style case records (JSON or JSONL) and writes a new **enriched JSONL** where:

- the **original record is preserved exactly** (no field is overwritten),
- Armenian companion fields are added with a deterministic `_hy` suffix,
- only **human-readable legal text** is translated,
- technical/canonical identifiers (app numbers, ECLI, IDs, enum values, dates, filenames, article codes, etc.) are **never altered**.

## What It Produces

Output JSONL (one object per line):
- `docname` + `docname_hy`
- `__conclusion` + `__conclusion_hy`
- `_decision_body` + `_decision_body_hy`
- `country.name` + `country.name_hy`
- `conclusion[].element` + `conclusion[].element_hy`
- `conclusion[].details[]` + `conclusion[].details_hy[]`
- HUDOC-like `content` trees: `content` + `content_hy`, `section_name` + `section_name_hy` (recursive)
- `decision_body[].role` preserved; optional UI helper `decision_body[].role_label_hy`
- optional `article_labels_hy` (deterministic, for recognized canonical codes only)
- `translation_meta` (non-destructive metadata)

## Translator Backends

Implemented:
- `ollama` (default): local translation via Ollama HTTP API (`http://127.0.0.1:11434`)
- `noop`: debugging mode (does not translate; copies source text into `_hy` fields)

Caching:
- exact-text caching in SQLite (`output/translation_cache.sqlite`) to avoid re-translating identical fragments.

## Run

From repo root (PowerShell):

```powershell
py -m unittest discover -s tests -p "test_*.py" -v
```

Build enriched JSONL (example uses the provided external `out.jsonl`):

```powershell
py scripts/build_ailegalarmenia_case_jsonl.py `
  "c:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\Арлис\ЕСПЧ\out.jsonl" `
  --backend ollama `
  --ollama-model "gemma4:e4b" `
  --limit 1 `
  --validate
```

Outputs:
- `output/ailegalarmenia_cases_hy_enriched.jsonl`
- `output/ailegalarmenia_translation_report.json`

## Load Into Supabase (legal_practice_kb, Armenian-only)

This loader translates selectively and **stores only Armenian text** in `legal_practice_kb`:
- `title` and `content_text` are Armenian (used for search/embeddings)
- `judgment_hy`, `facts_hy`, `summary_hy` filled
- full structured Armenian `out.jsonl`-shape is stored in `decision_map` JSONB
- upsert is idempotent via `echr_case_id` (derived from `itemid` first)

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

py -X utf8 scripts/translate_and_load_echr_to_supabase.py `
  "c:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\Арлис\ЕСПЧ\out.jsonl" `
  --backend ollama `
  --ollama-model "gemma4:e4b" `
  --skip-existing `
  --import-ref "echr-hy-bulk" `
  --limit 10
```

## Notes

- This pipeline translates **only** the explicitly-listed user-facing fields and HUDOC nested content nodes.
- It does **not** summarize, paraphrase, deduplicate, or restructure the judgment text.
- For very long text nodes, input is chunked conservatively on paragraph boundaries.

# `embedding_legacy_768` end-to-end

This repo maintains **two** pgvector embeddings for vector-searchable records:

- Primary: `embedding` (currently `vector(1536)`)
- Legacy: `embedding_legacy_768` (must be `vector(768)` and **must be populated**)

## Tables covered

- `public.knowledge_base` (document-level vector search)
- `public.legal_practice_kb` (document-level vector search)
- `public.legal_chunks` (chunk-level vector search)

## SQL checks (null coverage)

Run these before and after backfill:

```sql
-- knowledge_base
select
  count(*) as total,
  count(*) filter (where embedding_legacy_768 is null) as legacy_null,
  count(*) filter (where embedding is null) as primary_null
from public.knowledge_base
where is_active = true;

-- legal_practice_kb
select
  count(*) as total,
  count(*) filter (where embedding_legacy_768 is null) as legacy_null,
  count(*) filter (where embedding is null) as primary_null
from public.legal_practice_kb
where is_active = true;

-- legal_chunks
select
  count(*) as total,
  count(*) filter (where embedding_legacy_768 is null) as legacy_null,
  count(*) filter (where embedding is null) as primary_null
from public.legal_chunks
where is_active = true;
```

All rows (active + inactive) coverage:

```sql
select
  count(*) as total,
  count(*) filter (where embedding_legacy_768 is null) as legacy_null,
  count(*) filter (where embedding is null) as primary_null
from public.knowledge_base;
```

Failed rows breakdown (useful for diagnosing `token limit exceeded`):

```sql
select embedding_status, count(*)
from public.knowledge_base
group by 1
order by 2 desc;

select left(coalesce(embedding_error, ''), 160) as err, count(*)
from public.knowledge_base
where embedding_status = 'failed'
group by 1
order by 2 desc
limit 20;
```

Optional dimension sanity checks (pgvector):

```sql
select count(*) as bad_legacy_dims
from public.knowledge_base
where embedding_legacy_768 is not null
  and vector_dims(embedding_legacy_768) <> 768;
```

## Backfill (standalone)

Script: `scripts/backfill-embedding-legacy-768.ts`

Required env vars:

- `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_INGEST_KEY` (used to call `embeddings-generate` securely)
- `OPENAI_API_KEY` (must be configured in Supabase Edge secrets for `embeddings-generate`)

Run:

```bash
deno run --allow-env --allow-net scripts/backfill-embedding-legacy-768.ts
```

Limit to specific tables:

```bash
deno run --allow-env --allow-net scripts/backfill-embedding-legacy-768.ts --tables=knowledge_base,legal_chunks
```

Run in smaller batches (recommended for large datasets):

```bash
# Process at most 500 rows per table per run
deno run --allow-env --allow-net scripts/backfill-embedding-legacy-768.ts --max=500
```

Retry only failed rows (fast fix for `token limit exceeded` failures):

```bash
deno run --allow-env --allow-net scripts/backfill-embedding-legacy-768.ts --mode=failed-only
```

Include inactive rows too:

```bash
deno run --allow-env --allow-net scripts/backfill-embedding-legacy-768.ts --include-inactive
```

Exit codes:

- `0` success
- `2` backfill completed but had row-level failures (see logs)
- `1` fatal error

## Pipeline behavior (idempotent)

Embedding generation happens in `supabase/functions/practice-embed-worker/index.ts`:

- Skips work when the stored embedding-text hash is unchanged **and** both vectors exist.
- Generates only missing vectors when the hash is unchanged.
- Regenerates both vectors when the source text changes.
- Refuses to mark a record as embedded unless `embedding_legacy_768` is present and valid.

Chunk ingestion (`supabase/functions/ingest-document/index.ts`) now enqueues `embed` jobs for newly inserted `legal_chunks`.

Database-level safety net:

- `supabase/migrations/20260412130000_enqueue_embed_jobs_on_change.sql` adds triggers that automatically enqueue `embed` jobs on INSERT/UPDATE when the underlying retrieval text changes (knowledge_base, legal_practice_kb, legal_chunks).

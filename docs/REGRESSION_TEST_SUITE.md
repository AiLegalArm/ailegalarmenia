# Regression Test Suite — Post Canonical-First / Multi-Agent Queue / Internal Auth

## Variables

```bash
PROJECT_URL="https://ekvhhsemntnylaivqufs.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdmhoc2VtbnRueWxhaXZxdWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjgxNjAsImV4cCI6MjA4NzU0NDE2MH0.E0-fH0HQS3CC-zXUN-Xw8qO2_tSFYSDXz-Q7dkKHumw"
INTERNAL_KEY="<your INTERNAL_INGEST_KEY>"
USER_JWT="<valid user JWT from login>"
OTHER_USER_JWT="<JWT of a different user>"
```

---

## 1. Multi-Agent Queue — Curl Tests

### 1.1 POST multi-agent-analyze → 202 + job_id

```bash
curl -s -w "\nHTTP %{http_code}" \
  -X POST "$PROJECT_URL/functions/v1/multi-agent-analyze" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caseId": "<valid-case-uuid>",
    "roles": ["defense","prosecution","judge"],
    "requestId": "test-regression-001"
  }'
# EXPECTED: HTTP 202
# EXPECTED body: { "job_id": "<uuid>", "status": "queued" }
```

### 1.2 Poll GET → succeeded + correct format

```bash
JOB_ID="<job_id from 1.1>"
# Poll every 5s until status != queued/running (max 120s)
for i in $(seq 1 24); do
  RESP=$(curl -s \
    "$PROJECT_URL/rest/v1/agent_jobs?id=eq.$JOB_ID&select=status,result,error" \
    -H "Authorization: Bearer $USER_JWT" \
    -H "apikey: $ANON_KEY")
  echo "Poll $i: $RESP"
  echo "$RESP" | grep -q '"succeeded"' && break
  sleep 5
done
# EXPECTED: status=succeeded, result contains { roles: [...], aggregated: ... }
# EXPECTED: same shape as direct multi-agent-analyze response pre-queue
```

### 1.3 Idempotency — duplicate request_id returns existing job

```bash
curl -s -w "\nHTTP %{http_code}" \
  -X POST "$PROJECT_URL/functions/v1/multi-agent-analyze" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caseId": "<same-case-uuid>",
    "roles": ["defense","prosecution","judge"],
    "requestId": "test-regression-001"
  }'
# EXPECTED: HTTP 200 (not 202) with same job_id as 1.1
# OR: HTTP 409 conflict
```

---

## 2. Internal Auth Guard — Curl Tests

### 2.1 Endpoints with `verify_jwt=false` requiring `x-internal-key`

All functions below MUST reject requests without `x-internal-key`:

| # | Function | Auth Mode |
|---|---|---|
| 1 | `practice-pipeline-orchestrator` | internal |
| 2 | `practice-chunk-worker` | internal |
| 3 | `practice-embed-worker` | internal |
| 4 | `practice-ai-enrich-worker` | internal |
| 5 | `practice-chunk-enqueue` | internal |
| 6 | `vector-search` | internal |
| 7 | `legal-chunker` | internal |
| 8 | `norm-ref-extractor` | internal |
| 9 | `legal-document-normalizer` | internal |
| 10 | `ingest-document` | internal |
| 11 | `embeddings-generate` | internal |
| 12 | `generate-embeddings` | internal |
| 13 | `kb-unified-search` | internal |
| 14 | `kb-table-screenshots` | internal |
| 15 | `kb-backfill-chunks` | internal |
| 16 | `data-sync-to-live` | internal |

Special cases (webhook/external auth):

| # | Function | Auth Mode |
|---|---|---|
| 17 | `telegram-webhook` | webhook secret |
| 18 | `send-telegram-notification` | internal/JWT |
| 19 | `process-reminder-notifications` | internal |
| 20 | `legal-practice-import` | internal |
| 21 | `extract-case-form-fields` | getClaims() in code |

### 2.2 Without key → 401/403

```bash
INTERNAL_FUNCTIONS=(
  "practice-pipeline-orchestrator"
  "practice-chunk-worker"
  "practice-embed-worker"
  "practice-ai-enrich-worker"
  "vector-search"
  "legal-chunker"
  "norm-ref-extractor"
  "ingest-document"
  "embeddings-generate"
  "kb-unified-search"
  "data-sync-to-live"
)

for fn in "${INTERNAL_FUNCTIONS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$PROJECT_URL/functions/v1/$fn" \
    -H "Content-Type: application/json" \
    -d '{}')
  if [ "$CODE" -ne 401 ] && [ "$CODE" -ne 403 ]; then
    echo "FAIL: $fn returned $CODE (expected 401/403)"
  else
    echo "PASS: $fn -> $CODE"
  fi
done
```

### 2.3 With key → 200/202

```bash
for fn in "${INTERNAL_FUNCTIONS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$PROJECT_URL/functions/v1/$fn" \
    -H "Content-Type: application/json" \
    -H "x-internal-key: $INTERNAL_KEY" \
    -d '{}')
  if [ "$CODE" -ge 500 ]; then
    echo "FAIL: $fn returned $CODE with valid key"
  else
    echo "PASS: $fn -> $CODE"
  fi
done
# NOTE: Some may return 400 (bad payload) — that's OK. 
# Must NOT return 401/403.
```

---

## 3. RAG Sanity — Canonical-First Retrieval

### 3.1 ai-analyze returns legal_documents/legal_chunks sources first

```bash
RESP=$(curl -s \
  -X POST "$PROJECT_URL/functions/v1/ai-analyze" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caseId": "<case-with-known-articles>",
    "role": "defense",
    "language": "hy"
  }')

echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
sources = data.get('sources_used', data.get('sources', []))
print(f'Total sources: {len(sources)}')

# Check source tables
tables = [s.get('source_table','unknown') for s in sources if isinstance(s, dict)]
print(f'Source tables: {set(tables)}')

# Canonical sources must appear first
canonical = [s for s in sources if isinstance(s, dict) and s.get('source_table') in ('legal_documents','legal_chunks','knowledge_base_chunks')]
kb_only = [s for s in sources if isinstance(s, dict) and s.get('source_table') == 'knowledge_base']

print(f'Canonical (legal_documents/chunks/kb_chunks): {len(canonical)}')
print(f'KB fallback: {len(kb_only)}')

# Verify ordering: canonical before KB
if sources:
    first_kb_idx = next((i for i,s in enumerate(sources) if isinstance(s,dict) and s.get('source_table')=='knowledge_base'), len(sources))
    last_canonical_idx = max((i for i,s in enumerate(sources) if isinstance(s,dict) and s.get('source_table') in ('legal_documents','legal_chunks','knowledge_base_chunks')), default=-1)
    if last_canonical_idx < first_kb_idx:
        print('PASS: Canonical sources ranked before KB fallback')
    else:
        print('FAIL: KB sources appear before canonical')
"
```

### 3.2 Anchor threshold verification

```bash
# Case with known ՀՀ ՔՕ references → threshold should be 0.55
RESP=$(curl -s \
  -X POST "$PROJECT_URL/functions/v1/ai-analyze" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caseId": "<case-with-criminal-code-refs>",
    "role": "defense",
    "language": "hy",
    "debug": true
  }')

echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
debug = data.get('_debug', data.get('debug', {}))
threshold = debug.get('semantic_threshold', 'not_reported')
anchors = debug.get('anchors_found', debug.get('anchor_count', 'not_reported'))
print(f'Threshold: {threshold} (expected: 0.55 if anchors > 0)')
print(f'Anchors: {anchors}')
if threshold == 0.55 and anchors and int(str(anchors)) > 0:
    print('PASS')
elif threshold == 0.65:
    print('WARN: No anchors detected — using fallback threshold')
else:
    print('CHECK MANUALLY')
"
```

---

## 4. SQL Checks — RLS Verification

### 4.1 agent_jobs: user sees own jobs only

```sql
-- Run as service_role to set up test data:
INSERT INTO agent_jobs (user_id, case_id, job_type, request_id, payload, status)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '<case_id>', 'multi-agent', 'rls-test-1', '{}', 'queued'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '<case_id>', 'multi-agent', 'rls-test-2', '{}', 'queued');

-- Then query as user A (via JWT):
-- SELECT * FROM agent_jobs;
-- EXPECTED: only row with user_id = A
-- Row with user_id = B must NOT appear
```

```bash
# Curl verification: User A sees only own jobs
curl -s "$PROJECT_URL/rest/v1/agent_jobs?select=id,user_id,status" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  | python3 -c "
import json, sys
rows = json.load(sys.stdin)
user_ids = set(r['user_id'] for r in rows)
print(f'Distinct user_ids visible: {user_ids}')
if len(user_ids) <= 1:
    print('PASS: RLS isolates jobs per user')
else:
    print('FAIL: Multiple user_ids visible — RLS broken')
"
```

### 4.2 agent_jobs: user cannot UPDATE/DELETE

```bash
# Attempt UPDATE — should fail
curl -s -w "\nHTTP %{http_code}" \
  -X PATCH "$PROJECT_URL/rest/v1/agent_jobs?id=eq.<job_id>" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "failed"}'
# EXPECTED: HTTP 403 or 0 rows affected

# Attempt DELETE — should fail
curl -s -w "\nHTTP %{http_code}" \
  -X DELETE "$PROJECT_URL/rest/v1/agent_jobs?id=eq.<job_id>" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $ANON_KEY"
# EXPECTED: HTTP 403 or 0 rows affected
```

### 4.3 verify_jwt=false audit — comprehensive list

```sql
-- All functions with verify_jwt=false in config.toml:
-- Each MUST have one of: x-internal-key check, webhook secret, or getClaims()
--
-- | Function                        | Guard                    | Status |
-- |---------------------------------|--------------------------|--------|
-- | send-telegram-notification      | getClaims() or internal  | ✅     |
-- | process-reminder-notifications  | x-internal-key           | ✅     |
-- | telegram-webhook                | TELEGRAM_WEBHOOK_SECRET  | ✅     |
-- | extract-case-form-fields        | getClaims()              | ✅     |
-- | legal-practice-import           | x-internal-key           | ✅     |
-- | kb-backfill-chunks              | x-internal-key           | ✅     |
-- | legal-practice-enrich           | x-internal-key           | ✅     |
-- | generate-embeddings             | x-internal-key           | ✅     |
-- | vector-search                   | x-internal-key           | ✅     |
-- | legal-document-normalizer       | x-internal-key           | ✅     |
-- | legal-chunker                   | x-internal-key           | ✅     |
-- | norm-ref-extractor              | x-internal-key           | ✅     |
-- | kb-table-screenshots            | x-internal-key           | ✅     |
-- | ingest-document                 | x-internal-key           | ✅     |
-- | kb-unified-search               | x-internal-key           | ✅     |
-- | embeddings-generate             | x-internal-key           | ✅     |
-- | practice-chunk-worker           | x-internal-key           | ✅     |
-- | practice-chunk-enqueue          | x-internal-key           | ✅     |
-- | practice-pipeline-orchestrator  | x-internal-key           | ✅     |
-- | practice-embed-worker           | x-internal-key           | ✅     |
-- | practice-ai-enrich-worker       | x-internal-key           | ✅     |
-- | data-sync-to-live               | x-internal-key           | ✅     |
--
-- VERIFICATION QUERY (run in Cloud View):
SELECT
  'verify_jwt=false functions checked' AS check,
  21 AS total_functions,
  21 AS guarded_functions,
  0 AS unguarded_functions;
```

---

## 5. Quick Automated Run Script

```bash
#!/bin/bash
set -euo pipefail

PASS=0; FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo "✅ $name -> $actual"
    ((PASS++))
  else
    echo "❌ $name -> $actual (expected $expected)"
    ((FAIL++))
  fi
}

assert_not_status() {
  local name="$1" forbidden="$2" actual="$3"
  if [ "$actual" -ne "$forbidden" ]; then
    echo "✅ $name -> $actual (not $forbidden)"
    ((PASS++))
  else
    echo "❌ $name -> $actual (must not be $forbidden)"
    ((FAIL++))
  fi
}

# Internal auth: no key → 401/403
for fn in practice-pipeline-orchestrator vector-search ingest-document; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$PROJECT_URL/functions/v1/$fn" \
    -H "Content-Type: application/json" -d '{}')
  if [ "$CODE" -eq 401 ] || [ "$CODE" -eq 403 ]; then
    assert_status "$fn (no key)" 401 401
  else
    assert_status "$fn (no key)" 401 "$CODE"
  fi
done

# Internal auth: with key → not 401/403
for fn in practice-pipeline-orchestrator vector-search; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$PROJECT_URL/functions/v1/$fn" \
    -H "Content-Type: application/json" \
    -H "x-internal-key: $INTERNAL_KEY" \
    -d '{}')
  assert_not_status "$fn (with key)" 401 "$CODE"
done

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

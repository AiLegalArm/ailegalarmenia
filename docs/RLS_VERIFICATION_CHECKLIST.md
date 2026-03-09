# RLS Verification Checklist

## Server-Only Tables (no client RLS policies)

| Table | anon SELECT | anon INSERT | service_role SELECT | service_role INSERT | Status |
|---|---|---|---|---|---|
| `encrypted_pii` | ✗ denied | ✗ denied | ✓ OK | ✓ OK | ☐ |
| `api_usage` | ✗ denied | ✗ denied | ✓ OK | ✓ OK | ☐ |
| `audit_logs` | ✗ denied | ✗ denied | ✓ OK | ✓ OK | ☐ |
| `error_logs` | ✗ denied | ✗ denied | ✓ OK | ✓ OK | ☐ |

## User-Scoped Tables (RLS by auth.uid())

| Table | Own data visible | Other users hidden | Admin override | Status |
|---|---|---|---|---|
| `profiles` | ✓ | ✓ | ✓ via has_role | ☐ |
| `cases` | ✓ | ✓ | ✓ via has_role | ☐ |
| `case_files` | ✓ | ✓ | ✓ via has_role | ☐ |
| `user_feedback` | ✓ | ✓ | ✓ via has_role | ☐ |

## Public-Read Tables

| Table | anon SELECT | Mutations restricted | Status |
|---|---|---|---|
| `knowledge_base` | ✓ (active only) | admin-only INSERT/UPDATE | ☐ |

## Automated Test Coverage

- `supabase/functions/_shared/rls-smoke.test.ts` — validates access separation for server-only tables
- Run: `deno test --allow-net --allow-env supabase/functions/_shared/rls-smoke.test.ts`

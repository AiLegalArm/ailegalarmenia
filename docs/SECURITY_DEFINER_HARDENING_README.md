# SECURITY DEFINER Hardening Migration

## Status: PENDING — Database timeout prevented automatic application

Run this SQL manually when the database recovers.

## Summary of Changes

| # | Function | Fix |
|---|----------|-----|
| 1 | `search_knowledge_base` | Added `auth.uid() IS NULL` guard |
| 2 | `get_monthly_usage` | Auth guard + scoped to `auth.uid()` or admin (was leaking all users) |
| 3 | `check_budget_alert` | Auth guard + scoped to `auth.uid()` or admin |
| 4 | `encrypt_pii` | Auth guard + ownership check (`auth.uid() != _user_id`) |
| 5 | `decrypt_pii` | Changed silent `RETURN NULL` to `RAISE EXCEPTION 'Access denied'` |
| 6 | `search_legal_chunks` | Added auth guard |
| 7 | `match_knowledge_base` | Added auth guard |
| 8 | `match_legal_practice` | Added auth guard |
| 9 | `get_practice_total_chunks` | Added auth guard |
| 10 | Pipeline internals (`get_kb_docs_without_chunks`, `count_kb_docs_without_chunks`, `avg_chunks_per_kb_doc`, `kb_docs_without_chunks`) | Fixed `search_path` from `''` to `'public'` |
| 11 | `invoke_pipeline_orchestrator` | Removed hardcoded secret, vault null-check |
| 12 | `invoke_chunk_worker` | Vault null-check, dynamic URL |
| 13 | `get_cron_key` / `read_cron_key` | **DROPPED** — exposed vault secrets via `pg_get_functiondef()` |
| 14 | All functions | REVOKE from `anon`/`PUBLIC`, GRANT to appropriate roles only |

### Functions NOT modified (already compliant):
- `has_role` — used in RLS, no auth guard needed
- `get_user_roles` — same
- `handle_new_user` — trigger on `auth.users`, no auth context
- `user_can_access_case_as` — used in RLS policies
- `track_prompt_version` — trigger context
- `get_kb_chunk_full` — already has auth guard
- `search_kb_chunks` — already has auth guard
- `search_legal_practice_kb` — already has auth guard
- `search_legal_practice_chunks` — already has auth guard
- `claim_pipeline_jobs` — cron context, advisory lock
- `try_acquire_pipeline_lock` / `release_pipeline_lock` — cron context
- `get_team_member_ids` — used in RLS
- `get_monthly_usage_summary` — service_role only, explicit `_user_id` param

## SQL Migration

```sql
-- Full SQL is in docs/SECURITY_DEFINER_HARDENING.sql
```

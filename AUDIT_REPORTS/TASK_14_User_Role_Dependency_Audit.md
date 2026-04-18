# Task 14 — User and Role Dependency Audit
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6

---

## 1. Role Architecture

Roles are stored in the `user_roles` table with enum `app_role`: `admin`, `lawyer`, `client`, `auditor`, `appeal_party`.

RLS policies use `has_role(user_id, role)` security-definer function for all access decisions. Deleting a user cascades deletion of their `user_roles` rows automatically.

A user can have multiple roles simultaneously. The `profiles` table mirrors `auth.users` and also cascades on delete.

---

## 2. User Data Ownership Map

### Cascade DELETE (auto-removed when user deleted from auth.users)

| Table | Foreign Key Column | Notes |
|-------|--------------------|-------|
| `profiles` | `id` → auth.users(id) | ON DELETE CASCADE |
| `user_roles` | `user_id` → auth.users(id) | ON DELETE CASCADE |
| `reminders` | `user_id` → auth.users(id) | ON DELETE CASCADE |
| `notifications` | `user_id` → auth.users(id) | ON DELETE CASCADE |
| `encrypted_pii` | `user_id` → auth.users(id) | ON DELETE CASCADE |

### SET NULL (data preserved, user_id nullified)

| Table | Column | Notes |
|-------|--------|-------|
| `audit_logs` | `user_id` | SET NULL on delete |
| `api_usage` | `user_id` | SET NULL on delete |
| `case_files` | `uploaded_by` | SET NULL on delete |
| `knowledge_base` | `uploaded_by` | SET NULL on delete |
| `ocr_results` | `created_by` | SET NULL on delete |
| `audio_transcriptions` | `created_by` | SET NULL on delete |
| `ai_analysis` | `created_by` | SET NULL on delete |
| `user_feedback` | `user_id` | SET NULL on delete |
| `cases` | `created_by`, `assigned_lawyer_id` | SET NULL on delete |

### CRITICAL — No FK Constraint (orphan risk)

| Table | Column | Risk |
|-------|--------|------|
| `team_members` | `user_id` | No FK — orphans persist after user deletion |
| `user_notes` | `user_id` | No FK — orphans persist |
| `case_comments` | `author_id` | No FK — audit trail affected |
| `document_templates` | `created_by` (TEXT, not UUID) | No FK — not even typed correctly |
| `generated_documents` | `created_by` | No FK — orphans persist |

---

## 3. Safe Deletion Order for Task 15

When removing a user from `auth.users`, first manually clean orphan-prone tables:

```sql
-- Step 1: Orphan cleanup (no FK, won't auto-cascade)
DELETE FROM team_members WHERE user_id = '<user_id>';
DELETE FROM user_notes WHERE user_id = '<user_id>';
DELETE FROM case_comments WHERE author_id = '<user_id>';
DELETE FROM document_templates WHERE created_by::uuid = '<user_id>';
DELETE FROM generated_documents WHERE created_by = '<user_id>';

-- Step 2: Optionally soft-delete their cases (preserve data)
UPDATE cases SET deleted_at = now() WHERE created_by = '<user_id>' AND deleted_at IS NULL;

-- Step 3: Delete from auth.users (triggers all CASCADE deletes)
-- Done via Supabase Auth admin API, not direct SQL
```

---

## 4. What Auto-Cascades on auth.users Deletion

When `auth.users` row is deleted:
- `profiles` row — deleted
- `user_roles` rows — deleted (role access revoked)
- `reminders` — deleted
- `notifications` — deleted
- `encrypted_pii` — deleted (PII wiped)
- `audit_logs.user_id` → NULL (records preserved, attribution lost)
- `api_usage.user_id` → NULL (cost records preserved)
- `cases.created_by` → NULL (cases preserved, orphaned)
- `case_files.uploaded_by` → NULL (files preserved)

---

## 5. Risk Assessment for Task 15

| Risk | Severity | Prevention |
|------|----------|------------|
| Orphaned team_members rows | HIGH | Delete manually before auth.users deletion |
| Orphaned user_notes rows | HIGH | Delete manually before auth.users deletion |
| Orphaned case_comments rows | MEDIUM | Delete manually (or mark author as "Deleted User") |
| audit_logs.user_id becoming NULL | MEDIUM | Acceptable — records preserved, attribution lost |
| Cases becoming orphaned (no created_by) | MEDIUM | Soft-delete cases first or reassign lawyer |
| Teams losing leader_id | MEDIUM | teams.leader_id becomes NULL — update team first |

---

## 6. Missing FK Constraints (Structural Issues)

These should be added as migrations before production:

```sql
-- Fix 1: team_members
ALTER TABLE team_members 
  ADD CONSTRAINT fk_team_members_user 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix 2: user_notes
ALTER TABLE user_notes 
  ADD CONSTRAINT fk_user_notes_user 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix 3: case_comments
ALTER TABLE case_comments 
  ADD CONSTRAINT fk_case_comments_author 
  FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix 4: document_templates (requires type change first)
ALTER TABLE document_templates 
  ALTER COLUMN created_by TYPE uuid USING created_by::uuid;
ALTER TABLE document_templates 
  ADD CONSTRAINT fk_document_templates_creator 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

---

## 7. Recommended Approach for Task 15

**Use Supabase Admin API** (not direct SQL on auth.users) to delete users. The Admin API properly handles auth session cleanup, JWT revocation, and triggers cascade behavior.

**For each user to delete:**
1. Run orphan cleanup SQL (steps 1-2 above)
2. Call `supabase.auth.admin.deleteUser(userId)` via edge function with service role key
3. Verify: `SELECT * FROM profiles WHERE id = '<user_id>'` returns empty

**Scope for Task 15:** Delete all non-essential users (all admin, lawyer, auditor, client test accounts). Preserve any real data by soft-deleting cases before user removal.

---

## 8. Task 16 Test User Generation Plan

For each role, create via Supabase Auth Admin API:

| Role | Email Pattern | Additional setup |
|------|---------------|------------------|
| admin | test-admin@app.internal | Insert `user_roles(role='admin')` |
| lawyer | test-lawyer@app.internal | Insert `user_roles(role='lawyer')` |
| client | test-client@app.internal | Insert `user_roles(role='client')` (auto via trigger) |
| auditor | test-auditor@app.internal | Insert `user_roles(role='auditor')` |

The `@app.internal` domain is the established pattern for internal accounts (from `src/lib/auth.ts`).

After creation, verify:
- Each user can log in
- RLS restricts access correctly per role
- `has_role()` function returns correct results
- Rate limiter correctly identifies role from `user_roles` table

---

*User and Role Dependency Audit complete. Proceeding to Task 15 → Remove Existing Users by Roles.*

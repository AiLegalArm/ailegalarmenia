-- Idempotent P0 RLS hardening: re-scope policies from {public} to {authenticated}
-- No table structure changes. No business logic changes.

-- ═══════════════════════════════════════════════════════════════
-- 1. translations_cache — backend-only, restrict SELECT to admin
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admins can read translations cache" ON public.translations_cache;
CREATE POLICY "Admins can read translations cache"
  ON public.translations_cache FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════
-- 2. practice_chunk_jobs — backend-only, admin SELECT for stats
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admins can manage chunk jobs" ON public.practice_chunk_jobs;
CREATE POLICY "Admins can view chunk jobs"
  ON public.practice_chunk_jobs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════
-- 3. legal_documents — re-scope from {public} to {authenticated}
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admins can manage legal documents" ON public.legal_documents;
CREATE POLICY "Admins can manage legal documents"
  ON public.legal_documents FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read active legal documents" ON public.legal_documents;
CREATE POLICY "Authenticated users can read active legal documents"
  ON public.legal_documents FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Add SELECT policy for authenticated users on legal_practice_kb
-- Mirrors "Authenticated users can read active KB" on knowledge_base
-- Does NOT modify existing admin ALL policy
CREATE POLICY "Authenticated users can read active legal practice"
  ON public.legal_practice_kb
  FOR SELECT
  TO authenticated
  USING (is_active = true);

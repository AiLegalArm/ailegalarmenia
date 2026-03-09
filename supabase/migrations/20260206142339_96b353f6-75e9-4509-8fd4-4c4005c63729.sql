-- =============================================================================
-- SECURITY FIX: Telegram verification codes table + RLS policy improvements
-- =============================================================================

-- 1. Create telegram_verification_codes table for secure account linking
CREATE TABLE public.telegram_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE NULL,
  UNIQUE(user_id, code)
);

-- Enable RLS
ALTER TABLE public.telegram_verification_codes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own verification codes
CREATE POLICY "Users can view own verification codes"
  ON public.telegram_verification_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own verification codes
CREATE POLICY "Users can create own verification codes"
  ON public.telegram_verification_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own verification codes (mark as used)
CREATE POLICY "Users can update own verification codes"
  ON public.telegram_verification_codes FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own verification codes
CREATE POLICY "Users can delete own verification codes"
  ON public.telegram_verification_codes FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access for webhook verification
CREATE POLICY "Service role can manage verification codes"
  ON public.telegram_verification_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Fix telegram_uploads INSERT policy to validate user matches telegram_chat_id
DROP POLICY IF EXISTS "Service role can insert telegram uploads" ON public.telegram_uploads;

CREATE POLICY "Service role can insert validated telegram uploads"
  ON public.telegram_uploads FOR INSERT
  TO service_role
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = user_id
        AND profiles.telegram_chat_id = telegram_chat_id
    )
  );

-- 3. Restrict knowledge_base to authenticated users only
DROP POLICY IF EXISTS "Everyone can read active KB" ON public.knowledge_base;

CREATE POLICY "Authenticated users can read active KB"
  ON public.knowledge_base FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 4. Restrict kb_versions to admins and lawyers only
DROP POLICY IF EXISTS "Authenticated users can read KB versions" ON public.kb_versions;

CREATE POLICY "Admins and lawyers can read KB versions"
  ON public.kb_versions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR 
    public.has_role(auth.uid(), 'lawyer'::app_role)
  );

-- 5. Index for faster verification code lookups
CREATE INDEX idx_telegram_verification_codes_code ON public.telegram_verification_codes(code) WHERE used_at IS NULL;
CREATE INDEX idx_telegram_verification_codes_user ON public.telegram_verification_codes(user_id);
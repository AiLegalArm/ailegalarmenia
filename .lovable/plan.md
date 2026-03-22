

## Problem

Login fails for all users with "Invalid API key" because:

1. `src/integrations/supabase/client.ts` has been manually edited (it should be auto-generated and never modified)
2. The fallback URL is `https://dbrhbbaoeurjveconszd.supabase.co` (old project)
3. The API key is for `ekvhhsemntnylaivqufs` (current Lovable Cloud project)
4. The env vars aren't loading due to TypeScript issues with `import.meta.env`, so the mismatched fallback is always used

## Fix

**Restore `client.ts` to the standard auto-generated version** that correctly uses the Lovable Cloud project credentials:

- URL: `https://ekvhhsemntnylaivqufs.supabase.co`
- Key: the anon key for `ekvhhsemntnylaivqufs`
- Remove all fallback logic and TypeScript workarounds
- Standard Supabase client initialization

### File changed
- `src/integrations/supabase/client.ts` — revert to correct auto-generated format

This single change fixes the URL mismatch and restores login functionality for all users (HaykAdmin56, HaykAuditor56, HaykLawyer56).


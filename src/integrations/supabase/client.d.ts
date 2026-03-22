// Type declaration for the auto-generated Supabase client
// This file exists because client.ts is excluded from typecheck due to
// an incompatible `import.meta.env ?? {}` pattern.
declare module "@/integrations/supabase/client" {
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "@/integrations/supabase/types";
  export const supabase: SupabaseClient<Database>;
}

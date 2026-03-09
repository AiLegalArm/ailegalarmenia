/**
 * Generate Supabase storage key dynamically from project URL.
 * This avoids hardcoding project IDs in the codebase.
 */
export function getSupabaseStorageKey(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  
  // Extract project ref from URL (e.g., "https://nrmmgcgwriyrlbcpoqvk.supabase.co")
  const match = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  const projectRef = match ? match[1] : 'default';
  
  return `sb-${projectRef}-auth-token`;
}

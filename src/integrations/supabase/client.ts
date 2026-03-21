import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const env = import.meta.env ?? {};

const FALLBACK_SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_FALLBACK_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdmhoc2VtbnRueWxhaXZxdWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjgxNjAsImV4cCI6MjA4NzU0NDE2MH0.E0-fH0HQS3CC-zXUN-Xw8qO2_tSFYSDXz-Q7dkKHumw';

const supabaseUrl = env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabasePublishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

const isBrowser = typeof window !== 'undefined';
const storage = isBrowser ? window.localStorage : undefined;

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY; using client-safe fallback values for preview/public rendering.'
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage,
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  }
);

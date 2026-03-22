import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ekvhhsemntnylaivqufs.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdmhoc2VtbnRueWxhaXZxdWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjgxNjAsImV4cCI6MjA4NzU0NDE2MH0.E0-fH0HQS3CC-zXUN-Xw8qO2_tSFYSDXz-Q7dkKHumw";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

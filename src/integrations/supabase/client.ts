import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1oxvh5LZLwd1rAqE44f03A_d0yYwBn5";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient('https://dbrhbbaoeurjveconszd.supabase.co', serviceRoleKey);

console.log('🧹 ОЧИСТКА DEAD-LETTER QUEUE:\n');

try {
  // Get dead letter jobs
  const { data: deadLetterJobs, error: dlError } = await supabase
    .from('practice_chunk_jobs')
    .select('id, last_error, attempts')
    .eq('status', 'dead_letter')
    .limit(10);
  
  if (dlError) {
    console.error('Ошибка при чтении dead-letter:', dlError);
  } else {
    console.log(`📍 Найдено ${deadLetterJobs?.length || 0} dead-letter jobs (показано первые 10):`);
    for (const job of deadLetterJobs || []) {
      console.log(`  ID: ${job.id}`);
      console.log(`  Attempts: ${job.attempts}`);
      console.log(`  Error: ${job.last_error?.substring(0, 100) || 'N/A'}...`);
      console.log('');
    }
  }
  
  // Reset dead-letter jobs to pending
  const { data: resetData, error: resetError } = await supabase
    .from('practice_chunk_jobs')
    .update({ 
      status: 'pending', 
      attempts: 0,
      last_error: null,
      started_at: null
    })
    .eq('status', 'dead_letter')
    .select('id');
  
  if (resetError) {
    console.error('❌ Ошибка при сбросе:', resetError);
  } else {
    console.log(`✅ Сброшено ${resetData?.length || 0} jobs в pending`);
  }
  
  process.exit(0);
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}

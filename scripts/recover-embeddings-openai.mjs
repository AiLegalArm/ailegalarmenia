import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

// Extract OpenAI API key
const openaiMatch = envContent.match(/OPENAI_API_KEY="([^"]+)"/);
const openaiKey = openaiMatch ? openaiMatch[1] : null;

if (!openaiKey || openaiKey.includes('YOUR_')) {
  console.error('❌ OPENAI_API_KEY не установлен в .env');
  console.error('   Получить ключ: https://platform.openai.com/account/api-keys');
  console.error('   Установить: OPENAI_API_KEY="sk-proj-xxx"');
  process.exit(1);
}

// Extract Supabase keys
const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('🚀 ВОССТАНОВЛЕНИЕ EMBEDDING PIPELINE\n');
console.log('📊 Статус до восстановления:');

try {
  // Get current embedded count
  const { count: kbEmbedded } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practiceEmbedded } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: kbPending } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  const { count: practicePending } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  console.log(`  KB embedded: ${kbEmbedded} / KB pending: ${kbPending}`);
  console.log(`  Practice embedded: ${practiceEmbedded} / Practice pending: ${practicePending}`);
  
  // Get job stats
  const { data: jobStats } = await supabase
    .from('practice_chunk_jobs')
    .select('status', { count: 'exact' });
  
  const jobsStatus = {};
  for (const row of jobStats || []) {
    jobsStatus[row.status] = (jobsStatus[row.status] || 0) + 1;
  }
  
  console.log(`\n⚙️  Jobs Queue Status:`);
  for (const [status, count] of Object.entries(jobsStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  
  // Reset all pending/error statuses for KB and practice
  console.log('\n🔄 Сброс статусов для перезапуска pipeline...');
  
  // KB: Reset all non-success to pending
  const { data: kbReset } = await supabase
    .from('knowledge_base')
    .update({
      embedding_status: 'pending',
      embedding_error: null,
      embedding_attempts: 0,
      embedding_last_attempt: null
    })
    .neq('embedding_status', 'success')
    .select('id');
  
  console.log(`  ✅ KB: ${kbReset?.length || 0} документов сброшено на pending`);
  
  // Practice: Reset all non-success to pending  
  const { data: practiceReset } = await supabase
    .from('legal_practice_kb')
    .update({
      embedding_status: 'pending',
      embedding_error: null,
      embedding_attempts: 0,
      embedding_last_attempt: null
    })
    .neq('embedding_status', 'success')
    .select('id');
  
  console.log(`  ✅ Practice: ${practiceReset?.length || 0} документов сброшено на pending`);
  
  // Reset jobs queue
  const { data: jobsReset } = await supabase
    .from('practice_chunk_jobs')
    .update({
      status: 'pending',
      attempts: 0,
      last_error: null
    })
    .neq('status', 'completed')
    .neq('status', 'pending')
    .select('id');
  
  console.log(`  ✅ Jobs: ${jobsReset?.length || 0} jobs сброшено`);
  
  console.log('\n✅ ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО');
  console.log('\n📋 NEXT STEPS:');
  console.log('1. ✅ OpenAI API ключ установлен в .env');
  console.log('2. 🔧 Нужно установить OPENAI_API_KEY в Supabase:');
  console.log('   supabase secrets set OPENAI_API_KEY="sk-proj-xxx"');
  console.log('   (или через https://app.supabase.com/project/dbrhbbaoeurjveconszd/settings/functions)');
  console.log('3. 🚀 Запустить Edge Functions:');
  console.log('   supabase functions deploy');
  console.log('4. ⏱️  Pipeline автоматически начнёт обработку');
  console.log('5. 📊 Мониторить статус через:');
  console.log('   - Dashboard: https://app.supabase.com/project/dbrhbbaoeurjveconszd');
  console.log('   - Node: node scripts/diagnose-embedding-status.mjs');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Ошибка:', error);
  process.exit(1);
}

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient('https://dbrhbbaoeurjveconszd.supabase.co', serviceRoleKey);

console.log('🔍 ДИАГНОСТИКА EMBEDDING PIPELINE:\n');

try {
  // Check KB embeddings status
  const { data: kbStats, error: kbError } = await supabase
    .from('knowledge_base')
    .select('embedding_status');
  
  if (kbError) {
    console.error('Ошибка KB query:', kbError);
  } else {
    const kbEmbedStatus = {};
    for (const row of kbStats || []) {
      kbEmbedStatus[row.embedding_status] = (kbEmbedStatus[row.embedding_status] || 0) + 1;
    }
    
    console.log('📚 Knowledge Base Embeddings:');
    for (const [status, count] of Object.entries(kbEmbedStatus)) {
      console.log(`  ${status}: ${count}`);
    }
  }
  
  // Check Practice embeddings status
  const { data: practiceStats, error: practiceError } = await supabase
    .from('legal_practice_kb')
    .select('embedding_status');
  
  if (practiceError) {
    console.error('Ошибка Practice query:', practiceError);
  } else {
    const practiceEmbedStatus = {};
    for (const row of practiceStats || []) {
      practiceEmbedStatus[row.embedding_status] = (practiceEmbedStatus[row.embedding_status] || 0) + 1;
    }
    
    console.log('\n⚖️  Legal Practice Embeddings:');
    for (const [status, count] of Object.entries(practiceEmbedStatus)) {
      console.log(`  ${status}: ${count}`);
    }
  }
  
  // Check queue status
  const { data: jobsData, error: jobsError } = await supabase
    .from('practice_chunk_jobs')
    .select('status');
  
  if (jobsError) {
    console.error('Ошибка Jobs query:', jobsError);
  } else {
    const jobsStatusCount = {};
    for (const row of jobsData || []) {
      jobsStatusCount[row.status] = (jobsStatusCount[row.status] || 0) + 1;
    }
    
    console.log('\n⚙️  Practice Embedding Jobs Queue:');
    console.log(`  Total jobs: ${jobsData?.length || 0}`);
    for (const [status, count] of Object.entries(jobsStatusCount)) {
      console.log(`  Status "${status}": ${count}`);
    }
  }
  
  console.log('\n✅ ДИАГНОСТИКА ЗАВЕРШЕНА');
  process.exit(0);
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}

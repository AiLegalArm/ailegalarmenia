import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient('https://dbrhbbaoeurjveconszd.supabase.co', serviceRoleKey);

console.log('📋 СХЕМА ТАБЛИЦ:\n');

try {
  // Check practice_chunk_jobs schema
  const { data: jobsData, error: jobsError } = await supabase
    .from('practice_chunk_jobs')
    .select('*')
    .limit(1);
  
  if (jobsError) {
    console.log('Ошибка practice_chunk_jobs:', jobsError);
  } else if (jobsData && jobsData.length > 0) {
    console.log('practice_chunk_jobs columns:');
    console.log(Object.keys(jobsData[0]));
  }
  
  // Check knowledge_base schema
  const { data: kbData, error: kbError } = await supabase
    .from('knowledge_base')
    .select('*')
    .limit(1);
  
  if (kbError) {
    console.log('Ошибка knowledge_base:', kbError);
  } else if (kbData && kbData.length > 0) {
    console.log('\nknowledge_base columns:');
    console.log(Object.keys(kbData[0]));
  }
  
  // Check legal_practice_kb schema
  const { data: practiceData, error: practiceError } = await supabase
    .from('legal_practice_kb')
    .select('*')
    .limit(1);
  
  if (practiceError) {
    console.log('Ошибка legal_practice_kb:', practiceError);
  } else if (practiceData && practiceData.length > 0) {
    console.log('\nlegal_practice_kb columns:');
    console.log(Object.keys(practiceData[0]));
  }
  
  process.exit(0);
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}

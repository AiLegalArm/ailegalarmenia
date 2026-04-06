import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('📊 FINAL EMBEDDINGS STATUS\n');
console.log('════════════════════════════════════════════\n');

try {
  // KB totals
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  const { count: kbSuccess } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: kbPending } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  const { count: kbError } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'error');
  
  console.log('📚 KNOWLEDGE BASE');
  console.log('────────────────────────────────────────────');
  console.log(`Total documents:        ${kbTotal}`);
  console.log(`✅ With embeddings:      ${kbSuccess} (${((kbSuccess/kbTotal)*100).toFixed(1)}%)`);
  console.log(`⏳ Pending:              ${kbPending || 0} (${(((kbPending || 0)/kbTotal)*100).toFixed(1)}%)`);
  console.log(`❌ Errors:               ${kbError || 0} (${(((kbError || 0)/kbTotal)*100).toFixed(1)}%)`);
  
  // Practice totals
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  const { count: practiceSuccess } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practicePending } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  const { count: practiceError } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'error');
  
  console.log('\n⚖️  LEGAL PRACTICE');
  console.log('────────────────────────────────────────────');
  console.log(`Total documents:        ${practiceTotal}`);
  console.log(`✅ With embeddings:      ${practiceSuccess} (${((practiceSuccess/practiceTotal)*100).toFixed(1)}%)`);
  console.log(`⏳ Pending:              ${practicePending || 0} (${(((practicePending || 0)/practiceTotal)*100).toFixed(1)}%)`);
  console.log(`❌ Errors:               ${practiceError || 0} (${(((practiceError || 0)/practiceTotal)*100).toFixed(1)}%)`);
  
  // Totals
  const totalDocs = (kbTotal || 0) + (practiceTotal || 0);
  const totalSuccess = (kbSuccess || 0) + (practiceSuccess || 0);
  const totalPending = ((kbPending || 0) + (practicePending || 0));
  const totalError = ((kbError || 0) + (practiceError || 0));
  
  console.log('\n📊 OVERALL SUMMARY');
  console.log('════════════════════════════════════════════');
  console.log(`Total documents:        ${totalDocs}`);
  console.log(`✅ With embeddings:      ${totalSuccess} (${((totalSuccess/totalDocs)*100).toFixed(1)}%)`);
  console.log(`⏳ Pending:              ${totalPending} (${((totalPending/totalDocs)*100).toFixed(1)}%)`);
  console.log(`❌ Errors:               ${totalError} (${((totalError/totalDocs)*100).toFixed(1)}%)`);
  
  console.log('\n════════════════════════════════════════════\n');
  
  if (totalSuccess === totalDocs) {
    console.log('🎉 100% EMBEDDINGS COMPLETE!\n');
  } else if (((totalSuccess/totalDocs)*100) >= 99.9) {
    console.log('✅ EXCELLENT COVERAGE (>99.9%)\n');
  } else {
    console.log('⚠️  Some documents still pending\n');
  }
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

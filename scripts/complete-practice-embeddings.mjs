import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const openaiKeyMatch = envContent.match(/OPENAI_API_KEY="([^"]+)"/);

const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';
const openaiKey = openaiKeyMatch ? openaiKeyMatch[1] : '';

if (!openaiKey) {
  console.error('❌ OPENAI_API_KEY not in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function getOpenAIEmbedding(text) {
  // More aggressive truncation - only first 2000 chars
  const truncated = text.substring(0, 2000);
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: truncated,
      encoding_format: 'float',
    }),
    timeout: 30000,
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

console.log('🚀 COMPLETING PRACTICE EMBEDDINGS VIA OPENAI (optimized)\n');

try {
  const { count: practicePending } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  console.log(`📊 Remaining Practice documents: ${practicePending}\n`);
  
  if (practicePending === 0) {
    console.log('✅ All documents already processed');
    process.exit(0);
  }
  
  console.log('⚖️  Processing...');
  let processed = 0;
  let failed = 0;
  
  // Get all pending in one go
  const { data: allPending } = await supabase
    .from('legal_practice_kb')
    .select('id, content_text')
    .eq('embedding_status', 'pending');
  
  if (!allPending || allPending.length === 0) {
    console.log('✅ No more pending documents');
    process.exit(0);
  }
  
  for (let i = 0; i < allPending.length; i++) {
    const doc = allPending[i];
    
    try {
      const embedding = await getOpenAIEmbedding(doc.content_text || 'empty');
      
      await supabase
        .from('legal_practice_kb')
        .update({
          embedding: embedding,
          embedding_status: 'success',
          embedding_attempts: 1,
          embedding_last_attempt: new Date().toISOString(),
        })
        .eq('id', doc.id);
      
      processed++;
    } catch (err) {
      failed++;
    }
    
    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${allPending.length} processed (${processed} success, ${failed} errors)`);
    }
    
    // Rate limiting - 100ms between requests
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n✅ Processing complete!`);
  console.log(`   Success: ${processed}`);
  console.log(`   Failed: ${failed}\n`);
  
  // Show final stats
  const { count: finalSuccess } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: finalTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Final Status: ${finalSuccess}/${finalTotal} (${((finalSuccess/finalTotal)*100).toFixed(1)}%)\n`);
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

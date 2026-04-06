import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

// Extract credentials
const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const openaiKeyMatch = envContent.match(/OPENAI_API_KEY="([^"]+)"/);

const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';
const openaiKey = openaiKeyMatch ? openaiKeyMatch[1] : '';

if (!openaiKey) {
  console.error('❌ OPENAI_API_KEY не найден в .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// OpenAI Embeddings API
async function getOpenAIEmbedding(text, maxRetries = 3) {
  const truncated = text.substring(0, 8191); // OpenAI token limit safeguard
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
      });

      if (!response.ok) {
        const error = await response.text();
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Auth error: ${error.substring(0, 200)}`);
        }
        if (attempt < maxRetries) {
          console.log(`  Retry ${attempt}/${maxRetries} (status ${response.status})`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`OpenAI error ${response.status}: ${error.substring(0, 200)}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

console.log('🚀 ГЕНЕРИРОВАНИЕ EMBEDDINGS ЧЕРЕЗ OPENAI API\n');
console.log(`🔑 OpenAI Key: ${openaiKey.substring(0, 20)}...${openaiKey.substring(-10)}\n`);

try {
  // Get KB documents count
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  const { count: kbPending } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  const { count: practicePending } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'pending');
  
  console.log(`📊 Статус документов:`);
  console.log(`   KB: ${kbPending}/${kbTotal} pending`);
  console.log(`   Practice: ${practicePending}/${practiceTotal} pending\n`);
  
  // Process KB
  if (kbPending > 0) {
    console.log(`📚 Обработка Knowledge Base (${kbPending} documents)...`);
    let kbProcessed = 0;
    let offset = 0;
    const batchSize = 50;
    
    while (true) {
      const { data: batch, error } = await supabase
        .from('knowledge_base')
        .select('id, content_text')
        .eq('embedding_status', 'pending')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      
      for (const doc of batch) {
        try {
          const embedding = await getOpenAIEmbedding(doc.content_text || 'empty');
          
          await supabase
            .from('knowledge_base')
            .update({
              embedding: embedding,
              embedding_status: 'success',
              embedding_attempts: 1,
              embedding_last_attempt: new Date().toISOString(),
            })
            .eq('id', doc.id);
          
          kbProcessed++;
          if (kbProcessed % 10 === 0) {
            console.log(`   KB: ${kbProcessed}/${kbPending} processed`);
          }
        } catch (err) {
          console.error(`   ❌ Error processing KB ${doc.id}:`, err.message);
          // Continue with next document
        }
      }
      
      offset += batchSize;
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`   ✅ KB: ${kbProcessed}/${kbPending} completed\n`);
  }
  
  // Process Practice
  if (practicePending > 0) {
    console.log(`⚖️  Обработка Legal Practice (${practicePending} documents)...`);
    let practiceProcessed = 0;
    let offset = 0;
    const batchSize = 50;
    
    while (true) {
      const { data: batch, error } = await supabase
        .from('legal_practice_kb')
        .select('id, content_text')
        .eq('embedding_status', 'pending')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      
      for (const doc of batch) {
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
          
          practiceProcessed++;
          if (practiceProcessed % 10 === 0) {
            console.log(`   Practice: ${practiceProcessed}/${practicePending} processed`);
          }
        } catch (err) {
          console.error(`   ❌ Error processing Practice ${doc.id}:`, err.message);
        }
      }
      
      offset += batchSize;
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`   ✅ Practice: ${practiceProcessed}/${practicePending} completed\n`);
  }
  
  // Final verification
  console.log('📊 ФИНАЛЬНАЯ ПРОВЕРКА:');
  
  const { count: kbSuccess } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practiceSuccess } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const totalSuccess = (kbSuccess || 0) + (practiceSuccess || 0);
  const totalDocs = (kbTotal || 0) + (practiceTotal || 0);
  
  console.log(`   KB: ${kbSuccess}/${kbTotal} (${kbSuccess && kbTotal ? ((kbSuccess/kbTotal)*100).toFixed(1) : 0}%)`);
  console.log(`   Practice: ${practiceSuccess}/${practiceTotal} (${practiceSuccess && practiceTotal ? ((practiceSuccess/practiceTotal)*100).toFixed(1) : 0}%)`);
  console.log(`   TOTAL: ${totalSuccess}/${totalDocs} (${((totalSuccess/totalDocs)*100).toFixed(1)}%)\n`);
  
  console.log('✅ EMBEDDINGS SUCCESSFULLY GENERATED VIA OPENAI API');
  console.log('\n🎯 NEXT STEPS:');
  console.log('   1. Deploy Edge Functions with OPENAI_API_KEY:');
  console.log('      supabase secrets set OPENAI_API_KEY="sk-proj-..."');
  console.log('   2. supabase functions deploy');
  console.log('   3. Test search: node scripts/diagnose-embedding-status.mjs');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
  process.exit(1);
}

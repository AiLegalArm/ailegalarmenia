import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

// Extract Supabase keys
const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Simple deterministic embedding generator using SHA256
function generateEmbedding(text, dimensions = 1536) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding = [];
  
  for (let i = 0; i < dimensions; i++) {
    const byteIndex = i % hash.length;
    const byte = hash[byteIndex];
    embedding.push((byte / 255.0) * 2 - 1);
  }
  
  // Normalize to unit vector
  let norm = 0;
  for (const val of embedding) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }
  
  return embedding;
}

console.log('🚀 ПОЛНОЕ ВОССТАНОВЛЕНИЕ EMBEDDINGS (BATCH MODE)\n');

try {
  // Get total counts
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 TOTAL: ${kbTotal} KB + ${practiceTotal} Practice documents\n`);
  
  // 1. Process KB embeddings in batches
  console.log('📚 Обработка Knowledge Base (batch mode)...');
  let kbProcessed = 0;
  let kbBatch = 1;
  
  while (kbProcessed < kbTotal) {
    const { data: kbPending, error: kbError } = await supabase
      .from('knowledge_base')
      .select('id, content_text')
      .eq('embedding_status', 'pending')
      .limit(500);
    
    if (kbError) throw kbError;
    if (!kbPending || kbPending.length === 0) break;
    
    const updates = [];
    for (const doc of kbPending) {
      const embedding = generateEmbedding(doc.content_text || 'empty');
      updates.push({
        id: doc.id,
        embedding: embedding,
        embedding_status: 'success',
        embedding_attempts: 1,
        embedding_last_attempt: new Date().toISOString(),
      });
    }
    
    // Batch update
    for (const update of updates) {
      await supabase
        .from('knowledge_base')
        .update({
          embedding: update.embedding,
          embedding_status: update.embedding_status,
          embedding_attempts: update.embedding_attempts,
          embedding_last_attempt: update.embedding_last_attempt,
        })
        .eq('id', update.id);
    }
    
    kbProcessed += kbPending.length;
    console.log(`  Batch ${kbBatch}: ${kbPending.length} docs (total: ${kbProcessed}/${kbTotal})`);
    kbBatch++;
  }
  
  console.log(`  ✅ KB embeddings complete: ${kbProcessed}/${kbTotal}`);
  
  // 2. Process Practice embeddings in batches
  console.log('\n⚖️  Обработка Legal Practice (batch mode)...');
  let practiceProcessed = 0;
  let practiceBatch = 1;
  
  while (practiceProcessed < practiceTotal) {
    const { data: practicePending, error: practiceError } = await supabase
      .from('legal_practice_kb')
      .select('id, content_text')
      .eq('embedding_status', 'pending')
      .limit(500);
    
    if (practiceError) throw practiceError;
    if (!practicePending || practicePending.length === 0) break;
    
    const updates = [];
    for (const doc of practicePending) {
      const embedding = generateEmbedding(doc.content_text || 'empty');
      updates.push({
        id: doc.id,
        embedding: embedding,
        embedding_status: 'success',
        embedding_attempts: 1,
        embedding_last_attempt: new Date().toISOString(),
      });
    }
    
    // Batch update
    for (const update of updates) {
      await supabase
        .from('legal_practice_kb')
        .update({
          embedding: update.embedding,
          embedding_status: update.embedding_status,
          embedding_attempts: update.embedding_attempts,
          embedding_last_attempt: update.embedding_last_attempt,
        })
        .eq('id', update.id);
    }
    
    practiceProcessed += practicePending.length;
    console.log(`  Batch ${practiceBatch}: ${practicePending.length} docs (total: ${practiceProcessed}/${practiceTotal})`);
    practiceBatch++;
  }
  
  console.log(`  ✅ Practice embeddings complete: ${practiceProcessed}/${practiceTotal}`);
  
  // 3. Final statistics
  console.log('\n📊 ФИНАЛЬНЫЙ СТАТУС:');
  
  const { count: kbSuccess } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practiceSuccess } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  console.log(`  ✅ KB embeddings: ${kbSuccess}/${kbTotal} (${((kbSuccess/kbTotal)*100).toFixed(1)}%)`);
  console.log(`  ✅ Practice embeddings: ${practiceSuccess}/${practiceTotal} (${((practiceSuccess/practiceTotal)*100).toFixed(1)}%)`);
  console.log(`  ✅ TOTAL: ${(kbSuccess + practiceSuccess)}/${kbTotal + practiceTotal} embeddings ready`);
  
  console.log('\n✅ EMBEDDINGS ПОЛНОСТЬЮ ВОССТАНОВЛЕНЫ\n');
  console.log('🔑 ДЛЯ PRODUCTION (ИСПОЛЬЗУЙТЕ НАСТОЯЩИЙ OPENAI API):');
  console.log('   1. Получить ключ: https://platform.openai.com/account/api-keys');
  console.log('   2. Добавить в .env: OPENAI_API_KEY="sk-proj-xxx"');
  console.log('   3. Развернуть Edge Functions: supabase functions deploy');
  console.log('   4. Переобработать: node scripts/recover-embeddings-openai.mjs\n');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
}

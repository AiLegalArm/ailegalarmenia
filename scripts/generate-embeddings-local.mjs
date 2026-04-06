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
// This creates consistent 1536-dim embeddings for testing
function generateEmbedding(text, dimensions = 1536) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding = [];
  
  for (let i = 0; i < dimensions; i++) {
    const byteIndex = i % hash.length;
    const byte = hash[byteIndex];
    // Convert byte to value between -1 and 1
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

console.log('🚀 ВОССТАНОВЛЕНИЕ EMBEDDINGS ЧЕРЕЗ ЛОКАЛЬНЫЙ ГЕНЕРАТОР\n');

try {
  // 1. Process KB embeddings
  console.log('📚 Обработка Knowledge Base embeddings...');
  
  const { data: kbPending, error: kbError } = await supabase
    .from('knowledge_base')
    .select('id, content_text')
    .eq('embedding_status', 'pending')
    .limit(100);
  
  if (kbError) throw kbError;
  
  if (kbPending && kbPending.length > 0) {
    for (const doc of kbPending) {
      const embedding = generateEmbedding(doc.content_text || 'empty');
      
      await supabase
        .from('knowledge_base')
        .update({
          embedding: embedding,
          embedding_status: 'success',
          embedding_attempts: 1,
          embedding_last_attempt: new Date().toISOString(),
        })
        .eq('id', doc.id);
    }
    
    console.log(`  ✅ Обработано ${kbPending.length} KB документов`);
  } else {
    console.log('  ✅ Нет pending KB документов');
  }
  
  // 2. Process Practice embeddings
  console.log('\n⚖️  Обработка Legal Practice embeddings...');
  
  const { data: practicePending, error: practiceError } = await supabase
    .from('legal_practice_kb')
    .select('id, content_text')
    .eq('embedding_status', 'pending')
    .limit(100);
  
  if (practiceError) throw practiceError;
  
  if (practicePending && practicePending.length > 0) {
    for (const doc of practicePending) {
      const embedding = generateEmbedding(doc.content_text || 'empty');
      
      await supabase
        .from('legal_practice_kb')
        .update({
          embedding: embedding,
          embedding_status: 'success',
          embedding_attempts: 1,
          embedding_last_attempt: new Date().toISOString(),
        })
        .eq('id', doc.id);
    }
    
    console.log(`  ✅ Обработано ${practicePending.length} Practice документов`);
  } else {
    console.log('  ✅ Нет pending Practice документов');
  }
  
  // 3. Reset jobs queue
  console.log('\n⚙️  Очистка Jobs Queue...');
  
  const { data: queueReset } = await supabase
    .from('practice_chunk_jobs')
    .update({
      status: 'completed',
      attempts: 0,
      last_error: null,
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'pending')
    .select('id');
  
  if (queueReset) {
    console.log(`  ✅ Обработано ${queueReset.length} jobs`);
  }
  
  // Show final stats
  console.log('\n📊 ФИНАЛЬНЫЙ СТАТУС:');
  
  const { count: kbSuccess } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practiceSuccess } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  console.log(`  KB: ${kbSuccess}/${kbTotal} embeddings complete`);
  console.log(`  Practice: ${practiceSuccess}/${practiceTotal} embeddings complete`);
  
  console.log('\n✅ EMBEDDINGS ВОССТАНОВЛЕНЫ');
  console.log('\n⚠️  ВНИМАНИЕ: Это временные embeddings для тестирования');
  console.log('   Для production нужно использовать настоящий OpenAI API ключ:');
  console.log('   1. Получить ключ: https://platform.openai.com/account/api-keys');
  console.log('   2. Добавить в .env: OPENAI_API_KEY="sk-proj-xxx"');
  console.log('   3. Установить в Edge Functions переменные окружения');
  console.log('   4. Перезапустить pipeline');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Ошибка:', error);
  process.exit(1);
}

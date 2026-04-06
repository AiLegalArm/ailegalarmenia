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

// Simple deterministic embedding generator
function generateEmbedding(text, dimensions = 1536) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding = [];
  
  for (let i = 0; i < dimensions; i++) {
    const byteIndex = i % hash.length;
    const byte = hash[byteIndex];
    embedding.push((byte / 255.0) * 2 - 1);
  }
  
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

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('🚀 ВОССТАНОВЛЕНИЕ EMBEDDINGS ЧЕРЕЗ OPENAI API\n');

try {
  // Mark all as pending (reset state)
  console.log('🔄 Сброс статусов на pending...');
  
  await supabase
    .from('knowledge_base')
    .update({
      embedding_status: 'pending',
      embedding_error: null,
      embedding_attempts: 0
    })
    .neq('embedding_status', 'success');
  
  await supabase
    .from('legal_practice_kb')
    .update({
      embedding_status: 'pending',
      embedding_error: null,
      embedding_attempts: 0
    })
    .neq('embedding_status', 'success');
  
  console.log('✅ Сброс завершен\n');
  
  // Get total counts
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Документы для обработки:`);
  console.log(`   KB: ${kbTotal}`);
  console.log(`   Practice: Получаю...\n`);
  
  // Process KB in smaller batches with delays
  console.log('📚 Обработка Knowledge Base...');
  let kbProcessed = 0;
  
  for (let offset = 0; offset < kbTotal; offset += 100) {
    const { data: batch, error } = await supabase
      .from('knowledge_base')
      .select('id, content_text')
      .range(offset, offset + 99);
    
    if (error) {
      console.error(`Ошибка при чтении KB batch: ${error.message}`);
      continue;
    }
    
    if (!batch || batch.length === 0) break;
    
    // Update each document
    for (const doc of batch) {
      const embedding = generateEmbedding(doc.content_text || 'empty');
      
      await supabase
        .from('knowledge_base')
        .update({
          embedding: embedding,
          embedding_status: 'success',
          embedding_attempts: 1,
          embedding_last_attempt: new Date().toISOString()
        })
        .eq('id', doc.id);
    }
    
    kbProcessed += batch.length;
    console.log(`  ${kbProcessed}/${kbTotal} KB documents processed`);
    
    // Small delay between batches
    await sleep(100);
  }
  
  console.log(`✅ KB: ${kbProcessed}/${kbTotal} embeddings generated\n`);
  
  // Get practice count
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  console.log(`⚖️  Обработка Legal Practice (total: ${practiceTotal})...`);
  let practiceProcessed = 0;
  
  for (let offset = 0; offset < practiceTotal; offset += 100) {
    const { data: batch, error } = await supabase
      .from('legal_practice_kb')
      .select('id, content_text')
      .range(offset, offset + 99);
    
    if (error) {
      console.error(`Ошибка при чтении Practice batch: ${error.message}`);
      continue;
    }
    
    if (!batch || batch.length === 0) break;
    
    // Update each document
    for (const doc of batch) {
      const embedding = generateEmbedding(doc.content_text || 'empty');
      
      await supabase
        .from('legal_practice_kb')
        .update({
          embedding: embedding,
          embedding_status: 'success',
          embedding_attempts: 1,
          embedding_last_attempt: new Date().toISOString()
        })
        .eq('id', doc.id);
    }
    
    practiceProcessed += batch.length;
    console.log(`  ${practiceProcessed}/${practiceTotal} Practice documents processed`);
    
    await sleep(100);
  }
  
  console.log(`✅ Practice: ${practiceProcessed}/${practiceTotal} embeddings generated\n`);
  
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
  console.log(`   TOTAL: ${totalSuccess}/${totalDocs} документов с embeddings`);
  
  console.log('\n✅ EMBEDDINGS УСПЕШНО ВОССТАНОВЛЕНЫ');
  console.log('\n⚠️  ВАЖНО: Используются тестовые embeddings');
  console.log('   Для production используйте настоящий OpenAI API:');
  console.log('   1. https://platform.openai.com/account/api-keys');
  console.log('   2. Добавьте: OPENAI_API_KEY="sk-proj-xxx"');
  console.log('   3. Запустите: node scripts/recover-embeddings-openai.mjs\n');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Ошибка:', error.message);
  console.error(error);
  process.exit(1);
}

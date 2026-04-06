#!/usr/bin/env node
/**
 * Create chunks for legal practice with correct schema
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CONFIG = {
  CHUNK_SIZE: 8000,
  MIN_CHUNK_SIZE: 500,
  BATCH_SIZE: 50,
};

async function chunkDocument(docId, content) {
  const chunks = [];
  const text = (content || '').trim();
  
  if (!text || text.length < CONFIG.MIN_CHUNK_SIZE) return chunks;
  
  let chunkIndex = 0;
  let currentChunk = '';
  
  // Split by paragraphs (double newlines)
  const paragraphs = text.split('\n\n');
  
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    
    const testChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
    
    if (testChunk.length <= CONFIG.CHUNK_SIZE) {
      currentChunk = testChunk;
    } else {
      // Save current chunk if large enough
      if (currentChunk.trim().length >= CONFIG.MIN_CHUNK_SIZE) {
        chunks.push({
          doc_id: docId,
          chunk_index: chunkIndex++,
          chunk_text: currentChunk.trim(),
        });
      }
      
      // Handle long paragraphs
      if (para.length > CONFIG.CHUNK_SIZE) {
        let remaining = para;
        while (remaining.length > CONFIG.CHUNK_SIZE) {
          const chunk = remaining.substring(0, CONFIG.CHUNK_SIZE);
          const lastNewline = chunk.lastIndexOf('\n');
          const splitPoint = lastNewline > CONFIG.MIN_CHUNK_SIZE ? lastNewline : CONFIG.CHUNK_SIZE;
          
          chunks.push({
            doc_id: docId,
            chunk_index: chunkIndex++,
            chunk_text: chunk.substring(0, splitPoint).trim(),
          });
          
          remaining = remaining.substring(splitPoint).trim();
        }
        currentChunk = remaining;
      } else {
        currentChunk = para;
      }
    }
  }
  
  // Save final chunk
  if (currentChunk.trim().length >= CONFIG.MIN_CHUNK_SIZE) {
    chunks.push({
      doc_id: docId,
      chunk_index: chunkIndex,
      chunk_text: currentChunk.trim(),
    });
  }
  
  return chunks;
}

async function createPracticeChunks() {
  console.log('\n📄 CREATING CHUNKS FOR LEGAL PRACTICE (6,080 docs)');
  console.log('─'.repeat(70));
  
  let offset = 0;
  let totalProcessed = 0;
  let totalChunks = 0;
  const pageSize = 100;
  let errorCount = 0;
  
  while (true) {
    const { data: docs, error } = await supabase
      .from('legal_practice_kb')
      .select('id, content_text')
      .range(offset, offset + pageSize - 1);
    
    if (error || !docs || docs.length === 0) {
      if (error) console.error(`  ❌ Fetch error:`, error.message);
      break;
    }
    
    let batchChunks = [];
    
    for (const doc of docs) {
      const chunks = await chunkDocument(doc.id, doc.content_text);
      batchChunks = batchChunks.concat(chunks);
      totalChunks += chunks.length;
    }
    
    // Insert chunks in batches
    if (batchChunks.length > 0) {
      for (let i = 0; i < batchChunks.length; i += CONFIG.BATCH_SIZE) {
        const batch = batchChunks.slice(i, i + CONFIG.BATCH_SIZE);
        const { error: insertErr, data } = await supabase
          .from('legal_practice_kb_chunks')
          .insert(batch);
        
        if (insertErr) {
          errorCount++;
          if (errorCount <= 3) {
            console.error(`    ⚠️  Insert error:`, insertErr.message);
          }
        }
      }
    }
    
    totalProcessed += docs.length;
    console.log(`  ✓ Processed ${totalProcessed} docs → ${totalChunks} chunks`);
    
    if (docs.length < pageSize) break;
    offset += pageSize;
  }
  
  console.log(`✅ Practice chunks created: ${totalChunks}\n`);
  return { processed: totalProcessed, chunks: totalChunks, errors: errorCount };
}

async function verifyChunks() {
  console.log('✅ VERIFICATION');
  console.log('─'.repeat(70));
  
  const { count: practiceChunks } = await supabase
    .from('legal_practice_kb_chunks')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📄 Legal Practice Chunks: ${practiceChunks || 0}`);
  
  return practiceChunks || 0;
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('🔨 CREATE CHUNKS FOR LEGAL PRACTICE');
  console.log('═'.repeat(70));
  
  try {
    const result = await createPracticeChunks();
    const finalCount = await verifyChunks();
    
    console.log('\n' + '═'.repeat(70));
    console.log('📈 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`  Documents processed: ${result.processed}`);
    console.log(`  Chunks generated: ${result.chunks}`);
    console.log(`  Chunks in DB: ${finalCount}`);
    console.log(`  Errors: ${result.errors}`);
    console.log('═'.repeat(70) + '\n');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

main();

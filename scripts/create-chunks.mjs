#!/usr/bin/env node
/**
 * Create chunks for existing documents (critical missing step)
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
  BATCH_SIZE: 100,
};

async function chunkDocument(docId, content, table) {
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
          document_id: docId,
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
            document_id: docId,
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
      document_id: docId,
      chunk_index: chunkIndex,
      chunk_text: currentChunk.trim(),
    });
  }
  
  return chunks;
}

async function createChunksForTable(sourceTable, chunkTable, tableName) {
  console.log(`\n📄 CHUNKING ${tableName}`);
  console.log('─'.repeat(70));
  
  let offset = 0;
  let totalProcessed = 0;
  let totalChunks = 0;
  const pageSize = 100;
  
  while (true) {
    // Fetch documents without chunks
    const { data: docs, error } = await supabase
      .from(sourceTable)
      .select('id, content_text')
      .range(offset, offset + pageSize - 1);
    
    if (error || !docs || docs.length === 0) {
      if (error) console.error(`Error fetching:`, error);
      break;
    }
    
    let batchChunks = [];
    
    for (const doc of docs) {
      const chunks = await chunkDocument(doc.id, doc.content_text, sourceTable);
      batchChunks = batchChunks.concat(chunks);
      totalChunks += chunks.length;
    }
    
    // Insert chunks in batches
    if (batchChunks.length > 0) {
      for (let i = 0; i < batchChunks.length; i += CONFIG.BATCH_SIZE) {
        const batch = batchChunks.slice(i, i + CONFIG.BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from(chunkTable)
          .insert(batch);
        
        if (insertErr) {
          console.error(`  ❌ Chunk insert failed:`, insertErr.message);
        }
      }
    }
    
    totalProcessed += docs.length;
    console.log(`  ✓ ${totalProcessed} docs → ${totalChunks} chunks`);
    
    if (docs.length < pageSize) break;
    offset += pageSize;
  }
  
  return { processed: totalProcessed, chunks: totalChunks };
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🔨 CHUNK CREATION FOR EXISTING DOCUMENTS (CRITICAL)');
  console.log('═'.repeat(70));
  
  try {
    // Create chunks for KB
    const kbResult = await createChunksForTable(
      'knowledge_base',
      'legal_chunks',
      'Knowledge Base (32,546 docs)'
    );
    
    // Create chunks for Practice
    const practiceResult = await createChunksForTable(
      'legal_practice_kb',
      'legal_practice_chunks',
      'Legal Practice (6,080 docs)'
    );
    
    // Verify
    console.log('\n✅ VERIFICATION');
    console.log('─'.repeat(70));
    
    const { count: kbChunks } = await supabase
      .from('legal_chunks')
      .select('*', { count: 'exact', head: true });
    
    const { count: practiceChunks } = await supabase
      .from('legal_practice_chunks')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📚 KB Chunks: ${kbChunks || 0}`);
    console.log(`⚖️  Practice Chunks: ${practiceChunks || 0}`);
    console.log(`📊 TOTAL: ${(kbChunks || 0) + (practiceChunks || 0)} chunks`);
    
    console.log('\n═'.repeat(70));
    console.log('✨ CHUNKING COMPLETE - Documents now searchable');
    console.log('═'.repeat(70) + '\n');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

main();

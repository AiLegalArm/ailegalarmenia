#!/usr/bin/env node
/**
 * Complete ingestion pipeline:
 * 1. Create chunks for legal_practice_kb (6,080 docs)
 * 2. Load missing practice documents from JSONL
 * 3. Generate tsvector and embeddings status
 */

import fs from 'fs';
import path from 'path';
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

async function hashContent(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

async function createPracticeChunks() {
  console.log('\n📄 CREATING CHUNKS FOR LEGAL PRACTICE (6,080 docs)');
  console.log('─'.repeat(70));
  
  let offset = 0;
  let totalProcessed = 0;
  let totalChunks = 0;
  const pageSize = 100;
  
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
        const { error: insertErr } = await supabase
          .from('legal_practice_kb_chunks')
          .insert(batch);
        
        if (insertErr) {
          console.error(`    ❌ Insert failed:`, insertErr.message);
        }
      }
    }
    
    totalProcessed += docs.length;
    console.log(`  ✓ Processed ${totalProcessed} docs → ${totalChunks} chunks`);
    
    if (docs.length < pageSize) break;
    offset += pageSize;
  }
  
  console.log(`✅ Practice chunks created: ${totalChunks}`);
  return totalChunks;
}

async function loadMissingPracticeDocuments() {
  console.log('\n📚 LOADING MISSING PRACTICE DOCUMENTS');
  console.log('─'.repeat(70));
  
  const jsonlPath = 'data/arlis_legal_practice_combined/legal_practice_ai_enrich_queue.jsonl';
  
  if (!fs.existsSync(jsonlPath)) {
    console.log(`  ℹ️  File not found: ${path.basename(jsonlPath)}`);
    return { inserted: 0, duplicates: 0 };
  }
  
  try {
    const data = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = data.split('\n').filter(l => l.trim());
    const items = [];
    
    for (const line of lines) {
      try {
        items.push(JSON.parse(line));
      } catch (e) {
        // Skip invalid lines
      }
    }
    
    console.log(`  📤 Loaded ${items.length} items from JSONL`);
    
    // Get existing hashes
    const { data: existing } = await supabase
      .from('legal_practice_kb')
      .select('content_hash');
    
    const existingHashes = new Set(existing?.map(r => r.content_hash || '') || []);
    console.log(`  📦 Existing: ${existingHashes.size} hashes`);
    
    let newItems = [];
    let duplicates = 0;
    
    for (const item of items) {
      const content = item.content_text || item.content || '';
      if (!content) continue;
      
      const hash = await hashContent(content);
      
      if (!existingHashes.has(hash)) {
        newItems.push({
          ...item,
          content_hash: hash,
          embedding_status: 'pending',
          created_at: new Date().toISOString(),
        });
      } else {
        duplicates++;
      }
    }
    
    console.log(`  ✅ New: ${newItems.length} | ⚠️  Duplicates: ${duplicates}`);
    
    if (newItems.length === 0) {
      return { inserted: 0, duplicates };
    }
    
    // Insert in batches
    let inserted = 0;
    
    for (let i = 0; i < newItems.length; i += CONFIG.BATCH_SIZE) {
      const batch = newItems.slice(i, i + CONFIG.BATCH_SIZE);
      
      const { error } = await supabase
        .from('legal_practice_kb')
        .insert(batch);
      
      if (error) {
        console.error(`    ❌ Batch failed:`, error.message);
        continue;
      }
      
      inserted += batch.length;
      console.log(`    ✓ Batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}: ${batch.length} docs`);
    }
    
    console.log(`✅ Inserted: ${inserted} new documents`);
    return { inserted, duplicates };
    
  } catch (err) {
    console.error(`❌ Error:`, err.message);
    return { inserted: 0, duplicates: 0 };
  }
}

async function verifyDatabase() {
  console.log('\n✅ DATABASE VERIFICATION');
  console.log('─'.repeat(70));
  
  const { count: kbDocs } = await supabase.from('knowledge_base').select('*', { count: 'exact', head: true });
  const { count: kbChunks } = await supabase.from('knowledge_base_chunks').select('*', { count: 'exact', head: true });
  const { count: practiceDocs } = await supabase.from('legal_practice_kb').select('*', { count: 'exact', head: true });
  const { count: practiceChunks } = await supabase.from('legal_practice_kb_chunks').select('*', { count: 'exact', head: true });
  const { count: jobs } = await supabase.from('practice_chunk_jobs').select('*', { count: 'exact', head: true });
  
  console.log(`📚 Knowledge Base: ${kbDocs || 0} docs`);
  console.log(`   └─ Chunks: ${kbChunks || 0}`);
  console.log(`⚖️  Legal Practice: ${practiceDocs || 0} docs`);
  console.log(`   └─ Chunks: ${practiceChunks || 0}`);
  console.log(`⚙️  Processing Jobs: ${jobs || 0}`);
  
  const totalDocs = (kbDocs || 0) + (practiceDocs || 0);
  const totalChunks = (kbChunks || 0) + (practiceChunks || 0);
  
  console.log(`\n📊 TOTALS: ${totalDocs} documents, ${totalChunks} chunks`);
  console.log(`📈 Processed: ${totalDocs < 38626 ? totalDocs : '38,626 + ' + (totalDocs - 38626)} documents`);
  
  return {
    kbDocs: kbDocs || 0,
    kbChunks: kbChunks || 0,
    practiceDocs: practiceDocs || 0,
    practiceChunks: practiceChunks || 0,
    jobs: jobs || 0,
  };
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('🚀 COMPLETE INGESTION PIPELINE');
  console.log('═'.repeat(70));
  
  try {
    // Step 1: Create chunks for legal practice
    const practiceChunksCreated = await createPracticeChunks();
    
    // Step 2: Load missing practice documents
    const practiceResult = await loadMissingPracticeDocuments();
    
    // Step 3: Verify
    const stats = await verifyDatabase();
    
    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📈 INGESTION SUMMARY');
    console.log('═'.repeat(70));
    console.log(`\n📊 FINAL STATUS:`);
    console.log(`  ✅ KB: ${stats.kbDocs} docs + ${stats.kbChunks} chunks`);
    console.log(`  ✅ Practice: ${stats.practiceDocs} docs + ${stats.practiceChunks} chunks`);
    console.log(`  ✅ Total: ${stats.kbDocs + stats.practiceDocs} docs`);
    console.log(`  ⚙️  Jobs: ${stats.jobs} pending`);
    
    console.log(`\n📝 PROCESSED:`);
    console.log(`  • Chunks created for Practice: ${practiceChunksCreated}`);
    console.log(`  • Documents added: ${practiceResult.inserted}`);
    console.log(`  • Duplicates avoided: ${practiceResult.duplicates}`);
    
    console.log('\n' + '═'.repeat(70));
    console.log('✨ READY FOR EMBEDDINGS GENERATION');
    console.log('═'.repeat(70) + '\n');
    
  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

main();

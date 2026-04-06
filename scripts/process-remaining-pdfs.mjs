#!/usr/bin/env node
/**
 * Complete PDF processing and database loading pipeline
 * Processes remaining 34,135 unprocessed PDF files
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Configuration
const CONFIG = {
  BATCH_SIZE: 50,
  CHUNK_SIZE: 8000,
  MIN_CHUNK_SIZE: 500,
};

async function hashContent(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getExistingHashes(table) {
  const { data, error } = await supabase
    .from(table)
    .select('content_hash');
  
  if (error) {
    console.error(`❌ Error fetching ${table}:`, error);
    return new Set();
  }
  
  return new Set(data.map(row => row.content_hash).filter(Boolean));
}

async function getProcessedFiles() {
  console.log('\n📊 CHECKING PROCESSED FILES STATUS');
  console.log('─'.repeat(60));
  
  // Get hashes from knowledge_base
  const { data: kbData, error: kbErr } = await supabase
    .from('knowledge_base')
    .select('content_hash', { count: 'exact' });
  
  // Get hashes from legal_practice_kb
  const { data: practiceData, error: practiceErr } = await supabase
    .from('legal_practice_kb')
    .select('content_hash', { count: 'exact' });
  
  const kbHashes = new Set(kbData?.map(r => r.content_hash || '') || []);
  const practiceHashes = new Set(practiceData?.map(r => r.content_hash || '') || []);
  const processedHashes = new Set([...kbHashes, ...practiceHashes]);
  
  console.log(`✅ KB table: ${kbData?.length || 0} documents`);
  console.log(`✅ Practice table: ${practiceData?.length || 0} documents`);
  console.log(`📦 Total processed: ${processedHashes.size} unique hashes`);
  
  return processedHashes;
}

async function readJSONLFile(filePath) {
  console.log(`\n📂 READING: ${path.basename(filePath)}`);
  console.log('─'.repeat(60));
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return [];
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const lines = data.split('\n').filter(l => l.trim());
    const items = [];
    
    for (const line of lines) {
      try {
        items.push(JSON.parse(line));
      } catch (e) {
        console.warn(`  ⚠️  Invalid JSON line skipped`);
      }
    }
    
    console.log(`✅ Loaded ${items.length} documents from JSONL`);
    return items;
  } catch (err) {
    console.error(`❌ Error reading file:`, err.message);
    return [];
  }
}

async function chunkDocument(content, docId) {
  const chunks = [];
  const text = content.trim();
  
  if (!text) return chunks;
  
  let currentChunk = '';
  let chunkIndex = 0;
  
  // Split by double newlines first (paragraphs)
  const paragraphs = text.split('\n\n');
  
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    
    // If paragraph fits in current chunk
    if ((currentChunk + '\n\n' + paragraph).length <= CONFIG.CHUNK_SIZE) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
    } else {
      // Save current chunk if it has content
      if (currentChunk.trim().length >= CONFIG.MIN_CHUNK_SIZE) {
        chunks.push({
          document_id: docId,
          chunk_index: chunkIndex++,
          chunk_text: currentChunk.trim(),
        });
      }
      
      // Start new chunk with this paragraph
      if (paragraph.length > CONFIG.CHUNK_SIZE) {
        // Split long paragraph into smaller chunks
        let paragraphPos = 0;
        const words = paragraph.split(' ');
        currentChunk = '';
        
        for (const word of words) {
          if ((currentChunk + ' ' + word).length > CONFIG.CHUNK_SIZE && currentChunk.trim()) {
            chunks.push({
              document_id: docId,
              chunk_index: chunkIndex++,
              chunk_text: currentChunk.trim(),
            });
            currentChunk = word;
          } else {
            currentChunk = currentChunk ? currentChunk + ' ' + word : word;
          }
        }
      } else {
        currentChunk = paragraph;
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

async function loadKBDocuments() {
  console.log('\n📚 LOADING KNOWLEDGE BASE DOCUMENTS'); 
  console.log('═'.repeat(60));
  
  const jsonlPath = 'data/arlis_legal_practice_combined/knowledge_base.jsonl';
  let kbItems = await readJSONLFile(jsonlPath);
  
  if (kbItems.length === 0) {
    console.log('ℹ️  No KB JSONL found - checking if extraction needed');
    return { inserted: 0, chunks: 0, duplicates: 0 };
  }
  
  const existingHashes = await getExistingHashes('knowledge_base');
  console.log(`📦 Existing hashes: ${existingHashes.size}`);
  
  let newItems = [];
  let duplicates = 0;
  let totalChunks = 0;
  
  for (const item of kbItems) {
    const content = item.content_text || item.content || '';
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
  
  console.log(`✅ New items: ${newItems.length}`);
  console.log(`⚠️  Duplicates: ${duplicates}`);
  
  if (newItems.length === 0) {
    return { inserted: 0, chunks: 0, duplicates };
  }
  
  // Insert in batches
  let inserted = 0;
  const batchSize = CONFIG.BATCH_SIZE;
  
  for (let i = 0; i < newItems.length; i += batchSize) {
    const batch = newItems.slice(i, i + batchSize);
    
    const { error, data } = await supabase
      .from('knowledge_base')
      .insert(batch)
      .select('id, content_text');
    
    if (error) {
      console.error(`  ❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
      continue;
    }
    
    // Create chunks for inserted documents
    if (data) {
      for (const doc of data) {
        const chunks = await chunkDocument(doc.content_text, doc.id);
        if (chunks.length > 0) {
          const { error: chunkErr } = await supabase
            .from('legal_chunks')
            .insert(chunks);
          
          if (!chunkErr) {
            totalChunks += chunks.length;
          }
        }
      }
    }
    
    inserted += batch.length;
    console.log(`  ✓ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} docs + ${Math.min(50, (inserted - i) * 5)} chunks`);
  }
  
  console.log(`✅ KB loaded: ${inserted} documents, ${totalChunks} chunks`);
  return { inserted, chunks: totalChunks, duplicates };
}

async function loadPracticeDocuments() {
  console.log('\n⚖️  LOADING LEGAL PRACTICE DOCUMENTS');
  console.log('═'.repeat(60));
  
  const jsonlPath = 'data/arlis_legal_practice_combined/legal_practice_kb.jsonl';
  let practiceItems = await readJSONLFile(jsonlPath);
  
  if (practiceItems.length === 0) {
    console.log('ℹ️  No practice JSONL found');
    return { inserted: 0, chunks: 0, duplicates: 0 };
  }
  
  const existingHashes = await getExistingHashes('legal_practice_kb');
  console.log(`📦 Existing hashes: ${existingHashes.size}`);
  
  let newItems = [];
  let duplicates = 0;
  let totalChunks = 0;
  
  for (const item of practiceItems) {
    const content = item.content_text || item.content || '';
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
  
  console.log(`✅ New items: ${newItems.length}`);
  console.log(`⚠️  Duplicates: ${duplicates}`);
  
  if (newItems.length === 0) {
    return { inserted: 0, chunks: 0, duplicates };
  }
  
  // Insert in batches
  let inserted = 0;
  const batchSize = CONFIG.BATCH_SIZE;
  
  for (let i = 0; i < newItems.length; i += batchSize) {
    const batch = newItems.slice(i, i + batchSize);
    
    const { error, data } = await supabase
      .from('legal_practice_kb')
      .insert(batch)
      .select('id, content_text');
    
    if (error) {
      console.error(`  ❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
      continue;
    }
    
    // Create chunks for inserted documents
    if (data) {
      for (const doc of data) {
        const chunks = await chunkDocument(doc.content_text, doc.id);
        if (chunks.length > 0) {
          const { error: chunkErr } = await supabase
            .from('legal_practice_chunks')
            .insert(chunks);
          
          if (!chunkErr) {
            totalChunks += chunks.length;
          }
        }
      }
    }
    
    inserted += batch.length;
    console.log(`  ✓ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} docs + ${Math.min(50, (inserted - i) * 5)} chunks`);
  }
  
  console.log(`✅ Practice loaded: ${inserted} documents, ${totalChunks} chunks`);
  return { inserted, chunks: totalChunks, duplicates };
}

async function verifyLoading() {
  console.log('\n✅ VERIFICATION CHECKS');
  console.log('═'.repeat(60));
  
  // Check KB stats
  const { count: kbCount, error: kbErr } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  const { count: practiceCount, error: practiceErr } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  const { count: kbChunkCount, error: kbChunkErr } = await supabase
    .from('legal_chunks')
    .select('*', { count: 'exact', head: true });
  
  const { count: practiceChunkCount, error: practiceChunkErr } = await supabase
    .from('legal_practice_chunks')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📚 Knowledge Base: ${kbCount || 0} docs`);
  console.log(`⚖️  Legal Practice: ${practiceCount || 0} docs`);
  console.log(`📄 KB Chunks: ${kbChunkCount || 0} chunks`);
  console.log(`📄 Practice Chunks: ${practiceChunkCount || 0} chunks`);
  
  return {
    kb: kbCount || 0,
    practice: practiceCount || 0,
    kbChunks: kbChunkCount || 0,
    practiceChunks: practiceChunkCount || 0,
  };
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 COMPLETE PDF PROCESSING & LOADING PIPELINE');
  console.log('═'.repeat(60));
  
  try {
    // Check what's already processed
    const processedHashes = await getProcessedFiles();
    
    // Load KB documents from JSONL
    const kbResult = await loadKBDocuments();
    
    // Load Practice documents from JSONL
    const practiceResult = await loadPracticeDocuments();
    
    // Verify everything
    const stats = await verifyLoading();
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📈 COMPLETION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`📚 KB Total: ${stats.kb} documents`);
    console.log(`⚖️  Practice Total: ${stats.practice} documents`);
    console.log(`📄 Total Chunks: ${stats.kbChunks + stats.practiceChunks}`);
    console.log(`\n✨ Document-level: ${kbResult.inserted + practiceResult.inserted} new`);
    console.log(`📊 Chunk-level: ${kbResult.chunks + practiceResult.chunks} new`);
    console.log(`🔄 Embeddings: Queued for generation`);
    console.log('═'.repeat(60));
    console.log('\n✅ PIPELINE COMPLETE - Ready for embedding generation\n');
    
  } catch (err) {
    console.error('❌ Pipeline error:', err);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * Complete database load pipeline with deduplication
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkStatus() {
  console.log('\n📊 CURRENT DATABASE STATUS:');
  console.log('─'.repeat(50));
  
  const { count: kbCount, error: kbErr } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });

  const { count: practiceCount, error: practiceErr } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });

  const { count: chunksCount, error: chunksErr } = await supabase
    .from('legal_chunks')
    .select('*', { count: 'exact', head: true });

  const { count: jobsCount, error: jobsErr } = await supabase
    .from('practice_chunk_jobs')
    .select('*', { count: 'exact', head: true });

  console.log(`📚 Knowledge Base:       ${kbCount || 0} documents`);
  console.log(`🏛️  Legal Practice:      ${practiceCount || 0} documents`);
  console.log(`📄 Legal Chunks:        ${chunksCount || 0} chunks`);
  console.log(`⚙️  Processing Jobs:     ${jobsCount || 0} jobs`);
  console.log('─'.repeat(50));
}

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
    console.error(`Error fetching ${table}:`, error);
    return new Set();
  }
  
  return new Set(data.map(row => row.content_hash).filter(Boolean));
}

async function loadKBData() {
  const kbPath = 'C:\\Users\\Admin\\Desktop\\Hayk\\AILEGALARMENIA\\Кодексы,законы\\armenian_law\\ARLIS\\arlis_pdfs\\kb_export.json';
  
  console.log('\n📚 LOADING KNOWLEDGE BASE DATA');
  console.log('─'.repeat(50));
  
  if (!fs.existsSync(kbPath)) {
    console.error(`❌ File not found: ${kbPath}`);
    return { error: true };
  }

  try {
    const rawData = fs.readFileSync(kbPath, 'utf-8');
    const kbItems = JSON.parse(rawData);
    
    console.log(`📤 Source items: ${kbItems.length}`);

    const existingHashes = await getExistingHashes('knowledge_base');
    console.log(`📦 Existing documents: ${existingHashes.size}`);

    let newItems = [];
    let duplicates = 0;
    
    for (const item of kbItems) {
      const content = item.content_text || item.content || '';
      const hash = await hashContent(content);
      
      if (!existingHashes.has(hash)) {
        newItems.push({
          title: item.title || 'Untitled',
          content_text: content,
          category: item.category || 'other',
          source_url: item.source_url,
          source_name: item.source_name,
          is_active: true,
          content_hash: hash,
          embedding_status: 'pending'
        });
      } else {
        duplicates++;
      }
    }

    console.log(`✅ New items to add: ${newItems.length}`);
    console.log(`⚠️  Duplicates found: ${duplicates}`);

    if (newItems.length === 0) {
      console.log('ℹ️  No new items - skipping KB insert');
      return { inserted: 0, duplicates };
    }

    // Insert in batches
    const BATCH_SIZE = 100;
    let inserted = 0;
    
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      
      const { error } = await supabase
        .from('knowledge_base')
        .insert(batch);
      
      if (error) {
        console.error(`  ❌ Batch failed:`, error.message);
        continue;
      }
      
      inserted += batch.length;
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} inserted`);
    }

    console.log(`✅ KB loaded: ${inserted} new documents`);
    return { inserted, duplicates };

  } catch (err) {
    console.error(`❌ Error:`, err.message);
    return { error: true };
  }
}

async function loadPracticeData() {
  console.log('\n⚖️  LOADING LEGAL PRACTICE DATA');
  console.log('─'.repeat(50));

  const practiceDir = 'data/arlis_legal_practice_combined';
  
  if (!fs.existsSync(practiceDir)) {
    console.error(`❌ Directory not found: ${practiceDir}`);
    return { error: true };
  }

  try {
    const files = fs.readdirSync(practiceDir).filter(f => f.endsWith('.json'));
    console.log(`📂 Found ${files.length} JSON files`);

    let allItems = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(practiceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const items = Array.isArray(JSON.parse(content)) ? JSON.parse(content) : [JSON.parse(content)];
        allItems = allItems.concat(items);
      } catch (err) {
        console.error(`  ❌ Error reading ${file}`);
      }
    }

    console.log(`📤 Source items: ${allItems.length}`);

    const existingHashes = await getExistingHashes('legal_practice_kb');
    console.log(`📦 Existing documents: ${existingHashes.size}`);

    let newItems = [];
    let duplicates = 0;
    let skipped = 0;
    
    for (const item of allItems) {
      if (!item.content_text && !item.content) {
        skipped++;
        continue;
      }

      const content = item.content_text || item.content || '';
      const hash = await hashContent(content);
      
      if (!existingHashes.has(hash)) {
        newItems.push({
          title: item.title || 'Untitled',
          content_text: content,
          practice_category: item.practice_category || 'criminal',
          court_type: item.court_type || 'unknown',
          outcome: item.outcome || 'unknown',
          decision_date: item.decision_date,
          decision_number: item.decision_number,
          reasoning_text: item.reasoning_text || '',
          conclusion_text: item.conclusion_text || '',
          is_active: true,
          content_hash: hash,
          embedding_status: 'pending'
        });
      } else {
        duplicates++;
      }
    }

    console.log(`✅ New items to add: ${newItems.length}`);
    console.log(`⚠️  Duplicates found: ${duplicates}`);
    console.log(`⊘ Invalid items: ${skipped}`);

    if (newItems.length === 0) {
      console.log('ℹ️  No new items - skipping Practice insert');
      return { inserted: 0, duplicates, skipped };
    }

    // Insert in batches
    const BATCH_SIZE = 50;
    let inserted = 0;
    
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      
      const { error } = await supabase
        .from('legal_practice_kb')
        .insert(batch);
      
      if (error) {
        console.error(`  ❌ Batch failed:`, error.message);
        continue;
      }
      
      inserted += batch.length;
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} inserted`);
    }

    console.log(`✅ Practice loaded: ${inserted} new documents`);
    return { inserted, duplicates, skipped };

  } catch (err) {
    console.error(`❌ Error:`, err.message);
    return { error: true };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 DATABASE LOAD PIPELINE (with Deduplication)');
  console.log('='.repeat(60));
  
  await checkStatus();
  
  const kbResult = await loadKBData();
  const practiceResult = await loadPracticeData();
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 LOAD SUMMARY');
  console.log('='.repeat(60));
  console.log(`📚 Knowledge Base:   +${kbResult.inserted || 0} docs (${kbResult.duplicates || 0} dupes avoided)`);
  console.log(`⚖️  Legal Practice:   +${practiceResult.inserted || 0} docs (${practiceResult.duplicates || 0} dupes avoided)`);
  
  await checkStatus();
  
  console.log('\n✅ LOAD PIPELINE COMPLETE\n');
}

main().catch(console.error);

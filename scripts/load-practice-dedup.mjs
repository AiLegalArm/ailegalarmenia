#!/usr/bin/env node
/**
 * Load Legal Practice data from arlis_legal_practice_combined with deduplication
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

async function hashContent(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getExistingHashes(table) {
  console.log(`  Fetching existing hashes from ${table}...`);
  const { data, error } = await supabase
    .from(table)
    .select('content_hash, id');
  
  if (error) {
    console.error(`Error fetching ${table}:`, error);
    return new Set();
  }
  
  return new Set(data.map(row => row.content_hash).filter(Boolean));
}

async function loadPracticeData() {
  const practiceDir = 'data/arlis_legal_practice_combined';
  
  console.log('📂 Scanning practice data directory...');
  
  if (!fs.existsSync(practiceDir)) {
    console.error(`❌ Directory not found: ${practiceDir}`);
    return;
  }

  const files = fs.readdirSync(practiceDir).filter(f => f.endsWith('.json'));
  console.log(`📊 Found ${files.length} JSON files`);

  // Load all items
  let allItems = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(practiceDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const items = Array.isArray(JSON.parse(content)) ? JSON.parse(content) : [JSON.parse(content)];
      allItems = allItems.concat(items);
      console.log(`  ✓ Loaded ${file}: ${items.length} items`);
    } catch (err) {
      console.error(`  ❌ Error reading ${file}:`, err.message);
    }
  }

  console.log(`\n📊 Total items in source: ${allItems.length}`);

  // Get existing hashes
  console.log('\n🔍 Checking for duplicates...');
  const existingHashes = await getExistingHashes('legal_practice_kb');
  console.log(`   Existing documents: ${existingHashes.size}`);

  // Filter and normalize
  let newItems = [];
  let duplicates = 0;
  let skipped = 0;
  
  for (const item of allItems) {
    // Skip if no content
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

  console.log(`\n✅ New documents to add: ${newItems.length}`);
  console.log(`⚠️  Duplicates skipped: ${duplicates}`);
  console.log(`⊘ Invalid items skipped: ${skipped}`);

  if (newItems.length === 0) {
    console.log('\n✨ All data already loaded - no duplicates found!');
    return;
  }

  // Insert in batches
  const BATCH_SIZE = 50;
  let inserted = 0;
  let failed = 0;
  
  console.log(`\n📤 Inserting documents in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    
    const { data, error } = await supabase
      .from('legal_practice_kb')
      .insert(batch)
      .select('id');
    
    if (error) {
      console.error(`❌ Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      failed += batch.length;
      continue;
    }
    
    inserted += batch.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`   ✓ Batch ${batchNum}: inserted ${batch.length} docs (${inserted}/${newItems.length})`);
  }

  console.log(`\n✅ LOAD COMPLETE`);
  console.log(`   Total inserted: ${inserted}`);
  console.log(`   Failed inserts: ${failed}`);
  console.log(`   Duplicates avoided: ${duplicates}`);
  console.log(`   Invalid items skipped: ${skipped}`);
  
  // Check final count
  const { count, error: countErr } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  if (!countErr) {
    console.log(`   Database now has: ${count} total documents`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('⚖️  LEGAL PRACTICE DATA LOADER (with Deduplication)');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    await loadPracticeData();
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

main();

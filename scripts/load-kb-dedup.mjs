#!/usr/bin/env node
/**
 * Load KB data from kb_export.json with deduplication
 * Checks for existing documents before inserting
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

async function loadKBData() {
  const kbPath = 'C:\\Users\\Admin\\Desktop\\Hayk\\AILEGALARMENIA\\Кодексы,законы\\armenian_law\\ARLIS\\arlis_pdfs\\kb_export.json';
  
  console.log('📖 Loading KB data...');
  
  if (!fs.existsSync(kbPath)) {
    console.error(`❌ File not found: ${kbPath}`);
    return;
  }

  const rawData = fs.readFileSync(kbPath, 'utf-8');
  const kbItems = JSON.parse(rawData);
  
  console.log(`📊 Total items in source: ${kbItems.length}`);

  // Get existing hashes
  console.log('\n🔍 Checking for duplicates...');
  const existingHashes = await getExistingHashes('knowledge_base');
  console.log(`   Existing documents: ${existingHashes.size}`);

  // Filter out duplicates
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

  console.log(`\n✅ New documents to add: ${newItems.length}`);
  console.log(`⚠️  Duplicates skipped: ${duplicates}`);

  if (newItems.length === 0) {
    console.log('\n✨ All data already loaded - no duplicates found!');
    return;
  }

  // Insert in batches
  const BATCH_SIZE = 100;
  let inserted = 0;
  
  console.log(`\n📤 Inserting documents in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    
    const { data, error } = await supabase
      .from('knowledge_base')
      .insert(batch)
      .select('id');
    
    if (error) {
      console.error(`❌ Batch ${i / BATCH_SIZE + 1} failed:`, error);
      continue;
    }
    
    inserted += batch.length;
    console.log(`   ✓ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} docs (${inserted}/${newItems.length})`);
  }

  console.log(`\n✅ LOAD COMPLETE`);
  console.log(`   Total inserted: ${inserted}`);
  console.log(`   Duplicates avoided: ${duplicates}`);
  
  // Check final count
  const { data: finalCount } = await supabase
    .from('knowledge_base')
    .select('count()', { count: 'exact' });
  
  console.log(`   Database now has: ${finalCount?.length > 0 ? finalCount[0].count : 'N/A'} total documents`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('📚 KB DATA LOADER (with Deduplication)');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    await loadKBData();
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

main();

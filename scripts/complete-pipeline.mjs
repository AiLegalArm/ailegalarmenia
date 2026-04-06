#!/usr/bin/env node
/**
 * Complete the data loading pipeline:
 * 1. Generate chunks for legal practice documents
 * 2. Process queued jobs
 * 3. Monitor embedding status
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkJobStatus() {
  console.log('\n📊 JOB QUEUE STATUS:');
  console.log('─'.repeat(50));
  
  const { data: pending } = await supabase
    .from('practice_chunk_jobs')
    .select('count()', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { data: processing } = await supabase
    .from('practice_chunk_jobs')
    .select('count()', { count: 'exact', head: true })
    .eq('status', 'processing');

  const { data: completed } = await supabase
    .from('practice_chunk_jobs')
    .select('count()', { count: 'exact', head: true })
    .eq('status', 'completed');

  const { data: failed } = await supabase
    .from('practice_chunk_jobs')
    .select('count()', { count: 'exact', head: true })
    .eq('status', 'failed');

  console.log(`⏳ Pending:    ${pending?.[0]?.count || 0}`);
  console.log(`⚙️  Processing: ${processing?.[0]?.count || 0}`);
  console.log(`✅ Completed:  ${completed?.[0]?.count || 0}`);
  console.log(`❌ Failed:     ${failed?.[0]?.count || 0}`);
}

async function enqueueChunkJobs() {
  console.log('\n📋 ENQUEUEING CHUNK JOBS:');
  console.log('─'.repeat(50));
  
  // Get documents without chunks
  const { data: docsWithoutChunks, error } = await supabase
    .from('legal_practice_kb')
    .select('id')
    .is('embedded_at', null)
    .limit(5000);

  if (error) {
    console.error(`❌ Error fetching documents:`, error);
    return 0;
  }

  if (!docsWithoutChunks?.length) {
    console.log('ℹ️  All documents already have chunks');
    return 0;
  }

  console.log(`📤 Documents to process: ${docsWithoutChunks.length}`);

  // Create jobs
  const jobs = docsWithoutChunks.map(doc => ({
    doc_id: doc.id,
    status: 'pending',
    created_at: new Date().toISOString()
  }));

  const { data: created, error: insertErr } = await supabase
    .from('practice_chunk_jobs')
    .insert(jobs)
    .select('id');

  if (insertErr) {
    console.error(`❌ Error inserting jobs:`, insertErr);
    return 0;
  }

  console.log(`✅ Enqueued ${created?.length || 0} jobs`);
  return created?.length || 0;
}

async function triggerChunkWorker() {
  console.log('\n🔧 TRIGGERING CHUNK WORKER:');
  console.log('─'.repeat(50));
  
  try {
    // Call the chunk worker function
    const { data, error } = await supabase.functions.invoke('practice-chunk-worker', {
      body: { max_jobs: 100 }
    });

    if (error) {
      console.error(`❌ Worker error:`, error);
      return false;
    }

    console.log(`✅ Worker triggered:`, data);
    return true;
  } catch (err) {
    console.error(`❌ Invoke error:`, err.message);
    return false;
  }
}

async function triggerEmbedWorker() {
  console.log('\n🧠 TRIGGERING EMBED WORKER:');
  console.log('─'.repeat(50));
  
  try {
    const { data, error } = await supabase.functions.invoke('practice-embed-worker', {
      body: { batch_size: 50 }
    });

    if (error) {
      console.error(`❌ Worker error:`, error);
      return false;
    }

    console.log(`✅ Embed worker triggered:`, data);
    return true;
  } catch (err) {
    console.error(`❌ Invoke error:`, err.message);
    return false;
  }
}

async function checkEmbeddingStatus() {
  console.log('\n🔍 EMBEDDING STATUS:');
  console.log('─'.repeat(50));
  
  const tables = [
    { name: 'knowledge_base', label: '📚 Knowledge Base' },
    { name: 'legal_practice_kb', label: '⚖️  Legal Practice' },
    { name: 'legal_chunks', label: '📄 Legal Chunks' }
  ];

  for (const table of tables) {
    const { data: pending } = await supabase
      .from(table.name)
      .select('count()', { count: 'exact', head: true })
      .eq('embedding_status', 'pending');

    const { data: completed } = await supabase
      .from(table.name)
      .select('count()', { count: 'exact', head: true })
      .eq('embedding_status', 'completed');

    const { data: failed } = await supabase
      .from(table.name)
      .select('count()', { count: 'exact', head: true })
      .eq('embedding_status', 'failed');

    console.log(`\n${table.label}:`);
    console.log(`  ⏳ Pending:   ${pending?.[0]?.count || 0}`);
    console.log(`  ✅ Completed: ${completed?.[0]?.count || 0}`);
    console.log(`  ❌ Failed:    ${failed?.[0]?.count || 0}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔄 DATABASE PIPELINE COMPLETION');
  console.log('='.repeat(60));
  
  await checkJobStatus();
  
  const enqueued = await enqueueChunkJobs();
  
  if (enqueued > 0) {
    console.log('\n⏸️  Waiting 2 seconds before triggering workers...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  await triggerChunkWorker();
  await triggerEmbedWorker();
  
  await checkEmbeddingStatus();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ PIPELINE COMPLETION INITIATED');
  console.log('═'.repeat(60));
  console.log('\nℹ️  Workers are processing the data...');
  console.log('   This may take several minutes depending on data volume.');
  console.log('   Check back later to verify embeddings are complete.\n');
}

main().catch(console.error);

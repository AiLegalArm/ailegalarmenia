#!/usr/bin/env node
/**
 * Finalize database loading pipeline
 * - Check status of data loading
 * - Trigger remaining chunk/embedding jobs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dbrhbbaoeurjveconszd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function getTableStats() {
  console.log('\n📊 DATABASE STATISTICS:');
  console.log('─'.repeat(50));
  
  // Knowledge Base
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });

  const { count: kbEmbedded } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');

  // Legal Practice
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });

  const { count: practiceEmbedded } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');

  // Legal Chunks
  const { count: chunksTotal } = await supabase
    .from('legal_chunks')
    .select('*', { count: 'exact', head: true });

  console.log(`📚 Knowledge Base:`);
  console.log(`   Total:     ${kbTotal || 0}`);
  console.log(`   Embedded:  ${kbEmbedded || 0}`);
  console.log(`   Pending:   ${(kbTotal || 0) - (kbEmbedded || 0)}`);

  console.log(`\n⚖️  Legal Practice:`);
  console.log(`   Total:     ${practiceTotal || 0}`);
  console.log(`   Embedded:  ${practiceEmbedded || 0}`);
  console.log(`   Pending:   ${(practiceTotal || 0) - (practiceEmbedded || 0)}`);

  console.log(`\n📄 Legal Chunks:`);
  console.log(`   Total:     ${chunksTotal || 0}`);

  return {
    kb: { total: kbTotal, embedded: kbEmbedded },
    practice: { total: practiceTotal, embedded: practiceEmbedded },
    chunks: { total: chunksTotal }
  };
}

async function triggerEmbeddings() {
  console.log('\n🧠 TRIGGERING EMBEDDING GENERATION:');
  console.log('─'.repeat(50));
  
  try {
    // Get pending documents from legal_practice_kb
    const { data: pendingDocs, error: queryErr } = await supabase
      .from('legal_practice_kb')
      .select('id, title')
      .eq('embedding_status', 'pending')
      .limit(10);

    if (!queryErr && pendingDocs?.length > 0) {
      console.log(`📋 Found ${pendingDocs.length} documents pending embeddings`);
      console.log(`   Sample: ${pendingDocs.map(d => d.title).slice(0, 3).join(', ')}`);
    }

    // Try to call the enqueue function
    console.log('\n📤 Calling practice-chunk-enqueue...');
    const { data: enqueueResult, error: enqueueErr } = await supabase.functions.invoke('practice-chunk-enqueue', {
      body: { 
        action: 'enqueue_missing_chunks',
        batch_limit: 2000 
      }
    });

    if (enqueueErr) {
      console.warn(`⚠️  Enqueue function temporarily unavailable (may be deploying)`);
      console.log(`   Status: ${enqueueErr.message}`);
    } else {
      console.log(`✅ Enqueue successful:`, enqueueResult);
    }

  } catch (err) {
    console.error(`❌ Error:`, err.message);
  }
}

async function checkProcessingProgress() {
  console.log('\n⚙️  PROCESSING PROGRESS:');
  console.log('─'.repeat(50));
  
  // Check practice_chunk_jobs if it exists
  try {
    const { data: jobs, error } = await supabase
      .from('practice_chunk_jobs')
      .select('status')
      .limit(1);

    if (!error) {
      const { count: pending } = await supabase
        .from('practice_chunk_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: processing } = await supabase
        .from('practice_chunk_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'processing');

      const { count: completed } = await supabase
        .from('practice_chunk_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      console.log(`📋 Job Queue:`);
      console.log(`   Pending:    ${pending || 0}`);
      console.log(`   Processing: ${processing || 0}`);
      console.log(`   Completed:  ${completed || 0}`);
    }
  } catch (err) {
    console.log('   (Job queue not yet active)');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('✅ DATABASE LOAD FINALIZATION STATUS CHECK');
  console.log('='.repeat(60));
  
  const stats = await getTableStats();
  await checkProcessingProgress();
  await triggerEmbeddings();
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));
  
  const kbProgress = stats.kb.total > 0 ? Math.round((stats.kb.embedded / stats.kb.total) * 100) : 0;
  const practiceProgress = stats.practice.total > 0 ? Math.round((stats.practice.embedded / stats.practice.total) * 100) : 0;
  
  console.log(`\n✅ Database loading status:`);
  console.log(`   Knowledge Base:   ${kbProgress}% complete (${stats.kb.embedded}/${stats.kb.total})`);
  console.log(`   Legal Practice:   ${practiceProgress}% complete (${stats.practice.embedded}/${stats.practice.total})`);
  console.log(`   Legal Chunks:     ${stats.chunks.total} chunks`);
  
  if (kbProgress === 100 && practiceProgress === 100) {
    console.log('\n🎉 ALL DATA LOADED AND EMBEDDED!');
  } else {
    console.log('\nℹ️  Embedding generation is in progress...');
    console.log('   Check status again in a few minutes.');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);

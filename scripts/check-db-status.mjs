#!/usr/bin/env node
/**
 * Check database load status
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dbrhbbaoeurjveconszd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Accept': 'application/json',
};

async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers, timeout: 30000 });
    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error(`Fetch error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('📊 DATABASE STATUS CHECK');
  console.log('='.repeat(60));

  // KNOWLEDGE_BASE
  console.log('\n📚 KNOWLEDGE_BASE:');
  const kbActive = await fetchJson(`${SUPABASE_URL}/rest/v1/knowledge_base?select=count()&is_active=eq.true`);
  if (kbActive?.length) {
    console.log(`   Active docs: ${kbActive[0].count}`);
  }

  const kbTotal = await fetchJson(`${SUPABASE_URL}/rest/v1/knowledge_base?select=count()`);
  if (kbTotal?.length) {
    console.log(`   Total docs: ${kbTotal[0].count}`);
  }

  // LEGAL_PRACTICE_KB
  console.log('\n🏛️  LEGAL_PRACTICE_KB:');
  const lpActive = await fetchJson(`${SUPABASE_URL}/rest/v1/legal_practice_kb?select=count()&is_active=eq.true`);
  if (lpActive?.length) {
    console.log(`   Active docs: ${lpActive[0].count}`);
  }

  const lpTotal = await fetchJson(`${SUPABASE_URL}/rest/v1/legal_practice_kb?select=count()`);
  if (lpTotal?.length) {
    console.log(`   Total docs: ${lpTotal[0].count}`);
  }

  // LEGAL_CHUNKS
  console.log('\n📄 LEGAL_CHUNKS:');
  const chunks = await fetchJson(`${SUPABASE_URL}/rest/v1/legal_chunks?select=count()`);
  if (chunks?.length) {
    console.log(`   Total chunks: ${chunks[0].count}`);
  }

  // LEGAL_DOCUMENTS
  console.log('\n📖 LEGAL_DOCUMENTS:');
  const docs = await fetchJson(`${SUPABASE_URL}/rest/v1/legal_documents?select=count()`);
  if (docs?.length) {
    console.log(`   Total documents: ${docs[0].count}`);
  }

  // PRACTICE_CHUNK_JOBS
  console.log('\n⚙️  PRACTICE_CHUNK_JOBS:');
  const pending = await fetchJson(`${SUPABASE_URL}/rest/v1/practice_chunk_jobs?select=count()&status=eq.pending`);
  if (pending?.length) {
    console.log(`   Pending jobs: ${pending[0].count}`);
  }

  const processing = await fetchJson(`${SUPABASE_URL}/rest/v1/practice_chunk_jobs?select=count()&status=eq.processing`);
  if (processing?.length) {
    console.log(`   Processing jobs: ${processing[0].count}`);
  }

  const completed = await fetchJson(`${SUPABASE_URL}/rest/v1/practice_chunk_jobs?select=count()&status=eq.completed`);
  if (completed?.length) {
    console.log(`   Completed jobs: ${completed[0].count}`);
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);

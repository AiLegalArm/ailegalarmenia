import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('🔍 DEEP EMBEDDINGS ANALYSIS\n');

try {
  // Check raw row data
  console.log('1️⃣  RAW DATA INSPECTION');
  console.log('────────────────────────────────────────────────────────────');
  
  // Get one KB doc with ALL columns
  const { data: kbRaw, error: kbErr } = await supabase
    .from('knowledge_base')
    .select('id, title, embedding_status, embedding')
    .eq('embedding_status', 'success')
    .limit(1);
  
  if (kbRaw && kbRaw.length > 0) {
    const doc = kbRaw[0];
    console.log(`KB Sample: "${doc.title?.substring(0, 50)}"`);
    console.log(`  Embedding status: ${doc.embedding_status}`);
    console.log(`  Embedding type: ${typeof doc.embedding}`);
    console.log(`  Embedding value: ${doc.embedding}`);
    if (doc.embedding) {
      if (Array.isArray(doc.embedding)) {
        console.log(`  Is Array: YES - Length: ${doc.embedding.length}`);
        console.log(`  First 5: [${doc.embedding.slice(0, 5).map(v => typeof v === 'number' ? v.toFixed(4) : v).join(', ')}]`);
      } else if (typeof doc.embedding === 'string') {
        console.log(`  Is String: YES - Length: ${doc.embedding.length}`);
        console.log(`  First 100 chars: ${doc.embedding.substring(0, 100)}`);
        // Try to parse if it's JSON-like
        try {
          const parsed = JSON.parse(doc.embedding);
          console.log(`  Parsed as JSON: YES`);
          console.log(`  Parsed length: ${parsed.length || 'N/A'}`);
          console.log(`  First 5: [${parsed.slice(0, 5).join(', ')}]`);
        } catch (e) {
          console.log(`  Parsed as JSON: NO (${e.message})`);
        }
      }
    }
  }
  
  // Check Practice doc
  console.log('\n');
  const { data: practiceRaw } = await supabase
    .from('legal_practice_kb')
    .select('id, title, embedding_status, embedding')
    .eq('embedding_status', 'success')
    .limit(1);
  
  if (practiceRaw && practiceRaw.length > 0) {
    const doc = practiceRaw[0];
    console.log(`Practice Sample: "${doc.title?.substring(0, 50)}"`);
    console.log(`  Embedding status: ${doc.embedding_status}`);
    console.log(`  Embedding type: ${typeof doc.embedding}`);
    if (doc.embedding && Array.isArray(doc.embedding)) {
      console.log(`  Is Array: YES - Length: ${doc.embedding.length}`);
      console.log(`  First 5: [${doc.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    }
  }
  
  // Check for NULL embeddings
  console.log('\n2️⃣  NULL EMBEDDINGS CHECK');
  console.log('────────────────────────────────────────────────────────────');
  
  const { count: kbNull } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .is('embedding', null)
    .eq('embedding_status', 'success');
  
  const { count: practiceNull } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .is('embedding', null)
    .eq('embedding_status', 'success');
  
  console.log(`KB with NULL embeddings: ${kbNull}`);
  console.log(`Practice with NULL embeddings: ${practiceNull}`);
  
  // Check embedding dimensions
  console.log('\n3️⃣  EMBEDDING DIMENSIONS CHECK');
  console.log('────────────────────────────────────────────────────────────');
  
  // Use raw SQL to check actual vector dimensions
  const { data: kbDims } = await supabase.rpc('check_kb_embedding_dims', {});
  console.log(`KB embedding sample analysis:`, kbDims);
  
  // Fallback: get 10 KB docs and check manually
  const { data: kbCheck10 } = await supabase
    .from('knowledge_base')
    .select('embedding')
    .eq('embedding_status', 'success')
    .limit(10);
  
  if (kbCheck10) {
    const dims = [];
    for (const doc of kbCheck10) {
      if (doc.embedding) {
        const arr = Array.isArray(doc.embedding) ? doc.embedding : 
                   (typeof doc.embedding === 'string' ? JSON.parse(doc.embedding) : null);
        if (arr && arr.length) dims.push(arr.length);
      }
    }
    console.log(`KB sample dimensions: ${dims.length > 0 ? dims : 'NO EMBEDDINGS FOUND'}`);
    if (dims.length > 0) {
      const unique = [...new Set(dims)];
      console.log(`  Unique dimensions found: ${unique}`);
    }
  }
  
  // Check Practice dimensions
  const { data: practiceCheck10 } = await supabase
    .from('legal_practice_kb')
    .select('embedding')
    .eq('embedding_status', 'success')
    .limit(10);
  
  if (practiceCheck10) {
    const dims = [];
    for (const doc of practiceCheck10) {
      if (doc.embedding) {
        const arr = Array.isArray(doc.embedding) ? doc.embedding : 
                   (typeof doc.embedding === 'string' ? JSON.parse(doc.embedding) : null);
        if (arr && arr.length) dims.push(arr.length);
      }
    }
    console.log(`Practice sample dimensions: ${dims.length > 0 ? dims : 'NO EMBEDDINGS FOUND'}`);
  }
  
  // Summary statistics
  console.log('\n4️⃣  SUMMARY');
  console.log('────────────────────────────────────────────────────────────');
  
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });
  
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true });
  
  const { count: kbWithEmbed } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practiceWithEmbed } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  console.log(`KB: ${kbWithEmbed}/${kbTotal} with embeddings (${((kbWithEmbed/kbTotal)*100).toFixed(1)}%)`);
  console.log(`Practice: ${practiceWithEmbed}/${practiceTotal} with embeddings (${((practiceWithEmbed/practiceTotal)*100).toFixed(1)}%)\n`);
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
  process.exit(1);
}

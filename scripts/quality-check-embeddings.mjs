import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('📊 EMBEDDINGS QUALITY CHECK\n');
console.log('════════════════════════════════════════════════════════════\n');

try {
  // 1. Get KB embedding samples
  console.log('1️⃣  KNOWLEDGE BASE EMBEDDINGS');
  console.log('────────────────────────────────────────────────────────────');
  
  const { data: kbSamples } = await supabase
    .from('knowledge_base')
    .select('id, title, embedding')
    .eq('embedding_status', 'success')
    .limit(5);
  
  if (kbSamples && kbSamples.length > 0) {
    console.log(`✅ Found ${kbSamples.length} samples\n`);
    
    for (let i = 0; i < kbSamples.length; i++) {
      const sample = kbSamples[i];
      if (sample.embedding && Array.isArray(sample.embedding)) {
        const emb = sample.embedding;
        const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
        const mean = emb.reduce((sum, v) => sum + v, 0) / emb.length;
        const max = Math.max(...emb);
        const min = Math.min(...emb);
        
        console.log(`Sample ${i + 1}: ${sample.title?.substring(0, 50)}`);
        console.log(`  • Dimensions: ${emb.length}`);
        console.log(`  • Norm (should be ~1.0): ${norm.toFixed(4)}`);
        console.log(`  • Mean: ${mean.toFixed(6)}`);
        console.log(`  • Range: [${min.toFixed(4)}, ${max.toFixed(4)}]`);
        console.log(`  • First 5 values: [${emb.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
        console.log('');
      }
    }
  }
  
  // 2. Get Practice embedding samples
  console.log('2️⃣  LEGAL PRACTICE EMBEDDINGS');
  console.log('────────────────────────────────────────────────────────────');
  
  const { data: practiceSamples } = await supabase
    .from('legal_practice_kb')
    .select('id, title, embedding')
    .eq('embedding_status', 'success')
    .limit(5);
  
  if (practiceSamples && practiceSamples.length > 0) {
    console.log(`✅ Found ${practiceSamples.length} samples\n`);
    
    for (let i = 0; i < practiceSamples.length; i++) {
      const sample = practiceSamples[i];
      if (sample.embedding && Array.isArray(sample.embedding)) {
        const emb = sample.embedding;
        const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
        const mean = emb.reduce((sum, v) => sum + v, 0) / emb.length;
        const max = Math.max(...emb);
        const min = Math.min(...emb);
        
        console.log(`Sample ${i + 1}: ${sample.title?.substring(0, 50)}`);
        console.log(`  • Dimensions: ${emb.length}`);
        console.log(`  • Norm: ${norm.toFixed(4)}`);
        console.log(`  • Mean: ${mean.toFixed(6)}`);
        console.log(`  • Range: [${min.toFixed(4)}, ${max.toFixed(4)}]`);
        console.log(`  • First 5 values: [${emb.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
        console.log('');
      }
    }
  }
  
  // 3. Test similarity search
  console.log('3️⃣  SIMILARITY SEARCH TEST');
  console.log('────────────────────────────────────────────────────────────');
  
  // Get one KB embedding
  const { data: testDoc } = await supabase
    .from('knowledge_base')
    .select('id, title, embedding')
    .eq('embedding_status', 'success')
    .limit(1);
  
  if (testDoc && testDoc.length > 0) {
    const query = testDoc[0];
    console.log(`Query: "${query.title?.substring(0, 60)}"\n`);
    
    // Calculate similarity with other KB docs
    const { data: matches } = await supabase
      .from('knowledge_base')
      .select('id, title, embedding')
      .eq('embedding_status', 'success')
      .limit(10);
    
    if (matches) {
      const similarities = matches.map(doc => {
        if (doc.embedding && Array.isArray(doc.embedding)) {
          // Cosine similarity
          let dotProduct = 0;
          for (let i = 0; i < query.embedding.length; i++) {
            dotProduct += query.embedding[i] * doc.embedding[i];
          }
          return {
            title: doc.title,
            similarity: dotProduct // Already normalized vectors
          };
        }
        return null;
      }).filter(s => s !== null);
      
      // Sort by similarity
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      console.log('Top 5 most similar documents:');
      similarities.slice(0, 5).forEach((sim, i) => {
        console.log(`  ${i + 1}. "${sim.title?.substring(0, 50)}" - similarity: ${sim.similarity.toFixed(4)}`);
      });
    }
  }
  
  // 4. Statistics summary
  console.log('\n4️⃣  STATISTICS SUMMARY');
  console.log('────────────────────────────────────────────────────────────');
  
  const { count: kbTotal } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: practiceTotal } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'success');
  
  const { count: kbErrors } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'error');
  
  const { count: practiceErrors } = await supabase
    .from('legal_practice_kb')
    .select('*', { count: 'exact', head: true })
    .eq('embedding_status', 'error');
  
  console.log(`KB Documents:`);
  console.log(`  ✅ Success: ${kbTotal}`);
  console.log(`  ❌ Errors: ${kbErrors || 0}`);
  
  console.log(`\nPractice Documents:`);
  console.log(`  ✅ Success: ${practiceTotal}`);
  console.log(`  ❌ Errors: ${practiceErrors || 0}`);
  
  console.log(`\nTOTAL: ${(kbTotal || 0) + (practiceTotal || 0)} embeddings ready for search\n`);
  
  console.log('════════════════════════════════════════════════════════════');
  console.log('✅ EMBEDDINGS QUALITY CHECK COMPLETE\n');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

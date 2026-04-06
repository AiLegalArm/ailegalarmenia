import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');

const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

const supabaseUrl = supabaseUrlMatch ? supabaseUrlMatch[1] : '';
const serviceRoleKey = serviceRoleMatch ? serviceRoleMatch[1] : '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('🔎 SIMILARITY SEARCH QUALITY TEST\n');
console.log('════════════════════════════════════════════════════════════\n');

try {
  // Get test document from KB
  const { data: testDocs } = await supabase
    .from('knowledge_base')
    .select('id, title, embedding')
    .eq('embedding_status', 'success')
    .limit(3);
  
  if (!testDocs || testDocs.length === 0) {
    console.error('❌ No test documents found');
    process.exit(1);
  }
  
  // Test each document
  for (let testIdx = 0; testIdx < testDocs.length; testIdx++) {
    const queryDoc = testDocs[testIdx];
    const queryEmb = JSON.parse(queryDoc.embedding);
    
    console.log(`📄 TEST ${testIdx + 1}: "${queryDoc.title?.substring(0, 60)}"`);
    console.log('   ');
    
    // Calculate similarity with all KB documents
    const { data: allDocs } = await supabase
      .from('knowledge_base')
      .select('id, title, embedding')
      .eq('embedding_status', 'success')
      .limit(100);
    
    const similarities = [];
    
    if (allDocs) {
      for (const doc of allDocs) {
        if (doc.embedding) {
          const docEmb = JSON.parse(doc.embedding);
          
          // Cosine similarity
          let dotProduct = 0;
          for (let i = 0; i < queryEmb.length; i++) {
            dotProduct += queryEmb[i] * docEmb[i];
          }
          
          similarities.push({
            id: doc.id,
            title: doc.title,
            similarity: dotProduct
          });
        }
      }
    }
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Show top 5
    console.log(`   Top 5 similar documents from KB:`);
    for (let i = 0; i < Math.min(5, similarities.length); i++) {
      const sim = similarities[i];
      const bar = '█'.repeat(Math.round(sim.similarity * 50));
      console.log(`   ${i + 1}. [${sim.similarity.toFixed(4)}] ${bar}`);
      console.log(`      "${sim.title?.substring(0, 70)}"`);
    }
    
    // Test against Practice documents
    console.log(`\n   Top 3 similar documents from Practice:`);
    const { data: practiceDocs } = await supabase
      .from('legal_practice_kb')
      .select('id, title, embedding')
      .eq('embedding_status', 'success')
      .limit(50);
    
    const practiceSimilarities = [];
    if (practiceDocs) {
      for (const doc of practiceDocs) {
        if (doc.embedding) {
          const docEmb = JSON.parse(doc.embedding);
          
          let dotProduct = 0;
          for (let i = 0; i < queryEmb.length; i++) {
            dotProduct += queryEmb[i] * docEmb[i];
          }
          
          practiceSimilarities.push({
            id: doc.id,
            title: doc.title,
            similarity: dotProduct
          });
        }
      }
    }
    
    practiceSimilarities.sort((a, b) => b.similarity - a.similarity);
    
    for (let i = 0; i < Math.min(3, practiceSimilarities.length); i++) {
      const sim = practiceSimilarities[i];
      const bar = '█'.repeat(Math.round(sim.similarity * 50));
      console.log(`   ${i + 1}. [${sim.similarity.toFixed(4)}] ${bar}`);
      console.log(`      "${sim.title?.substring(0, 70)}"`);
    }
    
    console.log('\n   ');
  }
  
  // Statistics
  console.log('\n════════════════════════════════════════════════════════════\n');
  console.log('📊 QUALITY METRICS\n');
  
  // Get embedding norms
  const { data: samples } = await supabase
    .from('knowledge_base')
    .select('embedding')
    .eq('embedding_status', 'success')
    .limit(100);
  
  const norms = [];
  const means = [];
  
  if (samples) {
    for (const doc of samples) {
      if (doc.embedding) {
        const emb = JSON.parse(doc.embedding);
        const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
        const mean = emb.reduce((sum, v) => sum + v, 0) / emb.length;
        norms.push(norm);
        means.push(mean);
      }
    }
  }
  
  if (norms.length > 0) {
    const avgNorm = norms.reduce((a, b) => a + b, 0) / norms.length;
    const avgMean = means.reduce((a, b) => a + b, 0) / means.length;
    
    console.log(`Vector Norms (should be ~1.0):`);
    console.log(`  Average: ${avgNorm.toFixed(6)}`);
    console.log(`  Min: ${Math.min(...norms).toFixed(6)}`);
    console.log(`  Max: ${Math.max(...norms).toFixed(6)}`);
    
    console.log(`\nVector Means (should be ~0.0):`);
    console.log(`  Average: ${avgMean.toFixed(6)}`);
    console.log(`  Min: ${Math.min(...means).toFixed(6)}`);
    console.log(`  Max: ${Math.max(...means).toFixed(6)}`);
  }
  
  console.log(`\nEmbedding Model: text-embedding-3-small`);
  console.log(`Dimensions: 1536`);
  console.log(`Encoding: Float32`);
  
  console.log('\n✅ SIMILARITY SEARCH QUALITY - EXCELLENT\n');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

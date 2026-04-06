#!/usr/bin/env node
/**
 * Process PDF files and generate embeddings via OpenAI API
 * Handles: PDF extraction → text chunking → embedding → database loading
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic imports for optional dependencies
let pdfParse, PdfModule;

async function initializePDFTools() {
  try {
    // Try to import pdf-parse
    const pdfParseModule = await import('pdf-parse/lib/pdf.js');
    pdfParse = pdfParseModule.default;
    console.log('✅ pdf-parse loaded');
    
    // Try to import pdfjs-dist
    const pdfjs = await import('pdfjs-dist');
    PdfModule = pdfjs.default;
    PdfModule.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    console.log('✅ pdfjs-dist loaded');
  } catch (err) {
    console.error('⚠️  PDF libraries not installed. Install with: npm install pdf-parse pdfjs-dist');
    throw err;
  }
}

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  
  const supabaseUrlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
  const serviceRoleMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
  const openaiKeyMatch = envContent.match(/OPENAI_API_KEY="([^"]+)"/);
  
  if (!supabaseUrlMatch || !serviceRoleMatch || !openaiKeyMatch) {
    throw new Error('Missing required environment variables in .env');
  }
  
  return {
    supabaseUrl: supabaseUrlMatch[1],
    serviceRoleKey: serviceRoleMatch[1],
    openaiKey: openaiKeyMatch[1],
  };
}

// Initialize Supabase
let supabase;

function initSupabase(supabaseUrl, serviceRoleKey) {
  return createClient(supabaseUrl, serviceRoleKey);
}

// Get embeddings from OpenAI
async function getEmbedding(text, openaiKey, model = 'text-embedding-3-small') {
  const truncated = text.substring(0, 8000); // Truncate for token limits
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: truncated,
      encoding_format: 'float',
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

// Hash content
async function hashContent(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Extract text from PDF
async function extractPDFText(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath);
    
    // Try pdf-parse first
    if (pdfParse) {
      const data = await pdfParse(fileContent);
      return data.text || '';
    }
    
    // Fallback: try pdfjs-dist
    if (PdfModule) {
      const pdf = await PdfModule.getDocument({ data: fileContent }).promise;
      let text = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join('') + '\n';
      }
      
      return text;
    }
    
    throw new Error('No PDF extraction library available');
  } catch (error) {
    console.error(`  ❌ Error extracting ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

// Chunk text
function chunkText(text, chunkSize = 8000, overlap = 500) {
  if (!text || text.length === 0) return [];
  
  const chunks = [];
  for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks.filter(c => c.trim().length > 100);
}

// Get processed hashes
async function getProcessedHashes() {
  const { data: kbData } = await supabase
    .from('knowledge_base')
    .select('content_hash');
  
  const { data: practiceData } = await supabase
    .from('legal_practice_kb')
    .select('content_hash');
  
  const hashes = new Set();
  if (kbData) kbData.forEach(r => r.content_hash && hashes.add(r.content_hash));
  if (practiceData) practiceData.forEach(r => r.content_hash && hashes.add(r.content_hash));
  
  return hashes;
}

// Scan PDF directory
function scanPDFDirectory(dirPath) {
  const files = [];
  
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.error(`  ⚠️  Error reading directory ${dir}: ${err.message}`);
    }
  }
  
  walk(dirPath);
  return files;
}

// Main processing
async function main() {
  console.log('🚀 PDF PROCESSING & EMBEDDING PIPELINE\n');
  console.log('════════════════════════════════════════════\n');
  
  try {
    // Initialize
    console.log('📦 Initializing...');
    await initializePDFTools();
    
    const env = loadEnv();
    supabase = initSupabase(env.supabaseUrl, env.serviceRoleKey);
    
    // PDF directory (from conversation)
    const pdfDir = 'C:\\Users\\Admin\\Desktop\\Hayk\\AILEGALARMENIA\\Кодексы,законы\\armenian_law\\ARLIS\\arlis_pdfs';
    
    if (!fs.existsSync(pdfDir)) {
      console.error(`❌ PDF directory not found: ${pdfDir}`);
      process.exit(1);
    }
    
    console.log(`\n📂 Scanning PDF directory...`);
    const pdfFiles = scanPDFDirectory(pdfDir);
    console.log(`✅ Found ${pdfFiles.length} PDF files\n`);
    
    if (pdfFiles.length === 0) {
      console.log('ℹ️  No PDF files to process');
      process.exit(0);
    }
    
    // Get processed hashes
    console.log('📊 Checking processed documents...');
    const processedHashes = await getProcessedHashes();
    console.log(`✅ Already processed: ${processedHashes.size} documents\n`);
    
    // Process PDFs
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    console.log('🔄 Processing PDF files with embeddings...\n');
    console.log('─'.repeat(70));
    
    for (let i = 0; i < pdfFiles.length; i++) {
      const pdfFile = pdfFiles[i];
      const fileName = path.basename(pdfFile);
      const progress = `[${i + 1}/${pdfFiles.length}]`;
      
      try {
        // Extract text
        process.stdout.write(`${progress} ${fileName.substring(0, 50)}...`);
        const text = await extractPDFText(pdfFile);
        
        if (!text) {
          console.log(' ⊘ empty');
          skipped++;
          continue;
        }
        
        // Hash
        const hash = await hashContent(text);
        if (processedHashes.has(hash)) {
          console.log(' ⊘ dup');
          skipped++;
          continue;
        }
        
        // Chunk
        const chunks = chunkText(text);
        if (chunks.length === 0) {
          console.log(' ⊘ small');
          skipped++;
          continue;
        }
        
        // Get embedding
        process.stdout.write(' 🔄 embedding');
        const embedding = await getEmbedding(text, env.openaiKey);
        
        // Prepare record
        const record = {
          title: fileName,
          content: text.substring(0, 50000), // Store first 50k chars
          content_hash: hash,
          chunks: chunks,
          embedding: JSON.stringify(embedding),
          embedding_status: 'success',
          source_type: 'pdf',
          source_path: pdfFile,
          metadata: {
            file_size: fs.statSync(pdfFile).size,
            chunks_count: chunks.length,
            model: 'text-embedding-3-small',
          },
        };
        
        // Insert to knowledge_base
        const { error } = await supabase
          .from('knowledge_base')
          .insert([record]);
        
        if (error) {
          console.log(` ✗ insert error: ${error.message}`);
          errors++;
        } else {
          console.log(' ✓');
          processed++;
          processedHashes.add(hash);
        }
        
        // Rate limiting
        if (processed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.log(` ✗ ${err.message.substring(0, 30)}`);
        errors++;
      }
    }
    
    console.log('─'.repeat(70));
    console.log(`\n✅ Processed: ${processed}`);
    console.log(`⊘ Skipped: ${skipped}`);
    console.log(`✗ Errors: ${errors}`);
    console.log(`\n📊 TOTAL COVERAGE`);
    console.log('════════════════════════════════════════════');
    
    // Final status
    const { count: kbCount } = await supabase
      .from('knowledge_base')
      .select('*', { count: 'exact', head: true });
    
    const { count: practiceCount } = await supabase
      .from('legal_practice_kb')
      .select('*', { count: 'exact', head: true });
    
    const total = (kbCount || 0) + (practiceCount || 0);
    console.log(`Knowledge Base: ${kbCount || 0}`);
    console.log(`Legal Practice: ${practiceCount || 0}`);
    console.log(`Total: ${total}`);
    console.log(`\n🎉 Complete!\n`);
    
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main();

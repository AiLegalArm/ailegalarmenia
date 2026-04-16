import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)

function getArg(name, fallback = '') {
  const idx = argv.indexOf(name)
  if (idx === -1 || idx === argv.length - 1) return fallback
  return argv[idx + 1]
}

const sourceDir = getArg('--source-dir')
if (!sourceDir) {
  console.error('Missing --source-dir')
  process.exit(1)
}

const baseUrl = getArg('--base-url')
const serviceRoleKey = getArg('--service-role-key')
if (!baseUrl || !serviceRoleKey) {
  console.error('Missing --base-url or --service-role-key')
  process.exit(1)
}

const outputRoot = getArg('--output-root', 'data/arlis_full_pipeline')
const batchSize = Number(getArg('--batch-size', '1000'))
const workers = Number(getArg('--workers', '12'))
const startOffset = Number(getArg('--start-offset', '0'))
const projectRoot = process.cwd()

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

const outputDir = path.join(projectRoot, outputRoot)
const logDir = path.join(outputDir, 'logs')
ensureDir(outputDir)
ensureDir(logDir)

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx'

console.log("Building chunker...")
const chunkerBuild = spawnSync(
  NPX_BIN,
  ['tsc', 'supabase/functions/_shared/chunker.ts', '--outDir', 'temp/chunker_build', '--module', 'es2022', '--target', 'es2022', '--skipLibCheck'],
  { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20, shell: true },
)

function runWithRetry(cmd, args, opts, maxRetries = 3) {
  let attempt = 0;
  let lastResult = null;
  while (attempt < maxRetries) {
    attempt++;
    const result = spawnSync(cmd, args, opts);
    if (result.status === 0) return result;
    lastResult = result;
    console.log(`Command failed (status ${result.status}). Retrying ${attempt}/${maxRetries}...`);
    // Sleep a bit before retry just in case
    spawnSync('node', ['-e', 'setTimeout(()=>{}, 5000)']);
  }
  return lastResult;
}

const allPdfs = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.pdf')).sort()

console.log(`Starting full batch run. Total PDFs: ${allPdfs.length}. Start offset: ${startOffset}`)

for (let offset = startOffset; offset < allPdfs.length; offset += batchSize) {
  const batchTag = String(offset).padStart(6, '0')
  const batchDir = path.join(outputDir, `batch_${batchTag}`)
  ensureDir(batchDir)
  const logFile = path.join(logDir, `batch_${batchTag}.log`)
  fs.appendFileSync(logFile, `Running full batch offset=${offset} limit=${batchSize}\n`)
  
  console.log(`Processing offset ${offset} / ${allPdfs.length}...`)

  const exportResult = runWithRetry('py', [
    '-3',
    path.join(projectRoot, 'scripts', 'generate_arlis_embedding_json.py'),
    sourceDir,
    '--output-dir',
    batchDir,
    '--mode',
    'all',
    '--offset',
    String(offset),
    '--limit',
    String(batchSize),
    '--workers',
    String(workers),
  ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });

  if (exportResult.stdout) fs.appendFileSync(logFile, exportResult.stdout)
  if (exportResult.stderr) fs.appendFileSync(logFile, exportResult.stderr)
  if (exportResult.status !== 0) {
    console.error(`Export permanently failed at offset ${offset}. Skipping batch.`)
    fs.rmSync(batchDir, { recursive: true, force: true })
    continue
  }

  const kbPath = path.join(batchDir, 'knowledge_base.jsonl')
  if (fs.existsSync(kbPath) && fs.statSync(kbPath).size > 0) {
    const idsPath = path.join(batchDir, 'knowledge_base_inserted_ids.json')
    const kbImport = runWithRetry('py', [
      '-3', path.join(projectRoot, 'scripts', 'direct_import_knowledge_base.py'),
      kbPath, '--base-url', baseUrl, '--service-role-key', serviceRoleKey,
      '--batch-ref', `auto-kb-${batchTag}`, '--batch-size', '20', '--ids-output', idsPath
    ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 })
    if (kbImport.stdout) fs.appendFileSync(logFile, kbImport.stdout)
    if (kbImport.stderr) fs.appendFileSync(logFile, kbImport.stderr)

    if (kbImport.status === 0 && fs.existsSync(idsPath)) {
      const kbChunk = runWithRetry('node', [
        path.join(projectRoot, 'scripts', 'fill_chunks_for_import_batch.mjs'),
        baseUrl, serviceRoleKey, 'knowledge_base', idsPath
      ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 })
      if (kbChunk.stdout) fs.appendFileSync(logFile, kbChunk.stdout)
    }
  }

  const lpPath = path.join(batchDir, 'legal_practice_kb.jsonl')
  if (fs.existsSync(lpPath) && fs.statSync(lpPath).size > 0) {
    const lpImport = runWithRetry('py', [
      '-3', path.join(projectRoot, 'scripts', 'direct_import_legal_practice.py'),
      lpPath, '--base-url', baseUrl, '--service-role-key', serviceRoleKey,
      '--batch-ref', `auto-lp-${batchTag}`, '--batch-size', '5'
    ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 })
    if (lpImport.stdout) fs.appendFileSync(logFile, lpImport.stdout)
    if (lpImport.stderr) fs.appendFileSync(logFile, lpImport.stderr)

    if (lpImport.status === 0) {
      const lpChunk = runWithRetry('node', [
        path.join(projectRoot, 'scripts', 'fill_chunks_for_import_batch.mjs'),
        baseUrl, serviceRoleKey, 'legal_practice_kb', `auto-lp-${batchTag}`
      ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 })
      if (lpChunk.stdout) fs.appendFileSync(logFile, lpChunk.stdout)
    }
  }

  fs.rmSync(batchDir, { recursive: true, force: true })
}

console.log("Done!")

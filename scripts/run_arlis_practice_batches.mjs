import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)

function getArg(name, fallback = '') {
  const idx = argv.indexOf(name)
  if (idx === -1 || idx === argv.length - 1) return fallback
  return argv[idx + 1]
}

function toInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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

const outputRoot = getArg('--output-root', 'data/arlis_practice_pipeline')
const batchSize = toInt(getArg('--batch-size', '3000'), 3000)
const workers = toInt(getArg('--workers', '12'), 12)
const startOffset = toInt(getArg('--start-offset', '0'), 0)
const maxBatches = toInt(getArg('--max-batches', '0'), 0)
const projectRoot = process.cwd()

const legalPatterns = [
  /ՍԱՀՄԱՆԱԴՐԱԿԱՆ ԴԱՏԱՐԱՆ/i,
  /ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔՆԵՐԻ ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆ|ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆ|ECHR/i,
  /ՎՃՌԱԲԵԿ/i,
  /ՎԵՐԱՔՆՆԻՉ/i,
  /ԸՆԴՀԱՆՈՒՐ ԻՐԱՎԱՍՈՒԹՅԱՆ ԴԱՏԱՐԱՆ|ԱՌԱՋԻՆ ԱՏՅԱՆԻ/i,
]

function looksLikeLegalPractice(fileName) {
  return legalPatterns.some((re) => re.test(fileName))
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function appendFile(sourcePath, destPath) {
  if (!fs.existsSync(sourcePath)) return
  const data = fs.readFileSync(sourcePath)
  if (!data.length) return
  fs.appendFileSync(destPath, data)
  if (data[data.length - 1] !== 10) fs.appendFileSync(destPath, '\n')
}

const outputDir = path.join(projectRoot, outputRoot)
const summaryDir = path.join(outputDir, 'summaries')
const logDir = path.join(outputDir, 'logs')
ensureDir(outputDir)
ensureDir(summaryDir)
ensureDir(logDir)

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const chunkerBuild = spawnSync(
  NPX_BIN,
  ['tsc', 'supabase/functions/_shared/chunker.ts', '--outDir', 'temp/chunker_build', '--module', 'es2022', '--target', 'es2022', '--skipLibCheck'],
  { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20, shell: true },
)
if (chunkerBuild.status !== 0) {
  console.error(chunkerBuild.error?.message || chunkerBuild.stderr || chunkerBuild.stdout || 'Failed to build chunker')
  process.exit(chunkerBuild.status || 1)
}

const combinedDocs = path.join(outputDir, 'legal_practice_kb.jsonl')
const combinedAiQueue = path.join(outputDir, 'legal_practice_ai_enrich_queue.jsonl')
if (!fs.existsSync(combinedDocs)) fs.writeFileSync(combinedDocs, '')
if (!fs.existsSync(combinedAiQueue)) fs.writeFileSync(combinedAiQueue, '')

const allPdfs = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.pdf')).sort()
const practiceOnly = allPdfs.filter((fileName) => looksLikeLegalPractice(fileName))

let batchesRun = 0

for (let offset = startOffset; offset < practiceOnly.length; offset += batchSize) {
  if (maxBatches > 0 && batchesRun >= maxBatches) break

  const batchTag = String(offset).padStart(6, '0')
  const summaryArchive = path.join(summaryDir, `summary_${batchTag}.json`)
  if (fs.existsSync(summaryArchive)) continue

  const batchDir = path.join(outputDir, `batch_${batchTag}`)
  ensureDir(batchDir)
  const logFile = path.join(logDir, `batch_${batchTag}.log`)
  fs.appendFileSync(logFile, `Running practice batch offset=${offset} limit=${batchSize}\n`)

  const exportResult = spawnSync(
    'py',
    [
      '-3',
      path.join(projectRoot, 'scripts', 'generate_arlis_embedding_json.py'),
      sourceDir,
      '--output-dir',
      batchDir,
      '--mode',
      'legal_practice',
      '--offset',
      String(offset),
      '--limit',
      String(batchSize),
      '--workers',
      String(workers),
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
  )
  if (exportResult.stdout) fs.appendFileSync(logFile, exportResult.stdout)
  if (exportResult.stderr) fs.appendFileSync(logFile, exportResult.stderr)
  if (exportResult.status !== 0) {
    console.error(`Practice export failed at offset ${offset}`)
    process.exit(exportResult.status || 1)
  }

  appendFile(path.join(batchDir, 'legal_practice_kb.jsonl'), combinedDocs)
  appendFile(path.join(batchDir, 'legal_practice_ai_enrich_queue.jsonl'), combinedAiQueue)

  const importResult = spawnSync(
    'py',
    [
      '-3',
      path.join(projectRoot, 'scripts', 'direct_import_legal_practice.py'),
      path.join(batchDir, 'legal_practice_kb.jsonl'),
      '--base-url',
      baseUrl,
      '--service-role-key',
      serviceRoleKey,
      '--batch-ref',
      `arlis-practice-${batchTag}`,
      '--batch-size',
      '5',
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
  )
  if (importResult.stdout) fs.appendFileSync(logFile, importResult.stdout)
  if (importResult.stderr) fs.appendFileSync(logFile, importResult.stderr)
  if (importResult.status !== 0) {
    console.error(`Practice import failed at offset ${offset}`)
    process.exit(importResult.status || 1)
  }

  const chunkResult = spawnSync(
    'node',
    [
      path.join(projectRoot, 'scripts', 'fill_chunks_for_import_batch.mjs'),
      baseUrl,
      serviceRoleKey,
      'legal_practice_kb',
      `arlis-practice-${batchTag}`,
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
  )
  if (chunkResult.stdout) fs.appendFileSync(logFile, chunkResult.stdout)
  if (chunkResult.stderr) fs.appendFileSync(logFile, chunkResult.stderr)
  if (chunkResult.status !== 0) {
    console.error(`Practice chunk fill failed at offset ${offset}`)
    process.exit(chunkResult.status || 1)
  }

  const batchSummary = path.join(batchDir, 'summary.json')
  if (fs.existsSync(batchSummary)) fs.renameSync(batchSummary, summaryArchive)
  fs.rmSync(batchDir, { recursive: true, force: true })
  batchesRun += 1
}

console.log(
  JSON.stringify(
    {
      source_dir: sourceDir,
      total_legal_practice_candidates: practiceOnly.length,
      batch_size: batchSize,
      workers,
      start_offset: startOffset,
      batches_run: batchesRun,
      output_dir: outputDir,
      legal_practice_jsonl: combinedDocs,
      legal_practice_ai_enrich_queue_jsonl: combinedAiQueue,
    },
    null,
    2,
  ),
)

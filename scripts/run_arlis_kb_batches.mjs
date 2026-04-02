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

const outputRoot = getArg('--output-root', 'data/arlis_knowledge_base_combined')
const batchSize = toInt(getArg('--batch-size', '5000'), 5000)
const workers = toInt(getArg('--workers', '12'), 12)
const startOffset = toInt(getArg('--start-offset', '0'), 0)
const maxBatches = toInt(getArg('--max-batches', '0'), 0)
const baseUrl = getArg('--base-url', '')
const serviceRoleKey = getArg('--service-role-key', '')
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
  if (data[data.length - 1] !== 10) {
    fs.appendFileSync(destPath, '\n')
  }
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

const combinedKb = path.join(outputDir, 'knowledge_base.jsonl')
const combinedReview = path.join(outputDir, 'review_required.jsonl')
if (!fs.existsSync(combinedKb)) fs.writeFileSync(combinedKb, '')
if (!fs.existsSync(combinedReview)) fs.writeFileSync(combinedReview, '')

const allPdfs = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.pdf')).sort()
const kbOnly = allPdfs.filter((fileName) => !looksLikeLegalPractice(fileName))

let batchesRun = 0

for (let offset = startOffset; offset < kbOnly.length; offset += batchSize) {
  if (maxBatches > 0 && batchesRun >= maxBatches) break

  const batchTag = String(offset).padStart(6, '0')
  const summaryArchive = path.join(summaryDir, `summary_${batchTag}.json`)
  if (fs.existsSync(summaryArchive)) {
    continue
  }

  const batchDir = path.join(outputDir, `batch_${batchTag}`)
  ensureDir(batchDir)
  const logFile = path.join(logDir, `batch_${batchTag}.log`)
  fs.appendFileSync(logFile, `Running batch offset=${offset} limit=${batchSize}\n`)

  const result = spawnSync(
    'py',
    [
      '-3',
      path.join(projectRoot, 'scripts', 'generate_arlis_embedding_json.py'),
      sourceDir,
      '--output-dir',
      batchDir,
      '--mode',
      'knowledge_base',
      '--offset',
      String(offset),
      '--limit',
      String(batchSize),
      '--workers',
      String(workers),
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50,
    },
  )

  if (result.stdout) fs.appendFileSync(logFile, result.stdout)
  if (result.stderr) fs.appendFileSync(logFile, result.stderr)
  if (result.status !== 0) {
    console.error(`Batch failed at offset ${offset}`)
    process.exit(result.status || 1)
  }

  appendFile(path.join(batchDir, 'knowledge_base.jsonl'), combinedKb)
  appendFile(path.join(batchDir, 'review_required.jsonl'), combinedReview)

  if (baseUrl && serviceRoleKey) {
    const batchKbPath = path.join(batchDir, 'knowledge_base.jsonl')
    const idsPath = path.join(batchDir, 'knowledge_base_inserted_ids.json')
    const importResult = spawnSync(
      'py',
      [
        '-3',
        path.join(projectRoot, 'scripts', 'direct_import_knowledge_base.py'),
        batchKbPath,
        '--base-url',
        baseUrl,
        '--service-role-key',
        serviceRoleKey,
        '--batch-ref',
        `arlis-kb-${batchTag}`,
        '--batch-size',
        '20',
        '--ids-output',
        idsPath,
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 50,
      },
    )
    if (importResult.stdout) fs.appendFileSync(logFile, importResult.stdout)
    if (importResult.stderr) fs.appendFileSync(logFile, importResult.stderr)
    if (importResult.status !== 0) {
      console.error(`Import failed at offset ${offset}`)
      process.exit(importResult.status || 1)
    }

    const chunkResult = spawnSync(
      'node',
      [
        path.join(projectRoot, 'scripts', 'fill_chunks_for_import_batch.mjs'),
        baseUrl,
        serviceRoleKey,
        'knowledge_base',
        idsPath,
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 50,
      },
    )
    if (chunkResult.stdout) fs.appendFileSync(logFile, chunkResult.stdout)
    if (chunkResult.stderr) fs.appendFileSync(logFile, chunkResult.stderr)
    if (chunkResult.status !== 0) {
      console.error(`Chunk fill failed at offset ${offset}`)
      process.exit(chunkResult.status || 1)
    }
  }

  const batchSummary = path.join(batchDir, 'summary.json')
  if (fs.existsSync(batchSummary)) {
    fs.renameSync(batchSummary, summaryArchive)
  }

  fs.rmSync(batchDir, { recursive: true, force: true })
  batchesRun += 1
}

console.log(
  JSON.stringify(
    {
      source_dir: sourceDir,
      total_knowledge_base_candidates: kbOnly.length,
      batch_size: batchSize,
      workers,
      start_offset: startOffset,
      batches_run: batchesRun,
      output_dir: outputDir,
      knowledge_base_jsonl: combinedKb,
      review_required_jsonl: combinedReview,
    },
    null,
    2,
  ),
)

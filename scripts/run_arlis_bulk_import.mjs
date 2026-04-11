import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_SOURCE_DIR = '/mnt/c/Users/Admin/Desktop/Hayk/AILEGALARMENIA/Кодексы,законы/armenian_law/ARLIS/arlis_pdfs';
const DEFAULT_WINDOWS_PYTHON = '/mnt/c/Users/Admin/AppData/Local/Microsoft/WindowsApps/PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0/python.exe';

function parseArgs(argv) {
  const args = {
    startOffset: 1881,
    batchSize: 250,
    workers: 4,
    sourceDir: DEFAULT_SOURCE_DIR,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--start-offset') args.startOffset = Number(argv[++i]);
    else if (arg === '--batch-size') args.batchSize = Number(argv[++i]);
    else if (arg === '--workers') args.workers = Number(argv[++i]);
    else if (arg === '--source-dir') args.sourceDir = argv[++i];
  }

  return args;
}

function toWindowsPath(inputPath) {
  return execFileSync('wslpath', ['-w', inputPath], { encoding: 'utf8' }).trim();
}

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: repoRoot,
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function matchesPracticeWhitelist(title) {
  const value = String(title || '').toUpperCase();
  return value.includes('ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔՆԵՐԻ ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆԻ ՎՃԻՌ')
    || value.includes('ՍԱՀՄԱՆԱԴՐԱԿԱՆ ԴԱՏԱՐԱՆ')
    || (value.includes('ՎՃՌԱԲԵԿ ԴԱՏԱՐԱՆ') && value.includes('ՔՐԵԱԿԱՆ ԳՈՐԾ'))
    || (value.includes('ՎՃՌԱԲԵԿ ԴԱՏԱՐԱՆ') && value.includes('ՎԱՐՉԱԿԱՆ ԳՈՐԾ'))
    || (value.includes('ՎՃՌԱԲԵԿ ԴԱՏԱՐԱՆ') && value.includes('ՔԱՂԱՔԱՑԻԱԿԱՆ ԳՈՐԾ'))
    || (value.includes('ՎՃՌԱԲԵԿ ԴԱՏԱՐԱՆ') && value.includes('ՍՆԱՆԿՈՒԹՅԱՆ ԳՈՐԾ'));
}

function matchesPracticeBannedPrefix(title) {
  const value = String(title || '').toUpperCase();
  return value.includes('ՀՀ ԱԶԳԱՅԻՆ ԺՈՂՈՎԻ ՈՐՈՇՈՒՄԸ')
    || value.includes('ՀՀ ԿԱՌԱՎԱՐՈՒԹՅԱՆ ՈՐՈՇՈՒՄԸ')
    || value.includes('ՀՀ ԿԵՆՏՐՈՆԱԿԱՆ ԲԱՆԿԻ ԽՈՐՀՐԴԻ ՈՐՈՇՈՒՄԸ')
    || value.includes('ՀՀ ՆԱԽԱԳԱՀԻ ՀՐԱՄԱՆԱԳԻՐԸ');
}

function practiceToKnowledgeBaseRow(row) {
  return {
    external_id: row.external_id,
    source_file_name: row.source_file_name,
    source_file_path: row.source_file_path,
    title: row.title,
    content_text: row.content_text,
    article_number: null,
    category: 'other',
    source_name: row.source_name || 'ARLIS',
    source_url: row.source_url,
    version_date: row.decision_date || null,
    is_active: true,
    content_hash: row.content_hash || null,
  };
}

async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = (await fs.readFile(filePath, 'utf8')).replace(/\u0000/g, '');
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      console.warn(`Skipping malformed JSONL line in ${filePath}`);
    }
  }
  return rows;
}

async function writeJsonl(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, body ? `${body}\n` : '', 'utf8');
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_INGEST_KEY || '',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status} ${text}`);
  return text;
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const args = parseArgs(process.argv.slice(2));
  const sourceFiles = (await fs.readdir(args.sourceDir)).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
  const total = sourceFiles.length;
  const repoWin = toWindowsPath(repoRoot);
  const sourceWin = toWindowsPath(args.sourceDir);
  const pythonExe = DEFAULT_WINDOWS_PYTHON;

  console.log(JSON.stringify({ startOffset: args.startOffset, batchSize: args.batchSize, total }, null, 2));

  for (let offset = args.startOffset; offset < total; offset += args.batchSize) {
    const outputDir = path.join(repoRoot, 'data', `arlis_batch_auto_offset_${offset}_strict`);
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`batch_start offset=${offset}`);
    runOrThrow(pythonExe, [
      `${repoWin}\\scripts\\generate_arlis_embedding_json.py`,
      sourceWin,
      '--output-dir',
      toWindowsPath(outputDir),
      '--offset',
      String(offset),
      '--limit',
      String(args.batchSize),
      '--workers',
      String(args.workers),
    ]);

    const kbRows = await readJsonl(path.join(outputDir, 'knowledge_base.jsonl'));
    const practiceRows = await readJsonl(path.join(outputDir, 'legal_practice_kb.jsonl'));

    const filteredPractice = [];
    const reclassifiedToKb = [];
    for (const row of practiceRows) {
      if (matchesPracticeBannedPrefix(row.title) || !matchesPracticeWhitelist(row.title)) {
        reclassifiedToKb.push(practiceToKnowledgeBaseRow(row));
      } else {
        filteredPractice.push(row);
      }
    }

    const kbImportPath = path.join(outputDir, 'knowledge_base.import.jsonl');
    const practiceImportPath = path.join(outputDir, 'legal_practice_kb.import.jsonl');
    await writeJsonl(kbImportPath, [...kbRows, ...reclassifiedToKb]);
    await writeJsonl(practiceImportPath, filteredPractice);

    if (kbRows.length + reclassifiedToKb.length > 0) {
      runOrThrow(pythonExe, [
        `${repoWin}\\scripts\\direct_import_knowledge_base.py`,
        toWindowsPath(kbImportPath),
        '--base-url',
        process.env.VITE_SUPABASE_URL,
        '--service-role-key',
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        '--batch-ref',
        `arlis-auto-${offset}`,
        '--batch-size',
        '25',
      ]);
    }

    if (filteredPractice.length > 0) {
      runOrThrow(pythonExe, [
        `${repoWin}\\scripts\\direct_import_legal_practice.py`,
        toWindowsPath(practiceImportPath),
        '--base-url',
        process.env.VITE_SUPABASE_URL,
        '--service-role-key',
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        '--batch-ref',
        `arlis-auto-${offset}`,
        '--batch-size',
        '10',
      ]);
    }

    await postJson(`${process.env.VITE_SUPABASE_URL}/functions/v1/practice-pipeline-orchestrator`, {});
    await postJson(`${process.env.VITE_SUPABASE_URL}/functions/v1/practice-chunk-worker`, { source_table: 'knowledge_base', concurrency_docs: 50 });
    await postJson(`${process.env.VITE_SUPABASE_URL}/functions/v1/practice-embed-worker`, { source_table: 'knowledge_base', concurrency_docs: 25 });

    console.log(JSON.stringify({
      offset,
      processed: Math.min(args.batchSize, total - offset),
      kb_rows: kbRows.length,
      reclassified_to_kb: reclassifiedToKb.length,
      imported_practice: filteredPractice.length,
    }, null, 2));
  }

  console.log('bulk_import_completed');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

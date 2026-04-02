const [baseUrl, serviceRoleKey, importRefPrefix = 'arlis-batch-200:'] = process.argv.slice(2)

if (!baseUrl || !serviceRoleKey) {
  console.error('Usage: node scripts/queue_missing_practice_jobs.mjs <baseUrl> <serviceRoleKey> [importRefPrefix]')
  process.exit(1)
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
}

function chunked(array, size) {
  const result = []
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size))
  return result
}

function buildJobRows(documentIds) {
  return documentIds.flatMap((document_id) => ['chunk', 'embed', 'enrich'].map((job_type) => ({
    document_id,
    source_table: 'legal_practice_kb',
    job_type,
    status: 'pending',
    attempts: 0,
    last_error: null,
    started_at: null,
    completed_at: null,
  })))
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const importRefFilter = encodeURIComponent(`like.${importRefPrefix}%`)
const docs = await apiFetch(`${baseUrl}/rest/v1/legal_practice_kb?select=id,import_ref&import_ref=${importRefFilter}`, { headers })
const jobs = await apiFetch(`${baseUrl}/rest/v1/practice_chunk_jobs?select=document_id`, { headers })

const withJobs = new Set((jobs || []).map((row) => row.document_id))
const missingIds = (docs || []).filter((row) => !withJobs.has(row.id)).map((row) => row.id)

for (const batch of chunked(buildJobRows(missingIds), 120)) {
  await apiFetch(`${baseUrl}/rest/v1/practice_chunk_jobs`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(batch),
  })
}

console.log(JSON.stringify({
  docs: (docs || []).length,
  docs_missing_jobs: missingIds.length,
  inserted_jobs: missingIds.length * 3,
}, null, 2))

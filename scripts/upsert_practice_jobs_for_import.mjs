const [baseUrl, serviceRoleKey, importRefPrefix] = process.argv.slice(2)

if (!baseUrl || !serviceRoleKey || !importRefPrefix) {
  console.error('Usage: node scripts/upsert_practice_jobs_for_import.mjs <baseUrl> <serviceRoleKey> <importRefPrefix>')
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

const filter = encodeURIComponent(`like.${importRefPrefix}%`)
const docs = await apiFetch(`${baseUrl}/rest/v1/legal_practice_kb?select=id&import_ref=${filter}`, { headers })
const docIds = (docs || []).map((row) => row.id)

for (const batch of chunked(buildJobRows(docIds), 120)) {
  await apiFetch(`${baseUrl}/rest/v1/practice_chunk_jobs?on_conflict=document_id,source_table,job_type`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(batch),
  })
}

console.log(JSON.stringify({ docs: docIds.length, upserted_jobs: docIds.length * 3 }, null, 2))

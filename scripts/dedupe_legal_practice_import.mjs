const [baseUrl, serviceRoleKey, importRefPrefix = 'arlis-batch-200:'] = process.argv.slice(2)

if (!baseUrl || !serviceRoleKey) {
  console.error('Usage: node scripts/dedupe_legal_practice_import.mjs <baseUrl> <serviceRoleKey> [importRefPrefix]')
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

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const filter = encodeURIComponent(`like.${importRefPrefix}%`)
const rows = await apiFetch(`${baseUrl}/rest/v1/legal_practice_kb?select=id,title,created_at,import_ref&import_ref=${filter}&order=created_at.asc`, { headers })

const seen = new Set()
const duplicateIds = []
for (const row of rows || []) {
  if (seen.has(row.title)) duplicateIds.push(row.id)
  else seen.add(row.title)
}

for (const batch of chunked(duplicateIds, 100)) {
  const idFilter = batch.map((id) => `"${id}"`).join(',')
  await apiFetch(`${baseUrl}/rest/v1/practice_chunk_jobs?document_id=in.(${idFilter})`, { method: 'DELETE', headers })
  await apiFetch(`${baseUrl}/rest/v1/legal_practice_kb?id=in.(${idFilter})`, { method: 'DELETE', headers })
}

console.log(JSON.stringify({
  import_rows: (rows || []).length,
  duplicate_rows_deleted: duplicateIds.length,
  unique_titles_remaining: seen.size,
}, null, 2))

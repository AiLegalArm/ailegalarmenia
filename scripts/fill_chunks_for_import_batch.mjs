import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [baseUrl, serviceRoleKey, sourceTable, importSelector] = process.argv.slice(2)

if (!baseUrl || !serviceRoleKey || !sourceTable || !importSelector) {
  console.error('Usage: node scripts/fill_chunks_for_import_batch.mjs <baseUrl> <serviceRoleKey> <sourceTable> <importSelector>')
  process.exit(1)
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
}

const { chunkDocument, CHUNKER_VERSION } = await import(pathToFileURL(path.resolve('temp/chunker_build/chunker.js')).href)

function encodeFilter(value) {
  return encodeURIComponent(`like.${value}%`)
}

async function apiFetch(url, options = {}) {
  let lastErr
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
      return text ? JSON.parse(text) : null
    } catch (err) {
      lastErr = err
      if (attempt === 5) break
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)))
    }
  }
  throw lastErr
}

function resolveDocType(doc, sourceTableName) {
  if (sourceTableName === 'legal_practice_kb') {
    const courtType = doc.court_type
    if (courtType === 'echr') return 'echr_judgment'
    if (courtType === 'cassation') return 'cassation_ruling'
    if (courtType === 'appeal') return 'appeal_ruling'
    if (courtType === 'first_instance') return 'first_instance_ruling'
    if (courtType === 'constitutional') return 'constitutional_court'
    return 'court_decision'
  }
  if (sourceTableName === 'knowledge_base') {
    const category = doc.category || ''
    if (String(category).includes('code')) return 'code'
    if (category === 'constitution') return 'law'
    if (category === 'echr' || category === 'echr_judgments') return 'echr_judgment'
    if (String(category).includes('cassation')) return 'cassation_ruling'
    if (['government_decisions', 'prime_minister_decisions', 'central_electoral_commission_decisions', 'ministry_of_health', 'other'].includes(String(category))) {
      return 'normative_act'
    }
    return 'law'
  }
  return 'other'
}

function buildChunkRows(doc, result, sourceTableName) {
  if (sourceTableName === 'knowledge_base') {
    return result.chunks.map((c) => ({
      kb_id: doc.id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      chunk_type: c.chunk_type,
      char_start: c.char_start,
      char_end: c.char_end,
      label: c.label,
      is_active: true,
      source_anchor: c.source_anchor || null,
      overlap_prev: c.overlap_prev || 0,
      rechunk_version: c.chunker_version || CHUNKER_VERSION,
      case_number: c.case_number || null,
      court_name: c.court_name || null,
      decision_date: c.decision_date || null,
    }))
  }
  return result.chunks.map((c) => ({
    doc_id: doc.id,
    chunk_index: c.chunk_index,
    chunk_text: c.chunk_text,
    chunk_hash: c.chunk_hash,
    title: c.label,
    source_anchor: c.source_anchor || null,
    overlap_prev: c.overlap_prev || 0,
    rechunk_version: c.chunker_version || CHUNKER_VERSION,
  }))
}

function chunked(array, size) {
  const result = []
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size))
  return result
}

const selectFields = sourceTable === 'knowledge_base'
  ? 'id,title,content_text,category,article_number'
  : 'id,title,content_text,court_type,practice_category,case_number_anonymized,decision_date,import_ref'

let docs = []
if (sourceTable === 'knowledge_base') {
  const ids = JSON.parse(fs.readFileSync(importSelector, 'utf8'))
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))]
  for (const idBatch of chunked(uniqueIds, 50)) {
    const filter = `in.(${idBatch.map((id) => JSON.stringify(id)).join(',')})`
    const rows = await apiFetch(`${baseUrl}/rest/v1/${sourceTable}?select=${encodeURIComponent(selectFields)}&id=${encodeURIComponent(filter)}`, { headers })
    docs.push(...(rows || []))
  }
} else {
  docs = await apiFetch(`${baseUrl}/rest/v1/${sourceTable}?select=${encodeURIComponent(selectFields)}&import_ref=${encodeFilter(importSelector)}`, { headers })
}

let chunkDocs = 0
let chunkRows = 0
for (const doc of docs || []) {
  const content = String(doc.content_text || '')
  if (!content.trim()) continue
  const docType = resolveDocType(doc, sourceTable)
  const result = await chunkDocument({
    doc_type: docType,
    content_text: content,
    title: doc.title || undefined,
    case_number: doc.case_number_anonymized || undefined,
    date: doc.decision_date || undefined,
  })
  const rows = buildChunkRows(doc, result, sourceTable)
  const chunksTable = sourceTable === 'knowledge_base' ? 'knowledge_base_chunks' : 'legal_practice_kb_chunks'
  const fkColumn = sourceTable === 'knowledge_base' ? 'kb_id' : 'doc_id'
  const onConflict = sourceTable === 'knowledge_base' ? 'kb_id,chunk_index' : 'doc_id,chunk_index'

  await apiFetch(`${baseUrl}/rest/v1/${chunksTable}?${fkColumn}=eq.${doc.id}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  })

  for (const batch of chunked(rows, 50)) {
    await apiFetch(`${baseUrl}/rest/v1/${chunksTable}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    })
    chunkRows += batch.length
  }

  await apiFetch(
    `${baseUrl}/rest/v1/practice_chunk_jobs?document_id=eq.${doc.id}&source_table=eq.${sourceTable}&job_type=eq.chunk`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'done',
        completed_at: new Date().toISOString(),
        last_error: null,
      }),
    },
  )
  chunkDocs += 1
}

console.log(JSON.stringify({ source_table: sourceTable, docs: chunkDocs, chunk_rows: chunkRows }, null, 2))

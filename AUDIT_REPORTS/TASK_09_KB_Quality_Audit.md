# Task 09 — Knowledge Base Quality Audit
**Date:** 2026-04-18  
**Status:** Completed  
**Model:** Claude Sonnet 4.6  
**Overall KB Quality:** NEEDS_IMPROVEMENT (solid architecture, critical embedding & schema gaps)

---

## 1. Chunking Pipeline

**Status: GOOD with concerns**

**Strategy:** `legal-chunker` v3-am-ru
- Max chunk size: 7,200 chars (`MAX_CHUNK_CHARS`)
- Min chunk size: 1,400 chars
- Overlap: 900 chars + 10% reasoning overlap ratio
- Supported document types: `code_or_law`, `treaty`, `court_decision`, `registry_table`, `normative_act`, `other`
- Multi-tiered fallback: articles → parts → points → lettered → paragraphs → overlap split
- QA gate: offset invariant validated via `chunk_text.slice(char_start, char_end) === chunk_text`
- SHA-256 chunk hashing for integrity; dedup by source_hash

**Concern (MEDIUM):** Chunk size (7.2KB) approaches text-embedding-3-small's limit for Armenian text (~8K tokens). No token-level validation is performed — only character-level. Edge case: very dense Armenian legal text near the limit could produce truncated embeddings.

---

## 2. KB Ingestion Pipeline

**Status: GOOD with documentation gaps**

**Legislation pipeline (knowledge_base):**
`ingest-document` → normalize → `chunkDocument()` → `validateChunks()` → insert `legal_documents` + `knowledge_base_chunks` → `embeddings-generate`

Deduplication by source_hash prevents duplicate ingestion. `embedding_status` tracking (pending/success/failed) added in prior migration — atomicity gap (BUG-H4) pre-resolved.

**Practice KB pipeline (legal_practice_kb):**
`practice-chunk-enqueue` → `practice-chunk-worker` → `practice-ai-enrich-worker` → `practice-embed-worker`

**Critical Gap (HIGH):** The `practice-pipeline-orchestrator` and related workers enqueue embedding jobs, but there is no documented pipeline for extracting rich metadata fields (`applied_articles`, `key_violations`, `legal_reasoning_summary`) from raw decision text. These fields exist in the schema but may be empty in production data.

---

## 3. Retrieval Quality

**Status: NEEDS_IMPROVEMENT — Vector Search Disabled**

The vector search infrastructure is built (pgvector, embedding columns, indexes) but the actual `vector-search.ts` implementation uses keyword-only retrieval (ILIKE + FTS `ts_rank`) with AI reranking via Gemini Flash.

| Capability | Design | Implementation | Status |
|-----------|--------|-----------------|--------|
| Vector similarity search | In schema + embeddings-generate | Disabled in vector-search.ts | ❌ DISABLED |
| Semantic reranking | Yes (Gemini Flash) | Works on keyword candidates | ⚠️ LIMITED |
| Date filtering (temporal) | Yes (referenceDate) | Implemented in searchKB | ✅ WORKS |
| Category/court filtering | Yes | Implemented | ✅ WORKS |
| Multi-KB search | Yes | Dual-bucket (KB + Practice) | ✅ WORKS |
| Deduplication | Yes | By document ID | ✅ WORKS |
| Context grounding | Yes | prompt-armor enforced | ✅ WORKS |

**Match Threshold:** Default 0.3 exists in code but is cosmetic — unused since vector search is disabled. FTS `ts_rank` has no explicit cutoff threshold.

**Top-k:** KB default 8, Practice default 5; max 40 each. Reasonable for context windows.

---

## 4. KB Table Schemas

### knowledge_base (Legislation)

Core metadata columns: `title`, `content_text`, `category` (enum: constitution, criminal_code, civil_code, etc.), `source_name`, `source_url`, `article_number`, `effective_from`, `effective_to`, `version_date`, `is_active`, `embedding vector(768)`, `embedding_status`

**Status (GOOD):** Temporal filtering ready. Category-based access control.

**Gaps:**
- Missing: explicit `language` field (Armenian-only assumed)
- Missing: `legal_currency` status (active/superseded/amended) — amendment history tracked in `kb_versions` but not surfaced in main table
- `embedding vector(768)` — dimension mismatch (see Section 5)

### legal_practice_kb (Precedents)

Core metadata columns: `court_type` (enum), `practice_category` (enum), `court_name`, `case_number_anonymized`, `decision_date`, `applied_articles` (JSONB), `key_violations` (TEXT[]), `legal_reasoning_summary`, `outcome` (enum), `is_anonymized` (BOOLEAN), `visibility`, `embedding vector(768)`, `embedding_status`

**Critical Schema Gap (HIGH):** `rag-search.ts` `formatPracticeContext()` function (lines 502–508) expects a `key_paragraphs` JSONB array with structure `[{rule_text, holding, quote, exact_quote, paragraph, page}]`. **This column does not exist in the `legal_practice_kb` schema.** When precedent results are formatted for the AI context window, structured holdings fall back to raw `content_text` (limited to 1,500 chars), losing structured legal reasoning.

**Other Schema Gaps:**
- `decision_map` field referenced in migration `20260412121500` — status unclear
- ECHR article field added in migration `20260412122000` — integration completeness unknown

---

## 5. Embedding Model Alignment

**Status: CRITICAL MISMATCH**

| Component | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Embedding model | text-embedding-3-small | text-embedding-3-small | ✅ |
| Default output dims | 384 | DB stores 768 | ❌ MISMATCH |
| DB vector column size | should match output | vector(768) | ⚠️ Legacy |
| Vector search | Should use stored vectors | Disabled | ❌ |

The database uses `vector(768)` (legacy Ada-002 dimensions), but `text-embedding-3-small` produces **384-dimensional** vectors by default. The `embedding-legacy.ts` file references `PRIMARY_EMBEDDING_DIM = 1536` and `LEGACY_EMBEDDING_DIM = 768`, indicating an inconsistent migration from an earlier embedding model.

**Consequence:** Any attempt to enable vector similarity search will fail or produce incorrect results until dimensions are unified. The `idx_kb_embedding` and `idx_practice_embedding` indexes are effectively unusable.

**Required action:** `SELECT array_length(embedding, 1) FROM knowledge_base WHERE embedding IS NOT NULL LIMIT 1` — audit actual stored dimensions, then create a migration to align schema to chosen dimensions and re-embed all documents.

---

## 6. KB Content Coverage

Based on schema enums, migration names, and script names:

**knowledge_base (Legislation):**
- ✅ Constitution of RA
- ✅ Criminal Code (ՀՀ Քրեական Օրենսգիրք)
- ✅ Criminal Procedure Code
- ✅ Civil Code
- ✅ Civil Procedure Code
- ✅ Administrative Procedure Code
- ✅ Administrative Violations Code
- ✅ Labor Code, Family Code, Tax Code (schema supports)
- ✅ Normative acts / government decrees

**legal_practice_kb (Precedents):**
- ✅ RA Cassation Court decisions (criminal, civil, administrative)
- ✅ First instance and appeal court decisions
- ✅ ECHR judgments (practice_category = 'echr')
- ⚠️ Volume and completeness unknown — no count telemetry in audit scope

---

## 7. RAG Quality Risk Register

### 🔴 HIGH

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| KB-H1 | Vector search disabled — only keyword FTS used | `vector-search.ts` | No semantic relevance; paraphrased legal queries may miss matches |
| KB-H2 | `key_paragraphs` expected by code, absent from schema | `rag-search.ts:502-508` vs `legal_practice_kb` schema | Precedent context is raw text, not structured holdings |
| KB-H3 | Embedding dimension mismatch: code=384, DB=768 | `embeddings-generate` vs migrations | Vector search would produce incorrect results if enabled |

### 🟡 MEDIUM

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| KB-M1 | Practice KB metadata extraction pipeline undocumented | `practice-pipeline-orchestrator` | `applied_articles`, `key_violations` may be empty in production |
| KB-M2 | No chunk overlap validation (max 50%) | `legal-chunker` | Context window dominated by overlap in edge cases |
| KB-M3 | No citation validation post-generation | `legal-chat` prompt | Model can cite invented articles; no grounding check |
| KB-M4 | Token budget enforces soft limits only | `token-budget.ts` | Oversized context silently truncated rather than rejected |
| KB-M5 | FTS threshold not set — no minimum relevance filter | `rag-search.ts` | Low-relevance results included in context window |

### 🟢 LOW

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| KB-L1 | No PII detection on KB ingestion | `ingest-document` | Practice KB raw text may contain unredacted personal data |
| KB-L2 | `is_anonymized` required but not validated by pipeline | `legal_practice_kb` constraint | Non-anonymized decisions could be ingested |
| KB-L3 | No retrieval telemetry dashboard | Various | Retrieval quality cannot be monitored |
| KB-L4 | Language field absent from `knowledge_base` schema | Schema | Multi-language KB extension requires migration |

---

## 8. Recommendations

### Phase 1: Critical (Before Production)

1. **Resolve embedding dimension mismatch** — Audit actual stored dims, choose 384 or 1536, create migration, re-embed all documents
2. **Add `key_paragraphs JSONB[]` column to `legal_practice_kb`** — Enable structured precedent retrieval with rule_text, holding, quote fields
3. **Enable vector search** with correct aligned dimensions — replace keyword-only FTS with hybrid search
4. **Document and validate practice KB ingestion pipeline** — Confirm `applied_articles`, `key_violations`, `legal_reasoning_summary` are populated

### Phase 2: Important (Pre-Release)

5. Add chunk overlap enforcement (≤ 50% of chunk size)
6. Implement post-generation citation extraction and validation against RAG results
7. Set FTS `ts_rank` minimum threshold (recommend 0.001) to filter noise
8. Add token budget hard limits — reject queries that would require context truncation

### Phase 3: Enhancement (Post-Release)

9. Run token accounting audit on actual Armenian legal documents
10. Add PII detection on practice KB ingestion
11. Implement retrieval telemetry dashboard
12. Add diversity reranking (MMR or similar) to top-k results

---

*KB Quality Audit complete. Proceeding to Task 10 → Prompt Audit and Strengthening.*

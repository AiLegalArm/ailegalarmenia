# Legal Document & Chunk — Canonical JSON Schema

## 0. Problem → Risk → Solution

### Problem
No deterministic JSON schema for document ingestion. Each edge function (kb-import, legal-practice-import, ocr-process, kb-fetch-pdf-content) produces ad-hoc structures. This causes:
- Inconsistent field names across pipelines
- Silent data loss (missing fields pass without error)
- Impossible to validate ingestion output programmatically
- RAG retrieval quality degrades — chunks lack structured metadata

### Risk
- **Data corruption**: Documents ingested with wrong `doc_type` or missing `jurisdiction` pollute vector search
- **Silent failures**: No validation = no error = bad data in production
- **Prompt injection surface**: Unvalidated `content_text` flows directly into LLM prompts
- **Scaling blocker**: Cannot add new document types without updating every consumer

### Solution
Canonical TypeScript types + JSON Schema for two core entities:
1. **LegalDocument** — the full document with metadata
2. **LegalChunk** — a segment of a document for RAG retrieval

All ingestion pipelines MUST validate against these schemas before DB insert.

---

## 1. Enums

### `DocType` — Document classification
```typescript
type DocType =
  | "law"                    // Օdelays — RA laws
  | "code"                   // Օrensgirq — codified law
  | "court_decision"         // Դatavrakan akt — court ruling
  | "constitutional_court"   // Սdelays Datatarani voroshumner
  | "government_decree"      // Karavarutyan voroshumner
  | "pm_decision"            // Varchapeti voroshumner
  | "regulation"             // Kanonakarger
  | "international_treaty"   // Mijazgayin paymanagrer
  | "echr_judgment"          // ՄԻdelays voroshumner
  | "legal_commentary"       // Iravakan meknabanutyan
  | "cassation_ruling"       // Vardayin datataran
  | "appeal_ruling"          // Verapelakan datataran
  | "first_instance_ruling"  // Aradjin atyanis datataran
  | "other";
```

### `ChunkType` — Chunk semantic role
```typescript
type ChunkType =
  | "header"           // Document title, metadata block
  | "operative"        // Резolютивная часть (verdict/holding)
  | "reasoning"        // Мотивировочная часть (legal reasoning)
  | "facts"            // Фabular (factual background)
  | "dissent"          // Особое мнение (dissenting opinion)
  | "article"          // Article of a code/law
  | "preamble"         // Преамбула
  | "table"            // Tabular data
  | "reference_list"   // List of cited laws/cases
  | "full_text"        // Unsegmented full content
  | "other";
```

### `CourtType` — Court hierarchy
```typescript
type CourtType =
  | "first_instance"
  | "appeal"
  | "cassation"
  | "constitutional"
  | "echr";
```

### `LegalBranch` — Branch of law
```typescript
type LegalBranch =
  | "criminal"
  | "civil"
  | "administrative"
  | "constitutional"
  | "labor"
  | "family"
  | "tax"
  | "customs"
  | "electoral"
  | "land"
  | "environmental"
  | "international"
  | "echr"
  | "other";
```

### `Jurisdiction`
```typescript
type Jurisdiction = "AM"; // Republic of Armenia ONLY
```

---

## 2. LegalDocument — Full Schema

```typescript
interface LegalDocument {
  /** UUID v4, generated at ingestion */
  id: string;

  /** Document classification */
  doc_type: DocType;

  /** Always "AM" */
  jurisdiction: "AM";

  /** Branch of law */
  branch: LegalBranch;

  /** Original title (Armenian) */
  title: string;

  /** Title transliterated or translated (optional) */
  title_alt?: string;

  /** Full plain text content */
  content_text: string;

  /** Official document number (e.g. "ՀՕ-123-Ն") */
  document_number?: string;

  /** ISO 8601 date of adoption/decision */
  date_adopted?: string;

  /** ISO 8601 date of entry into force */
  date_effective?: string;

  /** Source URL (arlis.am, datalex.am, etc.) */
  source_url?: string;

  /** Source system name */
  source_name?: string;

  /** Court metadata (only for court decisions) */
  court?: {
    court_type: CourtType;
    court_name?: string;
    case_number?: string;
    judge_names?: string[];
    outcome?: "granted" | "rejected" | "partial" | "remanded" | "discontinued";
  };

  /** Applied legal articles */
  applied_articles?: AppliedArticle[];

  /** Key violations found (Armenian text) */
  key_violations?: string[];

  /** AI-generated legal reasoning summary */
  legal_reasoning_summary?: string;

  /** Structured decision map for court decisions */
  decision_map?: {
    legal_question?: string;
    holding?: string;
    tests_or_criteria?: string;
    application_to_facts?: string;
    remedy?: string;
    references?: string[];
  };

  /** Ingestion metadata */
  ingestion: {
    /** Pipeline that created this document */
    pipeline: "kb-import" | "legal-practice-import" | "ocr-process" | "kb-fetch-pdf-content" | "manual" | "bulk-import";
    /** ISO 8601 timestamp */
    ingested_at: string;
    /** User ID who triggered ingestion */
    ingested_by?: string;
    /** Schema version for forward compatibility */
    schema_version: "1.0";
    /** Source file hash for dedup */
    source_hash?: string;
  };

  /** Embedding vector (768-dim, Gemini) */
  embedding?: number[];

  /** Whether document is active */
  is_active: boolean;
}

interface AppliedArticle {
  /** Name of legal act */
  act: string;
  /** List of articles with context */
  articles: ArticleRef[];
}

interface ArticleRef {
  /** Article number (e.g. "391") */
  article: string;
  /** Part (e.g. "1") */
  part?: string;
  /** Point (e.g. "3") */
  point?: string;
  /** Max 300 chars context from source text */
  context?: string;
}
```

---

## 3. LegalChunk — RAG Retrieval Unit

```typescript
interface LegalChunk {
  /** UUID v4 */
  id: string;

  /** Parent document ID */
  doc_id: string;

  /** Zero-based index within document */
  chunk_index: number;

  /** Semantic role of this chunk */
  chunk_type: ChunkType;

  /** Plain text content (max 8000 chars) */
  chunk_text: string;

  /** Character offset in parent document */
  char_start: number;

  /** Character offset end */
  char_end: number;

  /** Section label (e.g. "Հոդված 391", "Պատճառdelays") */
  label?: string;

  /** Embedding vector (768-dim) */
  embedding?: number[];

  /** SHA-256 hash of chunk_text for dedup */
  chunk_hash: string;

  /** ISO 8601 */
  created_at: string;
}
```

---

## 4. JSON Schema (for runtime validation)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "legal-document-v1.0",
  "type": "object",
  "required": ["id", "doc_type", "jurisdiction", "branch", "title", "content_text", "ingestion", "is_active"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "doc_type": {
      "type": "string",
      "enum": ["law", "code", "court_decision", "constitutional_court", "government_decree", "pm_decision", "regulation", "international_treaty", "echr_judgment", "legal_commentary", "cassation_ruling", "appeal_ruling", "first_instance_ruling", "other"]
    },
    "jurisdiction": { "type": "string", "const": "AM" },
    "branch": {
      "type": "string",
      "enum": ["criminal", "civil", "administrative", "constitutional", "labor", "family", "tax", "customs", "electoral", "land", "environmental", "international", "echr", "other"]
    },
    "title": { "type": "string", "minLength": 1, "maxLength": 1000 },
    "content_text": { "type": "string", "minLength": 1 },
    "document_number": { "type": "string" },
    "date_adopted": { "type": "string", "format": "date" },
    "date_effective": { "type": "string", "format": "date" },
    "source_url": { "type": "string", "format": "uri" },
    "court": {
      "type": "object",
      "properties": {
        "court_type": { "type": "string", "enum": ["first_instance", "appeal", "cassation", "constitutional", "echr"] },
        "court_name": { "type": "string" },
        "case_number": { "type": "string" },
        "outcome": { "type": "string", "enum": ["granted", "rejected", "partial", "remanded", "discontinued"] }
      }
    },
    "applied_articles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["act", "articles"],
        "properties": {
          "act": { "type": "string" },
          "articles": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["article"],
              "properties": {
                "article": { "type": "string" },
                "part": { "type": "string" },
                "point": { "type": "string" },
                "context": { "type": "string", "maxLength": 300 }
              }
            }
          }
        }
      }
    },
    "ingestion": {
      "type": "object",
      "required": ["pipeline", "ingested_at", "schema_version"],
      "properties": {
        "pipeline": { "type": "string", "enum": ["kb-import", "legal-practice-import", "ocr-process", "kb-fetch-pdf-content", "manual", "bulk-import"] },
        "ingested_at": { "type": "string", "format": "date-time" },
        "ingested_by": { "type": "string", "format": "uuid" },
        "schema_version": { "type": "string", "const": "1.0" },
        "source_hash": { "type": "string" }
      }
    },
    "is_active": { "type": "boolean" }
  },
  "additionalProperties": false
}
```

### LegalChunk JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "legal-chunk-v1.0",
  "type": "object",
  "required": ["id", "doc_id", "chunk_index", "chunk_type", "chunk_text", "char_start", "char_end", "chunk_hash", "created_at"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "doc_id": { "type": "string", "format": "uuid" },
    "chunk_index": { "type": "integer", "minimum": 0 },
    "chunk_type": {
      "type": "string",
      "enum": ["header", "operative", "reasoning", "facts", "dissent", "article", "preamble", "table", "reference_list", "full_text", "other"]
    },
    "chunk_text": { "type": "string", "minLength": 1, "maxLength": 10000 },
    "char_start": { "type": "integer", "minimum": 0 },
    "char_end": { "type": "integer", "minimum": 0 },
    "label": { "type": "string" },
    "chunk_hash": { "type": "string" },
    "created_at": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
```

---

## 5. DB Mapping Notes

### `knowledge_base` table mapping
| Schema Field | DB Column | Notes |
|---|---|---|
| `id` | `id` (uuid PK) | Direct |
| `doc_type` | — | NOT STORED (inferred from `category`) |
| `branch` | `category` (kb_category enum) | Partial overlap — `kb_category` has code-level values |
| `title` | `title` | Direct |
| `content_text` | `content_text` | Direct |
| `source_url` | `source_url` | Direct |
| `source_name` | `source_name` | Direct |
| `date_adopted` | `version_date` | Semantic mismatch — `version_date` is ambiguous |
| `document_number` | `article_number` | Semantic mismatch — overloaded field |
| `embedding` | `embedding` (vector(768)) | Direct |
| `is_active` | `is_active` | Direct |
| `ingestion.ingested_by` | `uploaded_by` | Direct |
| `ingestion.ingested_at` | `created_at` | Direct |

### `legal_practice_kb` table mapping
| Schema Field | DB Column | Notes |
|---|---|---|
| `id` | `id` (uuid PK) | Direct |
| `doc_type` | — | Inferred: always court_decision/cassation_ruling/etc. |
| `branch` | `practice_category` (practice_category enum) | Direct |
| `title` | `title` | Direct |
| `content_text` | `content_text` | Direct |
| `court.court_type` | `court_type` (court_type enum) | Direct |
| `court.court_name` | `court_name` | Direct |
| `court.case_number` | `case_number_anonymized` | Direct |
| `court.outcome` | `outcome` (case_outcome enum) | Direct |
| `applied_articles` | `applied_articles` (jsonb) | Direct — already uses `{act, articles}` |
| `key_violations` | `key_violations` (text[]) | Direct |
| `legal_reasoning_summary` | `legal_reasoning_summary` | Direct |
| `decision_map` | `decision_map` (jsonb) | Direct |
| `embedding` | `embedding` (vector(768)) | Direct |

### `legal_practice_kb_chunks` table mapping
| Schema Field | DB Column | Notes |
|---|---|---|
| `id` | `id` (uuid PK) | Direct |
| `doc_id` | `doc_id` (FK → legal_practice_kb) | Direct |
| `chunk_index` | `chunk_index` (integer) | Direct |
| `chunk_type` | — | **NOT STORED** — needs migration |
| `chunk_text` | `chunk_text` | Direct |
| `char_start` | — | **NOT STORED** — needs migration |
| `char_end` | — | **NOT STORED** — needs migration |
| `label` | `title` | Semantic mismatch |
| `chunk_hash` | `chunk_hash` | Direct |

### Missing columns (require migration)
- `legal_practice_kb_chunks.chunk_type` (text, default 'full_text')
- `legal_practice_kb_chunks.char_start` (integer)
- `legal_practice_kb_chunks.char_end` (integer)
- `legal_practice_kb_chunks.embedding` (vector(768)) — for chunk-level retrieval

### Enum alignment
| Schema Enum | DB Enum | Gap |
|---|---|---|
| `DocType` | — | No DB enum exists |
| `ChunkType` | — | No DB enum exists |
| `CourtType` | `court_type` | Aligned |
| `LegalBranch` | `practice_category` | Partial (missing: labor, family, tax, customs, electoral, land, environmental) |
| `Jurisdiction` | — | Not stored (implicit) |

---

## 6. Implementation Priority

### Phase 1 (immediate) — Validation layer
- Add Zod schemas matching the JSON Schema above
- Validate all ingestion payloads before DB insert
- Log validation failures to `error_logs`

### Phase 2 (1 week) — DB alignment
- Add missing columns to `legal_practice_kb_chunks`
- Add `chunk_type` classification in chunking pipeline
- Add `char_start`/`char_end` tracking

### Phase 3 (2 weeks) — Chunk-level embeddings
- Generate embeddings per chunk (not just per document)
- Enable chunk-level vector search for fine-grained RAG

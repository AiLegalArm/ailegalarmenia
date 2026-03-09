# AI Legal Armenia \u2014 Technical Audit Report

**Date**: 2026-02-13  
**Author**: Senior AI Systems Architect (automated audit)  
**Scope**: Ingestion \u2192 Chunking \u2192 Embedding \u2192 Retrieval \u2192 Prompting pipeline  
**Schema Version**: 1.0

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 High-Level Pipeline

```
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  RAW INPUT (TXT / PDF / OCR)                                        \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 1: NORMALIZE                                                 \u2502
\u2502  Edge Function: legal-document-normalizer                           \u2502
\u2502  \u2022 Infers doc_type from filename + text heuristics                  \u2502
\u2502  \u2022 Extracts metadata via regex (Unicode-escaped Armenian)           \u2502
\u2502  \u2022 Validates against LegalDocument schema v1.0                      \u2502
\u2502  \u2022 Output: LegalDocument JSON                                       \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 2: CHUNK                                                     \u2502
\u2502  Edge Function: legal-chunker                                       \u2502
\u2502  \u2022 Legislation: splits by \u0540\u0578\u0564\u057e\u0561\u056e (Article) markers + parts       \u2502
\u2502  \u2022 Court decisions: detects section headers (facts/reasoning/oper.) \u2502
\u2502  \u2022 Fallback: 8000-char fixed-window with 200-char overlap           \u2502
\u2502  \u2022 Output: LegalChunk[] with char_start/end, locators, hashes       \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 2.5: EXTRACT NORM REFERENCES                                 \u2502
\u2502  Edge Function: norm-ref-extractor                                  \u2502
\u2502  \u2022 Regex-based extraction of \u0570\u0578\u0564\u057e\u0561\u056e/\u0574\u0561\u057d/\u056f\u0565\u057f patterns              \u2502
\u2502  \u2022 200-char lookback for act_number proximity detection             \u2502
\u2502  \u2022 Deduplication + deterministic sort                               \u2502
\u2502  \u2022 Output: NormRef[] per chunk -> stored in norm_refs JSONB          \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 3: EMBED                                                     \u2502
\u2502  Edge Function: generate-embeddings                                 \u2502
\u2502  \u2022 Model: Gemini text-embedding (768-dim)                           \u2502
\u2502  \u2022 Input: chunk_text -> Output: vector(768)                         \u2502
\u2502  \u2022 Stored in legal_chunks.embedding                                 \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 4: STORE                                                     \u2502
\u2502  Table: public.legal_chunks (pgvector)                              \u2502
\u2502  \u2022 Unified index for legislation + practice                         \u2502
\u2502  \u2022 HNSW index on embedding (m=16, ef_construction=64)               \u2502
\u2502  \u2022 GIN index on norm_refs for article-based lookup                  \u2502
\u2502  \u2022 RLS: authenticated read, admin write                             \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 5: RETRIEVE (Dual-RAG)                                       \u2502
\u2502  RPC: search_legal_chunks(query_embedding, filters, budgets)        \u2502
\u2502  \u2022 Top-K cosine similarity search                                   \u2502
\u2502  \u2022 Auto-split into legislation / practice buckets                   \u2502
\u2502  \u2022 Deduplicate by doc_id within each bucket                         \u2502
\u2502  \u2022 Configurable budget: legislation_budget, practice_budget          \u2502
\u2502  \u2022 Optional filters: doc_type[], chunk_type[], norm_article          \u2502
\u2502  \u2022 Output: { legislation: [...], practice: [...] }                  \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                v
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  STAGE 6: PROMPT (Hardened)                                         \u2502
\u2502  Shared: _shared/prompt-armor.ts                                    \u2502
\u2502  \u2022 sandboxUserInput(): fenced data blocks with injection stripping   \u2502
\u2502  \u2022 ANTI_INJECTION_RULES: 6 non-negotiable security directives (S1-S6)\u2502
\u2502  \u2022 JSON_OUTPUT_SCHEMA_INSTRUCTION: enforced LegalAnswer schema      \u2502
\u2502  \u2022 validateJsonOutput(): parse + coerce + validate                  \u2502
\u2502  \u2022 attemptJsonRepair(): one-pass LLM repair (gemini-2.5-flash-lite) \u2502
\u2502  \u2022 Applied to: legal-chat, ai-analyze, generate-document            \u2502
\u2502  \u2022 Temperature: 0.3 for all legal outputs                           \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
```

### 1.2 Function Registry

| Function | File | JWT | Purpose |
|---|---|---|---|
| `legal-document-normalizer` | 566 lines | `false` | Raw text \u2192 LegalDocument schema |
| `legal-chunker` | 540 lines | `false` | LegalDocument \u2192 LegalChunk[] |
| `norm-ref-extractor` | 289 lines | `false` | Chunk text \u2192 NormRef[] |
| `generate-embeddings` | existing | `false` | Text \u2192 vector(768) |
| `vector-search` | existing | `false` | Query embedding \u2192 matches |
| `prompt-armor` (shared) | 237 lines | N/A | Security layer for all AI functions |

---

## 2. DATA SCHEMAS

### 2.1 Enums

```typescript
// DocType \u2014 Document classification (14 values)
type DocType =
  | "law"                    // \u0555\u0580\u0565\u0576\u0584 (RA laws)
  | "code"                   // \u0555\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584 (codified law)
  | "court_decision"         // Generic court ruling
  | "constitutional_court"   // \u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576
  | "government_decree"      // \u053f\u0561\u057c\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574
  | "pm_decision"            // \u054e\u0561\u0580\u0579\u0561\u057a\u0565\u057f\u056b \u0578\u0580\u0578\u0577\u0578\u0582\u0574
  | "regulation"             // \u053f\u0561\u0576\u0578\u0576\u0561\u056f\u0561\u0580\u0563
  | "international_treaty"   // \u0544\u056b\u057b\u0561\u0566\u0563\u0561\u0575\u056b\u0576 \u057a\u0561\u0575\u0574\u0561\u0576\u0561\u0563\u056b\u0580
  | "echr_judgment"          // \u0544\u053b\u0535\u0534 \u057e\u0573\u056b\u057c
  | "legal_commentary"       // \u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576
  | "cassation_ruling"       // \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576
  | "appeal_ruling"          // \u054e\u0565\u0580\u0561\u057a\u0565\u056c\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576
  | "first_instance_ruling"  // \u0531\u057c\u0561\u057b\u056b\u0576 \u0561\u057f\u0575\u0561\u0576\u056b \u0564\u0561\u057f\u0561\u0580\u0561\u0576
  | "other";

// ChunkType \u2014 Semantic role of a chunk (11 values)
type ChunkType =
  | "header"           // Document title / metadata block
  | "operative"        // Verdict / holding (\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576)
  | "reasoning"        // Legal reasoning (\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d)
  | "facts"            // Factual background (\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d)
  | "dissent"          // Dissenting opinion (\u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584)
  | "article"          // Article of a code/law
  | "preamble"         // Preamble
  | "table"            // Tabular data
  | "reference_list"   // Cited laws/cases list
  | "full_text"        // Unsegmented content (fallback)
  | "other";

// CourtType \u2014 Court hierarchy (5 values)
type CourtType =
  | "first_instance" | "appeal" | "cassation"
  | "constitutional" | "echr";

// LegalBranch \u2014 Branch of law (14 values)
type LegalBranch =
  | "criminal" | "civil" | "administrative" | "constitutional"
  | "labor" | "family" | "tax" | "customs" | "electoral"
  | "land" | "environmental" | "international" | "echr" | "other";

// Jurisdiction \u2014 Fixed
type Jurisdiction = "AM"; // Republic of Armenia ONLY
```

### 2.2 LegalDocument (Normalizer Output)

```typescript
interface LegalDocument {
  doc_type: DocType;
  jurisdiction: "AM";
  branch: LegalBranch;
  title: string;                        // max 500 chars, extracted from first lines
  title_alt: string | null;             // transliterated (not implemented)
  content_text: string;                 // full raw text
  document_number: string | null;       // e.g. "\u0540\u0555-528-\u0546" via regex
  date_adopted: string | null;          // ISO 8601 (YYYY-MM-DD)
  date_effective: string | null;        // always null (separate parsing needed)
  source_url: string | null;
  source_name: string | null;           // "arlis.am" | "datalex.am" | null
  court: CourtMeta | null;              // populated only for court decisions
  applied_articles: unknown[] | null;   // null (requires AI enrichment)
  key_violations: string[] | null;      // null (requires AI enrichment)
  legal_reasoning_summary: string | null; // null (requires AI enrichment)
  decision_map: unknown | null;         // null (requires AI enrichment)
  ingestion: {
    pipeline: string;                   // "legal-document-normalizer"
    ingested_at: string;                // ISO 8601 timestamp
    schema_version: "1.0";
    source_hash: string | null;         // deterministic hash of first 10K chars
  };
  is_active: boolean;                   // always true at ingestion
}

interface CourtMeta {
  court_type: CourtType;
  court_name: string | null;            // regex-extracted from header
  case_number: string | null;           // pattern: XX/NNNNN/NN/NN
  judge_names: string[] | null;         // always null (NER not implemented)
  outcome: "granted"|"rejected"|"partial"|"remanded"|"discontinued"|null;
}
```

### 2.3 LegalChunk (Chunker Output)

```typescript
interface LegalChunk {
  chunk_index: number;         // zero-based, sequential
  chunk_type: ChunkType;       // semantic role
  chunk_text: string;          // max 8000 chars
  char_start: number;          // absolute char offset in parent doc
  char_end: number;            // absolute char offset end
  label: string | null;        // e.g. "\u0540\u0578\u0564\u057e\u0561\u056e 391, \u0574\u0561\u057d 1"
  locator: ChunkLocator | null;
  chunk_hash: string;          // deterministic hash for dedup
}

interface ChunkLocator {
  article?: string;            // e.g. "391"
  part?: string;               // e.g. "1"
  point?: string;              // e.g. "3"
  section_title?: string;      // e.g. "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d"
}
```

### 2.4 NormRef (Norm Reference Extractor Output)

```typescript
interface NormRef {
  act_number: string | null;   // e.g. "\u0540\u0555-528-\u0546" (200-char lookback)
  article: string;             // e.g. "391", "391.1"
  part: string | null;         // e.g. "1"
  point: string | null;        // e.g. "3"
}
```

### 2.5 Validation Strategy

| Layer | Mechanism | Scope |
|---|---|---|
| **Normalizer** | `validate()` function (566 lines) | Checks doc_type enum, jurisdiction=="AM", branch enum, non-empty title/content, ISO date format, court_type enum, schema_version=="1.0" |
| **Chunker** | Implicit constraints | chunk_text.length > 0, char_end > char_start, sequential chunk_index |
| **Norm-ref** | Deduplication + sort | Composite key dedup, numeric sort by article/part/point |
| **Prompt layer** | `validateJsonOutput()` | Validates LegalAnswer JSON schema, coerces types, clamps confidence [0,1] |
| **DB level** | Constraints | `NOT NULL` on core fields, `UNIQUE(doc_id, chunk_index)`, `DEFAULT` values |

---

## 3. DATABASE STRUCTURE

### 3.1 Table: `public.legal_chunks`

```sql
CREATE TABLE public.legal_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID NOT NULL,
  doc_type      TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL DEFAULT 0,
  chunk_type    TEXT NOT NULL DEFAULT 'full_text',
  chunk_text    TEXT NOT NULL,
  char_start    INTEGER NOT NULL DEFAULT 0,
  char_end      INTEGER NOT NULL DEFAULT 0,
  label         TEXT,
  embedding     vector(768),
  metadata      JSONB DEFAULT '{}'::jsonb,
  norm_refs     JSONB DEFAULT '[]'::jsonb,
  chunk_hash    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Indexes (7 total)

| Index | Type | Definition | Purpose |
|---|---|---|---|
| `legal_chunks_pkey` | B-Tree (PK) | `(id)` | Primary key |
| `unique_doc_chunk` | B-Tree (UNIQUE) | `(doc_id, chunk_index)` | Deduplication |
| `idx_legal_chunks_embedding` | HNSW | `(embedding vector_cosine_ops) WITH (m=16, ef_construction=64)` | Vector similarity search |
| `idx_legal_chunks_norm_refs` | GIN | `(norm_refs jsonb_path_ops)` | Article-based JSONB lookup |
| `idx_legal_chunks_doc_id` | B-Tree | `(doc_id)` | Foreign-key-style lookups |
| `idx_legal_chunks_doc_type` | B-Tree (partial) | `(doc_type) WHERE is_active = true` | Filtered scans by document type |
| `idx_legal_chunks_hash` | B-Tree (partial) | `(chunk_hash) WHERE chunk_hash IS NOT NULL` | Dedup lookups |

### 3.3 RLS Policies (5 total)

| Policy | Command | Condition |
|---|---|---|
| Authenticated users can read legal chunks | `SELECT` | `is_active = true` |
| Admins can insert legal chunks | `INSERT` | `has_role(auth.uid(), 'admin')` |
| Admins can update legal chunks | `UPDATE` | `has_role(auth.uid(), 'admin')` |
| Admins can delete legal chunks | `DELETE` | `has_role(auth.uid(), 'admin')` |
| Service role full access | `ALL` | `true` (service role bypass) |

### 3.4 RPC: `search_legal_chunks`

```sql
search_legal_chunks(
  query_embedding     vector(768),
  match_count         integer DEFAULT 20,
  match_threshold     double precision DEFAULT 0.3,
  filter_doc_types    text[] DEFAULT NULL,
  filter_chunk_types  text[] DEFAULT NULL,
  filter_norm_article text DEFAULT NULL,
  legislation_budget  integer DEFAULT 10,
  practice_budget     integer DEFAULT 10
) RETURNS jsonb
```

**Algorithm:**

1. Cosine similarity scan: `(1 - (embedding <=> query_embedding)) > match_threshold`
2. Limit to `match_count * 2` candidates
3. Classify into buckets by `doc_type`:
   - **Legislation**: `law`, `code`, `government_decree`, `pm_decision`, `regulation`, `international_treaty`, `other`
   - **Practice**: `court_decision`, `constitutional_court`, `echr_judgment`, `legal_commentary`, `cassation_ruling`, `appeal_ruling`, `first_instance_ruling`
4. Deduplicate: `DISTINCT ON (bucket, doc_id)` keeping highest similarity
5. Apply budget: `LIMIT legislation_budget` / `LIMIT practice_budget`
6. Return structured JSON:

```json
{
  "legislation": [
    { "id", "doc_id", "doc_type", "chunk_index", "chunk_type",
      "chunk_text", "label", "metadata", "norm_refs", "similarity" }
  ],
  "practice": [ ... ],
  "total_legislation": 5,
  "total_practice": 7
}
```

---

## 4. EDGE FUNCTIONS \u2014 DETAILED IMPLEMENTATION

### 4.1 `legal-document-normalizer` (566 lines)

**Input**: `{ fileName, mimeType, rawText, sourceUrl? }`  
**Output**: `{ document: LegalDocument }` or `{ error, details, document }` (HTTP 422)

**Detection heuristics** (checked against first 3000 chars of text):

| Pattern | Regex | Detects |
|---|---|---|
| `\u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584` | `CODE_RE` | `code` |
| `\u0585\u0580\u0565\u0576\u0584` | `LAW_RE` | `law` |
| `\u057e\u0573\u057c\u0561\u0562\u0565\u056f` | `CASSATION_RE` | `cassation_ruling` |
| `\u057e\u0565\u0580\u0561\u057a\u0565\u056c\u0561\u056f\u0561\u0576` | `APPEAL_RE` | `appeal_ruling` |
| `\u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576` | `CONSTITUTIONAL_RE` | `constitutional_court` |
| `\u0544\u053b\u0535\u0534` | `ECHR_RE` | `echr_judgment` |
| `\u056f\u0561\u057c\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576` | `GOVT_RE` | `government_decree` |
| `\u057e\u0561\u0580\u0579\u0561\u057a\u0565\u057f` | `PM_RE` | `pm_decision` |
| `XX/NNNNN/NN/NN` | `CASE_NUMBER_RE` | `court_decision` |

**Date extraction**: Tries 3 patterns in order:
1. Armenian textual: `dd <month-name>\u056b yyyy \u0569\u057e\u0561\u056f\u0561\u0576\u056b` (12 month names mapped)
2. ISO: `yyyy-mm-dd`
3. Numeric: `dd.mm.yyyy` or `dd/mm/yyyy`

**Branch detection**: Keywords `\u0584\u0580\u0565\u0561\u056f\u0561\u0576` (criminal), `\u0584\u0561\u0572\u0561\u0584\u0561\u056f\u0561\u0576` (civil), `\u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576` (administrative), `\u0561\u0577\u056d\u0561\u057f\u0561\u0576\u0584\u0561\u0575\u056b\u0576` (labor), `\u0568\u0576\u057f\u0561\u0576\u0565\u056f\u0561\u0576` (family), `\u0570\u0561\u0580\u056f\u0561\u0575\u056b\u0576` (tax).

**Outcome detection** (last 5000 chars): `\u0532\u0561\u057e\u0561\u0580\u0561\u0580\u0565\u056c` (granted), `\u0544\u0565\u0580\u056a\u0565\u056c` (rejected), partial check before granted, `\u054e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c` (remanded), `\u053f\u0561\u0580\u0573\u0565\u056c` (discontinued).

**Tests**: 4 cases in `normalizer.test.ts`:
- Criminal Code TXT \u2192 `code`, `criminal`
- Cassation decision \u2192 `cassation_ruling`, `criminal`, date=`2024-06-20`, outcome=`rejected`
- Validation rejects invalid doc_type + empty content
- Unknown file \u2192 `other`

### 4.2 `legal-chunker` (540 lines)

**Input**: `{ document: { doc_type, content_text, title? } }`  
**Output**: `{ chunks: LegalChunk[], total_chunks, doc_type }`

**Chunking strategies by doc_type:**

| doc_type | Strategy | Section detection |
|---|---|---|
| `law`, `code`, `regulation` | Article-based | `\u0540\u0578\u0564\u057e\u0561\u056e NNN\u0589` header regex |
| `court_decision`, `cassation_ruling`, `appeal_ruling`, `first_instance_ruling`, `constitutional_court`, `echr_judgment` | Section-based | 7 Armenian section headers (reasoning, facts, operative, dissent, etc.) |
| All others | Fixed-window | 8000-char windows, 200-char overlap |

**Court section patterns** (7 patterns):

| Pattern | ChunkType |
|---|---|
| `\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d` | `reasoning` |
| `\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d` | `facts` |
| `\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576` | `operative` |
| `\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576` | `operative` |
| `\u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584` | `dissent` |
| `\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584` | `facts` |
| `\u057e\u0573\u056b\u057c\u0565\u0581` | `operative` |

**Post-processing**: Oversized chunks (>8000 chars) are re-split via fixed-window.

**Tests**: 5 cases in `chunker.test.ts`:
- Legislation splits by articles (\u2265 3 article chunks with locators)
- Court decision splits by sections (facts + reasoning + operative)
- Unknown doc_type \u2192 fixed-window (`full_text`)
- Empty content \u2192 empty array
- Deterministic hashes across repeated calls

### 4.3 `norm-ref-extractor` (289 lines)

**Input**: `{ chunk_text }` or `{ chunks: [...] }` (batch)  
**Output**: `{ norm_refs: NormRef[] }` or `{ chunks: [...with norm_refs...] }`

**Extraction patterns** (4 regex patterns):

| Pattern | Example | Description |
|---|---|---|
| A | `\u0570\u0578\u0564\u057e\u0561\u056e[\u056b]? 391 \u0574\u0561\u057d 1 \u056f\u0565\u057f 3` | Standard: Article + Part + Point |
| B | `391-\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e` | Reversed: Number + Article |
| C | `\u0570\u0578\u0564\u057e. 88` | Abbreviated form |
| Act | `[\u0531-\u058f]{1,4}-\d{1,6}-[\u0531-\u058f]{1,3}` | Act number proximity (200-char lookback) |

**Tests**: 15 cases in `norm-ref.test.ts`:
- Basic article, with part, with point, genitive form, uppercase, abbreviated
- Multiple references, act number proximity, no act when distant
- Empty text, deduplication, decimal articles, realistic court excerpt
- Non-Armenian text \u2192 empty, deterministic output

### 4.4 `prompt-armor` (shared, 237 lines)

**Exports**:

| Export | Purpose |
|---|---|
| `sandboxUserInput(label, text)` | Fenced data block + injection tag stripping |
| `ANTI_INJECTION_RULES` | 6 security directives (S1-S6) |
| `JSON_OUTPUT_SCHEMA_INSTRUCTION` | LegalAnswer JSON schema template |
| `validateJsonOutput(raw)` | Parse + validate + coerce LLM JSON output |
| `buildRepairPrompt(raw, errors)` | Generate repair instruction |
| `attemptJsonRepair(raw, errors, apiKey)` | One-pass LLM repair via gemini-2.5-flash-lite |

**Stripping targets**: `<system>`, `</system>`, `[INST]`, `[/INST]`, `<|im_start|>`, `<|im_end|>`, `={5,}` (fence breakers).

**Integration points**:
- `legal-chat/index.ts`: user messages sandboxed
- `ai-analyze/index.ts`: caseFacts + legalQuestion sandboxed, temperature=0.3
- `generate-document/index.ts`: contextText sandboxed

**Tests**: 11 cases in `prompt-armor.test.ts`:
- Fenced wrapping, injection stripping, fence-breaking prevention
- Null/empty handling, security directive presence
- Valid JSON parsing, markdown-wrapped JSON, trailing commas
- Non-JSON rejection, missing analysis field, type coercion, confidence clamping

---

## 5. CONFIGURATION

### 5.1 `supabase/config.toml` \u2014 Function Registration

All three new functions registered with `verify_jwt = false`:

```toml
[functions.legal-document-normalizer]
verify_jwt = false

[functions.legal-chunker]
verify_jwt = false

[functions.norm-ref-extractor]
verify_jwt = false
```

### 5.2 Related Existing Functions (with `verify_jwt = false`)

- `legal-practice-import`
- `kb-backfill-chunks`
- `legal-practice-enrich`
- `generate-embeddings`
- `vector-search`

---

## 6. TEST COVERAGE SUMMARY

| Component | Test File | Tests | Status |
|---|---|---|---|
| `legal-document-normalizer` | `normalizer.test.ts` | 4 | \u2705 All pass |
| `legal-chunker` | `chunker.test.ts` | 5 | \u2705 All pass |
| `norm-ref-extractor` | `norm-ref.test.ts` | 15 | \u2705 All pass |
| `prompt-armor` | `prompt-armor.test.ts` | 11 | \u2705 All pass |
| **Total** | | **35** | |

---

## 7. KNOWN LIMITATIONS & GAPS

| # | Gap | Impact | Mitigation |
|---|---|---|---|
| 1 | `judge_names` always `null` | No judge-level analytics | Requires NER model (not regex-feasible) |
| 2 | `date_effective` always `null` | Cannot distinguish adoption vs. enforcement dates | Needs separate regex patterns |
| 3 | `title_alt` always `null` | No transliterated titles | Low priority |
| 4 | `applied_articles` / `key_violations` / `decision_map` always `null` at ingestion | Require AI enrichment step | `legal-practice-enrich` function exists but not integrated into pipeline |
| 5 | No `doc_type` DB enum | Text column allows invalid values | Validate at application layer |
| 6 | No `chunk_type` DB enum | Text column allows invalid values | Validate at application layer |
| 7 | `legal_chunks.doc_id` has no FK constraint | Orphan chunks possible | Application-level consistency |
| 8 | No chunk-level embedding backfill pipeline | Existing chunks need embedding generation | `generate-embeddings` supports batch but no orchestrator |
| 9 | `verify_jwt = false` on all pipeline functions | No auth on ingestion endpoints | Acceptable for internal/admin-only pipelines |
| 10 | Hash function is non-cryptographic | Not suitable for integrity verification | Adequate for deduplication |

---

## 8. INTEGRATION NOTES (Edge Function Calls)

### 8.1 Complete Pipeline Invocation

```typescript
// Step 1: Normalize
const { document } = await supabase.functions.invoke("legal-document-normalizer", {
  body: { fileName: "code.txt", mimeType: "text/plain", rawText: text }
});

// Step 2: Chunk
const { chunks } = await supabase.functions.invoke("legal-chunker", {
  body: { document }
});

// Step 3: Extract norm refs (batch)
const { chunks: enrichedChunks } = await supabase.functions.invoke("norm-ref-extractor", {
  body: { chunks }
});

// Step 4: Generate embeddings (per chunk)
for (const chunk of enrichedChunks) {
  const { embedding } = await supabase.functions.invoke("generate-embeddings", {
    body: { text: chunk.chunk_text }
  });
  chunk.embedding = embedding;
}

// Step 5: Insert into legal_chunks
await supabase.from("legal_chunks").insert(
  enrichedChunks.map(c => ({
    doc_id: document.id,
    doc_type: document.doc_type,
    chunk_index: c.chunk_index,
    chunk_type: c.chunk_type,
    chunk_text: c.chunk_text,
    char_start: c.char_start,
    char_end: c.char_end,
    label: c.label,
    embedding: c.embedding,
    metadata: c.locator ? { locator: c.locator } : {},
    norm_refs: c.norm_refs,
    chunk_hash: c.chunk_hash,
  }))
);

// Step 6: Dual-RAG retrieval
const { data } = await supabase.rpc("search_legal_chunks", {
  query_embedding: queryVector,
  legislation_budget: 10,
  practice_budget: 10,
});
// data.legislation = [...], data.practice = [...]
```

### 8.2 Prompt Assembly with Security

```typescript
import { sandboxUserInput, ANTI_INJECTION_RULES } from "./_shared/prompt-armor.ts";

const systemPrompt = BASE_SYSTEM_PROMPT + ANTI_INJECTION_RULES;
const userMessage = sandboxUserInput("QUERY", userQuestion)
  + sandboxUserInput("LEGISLATION", legislationContext)
  + sandboxUserInput("PRACTICE", practiceContext);
```

---

## 9. FILE MANIFEST

| Path | Lines | Created/Modified |
|---|---|---|
| `supabase/functions/legal-document-normalizer/index.ts` | 566 | Created |
| `supabase/functions/legal-document-normalizer/normalizer.test.ts` | 158 | Created |
| `supabase/functions/legal-chunker/index.ts` | 540 | Created |
| `supabase/functions/legal-chunker/chunker.test.ts` | 164 | Created |
| `supabase/functions/norm-ref-extractor/index.ts` | 289 | Created |
| `supabase/functions/norm-ref-extractor/norm-ref.test.ts` | 186 | Created |
| `supabase/functions/_shared/prompt-armor.ts` | 237 | Created |
| `supabase/functions/_shared/prompt-armor.test.ts` | 110 | Created |
| `supabase/config.toml` | 52 | Modified |
| `supabase/functions/legal-chat/index.ts` | \u2014 | Modified |
| `supabase/functions/ai-analyze/index.ts` | \u2014 | Modified |
| `supabase/functions/ai-analyze/system.ts` | \u2014 | Modified |
| `supabase/functions/generate-document/index.ts` | \u2014 | Modified |
| `supabase/functions/generate-document/system-prompts.ts` | \u2014 | Modified |
| `docs/LEGAL_DOCUMENT_SCHEMA.md` | 435 | Reference doc |
| DB migration: `legal_chunks` table + indexes + RLS + RPC | \u2014 | Executed |

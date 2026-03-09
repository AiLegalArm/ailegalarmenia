# KB V2 Pipeline - Deployment Checklist

## Overview
Implements Knowledge Base chunking + safe retrieval + UI "load chunk" flow for legal practice documents.

## Files Changed/Added

### Edge Functions
- `supabase/functions/kb-search/index.ts` - POST endpoint for KB document search
- `supabase/functions/kb-get-chunk/index.ts` - GET/POST endpoint for lazy chunk loading  
- `supabase/functions/kb-backfill-chunks/index.ts` - Admin endpoint to backfill chunks
- `supabase/functions/ai-analyze/index.ts` - Updated to use V2 KB formatter
- `supabase/functions/ai-analyze/chunker.test.ts` - Unit tests for chunker

### Frontend
- `src/hooks/useLegalPracticeKB.ts` - React hook for KB search and chunk management
- `src/components/kb/KBSearchPanel.tsx` - UI panel for KB search with chunk loading

### Existing (used)
- `supabase/functions/ai-analyze/legal-practice-kb.ts` - V2 formatting functions

## Database Schema
The `legal_practice_kb` table already has the required V2 columns:
- `content_chunks` (text[]) - Chunked document text
- `chunk_index_meta` (jsonb) - Array of {idx, start, end, label}
- `decision_map` (jsonb) - {legal_question, holding, tests_or_criteria, ...}
- `key_paragraphs` (jsonb) - Array of {tag, chunkIdx, excerpt}

## Deployment Steps

### 1. Deploy Edge Functions (Already Done)
```bash
# Functions are deployed automatically:
# - kb-search
# - kb-get-chunk  
# - kb-backfill-chunks
# - ai-analyze (updated)
```

### 2. Backfill Existing Documents
Run the backfill endpoint as admin to populate chunks for existing documents:

```bash
curl -X POST \
  'https://nrmmgcgwriyrlbcpoqvk.supabase.co/functions/v1/kb-backfill-chunks' \
  -H 'Authorization: Bearer <ADMIN_JWT_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"dryRun": true}'
```

First run with `dryRun: true` to see what would be processed, then:

```bash
curl -X POST \
  'https://nrmmgcgwriyrlbcpoqvk.supabase.co/functions/v1/kb-backfill-chunks' \
  -H 'Authorization: Bearer <ADMIN_JWT_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"chunkSize": 8000}'
```

### 3. Integration Points

#### Using KBSearchPanel in Case Analysis UI
```tsx
import { KBSearchPanel } from "@/components/kb/KBSearchPanel";

function CaseAnalysisPage() {
  const handleInsertReference = (docId: string, chunkIndex: number, text: string) => {
    // Insert reference into dedicated KB references area
    console.log(`KB Reference: DocID=${docId}, Chunk=${chunkIndex}`);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>Case Analysis Content</div>
      <KBSearchPanel onInsertReference={handleInsertReference} />
    </div>
  );
}
```

## Critical Constraints Enforced

1. **KB is REFERENCE-ONLY** - All KB content labeled as "\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"
2. **Never mixed with case facts** - Separate section in AI prompts
3. **DocID + Chunk tracking** - Every chunk includes identification
4. **Plain text output** - No Markdown in AI injection (numbered lists only)

## API Reference

### POST /kb-search
```json
{
  "query": "string",
  "category": "criminal" | "civil" | "administrative" | "echr" | null,
  "limitDocs": 5,
  "limitChunksPerDoc": 3
}
```

Response:
```json
{
  "documents": [{
    "id": "uuid",
    "title": "string",
    "practice_category": "criminal",
    "court_type": "cassation",
    "outcome": "rejected",
    "decision_map": {...},
    "key_paragraphs": [...],
    "top_chunks": [{"chunkIndex": 0, "text": "..."}],
    "totalChunks": 12
  }]
}
```

### POST /kb-get-chunk
```json
{
  "docId": "uuid",
  "chunkIndex": 0
}
```

Response:
```json
{
  "id": "uuid",
  "title": "string", 
  "chunkIndex": 0,
  "totalChunks": 12,
  "text": "...",
  "meta": {"idx": 0, "start": 0, "end": 8000}
}
```

## Tests
Run chunker tests:
```bash
deno test --allow-env supabase/functions/ai-analyze/chunker.test.ts
```

All 4 tests pass:
- splits text into chunks correctly
- reconstructs original text
- handles empty text  
- handles small text

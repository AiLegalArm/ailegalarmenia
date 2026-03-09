
-- =====================================================
-- Hybrid search indexes: fill gaps for keyword + filter
-- =====================================================

-- 1. legal_chunks: FTS on chunk_text for keyword search
--    Rationale: enables ts_rank scoring when searching chunk content
CREATE INDEX IF NOT EXISTS idx_legal_chunks_text_fts
  ON public.legal_chunks
  USING gin (to_tsvector('simple', chunk_text))
  WHERE (is_active = true);

-- 2. legal_chunks: chunk_type filter for section-specific retrieval
--    Rationale: allows filtering "only reasoning chunks" or "only facts"
CREATE INDEX IF NOT EXISTS idx_legal_chunks_chunk_type
  ON public.legal_chunks
  USING btree (chunk_type)
  WHERE (is_active = true);

-- 3. legal_chunks: label for article-level lookups
--    Rationale: enables direct lookup by article label (e.g. "Հoдвac 391")
CREATE INDEX IF NOT EXISTS idx_legal_chunks_label
  ON public.legal_chunks
  USING btree (label)
  WHERE (label IS NOT NULL AND is_active = true);

-- 4. legal_documents: FTS on title for keyword search
--    Rationale: search_legal_chunks RPC uses ILIKE on titles; FTS is faster
CREATE INDEX IF NOT EXISTS idx_legal_documents_title_fts
  ON public.legal_documents
  USING gin (to_tsvector('simple', title))
  WHERE (is_active = true);

-- 5. legal_documents: date_adopted for temporal filtering
--    Rationale: RAG temporal versioning filters by reference date
CREATE INDEX IF NOT EXISTS idx_legal_documents_date_adopted
  ON public.legal_documents
  USING btree (date_adopted)
  WHERE (date_adopted IS NOT NULL);

-- 6. legal_practice_kb: decision_date for temporal queries
--    Rationale: filter practice by decision date range
CREATE INDEX IF NOT EXISTS idx_legal_practice_kb_decision_date
  ON public.legal_practice_kb
  USING btree (decision_date)
  WHERE (decision_date IS NOT NULL AND is_active = true);

-- 7. legal_practice_kb_chunks: FTS on chunk_text
--    Rationale: keyword search within practice document chunks
CREATE INDEX IF NOT EXISTS idx_lp_kb_chunks_text_fts
  ON public.legal_practice_kb_chunks
  USING gin (to_tsvector('simple', chunk_text));

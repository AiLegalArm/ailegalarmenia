-- P1 HNSW expression indexes on embedding::halfvec(3072)
-- Retry: only 4 rows have embeddings, should be instant

CREATE INDEX IF NOT EXISTS idx_kb_embedding_hnsw_half
ON public.knowledge_base
USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_practice_embedding_hnsw_half
ON public.legal_practice_kb
USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw_half
ON public.legal_chunks
USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
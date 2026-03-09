
-- RPC to fetch full chunk_text for a specific chunk by kb_id and chunk_index
CREATE OR REPLACE FUNCTION public.get_kb_chunk_full(
  p_kb_id uuid,
  p_chunk_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'kb_id', c.kb_id,
    'chunk_index', c.chunk_index,
    'label', c.label,
    'chunk_type', c.chunk_type,
    'chunk_text', c.chunk_text,
    'char_start', c.char_start,
    'char_end', c.char_end
  ) INTO result
  FROM knowledge_base_chunks c
  WHERE c.kb_id = p_kb_id
    AND c.chunk_index = p_chunk_index
    AND c.is_active = true;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Chunk not found';
  END IF;

  RETURN result;
END;
$$;

-- ============================================================
-- Migration 028c: Set vector dimensions to 1024 + HNSW index
-- 1024 dims via MRL truncation — excellent quality, within limits
-- ============================================================

-- Drop all vector indexes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('legal_document_chunks','legal_requirements','regulations')
      AND indexdef ILIKE '%vector%'
  LOOP
    EXECUTE 'DROP INDEX IF EXISTS ' || r.indexname;
  END LOOP;
END$$;

-- Drop and recreate embedding columns at 1024 dims
ALTER TABLE public.legal_document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.legal_document_chunks ADD COLUMN embedding VECTOR(1024);

ALTER TABLE public.legal_requirements DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.legal_requirements ADD COLUMN embedding VECTOR(1024);

-- Drop and recreate search function for 1024 dims
DROP FUNCTION IF EXISTS search_legal_chunks(vector,double precision,integer,text);

CREATE OR REPLACE FUNCTION search_legal_chunks(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.3,
  match_count     INT   DEFAULT 40,
  filter_area     TEXT  DEFAULT NULL
)
RETURNS TABLE (
  chunk_id           UUID,
  document_id        UUID,
  document_title     TEXT,
  area               TEXT,
  content            TEXT,
  source_document_id UUID,
  page_numbers       INT[],
  similarity         FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    d.id,
    d.document_title,
    d.area,
    c.content,
    c.document_id,
    c.page_numbers,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.legal_document_chunks c
  JOIN public.legal_documents d ON d.id = c.document_id
  WHERE
    c.embedding IS NOT NULL
    AND vector_dims(c.embedding) = 1024
    AND d.status = 'processed'
    AND (filter_area IS NULL OR d.area = filter_area)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- HNSW index on chunks
CREATE INDEX legal_document_chunks_embedding_hnsw_idx
  ON public.legal_document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Update delete_wrong_dim_chunks helper
CREATE OR REPLACE FUNCTION public.delete_wrong_dim_chunks()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM public.legal_document_chunks
  WHERE embedding IS NOT NULL AND vector_dims(embedding) != 1024;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Clear chunks and reset documents for reprocessing
DELETE FROM public.legal_document_chunks;
DELETE FROM public.industry_requirements_cache;

UPDATE public.legal_documents
SET status = 'uploaded', processed_at = NULL, chunk_count = NULL,
    error_message = 'Re-processing required — switched to 1024-dim embeddings';

-- Verify
SELECT COUNT(*) AS chunks FROM public.legal_document_chunks;
SELECT document_title, status FROM public.legal_documents ORDER BY document_title;

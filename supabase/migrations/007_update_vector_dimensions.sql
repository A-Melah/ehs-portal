-- ============================================================
-- Migration 007: Update vector dimensions 768 → 3072
-- Required because gemini-embedding-001 produces 3072-dim vectors
-- (replacing deprecated text-embedding-004 which used 768-dim)
-- IVFFlat cannot handle >2000 dims so indexes are rebuilt as HNSW
-- ============================================================

-- Drop all vector indexes first (can't alter column with active index)
DROP INDEX IF EXISTS regulations_embedding_idx;
DROP INDEX IF EXISTS legal_requirements_embedding_idx;
DROP INDEX IF EXISTS legal_document_chunks_embedding_idx;

-- Also drop by the auto-generated names pgvector uses
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE indexdef ILIKE '%vector_cosine_ops%'
  LOOP
    EXECUTE 'DROP INDEX IF EXISTS ' || r.indexname;
  END LOOP;
END$$;

-- ── Alter embedding columns ───────────────────────────────────────────────────

ALTER TABLE public.regulations
  ALTER COLUMN embedding TYPE VECTOR(768);

ALTER TABLE public.legal_requirements
  ALTER COLUMN embedding TYPE VECTOR(768);

ALTER TABLE public.legal_document_chunks
  ALTER COLUMN embedding TYPE VECTOR(768);

-- ── Recreate indexes with new dimensions ─────────────────────────────────────
-- Note: IVFFlat lists value should be ~sqrt(row_count); 100 is fine for now.

CREATE INDEX ON public.regulations USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX ON public.legal_requirements USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX ON public.legal_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── Update search functions to use new dimensions ────────────────────────────

CREATE OR REPLACE FUNCTION search_regulations(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.7,
  match_count     INT DEFAULT 3
)
RETURNS TABLE (
  id            UUID,
  statute_title TEXT,
  section       TEXT,
  content       TEXT,
  similarity    FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id, r.statute_title, r.section, r.content,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.regulations r
  WHERE 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_legal_requirements(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.6,
  match_count     INT DEFAULT 5
)
RETURNS TABLE (
  id                   UUID,
  area                 TEXT,
  legal_document       TEXT,
  source_section       TEXT,
  specific_requirement TEXT,
  compliance_measures  TEXT,
  similarity           FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id, r.area, r.legal_document, r.source_section,
    r.specific_requirement, r.compliance_measures,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.legal_requirements r
  WHERE 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_legal_chunks(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count     INT DEFAULT 5,
  filter_area     TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id       UUID,
  document_id    UUID,
  document_title TEXT,
  area           TEXT,
  content        TEXT,
  page_numbers   INT[],
  similarity     FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, d.id, d.document_title, d.area,
    c.content, c.page_numbers,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.legal_document_chunks c
  JOIN public.legal_documents d ON d.id = c.document_id
  WHERE
    d.status = 'processed'
    AND (filter_area IS NULL OR d.area = filter_area)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── Clear any existing embeddings (they used the wrong dimensions) ────────────
UPDATE public.regulations        SET embedding = NULL;
UPDATE public.legal_requirements SET embedding = NULL;
-- legal_document_chunks rows will be re-created when PDFs are reprocessed

-- Note: Re-run scripts/seed-embeddings.ts after this migration to regenerate
-- embeddings for regulations and legal_requirements using gemini-embedding-001.

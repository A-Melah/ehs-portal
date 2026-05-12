-- ============================================================
-- Migration 019: Doc fingerprint function for cache invalidation
-- ============================================================

-- Add updated_at to legal_document_chunks first (needed by fingerprint function)
ALTER TABLE public.legal_document_chunks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger to auto-update updated_at on chunk changes
CREATE OR REPLACE FUNCTION public.update_chunk_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS chunks_updated_at ON public.legal_document_chunks;
CREATE TRIGGER chunks_updated_at
  BEFORE UPDATE ON public.legal_document_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_chunk_timestamp();

-- Computes a fingerprint of all current chunks
-- Used to detect when documents have changed since last cache generation
CREATE OR REPLACE FUNCTION public.compute_doc_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT md5(
    string_agg(id::text || updated_at::text, ',' ORDER BY id)
  )
  FROM public.legal_document_chunks
  WHERE content IS NOT NULL AND length(content) > 0;
$$;

-- Check if cache is valid for a given industry/sub-sector
CREATE OR REPLACE FUNCTION public.is_cache_valid(
  p_industry_id   UUID,
  p_sub_sector_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_cached_fingerprint TEXT;
  v_current_fingerprint TEXT;
BEGIN
  SELECT doc_fingerprint INTO v_cached_fingerprint
  FROM public.industry_requirements_cache
  WHERE industry_id = p_industry_id
    AND (sub_sector_id = p_sub_sector_id OR (sub_sector_id IS NULL AND p_sub_sector_id IS NULL));

  IF v_cached_fingerprint IS NULL THEN
    RETURN FALSE;
  END IF;

  v_current_fingerprint := public.compute_doc_fingerprint();
  RETURN v_cached_fingerprint = v_current_fingerprint;
END;
$$;



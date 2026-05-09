-- ============================================================
-- Migration 006: Legal Documents Upload & Processing
-- ============================================================

-- ─── Legal Documents Registry ─────────────────────────────────────────────────
-- Tracks each uploaded PDF and its processing status
CREATE TABLE public.legal_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL UNIQUE,     -- path in Supabase Storage
  public_url      TEXT NOT NULL,
  area            TEXT NOT NULL             -- 'Safety' | 'Health' | 'Environment'
                  CHECK (area IN ('Safety', 'Health', 'Environment')),
  document_title  TEXT NOT NULL,            -- e.g. "Factories Act 2004"
  file_size_bytes BIGINT,
  page_count      INT,
  status          TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
  chunk_count     INT DEFAULT 0,            -- how many chunks were extracted
  error_message   TEXT,
  uploaded_by     UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

-- ─── Legal Document Chunks ────────────────────────────────────────────────────
-- Each chunk is a section of text from the PDF with its embedding
CREATE TABLE public.legal_document_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  content         TEXT NOT NULL,            -- raw text chunk
  page_numbers    INT[],                    -- which pages this chunk spans
  embedding       VECTOR(768),              -- gemini-embedding-001
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Vector index for semantic search
CREATE INDEX ON public.legal_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.legal_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_chunks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for RAG search)
CREATE POLICY "Authenticated users can view legal documents"
  ON public.legal_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view chunks"
  ON public.legal_document_chunks FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage legal documents"
  ON public.legal_documents FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'ehs_manager'))
  );

CREATE POLICY "Admins can manage chunks"
  ON public.legal_document_chunks FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'ehs_manager'))
  );

-- ─── Vector Search Function ────────────────────────────────────────────────────
-- Searches across all document chunks for the most relevant legal context
CREATE OR REPLACE FUNCTION search_legal_chunks(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count     INT DEFAULT 5,
  filter_area     TEXT DEFAULT NULL         -- optional: 'Safety' | 'Health' | 'Environment'
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
    c.id          AS chunk_id,
    d.id          AS document_id,
    d.document_title,
    d.area,
    c.content,
    c.page_numbers,
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

-- ─── Storage bucket for legal PDFs ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('legal-documents', 'legal-documents', false)  -- private bucket
  ON CONFLICT (id) DO NOTHING;

-- Only authenticated managers/admins can upload
CREATE POLICY "Managers can upload legal documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'legal-documents'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'ehs_manager'))
  );

-- All authenticated users can read (for PDF viewer / download)
CREATE POLICY "Authenticated users can read legal documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'legal-documents');

-- Only admins can delete
CREATE POLICY "Admins can delete legal documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

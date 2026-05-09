-- ============================================================
-- Migration 006: Legal Document Upload & Chunked Embedding System
-- Run in Supabase SQL Editor after 005
-- ============================================================

-- ─── Legal Documents (the 12 PDF source files) ───────────────────────────────
CREATE TABLE public.legal_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,            -- "Factories Act 2004"
  short_name      TEXT NOT NULL,            -- "Factories Act"
  area            TEXT NOT NULL             -- 'Safety' | 'Health' | 'Environment' | 'All'
                  CHECK (area IN ('Safety', 'Health', 'Environment', 'All')),
  file_name       TEXT NOT NULL,            -- original filename
  storage_path    TEXT NOT NULL,            -- Supabase Storage path
  file_size_bytes INT,
  page_count      INT,
  chunk_count     INT DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'ready', 'error')),
  error_message   TEXT,
  uploaded_by     UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Document Chunks (each chunk gets its own embedding) ─────────────────────
-- Replaces the generic `regulations` table for RAG purposes.
-- Each chunk = one section or logical paragraph from the PDF.
CREATE TABLE public.legal_document_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  page_number     INT,
  section_title   TEXT,          -- extracted heading if any (e.g. "Section 35")
  content         TEXT NOT NULL, -- the raw text of this chunk
  embedding       VECTOR(768),   -- gemini-embedding-001 output
  token_count     INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Vector index for chunk retrieval
CREATE INDEX ON public.legal_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.legal_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view legal documents"
  ON public.legal_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers and admins can upload legal documents"
  ON public.legal_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin')
    )
  );

CREATE POLICY "Managers and admins can update legal documents"
  ON public.legal_documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin')
    )
  );

CREATE POLICY "Managers and admins can delete legal documents"
  ON public.legal_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin')
    )
  );

CREATE POLICY "Authenticated users can view chunks"
  ON public.legal_document_chunks FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert chunks"
  ON public.legal_document_chunks FOR INSERT TO authenticated WITH CHECK (true);

-- ─── Vector search function for document chunks ───────────────────────────────
CREATE OR REPLACE FUNCTION search_legal_chunks(
  query_embedding  VECTOR(768),
  match_threshold  FLOAT DEFAULT 0.65,
  match_count      INT   DEFAULT 6
)
RETURNS TABLE (
  chunk_id        UUID,
  document_id     UUID,
  document_name   TEXT,
  section_title   TEXT,
  content         TEXT,
  page_number     INT,
  similarity      FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id       AS chunk_id,
    c.document_id,
    d.name     AS document_name,
    c.section_title,
    c.content,
    c.page_number,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.legal_document_chunks c
  JOIN public.legal_documents d ON d.id = c.document_id
  WHERE
    c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── Storage bucket for legal PDFs ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('legal-documents', 'legal-documents', false)
  ON CONFLICT (id) DO NOTHING;

-- Only authenticated managers/admins can upload
CREATE POLICY "Managers can upload legal documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'legal-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin')
    )
  );

-- Authenticated users can read (for processing)
CREATE POLICY "Authenticated users can read legal documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'legal-documents');

-- Managers can delete
CREATE POLICY "Managers can delete legal documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin')
    )
  );

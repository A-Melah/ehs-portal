-- ============================================================
-- Digital EHS Compliance Portal — Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable pgvector for AI embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── USERS (extends Supabase auth.users) ─────────────────────────────────────
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'inspector'
                CHECK (role IN ('inspector', 'ehs_manager', 'admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'inspector')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── ASSETS ───────────────────────────────────────────────────────────────────
CREATE TABLE public.assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_number    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  location      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'maintenance')),
  qr_code       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── REGULATIONS (Legal Registry with Vector Embeddings) ─────────────────────
CREATE TABLE public.regulations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_title  TEXT NOT NULL,
  section        TEXT NOT NULL,
  content        TEXT NOT NULL,
  embedding      VECTOR(768),  -- text-embedding-004 dimensions
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast vector similarity search
CREATE INDEX ON public.regulations
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── CHECKLIST TEMPLATES ─────────────────────────────────────────────────────
CREATE TABLE public.checklist_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type     TEXT NOT NULL,
  question_text  TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'General',
  is_critical    BOOLEAN DEFAULT FALSE,
  legal_ref_id   UUID REFERENCES public.regulations(id),
  order_index    INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INSPECTIONS ─────────────────────────────────────────────────────────────
CREATE TABLE public.inspections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES public.assets(id),
  inspector_id      UUID NOT NULL REFERENCES public.profiles(id),
  compliance_score  NUMERIC(5,2) DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'flagged')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RESPONSES ────────────────────────────────────────────────────────────────
CREATE TABLE public.responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id    UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES public.checklist_templates(id),
  value            BOOLEAN NOT NULL,         -- true = Pass, false = Fail
  media_url        TEXT,
  ai_verdict       TEXT,
  ai_breach_level  TEXT DEFAULT 'none'
                   CHECK (ai_breach_level IN ('none', 'minor', 'moderate', 'critical')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update only their own
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Assets: all authenticated users can read
CREATE POLICY "Assets are viewable by authenticated users"
  ON public.assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can manage assets"
  ON public.assets FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin'))
  );

-- Regulations: all can read
CREATE POLICY "Regulations are viewable by authenticated users"
  ON public.regulations FOR SELECT TO authenticated USING (true);

-- Checklist templates: all can read
CREATE POLICY "Templates are viewable by authenticated users"
  ON public.checklist_templates FOR SELECT TO authenticated USING (true);

-- Inspections: inspectors see their own; managers see all
CREATE POLICY "Inspectors see own inspections"
  ON public.inspections FOR SELECT TO authenticated
  USING (
    inspector_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin'))
  );

CREATE POLICY "Inspectors can create inspections"
  ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (inspector_id = auth.uid());

CREATE POLICY "Inspectors can update own inspections"
  ON public.inspections FOR UPDATE TO authenticated
  USING (inspector_id = auth.uid());

-- Responses: follow inspection access
CREATE POLICY "Responses viewable with inspection access"
  ON public.responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_id
      AND (
        i.inspector_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin'))
      )
    )
  );

CREATE POLICY "Inspectors can create responses"
  ON public.responses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Inspectors can update responses"
  ON public.responses FOR UPDATE TO authenticated USING (true);

-- ─── HELPER FUNCTION: Vector Search for Legal Context ────────────────────────
CREATE OR REPLACE FUNCTION search_regulations(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  statute_title TEXT,
  section TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.statute_title,
    r.section,
    r.content,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.regulations r
  WHERE 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── SEED: Sample Checklist Templates ────────────────────────────────────────
INSERT INTO public.checklist_templates (asset_type, question_text, category, is_critical, order_index) VALUES
  -- Forklift
  ('Forklift', 'Are all forklift lights (headlights, tail lights, warning lights) functional?', 'Electrical', true, 1),
  ('Forklift', 'Is the forklift horn operational?', 'Safety Devices', true, 2),
  ('Forklift', 'Are the forks free from visible cracks or deformations?', 'Structural', true, 3),
  ('Forklift', 'Is the seatbelt present and in working condition?', 'Operator Safety', true, 4),
  ('Forklift', 'Is the hydraulic fluid level within acceptable range?', 'Mechanical', false, 5),
  ('Forklift', 'Are the tires in good condition with adequate pressure?', 'Mechanical', false, 6),
  ('Forklift', 'Is the load capacity plate visible and legible?', 'Documentation', false, 7),
  -- Fire Pump
  ('Fire Pump', 'Does the fire pump start within 10 seconds of activation?', 'Performance', true, 1),
  ('Fire Pump', 'Is the pump free from visible leaks (oil, water, fuel)?', 'Integrity', true, 2),
  ('Fire Pump', 'Is the fuel level above 75% of tank capacity?', 'Readiness', true, 3),
  ('Fire Pump', 'Are all gauges (pressure, flow) reading within normal range?', 'Performance', false, 4),
  ('Fire Pump', 'Is the weekly test run log up to date?', 'Documentation', false, 5),
  -- Fire Extinguisher
  ('Fire Extinguisher', 'Is the pressure indicator in the green zone?', 'Readiness', true, 1),
  ('Fire Extinguisher', 'Is the safety pin and tamper seal intact?', 'Integrity', true, 2),
  ('Fire Extinguisher', 'Is the extinguisher within its service date?', 'Compliance', true, 3),
  ('Fire Extinguisher', 'Is the extinguisher accessible and unobstructed?', 'Placement', false, 4),
  -- Generator
  ('Generator', 'Is the fuel level above 50%?', 'Readiness', false, 1),
  ('Generator', 'Are all exhaust components secure and leak-free?', 'Environmental', true, 2),
  ('Generator', 'Does the generator transfer to mains power seamlessly?', 'Performance', true, 3),
  ('Generator', 'Is the battery in good condition (no corrosion)?', 'Electrical', false, 4);

-- ─── SEED: Sample Assets ─────────────────────────────────────────────────────
INSERT INTO public.assets (tag_number, name, type, location, status) VALUES
  ('FKL-001', 'Forklift Alpha', 'Forklift', 'Warehouse A', 'active'),
  ('FKL-002', 'Forklift Beta',  'Forklift', 'Warehouse B', 'active'),
  ('FP-001',  'Fire Pump Main', 'Fire Pump', 'Pump House', 'active'),
  ('FE-001',  'Fire Extinguisher - Gate 1', 'Fire Extinguisher', 'Main Gate', 'active'),
  ('FE-002',  'Fire Extinguisher - Office Block', 'Fire Extinguisher', 'Admin Block', 'active'),
  ('GEN-001', 'Main Generator', 'Generator', 'Generator House', 'active');

-- ─── SEED: Sample Regulations ────────────────────────────────────────────────
-- Note: Embeddings must be generated via the seed script or admin panel
INSERT INTO public.regulations (statute_title, section, content) VALUES
  (
    'Factories Act Cap F1 LFN 2004',
    'Section 16 - Lighting',
    'Every factory shall be provided with sufficient and suitable lighting, natural or artificial, in every part thereof where persons are working or passing. All glazed windows and skylights used for the lighting of workrooms shall be kept clean. Effective provision shall be made for the prevention of glare.'
  ),
  (
    'Factories Act Cap F1 LFN 2004',
    'Section 26 - Lifting Machines and Equipment',
    'All parts and working gear of every lifting machine shall be of good construction, sound material, adequate strength and free from patent defect. Every lifting machine shall be thoroughly examined by a competent person at least once every 12 months. The safe working load shall be plainly marked on every lifting machine.'
  ),
  (
    'NESREA Regulation 2011',
    'Regulation 35 - Equipment Maintenance',
    'Every occupier shall ensure that all equipment and machinery in their facility is maintained in good working order at all times. Records of maintenance activities shall be kept for a minimum of five years and made available to inspectors upon request.'
  ),
  (
    'Factories Act Cap F1 LFN 2004',
    'Section 30 - Fire Precautions',
    'Every factory shall be provided with adequate means of escape in case of fire for the persons employed therein. Fire fighting equipment shall be maintained in an efficient state and shall be readily accessible. Fire drills shall be conducted at least twice per year.'
  );

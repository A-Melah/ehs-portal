-- ============================================================
-- Migration 018: Industry-based audit system
-- Replaces facility sections with industries + sub-sectors
-- ============================================================

-- ── 1. Industries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.industries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,  -- emoji icon
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Sub-sectors ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sub_sectors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_id UUID NOT NULL REFERENCES public.industries(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(industry_id, slug)
);

-- ── 3. Requirements cache ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.industry_requirements_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_id     UUID NOT NULL REFERENCES public.industries(id) ON DELETE CASCADE,
  sub_sector_id   UUID REFERENCES public.sub_sectors(id) ON DELETE CASCADE,
  requirements    JSONB NOT NULL DEFAULT '[]',
  doc_fingerprint TEXT NOT NULL,
  generated_at    TIMESTAMPTZ DEFAULT now(),
  req_count       INT DEFAULT 0,
  UNIQUE(industry_id, sub_sector_id)
);

-- ── 4. Add detected_industries to legal_document_chunks ───────────────────────
ALTER TABLE public.legal_document_chunks
  ADD COLUMN IF NOT EXISTS detected_industries TEXT[] DEFAULT '{}';

-- ── 5. Add detected_industries to legal_documents ─────────────────────────────
ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS detected_industries TEXT[] DEFAULT '{}';

-- ── 6. Update compliance_audits — replace sections with industry/sub-sector ───
ALTER TABLE public.compliance_audits
  ADD COLUMN IF NOT EXISTS industry_id   UUID REFERENCES public.industries(id),
  ADD COLUMN IF NOT EXISTS sub_sector_id UUID REFERENCES public.sub_sectors(id),
  ADD COLUMN IF NOT EXISTS industry_name   TEXT,
  ADD COLUMN IF NOT EXISTS sub_sector_name TEXT;

-- ── 7. Update legal_requirements — clear seeded data, keep as cache store ──────
-- Drop the FK constraint first so we can delete requirements freely
ALTER TABLE public.audit_line_items DROP CONSTRAINT IF EXISTS audit_line_items_requirement_id_fkey;

-- Clear all existing line items (they reference old requirements)
DELETE FROM public.audit_line_items;

-- Now safe to delete requirements
DELETE FROM public.legal_requirements;

-- ── 8. Add industry columns to legal_requirements ────────────────────────────
ALTER TABLE public.legal_requirements
  ADD COLUMN IF NOT EXISTS industry_id   UUID REFERENCES public.industries(id),
  ADD COLUMN IF NOT EXISTS sub_sector_id UUID REFERENCES public.sub_sectors(id),
  ADD COLUMN IF NOT EXISTS detected_industries TEXT[] DEFAULT '{}';

-- Drop the old applies_to_sections constraint and column
ALTER TABLE public.legal_requirements
  DROP COLUMN IF EXISTS applies_to_sections;

-- ── 9. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_industry_req_cache_lookup
  ON public.industry_requirements_cache(industry_id, sub_sector_id);

CREATE INDEX IF NOT EXISTS idx_chunks_industries
  ON public.legal_document_chunks USING GIN(detected_industries);

CREATE INDEX IF NOT EXISTS idx_legal_reqs_industry
  ON public.legal_requirements(industry_id, sub_sector_id);

-- ── 10. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_requirements_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "industries_read" ON public.industries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sub_sectors_read" ON public.sub_sectors
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cache_read" ON public.industry_requirements_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cache_write" ON public.industry_requirements_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 11. Seed industries ───────────────────────────────────────────────────────
INSERT INTO public.industries (name, slug, description, icon) VALUES
  ('Oil & Gas',              'oil-gas',          'Petroleum exploration, production, refining and distribution',     '🛢️'),
  ('Manufacturing',          'manufacturing',    'Industrial production of goods and products',                      '🏭'),
  ('Construction',           'construction',     'Building, civil engineering and infrastructure development',       '🏗️'),
  ('Mining',                 'mining',           'Extraction of solid minerals, coal and quarrying',                 '⛏️'),
  ('Healthcare',             'healthcare',       'Medical services, pharmaceutical and laboratory operations',       '🏥'),
  ('Logistics & Warehousing','logistics',        'Freight, transportation, port operations and warehousing',        '🚛'),
  ('Power & Utilities',      'power-utilities',  'Electricity generation, water treatment and gas distribution',    '⚡'),
  ('Agriculture',            'agriculture',      'Farming, food processing and agro-allied industries',             '🌾'),
  ('Hospitality & Food Service','hospitality',   'Hotels, restaurants, catering and event management',              '🏨'),
  ('Maritime',               'maritime',         'Shipping, offshore operations and port management',               '⚓'),
  ('Telecommunications',     'telecommunications','Network infrastructure, towers and data centres',               '📡'),
  ('Financial Services',     'financial',        'Banking, insurance and financial institution operations',         '🏦')
ON CONFLICT (slug) DO NOTHING;

-- ── 12. Seed sub-sectors ──────────────────────────────────────────────────────
-- Oil & Gas
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Upstream / Exploration',     'upstream',        'Oil and gas exploration and production'),
  ('Midstream',                  'midstream',       'Pipeline, storage and transportation of oil and gas'),
  ('Downstream / Refining',      'downstream',      'Refining, petrochemicals and product distribution'),
  ('Drilling Operations',        'drilling',        'Onshore and offshore drilling activities'),
  ('LNG & Gas Processing',       'lng-processing',  'Liquefied natural gas and gas treatment plants')
) AS sub(name, slug, descr)
WHERE industries.slug = 'oil-gas'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Manufacturing
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Food & Beverage',            'food-beverage',   'Production of food and drink products'),
  ('Chemical & Pharmaceutical',  'chemical-pharma', 'Chemical and drug manufacturing'),
  ('Soap & Detergent',           'soap-detergent',  'Soap, detergent and personal care products'),
  ('Textile & Garment',          'textile',         'Fabric, clothing and garment manufacturing'),
  ('Cement & Building Materials','cement',          'Cement, concrete and construction materials'),
  ('Plastics & Rubber',          'plastics-rubber', 'Plastic and rubber product manufacturing'),
  ('Metal & Steel',              'metal-steel',     'Metal fabrication, steel and aluminium'),
  ('Automotive Assembly',        'automotive',      'Vehicle assembly and parts manufacturing'),
  ('Electronics & Appliances',   'electronics',     'Electronic components and appliance manufacturing')
) AS sub(name, slug, descr)
WHERE industries.slug = 'manufacturing'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Construction
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Building Construction',      'building',        'Residential and commercial building projects'),
  ('Civil Engineering',          'civil',           'Roads, bridges and infrastructure projects'),
  ('Marine Construction',        'marine',          'Offshore platforms, jetties and marine structures'),
  ('Demolition',                 'demolition',      'Controlled demolition and site clearance')
) AS sub(name, slug, descr)
WHERE industries.slug = 'construction'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Mining
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Solid Minerals',             'solid-minerals',  'Extraction of iron ore, limestone and other minerals'),
  ('Coal Mining',                'coal',            'Coal exploration and extraction'),
  ('Quarrying',                  'quarrying',       'Stone, sand and gravel quarrying'),
  ('Artisanal Mining',           'artisanal',       'Small-scale and artisanal mining operations')
) AS sub(name, slug, descr)
WHERE industries.slug = 'mining'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Healthcare
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Hospital & Clinic',          'hospital',        'Inpatient and outpatient medical facilities'),
  ('Pharmaceutical Manufacturing','pharma-mfg',     'Drug and medicine manufacturing'),
  ('Medical Devices',            'medical-devices', 'Medical equipment production and supply'),
  ('Laboratory Services',        'laboratory',      'Diagnostic and research laboratories')
) AS sub(name, slug, descr)
WHERE industries.slug = 'healthcare'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Logistics
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Road Freight',               'road-freight',    'Truck and road-based cargo transport'),
  ('Port & Terminal Operations', 'port-terminal',   'Seaport loading, offloading and terminal management'),
  ('Warehousing & Distribution', 'warehousing',     'Storage facilities and distribution centres'),
  ('Aviation Ground Handling',   'aviation',        'Airport cargo and ground handling services')
) AS sub(name, slug, descr)
WHERE industries.slug = 'logistics'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Power & Utilities
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Electricity Generation',     'power-gen',       'Thermal, hydro and renewable power plants'),
  ('Water Treatment & Supply',   'water-treatment', 'Water production, treatment and distribution'),
  ('Gas Distribution',           'gas-distribution','Natural gas pipeline networks and distribution')
) AS sub(name, slug, descr)
WHERE industries.slug = 'power-utilities'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Agriculture
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Crop & Livestock Farming',   'farming',         'Large-scale crop and animal husbandry'),
  ('Food Processing',            'food-processing', 'Post-harvest processing and packaging'),
  ('Agro-Chemical',              'agro-chemical',   'Fertilizer and pesticide manufacturing')
) AS sub(name, slug, descr)
WHERE industries.slug = 'agriculture'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Hospitality
INSERT INTO public.sub_sectors (industry_id, name, slug, description)
SELECT id, sub.name, sub.slug, sub.descr FROM public.industries,
(VALUES
  ('Hotels & Resorts',           'hotels',          'Accommodation and resort operations'),
  ('Restaurant & Catering',      'restaurants',     'Food service and catering operations'),
  ('Event Management',           'events',          'Venue management and event operations')
) AS sub(name, slug, descr)
WHERE industries.slug = 'hospitality'
ON CONFLICT (industry_id, slug) DO NOTHING;

-- Verify
SELECT i.name AS industry, COUNT(s.id) AS sub_sectors
FROM public.industries i
LEFT JOIN public.sub_sectors s ON s.industry_id = i.id
GROUP BY i.name ORDER BY i.name;

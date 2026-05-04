-- ============================================================
-- Migration 005: Legal Compliance Audit System
-- Replaces the generic regulations table with the full
-- Legal Requirements Master List structure from your Excel.
-- ============================================================

-- ─── Facility Sections ────────────────────────────────────────────────────────
CREATE TABLE public.facility_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.facility_sections (name, description, order_index) VALUES
  ('Production Floor',  'Manufacturing and packaging lines',          1),
  ('Utility Room',      'Boilers, steam systems, generators, HVAC',   2),
  ('Warehouse',         'Raw material and finished goods storage',     3),
  ('Admin Block',       'Offices, canteen, reception',                 4),
  ('ETP Area',          'Effluent Treatment Plant and drainage',       5);

-- ─── Legal Requirements (your master list) ───────────────────────────────────
CREATE TABLE public.legal_requirements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area                  TEXT NOT NULL CHECK (area IN ('Safety', 'Health', 'Environment')),
  legal_document        TEXT NOT NULL,
  source_section        TEXT NOT NULL,
  date_published        TEXT,
  date_enforced         TEXT,
  specific_requirement  TEXT NOT NULL,
  compliance_measures   TEXT NOT NULL,
  owner                 TEXT NOT NULL,
  default_frequency     TEXT DEFAULT 'As applicable',
  applies_to_sections   TEXT[] DEFAULT ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area'],
  embedding             VECTOR(768),
  active                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Vector index for RAG
CREATE INDEX ON public.legal_requirements
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── Compliance Audits ────────────────────────────────────────────────────────
CREATE TABLE public.compliance_audits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL DEFAULT 'Legal Compliance Audit',
  auditor_id       UUID NOT NULL REFERENCES public.profiles(id),
  sections         TEXT[] NOT NULL,
  status           TEXT NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress', 'completed', 'submitted')),
  overall_score    NUMERIC(5,2),
  notes            TEXT,
  period           TEXT,  -- e.g. "Q1 2025", "October 2024"
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- ─── Audit Line Items (one per regulation per section) ───────────────────────
CREATE TABLE public.audit_line_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id              UUID NOT NULL REFERENCES public.compliance_audits(id) ON DELETE CASCADE,
  requirement_id        UUID NOT NULL REFERENCES public.legal_requirements(id),
  section               TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'not_assessed'
                        CHECK (status IN ('compliant', 'non_compliant', 'not_applicable', 'not_assessed')),
  inspector_notes       TEXT,
  evidence_url          TEXT,
  ai_verdict            TEXT,
  ai_override_status    TEXT CHECK (ai_override_status IN ('compliant', 'non_compliant', NULL)),
  ai_override_reason    TEXT,
  responsible_person    TEXT,
  due_date              TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.facility_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_requirements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_audits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_line_items     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view facility sections"
  ON public.facility_sections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view legal requirements"
  ON public.legal_requirements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auditors see own audits, managers see all"
  ON public.compliance_audits FOR SELECT TO authenticated
  USING (
    auditor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin'))
  );

CREATE POLICY "Auditors can create audits"
  ON public.compliance_audits FOR INSERT TO authenticated
  WITH CHECK (auditor_id = auth.uid());

CREATE POLICY "Auditors can update own audits"
  ON public.compliance_audits FOR UPDATE TO authenticated
  USING (auditor_id = auth.uid());

CREATE POLICY "Line items follow audit access"
  ON public.audit_line_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_audits a
      WHERE a.id = audit_id
      AND (a.auditor_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ehs_manager', 'admin')))
    )
  );

CREATE POLICY "Auditors can insert and update line items"
  ON public.audit_line_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auditors can update line items"
  ON public.audit_line_items FOR UPDATE TO authenticated USING (true);

-- ─── Vector search for legal requirements ────────────────────────────────────
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

-- ─── SEED: Legal Requirements from your master list ───────────────────────────
-- Safety requirements
INSERT INTO public.legal_requirements (area, legal_document, source_section, specific_requirement, compliance_measures, owner, default_frequency, applies_to_sections) VALUES

('Safety','Factories Act 2004','Section 16 Subsection 1, 2',
'Powered machinery: Every power-driven machine shall be provided with an efficient starting and stopping appliance. Every electrical equipment intended for use in a factory shall be of safe construction and maintained in a safe condition.',
'Regular checks on electrical machines and safety consideration in electrical equipment and machines in design or modification (MOC).',
'Engineering/SHE','Monthly',
ARRAY['Production Floor','Utility Room']),

('Safety','Factories Act 2004','Section 20 Subsection 1',
'Construction and disposal of new machinery: Every set-screw, bolt or key on any revolving shaft shall be guarded. All spur and toothed or friction gearing shall be completely encased unless situated safely.',
'Identification of exposed dangerous machine parts that pose risk of entrapment and entanglement for operators; design guards as necessary.',
'Engineering/SHE','Monthly',
ARRAY['Production Floor','Utility Room']),

('Safety','Factories Act 2004','Section 21 Subsection 1',
'Vessels containing dangerous liquids: Every fixed vessel containing scalding, corrosive or poisonous liquid shall be securely covered or fenced to at least 91cm above the adjoining ground.',
'Review SOP and Risk Assessment of Silicate, Labsa, Caustic Soda, Diesel tank operations for protective measures around tanks.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','ETP Area']),

('Safety','Factories Act 2004','Section 23',
'Training and supervision of inexperienced workers: No person shall be employed at any machine liable to cause bodily injury unless fully instructed on dangers and precautions, and has received sufficient training.',
'Training and induction for new workers and refresher trainings for machine operators, laboratory attendants and process workers; maintain training records.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','Factories Act 2004','Section 24 Subsection 1,2,3,4,6',
'Hoists and lifts: Every hoist or lift shall be of good mechanical construction and properly maintained. Shall be thoroughly examined at least once every 6 months. Hoistway shall be protected with substantial enclosure and gate interlocks. Maximum working load shall be marked conspicuously.',
'1. Ensure regular checks and monitor trigger date for 3rd Party Inspection. 2. Checklist for protective gate and interlock system. 3. Regular checks on hoist/lift working condition and marked SWL.',
'Engineering/SHE','Quarterly',
ARRAY['Production Floor','Warehouse']),

('Safety','Factories Act 2004','Section 31 Subsection 1,2',
'Steam boilers: Every steam boiler and all its fittings shall be of good construction, sound material, adequate strength and free from patent defect. Shall have a suitable safety valve that prevents the boiler being worked at pressure greater than maximum permissible working pressure.',
'Incorporate mentioned standards on checklist parameters for checks and track findings for close-out actions.',
'Engineering','Quarterly',
ARRAY['Utility Room']),

('Safety','Factories Act 2004','Section 32 Subsection 4,7,9',
'Steam receivers and containers: Every steam boiler attendant shall be properly instructed. Shall be thoroughly examined by an authorised boiler inspector at least once every 14 months. Steam containers shall be maintained to keep outlets open and free from obstruction.',
'1. Training for utility technicians with job description attestation. 2. Monitoring of trigger date for 3rd party inspection certificate. 3. Regular checks on steam receivers and steam containers.',
'Engineering','Quarterly',
ARRAY['Utility Room']),

('Safety','Factories Act 2004','Section 35 Subsection 1,2',
'Prevention of fire: Every factory shall have correctly installed effective means for detecting fire and extinguishing same. Persons employed shall be adequately trained to operate extinguishing apparatus.',
'1. Monthly inspections of fire extinguishers, hose reel and fire fighting devices status. 2. Training plans for fire fighting team each shift. 3. Plan and execute fire drills.',
'SHE','Monthly',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Safety','Factories Act 2004','Section 36 Subsection 1,2,3,8',
'Safety provisions in case of fire: Every factory shall have adequate means of escape. All means of escape shall be maintained free from obstruction. All persons employed shall be familiar with the means of escape in case of fire.',
'1. Ensure no product congestion around packaging/production areas and escape routes. 2. Induction/Training on emergency response plan with workers; maintain training records.',
'Manufacturing/SHE','As applicable',
ARRAY['Production Floor','Warehouse','Admin Block']),

('Safety','Factories Act 2004','Section 40 Subsection 1,3',
'Supply of drinking water: An adequate supply of drinking water shall be provided and maintained at suitable points accessible to all persons employed. A drinking water supply shall not be used for washing up.',
'1. Make and review plans for water supplies and dispensers. 2. Ensure 24/7 portable water availability in all plant areas. 3. Ensure borehole water supplied for non-drinking purposes.',
'Admin','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','Factories Act 2004','Section 43 Subsection 1,4',
'First-aid: There shall be a readily accessible first-aid box of prescribed standard for every 150 persons employed. Each box shall be under the charge of a responsible person who shall always be available during working hours.',
'1. Review locations of all first-aid boxes while maintaining standards. 2. Train first aiders for each shift with names displayed at each first-aid box location.',
'SHE/Clinic','Shift',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Safety','Factories Act 2004','Section 45 Subsection 1',
'Removal of dust or fumes: In every factory where dust, fume or other impurity is given off likely to be injurious, all practicable measures shall be taken to protect persons employed against inhalation and to prevent accumulation.',
'1. Ensure fume/extractor fans are working in areas with high fumes and dust. 2. Develop cleaning plans for sunbreakers. 3. Regular provision of PPEs for workers.',
'Manufacturing/Engineering','As applicable',
ARRAY['Production Floor','Utility Room']),

('Safety','Factories Act 2004','Section 46',
'Meals in certain dangerous places: Where any poisonous or injurious substance gives rise to dust or fume, no person shall be permitted to partake of food or drink in that room.',
'1. Ensure prohibition of food around non-designated areas. 2. Install food prohibition signages around process/production areas. 3. Induction/training for new employees.',
'Quality Assurance/QC','As applicable',
ARRAY['Production Floor','Utility Room']),

('Safety','Factories Act 2004','Section 47',
'Protective clothing and appliances: Where workers are employed in any process involving excessive exposure to wet or to injurious substance, suitable protective clothing including gloves, footwear, goggles and head coverings shall be provided.',
'Provision of appropriate PPEs for process operations across all plants.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','ETP Area']),

('Safety','Factory Act 2004','Cap F1',
'Factory permit must be secured for each year. General provisions cover cleanliness, overcrowding, lighting, ventilation and drainage. Notification of accidents causing loss of life or disability for more than three days shall be reported to the Inspector of the district.',
'Follow developed tracker to ensure trigger dates are monitored for permit renewal.',
'SHE','Annually',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Safety','National Fire Safety Code','Cap 118',
'Fire Suppression systems shall be installed and maintained in full operating condition in all buildings more than 500 square metres in area or more than one storey in height.',
'Monthly inspection of fire suppression systems and keeping records of such inspections.',
'SHE','Monthly',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','National Fire Safety Code','Cap 129',
'Power supply to a fire protection installation shall be from a maintained power supply with alternative power that can be started within 60 seconds after public power supply is removed.',
'Establish frequency for fire alarm systems and components maintenance while keeping records of such maintenance.',
'SHE','Quarterly',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','National Fire Safety Code','Cap 145',
'Warning signs: Where flammable or explosive liquids, vapours or gases are likely to be present, adequate warning signs such as "NO SMOKING" shall be conspicuously displayed with lettering 100mm high in red on white background.',
'Install "NO SMOKING" signage to standard across diesel storage facility and gas line areas.',
'SHE','As applicable',
ARRAY['Utility Room','ETP Area']),

('Safety','National Fire Safety Code','Cap 116',
'Maintenance of all fire protection systems: The owner, occupier or lessee of every building shall be responsible for the care and maintenance of all fire protection systems, equipment and devices.',
'Regular checks and maintenance of fire alarm systems across plant while keeping records of such maintenance.',
'SHE','Quarterly',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','National Fire Safety Code','Cap 81',
'Installation of fire alarm system: The fire alarm system shall be installed to give necessary warning to occupants wherever any part of the building is on fire.',
'Ensure all buildings across plant have a means of notifying occupants of fire outbreak.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','National Fire Safety Code','Cap 20 (C)(F)',
'Permit required for flammable and combustible liquids: to transport, store, handle or use amounts of Class II or III liquids with flashpoint of 149 degrees or less in excess of 38L. Also required to operate a bulk plant or terminal where flammable liquids are blended, produced, processed, transported or stored.',
'Process and obtain petroleum storage permit for diesel storage operations while maintaining track of permit renewal.',
'SHE','Annually',
ARRAY['Utility Room']),

('Safety','National Fire Safety Code','Cap 21',
'Permit for fumigation and thermal insecticide fogging: A permit is required to maintain or operate a facility in which a fumigant or thermal insecticidal fogger is used.',
'Monitor trigger time for Local Government statutory basis of fumigation certifying plant as habitable and keep records of certificate.',
'SHE','As applicable',
ARRAY['Production Floor','Warehouse','Admin Block']),

('Safety','ISPON ACT 2014','Cap 2 B',
'The institute shall set standards of practice and determine the knowledge and skills to be acquired by persons seeking to register and practice as safety professionals.',
'Check SHE technicians qualifications; ensure all persons are registered members of ISPON (Institute of Safety Professionals of Nigeria).',
'SHE','Annually',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Safety','Fire Service Regulations','Cap 39',
'Yearly payment to receive fire safety certificate after meeting set out requirements.',
'Follow developed tracker to ensure trigger dates are monitored so certificate will not expire.',
'SHE','Annually',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','Labour Act 2004','CAP 198',
'Hours which a worker is required to work in excess of the normal hours shall constitute overtime.',
'HR team to work within the ambience of the labour law and be abreast of any updates.',
'HR Team','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','Employee''s Compensation Act 2010','Act 13 of 2010',
'This Act shall apply to all employers and employees. Any employee who suffers any disabling injury arising out of employment shall be entitled to payment of compensation. An employee is also entitled to compensation for accidents sustained on the way between workplace and principal residence.',
'HR team to be familiar with the act and work within the ambience of the law.',
'HR','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block']),

('Safety','INDUSTRIAL TRAINING FUND ACT','Cap 6',
'Every employer having 25 or more employees shall contribute to the Fund one per centum of the amount of the annual payroll.',
'Check with ITF on payment history and close out pending payments as outlined in regulations.',
'HR','Annually',
ARRAY['Admin Block']),

('Safety','INDUSTRIAL TRAINING FUND ACT','Cap 8',
'All employers who pay their annual training levies shall at all times provide adequate training for their indigenous staff with evidence forwarded to the Fund; and shall accept students for industrial attachment.',
'Make provision for accepting Industrial Training students as necessary in fulfillment of regulations.',
'HR','As applicable',
ARRAY['Admin Block']),

-- Health requirements
('Health','National Environmental Health Practice Regulations 2016','No 27, Vol 103 Part IV',
'Fumigation/Disinfection of premises: Ensure vendors have the necessary permits and a certificate is issued after the task.',
'Follow developed tracker to ensure trigger dates are monitored.',
'SHE','As applicable',
ARRAY['Production Floor','Warehouse','Admin Block']),

('Health','Public Health Law','Cap 135 Section 13',
'All food handlers to be provided with medical certificate after completing: Tuberculosis test, Chest X-ray, Widal test, Hep B & C, Stool analysis, Urine analysis, and HIV test. Tests must be done at a State government hospital.',
'Liaise closely with Admin department and intimate food vendor with expectations.',
'SHE','Annually',
ARRAY['Admin Block']),

-- Environment requirements
('Environment','National Environmental Protection (Effluent Limitation) Regulations','S.I.8 of 1991',
'Every industry shall install anti-pollution equipment for the detoxification of effluent and chemical discharges. Effluent shall be treated to a uniform level as specified in the Second Schedule. The nearest office of FEPA shall be furnished with the composition of any treated effluent.',
'Regular monitoring of ETP operations, ensuring effluent discharge is inline with NESREA standards.',
'SHE','Monthly',
ARRAY['ETP Area']),

('Environment','National Environmental (Surface and Groundwater Quality Control) Regulations 2011','S.I.22 of 2011',
'Value of all parameters from monthly waste water checks must be within NESREA acceptable limits.',
'Bring ETP to required optimum standard and regular monitoring of operations.',
'SHE','Monthly',
ARRAY['ETP Area']),

('Environment','National Environmental (Sanitation and Wastes Control) Regulations 2009','Regulation 4',
'Any person whose activities generate waste shall ensure that the waste is handled by a person licensed to transport and dispose of the wastes in designated waste management facility.',
'Ensure waste vendors are licensed and make license available for inspection.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Environment','National Environmental (Sanitation and Wastes Control) Regulations 2009','Regulation 5',
'Any occupant in care, control, or management of a premises shall: keep sidewalks and drainage areas clean, ensure no sweeping into drains, ensure no blockage of streets, walkways and drains.',
'Ensure good housekeeping around all areas while developing frequency for such cleaning.',
'Admin','As applicable',
ARRAY['Production Floor','Warehouse','Admin Block','ETP Area']),

('Environment','National Environmental (Sanitation and Wastes Control) Regulations 2009','Regulation 8',
'A person in care, management or control of any industrial facility shall: provide educational and pictorial signs to direct persons where they can drop wastes; provide receptacles for recyclable materials; ensure recyclable materials are properly packed and neatly stacked.',
'Installation of appropriate designated waste signages across all plants.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Environment','National Environmental (Sanitation and Wastes Control) Regulations 2009','Regulation 10',
'Every owner of premises shall: ensure regular dislodgement and safe disposal of the contents of the septic tank; ensure regular cutting of grasses, lawns, shrubs and flowers in and around the premises.',
'1. Regular evacuation of septic tanks while keeping records. 2. Regular cutting of lawns and grasses around premises.',
'SHE/Admin','As applicable',
ARRAY['Admin Block','ETP Area']),

('Environment','National Environmental (Sanitation and Wastes Control) Regulations 2009','Regulation 11',
'Any person whose activities generate waste shall segregate such waste by putting them into securely tied plastic bags or leak-proof refuse bins with tightly fitting lids.',
'Ensure waste bins/containment are in good condition with no leaks or spills being discharged.',
'Admin','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Environment','National Environmental (Permitting and Licensing System) Regulations 2009','S.I.29 of 2009',
'Effluent Treatment Plant must be in place. Adequate number of toilets provided. Licensed Pest Control Agent employed for pest control activities. Waste water discharged only after treatment.',
'Prompt payment of levies to avoid penalties. Constant review of regulations to ensure changes are captured in record time.',
'SHE','Annually',
ARRAY['ETP Area','Admin Block']),

('Environment','National Environmental (Ozone Layer Protection) Regulations 2009','S.I.32 of 2009',
'No person shall release into the atmosphere an ozone depleting substance from equipment or fire extinguishing equipment. No person shall service or install equipment in contact with ozone depleting substances unless they have completed approved technical training. Phase out date is 1 January 2030.',
'Follow all extant laws domiciled in this regulation.',
'SHE','As applicable',
ARRAY['Utility Room','Production Floor']),

('Environment','National Environmental (Noise Standards and Control) Regulations 2009','S.I.35 of 2009',
'Monthly monitoring of perimeter and factory noise levels. Consider yearly checks for personnel working in high noise areas. Provision of PPEs, lagging of equipment, assessment and identification of high noise areas.',
'Provision of ear plugs/muffs as applicable in areas with elevated noise levels and discipline defaulters.',
'SHE','Monthly',
ARRAY['Production Floor','Utility Room']),

('Environment','National Environmental (Air Quality Control) Regulations 2014','Regulation 2014',
'Monthly environmental air quality monitoring must remain within regulatory body standards. Report submitted monthly to NESREA and State Ministry of Environment. Environmental Impact Assessment (EIA) done every 3 years and Environmental Management Plan (EMP) maintained.',
'Monthly monitoring of air quality to be sustained by certified independent consultants. Parameters monitored and within acceptable limits; variances investigated and authorities notified.',
'SHE','Monthly',
ARRAY['Production Floor','Utility Room','ETP Area']),

('Environment','National Environmental (Hazardous Chemical) Regulation 2014','Regulation 2014',
'Hazardous waste to be handled properly.',
'Ensure waste is handled by registered vendors.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','ETP Area']),

('Environment','Harmful Waste (Special Criminal Provisions) Act','Act 42 of 1988',
'All activities relating to the purchase, sale, importation, transit, transportation, deposit, storage of harmful wastes are prohibited and declared unlawful.',
'Follow all extant laws domiciled in this regulation.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','Warehouse','ETP Area']),

('Environment','National Chemical Pharmaceutical Soap and Detergent Manufacturing Industry Regulations 2009','Regulations 12(2)(d), 16, 17, 18, 50(b)',
'Facility shall submit Environmental Audit Report (EAR) for every 3 years and develop emergency response plan.',
'Follow developed tracker to ensure trigger dates are monitored.',
'SHE','Every 3 years',
ARRAY['Production Floor','Utility Room','Warehouse','Admin Block','ETP Area']),

('Environment','Oyo State Ministry of Environment and Habitat Law','Law 2012 Vol 38 No. 06',
'No integrated pest or vector management outfit shall use any banned pesticides. No engagement of unlicensed pest or vector management outfit. No effluent from a commercial facility shall be discharged into the public drain or neutral environment.',
'Follow developed tracker to monitor fumigation schedules; ensure vendors have current licenses and review pesticides against acceptable chemicals list.',
'SHE','Monthly',
ARRAY['Production Floor','Warehouse','Admin Block','ETP Area']),

('Environment','National Environmental Protection (Pollution Abatement) Regulations','S.I. 9 of 1991',
'No industry shall release hazardous or toxic substances into the air, water or land beyond limits approved by the Agency. An unusual or accidental discharge shall be reported to the nearest office of the Agency not later than 24 hours. Solid wastes shall be disposed of in an environmentally safe manner; no industrial solid waste shall be disposed of in any municipal landfill.',
'Follow all extant laws domiciled in this regulation.',
'SHE','As applicable',
ARRAY['Production Floor','Utility Room','ETP Area']);

-- Add Realtime for compliance tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_audits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_line_items;

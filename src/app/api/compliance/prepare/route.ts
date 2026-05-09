import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;

const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const OWNERS = [
  'HR', 'Engineering/SHE', 'SHE', 'Engineering', 'Admin',
  'Manufacturing/SHE', 'SHE/Clinic', 'Manufacturing/Engineering',
  'Quality Assurance/Quality Control', 'Admin/Supply Chain',
];

const FREQUENCIES = [
  'Shiftly', 'Daily', 'Weekly', 'Monthly', 'Quarterly',
  'Bi-annually', 'Annually', 'As applicable', 'Every 3 years',
];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function prepareRequirement(req: any): Promise<{
  ai_compliance_measures: string;
  ai_responsible_person:  string;
  ai_frequency:           string;
  ai_due_date_type:       'specific' | 'continuous' | 'na';
  due_date:               string | null;
}> {
  const prompt = `
You are a Nigerian EHS compliance expert advising a soap/detergent manufacturing facility (similar to Henkel, PZ Cussons, Unilever).

LEGAL REQUIREMENT:
Document: ${req.legal_document} — ${req.source_section}
Area: ${req.area}
Requirement: ${req.specific_requirement}

Respond ONLY with a valid JSON object, no markdown:
{
  "compliance_measures": "2-4 concise, actionable compliance measures specific to a soap/detergent manufacturing facility. Be specific about what the inspector should physically check or verify.",
  "responsible_person": "Choose ONE from this exact list: ${OWNERS.join(', ')}",
  "frequency": "Choose ONE from: ${FREQUENCIES.join(', ')}",
  "due_date_type": "continuous" | "na" | "specific",
  "due_date_note": "If continuous: 'Continuous Action'. If na: 'N/A'. If specific: describe when (e.g. 'Before Q2 end', 'Annual renewal by January')."
}

Due date rules:
- Use "continuous" for ongoing operational requirements (housekeeping, PPE, monitoring, inspections)
- Use "na" for legal awareness requirements where no action date applies (Labour law, HR policy)  
- Use "specific" for time-bound renewals (permits, certificates, audits, training schedules)
`;

  const result  = await model.generateContent(prompt);
  const text    = result.response.text().replace(/```json|```/g, '').trim();
  const parsed  = JSON.parse(text);

  return {
    ai_compliance_measures: parsed.compliance_measures,
    ai_responsible_person:  parsed.responsible_person,
    ai_frequency:           parsed.frequency,
    ai_due_date_type:       parsed.due_date_type,
    due_date:               parsed.due_date_note,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { auditId } = await req.json();
  if (!auditId) return NextResponse.json({ error: 'auditId required' }, { status: 400 });

  const admin = createAdminClient();

  // Mark audit as preparing
  await admin
    .from('compliance_audits')
    .update({ ai_prep_status: 'preparing' })
    .eq('id', auditId);

  try {
    // Fetch audit + requirements
    const { data: audit } = await admin
      .from('compliance_audits')
      .select('sections')
      .eq('id', auditId)
      .single();

    if (!audit) throw new Error('Audit not found');

    const { data: requirements } = await admin
      .from('legal_requirements')
      .select('*')
      .eq('active', true)
      .overlaps('applies_to_sections', audit.sections);

    if (!requirements?.length) throw new Error('No requirements found');

    // Delete existing line items so we start fresh
    await admin.from('audit_line_items').delete().eq('audit_id', auditId);

    const sections = audit.sections as string[];

    // Process each requirement × section combination
    const lineItems: any[] = [];
    let processed = 0;

    for (const req of requirements) {
      // Generate AI preparation for this requirement once (shared across sections)
      let aiData: Awaited<ReturnType<typeof prepareRequirement>> | null = null;

      try {
        aiData = await prepareRequirement(req);
      } catch (e: any) {
        console.warn(`AI prep failed for ${req.source_section}:`, e.message);
        // Use defaults from the seeded data
        aiData = {
          ai_compliance_measures: req.compliance_measures,
          ai_responsible_person:  req.owner,
          ai_frequency:           req.default_frequency,
          ai_due_date_type:       'continuous',
          due_date:               'Continuous Action',
        };
      }

      // Create a line item for each applicable section
      for (const section of sections) {
        if (!req.applies_to_sections.includes(section)) continue;
        lineItems.push({
          audit_id:               auditId,
          requirement_id:         req.id,
          section,
          status:                 'not_assessed',
          inspector_validated:    null,
          ai_compliance_measures: aiData.ai_compliance_measures,
          ai_responsible_person:  aiData.ai_responsible_person,
          ai_frequency:           aiData.ai_frequency,
          ai_due_date_type:       aiData.ai_due_date_type,
          due_date:               aiData.due_date,
          responsible_person:     aiData.ai_responsible_person,
        });
      }

      processed++;
      // Rate limit — avoid 503s
      await sleep(400);
    }

    // Batch insert
    for (let i = 0; i < lineItems.length; i += 20) {
      const { error } = await admin
        .from('audit_line_items')
        .insert(lineItems.slice(i, i + 20));
      if (error) throw new Error('Insert failed: ' + error.message);
    }

    await admin
      .from('compliance_audits')
      .update({ ai_prep_status: 'ready' })
      .eq('id', auditId);

    return NextResponse.json({ success: true, requirements: processed, lineItems: lineItems.length });

  } catch (err: any) {
    console.error('Prep failed:', err.message);
    await admin
      .from('compliance_audits')
      .update({ ai_prep_status: 'failed' })
      .eq('id', auditId);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
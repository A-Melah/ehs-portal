import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const RESPONSIBLE_OPTIONS = [
  'HR', 'Engineering/SHE', 'SHE', 'Engineering', 'Admin',
  'Manufacturing/SHE', 'SHE/Clinic', 'Manufacturing/Engineering',
  'Quality Assurance/QC', 'Admin/Supply Chain',
];

async function generateEmbedding(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content:  { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_QUERY' as any,
  });
  return result.embedding.values.slice(0, 768);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    requirement,
    measures,
    legalRef,
    section,
    area,
    inspectorAnswer,   // 'yes' | 'partial' | 'no'
    owner,
    defaultFrequency,
    suggestedDueDate,
  } = await req.json();

  if (!inspectorAnswer) {
    return NextResponse.json({ error: 'inspectorAnswer is required.' }, { status: 400 });
  }

  // ── RAG: search uploaded legal chunks for extra context ─────────────────────
  let legalContext = `${legalRef}\n\nRequirement: ${requirement}\n\nRequired Measures: ${measures}`;
  try {
    const embedding = await generateEmbedding(`${legalRef} ${requirement}`);
    const { data: chunks } = await supabase.rpc('search_legal_chunks', {
      query_embedding: embedding,
      match_threshold: 0.45,
      match_count:     3,
      filter_area:     area,
    });
    if (chunks?.length) {
      legalContext = chunks.map((c: any) => `[${c.document_title}]\n${c.content}`).join('\n\n---\n\n');
    }
  } catch { /* fall through to seeded text */ }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const answerLabel = inspectorAnswer === 'yes' ? 'YES — fully implemented'
    : inspectorAnswer === 'partial'             ? 'PARTIALLY implemented'
    : 'NO — not implemented';

  const prompt = `
You are a Nigerian EHS legal compliance auditor for a soap/detergent manufacturing facility.

FACILITY SECTION: ${section}
REGULATORY AREA: ${area}
LEGAL REFERENCE: ${legalRef}

LEGAL REQUIREMENT:
${requirement}

REQUIRED COMPLIANCE MEASURES:
${measures}

RELEVANT LEGAL CONTEXT:
${legalContext}

INSPECTOR'S VALIDATION:
The inspector confirmed this compliance measure is: ${answerLabel}

Your tasks:
1. Determine compliance status based solely on the inspector's answer
2. Select the most appropriate responsible person from this list ONLY: ${RESPONSIBLE_OPTIONS.join(', ')}
3. Determine the appropriate due date / frequency

Respond ONLY with valid JSON, no markdown:
{
  "status": "${inspectorAnswer === 'yes' ? 'compliant' : 'non_compliant'}",
  "compliance_note": "One concise sentence explaining the compliance determination.",
  "responsible_person": "pick the single best match from the allowed list above",
  "frequency": "one of: Shift, Daily, Monthly, Quarterly, Bi-annually, Annually, As applicable, Continuous",
  "due_date": "specific date if applicable (e.g. 'Annually — December 31'), 'Continuous' for ongoing obligations, or 'N/A' if not time-bound"
}

Rules:
- If answer is 'yes': status MUST be 'compliant'
- If answer is 'partial' or 'no': status MUST be 'non_compliant'
- responsible_person MUST be exactly one value from the allowed list
- For permits/certificates: due_date should be the renewal period
- For monitoring tasks: due_date should reflect the monitoring frequency
- For general compliance obligations: 'Continuous'
`;

  try {
    const result  = await model.generateContent(prompt);
    const text    = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    // Force status to match inspector answer — AI cannot override this
    parsed.status = inspectorAnswer === 'yes' ? 'compliant' : 'non_compliant';

    return NextResponse.json(parsed);
  } catch {
    // Fallback — derive status purely from answer without AI
    return NextResponse.json({
      status:             inspectorAnswer === 'yes' ? 'compliant' : 'non_compliant',
      compliance_note:    inspectorAnswer === 'yes'
        ? 'Compliance measure confirmed as implemented by inspector.'
        : 'Compliance measure not fully implemented per inspector validation.',
      responsible_person: owner ?? 'SHE',
      frequency:          defaultFrequency ?? 'As applicable',
      due_date:           suggestedDueDate  ?? 'Continuous',
    });
  }
}
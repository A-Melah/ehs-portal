import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const OWNERS = [
  'HR', 'Engineering/SHE', 'SHE', 'Engineering', 'Admin',
  'Manufacturing/SHE', 'SHE/Clinic', 'Manufacturing/Engineering',
  'Quality Assurance/QC', 'Admin/Supply Chain',
];

const FREQUENCIES = [
  'Shift', 'Daily', 'Monthly', 'Quarterly',
  'Bi-annually', 'Annually', 'As applicable', 'Continuous', 'Every 3 years',
];

async function generateEmbedding(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content:  { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_QUERY' as any,
  });
  return result.embedding.values.slice(0, 1024);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    requirement,      // full legal requirement text
    measures,         // AI-prepared compliance measures (from prepare step)
    legalRef,         // e.g. "Factories Act 2004 — Section 16"
    section,          // facility section being audited
    area,             // Safety | Health | Environment
    inspectorAnswer,  // 'yes' | 'partial' | 'no'
    owner,            // fallback owner from requirement
    defaultFrequency, // fallback frequency
    suggestedDueDate, // fallback due date
  } = await req.json();

  if (!inspectorAnswer) {
    return NextResponse.json({ error: 'inspectorAnswer is required' }, { status: 400 });
  }

  // Status is deterministic — AI cannot override the inspector's answer
  const status: 'compliant' | 'non_compliant' =
    inspectorAnswer === 'yes' ? 'compliant' : 'non_compliant';

  // ── RAG: search uploaded document chunks for legal context ───────────────
  let legalContext = `${legalRef}\n\nRequirement:\n${requirement}\n\nExpected Measures:\n${measures}`;

  try {
    const embedding = await generateEmbedding(`${legalRef} ${requirement}`);
    const { data: chunks } = await supabase.rpc('search_legal_chunks', {
      query_embedding: embedding,
      match_threshold: 0.45,
      match_count:     3,
      filter_area:     area,
    });
    if (chunks?.length) {
      const chunkText = chunks
        .map((c: any) => `[${c.document_title}]\n${c.content}`)
        .join('\n\n---\n\n');
      legalContext = chunkText;
    }
  } catch { /* fall through — use seeded text */ }

  // ── Gemini: generate compliance note and confirm metadata ────────────────
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const answerLabel =
    inspectorAnswer === 'yes'     ? 'YES — the compliance measure is fully implemented' :
    inspectorAnswer === 'partial' ? 'PARTIAL — the compliance measure is only partially implemented' :
                                    'NO — the compliance measure is not implemented';

  const prompt = `You are a Nigerian EHS legal compliance auditor reviewing a soap/detergent manufacturing facility.

FACILITY SECTION: ${section}
REGULATORY AREA: ${area}
LEGAL REFERENCE: ${legalRef}

LEGAL REQUIREMENT:
${requirement}

COMPLIANCE MEASURE TO VALIDATE:
${measures}

RELEVANT LEGAL CONTEXT FROM UPLOADED DOCUMENTS:
${legalContext}

INSPECTOR VALIDATION: ${answerLabel}

Based on the inspector's validation, provide a brief compliance determination.

Respond ONLY with valid JSON, no markdown:
{
  "compliance_note": "One clear sentence: state whether the facility is compliant or non-compliant with this specific requirement and why, citing the legal reference.",
  "responsible_person": "exactly one from: ${OWNERS.join(', ')}",
  "frequency": "exactly one from: ${FREQUENCIES.join(', ')}",
  "due_date": "'Continuous' for ongoing | specific period for time-bound e.g. 'Annually — December 31' | 'N/A' for legal awareness items"
}

STRICT RULES:
- Status is already determined by the inspector — do NOT change it
- responsible_person must be exactly one value from the allowed list
- frequency must be exactly one value from the allowed list
- compliance_note must reference the specific legal obligation`;

  try {
    const result  = await model.generateContent(prompt);
    const raw     = result.response.text().replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(raw);

    return NextResponse.json({
      status,
      compliance_note:    parsed.compliance_note    ?? null,
      responsible_person: OWNERS.includes(parsed.responsible_person)
        ? parsed.responsible_person : (owner ?? 'SHE'),
      frequency:          FREQUENCIES.includes(parsed.frequency)
        ? parsed.frequency : (defaultFrequency ?? 'As applicable'),
      due_date:           parsed.due_date ?? suggestedDueDate ?? 'Continuous',
    });

  } catch {
    // Fallback — status from inspector, metadata from seeded data
    return NextResponse.json({
      status,
      compliance_note:    status === 'compliant'
        ? 'Inspector confirmed this compliance measure is implemented.'
        : 'Inspector confirmed this compliance measure is not fully implemented.',
      responsible_person: owner            ?? 'SHE',
      frequency:          defaultFrequency ?? 'As applicable',
      due_date:           suggestedDueDate ?? 'Continuous',
    });
  }
}
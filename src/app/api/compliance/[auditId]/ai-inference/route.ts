import { NextRequest, NextResponse } from 'next/server';
import { createClient }  from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// FIX: Added error handling and model fallback for embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    console.warn("text-embedding-004 failed, falling back to 001");
    const fallback = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await fallback.embedContent(text);
    return result.embedding.values;
  }
}

export async function POST(
  req: NextRequest,
  // FIX: Added params to satisfy Next.js Route Handler constraints
  { params }: { params: Promise<{ auditId: string }> }
) {
  const supabase = await createClient();
  
  // Await params even if not explicitly used in the logic to satisfy the validator
  const { auditId } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requirement, measures, legalRef, section, area, inspectorFinding, requirementId } = await req.json();

  if (!inspectorFinding?.trim()) {
    return NextResponse.json({ error: 'Inspector finding is required.' }, { status: 400 });
  }

  // ── Step 1: Semantic search ────────────────────────────────────────────────
  let legalContext = '';
  try {
    const searchQuery = `${legalRef}: ${requirement} ${inspectorFinding}`;
    const embedding = await generateEmbedding(searchQuery);

    const { data: chunks } = await supabase.rpc('search_legal_chunks', {
      query_embedding: embedding,
      match_threshold: 0.45,
      match_count: 4,
      filter_area: area,
    });

    if (chunks && chunks.length > 0) {
      legalContext = chunks
        .map((c: any) => `[${c.document_title}]\n${c.content}`)
        .join('\n\n---\n\n');
    }
  } catch (e) {
    console.error("Vector search failed:", e);
  }

  if (!legalContext) {
    legalContext = `${legalRef}\n\nRequirement: ${requirement}\n\nRequired Measures: ${measures}`;
  }

  // ── Step 2: Gemini compliance determination ──────────────────────────────────
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
    You are a Nigerian EHS (Environment, Health & Safety) legal compliance auditor.
    FACILITY SECTION: ${section}
    REGULATORY AREA: ${area}
    LEGAL REFERENCE: ${legalRef}

    RELEVANT LEGAL TEXT:
    ${legalContext}

    INSPECTOR'S FIELD OBSERVATION:
    "${inspectorFinding}"

    Respond ONLY with a valid JSON object:
    {
      "status": "compliant" | "non_compliant" | "not_applicable",
      "verdict": "2-3 sentences explaining your determination.",
      "gap": "Description of gap or null",
      "recommended_action": "Corrective action or null",
      "urgency": "immediate" | "short_term" | "long_term" | null,
      "legal_basis": "Specific clause used"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // ── Step 3: PERSIST the result ──────────────────────────────────────────
    // Without this, the Master List won't update!
    await supabase.from('compliance_audit_items').upsert({
      audit_id: auditId,
      requirement_id: requirementId,
      inspector_observation: inspectorFinding,
      status: parsed.status,
      ai_verdict: parsed.verdict,
      gap_analysis: parsed.gap,
      recommended_action: parsed.recommended_action,
      urgency: parsed.urgency
    });

    return NextResponse.json({
      ...parsed,
      context_source: legalContext.length > 200 ? 'uploaded_documents' : 'seeded_requirements',
    });
  } catch (err) {
    return NextResponse.json({
      status: 'non_compliant',
      verdict: 'AI analysis failed.',
      legal_basis: legalRef,
      context_source: 'error',
    });
  }
}
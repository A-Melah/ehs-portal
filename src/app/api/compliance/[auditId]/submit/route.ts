import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(
  req: NextRequest,
  // FIX: Explicitly type params as a Promise
  { params }: { params: Promise<{ auditId: string }> }
) {
  const supabase = await createClient();
  
  // 1. Await the params to unlock auditId
  const { auditId } = await params;

  // 2. Auth Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { 
      requirementId, 
      requirement, 
      measures, 
      legalRef, 
      section, 
      area, 
      inspectorFinding 
    } = body;

    if (!inspectorFinding?.trim()) {
      return NextResponse.json({ error: 'Inspector finding is required.' }, { status: 400 });
    }

    // 3. AI Analysis (Using the stable 2.0-flash model)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      You are a Nigerian EHS legal compliance auditor.
      SECTION: ${section} | AREA: ${area} | REF: ${legalRef}
      LAW: ${requirement}
      MEASURES: ${measures}
      OBSERVATION: "${inspectorFinding}"

      Respond ONLY with a valid JSON object:
      {
        "status": "compliant" | "non_compliant" | "not_applicable",
        "verdict": "Explanation of the breach or compliance.",
        "gap": "Description of gap or null",
        "recommended_action": "Corrective action or null",
        "urgency": "immediate" | "short_term" | "long_term" | null
      }
    `;

    const result = await model.generateContent(prompt);
    const aiResponse = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());

    // 4. Update the Audit Item in Supabase
    const { error: dbError } = await supabase
      .from('compliance_audit_items') 
      .upsert({
        audit_id: auditId, // Use the awaited auditId
        requirement_id: requirementId,
        inspector_observation: inspectorFinding,
        status: aiResponse.status,
        ai_verdict: aiResponse.verdict,
        gap_analysis: aiResponse.gap,
        recommended_action: aiResponse.recommended_action,
        urgency: aiResponse.urgency,
        auditor_id: user.id
      });

    if (dbError) throw dbError;

    return NextResponse.json(aiResponse);

  } catch (err: any) {
    console.error("Audit Submission Error:", err);
    return NextResponse.json({
      status: 'non_compliant',
      verdict: 'AI analysis or database update failed.',
      gap: null,
      recommended_action: 'Manual review required.',
      urgency: null,
    }, { status: 500 });
  }
}
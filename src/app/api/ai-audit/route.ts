import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runComplianceAudit, generateEmbedding } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { questionText, assetType, legalRefId } = await req.json();

    if (!questionText || !assetType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();
    let legalContext = '';

    // Step 1: RAG — search legal_document_chunks for relevant context
    try {
      const embedding = await generateEmbedding(`${assetType} inspection failure: ${questionText}`);
      const { data: chunks } = await supabase.rpc('search_legal_chunks', {
        query_embedding: embedding,
        match_threshold: 0.4,
        match_count:     3,
        filter_area:     null,
      });
      if (chunks?.length) {
        legalContext = chunks
          .map((c: any) => `[${c.document_title}]\n${c.content}`)
          .join('\n\n---\n\n');
      }
    } catch { /* fall through */ }

    // Step 2: fallback — search legal_requirements by asset type keywords
    if (!legalContext) {
      try {
        const { data: reqs } = await supabase
          .from('legal_requirements')
          .select('legal_document, source_section, specific_requirement, compliance_measures')
          .eq('active', true)
          .ilike('specific_requirement', `%${assetType}%`)
          .limit(3);

        if (reqs?.length) {
          legalContext = reqs
            .map(r => `${r.legal_document} — ${r.source_section}:\n${r.specific_requirement}`)
            .join('\n\n');
        }
      } catch { /* fall through */ }
    }

    // Step 3: generic fallback
    if (!legalContext) {
      legalContext = `General EHS best practices and Nigerian Factories Act requirements for ${assetType} safety compliance.`;
    }

    const result = await runComplianceAudit(questionText, legalContext, assetType);
    return NextResponse.json(result);

  } catch (err) {
    console.error('AI audit error:', err);
    return NextResponse.json(
      {
        error:        'AI audit failed',
        breach_level: 'moderate',
        verdict:      'AI analysis could not be completed. Please review this item manually.',
        breach_detected: true,
        legal_references: [],
        recommended_actions: ['Review the failed item with your EHS team', 'Check relevant regulatory requirements'],
      },
      { status: 500 }
    );
  }
}
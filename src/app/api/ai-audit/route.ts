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

    // Step 1: Try direct legal reference first
    if (legalRefId) {
      const { data: reg } = await supabase
        .from('regulations')
        .select('statute_title, section, content')
        .eq('id', legalRefId)
        .single();

      if (reg) {
        legalContext = `${reg.statute_title} — ${reg.section}\n${reg.content}`;
      }
    }

    // Step 2: RAG — vector search for semantically similar regulations
    if (!legalContext) {
      try {
        const embedding = await generateEmbedding(`${assetType} failure: ${questionText}`);

        const { data: matches } = await supabase.rpc('search_regulations', {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: 3,
        });

        if (matches && matches.length > 0) {
          legalContext = matches
            .map((m: any) => `${m.statute_title} — ${m.section}\n${m.content}`)
            .join('\n\n');
        }
      } catch {
        // Embeddings may not be seeded yet — fall through to general audit
      }
    }

    // Step 3: Fallback context if nothing found
    if (!legalContext) {
      legalContext = `General EHS best practices and Nigerian Factories Act requirements for ${assetType} safety compliance.`;
    }

    // Step 4: Run Gemini compliance audit
    const result = await runComplianceAudit(questionText, legalContext, assetType);

    return NextResponse.json(result);
  } catch (err) {
    console.error('AI audit error:', err);
    return NextResponse.json(
      { error: 'AI audit failed', breach_level: 'moderate', verdict: 'Unable to complete AI audit. Please review manually.' },
      { status: 500 }
    );
  }
}

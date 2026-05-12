import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding }  from '@/lib/gemini';

export const maxDuration = 300; // 5 minutes

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const OWNERS      = ['SHE','HR','Engineering/SHE','Quality Assurance/QC','Management','Legal/Compliance','Operations','Maintenance','Environmental','Security'];
const FREQUENCIES = ['Daily','Weekly','Monthly','Quarterly','Bi-annually','Annually','Continuous','As required','Per shift'];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const { auditId, industryId, subSectorId, industryName: rawIndustryName, subSectorName } = body;

  const admin = createAdminClient();

  // Resolve industry name — may be missing for audits created before industry system
  let industryName = rawIndustryName;
  if (auditId && !industryName) {
    const { data: auditRow } = await admin
      .from('compliance_audits')
      .select('industry_name, sections')
      .eq('id', auditId)
      .single();
    industryName = auditRow?.industry_name
      ?? (auditRow?.sections as string[])?.[0]
      ?? null;
  }

  console.log('[prepare] START — audit:', auditId, 'industry:', industryName);

  if (!auditId || !industryName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Mark as preparing
  await admin.from('compliance_audits').update({ status: 'preparing' }).eq('id', auditId);

  try {
    // ── Step 1: Compute fingerprint ────────────────────────────────────────
    let currentFingerprint = 'empty';
    try {
      const { data: fp } = await admin.rpc('compute_doc_fingerprint');
      currentFingerprint = fp ?? 'empty';
    } catch (e: any) {
      console.warn('[prepare] fingerprint failed:', e.message);
    }
    console.log('[prepare] fingerprint:', currentFingerprint?.slice(0, 12));

    // ── Step 2: Check cache ────────────────────────────────────────────────
    let cacheQuery = industryId
      ? admin.from('industry_requirements_cache').select('*').eq('industry_id', industryId)
      : null;
    if (cacheQuery) {
      cacheQuery = subSectorId
        ? cacheQuery.eq('sub_sector_id', subSectorId)
        : cacheQuery.is('sub_sector_id', null);
    }
    const { data: cache } = cacheQuery ? await cacheQuery.maybeSingle() : { data: null };

    let requirements: any[] = [];

    if (cache && cache.doc_fingerprint === currentFingerprint && cache.requirements?.length) {
      console.log('[prepare] cache hit —', cache.req_count, 'requirements');
      requirements = cache.requirements;
    } else {
      // ── Step 3: Search chunks ──────────────────────────────────────────
      console.log('[prepare] generating embedding...');
      const searchQuery = `${industryName} ${subSectorName ?? ''} EHS safety health environment compliance regulations legal obligations`;
      const embedding   = await generateEmbedding(searchQuery);
      console.log('[prepare] embedding done, searching chunks...');

      const { data: chunks, error: chunkErr } = await admin.rpc('search_legal_chunks', {
        query_embedding: embedding,
        match_threshold: 0.2,
        match_count:     50,
        filter_area:     null,
      });

      if (chunkErr) {
        if (chunkErr.message?.includes('different vector dimensions')) {
          console.warn('[prepare] dimension mismatch — deleting wrong-dim chunks and retrying...');
          // Delete only chunks with wrong dimensions using raw SQL via rpc
          try { await admin.rpc('delete_wrong_dim_chunks'); } catch {} // removes wrong-dim chunks;
          // Retry
          const { data: retryChunks, error: retryErr } = await admin.rpc('search_legal_chunks', {
            query_embedding: embedding,
            match_threshold: 0.2,
            match_count:     50,
            filter_area:     null,
          });
          if (retryErr) throw new Error('Chunk search failed: ' + retryErr.message);
          if (!retryChunks?.length) throw new Error('No relevant regulatory documents found. Please process your uploaded documents first.');
          return retryChunks;
        }
        throw new Error('Chunk search failed: ' + chunkErr.message);
      }
      if (!chunks?.length) throw new Error('No relevant regulatory documents found. Please upload applicable legal documents first.');

      console.log('[prepare] found', chunks.length, 'chunks — extracting requirements...');

      // ── Step 4: Extract requirements from chunks ───────────────────────
      const context = (chunks as any[])
        .slice(0, 30) // limit to 30 most relevant chunks
        .map((c: any) => `[${c.document_title}]\n${c.content}`)
        .join('\n\n---\n\n');

      const prompt = `You are a senior EHS compliance expert. Extract all enforceable legal requirements from the regulatory text below that apply to the ${industryName} industry${subSectorName ? ` (${subSectorName})` : ''}.

RULES:
- Extract only genuinely applicable requirements
- Include cross-industry obligations (labour law, fire safety, first aid)
- Maximum 5 requirements per legal document section
- Skip preambles, definitions, penalty clauses

For each requirement return:
- legal_document: document title
- source_section: section number
- area: Safety | Health | Environment | HR | Quality
- specific_requirement: the full obligation (1-3 sentences)
- compliance_measures: 2-3 specific verifiable steps
- owner: one of ${OWNERS.join(', ')}
- frequency: one of ${FREQUENCIES.join(', ')}
- due_date: Continuous | Annually — [month] | As required

REGULATORY TEXT:
${context}

Return ONLY a valid JSON array, no markdown:
[{"legal_document":"...","source_section":"...","area":"...","specific_requirement":"...","compliance_measures":"...","owner":"...","frequency":"...","due_date":"..."}]`;

      const result  = await model.generateContent(prompt);
      const rawText = result.response.text().trim();

      // Extract JSON array
      const start = rawText.indexOf('[');
      const end   = rawText.lastIndexOf(']');
      if (start === -1 || end === -1) throw new Error('Gemini returned invalid response — no JSON array found');

      const parsed = JSON.parse(rawText.slice(start, end + 1));

      // Deduplicate
      const seen = new Set<string>();
      requirements = parsed
        .filter((r: any) => {
          const key = `${r.legal_document}::${r.source_section}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return r.specific_requirement?.length > 10;
        })
        .map((r: any) => ({
          id:                   `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          legal_document:       r.legal_document       ?? '',
          source_section:       r.source_section       ?? '',
          area:                 (() => {
            const a = (r.area ?? 'Safety').toString();
            if (a.toLowerCase().includes('environment')) return 'Environment';
            if (a.toLowerCase().includes('health'))      return 'Health';
            if (a.toLowerCase().includes('hr')) return 'HR';
            if (a.toLowerCase().includes('quality'))     return 'Quality';
            return 'Safety';
          })(),
          specific_requirement: r.specific_requirement ?? '',
          compliance_measures:  r.compliance_measures  ?? '',
          owner:                OWNERS.includes(r.owner) ? r.owner : 'SHE',
          frequency:            FREQUENCIES.includes(r.frequency) ? r.frequency : 'Annually',
          due_date:             r.due_date             ?? 'Continuous',
        }));

      console.log('[prepare] extracted', requirements.length, 'requirements');

      // Save to cache
      if (industryId && requirements.length > 0) {
        await admin.from('industry_requirements_cache').upsert({
          industry_id:     industryId,
          sub_sector_id:   subSectorId ?? null,
          requirements,
          doc_fingerprint: currentFingerprint,
          generated_at:    new Date().toISOString(),
          req_count:       requirements.length,
        }, { onConflict: 'industry_id,sub_sector_id' });
      }
    }

    if (!requirements.length) throw new Error('No requirements could be extracted for this industry.');

    // ── Step 5: Insert line items ──────────────────────────────────────────
    await admin.from('audit_line_items').delete().eq('audit_id', auditId);

    const lineItems = requirements.map((r: any) => ({
      audit_id:             auditId,
      requirement_id:       null,
      section:              r.area,
      area:                 r.area,
      status:               'not_assessed',
      ai_measures:          r.compliance_measures,
      responsible_person:   r.owner,
      frequency:            r.frequency,
      due_date:             r.due_date,
      legal_document:       r.legal_document,
      source_section:       r.source_section,
      specific_requirement: r.specific_requirement,
    }));

    // Insert in batches of 50
    for (let i = 0; i < lineItems.length; i += 50) {
      await admin.from('audit_line_items').insert(lineItems.slice(i, i + 50));
    }

    // ── Step 6: Mark in_progress ───────────────────────────────────────────
    await admin.from('compliance_audits').update({
      status:          'in_progress',
      industry_id:     industryId   ?? null,
      sub_sector_id:   subSectorId  ?? null,
      industry_name:   industryName,
      sub_sector_name: subSectorName ?? null,
    }).eq('id', auditId);

    console.log('[prepare] DONE —', lineItems.length, 'line items inserted');
    return NextResponse.json({ success: true, count: lineItems.length });

  } catch (err: any) {
    console.error('[prepare] FAILED:', err.message);
    await admin.from('compliance_audits').update({ status: 'failed' }).eq('id', auditId);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
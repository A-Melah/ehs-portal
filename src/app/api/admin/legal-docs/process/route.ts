import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Allow up to 5 minutes for large PDF processing
export const maxDuration = 600;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function chunkText(text: string, chunkSize = 3000, overlap = 400): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks.filter(c => c.length > 100);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content:  { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_DOCUMENT' as any,
  });
  return result.embedding.values.slice(0, 1024);
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function extractTextFromPDF(base64: string, fileName: string): Promise<string> {
  // Strategy 1: Use Gemini File API (handles large PDFs reliably)
  try {
    const fileManager = (genAI as any).fileManager ?? null;

    if (fileManager) {
      // Upload via File API
      const uploadResponse = await fileManager.uploadFile(
        Buffer.from(base64, 'base64'),
        { mimeType: 'application/pdf', displayName: fileName }
      );
      const file = uploadResponse.file;

      // Wait for processing
      let uploadedFile = file;
      while (uploadedFile.state === 'PROCESSING') {
        await sleep(3000);
        uploadedFile = await fileManager.getFile(file.name);
      }

      if (uploadedFile.state === 'FAILED') throw new Error('File upload processing failed');

      // Extract text using the uploaded file URI
      const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent([
        { fileData: { mimeType: 'application/pdf', fileUri: uploadedFile.uri } },
        { text: 'Extract ALL text from this legal document verbatim. Preserve section numbers, headings, and paragraph structure. Include every section, subsection, clause and schedule. Return only the raw text, no markdown, no commentary.' },
      ]);

      // Clean up uploaded file
      try { await fileManager.deleteFile(file.name); } catch {}

      const text = result.response.text();
      if (text && text.length > 200) return text;
    }
  } catch (e) {
    console.log('File API failed, trying inline:', e);
  }

  // Strategy 2: Inline base64 (works for smaller PDFs)
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: 'Extract ALL text from this legal document verbatim. Preserve section numbers, headings, and paragraph structure. Include every section, subsection, clause and schedule. Return only the raw text, no markdown, no commentary.' },
  ]);

  return result.response.text();
}


// Detect which industries a document applies to
async function detectIndustries(text: string, title: string): Promise<string[]> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Given this regulatory document titled "${title}", which industries does it apply to?

Choose from: Oil & Gas, Manufacturing, Construction, Mining, Healthcare, Logistics & Warehousing, Power & Utilities, Agriculture, Hospitality & Food Service, Maritime, Telecommunications, Financial Services

Rules:
- If it applies to ALL industries (e.g. Labour Act, Fire Safety, First Aid), return ["all"]
- If it applies to specific industries, list only those
- Maximum 6 industries

Document excerpt (first 1000 chars): ${text.slice(0, 1000)}

Return ONLY a JSON array of strings, nothing else: ["Industry 1", "Industry 2"]`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw);
  } catch {
    return ['all']; // default to all if detection fails
  }
}


// Auto-detect document area from extracted text
async function detectArea(text: string, title: string): Promise<'Safety' | 'Health' | 'Environment'> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Classify this regulatory document into exactly ONE category based on its PRIMARY focus:

- Safety: Factories Act, workplace machinery, fire safety, PPE, labour law, workers compensation, industrial training, construction safety, road safety, occupational safety
- Health: Food safety, public health, medical services, nutrition, food hygiene, pharmaceutical products, medical devices
- Environment: Pollution control, effluent/wastewater, air quality, solid waste, noise, ozone, groundwater, environmental impact assessment

IMPORTANT: The Factories Act and similar industrial/workplace legislation = Safety (even if it mentions health)
Labour Act, Employee Compensation = Safety
Food/Drug/Cosmetics regulations = Health
NESREA, EPA regulations = Environment

Document title: "${title}"
First 300 chars: ${text.slice(0, 300)}

Reply with ONLY one word: Safety, Health, or Environment`;

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();
    if (raw.includes('Health'))      return 'Health';
    if (raw.includes('Environment')) return 'Environment';
    return 'Safety'; // default
  } catch {
    return 'Safety';
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'ehs_manager'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rawBody = await req.text();
  console.log('[process POST] raw body:', rawBody);
  let documentId: string | undefined;
  try { documentId = JSON.parse(rawBody)?.documentId; } catch {}
  if (!documentId) return NextResponse.json({ error: 'documentId required — received: ' + rawBody.slice(0, 100) }, { status: 400 });

  const admin = createAdminClient();

  await admin.from('legal_documents').update({ status: 'processing', error_message: null }).eq('id', documentId);

  try {
    const { data: doc } = await admin
      .from('legal_documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('Document not found');

    // Download PDF using signed URL (works for private buckets)
    const { data: signedData, error: signErr } = await admin.storage
      .from('legal-documents')
      .createSignedUrl(doc.storage_path, 60);

    if (signErr || !signedData?.signedUrl) {
      throw new Error('Could not generate download URL: ' + signErr?.message);
    }

    // Fetch the actual file bytes via the signed URL
    const fileResponse = await fetch(signedData.signedUrl);
    if (!fileResponse.ok) throw new Error(`File fetch failed: ${fileResponse.status}`);

    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64      = Buffer.from(arrayBuffer).toString('base64');

    console.log(`Processing ${doc.file_name}: ${(arrayBuffer.byteLength / 1024).toFixed(0)}KB`);

    // Extract text from PDF using Gemini
    const extractedText = await extractTextFromPDF(base64, doc.file_name);

    if (!extractedText || extractedText.length < 100) {
      throw new Error(
        `PDF text extraction returned insufficient content (${extractedText?.length ?? 0} chars). ` +
        'The PDF may be scanned/image-based. Try a text-based PDF.'
      );
    }

    console.log(`Extracted ${extractedText.length} chars, chunking...`);

    // Chunk the text
    const chunks = chunkText(extractedText);
    console.log(`${chunks.length} chunks created`);

    // Delete existing chunks
    await admin.from('legal_document_chunks').delete().eq('document_id', documentId);

    // Generate embeddings in batches
    const chunkRows: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      chunkRows.push({
        document_id:  documentId,
        chunk_index:  i,
        content:      chunks[i],
        page_numbers: [],
        embedding,
      });
      // Rate limit
      if (i < chunks.length - 1) await sleep(250);
    }

    // Insert in batches of 10
    for (let i = 0; i < chunkRows.length; i += 10) {
      const { error: insertErr } = await admin
        .from('legal_document_chunks')
        .insert(chunkRows.slice(i, i + 10));
      if (insertErr) throw new Error('Chunk insert failed: ' + insertErr.message);
    }

    await admin.from('legal_documents').update({
      status:       'processed',
      chunk_count:  chunks.length,
      processed_at: new Date().toISOString(),
      error_message: null,
      area: await detectArea(extractedText, doc.document_title),
      detected_industries: await detectIndustries(extractedText, doc.document_title),
    }).eq('id', documentId);

    return NextResponse.json({ success: true, chunks: chunks.length, text_length: extractedText.length });

  } catch (err: any) {
    console.error('Processing failed:', err.message);
    await admin.from('legal_documents').update({
      status:        'failed',
      error_message: err.message,
    }).eq('id', documentId);

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Extraction helpers ────────────────────────────────────────────────────────

const RESPONSIBLE_OPTIONS = [
  'HR', 'Engineering/SHE', 'SHE', 'Engineering', 'Admin',
  'Manufacturing/SHE', 'SHE/Clinic', 'Manufacturing/Engineering',
  'Quality Assurance/QC', 'Admin/Supply Chain',
];

async function extractBatch(
  text: string, docTitle: string, area: string, batch: number, total: number
): Promise<any[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `You are a Nigerian EHS legal compliance expert for soap/detergent manufacturing.
DOCUMENT: ${docTitle} | AREA: ${area} | BATCH ${batch}/${total}

--- TEXT ---
${text}
--- END ---

Extract ONLY distinct enforceable legal obligations. Skip preambles and definitions.
Return ONLY a JSON array ([] if none found). Start with [ end with ]:
[{"source_section":"Section X","specific_requirement":"full obligation text","compliance_measures":"2-3 actionable steps","owner":"SHE","default_frequency":"Monthly","suggested_due_date":"Monthly — ongoing"}]


owner options (pick one exactly): ${RESPONSIBLE_OPTIONS.join(', ')}`;

  const result = await model.generateContent(prompt);
  const raw    = result.response.text().trim().replace(/```json|```/g, '').trim();
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  if (s === -1 || e <= s) return [];
  try {
    const parsed = JSON.parse(raw.slice(s, e + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const out: any[] = [];
    const re = /\{[^{}]*\}/g; let m;
    while ((m = re.exec(raw.slice(s))) !== null) {
      try { const o = JSON.parse(m[0]); if (o.source_section) out.push(o); } catch {}
    }
    return out;
  }
}

// ── Second action: extract requirements from processed doc ────────────────────
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!['admin', 'ehs_manager'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { documentId, replaceExisting = false } = await req.json();
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

    const admin = createAdminClient();

    const { data: doc } = await admin
      .from('legal_documents').select('*').eq('id', documentId).single();
    if (!doc)                   return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (doc.status !== 'processed') return NextResponse.json({ error: 'Document not processed yet' }, { status: 400 });

    const { data: chunks } = await admin
      .from('legal_document_chunks')
      .select('content, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index');

    if (!chunks?.length) return NextResponse.json({ error: 'No chunks found' }, { status: 400 });

    // Batch into ~6000 char groups
    const batches: string[] = [];
    let cur = '';
    for (const c of chunks) {
      if (cur.length + c.content.length > 6000 && cur) { batches.push(cur); cur = c.content; }
      else cur += (cur ? '\n\n' : '') + c.content;
    }
    if (cur) batches.push(cur);

    const all: any[] = [];
    for (let i = 0; i < batches.length; i++) {
      try { all.push(...await extractBatch(batches[i], doc.document_title, doc.area, i + 1, batches.length)); }
      catch (e: any) { console.error(`Batch ${i+1} error:`, e.message); }
      if (i < batches.length - 1) await sleep(1500);
    }

    if (!all.length) return NextResponse.json({ error: 'No requirements extracted — try again' }, { status: 400 });

    // Deduplicate
    const seen = new Set<string>();
    const deduped = all.filter(r => {
      const k = `${r.source_section}::${String(r.specific_requirement).slice(0, 100)}`;
      if (seen.has(k)) return false; seen.add(k); return true;
    });

    if (replaceExisting) {
      // Fuzzy match — strip year so "Factories Act 2024" matches "Factories Act 2004"
      const baseTitle = doc.document_title.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();

      // Delete exact match
      await admin.from('legal_requirements').delete().eq('legal_document', doc.document_title);

      // Also delete rows whose title matches after year-stripping
      const { data: allReqs } = await admin
        .from('legal_requirements').select('id, legal_document').eq('active', true);

      const fuzzyMatchIds = (allReqs ?? [])
        .filter(r => {
          const seededBase = r.legal_document.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
          return seededBase.toLowerCase() === baseTitle.toLowerCase() && r.legal_document !== doc.document_title;
        })
        .map(r => r.id);

      if (fuzzyMatchIds.length > 0) {
        await admin.from('legal_requirements').delete().in('id', fuzzyMatchIds);
        console.log(`[extract] fuzzy-deleted ${fuzzyMatchIds.length} requirements matching "${baseTitle}"`);
      }
    }

    const rows = deduped
      .filter(r => r.source_section && r.specific_requirement && r.compliance_measures)
      .map(r => ({
        area:                 doc.area,
        legal_document:       doc.document_title,
        source_section:       String(r.source_section).slice(0, 200),
        specific_requirement: String(r.specific_requirement),
        compliance_measures:  String(r.compliance_measures),
        detected_industries: [], // populated by detectIndustries on POST processing
        owner:             RESPONSIBLE_OPTIONS.includes(r.owner) ? r.owner : 'SHE',
        default_frequency: r.default_frequency ?? 'As applicable',
        suggested_due_date: r.suggested_due_date ?? 'Continuous',
        active:            true,
        source_document_id: documentId,  // track origin for future cleanup
      }));

    const { data: inserted, error: insertErr } = await admin
      .from('legal_requirements').insert(rows).select('id');
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    await admin.from('legal_documents')
      .update({ error_message: `${inserted?.length ?? 0} requirements extracted`, processed_at: new Date().toISOString() })
      .eq('id', documentId);

    return NextResponse.json({ success: true, extracted: inserted?.length ?? 0, document: doc.document_title });

  } catch (err: any) {
    console.error('Extraction error:', err);
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Allow up to 5 minutes for large PDF processing
export const maxDuration = 300;

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
  const model  = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'ehs_manager'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { documentId } = await req.json();
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

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
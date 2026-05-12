import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding }  from '@/lib/gemini';

export const maxDuration = 300;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function chunkText(text: string, size = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient();

  const { data: docs } = await admin
    .from('legal_documents')
    .select('id, document_title, file_name, storage_path, area')
    .order('document_title');

  if (!docs?.length) return NextResponse.json({ error: 'No documents found' }, { status: 400 });

  console.log(`[reprocess-all] processing ${docs.length} documents...`);
  const results: { title: string; chunks: number; status: string }[] = [];

  for (const doc of docs) {
    try {
      console.log(`[reprocess-all] → ${doc.document_title}`);

      const { data: signedUrl } = await admin.storage
        .from('legal-documents')
        .createSignedUrl(doc.storage_path ?? doc.file_name, 300);

      if (!signedUrl?.signedUrl) throw new Error('Could not get signed URL');

      const pdfRes = await fetch(signedUrl.signedUrl);
      const buffer = await pdfRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const extraction  = await visionModel.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: 'Extract all text from this regulatory document. Return complete text only, preserving section numbers and headings.' },
      ]);
      const text = extraction.response.text();
      if (!text || text.length < 100) throw new Error('Extracted text too short');

      await admin.from('legal_document_chunks').delete().eq('document_id', doc.id);

      const chunks = chunkText(text);
      console.log(`[reprocess-all] ${chunks.length} chunks, embedding...`);

      for (let i = 0; i < chunks.length; i += 5) {
        const batch = chunks.slice(i, i + 5);
        await Promise.all(batch.map(async (content, j) => {
          const embedding = await generateEmbedding(content);
          await admin.from('legal_document_chunks').insert({
            document_id: doc.id,
            content,
            embedding,
            chunk_index: i + j,
            page_numbers: [],
          });
        }));
        console.log(`[reprocess-all] ${doc.document_title}: ${Math.min(i + 5, chunks.length)}/${chunks.length}`);
      }

      await admin.from('legal_documents').update({
        status:        'processed',
        chunk_count:   chunks.length,
        processed_at:  new Date().toISOString(),
        error_message: null,
      }).eq('id', doc.id);

      results.push({ title: doc.document_title, chunks: chunks.length, status: 'ok' });
      console.log(`[reprocess-all] ✓ ${doc.document_title}`);

    } catch (e: any) {
      console.error(`[reprocess-all] ✗ ${doc.document_title}:`, e.message);
      results.push({ title: doc.document_title, chunks: 0, status: e.message });
      await admin.from('legal_documents')
        .update({ error_message: e.message }).eq('id', doc.id);
    }
  }

  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed    = results.filter(r => r.status !== 'ok').length;
  console.log(`[reprocess-all] DONE — ${succeeded} succeeded, ${failed} failed`);

  return NextResponse.json({ success: true, succeeded, failed, results });
}
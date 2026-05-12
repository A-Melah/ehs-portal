import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const admin = createAdminClient();

  // Fetch all chunks with NULL embeddings
  const { data: chunks, error } = await admin
    .from('legal_document_chunks')
    .select('id, content')
    .is('embedding', null)
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!chunks?.length) return NextResponse.json({ message: 'No chunks need re-embedding', count: 0 });

  console.log(`[reembed] re-embedding ${chunks.length} chunks...`);

  let success = 0;
  let failed  = 0;

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < chunks.length; i += 5) {
    const batch = chunks.slice(i, i + 5);
    await Promise.all(batch.map(async chunk => {
      try {
        const embedding = await generateEmbedding(chunk.content);
        await admin
          .from('legal_document_chunks')
          .update({ embedding })
          .eq('id', chunk.id);
        success++;
      } catch (e: any) {
        console.warn(`[reembed] chunk ${chunk.id} failed:`, e.message);
        failed++;
      }
    }));
    console.log(`[reembed] progress: ${Math.min(i + 5, chunks.length)}/${chunks.length}`);
  }

  // Mark documents as processed again
  await admin
    .from('legal_documents')
    .update({ status: 'processed', error_message: null, processed_at: new Date().toISOString() })
    .eq('status', 'uploaded');

  return NextResponse.json({ success, failed, total: chunks.length });
}
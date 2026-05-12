import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function extractDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { driveUrl, title } = await req.json();
  if (!driveUrl) return NextResponse.json({ error: 'Drive URL required' }, { status: 400 });

  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) return NextResponse.json({
    error: 'Could not extract file ID from URL. Make sure it is a valid Google Drive link.'
  }, { status: 400 });

  // Download from Drive (must be publicly shared)
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  let fileBuffer: ArrayBuffer;
  let fileName = `drive-${fileId}.pdf`;

  try {
    const res = await fetch(downloadUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const disposition = res.headers.get('content-disposition') ?? '';
    const nameMatch   = disposition.match(/filename[^;=\n]*=['"]?([^'"\n;]+)/i);
    if (nameMatch?.[1]) fileName = nameMatch[1].trim();
    fileBuffer = await res.arrayBuffer();
  } catch (e: any) {
    return NextResponse.json({
      error: 'Could not download file. Make sure it is shared as "Anyone with the link can view".'
    }, { status: 400 });
  }

  const admin    = createAdminClient();
  const safeName = fileName.replace(/\s+/g, '_');
  const path     = `${user.id}/${Date.now()}-${safeName}`;

  const { error: upErr } = await admin.storage
    .from('legal-documents')
    .upload(path, fileBuffer, { contentType: 'application/pdf', upsert: false });

  if (upErr) return NextResponse.json({ error: 'Upload failed: ' + upErr.message }, { status: 500 });

  const { data: urlData } = admin.storage.from('legal-documents').getPublicUrl(path);

  const docTitle = title?.trim() || fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

  const { data: doc, error: dbErr } = await admin
    .from('legal_documents')
    .insert({
      file_name:       fileName,
      storage_path:    path,
      public_url:      urlData.publicUrl,
      area:            'Safety',
      document_title:  docTitle,
      file_size_bytes: fileBuffer.byteLength,
      uploaded_by:     user.id,
    })
    .select()
    .single();

  if (dbErr || !doc) return NextResponse.json({ error: dbErr?.message }, { status: 500 });

  // Trigger processing async
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/legal-docs/process`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ documentId: doc.id }),
  }).catch(() => {});

  return NextResponse.json({ success: true, documentId: doc.id, title: docTitle });
}
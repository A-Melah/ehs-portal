import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
  req: NextRequest,
  // FIX: Define params as a Promise
  { params }: { params: Promise<{ docId: string }> }
) {
  const supabase = await createClient();
  
  // 1. Await the params to get the docId
  const { docId } = await params;

  // 2. Auth & Role Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
    
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  // 3. Fetch Document Details
  const { data: doc } = await admin
    .from('legal_documents')
    .select('storage_path')
    .eq('id', docId) // Use the awaited docId
    .single();

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    // 4. Delete from storage
    const { error: storageError } = await admin.storage
      .from('legal-documents')
      .remove([doc.storage_path]);

    if (storageError) throw storageError;

    // 5. Delete DB record (assumes CASCADE is set up in Supabase for chunks/embeddings)
    const { error: dbError } = await admin
      .from('legal_documents')
      .delete()
      .eq('id', docId);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
  }
}
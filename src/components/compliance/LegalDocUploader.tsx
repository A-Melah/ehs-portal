'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Upload, X, FileText, Loader2, CheckCircle, AlertCircle, Sparkles, Link, FolderOpen } from 'lucide-react';



interface UploadItem {
  file:        File;
  title:       string;
  status:      'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?:      string;
  documentId?: string;
}

// ── Poll Supabase directly until status changes ──────────────────────────────
async function pollUntilDone(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  onUpdate: (status: string, error?: string, chunks?: number) => void
): Promise<void> {
  const INTERVAL = 4000;  // check every 4 seconds
  const TIMEOUT  = 360000; // 6 minutes max
  const start    = Date.now();

  return new Promise(resolve => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('legal_documents')
        .select('status, error_message, chunk_count')
        .eq('id', documentId)
        .single();

      if (!data) return;

      if (data.status === 'processed') {
        clearInterval(interval);
        onUpdate('processed', undefined, data.chunk_count);
        resolve();
      } else if (data.status === 'failed') {
        clearInterval(interval);
        onUpdate('failed', data.error_message ?? 'Processing failed');
        resolve();
      } else if (Date.now() - start > TIMEOUT) {
        clearInterval(interval);
        onUpdate('failed', 'Timed out — processing took too long. Try retrying from the document list.');
        resolve();
      }
      // else still 'processing' — keep polling
    }, INTERVAL);
  });
}

export default function LegalDocUploader() {
  const router   = useRouter();
  const supabase = createClient();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState<'upload' | 'drive'>('upload');
  const [items, setItems]     = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [driveUrl, setDriveUrl]   = useState('');
  const [driveTitle, setDriveTitle] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError]     = useState('');
  const [driveSuccess, setDriveSuccess] = useState('');

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newItems: UploadItem[] = Array.from(files)
      .filter(f => f.type === 'application/pdf')
      .map(file => ({
        file,
        title:  file.name.replace(/[-_]/g, ' ').replace('.pdf', '').replace(/\.pdf$/i, ''),
        status: 'pending' as const,
      }));
    setItems(prev => [...prev, ...newItems]);
  }

  function updateItem(idx: number, patch: Partial<UploadItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function importFromDrive() {
    if (!driveUrl.trim()) { setDriveError('Please enter a Google Drive URL.'); return; }
    setDriveLoading(true);
    setDriveError('');
    setDriveSuccess('');
    try {
      const res  = await fetch('/api/admin/legal-docs/import-drive', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ driveUrl: driveUrl.trim(), title: driveTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setDriveError(data.error ?? 'Import failed'); return; }
      setDriveSuccess(`"${data.title}" imported and processing — it will appear in Legal Docs shortly.`);
      setDriveUrl('');
      setDriveTitle('');
      setTimeout(() => { setOpen(false); window.location.reload(); }, 2500);
    } catch (e: any) {
      setDriveError(e.message);
    } finally {
      setDriveLoading(false);
    }
  }

  async function processAll() {
    setRunning(true);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status !== 'pending') continue;

      // ── Step 1: Upload file to Supabase Storage ──────────────────────
      updateItem(i, { status: 'uploading' });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) break;

      const safeName = item.file.name.replace(/\s+/g, '_');
      const path     = `${user.id}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('legal-documents')
        .upload(path, item.file, { upsert: false });

      if (upErr) {
        updateItem(i, { status: 'error', error: upErr.message });
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('legal-documents')
        .getPublicUrl(path);

      // ── Step 2: Create DB record ──────────────────────────────────────
      const { data: doc, error: dbErr } = await supabase
        .from('legal_documents')
        .insert({
          file_name:       item.file.name,
          storage_path:    path,
          public_url:      urlData.publicUrl,
          area:            'Safety', // will be auto-detected by Gemini during processing
          document_title:  item.title,
          file_size_bytes: item.file.size,
          uploaded_by:     user.id,
        })
        .select()
        .single();

      if (dbErr || !doc) {
        updateItem(i, { status: 'error', error: dbErr?.message ?? 'DB insert failed' });
        continue;
      }

      updateItem(i, { status: 'processing', documentId: doc.id });

      // ── Step 3: Trigger processing ───────────────────────────────────
      // Fire without awaiting body — server streams status to DB
      const processRes = await fetch('/api/admin/legal-docs/process', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: doc.id }),
      }).catch((e: any) => { console.error('Process fetch failed:', e.message); return null; });

      // If fetch itself failed (network error), mark as error immediately
      if (!processRes) {
        updateItem(i, { status: 'error', error: 'Could not reach processing server. Check your connection.' });
        continue;
      }
      // If server returned an error before streaming
      if (!processRes.ok) {
        const errData = await processRes.json().catch(() => ({}));
        updateItem(i, { status: 'error', error: errData.error ?? `Server error ${processRes.status}` });
        continue;
      }

      // ── Step 4: Poll until done ───────────────────────────────────────
      await pollUntilDone(supabase, doc.id, (status, error, chunks) => {
        if (status === 'processed') {
          updateItem(i, { status: 'done' });
        } else {
          updateItem(i, { status: 'error', error });
        }
      });
    }

    setRunning(false);
    router.refresh();
  }

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const doneCount    = items.filter(i => i.status === 'done').length;
  const errorCount   = items.filter(i => i.status === 'error').length;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
        <Upload size={16} /> Upload PDFs
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center
                        px-4 py-4 sm:py-0 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
               onClick={() => !running && setOpen(false)} />

          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl
                          border border-[var(--color-border)] fade-up flex flex-col
                          max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5
                            border-b border-[var(--color-border)] flex-shrink-0">
              <div>
                <h2 className="text-xl font-display">Upload Legal Documents</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  PDFs will be read by Gemini and indexed for compliance inference
                </p>
              </div>
              {!running && (
                <button onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl
                             hover:bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--color-border)] px-6 flex-shrink-0">
              {[
                { key: 'upload', label: 'Upload PDF',       icon: Upload },
                { key: 'drive',  label: 'Import from Drive', icon: FolderOpen },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key}
                  onClick={() => setTab(key as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                    ${tab === key
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
              {tab === 'upload' && <>
              {/* Drop zone */}
              <label
                className="flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl
                           border-2 border-dashed border-[var(--color-border)] cursor-pointer
                           hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              >
                <Upload size={28} className="text-[var(--color-muted)]" />
                <div className="text-center">
                  <p className="text-sm font-medium">Drop PDF files here or click to browse</p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    Upload regulatory documents · PDF only
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={e => handleFiles(e.target.files)}
                  className="hidden"
                />
              </label>

              {/* File list */}
              {items.length > 0 && (
                <div className="space-y-3">
                  {items.map((item, i) => (
                    <div key={i} className={`card p-4 transition-all
                      ${item.status === 'done'    ? 'border-brand-200 bg-brand-50/20' :
                        item.status === 'error'   ? 'border-red-200 bg-red-50/20' :
                        item.status === 'processing' || item.status === 'uploading'
                          ? 'border-blue-200 bg-blue-50/20' : ''}`}>

                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className="text-red-500" />
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-xs text-[var(--color-muted)] truncate">{item.file.name}</p>

                          <input
                            value={item.title}
                            onChange={e => updateItem(i, { title: e.target.value })}
                            disabled={item.status !== 'pending'}
                            placeholder="Document title (e.g. Factories Act 2004)"
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition
                                       disabled:opacity-60 disabled:cursor-default"
                          />

                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <Sparkles size={11} /> Area auto-detected by Gemini during processing
                          </p>

                          {/* Status message */}
                          {item.status !== 'pending' && (
                            <div className={`flex items-start gap-2 text-xs font-medium
                              ${item.status === 'done'    ? 'text-brand-600' :
                                item.status === 'error'   ? 'text-red-600'   : 'text-blue-600'}`}>
                              {item.status === 'uploading'  && <><Loader2 size={11} className="animate-spin mt-0.5 flex-shrink-0" /> Uploading to storage…</>}
                              {item.status === 'processing' && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <Loader2 size={11} className="animate-spin flex-shrink-0" />
                                    <span>Gemini reading & indexing PDF — this takes 5-8 minutes…</span>
                                  </div>
                                  <p className="text-[10px] text-[var(--color-muted)] pl-4">
                                    Do not close this window. Status updates every 4 seconds.
                                  </p>
                                </div>
                              )}
                              {item.status === 'done'  && <><CheckCircle size={11} className="mt-0.5 flex-shrink-0" /> Indexed and ready</>}
                              {item.status === 'error' && (
                                <div className="flex items-start gap-1.5">
                                  <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                                  <span className="break-words">{item.error}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {item.status === 'pending' && (
                          <button onClick={() => removeItem(i)}
                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50
                                       text-[var(--color-muted)] hover:text-red-500 transition-colors">
                            <X size={13} />
                          </button>
                        )}
                        {item.status === 'error' && (
                          <button onClick={() => updateItem(i, { status: 'pending', error: undefined })}
                            className="flex-shrink-0 text-xs text-amber-600 hover:text-amber-700 font-medium px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors">
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* End upload tab */}
              </>}

              {tab === 'drive' && (
                <div className="space-y-4">
                  <div className="px-4 py-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-700">
                    <p className="font-semibold mb-1">📋 Requirements</p>
                    <p>The Google Drive file must be shared as <strong>"Anyone with the link can view"</strong>. Right-click the file in Drive → Share → Change to Anyone with the link.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">Google Drive URL <span className="text-red-500">*</span></label>
                    <input
                      value={driveUrl}
                      onChange={e => { setDriveUrl(e.target.value); setDriveError(''); }}
                      placeholder="https://drive.google.com/file/d/..."
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Document title <span className="text-[var(--color-muted)] font-normal">(optional — auto-detected if empty)</span>
                    </label>
                    <input
                      value={driveTitle}
                      onChange={e => setDriveTitle(e.target.value)}
                      placeholder="e.g. Factories Act 2024"
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {driveError   && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">{driveError}</p>}
                  {driveSuccess && <p className="text-sm text-brand-600 bg-brand-50 px-4 py-3 rounded-xl border border-brand-100 flex items-center gap-2"><CheckCircle size={14} /> {driveSuccess}</p>}

                  <button
                    onClick={importFromDrive}
                    disabled={driveLoading || !driveUrl.trim()}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {driveLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Importing…</>
                      : <><FolderOpen size={15} /> Import from Google Drive</>
                    }
                  </button>
                </div>
              )}

            </div>

            {/* Footer */}
            {items.length > 0 && tab === 'upload' && (
              <div className="px-6 py-4 border-t border-[var(--color-border)]
                              flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-[var(--color-muted)]">
                  {doneCount > 0     && <span className="text-brand-600 font-medium">{doneCount} done · </span>}
                  {errorCount > 0    && <span className="text-red-600 font-medium">{errorCount} failed · </span>}
                  {pendingCount > 0  && <span>{pendingCount} pending</span>}
                </p>
                <div className="flex gap-2">
                  {!running && (doneCount + errorCount) === items.length && (
                    <button onClick={() => setOpen(false)} className="btn-ghost py-2">Close</button>
                  )}
                  {pendingCount > 0 && !running && (
                    <button onClick={processAll}
                      className="btn-primary flex items-center gap-2 py-2">
                      <Sparkles size={14} />
                      Process {pendingCount} document{pendingCount > 1 ? 's' : ''}
                    </button>
                  )}
                  {running && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
                      <Loader2 size={14} className="animate-spin" />
                      Processing — keep this window open
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
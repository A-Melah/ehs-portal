'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Upload, X, FileText, Loader2, CheckCircle, Sparkles } from 'lucide-react';

type Area = 'Safety' | 'Health' | 'Environment';

const KNOWN_DOCS = [
  { title: 'Factories Act 2004',                                        area: 'Safety'      as Area },
  { title: 'National Fire Safety Code 2013',                            area: 'Safety'      as Area },
  { title: 'National Road Traffic Regulations 2012',                    area: 'Safety'      as Area },
  { title: 'Federal Road Safety Commission Act 2007',                   area: 'Safety'      as Area },
  { title: 'Labour Act 2004',                                           area: 'Safety'      as Area },
  { title: 'Employee\'s Compensation Act 2010',                         area: 'Safety'      as Area },
  { title: 'ISPON Act 2014',                                            area: 'Safety'      as Area },
  { title: 'Industrial Training Fund Act',                              area: 'Safety'      as Area },
  { title: 'National Environmental Health Practice Regulations 2016',   area: 'Health'      as Area },
  { title: 'Public Health Law',                                         area: 'Health'      as Area },
  { title: 'National Environmental Protection (Effluent Limitation) Regulations', area: 'Environment' as Area },
  { title: 'NESREA Regulations (Sanitation, Wastes, Air, Noise, Ozone, Groundwater)', area: 'Environment' as Area },
];

interface UploadItem {
  file:          File;
  title:         string;
  area:          Area;
  status:        'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?:        string;
  documentId?:   string;
}

export default function LegalDocUploader() {
  const router   = useRouter();
  const supabase = createClient();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newItems: UploadItem[] = Array.from(files)
      .filter(f => f.type === 'application/pdf')
      .map(file => {
        // Try to auto-match a known doc title
        const match = KNOWN_DOCS.find(d =>
          file.name.toLowerCase().includes(d.title.toLowerCase().split(' ')[0].toLowerCase())
        );
        return {
          file,
          title: match?.title ?? file.name.replace('.pdf', '').replace(/_/g, ' '),
          area:  match?.area ?? 'Safety',
          status: 'pending' as const,
        };
      });
    setItems(prev => [...prev, ...newItems]);
  }

  function updateItem(idx: number, patch: Partial<UploadItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function processAll() {
    setRunning(true);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status !== 'pending') continue;

      // Step 1: Upload to Supabase Storage
      updateItem(i, { status: 'uploading' });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) break;

      const path = `${user.id}/${Date.now()}-${item.file.name.replace(/\s+/g, '_')}`;

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

      // Step 2: Create DB record
      const { data: doc, error: dbErr } = await supabase
        .from('legal_documents')
        .insert({
          file_name:       item.file.name,
          storage_path:    path,
          public_url:      urlData.publicUrl,
          area:            item.area,
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

      // Step 3: Trigger processing (Gemini extraction + embeddings)
      try {
        const res = await fetch('/api/admin/legal-docs/process', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ documentId: doc.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        updateItem(i, { status: 'done' });
      } catch (err: any) {
        updateItem(i, { status: 'error', error: err.message });
      }
    }

    setRunning(false);
    router.refresh();
  }

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const doneCount    = items.filter(i => i.status === 'done').length;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
        <Upload size={16} /> Upload PDFs
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !running && setOpen(false)} />

          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[var(--color-border)]
                          fade-up flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] flex-shrink-0">
              <div>
                <h2 className="text-xl font-display">Upload Legal Documents</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  PDFs will be read by Gemini and indexed for AI compliance inference
                </p>
              </div>
              {!running && (
                <button onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
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
                    Upload all 12 regulatory documents at once · PDF only
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
                        item.status === 'processing' || item.status === 'uploading' ? 'border-blue-200 bg-blue-50/20' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className="text-red-500" />
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Filename */}
                          <p className="text-xs text-[var(--color-muted)] truncate">{item.file.name}</p>

                          {/* Title input */}
                          <input
                            value={item.title}
                            onChange={e => updateItem(i, { title: e.target.value })}
                            disabled={item.status !== 'pending'}
                            placeholder="Document title (e.g. Factories Act 2004)"
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition
                                       disabled:opacity-60 disabled:cursor-default"
                          />

                          {/* Area selector */}
                          <select
                            value={item.area}
                            onChange={e => updateItem(i, { area: e.target.value as Area })}
                            disabled={item.status !== 'pending'}
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition
                                       disabled:opacity-60 disabled:cursor-default"
                          >
                            <option value="Safety">Safety</option>
                            <option value="Health">Health</option>
                            <option value="Environment">Environment</option>
                          </select>

                          {/* Status */}
                          {item.status !== 'pending' && (
                            <div className={`flex items-center gap-2 text-xs font-medium
                              ${item.status === 'done'       ? 'text-brand-600' :
                                item.status === 'error'      ? 'text-red-600'   :
                                'text-blue-600'}`}>
                              {item.status === 'uploading'   && <><Loader2 size={11} className="animate-spin" /> Uploading to storage…</>}
                              {item.status === 'processing'  && <><Loader2 size={11} className="animate-spin" /> Gemini reading & indexing PDF…</>}
                              {item.status === 'done'        && <><CheckCircle size={11} /> Indexed and ready</>}
                              {item.status === 'error'       && <>⚠ {item.error}</>}
                            </div>
                          )}
                        </div>

                        {item.status === 'pending' && (
                          <button onClick={() => removeItem(i)}
                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-[var(--color-muted)] hover:text-red-500 transition-colors">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-[var(--color-muted)]">
                  {doneCount > 0 && <span className="text-brand-600 font-medium">{doneCount} done · </span>}
                  {pendingCount} remaining
                  {running && ' · Processing takes 1–3 min per document'}
                </p>
                <div className="flex gap-2">
                  {!running && doneCount === items.length && (
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
                      Processing… do not close this window
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
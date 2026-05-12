'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ReprocessAllButton() {
  const [state,   setState]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<{ title: string; chunks: number; status: string }[]>([]);
  const [show,    setShow]    = useState(false);

  async function handleReprocess() {
    if (!confirm('This will re-read all PDFs and regenerate all embeddings. It may take 3-5 minutes. Continue?')) return;
    setState('loading');
    setResults([]);
    try {
      const res  = await fetch('/api/admin/legal-docs/reprocess-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        return;
      }
      setState('done');
      setResults(data.results ?? []);
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setState('error');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleReprocess}
        disabled={state === 'loading'}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-300
                   bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100
                   transition-colors disabled:opacity-50"
      >
        {state === 'loading'
          ? <><Loader2 size={14} className="animate-spin" /> Reprocessing all docs…</>
          : state === 'done'
          ? <><CheckCircle size={14} /> Done</>
          : <><RefreshCw size={14} /> Reprocess All Docs</>
        }
      </button>

      {state === 'loading' && (
        <p className="text-xs text-violet-600">Check terminal for progress…</p>
      )}

      {results.length > 0 && (
        <div className="text-xs text-right">
          <button onClick={() => setShow(s => !s)} className="text-brand-600 hover:underline">
            {show ? 'Hide' : 'Show'} results
          </button>
          {show && (
            <div className="mt-1 space-y-0.5 text-left bg-white border rounded-xl p-3 max-w-xs shadow">
              {results.map(r => (
                <div key={r.title} className="flex items-center gap-2">
                  {r.status === 'ok'
                    ? <CheckCircle size={11} className="text-brand-600 flex-shrink-0" />
                    : <AlertTriangle size={11} className="text-red-500 flex-shrink-0" />
                  }
                  <span className="truncate">{r.title}</span>
                  {r.status === 'ok' && <span className="text-[var(--color-muted)]">{r.chunks} chunks</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
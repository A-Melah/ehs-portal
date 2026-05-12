'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, CheckCircle } from 'lucide-react';

export default function ReEmbedButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');

  async function handleReEmbed() {
    setState('loading');
    setResult('');
    try {
      const res  = await fetch('/api/admin/legal-docs/reembed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setResult(data.error ?? 'Failed');
      } else if (data.count === 0 || data.message) {
        setState('done');
        setResult('All chunks already embedded ✓');
      } else {
        setState('done');
        setResult(`Re-embedded ${data.success} chunks${data.failed ? ` (${data.failed} failed)` : ''}`);
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e: any) {
      setState('error');
      setResult(e.message);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleReEmbed}
        disabled={state === 'loading'}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300
                   bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100
                   transition-colors disabled:opacity-50"
      >
        {state === 'loading'
          ? <><Loader2 size={14} className="animate-spin" /> Re-embedding…</>
          : state === 'done'
          ? <><CheckCircle size={14} /> Re-embedded</>
          : <><RefreshCw size={14} /> Re-embed Chunks</>
        }
      </button>
      {result && (
        <p className={`text-xs ${state === 'error' ? 'text-red-600' : 'text-brand-600'}`}>
          {result}
        </p>
      )}
    </div>
  );
}
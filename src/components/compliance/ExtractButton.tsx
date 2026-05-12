'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  documentId:    string;
  documentTitle: string;
  status:        string;
}

export default function ExtractButton({ documentId, documentTitle, status }: Props) {
  const router = useRouter();
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<{ count: number } | null>(null);
  const [error,     setError]     = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  if (status !== 'processed') return null;

  async function extract(replace: boolean) {
    setShowConfirm(false);
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res  = await fetch('/api/admin/legal-docs/process', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, replaceExisting: replace }),
      });

      // Guard against HTML error pages from Next.js
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        setError(`Server error (${res.status}) — check terminal for details`);
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Extraction failed');
      } else {
        setResult({ count: data.extracted });
        // Hard reload so server component re-fetches updated doc.error_message
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-blue-600">
        <Loader2 size={12} className="animate-spin" />
        Gemini extracting requirements… (3-5 min)
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-brand-600 font-medium">
          <CheckCircle size={12} />
          {result.count} requirements extracted
        </span>
        <button
          onClick={() => { setResult(null); setShowConfirm(true); }}
          className="text-xs text-[var(--color-muted)] hover:text-brand-600 underline"
        >
          Re-extract
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle size={12} />
          {error.slice(0, 60)}
        </span>
        <button
          onClick={() => { setError(''); setShowConfirm(true); }}
          className="text-xs text-[var(--color-muted)] hover:text-red-500"
        >
          <RotateCcw size={11} />
        </button>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[var(--color-muted)]">Replace existing requirements?</span>
        <button
          onClick={() => extract(true)}
          className="px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
        >
          Yes, replace
        </button>
        <button
          onClick={() => extract(false)}
          className="px-2 py-1 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 font-medium"
        >
          Add new only
        </button>
        <button onClick={() => setShowConfirm(false)} className="text-[var(--color-muted)] hover:text-red-500">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100
                 text-violet-700 text-xs font-medium transition-colors"
      title={`Extract legal requirements from ${documentTitle}`}
    >
      <Sparkles size={12} />
      Extract Requirements
    </button>
  );
}
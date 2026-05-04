'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2, Loader2 } from 'lucide-react';

export default function LegalDocActions({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [retrying,  setRetrying]  = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [error,     setError]     = useState('');

  async function retry() {
    setRetrying(true);
    setError('');
    try {
      const res  = await fetch('/api/admin/legal-docs/process', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Processing failed');
      else router.refresh();
    } catch (e: any) {
      setError(e.message);
    }
    setRetrying(false);
  }

  async function del() {
    if (!confirm('Delete this document and all its indexed chunks?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/legal-docs/${documentId}`, { method: 'DELETE' });
      router.refresh();
    } catch {}
    setDeleting(false);
  }

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-xs text-red-600 max-w-xs truncate" title={error}>{error}</span>
      )}
      <button
        onClick={retry}
        disabled={retrying}
        title="Retry processing"
        className="p-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-600 transition-colors"
      >
        {retrying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
      </button>
      <button
        onClick={del}
        disabled={deleting}
        title="Delete document"
        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </div>
  );
}
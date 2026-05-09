'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, AlertTriangle, RefreshCcw } from 'lucide-react';

const MESSAGES = [
  'Analysing legal requirements…',
  'Generating compliance measures for each regulation…',
  'Assigning responsible persons…',
  'Determining frequencies and due dates…',
  'Building your audit checklist…',
];

export default function AuditPrepLoader({
  auditId,
  auditTitle,
  sections,
  currentStatus,
}: {
  auditId:       string;
  auditTitle:    string;
  sections:      string[];
  currentStatus: string;
}) {
  const router = useRouter();

  const [status,  setStatus]  = useState(currentStatus);
  const [msgIdx,  setMsgIdx]  = useState(0);
  const [error,   setError]   = useState('');
  const [started, setStarted] = useState(false);

  // Cycle through messages while preparing
  useEffect(() => {
    if (status !== 'preparing') return;
    const interval = setInterval(() => {
      setMsgIdx(i => (i + 1) % MESSAGES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [status]);

  // Poll DB until ready
  useEffect(() => {
    if (status !== 'preparing') return;

    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/compliance/prep-status?auditId=${auditId}`);
        const data = await res.json();
        if (data.status === 'ready') {
          clearInterval(interval);
          router.refresh();
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setStatus('failed');
          setError(data.error ?? 'Preparation failed. Please try again.');
        }
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [status, auditId, router]);

  async function startPreparation() {
    setStarted(true);
    setStatus('preparing');
    setError('');

    // Fire-and-forget
    fetch('/api/compliance/prepare', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ auditId }),
    }).catch(() => {});
  }

  if (status === 'pending' || (!started && status === 'failed')) {
    return (
      <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-6">
          <Sparkles size={28} className="text-brand-600" />
        </div>
        <h1 className="text-3xl font-display mb-2">{auditTitle}</h1>
        <p className="text-[var(--color-muted)] text-sm mb-2">
          {sections.join(' · ')}
        </p>
        <p className="text-sm text-[var(--color-muted)] max-w-md mb-8 leading-relaxed">
          Before you start, Gemini will analyse all legal requirements and pre-generate
          compliance measures, responsible persons, frequencies, and due dates.
          You'll only need to validate each one as ✓ or ✗.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100 mb-4 max-w-md">
            {error}
          </p>
        )}
        <button onClick={startPreparation} className="btn-primary flex items-center gap-2 px-8 py-3 text-base">
          <Sparkles size={18} />
          Prepare Audit with AI
        </button>
        <p className="text-xs text-[var(--color-muted)] mt-4">Takes 2–5 minutes depending on section count</p>
      </div>
    );
  }

  if (status === 'failed' && started) {
    return (
      <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
          <AlertTriangle size={28} className="text-red-600" />
        </div>
        <h2 className="text-2xl font-display mb-2">Preparation Failed</h2>
        <p className="text-sm text-red-600 max-w-md mb-6">{error}</p>
        <button onClick={startPreparation} className="btn-primary flex items-center gap-2 px-6 py-2.5">
          <RefreshCcw size={16} /> Retry
        </button>
      </div>
    );
  }

  // preparing
  return (
    <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-6">
        <Loader2 size={28} className="text-brand-600 animate-spin" />
      </div>
      <h2 className="text-2xl font-display mb-2">Preparing Your Audit</h2>
      <p className="text-sm text-[var(--color-muted)] mb-8 min-h-[20px] transition-all">
        {MESSAGES[msgIdx]}
      </p>

      {/* Progress dots */}
      <div className="flex gap-2 mb-8">
        {MESSAGES.map((_, i) => (
          <div key={i}
            className={`w-2 h-2 rounded-full transition-all duration-500
              ${i === msgIdx ? 'bg-brand-600 scale-125' : 'bg-brand-200'}`}
          />
        ))}
      </div>

      <div className="card p-5 max-w-sm text-left space-y-2">
        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">
          Sections being prepared
        </p>
        {sections.map(s => (
          <div key={s} className="flex items-center gap-2 text-sm">
            <Loader2 size={12} className="text-brand-400 animate-spin flex-shrink-0" />
            {s}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--color-muted)] mt-6">Do not close this tab</p>
    </div>
  );
}
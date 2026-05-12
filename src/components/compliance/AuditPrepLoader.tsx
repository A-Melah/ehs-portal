'use client';

import { useEffect, useState, useRef } from 'react';
import { Sparkles, Loader2, AlertTriangle, RefreshCcw, CheckCircle } from 'lucide-react';

const MESSAGES = [
  'Analysing legal requirements…',
  'Generating compliance measures for each regulation…',
  'Assigning responsible persons and owners…',
  'Determining audit frequencies and due dates…',
  'Building your audit checklist…',
];

export default function AuditPrepLoader({
  auditId,
  auditTitle,
  industryId,
  subSectorId,
  industryName,
  subSectorName,
  currentStatus,
}: {
  auditId:       string;
  auditTitle:    string;
  industryId:    string | null;
  subSectorId:   string | null;
  industryName:  string;
  subSectorName: string | null;
  currentStatus: string;
}) {
  // If already preparing (e.g. page refreshed mid-prep), auto-start polling
  const alreadyPreparing = currentStatus === 'preparing';

  const [phase,   setPhase]   = useState<'idle' | 'preparing' | 'done' | 'failed'>(
    alreadyPreparing ? 'preparing' : 'idle'
  );
  const [msgIdx,  setMsgIdx]  = useState(0);
  const [error,   setError]   = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Message cycler
  useEffect(() => {
    if (phase !== 'preparing') return;
    const t = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 3500);
    return () => clearInterval(t);
  }, [phase]);

  function startPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);

    const start   = Date.now();
    const TIMEOUT = 10 * 60 * 1000;

    pollingRef.current = setInterval(async () => {
      if (Date.now() - start > TIMEOUT) {
        clearInterval(pollingRef.current!);
        setPhase('failed');
        setError('Timed out after 10 minutes. Click Retry to try again.');
        return;
      }

      try {
        const res  = await fetch(`/api/compliance/prep-status?auditId=${auditId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'ready') {
          clearInterval(pollingRef.current!);
          setPhase('done');
          // Brief pause so user sees "Ready!" then hard reload
          setTimeout(() => window.location.reload(), 1200);
        } else if (data.status === 'failed') {
          clearInterval(pollingRef.current!);
          setPhase('failed');
          setError('Preparation failed — Gemini may be overloaded. Click Retry.');
        }
      } catch {}
    }, 4000);
  }

  // If page loaded with status already 'preparing', start polling immediately
  useEffect(() => {
    if (alreadyPreparing) startPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPreparation() {
    setPhase('preparing');
    setError('');
    setMsgIdx(0);

    // Fire prepare with a 3-minute timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);

    fetch('/api/compliance/prepare', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ auditId, industryId, subSectorId, industryName, subSectorName }),
      signal:  controller.signal,
    }).then(async res => {
      clearTimeout(timeout);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[loader] prepare failed:', data.error);
        clearInterval(pollingRef.current!);
        setPhase('failed');
        setError(data.error ?? 'Preparation failed. Click Retry.');
      }
    }).catch(e => {
      clearTimeout(timeout);
      console.error('[loader] prepare fetch error:', e.message);
      clearInterval(pollingRef.current!);
      setPhase('failed');
      setError(e.name === 'AbortError'
        ? 'Preparation timed out after 3 minutes. Click Retry.'
        : 'Network error during preparation. Click Retry.');
    });

    // Start polling immediately
    startPolling();
  }

  // ── Idle: show Prepare button ────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-6">
          <Sparkles size={28} className="text-brand-600" />
        </div>
        <h1 className="text-3xl font-display mb-2">{auditTitle}</h1>
        <p className="text-sm text-[var(--color-muted)] mb-2">{industryName}{subSectorName ? ' — ' + subSectorName : ''}</p>
        <p className="text-sm text-[var(--color-muted)] max-w-md mb-8 leading-relaxed">
          Before you start, Gemini will analyse all legal requirements and pre-generate
          compliance measures, responsible persons, frequencies, and due dates.
          You'll only need to validate each one as Yes / Partial / No.
        </p>
        <button
          onClick={startPreparation}
          className="btn-primary flex items-center gap-2 px-8 py-3 text-base"
        >
          <Sparkles size={18} />
          Prepare Audit with AI
        </button>
        <p className="text-xs text-[var(--color-muted)] mt-4">
          Takes 1–3 minutes depending on section count
        </p>
      </div>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
          <AlertTriangle size={28} className="text-red-600" />
        </div>
        <h2 className="text-2xl font-display mb-2">Preparation Failed</h2>
        <p className="text-sm text-red-600 max-w-md mb-6">{error}</p>
        <button
          onClick={startPreparation}
          className="btn-primary flex items-center gap-2 px-6 py-2.5"
        >
          <RefreshCcw size={16} /> Retry
        </button>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-6">
          <CheckCircle size={28} className="text-brand-600" />
        </div>
        <h2 className="text-2xl font-display mb-2">Audit Ready!</h2>
        <p className="text-sm text-[var(--color-muted)]">Loading your audit checklist…</p>
        <Loader2 size={20} className="text-brand-400 animate-spin mt-4" />
      </div>
    );
  }

  // ── Preparing ────────────────────────────────────────────────────────────
  return (
    <div className="fade-up flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-6">
        <Loader2 size={28} className="text-brand-600 animate-spin" />
      </div>
      <h2 className="text-2xl font-display mb-2">Preparing Your Audit</h2>
      <p className="text-sm text-[var(--color-muted)] mb-8 min-h-[20px]">
        {MESSAGES[msgIdx]}
      </p>

      <div className="flex gap-2 mb-8">
        {MESSAGES.map((_, i) => (
          <div key={i}
            className={`w-2 h-2 rounded-full transition-all duration-500
              ${i === msgIdx ? 'bg-brand-600 scale-125' : 'bg-brand-200'}`}
          />
        ))}
      </div>

      <div className="card p-5 max-w-sm text-left space-y-2">
        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
          Sections being prepared
        </p>
        {[industryName, subSectorName].filter(Boolean).map(s => (
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
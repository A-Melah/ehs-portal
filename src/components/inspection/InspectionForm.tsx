'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle, XCircle, Loader2, AlertTriangle,
  ChevronDown, QrCode, Camera, X, Upload
} from 'lucide-react';
import type { Asset, ChecklistTemplate } from '@/types';
import dynamic from 'next/dynamic';

const QRScanner = dynamic(() => import('./QRScanner'), { ssr: false });

interface Props { assets: Asset[] }

interface QuestionState {
  value:       boolean | null;
  aiVerdict:   string | null;
  breachLevel: string | null;
  loading:     boolean;
  mediaUrl:    string | null;
  uploading:   boolean;
}

export default function InspectionForm({ assets }: Props) {
  const router   = useRouter();
  const supabase = createClient();

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [questions, setQuestions]         = useState<ChecklistTemplate[]>([]);
  const [answers, setAnswers]             = useState<Record<string, QuestionState>>({});
  const [submitting, setSubmitting]       = useState(false);
  const [notes, setNotes]                 = useState('');
  const [error, setError]                 = useState('');
  const [showScanner, setShowScanner]     = useState(false);

  useEffect(() => {
    if (!selectedAsset) return;
    supabase
      .from('checklist_templates')
      .select('*, regulation:regulations(statute_title, section, content)')
      .eq('asset_type', selectedAsset.type)
      .order('order_index')
      .then(({ data }) => {
        setQuestions(data ?? []);
        const init: Record<string, QuestionState> = {};
        (data ?? []).forEach(q => {
          init[q.id] = {
            value: null, aiVerdict: null, breachLevel: null,
            loading: false, mediaUrl: null, uploading: false,
          };
        });
        setAnswers(init);
      });
  }, [selectedAsset]);

  // Called by QRScanner with the decoded tag_number
  function handleQRScan(tagNumber: string) {
    setShowScanner(false);
    const asset = assets.find(a => a.tag_number === tagNumber);
    if (asset) {
      setSelectedAsset(asset);
    } else {
      setError(`No active asset found with tag: ${tagNumber}`);
    }
  }

  async function handleAnswer(question: ChecklistTemplate, passed: boolean) {
    const prev = answers[question.id];
    setAnswers(a => ({
      ...a,
      [question.id]: { ...prev, value: passed, loading: !passed, aiVerdict: null, breachLevel: null },
    }));

    if (!passed) {
      try {
        const res = await fetch('/api/ai-audit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            questionText: question.question_text,
            assetType:    selectedAsset?.type,
            legalRefId:   question.legal_ref_id,
          }),
        });
        const result = await res.json();
        setAnswers(a => ({
          ...a,
          [question.id]: {
            ...a[question.id],
            loading:     false,
            aiVerdict:   result.verdict,
            breachLevel: result.breach_level,
          },
        }));
      } catch {
        setAnswers(a => ({
          ...a,
          [question.id]: {
            ...a[question.id],
            loading:     false,
            aiVerdict:   'AI audit unavailable.',
            breachLevel: 'moderate',
          },
        }));
      }
    }
  }

  async function handleEvidenceUpload(questionId: string, file: File) {
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be under 20 MB.');
      return;
    }

    setAnswers(a => ({ ...a, [questionId]: { ...a[questionId], uploading: true } }));

    const ext      = file.name.split('.').pop();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error: uploadErr } = await supabase.storage
      .from('inspection-evidence')
      .upload(filename, file, { upsert: false });

    if (uploadErr) {
      setError('Upload failed: ' + uploadErr.message);
      setAnswers(a => ({ ...a, [questionId]: { ...a[questionId], uploading: false } }));
      return;
    }

    const { data: urlData } = supabase.storage
      .from('inspection-evidence')
      .getPublicUrl(data.path);

    setAnswers(a => ({
      ...a,
      [questionId]: { ...a[questionId], uploading: false, mediaUrl: urlData.publicUrl },
    }));
  }

  async function handleSubmit() {
    if (!selectedAsset) return;
    const answeredAll = questions.every(q => answers[q.id]?.value !== null);
    if (!answeredAll) { setError('Please answer all questions before submitting.'); return; }

    setSubmitting(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();

    const passed   = Object.values(answers).filter(a => a.value === true).length;
    const score    = Math.round((passed / questions.length) * 100);
    const hasCritical = Object.values(answers).some(a => a.breachLevel === 'critical');

    const { data: inspection, error: insError } = await supabase
      .from('inspections')
      .insert({
        asset_id:         selectedAsset.id,
        inspector_id:     user!.id,
        compliance_score: score,
        status:           hasCritical ? 'flagged' : 'completed',
        notes,
      })
      .select()
      .single();

    if (insError || !inspection) {
      setError('Failed to save inspection. Please try again.');
      setSubmitting(false);
      return;
    }

    const responses = questions.map(q => ({
      inspection_id:   inspection.id,
      question_id:     q.id,
      value:           answers[q.id].value!,
      media_url:       answers[q.id].mediaUrl,
      ai_verdict:      answers[q.id].aiVerdict,
      ai_breach_level: answers[q.id].breachLevel ?? 'none',
    }));

    await supabase.from('responses').insert(responses);
    router.push('/dashboard/inspections');
    router.refresh();
  }

  const breachColors: Record<string, string> = {
    critical: 'border-red-200 bg-red-50',
    moderate: 'border-amber-200 bg-amber-50',
    minor:    'border-yellow-200 bg-yellow-50',
    none:     'border-brand-200 bg-brand-50',
  };

  return (
    <div className="space-y-6">
      {showScanner && (
        <QRScanner onScan={handleQRScan} onClose={() => setShowScanner(false)} />
      )}

      {/* Asset selector */}
      <div className="card p-5">
        <label className="block text-sm font-medium mb-2">Select Asset</label>

        {/* QR + dropdown row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm appearance-none pr-10 transition"
              value={selectedAsset?.id ?? ''}
              onChange={e => {
                const asset = assets.find(a => a.id === e.target.value) ?? null;
                setSelectedAsset(asset);
                setAnswers({});
                setQuestions([]);
                setError('');
              }}
            >
              <option value="" disabled>Choose an asset…</option>
              {assets.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.tag_number})</option>
              ))}
            </select>
            <ChevronDown size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
          </div>

          {/* QR scan button */}
          <button
            onClick={() => setShowScanner(true)}
            title="Scan QR code"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border)]
                       bg-white hover:bg-[var(--color-surface)] text-sm font-medium transition-colors"
          >
            <QrCode size={16} />
            <span className="hidden sm:inline">Scan QR</span>
          </button>
        </div>

        {selectedAsset && (
          <div className="mt-3 flex gap-4 text-xs text-[var(--color-muted)]">
            <span>Type: <strong className="text-[var(--color-text)]">{selectedAsset.type}</strong></span>
            <span>Location: <strong className="text-[var(--color-text)]">{selectedAsset.location}</strong></span>
            <span>Tag: <strong className="text-[var(--color-text)] font-mono">{selectedAsset.tag_number}</strong></span>
          </div>
        )}
      </div>

      {/* Checklist */}
      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            const state  = answers[q.id];
            const breach = state?.breachLevel;
            return (
              <div key={q.id}
                className={`card p-5 transition-all ${state?.value === false ? breachColors[breach ?? 'moderate'] : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono text-[var(--color-muted)] mt-0.5 w-5 flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{q.question_text}</p>
                    {q.is_critical && (
                      <span className="inline-block mt-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        Critical
                      </span>
                    )}

                    {/* Pass / Fail */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleAnswer(q, true)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors
                          ${state?.value === true
                            ? 'bg-brand-600 text-white'
                            : 'bg-white border border-[var(--color-border)] text-[var(--color-muted)] hover:border-brand-500 hover:text-brand-600'
                          }`}
                      >
                        <CheckCircle size={14} /> Pass
                      </button>
                      <button
                        onClick={() => handleAnswer(q, false)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors
                          ${state?.value === false
                            ? 'bg-red-500 text-white'
                            : 'bg-white border border-[var(--color-border)] text-[var(--color-muted)] hover:border-red-400 hover:text-red-500'
                          }`}
                      >
                        <XCircle size={14} /> Fail
                      </button>
                    </div>

                    {/* Evidence upload */}
                    {state?.value !== null && (
                      <div className="mt-3">
                        {state.mediaUrl ? (
                          <div className="relative inline-block">
                            <img
                              src={state.mediaUrl}
                              alt="Evidence"
                              className="h-24 w-auto rounded-xl border border-[var(--color-border)] object-cover"
                            />
                            <button
                              onClick={() => setAnswers(a => ({
                                ...a, [q.id]: { ...a[q.id], mediaUrl: null }
                              }))}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white
                                         rounded-full flex items-center justify-center hover:bg-red-600"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                                            border border-dashed border-[var(--color-border)] text-xs
                                            text-[var(--color-muted)] cursor-pointer hover:border-brand-400
                                            hover:text-brand-600 transition-colors">
                            {state.uploading
                              ? <><Loader2 size={12} className="animate-spin" /> Uploading…</>
                              : <><Camera size={12} /> Add photo evidence</>
                            }
                            <input
                              type="file"
                              accept="image/*,video/*"
                              capture="environment"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleEvidenceUpload(q.id, file);
                              }}
                              className="hidden"
                              disabled={state.uploading}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    {/* AI loading */}
                    {state?.loading && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-amber-700">
                        <Loader2 size={12} className="animate-spin" /> Running AI compliance audit…
                      </div>
                    )}

                    {/* AI verdict */}
                    {state?.aiVerdict && !state.loading && (
                      <div className="mt-3 p-3 rounded-xl bg-white/70 border text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle size={12} />
                          AI Verdict — {breach?.toUpperCase()} breach
                        </div>
                        <p className="text-[var(--color-text)] leading-relaxed">{state.aiVerdict}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes + Submit */}
      {questions.length > 0 && (
        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Additional Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Any observations, contextual details, or follow-up actions…"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none transition"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit Inspection'}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!selectedAsset && (
        <div className="card p-10 text-center">
          <QrCode size={32} className="mx-auto text-[var(--color-muted)] opacity-30 mb-3" />
          <p className="text-sm text-[var(--color-muted)]">
            Select an asset from the list or scan its QR code to load the checklist
          </p>
        </div>
      )}
    </div>
  );
}

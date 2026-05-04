'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ShieldAlert, CheckCircle, Loader2, Upload, X, LogOut } from 'lucide-react';

type Severity = 'low' | 'moderate' | 'high' | 'critical';

const severityConfig: Record<Severity, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  moderate: { label: 'Moderate', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  high:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
};

export default function ReportPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [userId, setUserId]           = useState<string | null>(null);
  const [workerName, setWorkerName]   = useState('');
  const [location, setLocation]       = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity]       = useState<Severity>('moderate');
  const [file, setFile]               = useState<File | null>(null);
  const [preview, setPreview]         = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return; }
      setUserId(user.id);
    });
    supabase.from('profiles').select('full_name').then(({ data }) => {
      if (data?.[0]) setWorkerName(data[0].full_name);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError('File must be under 10 MB.'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  }

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  async function handleSubmit() {
    if (!location.trim())    { setError('Please enter the hazard location.'); return; }
    if (!description.trim()) { setError('Please describe the hazard.'); return; }

    setSubmitting(true);
    setError('');

    let evidence_url: string | undefined;

    if (file) {
      const ext      = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: upload, error: uploadErr } = await supabase.storage
        .from('hazard-evidence')
        .upload(filename, file, { upsert: false });

      if (!uploadErr && upload) {
        const { data: urlData } = supabase.storage
          .from('hazard-evidence')
          .getPublicUrl(upload.path);
        evidence_url = urlData.publicUrl;
      }
    }

    const { error: insertErr } = await supabase
      .from('hazard_reports')
      .insert({
        reporter_id:  userId,
        location:     location.trim(),
        description:  description.trim(),
        severity,
        evidence_url,
      });

    if (insertErr) {
      setError('Failed to submit. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] px-4">
        <div className="w-full max-w-md text-center fade-up">
          <div className="w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-brand-600" />
          </div>
          <h1 className="text-3xl font-display mb-2">Report Submitted</h1>
          <p className="text-[var(--color-muted)] text-sm leading-relaxed mb-8">
            Your hazard report has been received and the EHS team has been notified.
            Thank you for keeping the workplace safe.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setSubmitted(false);
                setLocation('');
                setDescription('');
                setSeverity('moderate');
                clearFile();
              }}
              className="btn-primary px-8 py-2.5"
            >
              Report another hazard
            </button>
            <button onClick={handleLogout}
              className="btn-ghost px-8 py-2.5 flex items-center justify-center gap-2 text-sm">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Report form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-surface)] px-4 py-10">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 15% 60%, #ef444422 0%, transparent 50%), radial-gradient(circle at 85% 20%, #f59e0b22 0%, transparent 50%)' }}
      />

      <div className="relative w-full max-w-lg mx-auto fade-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <ShieldAlert className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-display leading-tight">Report a Hazard</h1>
              {workerName && (
                <p className="text-xs text-[var(--color-muted)] mt-0.5">Signed in as {workerName}</p>
              )}
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]
                       px-3 py-2 rounded-xl hover:bg-white border border-transparent hover:border-[var(--color-border)] transition-all">
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <div className="card p-6 space-y-5">
          {/* Location */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Where is the hazard? <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Warehouse A, near loading bay 3"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Describe the hazard <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="What did you see? e.g. Oil spill on the floor, exposed electrical wiring, blocked fire exit…"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none transition"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium mb-2">How serious is it?</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(severityConfig) as [Severity, typeof severityConfig.low][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setSeverity(key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all
                    ${severity === key
                      ? `${cfg.bg} ${cfg.color} ring-2 ring-current/30`
                      : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
                    }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo evidence */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Photo / video evidence <span className="text-[var(--color-muted)] font-normal">(optional)</span>
            </label>
            {preview ? (
              <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)]">
                <img src={preview} alt="Preview" className="w-full h-40 object-cover" />
                <button onClick={clearFile}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full
                             flex items-center justify-center transition-colors">
                  <X size={13} className="text-white" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl
                                border-2 border-dashed border-[var(--color-border)] cursor-pointer
                                hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                <Upload size={20} className="text-[var(--color-muted)]" />
                <span className="text-sm text-[var(--color-muted)]">Tap to add a photo</span>
                <span className="text-xs text-[var(--color-muted)]">JPG, PNG, MP4 · max 10 MB</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>
          )}

          <button onClick={handleSubmit} disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShieldAlert size={18} />}
            {submitting ? 'Submitting…' : 'Submit Hazard Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
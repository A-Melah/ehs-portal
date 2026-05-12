'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ShieldAlert, CheckCircle, Loader2, Upload, X, LogOut,
         AlertTriangle, Zap, Eye, Siren } from 'lucide-react';

type Severity   = 'low' | 'moderate' | 'high' | 'critical';
type ReportType = 'hazard' | 'near_miss' | 'incident' | 'accident';

const reportTypeConfig: Record<ReportType, {
  label: string; desc: string; icon: any;
  color: string; bg: string; border: string;
}> = {
  hazard:    { label: 'Hazard',     desc: 'Unsafe condition or situation that could cause harm',    icon: ShieldAlert,    color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-300' },
  near_miss: { label: 'Near Miss',  desc: 'An event that could have caused harm but did not',       icon: Eye,            color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-300'  },
  incident:  { label: 'Incident',   desc: 'An event that caused disruption but no serious injury',  icon: AlertTriangle,  color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-300'},
  accident:  { label: 'Accident',   desc: 'An event that resulted in injury, illness or damage',    icon: Siren,          color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-300'   },
};

const severityConfig: Record<Severity, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
  moderate: { label: 'Moderate', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200'  },
  high:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200'},
  critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
};

export default function ReportPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [userId, setUserId]                 = useState<string | null>(null);
  const [workerName, setWorkerName]         = useState('');
  const [reportType, setReportType]         = useState<ReportType>('hazard');
  const [location, setLocation]             = useState('');
  const [description, setDescription]       = useState('');
  const [severity, setSeverity]             = useState<Severity>('moderate');
  const [dateOfEvent, setDateOfEvent]       = useState('');
  const [injuryDetails, setInjuryDetails]   = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [file, setFile]                     = useState<File | null>(null);
  const [preview, setPreview]               = useState<string | null>(null);
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [error, setError]                   = useState('');

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

  function resetForm() {
    setLocation(''); setDescription(''); setSeverity('moderate');
    setDateOfEvent(''); setInjuryDetails(''); setCorrectiveAction('');
    clearFile(); setSubmitted(false);
  }

  async function handleSubmit() {
    if (!location.trim())    { setError('Please enter the location.'); return; }
    if (!description.trim()) { setError('Please describe what happened.'); return; }

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
        const { data: urlData } = supabase.storage.from('hazard-evidence').getPublicUrl(upload.path);
        evidence_url = urlData.publicUrl;
      }
    }

    const { error: insertErr } = await supabase
      .from('hazard_reports')
      .insert({
        reporter_id:       userId,
        report_type:       reportType,
        location:          location.trim(),
        description:       description.trim(),
        severity,
        evidence_url,
        date_of_event:     dateOfEvent || null,
        injury_details:    injuryDetails.trim() || null,
        corrective_action: correctiveAction.trim() || null,
      });

    if (insertErr) {
      setError('Failed to submit. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  const typeCfg = reportTypeConfig[reportType];
  const TypeIcon = typeCfg.icon;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] px-4">
        <div className="w-full max-w-md text-center fade-up">
          <div className="w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-brand-600" />
          </div>
          <h1 className="text-3xl font-display mb-2">Report Submitted</h1>
          <p className="text-[var(--color-muted)] text-sm leading-relaxed mb-2">
            Your <strong>{typeCfg.label}</strong> report has been received and the EHS team has been notified.
          </p>
          <p className="text-[var(--color-muted)] text-sm mb-8">Thank you for keeping the workplace safe.</p>
          <div className="flex flex-col gap-3">
            <button onClick={resetForm} className="btn-primary px-8 py-2.5">
              Submit another report
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl ${typeCfg.bg} ${typeCfg.border} border flex items-center justify-center shadow-sm flex-shrink-0`}>
              <TypeIcon className={typeCfg.color} size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-display leading-tight">EHS Report</h1>
              {workerName && <p className="text-xs text-[var(--color-muted)] mt-0.5">Signed in as {workerName}</p>}
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]
                       px-3 py-2 rounded-xl hover:bg-white border border-transparent hover:border-[var(--color-border)] transition-all">
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <div className="card p-6 space-y-5">

          {/* Report type selector */}
          <div>
            <label className="block text-sm font-medium mb-2">What are you reporting? <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(reportTypeConfig) as [ReportType, typeof reportTypeConfig.hazard][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const selected = reportType === key;
                return (
                  <button key={key} onClick={() => setReportType(key)}
                    className={`flex items-start gap-2.5 px-3 py-3 rounded-xl border text-left transition-all
                      ${selected
                        ? `${cfg.bg} ${cfg.border} border-2 ring-2 ring-current/20`
                        : 'bg-white border-[var(--color-border)] hover:border-gray-300'
                      }`}>
                    <Icon size={16} className={selected ? cfg.color : 'text-[var(--color-muted)]'} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p className={`text-xs font-semibold ${selected ? cfg.color : 'text-[var(--color-text)]'}`}>{cfg.label}</p>
                      <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-0.5">{cfg.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date of event */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Date & time of event
              <span className="text-[var(--color-muted)] font-normal ml-1">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={dateOfEvent}
              onChange={e => setDateOfEvent(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Where did it happen? <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Production Floor, near Mixer 3"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              What happened? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder={
                reportType === 'hazard'    ? 'Describe the unsafe condition, e.g. oil spill on floor, exposed wiring…' :
                reportType === 'near_miss' ? 'Describe what nearly happened and how it was avoided…' :
                reportType === 'incident'  ? 'Describe the incident — what happened, what was affected…' :
                                             'Describe the accident — what happened, how it occurred…'
              }
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none transition"
            />
          </div>

          {/* Injury details — shown for incident and accident */}
          {(reportType === 'incident' || reportType === 'accident') && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Injury / illness details
                <span className="text-[var(--color-muted)] font-normal ml-1">(if any)</span>
              </label>
              <textarea
                value={injuryDetails}
                onChange={e => setInjuryDetails(e.target.value)}
                rows={3}
                placeholder="Describe any injuries, body parts affected, first aid given…"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                           focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none transition"
              />
            </div>
          )}

          {/* Corrective action taken */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Immediate action taken
              <span className="text-[var(--color-muted)] font-normal ml-1">(optional)</span>
            </label>
            <textarea
              value={correctiveAction}
              onChange={e => setCorrectiveAction(e.target.value)}
              rows={2}
              placeholder="e.g. Area cordoned off, spill cleaned, first aid administered…"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none transition"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium mb-2">Severity</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(severityConfig) as [Severity, typeof severityConfig.low][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setSeverity(key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all
                    ${severity === key
                      ? `${cfg.bg} ${cfg.color} ring-2 ring-current/30`
                      : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
                    }`}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo evidence */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Photo / video evidence
              <span className="text-[var(--color-muted)] font-normal ml-1">(optional)</span>
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
                <input type="file" accept="image/*,video/*" capture="environment"
                  onChange={handleFile} className="hidden" />
              </label>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>
          )}

          <button onClick={handleSubmit} disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <TypeIcon size={18} />}
            {submitting ? 'Submitting…' : `Submit ${typeCfg.label} Report`}
          </button>
        </div>
      </div>
    </div>
  );
}
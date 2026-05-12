'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { ShieldAlert, CheckCircle, Loader2, Upload, X,
         AlertTriangle, Eye, Siren, Plus } from 'lucide-react';

type Severity   = 'low' | 'moderate' | 'high' | 'critical';
type ReportType = 'hazard' | 'near_miss' | 'incident' | 'accident';

const reportTypeConfig: Record<ReportType, { label: string; desc: string; icon: any; color: string; bg: string; border: string }> = {
  hazard:    { label: 'Hazard',    desc: 'Unsafe condition that could cause harm',       icon: ShieldAlert,   color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300'  },
  near_miss: { label: 'Near Miss', desc: 'Event that could have caused harm but did not', icon: Eye,           color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300'   },
  incident:  { label: 'Incident',  desc: 'Event that caused disruption but no injury',   icon: AlertTriangle, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300' },
  accident:  { label: 'Accident',  desc: 'Event resulting in injury, illness or damage', icon: Siren,         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'    },
};

const severityConfig: Record<Severity, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
  moderate: { label: 'Moderate', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200'  },
  high:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200'},
  critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
};

function ReportForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const supabase = createClient();

  const [userId, setUserId]             = useState<string | null>(null);
  const [reportType, setReportType]     = useState<ReportType>('hazard');
  const [location, setLocation]         = useState('');
  const [description, setDescription]   = useState('');
  const [severity, setSeverity]         = useState<Severity>('moderate');
  const [dateOfEvent, setDateOfEvent]   = useState('');
  const [injuryDetails, setInjuryDetails] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [file, setFile]                 = useState<File | null>(null);
  const [preview, setPreview]           = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

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
    if (!location.trim())    { setError('Please enter the location.'); return; }
    if (!description.trim()) { setError('Please describe what happened.'); return; }
    setSubmitting(true);
    setError('');

    let evidence_url: string | undefined;
    if (file) {
      const ext      = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: upload, error: upErr } = await supabase.storage
        .from('hazard-evidence').upload(filename, file, { upsert: false });
      if (!upErr && upload) {
        const { data: urlData } = supabase.storage.from('hazard-evidence').getPublicUrl(upload.path);
        evidence_url = urlData.publicUrl;
      }
    }

    const { error: insertErr } = await supabase.from('hazard_reports').insert({
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

    setSubmitting(false);
    if (insertErr) { setError('Failed to submit. Please try again.'); return; }
    onSuccess();
  }

  const typeCfg  = reportTypeConfig[reportType];
  const TypeIcon = typeCfg.icon;

  return (
    <div className="space-y-4">
      {/* Report type */}
      <div>
        <label className="block text-sm font-medium mb-2">What are you reporting? <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(reportTypeConfig) as [ReportType, any][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const sel  = reportType === key;
            return (
              <button key={key} onClick={() => setReportType(key)}
                className={`flex items-start gap-2.5 px-3 py-3 rounded-xl border text-left transition-all
                  ${sel ? `${cfg.bg} ${cfg.border} border-2` : 'bg-white border-[var(--color-border)] hover:border-gray-300'}`}>
                <Icon size={15} className={sel ? cfg.color : 'text-[var(--color-muted)]'} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className={`text-xs font-semibold ${sel ? cfg.color : ''}`}>{cfg.label}</p>
                  <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-0.5">{cfg.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Date & time <span className="text-[var(--color-muted)] font-normal">(optional)</span>
        </label>
        <input type="datetime-local" value={dateOfEvent} onChange={e => setDateOfEvent(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                     focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm" />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Location <span className="text-red-500">*</span></label>
        <input type="text" value={location} onChange={e => setLocation(e.target.value)}
          placeholder="e.g. Production Floor, near Mixer 3"
          className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                     focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm" />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-1.5">What happened? <span className="text-red-500">*</span></label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          placeholder={
            reportType === 'hazard'    ? 'Describe the unsafe condition…' :
            reportType === 'near_miss' ? 'Describe what nearly happened…' :
            reportType === 'incident'  ? 'Describe the incident…' : 'Describe the accident…'
          }
          className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                     focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none" />
      </div>

      {/* Injury details */}
      {(reportType === 'incident' || reportType === 'accident') && (
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Injury details <span className="text-[var(--color-muted)] font-normal">(if any)</span>
          </label>
          <textarea value={injuryDetails} onChange={e => setInjuryDetails(e.target.value)} rows={2}
            placeholder="Describe any injuries, body parts affected, first aid given…"
            className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none" />
        </div>
      )}

      {/* Corrective action */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Immediate action taken <span className="text-[var(--color-muted)] font-normal">(optional)</span>
        </label>
        <textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} rows={2}
          placeholder="e.g. Area cordoned off, spill cleaned…"
          className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                     focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none" />
      </div>

      {/* Severity */}
      <div>
        <label className="block text-sm font-medium mb-2">Severity</label>
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(severityConfig) as [Severity, any][]).map(([key, cfg]) => (
            <button key={key} onClick={() => setSeverity(key)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all
                ${severity === key ? `${cfg.bg} ${cfg.color}` : 'bg-white border-[var(--color-border)] text-[var(--color-muted)]'}`}>
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Photo */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Photo evidence <span className="text-[var(--color-muted)] font-normal">(optional)</span>
        </label>
        {preview ? (
          <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)]">
            <img src={preview} alt="Preview" className="w-full h-32 object-cover" />
            <button onClick={clearFile}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full
                         flex items-center justify-center">
              <X size={13} className="text-white" />
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl
                            border-2 border-dashed border-[var(--color-border)] cursor-pointer
                            hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
            <Upload size={16} className="text-[var(--color-muted)]" />
            <span className="text-sm text-[var(--color-muted)]">Add a photo</span>
            <input type="file" accept="image/*,video/*" onChange={handleFile} className="hidden" />
          </label>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting}
          className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <TypeIcon size={14} />}
          {submitting ? 'Submitting…' : `Submit ${typeCfg.label}`}
        </button>
      </div>
    </div>
  );
}

export default function ReportModal() {
  const [open,      setOpen]    = useState(false);
  const [success,   setSuccess] = useState(false);
  const [mounted,   setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function handleSuccess() {
    setSuccess(true);
    // Auto-close and refresh after 2.5s
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
      window.location.reload();
    }, 2500);
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setSuccess(false); }}
        className="btn-primary flex items-center gap-2 flex-shrink-0">
        <Plus size={15} /> Submit Report
      </button>

      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div onClick={() => !success && setOpen(false)}
            className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200
              ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} />

          {/* Modal */}
          <div className={`fixed inset-x-4 inset-y-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2
                          sm:top-4 sm:bottom-4 sm:w-full sm:max-w-lg z-50 bg-white rounded-2xl shadow-2xl
                          flex flex-col transition-all duration-200
                          ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
              <div>
                <h2 className="text-lg font-display">Submit a Report</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">Hazard · Near Miss · Incident · Accident</p>
              </div>
              {!success && (
                <button onClick={() => setOpen(false)}
                  className="p-2 rounded-xl hover:bg-[var(--color-surface)] transition-colors">
                  <X size={16} className="text-[var(--color-muted)]" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {success ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10 gap-4">
                  <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center">
                    <CheckCircle size={32} className="text-brand-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-display mb-1">Report Submitted</h3>
                    <p className="text-sm text-[var(--color-muted)]">The EHS team has been notified.</p>
                  </div>
                </div>
              ) : (
                <ReportForm onSuccess={handleSuccess} onClose={() => setOpen(false)} />
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
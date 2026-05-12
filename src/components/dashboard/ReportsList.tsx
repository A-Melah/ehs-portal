'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, AlertTriangle, Eye, Siren, ChevronDown,
         ChevronRight, X, ZoomIn } from 'lucide-react';
import HazardStatusUpdater from '@/components/dashboard/HazardStatusUpdater';

const typeConfig: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  hazard:    { label: 'Hazard',    icon: ShieldAlert,   color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-l-amber-400'   },
  near_miss: { label: 'Near Miss', icon: Eye,           color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-l-blue-400'    },
  incident:  { label: 'Incident',  icon: AlertTriangle, color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-l-orange-500'  },
  accident:  { label: 'Accident',  icon: Siren,         color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-l-red-500'     },
};

const severityStyle: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-green-700',  bg: 'bg-green-100'  },
  moderate: { label: 'Moderate', color: 'text-amber-700',  bg: 'bg-amber-100'  },
  high:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-100' },
  critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-100'    },
};

const statusStyle: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: 'Open',        color: 'text-red-700',   bg: 'bg-red-100'   },
  in_progress: { label: 'In Progress', color: 'text-amber-700', bg: 'bg-amber-100' },
  resolved:    { label: 'Resolved',    color: 'text-brand-700', bg: 'bg-brand-100' },
};

export default function ReportsList({
  reports,
  canUpdateStatus,
}: {
  reports:         any[];
  canUpdateStatus: boolean;
}) {
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
  const [lightbox,  setLightbox]  = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!reports.length) {
    return (
      <div className="card p-12 text-center">
        <ShieldAlert size={32} className="mx-auto text-brand-400 opacity-40 mb-3" />
        <p className="text-sm text-[var(--color-muted)]">No reports found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {reports.map(report => {
          const typeCfg = typeConfig[report.report_type ?? 'hazard'] ?? typeConfig.hazard;
          const TypeIcon = typeCfg.icon;
          const sev      = severityStyle[report.severity] ?? severityStyle.moderate;
          const sts      = statusStyle[report.status]     ?? statusStyle.open;
          const isOpen   = expanded.has(report.id);

          return (
            <div key={report.id}
              className={`card border-l-4 overflow-hidden transition-shadow hover:shadow-md
                ${report.status === 'resolved' ? 'border-l-brand-400' : typeCfg.border}`}>

              {/* ── Collapsed header — always visible, clickable ── */}
              <button
                onClick={() => toggle(report.id)}
                className="w-full flex items-start gap-4 p-5 text-left"
              >
                {/* Type icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeCfg.bg}`}>
                  <TypeIcon size={18} className={typeCfg.color} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeCfg.bg} ${typeCfg.color}`}>
                      {typeCfg.label}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.bg} ${sev.color}`}>
                      {sev.label}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sts.bg} ${sts.color}`}>
                      {sts.label}
                    </span>
                  </div>

                  <p className="font-semibold text-sm">{report.location}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-1">
                    {report.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[var(--color-muted)]">
                    <span>
                      {new Date(report.date_of_event ?? report.created_at)
                        .toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {report.reporter?.full_name && <span>· {report.reporter.full_name}</span>}
                    {report.evidence_url && (
                      <span className="flex items-center gap-0.5 text-brand-600">
                        <ZoomIn size={11} /> photo attached
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 text-[var(--color-muted)] mt-1">
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {/* ── Expanded detail ── */}
              {isOpen && (
                <div className="px-5 pb-5 pt-1 border-t border-[var(--color-border)] bg-[var(--color-surface)] space-y-4">

                  {/* Full description */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                      Description
                    </p>
                    <p className="text-sm leading-relaxed">{report.description}</p>
                  </div>

                  {/* Injury details */}
                  {report.injury_details && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-1">
                        Injury / Illness Details
                      </p>
                      <p className="text-sm leading-relaxed text-red-700 bg-red-50 px-3 py-2 rounded-xl">
                        {report.injury_details}
                      </p>
                    </div>
                  )}

                  {/* Corrective action */}
                  {report.corrective_action && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600 mb-1">
                        Immediate Action Taken
                      </p>
                      <p className="text-sm leading-relaxed text-brand-700 bg-brand-50 px-3 py-2 rounded-xl">
                        {report.corrective_action}
                      </p>
                    </div>
                  )}

                  {/* Evidence image */}
                  {report.evidence_url && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-2">
                        Photo Evidence
                      </p>
                      <img
                        src={report.evidence_url}
                        alt="Evidence"
                        onClick={() => setLightbox(report.evidence_url)}
                        className="h-40 w-auto rounded-xl object-cover border border-[var(--color-border)]
                                   cursor-pointer hover:opacity-90 transition-opacity"
                      />
                      <p className="text-xs text-[var(--color-muted)] mt-1">Click image to enlarge</p>
                    </div>
                  )}

                  {/* Status updater */}
                  {canUpdateStatus && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-2">
                        Update Status
                      </p>
                      <HazardStatusUpdater reportId={report.id} currentStatus={report.status} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] mx-4" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox}
              alt="Evidence"
              className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center
                         justify-center shadow-lg text-gray-700 hover:text-red-600 transition-colors"
            >
              <X size={16} />
            </button>
            <a
              href={lightbox}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-xs bg-white px-3 py-1.5
                         rounded-full shadow text-gray-600 hover:text-brand-600 transition-colors whitespace-nowrap"
            >
              Open full size ↗
            </a>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
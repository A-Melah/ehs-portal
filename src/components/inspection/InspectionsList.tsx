'use client';

import { useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle, AlertTriangle, Clock, Download,
  ChevronRight, ChevronDown, Check, X, Minus
} from 'lucide-react';

const statusConfig = {
  completed:   { icon: CheckCircle,   color: 'text-brand-600', bg: 'bg-brand-50',  label: 'Completed'   },
  flagged:     { icon: AlertTriangle, color: 'text-red-600',   bg: 'bg-red-50',    label: 'Flagged'     },
  in_progress: { icon: Clock,         color: 'text-amber-600', bg: 'bg-amber-50',  label: 'In Progress' },
};

export default function InspectionsList({ inspections }: { inspections: any[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!inspections.length) {
    return (
      <div className="card p-12 text-center">
        <ClipboardList size={36} className="mx-auto text-[var(--color-muted)] mb-3 opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No inspections yet.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide w-8"></th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Asset</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Inspector</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Score</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Status</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Date</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Report</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {inspections.map(ins => {
            const cfg      = statusConfig[ins.status as keyof typeof statusConfig] ?? statusConfig.in_progress;
            const Icon     = cfg.icon;
            const score    = Math.round(ins.compliance_score ?? 0);
            const isOpen   = expanded.has(ins.id);
            const responses: any[] = ins.responses ?? [];
            const passed   = responses.filter(r => r.value === true).length;
            const failed   = responses.filter(r => r.value === false).length;

            return (
              <Fragment key={ins.id}>
                {/* Main row — clickable */}
                <tr
                  onClick={() => toggle(ins.id)}
                  className="hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3.5 text-[var(--color-muted)]">
                    {isOpen
                      ? <ChevronDown size={14} />
                      : <ChevronRight size={14} />
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{ins.asset?.name ?? '—'}</p>
                    <p className="text-xs text-[var(--color-muted)]">{ins.asset?.type}</p>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-muted)]">
                    {ins.inspector?.full_name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-semibold
                      ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {score}%
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      <Icon size={11} /> {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-muted)] text-xs">
                    {new Date(ins.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                    <a href={`/api/reports/${ins.id}`} download
                      className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]
                                 hover:text-brand-600 transition-colors">
                      <Download size={13} /> PDF
                    </a>
                  </td>
                </tr>

                {/* Expanded detail row */}
                {isOpen && (
                  <tr key={`${ins.id}-detail`}>
                    <td colSpan={7} className="px-6 py-5 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
                      <div className="space-y-4">

                        {/* Summary chips */}
                        <div className="flex flex-wrap gap-3 text-xs">
                          {ins.asset?.location && (
                            <span className="px-3 py-1 bg-white border border-[var(--color-border)] rounded-full">
                              📍 {ins.asset.location}
                            </span>
                          )}
                          {responses.length > 0 && (
                            <>
                              <span className="px-3 py-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full">
                                ✓ {passed} Yes
                              </span>
                              {failed > 0 && (
                                <span className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full">
                                  ✗ {failed} No
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Checklist responses */}
                        {responses.length > 0 ? (
                          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-white border-b border-[var(--color-border)]">
                                  <th className="text-left px-4 py-2 font-semibold text-[var(--color-muted)]">Checklist Item</th>
                                  <th className="text-left px-4 py-2 font-semibold text-[var(--color-muted)] w-20">Result</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--color-border)]">
                                {responses.map((r: any) => (
                                  <tr key={r.id} className={r.value === false ? 'bg-red-50/40' : 'bg-white'}>
                                    <td className="px-4 py-2.5">{(r.question as any)?.question_text ?? '—'}</td>
                                    <td className="px-4 py-2.5">
                                      <div className="space-y-1.5">
                                        {r.value === true  && <span className="flex items-center gap-1 text-brand-600 font-semibold"><Check size={12} /> Yes</span>}
                                        {r.value === false && <span className="flex items-center gap-1 text-red-600 font-semibold"><X size={12} /> No</span>}
                                        {r.value === null  && <span className="flex items-center gap-1 text-[var(--color-muted)]"><Minus size={12} /> N/A</span>}
                                        {r.media_url && (
                                          <img
                                            src={r.media_url}
                                            alt="Evidence"
                                            onClick={() => setLightbox(r.media_url)}
                                            className="mt-1 h-16 w-24 object-cover rounded-lg border border-[var(--color-border)] hover:opacity-80 transition-opacity cursor-pointer"
                                          />
                                        )}
                                      </div>
                                    </td>

                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--color-muted)] italic">No checklist responses recorded.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Lightbox */}
      {typeof window !== 'undefined' && lightbox && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
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
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-xs bg-white px-3 py-1.5
                         rounded-full shadow text-gray-600 hover:text-brand-600 transition-colors"
            >
              Open full size ↗
            </a>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ClipboardList({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  );
}
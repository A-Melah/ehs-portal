'use client';

import { useMemo } from 'react';
import { CheckCircle, XCircle, Minus, Download, AlertTriangle } from 'lucide-react';

type ComplianceAudit = {
  id: string;
  title: string;
  period?: string;
  completed_at?: string;
  created_at: string;
  sections: string[];
  overall_score?: number;
};

type LegalRequirement = {
  id: string;
  area: 'Safety' | 'Health' | 'Environment';
  legal_document: string;
  source_section: string;
  specific_requirement: string;
  applies_to_sections: string[];
};

type AuditLineItem = {
  id: string;
  requirement_id: string;
  section: string;
  status: 'compliant' | 'non_compliant' | 'not_applicable' | 'not_assessed';
  inspector_notes?: string;
  ai_verdict?: string;
  ai_override_reason?: string;
  responsible_person?: string;
  due_date?: string;
};

const statusConfig = {
  compliant:      { icon: CheckCircle, color: 'text-brand-600', bg: 'bg-brand-100', label: 'Compliant' },
  non_compliant:  { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-100',   label: 'Non-Compliant' },
  not_applicable: { icon: Minus,       color: 'text-gray-500',  bg: 'bg-gray-100',  label: 'N/A' },
  not_assessed:   { icon: Minus,       color: 'text-gray-400',  bg: 'bg-gray-50',   label: 'Not Assessed' },
};

const areaColors: Record<string, string> = {
  Safety:      'bg-red-100 text-red-700',
  Health:      'bg-blue-100 text-blue-700',
  Environment: 'bg-brand-100 text-brand-700',
};

export default function ComplianceAuditReport({
  audit,
  requirements,
  lineItems,
}: {
  audit:        ComplianceAudit;
  requirements: LegalRequirement[];
  lineItems:    AuditLineItem[];
}) {
  // Build lookup
  const itemMap = useMemo(() => {
    const map: Record<string, AuditLineItem> = {};
    lineItems.forEach(li => { map[`${li.requirement_id}::${li.section}`] = li; });
    return map;
  }, [lineItems]);

  const sections = audit.sections as string[];

  // Stats by area
  const statsByArea = useMemo(() => {
    const areas = ['Safety', 'Health', 'Environment'] as const;
    return areas.map(area => {
      const reqs     = requirements.filter(r => r.area === area);
      const items    = lineItems.filter(li => reqs.some(r => r.id === li.requirement_id));
      const applicable = items.filter(i => i.status !== 'not_applicable');
      const compliant  = applicable.filter(i => i.status === 'compliant').length;
      const nonComp    = applicable.filter(i => i.status === 'non_compliant').length;
      const score      = applicable.length > 0 ? Math.round((compliant / applicable.length) * 100) : 100;
      return { area, total: reqs.length, compliant, nonComp, score };
    });
  }, [requirements, lineItems]);

  const overallScore = Math.round(audit.overall_score ?? 0);
  const totalNonComp = lineItems.filter(i => i.status === 'non_compliant').length;

  return (
    <div className="fade-up space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wide mb-1">Compliance Audit Report</p>
          <h1 className="text-3xl font-display">{audit.title}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {audit.period && <strong>{audit.period} · </strong>}
            Completed {new Date(audit.completed_at ?? audit.created_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {sections.map(s => (
              <span key={s} className="text-xs bg-white border border-[var(--color-border)] px-2.5 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>
        <a
          href={`/api/compliance/${audit.id}/report`}
          download
          className="btn-primary flex items-center gap-2 flex-shrink-0"
        >
          <Download size={16} /> Download PDF
        </a>
      </div>

      {/* Overall score + area breakdown */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="card p-5 sm:col-span-1 flex flex-col items-center justify-center text-center">
          <p className={`text-5xl font-display font-bold
            ${overallScore >= 80 ? 'text-brand-600' : overallScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {overallScore}%
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">Overall Compliance</p>
          {totalNonComp > 0 && (
            <p className="text-xs text-red-600 mt-2 font-medium">{totalNonComp} non-compliant items</p>
          )}
        </div>

        {statsByArea.map(({ area, compliant, nonComp, score }) => (
          <div key={area} className="card p-5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${areaColors[area]}`}>{area}</span>
            <p className={`text-3xl font-display font-bold mt-3
              ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {score}%
            </p>
            <div className="flex gap-3 mt-1 text-xs text-[var(--color-muted)]">
              <span className="text-brand-600">{compliant} ✓</span>
              {nonComp > 0 && <span className="text-red-600">{nonComp} ✗</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Non-compliant items summary */}
      {totalNonComp > 0 && (
        <div className="card border-2 border-red-200 bg-red-50/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-600" />
            <h2 className="text-sm font-semibold text-red-700">{totalNonComp} Non-Compliant Items Requiring Action</h2>
          </div>
          <div className="space-y-3">
            {lineItems
              .filter(li => li.status === 'non_compliant')
              .map(li => {
                const req = requirements.find(r => r.id === li.requirement_id);
                if (!req) return null;
                return (
                  <div key={li.id} className="bg-white rounded-xl p-4 border border-red-100">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-xs font-mono text-[var(--color-muted)]">{req.legal_document} · {req.source_section}</p>
                        <p className="text-sm font-medium mt-0.5">{req.specific_requirement.slice(0, 120)}…</p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">{li.section}</span>
                    </div>
                    {li.ai_verdict && (
                      <p className="text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">{li.ai_verdict}</p>
                    )}
                    {li.ai_override_reason && (
                      <p className="text-xs text-[var(--color-muted)] mt-1">
                        <strong>Action:</strong> {li.ai_override_reason}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-muted)]">
                      {li.responsible_person && <span>Owner: <strong>{li.responsible_person}</strong></span>}
                      {li.due_date && <span>Due: <strong>{new Date(li.due_date).toLocaleDateString('en-NG')}</strong></span>}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Full master list — one section at a time per area */}
      {sections.map(section => (
        <div key={section} className="space-y-4">
          <h2 className="text-xl font-display border-b border-[var(--color-border)] pb-2">{section}</h2>

          {(['Safety', 'Health', 'Environment'] as const).map(area => {
            const reqs = requirements.filter(r => r.area === area && r.applies_to_sections.includes(section));
            if (!reqs.length) return null;

            return (
              <div key={area}>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${areaColors[area]}`}>{area}</span>
                <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                        <th className="text-left px-4 py-2 text-[var(--color-muted)] font-semibold w-8">#</th>
                        <th className="text-left px-4 py-2 text-[var(--color-muted)] font-semibold">Legal Reference</th>
                        <th className="text-left px-4 py-2 text-[var(--color-muted)] font-semibold">Requirement</th>
                        <th className="text-left px-4 py-2 text-[var(--color-muted)] font-semibold">Finding</th>
                        <th className="text-left px-4 py-2 text-[var(--color-muted)] font-semibold">AI Verdict</th>
                        <th className="text-left px-4 py-2 text-[var(--color-muted)] font-semibold w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {reqs.map((req, i) => {
                        const li  = itemMap[`${req.id}::${section}`];
                        const st  = (li?.status ?? 'not_assessed') as keyof typeof statusConfig;
                        const cfg = statusConfig[st];
                        const Icon = cfg.icon;
                        return (
                          <tr key={req.id} className={st === 'non_compliant' ? 'bg-red-50/40' : 'bg-white'}>
                            <td className="px-4 py-3 text-[var(--color-muted)]">{i + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{req.legal_document}</p>
                              <p className="text-[var(--color-muted)]">{req.source_section}</p>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <p className="leading-relaxed">{req.specific_requirement.slice(0, 120)}…</p>
                            </td>
                            <td className="px-4 py-3 max-w-xs text-[var(--color-muted)] italic">
                              {li?.inspector_notes ?? '—'}
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              {li?.ai_verdict ? (
                                <p className="leading-relaxed">{li.ai_verdict.slice(0, 100)}…</p>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 font-semibold px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                                <Icon size={10} /> {cfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

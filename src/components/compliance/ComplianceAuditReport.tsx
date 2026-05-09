'use client';

import { useMemo, useState, Fragment } from 'react';
import {
  CheckCircle, XCircle, Minus, Download, AlertTriangle,
  User, Clock, Calendar, ChevronDown, ChevronRight
} from 'lucide-react';
import type { LegalRequirement, AuditLineItem, ComplianceAudit } from '@/types';

const statusConfig = {
  compliant:      { icon: CheckCircle, color: 'text-brand-600', bg: 'bg-brand-100', label: 'Compliant' },
  non_compliant:  { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-100',   label: 'Non-Compliant' },
  not_applicable: { icon: Minus,       color: 'text-gray-500',  bg: 'bg-gray-100',  label: 'N/A' },
  not_assessed:   { icon: Minus,       color: 'text-gray-400',  bg: 'bg-gray-50',   label: 'Not Assessed' },
};

const answerLabel: Record<string, string> = {
  yes:     '✓ Implemented',
  partial: '~ Partial',
  no:      '✗ Not implemented',
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
  const itemMap = useMemo(() => {
    const map: Record<string, AuditLineItem> = {};
    lineItems.forEach(li => { map[`${li.requirement_id}::${li.section}`] = li; });
    return map;
  }, [lineItems]);

  const sections = audit.sections as string[];

  // Stats by area
  const statsByArea = useMemo(() => {
    return (['Safety', 'Health', 'Environment'] as const).map(area => {
      const reqs       = requirements.filter(r => r.area === area);
      const items      = lineItems.filter(li => reqs.some(r => r.id === li.requirement_id));
      // All non-N/A requirements count — not_assessed = non-compliant for scoring
      const compliant  = items.filter(i => i.status === 'compliant').length;
      const nonComp    = items.filter(i => i.status !== 'compliant' && i.status !== 'not_applicable').length;
      // Denominator includes unassessed sections (no line item = not assessed = non-compliant)
      const denominator = reqs.reduce((acc, r) => {
        const n = (audit.sections as string[]).filter(s => r.applies_to_sections.includes(s)).length;
        return acc + n;
      }, 0);
      const score = denominator > 0 ? Math.round((compliant / denominator) * 100) : 0;
      return { area, total: reqs.length, compliant, nonComp, score };
    });
  }, [requirements, lineItems]);

  // Always recalculate live from line items — stored overall_score may be stale
  // if it was computed with the old formula (assessed-only denominator).
  // Rule: compliant ÷ all non-N/A requirements (not_assessed = non-compliant)
  const overallScore = useMemo(() => {
    let compliant = 0;
    let total     = 0;
    requirements.forEach(req => {
      (audit.sections as string[]).forEach(section => {
        if (!req.applies_to_sections.includes(section)) return;
        total++;
        const li = itemMap[`${req.id}::${section}`];
        if (li?.status === 'compliant') compliant++;
      });
    });
    return total > 0 ? Math.round((compliant / total) * 100) : 0;
  }, [requirements, lineItems, audit.sections, itemMap]);
  const nonCompliantItems = lineItems.filter(i => i.status === 'non_compliant');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(key: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const notAssessedCount  = useMemo(() => {
    let total = 0;
    requirements.forEach(req => {
      (audit.sections as string[]).forEach(section => {
        if (!req.applies_to_sections.includes(section)) return;
        const li = itemMap[`${req.id}::${section}`];
        if (!li || li.status === 'not_assessed') total++;
      });
    });
    return total;
  }, [requirements, lineItems, audit.sections, itemMap]);

  return (
    <div className="fade-up space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div>
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wide mb-1">
            Compliance Audit Report
          </p>
          <h1 className="text-3xl font-display">{audit.title}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {audit.period && <strong>{audit.period} · </strong>}
            Completed {new Date(audit.completed_at ?? audit.created_at).toLocaleDateString('en-NG', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {sections.map(s => (
              <span key={s}
                className="text-xs bg-white border border-[var(--color-border)] px-2.5 py-0.5 rounded-full">
                {s}
              </span>
            ))}
          </div>
        </div>
        <a
          href={`/api/compliance/${audit.id}/report`}
          download
          className="btn-primary flex items-center gap-2 flex-shrink-0 self-start"
        >
          <Download size={16} /> Download PDF
        </a>
      </div>

      {/* ── Score cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-5 col-span-1 flex flex-col items-center justify-center text-center">
          <p className={`text-5xl font-display font-bold
            ${overallScore >= 80 ? 'text-brand-600' :
              overallScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {overallScore}%
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">Overall Compliance</p>
          {nonCompliantItems.length > 0 && (
            <p className="text-xs text-red-600 mt-2 font-medium">
              {nonCompliantItems.length} non-compliant
            </p>
          )}
          {notAssessedCount > 0 && (
            <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 font-medium">{notAssessedCount} not assessed</p>
              <p className="text-[10px] text-amber-600">Counted as non-compliant</p>
            </div>
          )}
        </div>

        {statsByArea.map(({ area, compliant, nonComp, score }) => (
          <div key={area} className="card p-5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${areaColors[area]}`}>
              {area}
            </span>
            <p className={`text-3xl font-display font-bold mt-3
              ${score >= 80 ? 'text-brand-600' :
                score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {score}%
            </p>
            <div className="flex gap-3 mt-1 text-xs">
              <span className="text-brand-600">{compliant} ✓</span>
              {nonComp > 0 && <span className="text-red-600">{nonComp} ✗</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Action required panel ── */}
      {nonCompliantItems.length > 0 && (
        <div className="card border-2 border-red-200 bg-red-50/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-600" />
            <h2 className="text-sm font-semibold text-red-700">
              {nonCompliantItems.length} Items Requiring Corrective Action
            </h2>
          </div>
          <div className="space-y-3">
            {nonCompliantItems.map(li => {
              const req = requirements.find(r => r.id === li.requirement_id);
              if (!req) return null;
              const measure = (li as any).ai_measures ?? req.compliance_measures;
              return (
                <div key={li.id} className="bg-white rounded-xl p-4 border border-red-100">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-[var(--color-muted)]">
                        {req.legal_document} · {req.source_section}
                      </p>
                      <p className="text-sm font-semibold mt-0.5">{measure}</p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">
                        {req.specific_requirement.slice(0, 140)}…
                      </p>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                      {li.section}
                    </span>
                  </div>

                  {/* Inspector answer */}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    <span className="text-red-600 font-medium">
                      Inspector: {answerLabel[(li as any).inspector_answer ?? 'no'] ?? '✗ Not implemented'}
                    </span>
                    {li.responsible_person && (
                      <span className="flex items-center gap-1 text-[var(--color-muted)]">
                        <User size={10} /> {li.responsible_person}
                      </span>
                    )}
                    {(li as any).frequency && (
                      <span className="flex items-center gap-1 text-[var(--color-muted)]">
                        <Clock size={10} /> {(li as any).frequency}
                      </span>
                    )}
                    {li.due_date && (
                      <span className="flex items-center gap-1 text-[var(--color-muted)]">
                        <Calendar size={10} /> {li.due_date}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Master list per section ── */}
      {sections.map(section => (
        <div key={section} className="space-y-4">
          <h2 className="text-xl font-display border-b border-[var(--color-border)] pb-2">
            {section}
          </h2>

          {(['Safety', 'Health', 'Environment'] as const).map(area => {
            const reqs = requirements.filter(
              r => r.area === area && r.applies_to_sections.includes(section)
            );
            if (!reqs.length) return null;

            return (
              <div key={area}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-sm font-bold px-3 py-1.5 rounded-full ${areaColors[area]}`}>
                    {area}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {reqs.length} requirement{reqs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: area === 'Safety' ? '#fca5a5' : area === 'Health' ? '#93c5fd' : '#6ee7b7' }}>
                  <table className="w-full text-xs table-fixed">
                    <colgroup>
                        <col className="w-8" />
                        <col className="w-40" />
                        <col className="w-[22%]" />
                        <col className="w-[22%]" />
                        <col className="w-28" />
                        <col className="w-28" />
                        <col className="w-24" />
                        <col className="w-28" />
                        <col className="w-24" />
                      </colgroup>
                    <thead>
                      <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">#</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Legal Reference</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Requirement</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Compliance Measure</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Validation</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Owner</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Frequency</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Due Date</th>
                        <th className="text-left px-3 py-2.5 text-[var(--color-muted)] font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {reqs.map((req, i) => {
                        const li        = itemMap[`${req.id}::${section}`];
                        const st        = (li?.status ?? 'not_assessed') as keyof typeof statusConfig;
                        const cfg       = statusConfig[st];
                        const Icon      = cfg.icon;
                        const answer    = (li as any)?.inspector_answer;
                        const measure   = (li as any)?.ai_measures ?? req.compliance_measures;
                        const rowKey    = `${req.id}::${section}`;
                        const isExpanded = expandedRows.has(rowKey);

                        return (
                          <Fragment key={rowKey}>
                          <tr
                            onClick={() => toggleRow(rowKey)}
                            className={`cursor-pointer transition-colors
                              ${st === 'non_compliant' ? 'bg-red-50/40 hover:bg-red-50/70' :
                                st === 'compliant'     ? 'bg-brand-50/20 hover:bg-brand-50/50' :
                                'bg-white hover:bg-[var(--color-surface)]'}`}>

                            <td className="px-3 py-3 align-top">
                              <div className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                                {isExpanded
                                  ? <ChevronDown size={11} className="flex-shrink-0" />
                                  : <ChevronRight size={11} className="flex-shrink-0" />
                                }
                                {i + 1}
                              </div>
                            </td>

                            <td className="px-3 py-3 align-top">
                              <p className="font-semibold leading-snug text-xs">{req.legal_document}</p>
                              <p className="text-[var(--color-muted)] mt-0.5 text-[10px]">{req.source_section}</p>
                            </td>

                            <td className="px-3 py-3 align-top">
                              <p className="leading-relaxed text-[var(--color-text)] line-clamp-4 text-xs">
                                {req.specific_requirement}
                              </p>
                            </td>

                            <td className="px-3 py-3 align-top">
                              <p className="font-medium leading-relaxed text-xs line-clamp-4">{measure}</p>
                            </td>

                            <td className="px-3 py-3 align-top">
                              {answer ? (
                                <span className={`text-xs font-semibold
                                  ${answer === 'yes'     ? 'text-brand-600' :
                                    answer === 'partial' ? 'text-amber-600' : 'text-red-600'}`}>
                                  {answerLabel[answer]}
                                </span>
                              ) : <span className="text-xs text-[var(--color-muted)]">—</span>}
                            </td>

                            <td className="px-3 py-3 align-top text-xs text-[var(--color-muted)]">
                              {li?.responsible_person ?? req.owner}
                            </td>

                            <td className="px-3 py-3 align-top text-xs text-[var(--color-muted)]">
                              {(li as any)?.frequency ?? req.default_frequency}
                            </td>

                            <td className="px-3 py-3 align-top text-xs text-[var(--color-muted)]">
                              {li?.due_date ?? req.suggested_due_date ?? 'Continuous'}
                            </td>

                            <td className="px-3 py-3 align-top">
                              <span className={`inline-flex items-center gap-1.5 font-semibold
                                               px-2 py-1 rounded-full text-[10px]
                                               ${cfg.bg} ${cfg.color}`}>
                                <Icon size={10} /> {cfg.label}
                              </span>
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr key={`${req.id}-expanded`} className="bg-[var(--color-surface)]">
                              <td colSpan={9} className="px-4 py-4 border-t border-[var(--color-border)]">
                                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                      Full Legal Requirement
                                    </p>
                                    <p className="leading-relaxed text-[var(--color-text)]">
                                      {req.specific_requirement}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                      Compliance Measure
                                    </p>
                                    <p className="leading-relaxed font-medium text-[var(--color-text)]">
                                      {measure}
                                    </p>
                                  </div>
                                  {li?.inspector_notes && (
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                        Inspector Notes
                                      </p>
                                      <p className="leading-relaxed">{li.inspector_notes}</p>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-4">
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">Owner</p>
                                      <p>{li?.responsible_person ?? req.owner}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">Frequency</p>
                                      <p>{(li as any)?.frequency ?? req.default_frequency}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">Due Date</p>
                                      <p>{li?.due_date ?? req.suggested_due_date ?? 'Continuous'}</p>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
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
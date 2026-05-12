'use client';

import { useMemo, useState, Fragment } from 'react';
import {
  CheckCircle, XCircle, Minus, Download, AlertTriangle,
  User, Clock, Calendar, ChevronDown, ChevronRight
} from 'lucide-react';
import type { AuditLineItem, ComplianceAudit } from '@/types';

const statusConfig = {
  compliant:      { icon: CheckCircle, color: 'text-brand-600', bg: 'bg-brand-100', label: 'Compliant'     },
  non_compliant:  { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-100',   label: 'Non-Compliant' },
  not_applicable: { icon: Minus,       color: 'text-gray-500',  bg: 'bg-gray-100',  label: 'N/A'           },
  not_assessed:   { icon: Minus,       color: 'text-gray-400',  bg: 'bg-gray-50',   label: 'Not Assessed'  },
};

const answerLabel: Record<string, string> = {
  yes:     '✓ Implemented',
  partial: '~ Partial',
  no:      '✗ Not implemented',
};

const areaColors: Record<string, string> = {
  Safety:       'bg-red-100 text-red-700',
  Health:       'bg-blue-100 text-blue-700',
  Environment:  'bg-brand-100 text-brand-700',
  'HR':  'bg-purple-100 text-purple-700',
  Quality:      'bg-amber-100 text-amber-700',
};

export default function ComplianceAuditReport({
  audit,
  requirements,
  lineItems,
}: {
  audit:        ComplianceAudit;
  requirements: any[];
  lineItems:    AuditLineItem[];
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(key: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Derive sections/areas from line items directly
  const areas = useMemo(() =>
    [...new Set(lineItems.map((li: any) => li.area ?? li.section ?? 'General'))],
    [lineItems]
  );

  // Group line items by area then legal_document
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, AuditLineItem[]>> = {};
    lineItems.forEach((li: any) => {
      const area = li.area ?? li.section ?? 'General';
      const doc  = li.legal_document ?? 'General';
      if (!map[area]) map[area] = {};
      if (!map[area][doc]) map[area][doc] = [];
      map[area][doc].push(li);
    });
    return map;
  }, [lineItems]);

  // Overall score
  const overallScore = useMemo(() => {
    const total     = lineItems.filter(li => li.status !== 'not_applicable').length;
    const compliant = lineItems.filter(li => li.status === 'compliant').length;
    return total > 0 ? Math.round((compliant / total) * 100) : 0;
  }, [lineItems]);

  // Stats per area
  const statsByArea = useMemo(() => {
    return areas.map(area => {
      const items     = lineItems.filter((li: any) => (li.area ?? li.section) === area && li.status !== 'not_applicable');
      const compliant = items.filter(li => li.status === 'compliant').length;
      const nonComp   = items.filter(li => li.status === 'non_compliant').length;
      const score     = items.length > 0 ? Math.round((compliant / items.length) * 100) : 0;
      return { area, total: items.length, compliant, nonComp, score };
    });
  }, [areas, lineItems]);

  const nonCompliantItems = lineItems.filter(li => li.status === 'non_compliant');
  const notAssessedCount  = lineItems.filter(li => li.status === 'not_assessed').length;

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
            {(audit as any).industry_name && <span>{(audit as any).industry_name} · </span>}
            {(audit as any).sub_sector_name && <span>{(audit as any).sub_sector_name} · </span>}
            Completed {new Date((audit as any).completed_at ?? audit.created_at).toLocaleDateString('en-NG', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <a href={`/api/compliance/${audit.id}/report`} download
          className="btn-primary flex items-center gap-2 flex-shrink-0 self-start">
          <Download size={16} /> Download PDF
        </a>
      </div>

      {/* ── Score cards ── */}
<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
  {/* Overall Score - Wider on small screens, 1 col on large */}
  <div className="card p-3 col-span-2 lg:col-span-1 flex flex-col items-center justify-center text-center">
    <p className={`text-3xl font-display font-bold
      ${overallScore >= 80 ? 'text-brand-600' : overallScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
      {overallScore}%
    </p>
    <p className="text-[10px] uppercase tracking-tight text-[var(--color-muted)] mt-1">Overall</p>
  </div>

  {/* Per area cards - Now mapping all without the .slice(0, 3) */}
  {statsByArea.map(({ area, compliant, nonComp, score }) => (
    <div key={area} className="card p-3 flex flex-col justify-between">
      <div className="flex justify-between items-start gap-1">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase truncate ${areaColors[area] ?? 'bg-gray-100 text-gray-700'}`}>
          {area}
        </span>
        <span className={`text-lg font-display font-bold leading-none
          ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
          {score}%
        </span>
      </div>
      
      <div className="flex items-center gap-2 mt-2 text-[10px] font-medium border-t border-gray-50 pt-1">
        <span className="text-brand-600">{compliant}✓</span>
        {nonComp > 0 && <span className="text-red-600">{nonComp}✗</span>}
      </div>
    </div>
  ))}
</div>

      {/* ── Action required ── */}
      {nonCompliantItems.length > 0 && (
        <div className="card border-2 border-red-200 bg-red-50/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-600" />
            <h2 className="text-sm font-semibold text-red-700">
              {nonCompliantItems.length} Items Requiring Corrective Action
            </h2>
          </div>
          <div className="space-y-3">
            {nonCompliantItems.map((li: any) => (
              <div key={li.id} className="bg-white rounded-xl p-4 border border-red-100">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-[var(--color-muted)]">
                      {li.legal_document} · {li.source_section}
                    </p>
                    <p className="text-sm font-semibold mt-0.5">
                      {li.ai_measures ?? li.compliance_measures ?? '—'}
                    </p>
                    {li.specific_requirement && (
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">
                        {li.specific_requirement.slice(0, 140)}…
                      </p>
                    )}
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                    {li.area ?? li.section}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                  <span className="text-red-600 font-medium">
                    Inspector: {answerLabel[li.inspector_answer ?? 'no'] ?? '✗ Not implemented'}
                  </span>
                  {li.responsible_person && (
                    <span className="flex items-center gap-1 text-[var(--color-muted)]">
                      <User size={10} /> {li.responsible_person}
                    </span>
                  )}
                  {li.frequency && (
                    <span className="flex items-center gap-1 text-[var(--color-muted)]">
                      <Clock size={10} /> {li.frequency}
                    </span>
                  )}
                  {li.due_date && (
                    <span className="flex items-center gap-1 text-[var(--color-muted)]">
                      <Calendar size={10} /> {li.due_date}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Full results by area ── */}
      {areas.map(area => {
        const docGroups = grouped[area];
        if (!docGroups) return null;
        return (
          <div key={area} className="space-y-4">
            <h2 className="text-xl font-display border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${areaColors[area] ?? 'bg-gray-100 text-gray-700'}`}>
                {area}
              </span>
              <span className="text-sm text-[var(--color-muted)] font-normal">
                {Object.values(docGroups).flat().length} requirements
              </span>
            </h2>

            {Object.entries(docGroups).map(([doc, reqs]) => (
              <div key={doc} className="rounded-xl border-2 overflow-hidden border-[var(--color-border)]">
                <div className="px-4 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                  <p className="text-xs font-semibold">{doc}</p>
                </div>
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col className="w-8" />
                    <col className="w-32" />
                    <col className="w-[23%]" />
                    <col className="w-[23%]" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col className="w-20" />
                    <col className="w-24" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">#</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Reference</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Requirement</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Compliance Measure</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Validation</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Owner</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Frequency</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Due Date</th>
                      <th className="text-left px-3 py-2 text-[var(--color-muted)] font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {(reqs as any[]).map((li: any, i: number) => {
                      const st      = (li.status ?? 'not_assessed') as keyof typeof statusConfig;
                      const cfg     = statusConfig[st];
                      const Icon    = cfg.icon;
                      const rowKey  = li.id;
                      const isOpen  = expandedRows.has(rowKey);

                      return (
                        <Fragment key={rowKey}>
                          <tr onClick={() => toggleRow(rowKey)}
                            className={`cursor-pointer transition-colors
                              ${st === 'non_compliant' ? 'bg-red-50/40 hover:bg-red-50/70' :
                                st === 'compliant'     ? 'bg-brand-50/20 hover:bg-brand-50/50' :
                                'bg-white hover:bg-[var(--color-surface)]'}`}>

                            <td className="px-3 py-2.5 align-top">
                              <div className="flex items-center gap-1 text-[var(--color-muted)]">
                                {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                {i + 1}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <p className="text-[10px] font-mono text-[var(--color-muted)]">{li.source_section}</p>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <p className="leading-relaxed line-clamp-3">{li.specific_requirement}</p>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <p className="font-medium leading-relaxed line-clamp-3">
                                {li.ai_measures ?? li.compliance_measures ?? '—'}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              {li.inspector_answer ? (
                                <span className={`font-semibold
                                  ${li.inspector_answer === 'yes'     ? 'text-brand-600' :
                                    li.inspector_answer === 'partial' ? 'text-amber-600' : 'text-red-600'}`}>
                                  {answerLabel[li.inspector_answer]}
                                </span>
                              ) : <span className="text-[var(--color-muted)]">—</span>}
                            </td>
                            <td className="px-3 py-2.5 align-top text-[var(--color-muted)]">
                              {li.responsible_person ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 align-top text-[var(--color-muted)]">
                              {li.frequency ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 align-top text-[var(--color-muted)]">
                              {li.due_date ?? 'Continuous'}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span className={`inline-flex items-center gap-1 font-semibold
                                               px-2 py-0.5 rounded-full text-[10px] ${cfg.bg} ${cfg.color}`}>
                                <Icon size={9} /> {cfg.label}
                              </span>
                            </td>
                          </tr>

                          {/* Expanded row */}
                          {isOpen && (
                            <tr key={`${li.id}-exp`} className="bg-[var(--color-surface)]">
                              <td colSpan={9} className="px-4 py-4 border-t border-[var(--color-border)]">
                                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                      Full Legal Requirement
                                    </p>
                                    <p className="leading-relaxed">{li.specific_requirement}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                      Compliance Measure
                                    </p>
                                    <p className="leading-relaxed font-medium">
                                      {li.ai_measures ?? li.compliance_measures ?? '—'}
                                    </p>
                                  </div>
                                  {li.inspector_notes && (
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
                                      <p>{li.responsible_person ?? '—'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">Frequency</p>
                                      <p>{li.frequency ?? '—'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">Due Date</p>
                                      <p>{li.due_date ?? 'Continuous'}</p>
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
            ))}
          </div>
        );
      })}
    </div>
  );
}
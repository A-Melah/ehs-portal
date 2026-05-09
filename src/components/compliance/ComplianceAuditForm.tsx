'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle, XCircle, MinusCircle, Loader2,
  ChevronDown, ChevronRight, Save, Send, User, Clock, Calendar
} from 'lucide-react';
import type { LegalRequirement, AuditLineItem, ComplianceAudit, LineItemStatus, InspectorAnswer } from '@/types';

type Answer = 'yes' | 'partial' | 'no' | null;

interface LineState {
  answer:             Answer;
  status:             LineItemStatus;
  compliance_note:    string | null;
  responsible_person: string;
  frequency:          string;
  due_date:           string;
  loading:            boolean;
  saved:              boolean;
}

const answerConfig = {
  yes:     { label: 'Yes — Implemented',         icon: CheckCircle,  color: 'text-brand-600', bg: 'bg-brand-50',  ring: 'ring-brand-400',  border: 'border-brand-300' },
  partial: { label: 'Partial — Needs Improvement', icon: MinusCircle, color: 'text-amber-600', bg: 'bg-amber-50',  ring: 'ring-amber-400',  border: 'border-amber-300' },
  no:      { label: 'No — Not Implemented',       icon: XCircle,      color: 'text-red-600',   bg: 'bg-red-50',    ring: 'ring-red-400',    border: 'border-red-300'  },
};

const areaColors: Record<string, string> = {
  Safety:      'bg-red-100 text-red-700',
  Health:      'bg-blue-100 text-blue-700',
  Environment: 'bg-brand-100 text-brand-700',
};

export default function ComplianceAuditForm({
  audit,
  requirements,
  existingLineItems,
}: {
  audit:             ComplianceAudit;
  requirements:      LegalRequirement[];
  existingLineItems: AuditLineItem[];
}) {
  const router   = useRouter();
  const supabase = createClient();

  const buildKey = (reqId: string, section: string) => `${reqId}::${section}`;

  const initial: Record<string, LineState> = {};
  requirements.forEach(req => {
    (audit.sections as string[]).forEach(section => {
      if (!req.applies_to_sections.includes(section)) return;
      const key      = buildKey(req.id, section);
      const existing = existingLineItems.find(li => li.requirement_id === req.id && li.section === section);
      initial[key] = {
        answer:             (existing?.inspector_answer as Answer) ?? null,
        status:             (existing?.status as LineItemStatus) ?? 'not_assessed',
        compliance_note:    existing?.ai_verdict ?? null,
        responsible_person: existing?.responsible_person ?? req.owner,
        frequency:          existing?.frequency ?? req.default_frequency,
        due_date:           existing?.due_date ?? req.suggested_due_date ?? 'Continuous',
        loading:            false,
        saved:              !!existing?.inspector_answer,
      };
    });
  });

  const [lines, setLines]           = useState<Record<string, LineState>>(initial);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [activeSection, setSection] = useState<string>((audit.sections as string[])[0]);
  const [saving, setSaving]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt]       = useState<Date | null>(null);
  const [error, setError]           = useState('');

  function update(key: string, patch: Partial<LineState>) {
    setLines(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleAnswer(req: LegalRequirement, section: string, answer: Answer) {
    if (!answer) return;
    const key = buildKey(req.id, section);
    update(key, { answer, loading: true, compliance_note: null });

    try {
      const res  = await fetch('/api/compliance/ai-inference', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          requirement:      req.specific_requirement,
          measures:         req.compliance_measures,
          legalRef:         `${req.legal_document} — ${req.source_section}`,
          section,
          area:             req.area,
          inspectorAnswer:  answer,
          owner:            req.owner,
          defaultFrequency: req.default_frequency,
          suggestedDueDate: req.suggested_due_date,
        }),
      });
      const data = await res.json();
      update(key, {
        loading:            false,
        saved:              true,
        status:             data.status ?? (answer === 'yes' ? 'compliant' : 'non_compliant'),
        compliance_note:    data.compliance_note ?? null,
        responsible_person: data.responsible_person ?? req.owner,
        frequency:          data.frequency ?? req.default_frequency,
        due_date:           data.due_date ?? 'Continuous',
      });
    } catch {
      // Fallback — derive from answer without AI
      update(key, {
        loading:  false,
        saved:    true,
        status:   answer === 'yes' ? 'compliant' : 'non_compliant',
        compliance_note: null,
      });
    }
  }

  async function saveProgress() {
    setSaving(true);
    setError('');

    const upserts = Object.entries(lines).map(([key, state]) => {
      const [reqId, section] = key.split('::');
      const existing = existingLineItems.find(li => li.requirement_id === reqId && li.section === section);
      return {
        ...(existing ? { id: existing.id } : {}),
        audit_id:           audit.id,
        requirement_id:     reqId,
        section,
        status:             state.status,
        inspector_answer:   state.answer,
        inspector_notes:    state.compliance_note,
        ai_verdict:         state.compliance_note,
        responsible_person: state.responsible_person,
        frequency:          state.frequency,
        due_date:           state.due_date,
      };
    });

    const { error: err } = await supabase
      .from('audit_line_items')
      .upsert(upserts, { onConflict: 'id' });

    if (err) setError('Save failed: ' + err.message);
    else     setSavedAt(new Date());
    setSaving(false);
  }

  async function submitAudit() {
    setSubmitting(true);
    await saveProgress();

    // Denominator = ALL non-N/A line items (not_assessed counts as non-compliant)
    const allLines  = Object.values(lines).filter(l => l.status !== 'not_applicable');
    const compliant = allLines.filter(l => l.status === 'compliant').length;
    const score     = allLines.length > 0 ? Math.round((compliant / allLines.length) * 100) : 0;

    await supabase
      .from('compliance_audits')
      .update({ status: 'completed', overall_score: score, completed_at: new Date().toISOString() })
      .eq('id', audit.id);

    router.push(`/dashboard/compliance/${audit.id}`);
    router.refresh();
    setSubmitting(false);
  }

  const sectionReqs = requirements.filter(r => r.applies_to_sections.includes(activeSection));
  const grouped     = sectionReqs.reduce<Record<string, LegalRequirement[]>>((acc, r) => {
    (acc[r.area] = acc[r.area] ?? []).push(r);
    return acc;
  }, {});

  const sectionLines      = Object.entries(lines).filter(([k]) => k.endsWith(`::${activeSection}`)).map(([, v]) => v);
  const answeredCount     = sectionLines.filter(l => l.answer !== null).length;
  const compliantCount    = sectionLines.filter(l => l.status === 'compliant').length;
  const nonCompliantCount = sectionLines.filter(l => l.status === 'non_compliant').length;

  return (
    <div className="fade-up space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
        <div>
          <h1 className="text-3xl font-display">{audit.title}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {audit.period && <span className="font-medium">{audit.period} · </span>}
            Validate each compliance measure — AI assigns status automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
          <button onClick={saveProgress} disabled={saving}
            className="btn-ghost flex items-center gap-2 py-2 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : 'Save'}
          </button>
          <button onClick={submitAudit} disabled={submitting}
            className="btn-primary flex items-center gap-2 py-2 text-sm">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {submitting ? 'Completing…' : 'Complete Audit'}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(audit.sections as string[]).map(section => {
          const sl       = Object.entries(lines).filter(([k]) => k.endsWith(`::${section}`)).map(([, v]) => v);
          const sAns     = sl.filter(l => l.answer !== null).length;
          const sNonComp = sl.filter(l => l.status === 'non_compliant').length;
          return (
            <button key={section} onClick={() => setSection(section)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                          transition-all whitespace-nowrap
                ${activeSection === section
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white border border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
                }`}>
              {section}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                ${activeSection === section ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {sAns}/{sl.length}
              </span>
              {sNonComp > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                  ${activeSection === section ? 'bg-red-300/50 text-white' : 'bg-red-100 text-red-700'}`}>
                  {sNonComp} ✗
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">{activeSection} — {sectionReqs.length} requirements</p>
          <p className="text-sm text-[var(--color-muted)]">
            <span className="text-brand-600 font-semibold">{compliantCount}</span> compliant ·{' '}
            {nonCompliantCount > 0 && <span className="text-red-600 font-semibold">{nonCompliantCount} non-compliant · </span>}
            <span>{sectionReqs.length - answeredCount} remaining</span>
          </p>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
          <div className="bg-brand-500 transition-all duration-500" style={{ width: `${(compliantCount / sectionReqs.length) * 100}%` }} />
          <div className="bg-red-400 transition-all duration-500"   style={{ width: `${(nonCompliantCount / sectionReqs.length) * 100}%` }} />
        </div>
      </div>

      {/* Requirements by area */}
      {(['Safety', 'Health', 'Environment'] as const).map(area => {
        const reqs = grouped[area];
        if (!reqs?.length) return null;

        return (
          <div key={area} className="space-y-3">
            <div className="flex items-center gap-2 sticky top-0 bg-[var(--color-surface)] py-2 z-10">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${areaColors[area]}`}>{area}</span>
              <span className="text-xs text-[var(--color-muted)]">{reqs.length} requirements</span>
            </div>

            {reqs.map((req, idx) => {
              const key    = buildKey(req.id, activeSection);
              const state  = lines[key];
              if (!state) return null;

              const isOpen = expanded.has(key);
              const answerCfg = state.answer ? answerConfig[state.answer] : null;

              return (
                <div key={req.id}
                  className={`card border-2 transition-all duration-200
                    ${state.status === 'non_compliant' ? 'border-red-200' :
                      state.status === 'compliant'     ? 'border-brand-200/60' :
                      'border-transparent'}`}>

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Status dot */}
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0
                        ${state.status === 'compliant'    ? 'bg-brand-500' :
                          state.status === 'non_compliant' ? 'bg-red-500' : 'bg-gray-300'}`} />

                      <div className="flex-1 min-w-0">
                        {/* Legal ref */}
                        <p className="text-[10px] font-mono text-[var(--color-muted)] mb-1">
                          {idx + 1}. {req.legal_document} · {req.source_section}
                        </p>

                        {/* Compliance measure — AI-generated or seeded from legal requirement */}
                        <p className="text-sm font-semibold text-[var(--color-text)] mb-1">
                          {(existingLineItems.find(li => li.requirement_id === req.id && li.section === activeSection) as any)?.ai_measures || req.compliance_measures}
                        </p>
                        <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">
                          {req.specific_requirement.slice(0, 120)}{req.specific_requirement.length > 120 ? '…' : ''}
                        </p>

                        {/* Yes / Partial / No buttons */}
                        {!state.loading && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {(['yes', 'partial', 'no'] as Answer[]).map(opt => {
                              const cfg  = answerConfig[opt!];
                              const Icon = cfg.icon;
                              const selected = state.answer === opt;
                              return (
                                <button key={opt} onClick={() => handleAnswer(req, activeSection, opt)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                                              border transition-all
                                    ${selected
                                      ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ${cfg.ring}`
                                      : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
                                    }`}>
                                  <Icon size={12} />
                                  {cfg.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Loading */}
                        {state.loading && (
                          <div className="flex items-center gap-2 text-xs text-amber-700 mb-3">
                            <Loader2 size={11} className="animate-spin" /> AI determining status…
                          </div>
                        )}

                        {/* AI-populated metadata chips */}
                        {state.saved && !state.loading && (
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              <User size={9} /> {state.responsible_person}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              <Clock size={9} /> {state.frequency}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              <Calendar size={9} /> {state.due_date}
                            </span>
                          </div>
                        )}
                      </div>

                      <button onClick={() => toggleExpand(key)}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100
                                   text-[var(--color-muted)] transition-colors">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded — full legal text + editable fields */}
                  {isOpen && (
                    <div className="border-t border-[var(--color-border)] p-4 space-y-4
                                    bg-[var(--color-surface)] rounded-b-2xl">
                      <div>
                        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1">
                          Full Legal Requirement
                        </p>
                        <p className="text-xs leading-relaxed">{req.specific_requirement}</p>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Responsible Person</label>
                          <select
                            value={state.responsible_person}
                            onChange={e => update(key, { responsible_person: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs transition">
                            {['HR','Engineering/SHE','SHE','Engineering','Admin',
                              'Manufacturing/SHE','SHE/Clinic','Manufacturing/Engineering',
                              'Quality Assurance/QC','Admin/Supply Chain'].map(o => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Frequency</label>
                          <select
                            value={state.frequency}
                            onChange={e => update(key, { frequency: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs transition">
                            {['Shift','Daily','Monthly','Quarterly','Bi-annually','Annually','As applicable','Continuous'].map(o => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Due Date</label>
                          <input
                            value={state.due_date}
                            onChange={e => update(key, { due_date: e.target.value })}
                            placeholder="e.g. Continuous, Annually, N/A"
                            className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs transition"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
        <button onClick={saveProgress} disabled={saving} className="btn-ghost flex items-center gap-2 py-2.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save Progress'}
        </button>
        <button onClick={submitAudit} disabled={submitting} className="btn-primary flex items-center gap-2 py-2.5">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {submitting ? 'Generating Report…' : 'Complete & Generate Report'}
        </button>
      </div>
    </div>
  );
}
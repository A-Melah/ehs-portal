'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle, XCircle, Minus, Loader2, AlertTriangle,
  ChevronDown, ChevronRight, Save, Send, Sparkles
} from 'lucide-react';
import type { LegalRequirement, AuditLineItem, ComplianceAudit, LineItemStatus } from '@/types';

interface LineState {
  finding:            string;       // inspector's field observation
  status:             LineItemStatus;
  ai_verdict:         string | null;
  gap:                string | null;
  recommended_action: string | null;
  urgency:            string | null;
  responsible_person: string;
  due_date:           string;
  loading:            boolean;
  analysed:           boolean;
}

const statusConfig: Record<LineItemStatus, { icon: any; color: string; bg: string; label: string; border: string }> = {
  compliant:      { icon: CheckCircle, color: 'text-brand-600', bg: 'bg-brand-50',  label: 'Compliant',     border: 'border-brand-200' },
  non_compliant:  { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-50',    label: 'Non-Compliant', border: 'border-red-200' },
  not_applicable: { icon: Minus,       color: 'text-gray-500',  bg: 'bg-gray-100',  label: 'N/A',           border: 'border-gray-200' },
  not_assessed:   { icon: Minus,       color: 'text-gray-300',  bg: 'bg-white',     label: 'Pending',       border: 'border-[var(--color-border)]' },
};

const urgencyStyle: Record<string, string> = {
  immediate:  'bg-red-100 text-red-700',
  short_term: 'bg-amber-100 text-amber-700',
  long_term:  'bg-blue-100 text-blue-700',
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

  // Build initial state
  const initial: Record<string, LineState> = {};
  requirements.forEach(req => {
    (audit.sections as string[]).forEach(section => {
      if (!req.applies_to_sections.includes(section)) return;
      const key      = buildKey(req.id, section);
      const existing = existingLineItems.find(li => li.requirement_id === req.id && li.section === section);
      initial[key] = {
        finding:            existing?.inspector_notes ?? '',
        status:             (existing?.status as LineItemStatus) ?? 'not_assessed',
        ai_verdict:         existing?.ai_verdict ?? null,
        gap:                null,
        recommended_action: null,
        urgency:            null,
        responsible_person: existing?.responsible_person ?? req.owner,
        due_date:           existing?.due_date ?? '',
        loading:            false,
        analysed:           !!existing?.ai_verdict,
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

  async function runAI(req: LegalRequirement, section: string) {
    const key   = buildKey(req.id, section);
    const state = lines[key];
    if (!state.finding.trim()) return;

    update(key, { loading: true });
    setExpanded(prev => new Set([...prev, key]));

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
          inspectorFinding: state.finding,
        }),
      });
      const data = await res.json();
      update(key, {
        loading:            false,
        analysed:           true,
        status:             data.status ?? 'non_compliant',
        ai_verdict:         data.verdict ?? null,
        gap:                data.gap ?? null,
        recommended_action: data.recommended_action ?? null,
        urgency:            data.urgency ?? null,
      });
    } catch {
      update(key, {
        loading:    false,
        analysed:   true,
        status:     'non_compliant',
        ai_verdict: 'AI analysis failed. Please review manually.',
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
        inspector_notes:    state.finding || null,
        ai_verdict:         state.ai_verdict,
        ai_override_status: null,
        ai_override_reason: state.recommended_action ?? null,
        responsible_person: state.responsible_person || null,
        due_date:           state.due_date || null,
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

    const allLines  = Object.values(lines).filter(l => l.status !== 'not_applicable');
    const compliant = allLines.filter(l => l.status === 'compliant').length;
    const total     = allLines.filter(l => l.status !== 'not_assessed').length;
    const score     = total > 0 ? Math.round((compliant / total) * 100) : 0;

    await supabase
      .from('compliance_audits')
      .update({ status: 'completed', overall_score: score, completed_at: new Date().toISOString() })
      .eq('id', audit.id);

    router.push(`/dashboard/compliance/${audit.id}`);
    router.refresh();
    setSubmitting(false);
  }

  // Section requirements grouped by area
  const sectionReqs = requirements.filter(r => r.applies_to_sections.includes(activeSection));
  const grouped     = sectionReqs.reduce<Record<string, LegalRequirement[]>>((acc, r) => {
    (acc[r.area] = acc[r.area] ?? []).push(r);
    return acc;
  }, {});

  // Section-level stats
  const sectionLines      = Object.entries(lines).filter(([k]) => k.endsWith(`::${activeSection}`)).map(([, v]) => v);
  const analysedCount     = sectionLines.filter(l => l.analysed).length;
  const compliantCount    = sectionLines.filter(l => l.status === 'compliant').length;
  const nonCompliantCount = sectionLines.filter(l => l.status === 'non_compliant').length;

  return (
    <div className="fade-up space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display">{audit.title}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {audit.period && <span className="font-medium">{audit.period} · </span>}
            Enter your field observation for each requirement — AI will determine compliance status automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={saveProgress} disabled={saving}
            className="btn-ghost flex items-center gap-2 py-2 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : 'Save'}
          </button>
          <button onClick={submitAudit} disabled={submitting}
            className="btn-primary flex items-center gap-2 py-2 text-sm">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {submitting ? 'Submitting…' : 'Complete Audit'}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(audit.sections as string[]).map(section => {
          const sl        = Object.entries(lines).filter(([k]) => k.endsWith(`::${section}`)).map(([, v]) => v);
          const sNonComp  = sl.filter(l => l.status === 'non_compliant').length;
          const sAnalysed = sl.filter(l => l.analysed).length;
          const sTotal    = sl.length;
          return (
            <button key={section} onClick={() => setSection(section)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap
                ${activeSection === section
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white border border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
                }`}>
              {section}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                ${activeSection === section ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {sAnalysed}/{sTotal}
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

      {/* Section progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">{activeSection} — {sectionReqs.length} requirements</p>
          <p className="text-sm text-[var(--color-muted)]">
            <span className="text-brand-600 font-semibold">{compliantCount}</span> compliant ·{' '}
            {nonCompliantCount > 0 && <span className="text-red-600 font-semibold">{nonCompliantCount} non-compliant · </span>}
            <span>{sectionReqs.length - analysedCount} remaining</span>
          </p>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full flex">
            <div className="bg-brand-500 transition-all" style={{ width: `${(compliantCount / sectionReqs.length) * 100}%` }} />
            <div className="bg-red-400 transition-all"   style={{ width: `${(nonCompliantCount / sectionReqs.length) * 100}%` }} />
          </div>
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

              const cfg     = statusConfig[state.status];
              const Icon    = cfg.icon;
              const isOpen  = expanded.has(key);

              return (
                <div key={req.id}
                  className={`card border-2 transition-all duration-200
                    ${state.status === 'non_compliant' ? 'border-red-200 bg-red-50/30' :
                      state.status === 'compliant'     ? 'border-brand-200/60' :
                      'border-transparent'}`}>

                  {/* Collapsed header */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Status indicator */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                        {state.loading
                          ? <Loader2 size={14} className="animate-spin text-amber-600" />
                          : <Icon size={14} className={cfg.color} />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Legal ref */}
                        <p className="text-[10px] font-mono text-[var(--color-muted)] mb-1">
                          {idx + 1}. {req.legal_document} · {req.source_section}
                        </p>

                        {/* Requirement summary */}
                        <p className="text-sm font-medium leading-snug mb-3">
                          {req.specific_requirement.slice(0, 160)}{req.specific_requirement.length > 160 ? '…' : ''}
                        </p>

                        {/* Finding input */}
                        <div className="flex gap-2">
                          <textarea
                            value={state.finding}
                            onChange={e => update(key, { finding: e.target.value, analysed: false, status: 'not_assessed' })}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAI(req, activeSection); }}
                            rows={2}
                            placeholder="Describe what you observed in the field… (Ctrl+Enter to analyse)"
                            className="flex-1 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs resize-none transition"
                          />
                          <button
                            onClick={() => runAI(req, activeSection)}
                            disabled={state.loading || !state.finding.trim()}
                            title="Analyse with AI"
                            className={`flex-shrink-0 flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl
                                        text-xs font-medium transition-all
                                        ${state.finding.trim()
                                          ? 'bg-brand-600 hover:bg-brand-700 text-white'
                                          : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                          >
                            {state.loading
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Sparkles size={14} />
                            }
                            <span>Analyse</span>
                          </button>
                        </div>

                        {/* AI result summary */}
                        {state.analysed && state.ai_verdict && !state.loading && (
                          <div className={`mt-2 p-3 rounded-xl text-xs space-y-1
                            ${state.status === 'non_compliant' ? 'bg-red-50 border border-red-100' :
                              state.status === 'compliant'     ? 'bg-brand-50 border border-brand-100' :
                              'bg-gray-50 border border-gray-100'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${cfg.bg} ${cfg.color}`}>
                                AI: {cfg.label}
                              </span>
                              {state.urgency && (
                                <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${urgencyStyle[state.urgency]}`}>
                                  {state.urgency.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                            <p className="leading-relaxed">{state.ai_verdict}</p>
                            {state.gap && (
                              <p className="text-red-600"><strong>Gap:</strong> {state.gap}</p>
                            )}
                            {state.recommended_action && (
                              <p className="text-[var(--color-muted)]"><strong>Action:</strong> {state.recommended_action}</p>
                            )}
                          </div>
                        )}
                      </div>

                      <button onClick={() => toggleExpand(key)}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-[var(--color-muted)] transition-colors">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="border-t border-[var(--color-border)] p-4 space-y-4 bg-[var(--color-surface)] rounded-b-2xl">
                      <div>
                        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1">Full Legal Requirement</p>
                        <p className="text-xs leading-relaxed">{req.specific_requirement}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1">Required Compliance Measures</p>
                        <p className="text-xs leading-relaxed">{req.compliance_measures}</p>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Responsible person</label>
                          <input
                            value={state.responsible_person}
                            onChange={e => update(key, { responsible_person: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-white
                                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Due date</label>
                          <input type="date"
                            value={state.due_date}
                            onChange={e => update(key, { due_date: e.target.value })}
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

      {/* Bottom submit */}
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

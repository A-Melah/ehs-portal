'use client';

import { useState, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, ChevronRight, Search } from 'lucide-react';

interface Industry  { id: string; name: string; slug: string; icon: string; description: string }
interface SubSector { id: string; name: string; description: string }

const currentYear = new Date().getFullYear();
const QUICK_PERIODS = [
  `Q1 ${currentYear}`, `Q2 ${currentYear}`,
  `Q3 ${currentYear}`, `Q4 ${currentYear}`,
  `H1 ${currentYear}`, `H2 ${currentYear}`,
  `Annual ${currentYear}`,
];

export default function NewAuditButton() {
  const router   = useRouter();
  const supabase = createClient();

  const [mounted, setMounted]             = useState(false);
  const [open, setOpen]                   = useState(false);
  const [step, setStep]                   = useState<'industry' | 'details'>('industry');

  // Industry selection
  const [industries, setIndustries]       = useState<Industry[]>([]);
  const [subSectors, setSubSectors]       = useState<SubSector[]>([]);
  const [industrySearch, setIndustrySearch] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null);
  const [selectedSubSector, setSelectedSubSector] = useState<SubSector | null>(null);
  const [customIndustry, setCustomIndustry] = useState('');
  const [customSubSector, setCustomSubSector] = useState('');
  const [showCustom, setShowCustom]       = useState(false);
  const [showCustomSub, setShowCustomSub] = useState(false);

  // Audit details
  const [title, setTitle]                 = useState('');
  const [period, setPeriod]               = useState('');
  const [error, setError]                 = useState('');
  const [pending, startTransition]        = useTransition();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      supabase.from('industries').select('*').order('name')
        .then(({ data }) => setIndustries(data ?? []));
    }
  }, [open]);

  useEffect(() => {
    if (selectedIndustry) {
      supabase.from('sub_sectors').select('*')
        .eq('industry_id', selectedIndustry.id)
        .order('name')
        .then(({ data }) => setSubSectors(data ?? []));
      // Auto-set title
      setTitle(`${selectedIndustry.name} Legal Compliance Audit`);
    }
  }, [selectedIndustry]);

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setStep('industry');
    setSelectedIndustry(null);
    setSelectedSubSector(null);
    setCustomIndustry('');
    setCustomSubSector('');
    setShowCustom(false);
    setShowCustomSub(false);
    setTitle('');
    setPeriod('');
    setError('');
    setIndustrySearch('');
  }

  function selectIndustry(ind: Industry) {
    setSelectedIndustry(ind);
    setShowCustom(false);
    setCustomIndustry('');
    setSelectedSubSector(null);
    setShowCustomSub(false);
  }

  function handleNext() {
    const industryName = showCustom ? customIndustry.trim() : selectedIndustry?.name;
    if (!industryName) { setError('Please select or enter an industry.'); return; }
    setError('');
    if (!showCustom) setTitle(`${selectedIndustry!.name} Legal Compliance Audit`);
    else             setTitle(`${customIndustry.trim()} Legal Compliance Audit`);
    setStep('details');
  }

  function submit() {
    const industryName   = showCustom    ? customIndustry.trim()    : selectedIndustry?.name;
    const subSectorName  = showCustomSub ? customSubSector.trim()   : selectedSubSector?.name ?? null;
    const industryId     = showCustom    ? null                     : selectedIndustry?.id ?? null;
    const subSectorId    = showCustomSub ? null                     : selectedSubSector?.id ?? null;

    if (!title.trim())    { setError('Please enter a title.'); return; }
    if (!industryName)    { setError('Please select an industry.'); return; }
    setError('');

    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: audit, error: err } = await supabase
        .from('compliance_audits')
        .insert({
          title:           title.trim(),
          period:          period.trim() || null,
          auditor_id:      user.id,
          status:          'pending',
          industry_id:     industryId,
          sub_sector_id:   subSectorId,
          industry_name:   industryName,
          sub_sector_name: subSectorName,
          sections:        [industryName], // keep sections for backward compat
        })
        .select()
        .single();

      if (err || !audit) {
        setError('Failed to create audit: ' + (err?.message ?? 'unknown'));
        return;
      }
      await supabase.auth.refreshSession();
      router.push(`/dashboard/compliance/${audit.id}?uid=${user.id}`);
    });
  }

  const filteredIndustries = industries.filter(i =>
    i.name.toLowerCase().includes(industrySearch.toLowerCase())
  );

  const industryName  = showCustom    ? customIndustry   : selectedIndustry?.name ?? '';
  const subSectorName = showCustomSub ? customSubSector  : selectedSubSector?.name ?? '';

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
        <Plus size={16} /> New Audit
      </button>

      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div onClick={handleClose}
            className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300
              ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          />

          {/* Slide-in panel */}
          <aside
            className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[500px] bg-white shadow-2xl
                        flex flex-col transition-transform duration-300 ease-in-out`}
            style={{ height: '100dvh', transform: open ? 'translateX(0)' : 'translateX(100%)' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border)] flex-shrink-0">
              <div>
                <h2 className="text-xl font-display">New Compliance Audit</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  {step === 'industry' ? 'Select your industry and sector' : 'Set audit details'}
                </p>
              </div>
              <button onClick={handleClose}
                className="p-2 rounded-xl hover:bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex px-6 pt-4 gap-2 flex-shrink-0">
              {['Industry', 'Details'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${(step === 'industry' && i === 0) || (step === 'details' && i <= 1)
                      ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {i + 1}
                  </div>
                  <span className={`text-xs font-medium ${step === (i === 0 ? 'industry' : 'details') ? 'text-brand-600' : 'text-[var(--color-muted)]'}`}>
                    {s}
                  </span>
                  {i < 1 && <ChevronRight size={12} className="text-gray-300" />}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {step === 'industry' ? (
                <>
                  {/* Industry search */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Select Industry</label>
                    <div className="relative mb-3">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                      <input value={industrySearch} onChange={e => setIndustrySearch(e.target.value)}
                        placeholder="Search industries…"
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--color-border)] text-sm
                                   focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>

                    <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                      {filteredIndustries.map(ind => (
                        <button key={ind.id} onClick={() => selectIndustry(ind)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
                            ${selectedIndustry?.id === ind.id && !showCustom
                              ? 'border-brand-300 bg-brand-50 ring-2 ring-brand-200'
                              : 'border-[var(--color-border)] hover:border-gray-300 bg-white'}`}>
                          <span className="text-xl flex-shrink-0">{ind.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{ind.name}</p>
                            <p className="text-xs text-[var(--color-muted)] truncate">{ind.description}</p>
                          </div>
                          {selectedIndustry?.id === ind.id && !showCustom && (
                            <div className="w-4 h-4 rounded-full bg-brand-600 flex-shrink-0" />
                          )}
                        </button>
                      ))}

                      {/* Not listed option */}
                      <button onClick={() => { setShowCustom(true); setSelectedIndustry(null); }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
                          ${showCustom ? 'border-brand-300 bg-brand-50 ring-2 ring-brand-200' : 'border-dashed border-gray-300 hover:border-brand-300'}`}>
                        <span className="text-xl">✏️</span>
                        <div>
                          <p className="text-sm font-medium">Not listed — enter manually</p>
                          <p className="text-xs text-[var(--color-muted)]">Type your industry name</p>
                        </div>
                      </button>
                    </div>

                    {showCustom && (
                      <input value={customIndustry} onChange={e => setCustomIndustry(e.target.value)}
                        placeholder="e.g. Aerospace, Fintech…"
                        className="mt-3 w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                                   focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
                    )}
                  </div>

                  {/* Sub-sector */}
                  {(selectedIndustry || showCustom) && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Sub-sector
                        <span className="text-[var(--color-muted)] font-normal ml-1">(optional)</span>
                      </label>

                      {!showCustom && subSectors.length > 0 && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 mb-2">
                          {subSectors.map(sub => (
                            <button key={sub.id} onClick={() => { setSelectedSubSector(sub); setShowCustomSub(false); }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                                ${selectedSubSector?.id === sub.id && !showCustomSub
                                  ? 'border-brand-300 bg-brand-50'
                                  : 'border-[var(--color-border)] hover:border-gray-300 bg-white'}`}>
                              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0
                                ${selectedSubSector?.id === sub.id && !showCustomSub ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{sub.name}</p>
                                {sub.description && <p className="text-xs text-[var(--color-muted)] truncate">{sub.description}</p>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      <button onClick={() => { setShowCustomSub(true); setSelectedSubSector(null); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all
                          ${showCustomSub ? 'border-brand-300 bg-brand-50' : 'border-dashed border-gray-300 hover:border-brand-300'}`}>
                        <span>✏️</span> Enter custom sub-sector
                      </button>

                      {showCustomSub && (
                        <input value={customSubSector} onChange={e => setCustomSubSector(e.target.value)}
                          placeholder="e.g. Offshore Drilling, Ethanol Production…"
                          className="mt-2 w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                                     focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Selected industry summary */}
                  <div className="px-4 py-3 bg-brand-50 rounded-xl border border-brand-200">
                    <p className="text-xs text-brand-600 font-medium">Selected Industry</p>
                    <p className="text-sm font-semibold mt-0.5">{industryName}</p>
                    {subSectorName && <p className="text-xs text-[var(--color-muted)]">{subSectorName}</p>}
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Audit title</label>
                    <input value={title} onChange={e => setTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                                 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition" />
                  </div>

                  {/* Period */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Audit period <span className="text-[var(--color-muted)] font-normal">(optional)</span>
                    </label>
                    <input value={period} onChange={e => setPeriod(e.target.value)}
                      placeholder="e.g. Q1 2026"
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                                 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition mb-2" />
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_PERIODS.map(p => (
                        <button key={p} type="button" onClick={() => setPeriod(prev => prev === p ? '' : p)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all
                            ${period === p ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-brand-400'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI note */}
                  <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    <p className="font-semibold mb-1">🤖 AI will prepare this audit</p>
                    <p>Gemini will search all uploaded regulatory documents and extract requirements applicable to <strong>{industryName}{subSectorName ? ` — ${subSectorName}` : ''}</strong>. This takes 15–30 seconds.</p>
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0 bg-white space-y-2">
              {step === 'industry' ? (
                <button onClick={handleNext}
                  disabled={!selectedIndustry && (!showCustom || !customIndustry.trim())}
                  className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm
                             disabled:opacity-50 disabled:cursor-not-allowed">
                  Continue <ChevronRight size={15} />
                </button>
              ) : (
                <button onClick={submit} disabled={pending}
                  className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm">
                  {pending ? <><Loader2 size={15} className="animate-spin" /> Creating audit…</> : <><Plus size={15} /> Start Audit</>}
                </button>
              )}
              <button onClick={step === 'details' ? () => setStep('industry') : handleClose}
                className="w-full btn-ghost py-2.5 text-sm">
                {step === 'details' ? '← Back' : 'Cancel'}
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </>
  );
}
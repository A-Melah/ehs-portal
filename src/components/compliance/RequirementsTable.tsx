'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, X } from 'lucide-react';

const areaColors: Record<string, string> = {
  Safety:      'bg-red-100 text-red-700',
  Health:      'bg-blue-100 text-blue-700',
  Environment: 'bg-brand-100 text-brand-700',
};

interface Requirement {
  id:                   string;
  area:                 string;
  legal_document:       string;
  source_section:       string;
  specific_requirement: string;
  compliance_measures:  string;
  owner:                string;
  default_frequency:    string;
  suggested_due_date:   string;
}

export default function RequirementsTable({
  requirements,
  uniqueDocs,
  activeArea,
  activeDoc,
  initialQuery,
  totalCount,
}: {
  requirements:  Requirement[];
  uniqueDocs:    { legal_document: string; area: string }[];
  activeArea?:   string;
  activeDoc?:    string;
  initialQuery?: string;
  totalCount?:   number;
}) {
  const [query,    setQuery]    = useState(initialQuery ?? '');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState(activeDoc ?? '');
  // Area filtering is server-side — track it for UI purposes only
  const currentArea = activeArea ?? '';

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return (requirements ?? []).filter(r => {
      if (docFilter && r.legal_document !== docFilter) return false;
      if (!q) return true;
      return (
        r.legal_document.toLowerCase().includes(q) ||
        r.source_section.toLowerCase().includes(q) ||
        r.specific_requirement.toLowerCase().includes(q) ||
        r.compliance_measures.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q)
      );
    });
  }, [requirements, query, docFilter]);

  const hasActiveFilters = query || docFilter || currentArea;

  // Group by area then legal_document
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Requirement[]>> = {};
    for (const r of filtered) {
      if (!map[r.area]) map[r.area] = {};
      if (!map[r.area][r.legal_document]) map[r.area][r.legal_document] = [];
      map[r.area][r.legal_document].push(r);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search requirements, sections, owners…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-red-500">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={docFilter}
          onChange={e => setDocFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                     focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition
                     text-[var(--color-text)] min-w-[200px]"
        >
          <option value="">All documents</option>
          {(uniqueDocs ?? [])
            .filter(d => !currentArea || d.area === currentArea)
            .map(d => (
              <option key={d.legal_document} value={d.legal_document}>
                {d.legal_document}
              </option>
            ))}
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--color-muted)]">
        Showing <strong>{
          // When client-side filters (doc search or text query) are active, count from grouped
          // When only area filter active, use accurate server-side count
          (query || docFilter)
            ? Object.values(grouped).reduce((sum, docs) =>
                sum + Object.values(docs).reduce((s, reqs) => s + reqs.length, 0), 0)
            : (totalCount ?? 0)
        }</strong> requirements
        {currentArea && <span> in <strong>{currentArea}</strong></span>}
        {(query || docFilter) && <span> matching your search</span>}
        {hasActiveFilters && (
          <a href="/dashboard/requirements"
            className="ml-2 text-brand-600 hover:underline">
            Clear all filters
          </a>
        )}
      </p>

      {/* Grouped list */}
      {(['Safety', 'Health', 'Environment'] as const).map(area => {
        const docGroups = grouped[area];
        if (!docGroups) return null;

        return (
          <div key={area} className="space-y-3">
            {/* Area header */}
            <div className="flex items-center gap-2 sticky top-0 bg-[var(--color-surface)] py-2 z-10">
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${areaColors[area]}`}>
                {area}
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                {Object.values(docGroups).flat().length} requirements
              </span>
            </div>

            {/* Per document */}
            {Object.entries(docGroups).map(([doc, reqs]) => (
              <div key={doc} className="card overflow-hidden">
                {/* Document header */}
                <div className="px-5 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{doc}</p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">
                        {reqs.length} requirement{reqs.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${areaColors[area]}`}>
                      {area}
                    </span>
                  </div>
                </div>

                {/* Requirements */}
                <div className="divide-y divide-[var(--color-border)]">
                  {reqs.map((req, i) => {
                    const isOpen = expanded.has(req.id);
                    return (
                      <div key={req.id}>
                        {/* Collapsed row */}
                        <button
                          onClick={() => toggleExpand(req.id)}
                          className="w-full flex items-start gap-3 px-5 py-4 text-left
                                     hover:bg-[var(--color-surface)] transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                            <span className="text-xs text-[var(--color-muted)] w-5 text-right">{i + 1}</span>
                            {isOpen
                              ? <ChevronDown size={13} className="text-[var(--color-muted)]" />
                              : <ChevronRight size={13} className="text-[var(--color-muted)]" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono text-[var(--color-muted)] mb-1">
                              {req.source_section}
                            </p>
                            <p className="text-sm font-medium leading-snug">
                              {req.specific_requirement.slice(0, 150)}
                              {req.specific_requirement.length > 150 ? '…' : ''}
                            </p>

                          </div>
                          <div className="flex-shrink-0 text-right text-[10px] text-[var(--color-muted)] space-y-1 mt-1">
                            <p className="font-medium">{req.owner}</p>
                            <p>{req.default_frequency}</p>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isOpen && (
                          <div className="px-5 pb-5 pt-1 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
                            <div className="grid sm:grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
                                  Full Legal Requirement
                                </p>
                                <p className="leading-relaxed">{req.specific_requirement}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
                                  Compliance Measures
                                </p>
                                <p className="leading-relaxed font-medium">{req.compliance_measures}</p>
                              </div>
                              <div className="flex gap-6">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                    Owner
                                  </p>
                                  <p className="font-medium">{req.owner}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                    Frequency
                                  </p>
                                  <p>{req.default_frequency}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1">
                                    Due Date
                                  </p>
                                  <p>{req.suggested_due_date ?? 'Continuous'}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <Search size={28} className="mx-auto text-[var(--color-muted)] opacity-30 mb-3" />
          <p className="text-sm text-[var(--color-muted)]">No requirements match your search.</p>
          <a href="/dashboard/requirements"
            className="text-xs text-brand-600 mt-2 hover:underline block">
            Clear filters
          </a>
        </div>
      )}
    </div>
  );
}
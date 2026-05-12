import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect }          from 'next/navigation';
import { FileText, CheckCircle, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import LegalDocUploader from '@/components/compliance/LegalDocUploader';
import LegalDocActions  from '@/components/compliance/LegalDocActions';
import ExtractButton   from '@/components/compliance/ExtractButton';
import ReEmbedButton      from '@/components/compliance/ReEmbedButton';
import ReprocessAllButton from '@/components/compliance/ReprocessAllButton';

const statusConfig = {
  uploaded:   { label: 'Uploaded',   color: 'text-amber-600',  bg: 'bg-amber-50',  icon: Loader2 },
  processing: { label: 'Processing', color: 'text-blue-600',   bg: 'bg-blue-50',   icon: Loader2 },
  processed:  { label: 'Ready',      color: 'text-brand-600',  bg: 'bg-brand-50',  icon: CheckCircle },
  failed:     { label: 'Failed',     color: 'text-red-600',    bg: 'bg-red-50',    icon: AlertCircle },
};

const areaColors = {
  Safety:      'bg-red-100 text-red-700',
  Health:      'bg-blue-100 text-blue-700',
  Environment: 'bg-brand-100 text-brand-700',
};

export default async function LegalDocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'ehs_manager'].includes(profile?.role ?? '')) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from('legal_documents')
    .select('*')
    .order('created_at', { ascending: false });

  const { count: reqCount } = await admin
    .from('legal_requirements')
    .select('*', { count: 'exact', head: true })
    .eq('active', true);

  // totalChunks from stored column — may be stale
  const processedDocs = docs?.filter(d => d.status === 'processed').length ?? 0;
  const totalChunks = docs?.filter(d => d.status === 'processed').reduce((sum, d) => sum + (d.chunk_count || 0), 0) ?? 0;

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display">Legal Documents</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Upload regulatory PDFs — Gemini will extract and index them for compliance inference
          </p>
        </div>
        <div className="flex gap-2">
          <ReprocessAllButton />
          <ReEmbedButton />
          <LegalDocUploader />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
            <BookOpen size={16} className="text-brand-600" />
          </div>
          <p className="text-2xl font-display text-brand-600">{processedDocs}</p>
          <p className="text-xs text-[var(--color-muted)]">Documents indexed</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
            <FileText size={16} className="text-violet-600" />
          </div>
          <p className="text-2xl font-display text-violet-600">{docs?.length ?? 0}</p>
          <p className="text-xs text-[var(--color-muted)]">Total uploads</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
            <FileText size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-display text-amber-600">{totalChunks.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-muted)]">Text chunks indexed</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
            <FileText size={16} className="text-violet-600" />
          </div>
          <p className="text-2xl font-display text-violet-600">{reqCount ?? 0}</p>
          <p className="text-xs text-[var(--color-muted)]">Legal requirements</p>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-5 bg-brand-50/40 border-brand-200">
        <h3 className="text-sm font-semibold mb-2">How it works</h3>
        <ol className="text-xs text-[var(--color-muted)] space-y-1 list-decimal list-inside">
          <li>Upload a PDF of any Nigerian regulatory document (Factories Act, NESREA regulations, etc.)</li>
          <li>Gemini reads and extracts the full text from the PDF</li>
          <li>The text is split into overlapping chunks and each chunk gets a vector embedding</li>
          <li>When an inspector reports a finding, the AI searches these chunks to find the exact regulation that applies, then determines compliance status</li>
        </ol>
      </div>

      {/* Document list */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Uploaded Documents</h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {docs?.map(doc => {
            const cfg  = statusConfig[doc.status as keyof typeof statusConfig] ?? statusConfig.uploaded;
            const Icon = cfg.icon;
            return (
              <div key={doc.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--color-surface)] transition-colors">
                <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={`${cfg.color} ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{doc.document_title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0
                      ${areaColors[doc.area as keyof typeof areaColors]}`}>
                      {doc.area}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">
                    {doc.file_name}
                    {doc.file_size_bytes && ` · ${(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB`}
                    {doc.chunk_count ? ` · ${doc.chunk_count} chunks indexed` : ''}
                    {doc.processed_at && ` · Indexed ${new Date(doc.processed_at).toLocaleDateString('en-NG')}`}
                  </p>
                  {doc.error_message && !doc.error_message.match(/^\d/) && (
                    <p className="text-xs text-red-600 mt-0.5">{doc.error_message}</p>
                  )}
                  {doc.error_message && doc.error_message.match(/^\d/) && (
                    <p className="text-xs text-brand-600 mt-0.5">✓ {doc.error_message}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  {(doc.status === 'failed' || doc.status === 'uploaded') && (
                    <LegalDocActions documentId={doc.id} />
                  )}
                  <ExtractButton
                    documentId={doc.id}
                    documentTitle={doc.document_title}
                    status={doc.status}
                  />
                </div>
              </div>
            );
          })}

          {!docs?.length && (
            <div className="px-6 py-12 text-center">
              <FileText size={32} className="mx-auto text-[var(--color-muted)] opacity-30 mb-3" />
              <p className="text-sm text-[var(--color-muted)]">No documents uploaded yet.</p>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Upload your 12 regulatory PDFs to enable AI-powered legal inference.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
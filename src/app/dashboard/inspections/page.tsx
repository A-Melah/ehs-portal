import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';
import InspectionsList from '@/components/inspection/InspectionsList';

export default async function InspectionsPage() {
  const supabase = await createClient();

  const { data: inspections } = await supabase
    .from('inspections')
    .select('*, asset:assets(name, type, location), inspector:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch responses separately to avoid join complexity
  const inspectionIds = (inspections ?? []).map(i => i.id);
  const { data: allResponses } = inspectionIds.length
    ? await supabase
        .from('responses')
        .select('id, inspection_id, value, media_url, question:checklist_templates(question_text)')
        .in('inspection_id', inspectionIds)
    : { data: [] };

  // Attach responses to each inspection
  const inspectionsWithResponses = (inspections ?? []).map(ins => ({
    ...ins,
    responses: (allResponses ?? []).filter(r => r.inspection_id === ins.id),
  }));

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h1 className="text-3xl font-display">Inspections</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {inspections?.length ?? 0} inspection records · click any row to view details
          </p>
        </div>
        <Link href="/dashboard/inspections/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Inspection
        </Link>
      </div>

      <InspectionsList inspections={inspectionsWithResponses} />
    </div>
  );
}
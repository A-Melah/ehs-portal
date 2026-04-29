import { createClient } from '@/lib/supabase/server';
import InspectionForm from '@/components/inspection/InspectionForm';

export default async function NewInspectionPage() {
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from('assets')
    .select('id, name, type, tag_number, location')
    .eq('status', 'active')
    .order('name');

  return (
    <div className="fade-up space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display">New Inspection</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Complete the checklist — failures will trigger the AI compliance audit automatically.
        </p>
      </div>
      <InspectionForm assets={assets ?? []} />
    </div>
  );
}
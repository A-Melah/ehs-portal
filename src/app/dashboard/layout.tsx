import { createClient } from '@/lib/supabase/server';
import { redirect }     from 'next/navigation';
import Sidebar          from '@/components/dashboard/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <Sidebar profile={profile} />

      {/*
        Mobile: pt-14 clears the fixed top bar (h-14 = 56px). No left margin.
        Desktop: md:ml-64 offsets for the fixed 256px sidebar. No top padding.
      */}
      <main className="pt-14 md:pt-0 md:ml-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
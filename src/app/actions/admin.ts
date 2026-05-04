'use server'

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function inviteEmployee(formData: FormData) {
  const supabase = await createClient();
  
  const email = formData.get('email') as string;
  const fullName = formData.get('fullName') as string;
  const role = formData.get('role') as string;

  // 1. Invite user via Supabase Auth
  const { data, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { 
      full_name: fullName,
      role: role 
    },
    // Redirects them to your portal after they set their password
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
  });

  if (authError) return { error: authError.message };

  // 2. The Trigger we set up earlier handles the profile creation automatically!
  // If you didn't run the trigger, you would manually insert into 'profiles' here.

  revalidatePath('/admin/staff');
  return { success: `Invite sent to ${email} as ${role}` };
}
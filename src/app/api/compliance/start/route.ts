import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  
  // Get the plant section being audited (e.g., "Boiler Room")
  const { section, plant_id } = await req.json();

  // Insert a new record into your 'compliance_audits' table
  const { data, error } = await supabase
    .from('compliance_audits')
    .insert([{ 
      section, 
      status: 'in_progress',
      created_at: new Date().toISOString() 
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the auditId so the frontend can redirect to /compliance/[auditId]
  return NextResponse.json({ auditId: data.id });
}
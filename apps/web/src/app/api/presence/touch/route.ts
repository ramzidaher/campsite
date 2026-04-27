import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase.rpc('touch_last_seen');
  if (error) return NextResponse.json({ error: error.message ?? 'Failed to touch presence' }, { status: 500 });

  return NextResponse.json({ seenAt: data ?? null });
}

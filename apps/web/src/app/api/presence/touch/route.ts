import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('touch_last_seen');
  if (error) {
    const message = String(error.message ?? '');
    const code = String((error as { code?: string } | null)?.code ?? '');
    const isAuthError =
      code === 'PGRST301' ||
      code === '42501' ||
      message.toLowerCase().includes('jwt') ||
      message.toLowerCase().includes('not authenticated');
    return NextResponse.json(
      { error: message || 'Failed to touch presence' },
      { status: isAuthError ? 401 : 500 }
    );
  }

  return NextResponse.json({ seenAt: data ?? null });
}

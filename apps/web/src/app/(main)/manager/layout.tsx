import { createClient } from '@/lib/supabase/server';
import { isManagerRole } from '@campsite/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!isManagerRole(profile.role)) redirect('/broadcasts');

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="w-48 shrink-0 space-y-1 border-r border-[var(--campsite-border)] pr-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase text-[var(--campsite-text-muted)]">Manager</p>
        <Link
          href="/manager"
          className="block rounded-md px-2 py-1.5 text-[var(--campsite-text-secondary)] hover:bg-[var(--campsite-bg)]"
        >
          Overview
        </Link>
        <Link
          href="/pending-approvals"
          className="block rounded-md px-2 py-1.5 text-[var(--campsite-text-secondary)] hover:bg-[var(--campsite-bg)]"
        >
          Pending members
        </Link>
        <Link
          href="/broadcasts"
          className="block rounded-md px-2 py-1.5 text-[var(--campsite-text-secondary)] hover:bg-[var(--campsite-bg)]"
        >
          Broadcasts
        </Link>
        <Link
          href="/rota"
          className="block rounded-md px-2 py-1.5 text-[var(--campsite-text-secondary)] hover:bg-[var(--campsite-bg)]"
        >
          Department rota
        </Link>
        <Link href="/broadcasts" className="mt-4 block px-2 text-xs text-[var(--campsite-text-muted)] hover:text-emerald-400">
          ← App home
        </Link>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

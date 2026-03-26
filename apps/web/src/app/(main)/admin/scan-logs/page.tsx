import { ScanLogsClient, type ScanLogRow } from '@/components/admin/ScanLogsClient';
import { createClient } from '@/lib/supabase/server';
import { isOrgAdminRole } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function ScanLogsPage() {
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

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');
  if (!isOrgAdminRole(profile.role)) {
    redirect('/admin');
  }

  const { data: rows } = await supabase
    .from('scan_logs')
    .select(
      `id, created_at, token_valid, error_code, scanned_display_name, scanned_role, scanned_department, discount_label_snapshot, scanner_id,
       scanner:profiles!scan_logs_scanner_id_fkey(full_name)`
    )
    .order('created_at', { ascending: false })
    .limit(500);

  return <ScanLogsClient initialRows={(rows ?? []) as ScanLogRow[]} />;
}

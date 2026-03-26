import { createClient } from '@/lib/supabase/server';

export async function RotaSyncHistory({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rota_sheets_sync_log')
    .select('id, started_at, finished_at, rows_imported, error_message, source')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(25);

  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-sm font-semibold text-[var(--campsite-text)]">Import history</h2>
      {error ? <p className="text-sm text-red-300">{error.message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--campsite-border)]">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-[var(--campsite-border)] bg-[var(--campsite-surface)] text-xs uppercase text-[var(--campsite-text-muted)]">
            <tr>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Rows</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {!data?.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-[var(--campsite-text-secondary)]">
                  No sync runs yet. Use Import now to record a manual sync.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="border-b border-[var(--campsite-border)]/60">
                  <td className="px-3 py-2 text-[var(--campsite-text-secondary)]">
                    {row.started_at ? new Date(row.started_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2">{row.source}</td>
                  <td className="px-3 py-2">{row.rows_imported}</td>
                  <td className="px-3 py-2 text-xs text-[var(--campsite-text-muted)]">
                    {row.error_message ?? (row.finished_at ? '' : 'In progress')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

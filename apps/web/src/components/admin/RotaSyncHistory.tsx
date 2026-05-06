import { createClient } from '@/lib/supabase/server';
import { History } from 'lucide-react';

export async function RotaSyncHistory({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rota_sheets_sync_log')
    .select('id, started_at, finished_at, rows_imported, error_message, source')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(25);

  return (
    <section className="mx-auto mt-10 max-w-4xl space-y-3 px-5 pb-8 sm:px-[28px]">
      <h2 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#121212]">
        <History className="h-3.5 w-3.5" aria-hidden />
        Import history
      </h2>
      {error ? <p className="text-[13px] text-[#b91c1c]">{error.message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[#d8d8d8]">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead className="border-b border-[#d8d8d8] bg-[#f5f4f1] text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">
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
                <td colSpan={4} className="px-3 py-4 text-[#6b6b6b]">
                  No sync runs yet. Use Import now to record a manual sync.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="border-b border-[#d8d8d8]/80">
                  <td className="px-3 py-2 text-[#6b6b6b]">
                    {row.started_at ? new Date(row.started_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2">{row.source}</td>
                  <td className="px-3 py-2">{row.rows_imported}</td>
                  <td className="px-3 py-2 text-[12px] text-[#9b9b9b]">
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

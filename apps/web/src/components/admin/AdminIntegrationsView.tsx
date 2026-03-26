import Link from 'next/link';

export function AdminIntegrationsView({
  sheetsMappingCount,
}: {
  sheetsMappingCount: number;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Integrations</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Connect external tools your organisation already uses. Access is limited to org admins.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              📊
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-authSerif text-lg text-[#121212]">Google Sheets</h2>
              <p className="mt-1 text-[13px] leading-snug text-[#6b6b6b]">
                Import rota rows from a spreadsheet and map columns to shifts. Saved mappings:{' '}
                <span className="font-medium text-[#121212]">{sheetsMappingCount}</span>.
              </p>
              <Link
                href="/admin/rota-import"
                className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#121212] bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6]"
              >
                Open Sheets import
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#d8d8d8] bg-[#f5f4f1] p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              📅
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-authSerif text-lg text-[#121212]">Google Calendar</h2>
              <p className="mt-1 text-[13px] leading-snug text-[#6b6b6b]">
                Calendar sync is not wired in this build yet. Use Sheets import or manual rota entry for now.
              </p>
              <span className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                Coming later
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

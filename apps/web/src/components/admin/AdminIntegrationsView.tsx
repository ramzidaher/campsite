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

        <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              📅
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-authSerif text-lg text-[#121212]">Google Calendar &amp; interviews</h2>
              <p className="mt-1 text-[13px] leading-snug text-[#6b6b6b]">
                Configure the Google OAuth client in deployment (see <code className="text-[12px]">.env.example</code>
                ). Staff who sit on interview panels should open{' '}
                <strong>Settings → Integrations</strong> and connect Google Calendar once. HR creates panel slots under{' '}
                <strong>Admin → Interview schedule</strong>; events are written to each connected panelist&apos;s calendar.
              </p>
              <Link
                href="/admin/interviews"
                className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#008B60] bg-[#f0fdf9] px-4 text-[13px] font-medium text-[#008B60]"
              >
                Interview schedule
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

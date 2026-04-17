import Link from 'next/link';

export type ChronoGroup = {
  heading: string;
  items: {
    id: string;
    title: string;
    subtitle?: string;
    href?: string;
    accentColor?: string;
  }[];
};

function Row({
  it,
  isLast,
}: {
  it: ChronoGroup['items'][number];
  isLast: boolean;
}) {
  const dot = it.accentColor ?? '#121212';
  const inner = (
    <div className="flex gap-2.5">
      <div className="flex w-4 shrink-0 flex-col items-center pt-1">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white shadow-sm ring-1 ring-[#e7e5e4]"
          style={{ background: dot }}
          aria-hidden
        />
        {isLast ? null : <span className="my-1 min-h-[12px] w-px flex-1 bg-[#e7e5e4]" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-[#ececec] bg-[#faf9f6] px-3 py-2.5">
        <p className="text-[13px] font-medium text-[#121212]">{it.title}</p>
        {it.subtitle ? <p className="mt-0.5 text-[12px] leading-snug text-[#6b6b6b]">{it.subtitle}</p> : null}
      </div>
    </div>
  );
  if (it.href) {
    return (
      <Link href={it.href} className="block rounded-lg outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#121212]">
        {inner}
      </Link>
    );
  }
  return inner;
}

/**
 * Vertical timeline grouped by day (or any heading). Used as an alternate “lens”
 * alongside classic lists — same data, time-forward layout.
 */
export function ChronologyTimeline({ groups }: { groups: ChronoGroup[] }) {
  if (groups.length === 0) {
    return <p className="py-4 text-center text-xs text-[#9b9b9b]">Nothing to show yet.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.heading}>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
            {g.heading}
          </h3>
          <ul className="space-y-0">
            {g.items.map((it, idx) => (
              <li key={it.id} className={idx < g.items.length - 1 ? 'pb-3' : ''}>
                <Row it={it} isLast={idx === g.items.length - 1} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

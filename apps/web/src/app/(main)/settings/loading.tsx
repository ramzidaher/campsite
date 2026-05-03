import {
  LoadingShell,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const TAB_COUNT = 9;

/**
 * Route-level skeleton for `/settings` (profile & preferences).
 * Mirrors `settings/page.tsx` + {@link ProfileSettings} chrome: header, sidebar, main card.
 */
export default function SettingsLoading() {
  const desktopNav = Array.from({ length: TAB_COUNT });

  return (
    <LoadingShell className="mx-auto max-w-4xl px-5 pb-10 pt-6 sm:px-[28px]">
      <header className="mb-7 campsite-stack-sm">
        <SkeletonShimmer className="h-9 w-[min(12rem,70vw)] rounded-md sm:w-40" />
        <div className="mt-2 space-y-2">
          <SkeletonTextLine className="h-4 w-full max-w-lg" />
          <SkeletonTextLine className="h-4 w-[min(20rem,90vw)]" />
        </div>
      </header>

      <div className="flex flex-col gap-0 sm:flex-row sm:gap-7">
        <div className="mb-4 sm:mb-0 sm:w-44 sm:shrink-0" aria-hidden>
          <div className="flex gap-1.5 overflow-hidden pb-1 sm:hidden">
            {['w-[76px]', 'w-[92px]', 'w-20', 'w-[88px]', 'w-[72px]', 'w-24'].map((w, i) => (
              <SkeletonShimmer
                key={`settings-pill-skel-${i}`}
                className={['h-8 shrink-0 rounded-full', w].join(' ')}
              />
            ))}
          </div>
          <ul className="hidden space-y-0.5 sm:block">
            {desktopNav.map((_, i) => (
              <li key={`settings-nav-skel-${i}`}>
                <div className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2">
                  <SkeletonShimmer className="h-4 w-4 shrink-0 rounded" />
                  <SkeletonTextLine
                    className={`h-[13px] ${i === 0 ? 'w-14' : i === 1 ? 'w-24' : i === 2 ? 'w-28' : i === 3 ? 'w-28' : i === 4 ? 'w-16' : i === 5 ? 'w-28' : i === 6 ? 'w-24' : i === 7 ? 'w-20' : 'w-16'}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <SkeletonShimmer className="mb-2 h-6 w-28 rounded-md" />
            <div className="mb-6 space-y-2">
              <SkeletonTextLine className="h-3.5 w-full max-w-xl" />
              <SkeletonTextLine className="h-3.5 w-[min(18rem,92%)]" />
            </div>

            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex shrink-0 justify-center sm:justify-start">
                <SkeletonShimmer className="h-20 w-20 shrink-0 rounded-2xl" />
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <SkeletonTextLine className="mb-1.5 h-3 w-20" />
                  <SkeletonShimmer className="h-10 w-full rounded-lg" />
                </div>
                <div>
                  <SkeletonTextLine className="mb-1.5 h-3 w-28" />
                  <SkeletonShimmer className="h-10 w-full rounded-lg" />
                </div>
                <div>
                  <SkeletonTextLine className="mb-1.5 h-3 w-20" />
                  <SkeletonShimmer className="h-10 w-full rounded-lg" />
                </div>
                <div className="rounded-lg border border-[#e8e6e3] bg-[#faf9f7] px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <SkeletonShimmer className="mt-0.5 h-4 w-4 shrink-0 rounded" />
                    <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                      <SkeletonTextLine className="h-3 w-full" />
                      <SkeletonTextLine className="h-3 w-4/5" />
                    </div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-3xl border border-[#e8e6e3] bg-gradient-to-b from-[#fcfbf8] to-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonTextLine className="h-2.5 w-24" />
                      <SkeletonTextLine className="h-3.5 w-full" />
                      <SkeletonTextLine className="h-3.5 w-3/4" />
                    </div>
                    <SkeletonShimmer className="mt-0.5 h-5 w-5 shrink-0 rounded" />
                  </div>
                </div>
                <div className="pt-1">
                  <SkeletonShimmer className="h-10 w-[min(140px,100%)] rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LoadingShell>
  );
}

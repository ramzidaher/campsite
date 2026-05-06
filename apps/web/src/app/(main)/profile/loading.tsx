import {
  LoadingShell,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const TABS = 7;
const CARD_BLOCKS = 2;

/**
 * Route-level skeleton for `/profile` (My Profile HR record)  hero, section tabs, main column cards.
 */
export default function ProfileLoading() {
  return (
    <LoadingShell className="min-h-[calc(100vh-60px)]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-[28px]">
        <header className="mb-7 overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <SkeletonShimmer className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonShimmer className="h-9 w-[min(16rem,75vw)] rounded-md" />
                <SkeletonTextLine className="h-3.5 w-full max-w-md" />
                <div className="flex flex-wrap gap-2 pt-1">
                  <SkeletonTextLine className="h-6 w-24 rounded-full" />
                  <SkeletonTextLine className="h-6 w-28 rounded-full" />
                </div>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-2 sm:max-w-md sm:gap-3 lg:max-w-none">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`stat-${i}`} className="rounded-xl border border-[#e8e8e8] bg-white p-3">
                  <SkeletonTextLine className="h-2.5 w-16" />
                  <SkeletonShimmer className="mt-2 h-8 w-12 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="mb-7 flex flex-wrap gap-2">
          {Array.from({ length: TABS }).map((_, i) => (
            <SkeletonShimmer
              key={`ptab-${i}`}
              className={['h-9 rounded-lg', i === 0 ? 'w-20' : i === 1 ? 'w-36' : i === 2 ? 'w-28' : i === 3 ? 'w-16' : i === 4 ? 'w-36' : i === 5 ? 'w-20' : 'w-16'].join(
                ' '
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 space-y-4 lg:col-span-8">
            {Array.from({ length: CARD_BLOCKS }).map((_, i) => (
              <div
                key={`pcard-${i}`}
                className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white"
              >
                <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
                  <SkeletonTextLine className="h-3 w-32" />
                  {i === 0 ? <SkeletonTextLine className="h-3 w-24" /> : null}
                </div>
                <div className="space-y-4 p-4">
                  {[1, 2, 3].map((j) => (
                    <div key={`pf-${i}-${j}`}>
                      <SkeletonTextLine className="mb-1.5 h-3 w-24" />
                      <SkeletonShimmer className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                  {i === 0 ? (
                    <div className="space-y-2 pt-1">
                      <SkeletonShimmer className="h-1.5 w-full rounded-full" />
                      <SkeletonShimmer className="h-1.5 w-full rounded-full" />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <aside className="min-w-0 lg:col-span-4">
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
              <div className="border-b border-[#f0f0f0] px-4 py-3">
                <SkeletonTextLine className="h-3 w-24" />
              </div>
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((k) => (
                  <div key={`aside-${k}`} className="flex gap-3 rounded-lg border border-[#f0f0f0] p-3">
                    <SkeletonShimmer className="h-10 w-10 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonTextLine className="h-3.5 w-4/5" />
                      <SkeletonTextLine className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </LoadingShell>
  );
}

import {
  LoadingShell,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const BALANCE_COLS = 3;
const REQUEST_ROWS = 5;

/**
 * Route-level skeleton for `/leave`  mirrors {@link LeaveHubClient} header + balances grid + list column.
 */
export default function LeaveLoading() {
  return (
    <LoadingShell className="mx-auto max-w-7xl px-5 py-8 sm:px-7">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SkeletonShimmer className="h-9 w-40 rounded-md sm:h-10 sm:w-44" />
            <SkeletonShimmer className="h-9 w-24 shrink-0 rounded-full" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SkeletonTextLine className="h-3 w-20" />
            <SkeletonShimmer className="h-8 w-[7.5rem] rounded-lg" />
          </div>
          <SkeletonTextLine className="h-2.5 w-48 max-w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <section>
            <SkeletonTextLine className="mb-3 h-3 w-24" />
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
              <div className="grid divide-y divide-[#f0f0f0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {Array.from({ length: BALANCE_COLS }).map((_, i) => (
                  <div key={`bal-${i}`} className="flex flex-col gap-2 p-4 sm:p-5">
                    <SkeletonTextLine className="h-2.5 w-20" />
                    <SkeletonShimmer className="h-12 w-28 rounded-md" />
                    <SkeletonShimmer className="mt-2 h-1.5 w-full rounded-full" />
                    <SkeletonTextLine className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <SkeletonTextLine className="h-3 w-36" />
              <SkeletonShimmer className="h-8 w-28 rounded-lg" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: REQUEST_ROWS }).map((_, i) => (
                <div
                  key={`req-${i}`}
                  className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonTextLine className="h-4 w-[72%]" />
                      <SkeletonTextLine className="h-3 w-40" />
                    </div>
                    <SkeletonTextLine className="h-5 w-16 shrink-0 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4 lg:col-span-4">
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white p-4">
            <SkeletonTextLine className="mb-2 h-3 w-28" />
            <div className="mb-3 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <SkeletonTextLine key={`tm-${i}`} className="mx-auto h-2 w-6" />
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }).map((_, i) => (
                <SkeletonShimmer key={`tc-${i}`} className="aspect-square max-h-8 rounded" />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </LoadingShell>
  );
}

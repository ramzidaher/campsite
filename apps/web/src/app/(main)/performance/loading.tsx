import {
  LoadingShell,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const STAT_CARDS = 3;
const REVIEW_ROWS = 4;

/**
 * Route-level skeleton for `/performance` — mirrors {@link EmployeePerformanceIndexClient} stats + two columns.
 */
export default function PerformanceLoading() {
  return (
    <LoadingShell className="mx-auto max-w-7xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <SkeletonShimmer className="h-8 w-44 rounded-md" />
        <div className="mt-2 space-y-1.5">
          <SkeletonTextLine className="h-3.5 w-full max-w-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: STAT_CARDS }).map((_, i) => (
              <div
                key={`pst-${i}`}
                className={`rounded-2xl border p-4 ${i === 1 ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#e8e8e8] bg-white'}`}
              >
                <SkeletonShimmer className="mx-auto h-8 w-10 rounded-md" />
                <SkeletonTextLine className="mx-auto mt-2 h-3 w-24" />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
            <SkeletonTextLine className="h-4 w-64 max-w-full" />
            <div className="mt-2 space-y-1">
              <SkeletonTextLine className="h-3 w-56" />
              <SkeletonTextLine className="h-3 w-48" />
            </div>
          </div>

          <section>
            <SkeletonTextLine className="mb-3 h-3 w-48" />
            <ul className="space-y-2">
              {Array.from({ length: REVIEW_ROWS }).map((_, i) => (
                <li key={`pr-${i}`}>
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-[#e8e8e8] bg-white p-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SkeletonTextLine className="h-4 w-40" />
                        <SkeletonTextLine className="h-5 w-20 rounded-full" />
                      </div>
                      <SkeletonTextLine className="h-3 w-56" />
                      <div className="flex items-center gap-1.5">
                        <SkeletonShimmer className="h-1.5 w-1.5 rounded-full" />
                        <SkeletonTextLine className="h-3 w-44" />
                      </div>
                    </div>
                    <SkeletonTextLine className="h-3 w-4 shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="min-w-0 space-y-6 lg:col-span-4">
          <section>
            <SkeletonTextLine className="mb-3 h-3 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`mine-${i}`}
                  className="flex items-start justify-between gap-4 rounded-xl border border-[#e8e8e8] bg-white p-4"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonTextLine className="h-4 w-36" />
                    <SkeletonTextLine className="h-3 w-48" />
                  </div>
                  <SkeletonTextLine className="h-3 w-4 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </LoadingShell>
  );
}

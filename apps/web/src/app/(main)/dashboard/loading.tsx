import {
  LoadingShell,
  SkeletonPrimaryButton,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

/**
 * Route-level skeleton for `/dashboard`.
 * Primitives live in `@/components/loading`  reuse on other heavy `loading.tsx` files.
 */
export default function DashboardLoading() {
  const statCards = Array.from({ length: 4 });
  const broadcastRows = Array.from({ length: 4 });
  const weekdayLabels = Array.from({ length: 7 });
  const calendarRows = Array.from({ length: 5 });

  return (
    <LoadingShell className="px-5 py-6 sm:px-[28px] sm:py-7">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="campsite-stack-sm max-w-full">
          <SkeletonTextLine className="h-9 w-[min(18rem,85vw)] sm:w-72" />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <SkeletonTextLine className="h-4 w-48" />
            <span className="text-[#d8d8d8]" aria-hidden>
              ·
            </span>
            <SkeletonTextLine className="h-4 w-36" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch sm:items-end">
          <SkeletonPrimaryButton className="w-full min-w-[148px] sm:w-auto" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((_, index) => (
          <div
            key={`stat-skeleton-${index}`}
            className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px]"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <SkeletonShimmer className="h-4 w-4 shrink-0 rounded" />
              <SkeletonTextLine className="h-3 w-28" />
            </div>
            <SkeletonShimmer className="mb-1 h-9 w-16 rounded-md" />
            <SkeletonTextLine className="mt-3 h-3 w-[90%]" />
            <SkeletonTextLine className="mt-1.5 h-3 w-2/3" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <SkeletonShimmer className="h-7 w-44 rounded-md" />
            <SkeletonTextLine className="h-3.5 w-16 shrink-0" />
          </div>
          <div className="flex flex-col gap-2.5">
            {broadcastRows.map((_, index) => (
              <div
                key={`broadcast-skeleton-${index}`}
                className="rounded-xl border border-[#d8d8d8] bg-white px-[18px] py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonTextLine className="h-4 w-[92%]" />
                    <SkeletonTextLine className="h-4 w-[55%]" />
                  </div>
                  <SkeletonTextLine className="mt-0.5 h-3 w-14 shrink-0 rounded-full" />
                </div>
                <SkeletonShimmer className="mt-3 h-24 w-full rounded-lg" />
                <div className="mt-2 space-y-1.5">
                  <SkeletonTextLine className="h-3 w-full" />
                  <SkeletonTextLine className="h-3 w-[88%]" />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <SkeletonTextLine className="h-5 w-16 rounded-full" />
                  <SkeletonTextLine className="h-5 w-20 rounded-full" />
                  <SkeletonTextLine className="h-5 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <SkeletonShimmer className="h-6 w-32 rounded-md" />
            <div className="flex gap-1">
              <SkeletonShimmer className="h-8 w-8 rounded-lg" />
              <SkeletonShimmer className="h-8 w-8 rounded-lg" />
            </div>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {weekdayLabels.map((_, i) => (
              <SkeletonTextLine key={`wd-${i}`} className="mx-auto h-2.5 w-6" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarRows.map((_, rowIndex) =>
              Array.from({ length: 7 }).map((__, cellIndex) => (
                <SkeletonShimmer
                  key={`cal-${rowIndex}-${cellIndex}`}
                  className="aspect-square max-h-9 rounded-md"
                />
              ))
            )}
          </div>
          <div className="mt-5 space-y-3 border-t border-[#eceae4] pt-4">
            <SkeletonTextLine className="h-3 w-24" />
            <div className="space-y-2">
              <SkeletonTextLine className="h-3 w-full" />
              <SkeletonTextLine className="h-3 w-4/5" />
            </div>
            <div className="flex gap-2 pt-1">
              <SkeletonShimmer className="h-8 min-h-8 flex-1 rounded-lg" />
              <SkeletonShimmer className="h-8 min-h-8 flex-1 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </LoadingShell>
  );
}

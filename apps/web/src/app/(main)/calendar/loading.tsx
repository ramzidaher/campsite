import {
  LoadingShell,
  SkeletonPrimaryButton,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

/**
 * Route-level skeleton for `/calendar` — mirrors {@link CalendarClient} header + chrome + month grid.
 */
export default function CalendarLoading() {
  const weekdayLabels = Array.from({ length: 7 });
  const calendarRows = Array.from({ length: 5 });

  return (
    <LoadingShell className="mx-auto max-w-7xl px-5 py-7 sm:px-[28px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <SkeletonShimmer className="h-7 w-36 rounded-md sm:h-8 sm:w-40" />
          <div className="mt-2 space-y-1.5">
            <SkeletonTextLine className="h-3.5 w-[min(22rem,92vw)]" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonShimmer className="h-10 min-w-[160px] rounded-lg" />
          <SkeletonPrimaryButton className="h-10 min-w-[120px] rounded-lg" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d8d8] px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SkeletonShimmer className="h-9 w-9 shrink-0 rounded-lg" />
            <SkeletonShimmer className="h-7 w-40 max-w-[50vw] rounded-md" />
            <SkeletonShimmer className="h-9 w-9 shrink-0 rounded-lg" />
            <SkeletonTextLine className="ml-1 h-3.5 w-12" />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[#d8d8d8]">
            {['w-14', 'w-14', 'w-12', 'w-14'].map((w, i) => (
              <SkeletonShimmer
                key={`cal-view-${i}`}
                className={['h-9 border-r border-[#d8d8d8] last:border-r-0', w].join(' ')}
              />
            ))}
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 flex flex-wrap gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={`leg-${i}`} className="flex items-center gap-1.5">
                <SkeletonShimmer className="h-2 w-2 shrink-0 rounded-full" />
                <SkeletonTextLine className="h-2.5 w-20" />
              </div>
            ))}
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {weekdayLabels.map((_, i) => (
              <SkeletonTextLine key={`wd-${i}`} className="mx-auto h-2.5 w-8" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarRows.map((_, rowIndex) =>
              Array.from({ length: 7 }).map((__, cellIndex) => (
                <SkeletonShimmer
                  key={`cal-${rowIndex}-${cellIndex}`}
                  className="aspect-square max-h-11 rounded-md"
                />
              ))
            )}
          </div>
        </div>
      </div>
    </LoadingShell>
  );
}

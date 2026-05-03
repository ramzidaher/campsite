import {
  LoadingShell,
  SkeletonPrimaryButton,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

/**
 * Mirrors `BroadcastsClient` feed layout: header, mark-all + CTA row, filter toolbar, feed cards.
 */
export default function BroadcastsLoading() {
  const feedRows = Array.from({ length: 6 });

  return (
    <LoadingShell className="px-5 py-8 sm:px-7">
      <div className="mb-7">
        <SkeletonShimmer className="h-9 w-48 max-w-[90vw] rounded-md" />
        <div className="mt-2 space-y-2">
          <SkeletonTextLine className="h-4 w-full max-w-md" />
          <SkeletonTextLine className="h-4 w-[min(22rem,92vw)]" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 py-3">
        <SkeletonTextLine className="h-4 w-32" />
        <SkeletonPrimaryButton className="min-w-[140px] rounded-xl" />
      </div>

      <div className="border-b border-[#e8e8e8] py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <SkeletonShimmer className="h-9 w-[min(220px,100%)] min-w-[200px] flex-[1_1_220px] rounded-xl sm:flex-[0_0_auto]" />
          <div className="relative min-w-[240px] flex-[2_1_360px]">
            <SkeletonShimmer className="h-9 w-full rounded-xl" />
          </div>
          <SkeletonShimmer className="h-9 min-w-[170px] flex-[1_1_180px] rounded-xl" />
          <SkeletonShimmer className="h-9 min-w-[170px] flex-[1_1_180px] rounded-xl" />
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <SkeletonShimmer className="h-8 w-[118px] rounded-lg" />
            <SkeletonShimmer className="h-8 w-[76px] rounded-lg" />
            <SkeletonShimmer className="h-8 w-[88px] rounded-lg" />
          </div>
        </div>
      </div>

      <div className="py-6">
        <div className="flex flex-col gap-2.5">
          {feedRows.map((_, index) => (
            <div
              key={`broadcast-feed-skeleton-${index}`}
              className="rounded-xl border border-[#d8d8d8] bg-white px-[18px] py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonTextLine className="h-4 w-[92%]" />
                  <SkeletonTextLine className="h-4 w-[58%]" />
                </div>
                <SkeletonTextLine className="mt-0.5 h-3 w-14 shrink-0" />
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
    </LoadingShell>
  );
}

import {
  LoadingShell,
  SkeletonPrimaryButton,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const MEETING_ROWS = 5;

/**
 * Route-level skeleton for `/one-on-ones`  mirrors {@link OneOnOnesHubClient} hub + optional schedule aside.
 */
export default function OneOnOnesLoading() {
  return (
    <LoadingShell className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <div className="mb-8">
        <SkeletonShimmer className="h-9 w-48 max-w-[85vw] rounded-md" />
        <div className="mt-2 space-y-1.5">
          <SkeletonTextLine className="h-4 w-full max-w-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <div className="space-y-2">
            {Array.from({ length: MEETING_ROWS }).map((_, i) => (
              <div
                key={`oo-${i}`}
                className="rounded-xl border border-[#e8e8e8] bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SkeletonTextLine className="h-4 w-[min(18rem,80vw)]" />
                  <SkeletonTextLine className="h-5 w-20 shrink-0 rounded-full" />
                </div>
                <div className="mt-2 space-y-1.5">
                  <SkeletonTextLine className="h-3 w-full" />
                  <SkeletonTextLine className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="min-w-0 space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-[#e8e8e8] bg-white p-5">
            <SkeletonTextLine className="h-3 w-24" />
            <div className="mt-2 space-y-1.5">
              <SkeletonTextLine className="h-3.5 w-full" />
              <SkeletonTextLine className="h-3.5 w-[90%]" />
            </div>
            <SkeletonPrimaryButton className="mt-4 h-11 w-full rounded-lg" />
            <div className="mt-4 space-y-3 border-t border-[#f0f0f0] pt-4">
              <SkeletonTextLine className="h-3 w-28" />
              <SkeletonShimmer className="h-10 w-full rounded-lg" />
              <SkeletonShimmer className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </aside>
      </div>
    </LoadingShell>
  );
}

import {
  LoadingShell,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const SEGMENTS = 4;
const DAY_COLS = 7;
const GRID_ROWS = 4;

/**
 * Route-level skeleton for `/rota`  mirrors {@link RotaClient} segments + week strip + time grid.
 */
export default function RotaLoading() {
  return (
    <LoadingShell className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <div className="mb-6 campsite-stack-sm">
        <SkeletonShimmer className="h-8 w-28 rounded-md" />
        <div className="mt-2 space-y-1.5">
          <SkeletonTextLine className="h-3.5 w-full max-w-lg" />
          <SkeletonTextLine className="h-3.5 w-[min(20rem,90vw)]" />
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-[#e4e2dc] bg-[#faf9f6] px-4 py-3">
        <SkeletonTextLine className="h-3 w-3/4 max-w-2xl" />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <SkeletonShimmer
            key={`rota-seg-${i}`}
            className={['h-9 rounded-lg', i === 0 ? 'w-28' : i === 1 ? 'w-36' : i === 2 ? 'w-32' : 'w-36'].join(' ')}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-[#e4e2dc] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#ebe9e4] px-4 py-4 sm:px-6">
          <SkeletonTextLine className="mb-3 h-3 w-12" />
          <div className="flex flex-wrap gap-2">
            <SkeletonShimmer className="h-9 w-32 rounded-lg" />
            <SkeletonShimmer className="h-9 w-28 rounded-lg" />
            <SkeletonShimmer className="h-9 w-24 rounded-lg" />
          </div>
          <SkeletonTextLine className="mt-3 h-3 w-full max-w-2xl" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ebe9e4] bg-[#faf9f6] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonShimmer className="h-9 w-9 rounded-lg" />
            <SkeletonShimmer className="h-7 w-48 max-w-[55vw] rounded-md" />
            <SkeletonShimmer className="h-9 w-9 rounded-lg" />
            <SkeletonTextLine className="h-3.5 w-14" />
          </div>
          <SkeletonShimmer className="h-9 w-32 rounded-lg" />
        </div>

        <div className="overflow-x-auto p-4 sm:p-6">
          <div className="mb-2 grid min-w-[640px] grid-cols-8 gap-1">
            <SkeletonShimmer className="h-8 rounded" />
            {Array.from({ length: DAY_COLS }).map((_, i) => (
              <SkeletonTextLine key={`rd-${i}`} className="mx-auto h-3 w-10" />
            ))}
          </div>
          {Array.from({ length: GRID_ROWS }).map((_, row) => (
            <div key={`rr-${row}`} className="mb-1 grid min-w-[640px] grid-cols-8 gap-1">
              <SkeletonTextLine className="my-auto h-3 w-10 justify-self-end" />
              {Array.from({ length: DAY_COLS }).map((__, col) => (
                <SkeletonShimmer key={`rc-${row}-${col}`} className="h-14 rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </LoadingShell>
  );
}

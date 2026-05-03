import {
  LoadingShell,
  SkeletonPrimaryButton,
  SkeletonShimmer,
  SkeletonTextLine,
} from '@/components/loading';

const TRY_CHIPS = 4;
const FOLDER_ROWS = 3;
const FILE_ROWS = 6;

/**
 * Route-level skeleton for `/resources` — mirrors {@link ResourcesListClient} header, search, and grouped list.
 */
export default function ResourcesLoading() {
  return (
    <LoadingShell className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <SkeletonShimmer className="h-9 w-52 max-w-[85vw] rounded-md" />
          <SkeletonTextLine className="h-4 w-full" />
          <SkeletonTextLine className="h-4 w-[min(22rem,92vw)]" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <SkeletonShimmer className="h-10 w-28 rounded-full" />
          <SkeletonPrimaryButton className="h-10 min-w-[120px] rounded-full" />
        </div>
      </div>

      <div className="mb-8">
        <SkeletonShimmer className="h-12 w-full rounded-full" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SkeletonTextLine className="h-3.5 w-8" />
          {Array.from({ length: TRY_CHIPS }).map((_, i) => (
            <SkeletonTextLine key={`try-${i}`} className="h-5 w-28 rounded-full" />
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {Array.from({ length: FOLDER_ROWS }).map((_, fi) => (
          <section key={`folder-${fi}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SkeletonShimmer className="h-5 w-40 rounded-md" />
              <SkeletonShimmer className="h-8 w-8 rounded-lg" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: FILE_ROWS - fi }).map((_, ri) => (
                <div
                  key={`file-${fi}-${ri}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8e8e8] bg-white px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <SkeletonShimmer className="mt-0.5 h-9 w-9 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <SkeletonTextLine className="h-4 w-[min(20rem,70vw)]" />
                      <SkeletonTextLine className="h-3 w-32" />
                    </div>
                  </div>
                  <SkeletonTextLine className="h-3 w-20 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </LoadingShell>
  );
}

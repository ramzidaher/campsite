import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const shimmerBase =
  'bg-[length:200%_100%] bg-gradient-to-r from-[#e4e1da] via-[#f5f3ee] to-[#e4e1da] animate-skeleton-shimmer';

/**
 * Base shimmer block — use for cards, images, calendar cells, etc.
 * Pair with {@link SkeletonTextLine} for copy-shaped placeholders.
 */
export function SkeletonShimmer({ className }: { className: string }) {
  return <div className={[shimmerBase, className].join(' ')} aria-hidden />;
}

/** Pill-shaped line — reads as text, not a rectangle */
export function SkeletonTextLine({ className }: { className: string }) {
  return <SkeletonShimmer className={['rounded-full', className].join(' ')} />;
}

/** Dark primary action — matches `bg-campsite-text` CTAs */
export function SkeletonPrimaryButton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-10 min-w-[132px] rounded-lg bg-[length:200%_100%] bg-gradient-to-r from-[#2a2a2a] via-[#454545] to-[#2a2a2a] animate-skeleton-shimmer',
        className
      )}
      aria-hidden
    />
  );
}

/** Optional wrapper for route `loading.tsx` shells */
export function LoadingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)} aria-busy="true" aria-live="polite">
      {children}
    </div>
  );
}

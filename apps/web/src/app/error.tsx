'use client';

import Link from 'next/link';

import {
  SimpleStatusPage,
  simpleStatusOutlineButtonClass,
} from '@/components/tenant/SimpleStatusPage';
import { cn } from '@/lib/utils';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SimpleStatusPage
      minHeight="screen"
      badge="Error 500"
      title="Something went wrong"
      description="An unexpected error occurred while loading this page."
    >
      {error.digest ? (
        <p className="mt-2 text-[12px] text-[#8a8a8a]">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => reset()} className={simpleStatusOutlineButtonClass}>
          Try again
        </button>
        <Link href="/dashboard" className={simpleStatusOutlineButtonClass}>
          Go to dashboard
        </Link>
      </div>
    </SimpleStatusPage>
  );
}

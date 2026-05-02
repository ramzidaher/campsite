'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-5 py-12 sm:px-[28px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6b6b6b]">Error 500</p>
          <h1 className="mt-2 font-authSerif text-[28px] tracking-tight text-[#121212]">
            Something went wrong
          </h1>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">
            An unexpected error occurred while loading this page.
          </p>
          {error.digest ? <p className="mt-2 text-[12px] text-[#8a8a8a]">Ref: {error.digest}</p> : null}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#121212] bg-[#121212] px-4 text-[13px] font-medium text-white transition-colors hover:bg-black"
            >
              Try again
            </button>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#f5f4f1]"
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}

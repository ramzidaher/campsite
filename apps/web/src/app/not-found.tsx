import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center px-5 py-12 sm:px-[28px]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6b6b6b]">Error 404</p>
      <h1 className="mt-2 font-authSerif text-[28px] tracking-tight text-[#121212]">Page not found</h1>
      <p className="mt-2 text-[13px] text-[#6b6b6b]">
        The page you requested does not exist or may have been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#f5f4f1]"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

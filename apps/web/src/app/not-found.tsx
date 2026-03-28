import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-5 py-12 sm:px-[28px]">
      <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Page not found</h1>
      <p className="mt-2 text-[13px] text-[#6b6b6b]">The page you requested does not exist.</p>
      <Link
        href="/dashboard"
        className="mt-4 inline-block text-[13px] font-medium text-[#121212] underline underline-offset-2 hover:text-[#000]"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

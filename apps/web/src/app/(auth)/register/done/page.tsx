import Link from 'next/link';
import { RegisterDoneRepair } from '@/components/auth/RegisterDoneRepair';

function isOrgCreatorQuery(sp: {
  creator?: string;
  founder?: string;
}): boolean {
  const c = sp.creator?.trim();
  const f = sp.founder?.trim();
  return c === '1' || c === 'true' || f === '1' || f === 'true';
}

export default async function RegisterDonePage({
  searchParams,
}: {
  searchParams: Promise<{ creator?: string; founder?: string; org?: string }>;
}) {
  const sp = await searchParams;
  const orgCreator = isOrgCreatorQuery(sp);
  const orgSlug =
    typeof sp.org === 'string' && sp.org.trim().length > 0 ? sp.org.trim() : null;
  const showOrgCreator = orgCreator && orgSlug !== null;

  const loginWithOrgHref = orgSlug ? `/login?org=${encodeURIComponent(orgSlug)}` : '/login';

  if (showOrgCreator) {
    return (
      <div className="py-2 text-center">
        <RegisterDoneRepair />
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-2xl"
          aria-hidden
        >
          ✉️
        </div>
        <h2 className="auth-title">Confirm your email</h2>
        <p className="auth-sub mx-auto mb-5 max-w-md">
          Open the link in the message we sent you, then sign in here to open your workspace.
        </p>
        <div className="mx-auto mb-6 max-w-md rounded-xl border border-[#e8e6e3] bg-white px-4 py-3.5 text-left text-[13px] leading-relaxed text-[#525252] shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Workspace</p>
          <p className="mt-1 font-mono text-[14px] font-medium text-[#121212]">{orgSlug}.campsite.app</p>
          <p className="mt-3 text-[12px] text-[#6b6b6b]">
            You&apos;re the organisation admin for this space — no manager approval. Check spam if the
            email is slow.
          </p>
        </div>
        <Link
          href={loginWithOrgHref}
          className="auth-btn-primary mx-auto inline-flex w-full max-w-sm justify-center no-underline"
        >
          Sign in to your workspace
        </Link>
        <p className="mt-6 text-[12px] text-[#9b9b9b]">
          <Link href="/login" className="font-medium text-[#6b6b6b] underline underline-offset-2">
            Other sign-in options
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="py-4 text-center">
      <RegisterDoneRepair />
      <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-amber-100 text-[32px]">
        ⏳
      </div>
      <h2 className="auth-title">Awaiting approval</h2>
      <p className="auth-sub mx-auto mb-6 max-w-md">
        Your registration has been submitted to your department manager. We&apos;ll notify you as soon
        as it&apos;s reviewed.
      </p>
      <p className="mx-auto mb-4 max-w-md text-left text-[12px] leading-relaxed text-[#9b9b9b]">
        If your project requires email confirmation, open the link in that email and sign in once so your
        profile appears for approvers. Until then, managers may not see you in Pending approval.
      </p>
      <span className="mb-6 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-medium text-amber-900">
        ● Pending verification
      </span>
      <div className="mt-6 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 text-left text-[13px] leading-relaxed text-[#6b6b6b]">
        <strong className="block text-[#121212]">Expected wait time:</strong> about 1 working day.
        <span className="mt-1 block text-xs text-[#9b9b9b]">
          If you haven&apos;t heard back in a couple of days, contact your manager directly.
        </span>
      </div>
      <Link href="/login" className="auth-btn-ghost mt-8 inline-flex no-underline">
        Back to sign in
      </Link>
    </div>
  );
}

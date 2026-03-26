import Link from 'next/link';
import { RegisterDoneRepair } from '@/components/auth/RegisterDoneRepair';

export default function RegisterDonePage() {
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

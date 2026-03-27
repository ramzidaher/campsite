import { InviteSetPasswordForm } from '@/components/auth/InviteSetPasswordForm';

export default async function AuthSetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; from_invite?: string }>;
}) {
  const sp = await searchParams;
  const fromInvite = sp.from_invite === '1';
  return (
    <div className="min-h-screen bg-[#faf9f6] px-6 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[460px] flex-col justify-center">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#121212] text-lg text-white">
            ⛺
          </div>
          <span className="font-authSerif text-xl tracking-tight text-[#121212]">Campsite</span>
        </div>
        <InviteSetPasswordForm nextPath={sp.next} fromInvite={fromInvite} />
      </div>
    </div>
  );
}

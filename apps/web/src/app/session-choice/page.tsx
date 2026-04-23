import Link from 'next/link';
import { headers } from 'next/headers';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';
import { redirect } from 'next/navigation';
import { syncRegistrationAvatarToProfileIfEmpty } from '@/lib/auth/completeRegistrationProfile';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { tenantHostMatchesOrg, tenantSubdomainOriginForHost } from '@/lib/tenant/adminUrl';
import { getPlatformAdminHost, getTenantRootDomain } from '@/lib/tenant/hostConfig';

export default async function SessionChoicePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    redirect('/login?next=/session-choice');
  }

  await syncRegistrationAvatarToProfileIfEmpty(supabase, user);

  const founder = await isPlatformFounder(supabase, user.id);
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, org_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!founder) {
    redirect('/');
  }
  if (!profile || profile.status === 'inactive') {
    redirect('/');
  }
  if (profile.status === 'pending') {
    redirect('/pending');
  }
  if (!profile.org_id) {
    redirect('/founders');
  }

  const { data: org } = await supabase
    .from('organisations')
    .select('name, slug')
    .eq('id', profile.org_id)
    .maybeSingle();
  const orgName = (org?.name as string | undefined)?.trim() || 'Your organisation';
  const orgSlug = (org?.slug as string | undefined)?.trim() || '';
  const host = (await headers()).get('host');
  const founderHqHref =
    host?.toLowerCase().split(':')[0] === getPlatformAdminHost().toLowerCase()
      ? '/founders'
      : `https://${getPlatformAdminHost()}/founders`;
  const memberDashboardHref =
    orgSlug && !tenantHostMatchesOrg(orgSlug, host)
      ? `${tenantSubdomainOriginForHost(orgSlug, host)}/dashboard`
      : '/dashboard';

  return (
    <div className="auth-shell-main flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <CampsiteLogoMark className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-[#121212]" />
          <span className="font-authSerif text-xl tracking-tight text-[#121212]">Campsite</span>
        </div>

        <h1 className="auth-title text-center">Where would you like to go?</h1>
        <p className="auth-sub mt-3 text-center">
          You&apos;re a platform founder and a member of <strong className="font-medium text-[#121212]">{orgName}</strong>.
          Open the member app for your organisation, or Founder HQ to manage the platform.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href={memberDashboardHref}
            className="flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] bg-[#121212] px-4 py-3 text-center text-sm font-medium text-[#faf9f6] no-underline transition-opacity hover:opacity-[0.88]"
          >
            <span>{orgName}</span>
            <span className="text-[11px] font-normal text-white/75">Member dashboard</span>
          </Link>
          <Link
            href={founderHqHref}
            className="flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border border-[#d8d8d8] bg-transparent px-4 py-3 text-center text-sm font-medium text-[#121212] no-underline transition-colors hover:bg-[#f5f4f1]"
          >
            <span>Founder HQ</span>
            <span className="text-[11px] font-normal text-[#6b6b6b]">
              Organisations, members, and platform tools
            </span>
          </Link>
        </div>

        {orgSlug ? (
          <p className="mt-6 text-center text-[12px] text-[#9b9b9b]">
            Sign in at <span className="font-medium text-[#6b6b6b]">camp-site.co.uk</span> with your work email
            — we&apos;ll connect you to the right workspace.
          </p>
        ) : null}
      </div>
    </div>
  );
}

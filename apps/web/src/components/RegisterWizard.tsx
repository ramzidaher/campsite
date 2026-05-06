'use client';

import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Check, ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { uploadUserAvatar } from '@/lib/storage/uploadUserAvatar';
import { clientEmailRedirectBaseUrl } from '@/lib/auth/inviteCallbackBaseUrl';
import {
  isValidWorkspaceSlug,
  normalizeWorkspaceSlugInput,
  suggestSlugFromOrganisationName,
} from '@/lib/org/slug';
import { FALLBACK_LEGAL_SETTINGS } from '@/lib/legal/fallbackDefaults';

type Org = { id: string; name: string; slug: string; logo_url: string | null };
type Dept = { id: string; name: string; type: 'department' | 'society' | 'club' };
const JOIN_STEP_LABELS = [
  'Account',
  'Organisation',
  'Profile (optional)',
  'Review',
] as const;
const CREATE_ORG_STEP_LABELS = ['Account', 'Organisation', 'Profile (optional)'] as const;

function passwordStrengthScore(pw: string): { score: number; label: string; color: string; width: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map: Record<number, [string, string, string]> = {
    0: ['0%', '#d8d8d8', 'Enter a password'],
    1: ['25%', '#b91c1c', 'Weak'],
    2: ['50%', '#d97706', 'Fair'],
    3: ['75%', '#ca8a04', 'Good'],
    4: ['100%', '#15803d', 'Strong'],
  };
  const [width, color, label] = map[score] ?? map[0]!;
  return { score, label, color, width };
}

function passwordStrength(pw: string): 'weak' | 'ok' | 'strong' {
  if (pw.length < 8) return 'weak';
  const hasNum = /\d/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  if (hasNum && hasUpper && pw.length >= 10) return 'strong';
  if (pw.length >= 8 && (hasNum || hasUpper)) return 'ok';
  return 'weak';
}

function StepProgress({ step, labels }: { step: number; labels: readonly string[] }) {
  return (
    <div className="mb-8">
      <p className="mb-3 text-center text-[11.5px] font-medium text-[#9b9b9b] md:hidden">
        Step {step} of {labels.length}: {labels[step - 1]}
      </p>
      <div className="hidden md:block">
        <div className="flex w-full">
          {labels.map((label, i) => {
            const n = i + 1;
            const isDone = n < step;
            const isActive = n === step;
            const circle = (
              <div
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs font-medium transition-colors',
                  isDone
                    ? 'border-[#15803d] bg-[#15803d] text-white'
                    : isActive
                      ? 'border-[#121212] bg-[#121212] text-white'
                      : 'border-[#d8d8d8] bg-white text-[#9b9b9b]',
                ].join(' ')}
              >
                {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
              </div>
            );
            return (
              <div key={label} className="relative flex min-w-0 flex-1 flex-col items-center">
                <div className="relative h-7 w-full">
                  {i > 0 ? (
                    <div
                      className={[
                        'absolute left-0 top-1/2 right-1/2 z-0 h-px -translate-y-1/2',
                        step > i ? 'bg-[#15803d]' : 'bg-[#d8d8d8]',
                      ].join(' ')}
                      aria-hidden
                    />
                  ) : null}
                  {i < labels.length - 1 ? (
                    <div
                      className={[
                        'absolute left-1/2 top-1/2 right-0 z-0 h-px -translate-y-1/2',
                        step > i + 1 ? 'bg-[#15803d]' : 'bg-[#d8d8d8]',
                      ].join(' ')}
                      aria-hidden
                    />
                  ) : null}
                  <div className="absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2">
                    {circle}
                  </div>
                </div>
                <span
                  className={[
                    'mt-2 w-full max-w-[10rem] px-1 text-center text-[11px] font-medium leading-tight',
                    isActive ? 'text-[#121212]' : 'text-[#9b9b9b]',
                  ].join(' ')}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RegisterWizard({
  initialOrgSlug,
  initialInviteToken,
  initialLegalBundleVersion = FALLBACK_LEGAL_SETTINGS.bundle_version,
}: {
  initialOrgSlug: string | null;
  initialInviteToken?: string | null;
  /** From `platform_legal_settings` (server); must match signup metadata for stored acceptance. */
  initialLegalBundleVersion?: string;
}) {
  const router = useRouter();
  /** Invite link (`/register?org=slug`) - only then can users join an existing org from this wizard. */
  const inviteFlow = Boolean(initialOrgSlug);
  /** Create a new tenant; user becomes org_admin (not the same as platform founders). */
  const createOrgFlow = !inviteFlow;
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [boundOrgId, setBoundOrgId] = useState<string | null>(null);
  const [boundOrgName, setBoundOrgName] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgLogoUrl, setNewOrgLogoUrl] = useState('');
  const [newOrgLogoDomain, setNewOrgLogoDomain] = useState('');
  const [orgLogoUploading, setOrgLogoUploading] = useState(false);
  const [orgLogoLookupLoading, setOrgLogoLookupLoading] = useState(false);
  const [newOrgLogoFile, setNewOrgLogoFile] = useState<File | null>(null);
  const [orgLogoPreviewUrl, setOrgLogoPreviewUrl] = useState<string | null>(null);
  const orgLogoFileInputRef = useRef<HTMLInputElement>(null);
  const [orgSlugInput, setOrgSlugInput] = useState('');
  /** Once true, organisation name changes no longer overwrite the short-name field. */
  const [orgSlugUserEdited, setOrgSlugUserEdited] = useState(false);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string>>(new Set());
  /** Uploaded after sign-up when a session exists; URL is written to auth metadata for profile creation. */
  const [optionalAvatarFile, setOptionalAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [legalConsent, setLegalConsent] = useState(false);
  const inviteToken = (initialInviteToken ?? '').trim();

  const strength = passwordStrength(password);
  const strengthVis = passwordStrengthScore(password);
  const workspaceSlugNormalized = useMemo(
    () => normalizeWorkspaceSlugInput(orgSlugInput),
    [orgSlugInput]
  );
  const stepLabels = inviteFlow ? JOIN_STEP_LABELS : CREATE_ORG_STEP_LABELS;

  const loadOrgs = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from('organisations')
      .select('id,name,slug,logo_url')
      .eq('is_active', true)
      .order('name');
    if (e) {
      setError(e.message);
      return;
    }
    setOrgs(data ?? []);
  }, []);

  const loadDepartments = useCallback(async (oId: string) => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from('departments')
      .select('id,name,type')
      .eq('org_id', oId)
      .eq('is_archived', false)
      .order('name');
    if (e) {
      setError(e.message);
      return;
    }
    setDepts((data ?? []) as Dept[]);
  }, []);

  useEffect(() => {
    if (inviteFlow) {
      void loadOrgs();
    }
  }, [inviteFlow, loadOrgs]);

  useEffect(() => {
    if (!inviteFlow || !orgs.length || !initialOrgSlug || orgId) return;
    const match = orgs.find((o) => o.slug === initialOrgSlug);
    if (match) {
      setOrgId(match.id);
      setBoundOrgId(match.id);
      setBoundOrgName(match.name);
      void loadDepartments(match.id);
    }
  }, [inviteFlow, orgs, initialOrgSlug, orgId, loadDepartments]);

  useEffect(() => {
    if (!createOrgFlow || orgSlugUserEdited) return;
    setOrgSlugInput(suggestSlugFromOrganisationName(newOrgName));
  }, [createOrgFlow, newOrgName, orgSlugUserEdited]);

  useEffect(() => {
    if (!optionalAvatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(optionalAvatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [optionalAvatarFile]);

  useEffect(() => {
    if (!newOrgLogoFile) {
      setOrgLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(newOrgLogoFile);
    setOrgLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newOrgLogoFile]);

  function normalizeDomain(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '');
      if (!host.includes('.')) return null;
      return host;
    } catch {
      return null;
    }
  }

  async function lookupOrgLogoFromDomain() {
    const domain = normalizeDomain(newOrgLogoDomain);
    if (!domain) {
      setError('Enter a valid website domain, for example acme.com.');
      return;
    }
    setError(null);
    setOrgLogoLookupLoading(true);
    try {
      const res = await fetch('/api/org-logo/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error || 'Could not find a logo for that domain.');
        return;
      }
      setNewOrgLogoUrl(body.url);
      setNewOrgLogoFile(null);
    } catch {
      setError('Network error while finding logo.');
    } finally {
      setOrgLogoLookupLoading(false);
    }
  }

  async function uploadNewOrgLogo(file: File) {
    setError(null);
    setOrgLogoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/org-logo/upload', {
        method: 'POST',
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error || 'Could not upload the selected logo.');
        return;
      }
      setNewOrgLogoFile(file);
      setNewOrgLogoUrl(body.url);
    } catch {
      setError('Network error while uploading logo.');
    } finally {
      setOrgLogoUploading(false);
      if (orgLogoFileInputRef.current) orgLogoFileInputRef.current.value = '';
    }
  }

  async function submit() {
    setError(null);
    setInfo(null);
    if (!legalConsent) {
      setError(
        'You must agree to the Terms of service, Privacy policy, and Data processing information.'
      );
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (strength === 'weak') {
      setError('Choose a stronger password (8+ characters, mix of letters and numbers).');
      return;
    }

    const supabase = createClient();
    const origin = clientEmailRedirectBaseUrl() || window.location.origin;
    let signUpData: {
      user: { id: string } | null;
      session: unknown;
    };
    const emailRedirectTo = createOrgFlow
      ? `${origin}/auth/callback?next=/dashboard`
      : `${origin}/auth/callback?next=/pending`;

    if (createOrgFlow) {
      const nameTrim = newOrgName.trim();
      if (nameTrim.length < 1) {
        setError('Please enter your organisation name.');
        return;
      }
      if (nameTrim.length > 120) {
        setError('Please shorten your organisation name to 120 characters or fewer.');
        return;
      }
      if (!isValidWorkspaceSlug(workspaceSlugNormalized)) {
        setError(
          'We need at least two letters or numbers in your short name (no spaces). Add a word to your organisation name above, or type a short name you prefer in the second box.'
        );
        return;
      }

      setLoading(true);
      const createMeta: Record<string, string> = {
        full_name: fullName,
        register_create_org_name: nameTrim,
        register_create_org_slug: workspaceSlugNormalized,
        register_legal_bundle_version: initialLegalBundleVersion,
        register_legal_host: window.location.host,
        register_legal_path: window.location.pathname,
        register_legal_user_agent: navigator.userAgent,
      };
      if (newOrgLogoUrl.trim()) {
        createMeta.register_create_org_logo_url = newOrgLogoUrl.trim();
      }
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: createMeta,
          emailRedirectTo,
        },
      });
      if (signErr || !data.user) {
        const signMsg = (signErr?.message ?? '').toLowerCase();
        const alreadyRegistered =
          signMsg.includes('already') ||
          signMsg.includes('registered') ||
          signMsg.includes('exists') ||
          signMsg.includes('duplicate');
        if (alreadyRegistered) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInErr) {
            setLoading(false);
            setError(
              'This email already has an account. Sign in first, then retry creating your organisation from this form.'
            );
            return;
          }
          const res = await fetch('/api/auth/create-org-for-existing-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              org_name: nameTrim,
              org_slug: workspaceSlugNormalized,
              org_logo_url: newOrgLogoUrl.trim() || null,
              legal_bundle_version: initialLegalBundleVersion,
              legal_host: window.location.host,
              legal_path: window.location.pathname,
              legal_user_agent: navigator.userAgent,
              full_name: fullName,
            }),
          });
          const fallbackBody = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            setLoading(false);
            setError(fallbackBody.error ?? 'Could not create organisation for existing account.');
            return;
          }
          setLoading(false);
          router.replace('/');
          router.refresh();
          return;
        }
        setLoading(false);
        setError(signErr?.message ?? 'Could not create account.');
        return;
      }
      signUpData = data;
    } else {
      if (!inviteToken) {
        setError('Your sign-up link is missing a valid invite token. Ask an admin for a new link.');
        return;
      }
      if (!orgId) {
        setError('We could not match your organisation from this sign-up link. Ask your admin for a fresh link.');
        return;
      }
      if (boundOrgId && orgId !== boundOrgId) {
        setError('Organisation mismatch. Please use the original sign-up link from your organisation.');
        return;
      }
      const fallbackDeptIds =
        selectedDeptIds.size > 0
          ? [...selectedDeptIds]
          : depts[0]?.id
            ? [depts[0].id]
            : [];
      if (fallbackDeptIds.length === 0) {
        setError('No default department is configured for this organisation yet. Ask an admin to set one up.');
        return;
      }

      setLoading(true);
      const joinMeta: Record<string, string> = {
        full_name: fullName,
        register_org_id: orgId,
        register_invite_token: inviteToken,
        register_dept_ids: JSON.stringify(fallbackDeptIds),
        register_legal_bundle_version: initialLegalBundleVersion,
        register_legal_host: window.location.host,
        register_legal_path: window.location.pathname,
        register_legal_user_agent: navigator.userAgent,
      };
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: joinMeta,
          emailRedirectTo,
        },
      });
      if (signErr || !data.user) {
        const signMsg = (signErr?.message ?? '').toLowerCase();
        const alreadyRegistered =
          signMsg.includes('already') ||
          signMsg.includes('registered') ||
          signMsg.includes('exists') ||
          signMsg.includes('duplicate');
        if (alreadyRegistered) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (!signInErr) {
            const joinNowRes = await fetch('/api/auth/join-org-for-existing-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                full_name: fullName,
                org_slug: initialOrgSlug,
                department_ids: [],
                invite_token: inviteToken,
              }),
            });
            const joinNowBody = (await joinNowRes.json().catch(() => ({}))) as {
              error?: string;
              status?: 'active' | 'pending_approval';
            };
            if (!joinNowRes.ok) {
              setLoading(false);
              setError(joinNowBody.error ?? 'Could not join this organisation right now.');
              return;
            }
            setLoading(false);
            if (joinNowBody.status === 'active') {
              router.replace('/');
              router.refresh();
              return;
            }
            setInfo(
              'Registration submitted for approval. Your account is linked to this organisation, and an admin must approve access before you can switch into it.'
            );
            return;
          }

          const res = await fetch('/api/auth/register-existing-membership', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              full_name: fullName,
              org_slug: initialOrgSlug,
              department_ids: [],
              invite_token: inviteToken,
            }),
          });
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          setLoading(false);
          setInfo(
            body.message ??
              'We sent a sign-in link so you can finish joining this organisation. If you know your password, sign in and submit again to continue instantly.'
          );
          return;
        }
        setLoading(false);
        setError(signErr?.message ?? 'Could not create account.');
        return;
      }
      signUpData = data;
    }

    const userId = signUpData.user!.id;
    /** Set when a file was uploaded; profile row may already exist from the auth trigger before metadata had the URL. */
    let uploadedAvatarPublicUrl: string | null = null;
    const { completeRegistrationProfileIfNeeded } = await import('@/lib/auth/completeRegistrationProfile');
    const legalFlow = createOrgFlow ? 'create_org' : 'join_org';

    async function recordServerLegalAcceptance(bundleVersion: string) {
      try {
        await fetch('/api/legal/acceptance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bundleVersion,
            acceptedAt: new Date().toISOString(),
            source: 'registration_server_capture',
            flow: legalFlow,
          }),
        });
      } catch {
        // Do not block registration success on supplemental server-side evidence logging.
      }
    }

    async function withUploadedAvatarIfPresent(userRow: User): Promise<User> {
      if (!optionalAvatarFile) return userRow;
      const up = await uploadUserAvatar(supabase, userRow.id, optionalAvatarFile);
      if (!up.ok) {
        throw new Error(up.message);
      }
      uploadedAvatarPublicUrl = up.publicUrl;
      const { data: upd, error: ue } = await supabase.auth.updateUser({
        data: { register_avatar_url: up.publicUrl },
      });
      if (ue) throw new Error(ue.message);
      return upd.user ?? userRow;
    }

    let sessionUser = signUpData.user as User;
    if (signUpData.session) {
      try {
        sessionUser = await withUploadedAvatarIfPresent(sessionUser);
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Could not upload photo.');
        return;
      }
      const done = await completeRegistrationProfileIfNeeded(supabase, sessionUser);
      if (!done.ok) {
        setLoading(false);
        setError(done.message);
        return;
      }
    } else {
      await new Promise((r) => setTimeout(r, 400));
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.user) {
        sessionUser = sess.session.user;
        try {
          sessionUser = await withUploadedAvatarIfPresent(sessionUser);
        } catch (err) {
          setLoading(false);
          setError(err instanceof Error ? err.message : 'Could not upload photo.');
          return;
        }
        const done = await completeRegistrationProfileIfNeeded(supabase, sessionUser);
        if (!done.ok) {
          setLoading(false);
          setError(done.message);
          return;
        }
      }
    }

    const { data: sessFinal } = await supabase.auth.getSession();
    if (sessFinal.session) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id,status')
        .eq('id', userId)
        .maybeSingle();
      if (!prof) {
        setLoading(false);
        setError(
          'Your account was created but your member profile was not saved. If you were asked to confirm your email, open the link in that message, then sign in once. You can also ask an organisation admin to add you.'
        );
        return;
      }
      if (uploadedAvatarPublicUrl) {
        const { error: syncErr } = await supabase.rpc('sync_my_registration_avatar', {
          p_url: uploadedAvatarPublicUrl,
        });
        if (syncErr) {
          setLoading(false);
          setError(syncErr.message);
          return;
        }
      }
      await recordServerLegalAcceptance(initialLegalBundleVersion);
      setLoading(false);
      if (prof.status === 'active') {
        router.replace('/');
      } else {
        router.replace('/pending');
      }
      router.refresh();
      return;
    }

    setLoading(false);
    if (createOrgFlow && isValidWorkspaceSlug(workspaceSlugNormalized)) {
      router.replace(
        `/register/done?creator=1&org=${encodeURIComponent(workspaceSlugNormalized)}`
      );
    } else {
      router.replace('/register/done');
    }
    router.refresh();
  }

  const orgName = orgs.find((o) => o.id === orgId)?.name;

  return (
    <div className="campsite-stack-md">
      {step === 1 ? (
        <Link
          href="/login"
          prefetch={false}
          className="group inline-flex items-center gap-1 self-start text-[13px] font-medium text-[#6b6b6b] underline-offset-2 hover:text-[#121212] hover:underline"
        >
          <ChevronLeft
            className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
            aria-hidden
            strokeWidth={2}
          />
          Back to sign in
        </Link>
      ) : null}

      <StepProgress step={step} labels={stepLabels} />

      {error ? <p className="rounded-[10px] bg-red-500/10 px-3 py-2 text-sm text-[#b91c1c]">{error}</p> : null}
      {info ? <p className="rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-2 text-sm text-[#121212]">{info}</p> : null}

      {step === 1 ? (
        <div className="campsite-stack-md">
          <h2 className="auth-title">Create your account</h2>
          <p className="auth-sub">
            {orgName ? (
              <>
                Joining <strong className="font-medium text-[#121212]">{orgName}</strong>
              </>
            ) : (
              'Set up your Campsite profile'
            )}
          </p>
          <div className="mb-4">
            <label className="auth-label" htmlFor="reg-name">
              Full name
            </label>
            <input
              id="reg-name"
              className="auth-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alex Johnson"
              required
            />
          </div>
          <div className="mb-4">
            <label className="auth-label" htmlFor="reg-email">
              Email address
            </label>
            <input
              id="reg-email"
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@organisation.ac.uk"
              required
            />
            <p className="mt-1.5 text-[11.5px] text-[#9b9b9b]">
              Use your organisation email for faster verification
            </p>
          </div>
          <div className="mb-4">
            <label className="auth-label" htmlFor="reg-pw">
              Password
            </label>
            <input
              id="reg-pw"
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
            />
            <div className="mt-2 h-[3px] overflow-hidden rounded-sm bg-[#d8d8d8]">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: strengthVis.width, backgroundColor: strengthVis.color }}
              />
            </div>
            <p className="mt-1.5 text-[11.5px]" style={{ color: strengthVis.color }}>
              {strengthVis.label}
            </p>
          </div>
          <div className="mb-8">
            <label className="auth-label" htmlFor="reg-pw2">
              Confirm password
            </label>
            <input
              id="reg-pw2"
              type="password"
              className="auth-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          <div className="mb-8 flex gap-3">
            <input
              id="reg-legal-consent"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--campsite-border)] text-[var(--campsite-accent)] focus:ring-[var(--campsite-accent)]"
              checked={legalConsent}
              onChange={(e) => setLegalConsent(e.target.checked)}
            />
            <label
              htmlFor="reg-legal-consent"
              className="text-[12.5px] leading-snug text-[var(--campsite-text-secondary)]"
            >
              I agree to the{' '}
              <Link
                href="/terms"
                className="font-medium text-[var(--campsite-text)] underline underline-offset-2"
              >
                Terms of service
              </Link>
              ,{' '}
              <Link
                href="/privacy"
                className="font-medium text-[var(--campsite-text)] underline underline-offset-2"
              >
                Privacy policy
              </Link>
              , and{' '}
              <Link
                href="/legal/data-processing"
                className="font-medium text-[var(--campsite-text)] underline underline-offset-2"
              >
                Data processing information
              </Link>{' '}
              {/* (bundle {initialLegalBundleVersion}). */}
            </label>
          </div>
          <button
            type="button"
            className="auth-btn-primary"
            onClick={() => {
              setError(null);
              setInfo(null);
              if (!fullName.trim() || !email.trim()) {
                setError('Please fill in all required fields.');
                return;
              }
              if (!legalConsent) {
                setError(
                  'Please agree to the Terms of service, Privacy policy, and Data processing information.'
                );
                return;
              }
              if (password !== confirm) {
                setError('Passwords do not match.');
                return;
              }
              setStep(2);
            }}
          >
            Continue
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="campsite-stack-md">
          <h2 className="auth-title">Your organisation</h2>
          <p className="auth-sub">
            {inviteFlow
              ? 'We matched your workspace from the sign-up link and locked it to your organisation.'
              : 'Tell us your organisation name. We’ll suggest a short identifier for shared links and invites  change it only if you want to.'}
          </p>

          {inviteFlow ? (
            <div className="mb-8">
              <label className="auth-label" htmlFor="reg-org-fixed">
                Organisation
              </label>
              <div
                id="reg-org-fixed"
                className="auth-input flex items-center justify-between bg-[#f5f4f1] text-[#121212]"
                aria-live="polite"
              >
                <span>{boundOrgName ?? orgName ?? 'Resolving organisation...'}</span>
                <span className="text-[11.5px] text-[#9b9b9b]">Locked</span>
              </div>
            </div>
          ) : (
            <div className="mb-8 space-y-5">
              <div>
                <label className="auth-label" htmlFor="reg-org-name">
                  What&apos;s your organisation called?
                </label>
                <input
                  id="reg-org-name"
                  className="auth-input"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Riverside Community Trust"
                  maxLength={120}
                  required
                />
              </div>
              {isValidWorkspaceSlug(workspaceSlugNormalized) ? (
                <p className="rounded-xl border border-[#e8e6e3] bg-white px-4 py-3 text-[13px] leading-relaxed text-[#525252]">
                  <span className="font-medium text-[#121212]">Invites and shared links</span>{' '}
                  <span className="text-[#6b6b6b]">
                    will include your short name (<span className="font-mono text-[12px] text-[#121212]">{workspaceSlugNormalized}</span>)
                    so people join the right workspace.
                  </span>
                </p>
              ) : newOrgName.trim().length > 0 ? (
                <p className="text-[12px] leading-relaxed text-[#9b9b9b]">
                  Keep typing your organisation name, we&apos;ll build a simple address from it. You can
                  adjust it in the next box if needed.
                </p>
              ) : null}
              <div>
                <label className="auth-label" htmlFor="reg-org-slug">
                  Short name for invitations
                </label>
                <p className="mb-1.5 text-[11.5px] text-[#9b9b9b]">
                  We suggest this from your organisation name, change it only if you want something different.
                </p>
                <input
                  id="reg-org-slug"
                  className="auth-input text-[15px]"
                  value={orgSlugInput}
                  onChange={(e) => {
                    setOrgSlugUserEdited(true);
                    setOrgSlugInput(e.target.value);
                  }}
                  placeholder="e.g. riverside-union"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="reg-org-slug-hint"
                />
                <p id="reg-org-slug-hint" className="mt-1.5 text-[11.5px] leading-relaxed text-[#9b9b9b]">
                  Letters and numbers are fine; we add hyphens for you. This stays the same after
                  signup, contact support if you need to change it later.
                </p>
              </div>
              <div className="rounded-xl border border-[#e8e6e3] bg-white p-3">
                <div className="text-[13px] font-medium text-[#121212]">Organisation logo (optional)</div>
                <p className="mt-1 campsite-body text-[#9b9b9b]">
                  Add a logo now so your workspace starts with branding.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    className="auth-input"
                    value={newOrgLogoDomain}
                    onChange={(e) => setNewOrgLogoDomain(e.target.value)}
                    placeholder="Website domain (e.g. acme.com)"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void lookupOrgLogoFromDomain()}
                    disabled={orgLogoLookupLoading}
                    className="auth-btn-ghost min-w-[120px]"
                  >
                    {orgLogoLookupLoading ? 'Finding...' : 'Find logo'}
                  </button>
                </div>
                <div className="mt-2">
                  <input
                    ref={orgLogoFileInputRef}
                    id="reg-org-logo-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      void uploadNewOrgLogo(f);
                    }}
                  />
                  <label
                    htmlFor="reg-org-logo-file"
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-2 text-[12px] font-medium text-[#121212] hover:bg-[#efede9]"
                  >
                    {orgLogoUploading ? 'Uploading...' : 'Upload custom logo'}
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-[11.5px] text-[#9b9b9b]">Logo URL</span>
                  <input
                    className="auth-input"
                    value={newOrgLogoUrl}
                    onChange={(e) => setNewOrgLogoUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </label>
                {newOrgLogoUrl.trim() ? (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#eceae7] bg-[#faf9f7] p-2.5">
                    <img
                      src={newOrgLogoUrl.trim()}
                      alt=""
                      className="h-10 w-10 rounded-md border border-[#e8e6e3] bg-white object-contain"
                    />
                    <div className="text-[11.5px] text-[#9b9b9b]">
                      {newOrgLogoFile ? 'Custom upload selected.' : 'Using provided image URL.'}
                    </div>
                  </div>
                ) : null}
                {orgLogoPreviewUrl && !newOrgLogoUrl.trim() ? (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#eceae7] bg-[#faf9f7] p-2.5">
                    <img
                      src={orgLogoPreviewUrl}
                      alt=""
                      className="h-10 w-10 rounded-md border border-[#e8e6e3] bg-white object-contain"
                    />
                    <div className="text-[11.5px] text-[#9b9b9b]">Preview</div>
                  </div>
                ) : null}
              </div>
              <p className="rounded-xl bg-[#f5f4f1] p-3 text-[12px] leading-relaxed text-[#6b6b6b]">
                After you sign in, you can invite people and add teams. We start you with one team called{' '}
                <strong className="font-medium text-[#121212]">General</strong>.
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className="auth-btn-ghost flex-1"
              onClick={() => {
                if (createOrgFlow) setOrgSlugUserEdited(false);
                setStep(1);
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="auth-btn-primary flex-[2]"
              onClick={() => {
                setError(null);
                setInfo(null);
                if (inviteFlow) {
                  if (!inviteToken) {
                    setError('Your sign-up link is missing a valid invite token. Ask your admin for a new link.');
                    return;
                  }
                  if (!orgId) {
                    setError(
                      'We could not match your organisation from this sign-up link. Ask your admin for a fresh link.'
                    );
                    return;
                  }
                  if (boundOrgId && orgId !== boundOrgId) {
                    setError('Organisation mismatch. Please use the original sign-up link from your organisation.');
                    return;
                  }
                  setStep(3);
                  return;
                }
                const nameTrim = newOrgName.trim();
                if (nameTrim.length < 1) {
                  setError('Please enter your organisation name.');
                  return;
                }
                if (!isValidWorkspaceSlug(workspaceSlugNormalized)) {
                  setError(
                    'We need at least two letters or numbers in the short name (no spaces). Add a word to your organisation name, or edit the short name box.'
                  );
                  return;
                }
                setStep(3);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="campsite-stack-md">
          <h2 className="auth-title">Profile photo (optional)</h2>
          <p className="auth-sub">
            Add a picture for your profile if you like, you can skip this and add or change it later in
            Settings.
          </p>
          <input
            ref={avatarFileInputRef}
            id="reg-avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              setError(null);
              const f = e.target.files?.[0] ?? null;
              if (!f) {
                setOptionalAvatarFile(null);
                return;
              }
              const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
              if (!allowed.has(f.type)) {
                setError('Please choose a JPEG, PNG, WebP, or GIF image.');
                e.target.value = '';
                return;
              }
              if (f.size > 5 * 1024 * 1024) {
                setError('Image must be 5 MB or smaller.');
                e.target.value = '';
                return;
              }
              setOptionalAvatarFile(f);
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="reg-avatar-file"
              className="auth-btn-ghost inline-flex cursor-pointer items-center justify-center"
            >
              Choose photo
            </label>
            {optionalAvatarFile ? (
              <button
                type="button"
                className="text-[13px] font-medium text-[#9b9b9b] underline decoration-[#9b9b9b] underline-offset-2 hover:text-[#121212]"
                onClick={() => {
                  setOptionalAvatarFile(null);
                  if (avatarFileInputRef.current) avatarFileInputRef.current.value = '';
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[#9b9b9b]">
            JPEG, PNG, WebP, or GIF, up to 5 MB. If you must confirm your email before signing in, you can
            add a photo in Settings afterward.
          </p>
          {avatarPreviewUrl ? (
            <div className="mt-5 flex flex-col items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Preview</p>
              <img
                src={avatarPreviewUrl}
                alt=""
                className="h-20 w-20 rounded-full border border-[#e8e6e3] bg-[#f5f4f1] object-cover"
              />
            </div>
          ) : null}
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              className="auth-btn-ghost flex-1"
              onClick={() => {
                setError(null);
                setStep(2);
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={createOrgFlow && loading}
              className="auth-btn-primary flex-[2]"
              onClick={() => {
                setError(null);
                setInfo(null);
                if (inviteFlow) {
                  setStep(4);
                  return;
                }
                void submit();
              }}
            >
              {createOrgFlow ? (
                <>
                  {loading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : null}
                  Create your workspace
                </>
              ) : optionalAvatarFile ? (
                'Continue'
              ) : (
                'Skip'
              )}
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 && inviteFlow ? (
        <div className="campsite-stack-md">
          <h2 className="auth-title">Review & submit</h2>
          <p className="auth-sub">
            Check your details before sending your registration for approval
          </p>
          <div className="mb-4 rounded-xl bg-[#f5f4f1] p-4">
            <p className="mb-3 text-[13px] font-medium text-[#9b9b9b]">Account details</p>
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-4">
                <span className="text-[#6b6b6b]">Name</span>
                <span className="font-medium text-[#121212]">{fullName || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#6b6b6b]">Email</span>
                <span className="break-all text-right font-medium text-[#121212]">{email || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#6b6b6b]">Organisation</span>
                <span className="text-right font-medium text-[#121212]">{orgName ?? '-'}</span>
              </div>
              {optionalAvatarFile ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[#6b6b6b]">Photo</span>
                  <span className="text-right text-[12px] font-medium text-[#121212]">Added</span>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[#6b6b6b]">Photo</span>
                  <span className="text-right text-[12px] text-[#9b9b9b]">Skipped (add later in Settings)</span>
                </div>
              )}
            </div>
          </div>
          <div className="mb-6 rounded-xl bg-[#f5f4f1] p-4 text-[13px] leading-relaxed text-[#6b6b6b]">
            Teams will be assigned by your organisation admin during approval.
          </div>
          <div className="mb-6 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 text-[13px] leading-relaxed text-[#6b6b6b]">
            <strong className="mb-1 block text-[#121212]">What happens next?</strong>A manager in your
            team will review your registration. You&apos;ll receive an email once you&apos;re approved,
            usually within one working day.
          </div>
          <div className="flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(3)}>
              Back
            </button>
            <button
              type="button"
              disabled={loading}
              className="auth-btn-primary flex-[2]"
              onClick={() => void submit()}
            >
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              Submit registration
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

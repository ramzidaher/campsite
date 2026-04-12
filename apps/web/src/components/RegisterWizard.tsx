'use client';

import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
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
  'Teams',
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
                {isDone ? '✓' : n}
              </div>
            );
            return (
              <div key={label} className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <div
                    className={[
                      'h-px min-w-2 flex-1',
                      i === 0 ? 'max-w-0 min-w-0 flex-[0]' : '',
                      i > 0 && step > i ? 'bg-[#15803d]' : i > 0 ? 'bg-[#d8d8d8]' : '',
                    ].join(' ')}
                    aria-hidden
                  />
                  {circle}
                  <div
                    className={[
                      'h-px min-w-2 flex-1',
                      i === labels.length - 1 ? 'max-w-0 min-w-0 flex-[0]' : '',
                      i < labels.length - 1 && step > i + 1 ? 'bg-[#15803d]' : i < labels.length - 1 ? 'bg-[#d8d8d8]' : '',
                    ].join(' ')}
                    aria-hidden
                  />
                </div>
                <span
                  className={[
                    'mt-2 w-full px-0.5 text-center text-[11px] font-medium leading-tight',
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
  initialLegalBundleVersion = FALLBACK_LEGAL_SETTINGS.bundle_version,
}: {
  initialOrgSlug: string | null;
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
  const [legalConsent, setLegalConsent] = useState(false);

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

  function toggleDept(id: string) {
    setSelectedDeptIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit() {
    setError(null);
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
      };
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: createMeta,
          emailRedirectTo,
        },
      });
      if (signErr || !data.user) {
        setLoading(false);
        setError(signErr?.message ?? 'Could not create account.');
        return;
      }
      signUpData = data;
    } else {
      if (!orgId) {
        setError('We could not match your organisation from this sign-up link. Ask your admin for a fresh link.');
        return;
      }
      if (boundOrgId && orgId !== boundOrgId) {
        setError('Organisation mismatch. Please use the original sign-up link from your organisation.');
        return;
      }
      if (selectedDeptIds.size === 0) {
        setError('Select at least one department, society, or club.');
        return;
      }

      setLoading(true);
      const joinMeta: Record<string, string> = {
        full_name: fullName,
        register_org_id: orgId,
        register_dept_ids: JSON.stringify([...selectedDeptIds]),
        register_legal_bundle_version: initialLegalBundleVersion,
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

  const groupedDepts = useMemo(() => {
    const g: Record<string, Dept[]> = { department: [], society: [], club: [] };
    depts.forEach((d) => {
      g[d.type].push(d);
    });
    return g;
  }, [depts]);

  const orgName = orgs.find((o) => o.id === orgId)?.name;

  return (
    <div>
      {step === 1 ? (
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
        >
          ← Back to sign in
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className="mb-6 flex w-fit items-center gap-1.5 text-[13px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
        >
          ← Back
        </button>
      )}

      <StepProgress step={step} labels={stepLabels} />

      {error ? (
        <p className="mb-6 rounded-[10px] bg-red-500/10 px-3 py-2 text-sm text-[#b91c1c]">{error}</p>
      ) : null}

      {step === 1 ? (
        <div>
          <h2 className="auth-title">Create your account</h2>
          <p className="auth-sub mb-8">
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
          <div className="mb-8 flex gap-3 rounded-[10px] border border-[#ebe9e6] bg-[#faf9f7] px-3 py-3">
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
              (bundle {initialLegalBundleVersion}).
            </label>
          </div>
          <button
            type="button"
            className="auth-btn-primary"
            onClick={() => {
              setError(null);
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
            Continue →
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <h2 className="auth-title">Your organisation</h2>
          <p className="auth-sub mb-8">
            {inviteFlow
              ? 'We matched your workspace from the sign-up link and locked it to your organisation.'
              : 'Tell us your organisation name. We’ll suggest a short identifier for shared links and invites — change it only if you want to.'}
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
              ← Back
            </button>
            <button
              type="button"
              className="auth-btn-primary flex-[2]"
              onClick={() => {
                setError(null);
                if (inviteFlow) {
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
              Continue →
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <h2 className="auth-title">Profile photo (optional)</h2>
          <p className="auth-sub mb-6">
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
              ← Back
            </button>
            <button
              type="button"
              disabled={createOrgFlow && loading}
              className="auth-btn-primary flex-[2]"
              onClick={() => {
                setError(null);
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
                'Continue →'
              ) : (
                'Skip →'
              )}
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 && inviteFlow ? (
        <div>
          <h2 className="auth-title">Select teams</h2>
          <p className="auth-sub mb-6">
            Choose every department, society, or club you belong to. After you&apos;re in Campsite, choose
            which broadcast channels to follow in Settings or from any post.
          </p>
          {(['department', 'society', 'club'] as const).map((t) =>
            groupedDepts[t].length ? (
              <div key={t} className="mb-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9b9b9b]">
                  {t === 'department' ? 'Departments' : t === 'society' ? 'Societies' : 'Clubs'}
                </p>
                <div className="flex flex-col gap-2.5">
                  {groupedDepts[t].map((d) => {
                    const selected = selectedDeptIds.has(d.id);
                    return (
                      <div
                        key={d.id}
                        className={[
                          'overflow-hidden rounded-xl border transition-colors',
                          selected ? 'border-[#121212]' : 'border-[#d8d8d8]',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDept(d.id)}
                          className="flex w-full items-center justify-between bg-white px-4 py-3.5 text-left transition-colors hover:bg-[#f5f4f1]"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-medium text-[#121212]">
                            <span
                              className={[
                                'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px]',
                                selected
                                  ? 'border-[#121212] bg-[#121212] text-white'
                                  : 'border-[#d8d8d8] bg-[#faf9f6]',
                              ].join(' ')}
                            >
                              {selected ? '✓' : ''}
                            </span>
                            {d.name}
                          </span>
                          <span className="text-xs text-[#9b9b9b]">{selected ? 'Joined' : 'Not joined'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
          <div className="mt-2 flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(3)}>
              ← Back
            </button>
            <button
              type="button"
              className="auth-btn-primary flex-[2]"
              onClick={() => selectedDeptIds.size > 0 && setStep(5)}
              disabled={selectedDeptIds.size === 0}
            >
              Continue →
            </button>
          </div>
        </div>
      ) : null}

      {step === 5 && inviteFlow ? (
        <div>
          <h2 className="auth-title">Review & submit</h2>
          <p className="auth-sub mb-6">
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
          <div className="mb-6 rounded-xl bg-[#f5f4f1] p-4">
            <p className="mb-3 text-[13px] font-medium text-[#9b9b9b]">Selected teams</p>
            <div className="flex flex-wrap gap-1.5">
              {[...selectedDeptIds].map((id) => {
                const name = depts.find((d) => d.id === id)?.name;
                return name ? (
                  <span
                    key={id}
                    className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-xs text-[#121212]"
                  >
                    {name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          <div className="mb-6 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 text-[13px] leading-relaxed text-[#6b6b6b]">
            <strong className="mb-1 block text-[#121212]">What happens next?</strong>A manager in your
            team will review your registration. You&apos;ll receive an email once you&apos;re approved,
            usually within one working day.
          </div>
          <div className="flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(4)}>
              ← Back
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

'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type TabId = 'branding' | 'general' | 'danger';

function orgInitials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'relative h-[21px] w-[38px] shrink-0 rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        on ? 'bg-[#121212]' : 'bg-[#d8d8d8]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] block h-[15px] w-[15px] rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-[17px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  );
}

function tabClass(active: boolean) {
  return [
    'w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
    active
      ? 'border-[#121212] bg-[#121212] font-medium text-[#faf9f6]'
      : 'border-transparent text-[#6b6b6b] hover:bg-[#f5f4f1] hover:text-[#121212]',
  ].join(' ');
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'branding', label: '🎨 Branding' },
  { id: 'general', label: '⚙️ General' },
  { id: 'danger', label: '⚠️ Danger zone' },
];

export function OrgSettingsClient({
  initial,
}: {
  initial: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    default_notifications_enabled: boolean;
    deactivation_requested_at: string | null;
    timezone: string | null;
  };
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<TabId>('branding');
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? '');
  const [notif, setNotif] = useState(initial.default_notifications_enabled);
  const [timezone, setTimezone] = useState(initial.timezone ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);

  const initials = useMemo(() => orgInitials(name), [name]);
  const trimmedLogoUrl = logoUrl.trim();

  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [trimmedLogoUrl]);

  useEffect(() => {
    setName(initial.name);
    setLogoUrl(initial.logo_url ?? '');
    setNotif(initial.default_notifications_enabled);
    setTimezone(initial.timezone ?? '');
  }, [initial]);

  function flash(message: string, tone: 'ok' | 'err') {
    setMsg(message);
    setMsgTone(tone);
  }

  async function saveBranding() {
    setLoading(true);
    setMsg(null);
    if (trimmedLogoUrl && logoPreviewFailed) {
      setLoading(false);
      flash(
        'Logo URL must be a direct link to an image file (e.g. ending in .png or .svg), not a normal web page.',
        'err'
      );
      return;
    }
    const { error } = await supabase
      .from('organisations')
      .update({
        name: name.trim(),
        logo_url: trimmedLogoUrl || null,
      })
      .eq('id', initial.id);
    setLoading(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    flash('Branding saved.', 'ok');
    router.refresh();
  }

  async function saveGeneral() {
    setLoading(true);
    setMsg(null);
    const tz = timezone.trim();
    const { error } = await supabase
      .from('organisations')
      .update({
        default_notifications_enabled: notif,
        timezone: tz.length > 0 ? tz : null,
      })
      .eq('id', initial.id);
    setLoading(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    flash('Settings saved.', 'ok');
    router.refresh();
  }

  async function requestDeactivation() {
    if (
      !confirm(
        'Request organisation deactivation? Activity will wind down and Common Ground Studios will follow up off-platform.'
      )
    )
      return;
    setLoading(true);
    setMsg(null);
    const { error } = await supabase
      .from('organisations')
      .update({ deactivation_requested_at: new Date().toISOString() })
      .eq('id', initial.id);
    setLoading(false);
    if (error) flash(error.message, 'err');
    else {
      flash('Deactivation request recorded.', 'ok');
      router.refresh();
    }
  }

  async function exportMemberCsv() {
    setExporting(true);
    setMsg(null);
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, status, created_at')
      .eq('org_id', initial.id)
      .order('created_at', { ascending: false })
      .limit(5000);
    setExporting(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    const list = rows ?? [];
    const lines = [
      ['id', 'full_name', 'email', 'role', 'status', 'created_at'].join(','),
      ...list.map((r) =>
        [
          r.id,
          JSON.stringify((r.full_name as string) ?? ''),
          JSON.stringify((r.email as string | null) ?? ''),
          r.role,
          r.status,
          r.created_at,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `members-${initial.slug}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('Export downloaded.', 'ok');
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Organisation settings
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Configure your organisation&apos;s branding and general settings
        </p>
      </div>

      <div className="grid max-w-[860px] gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setMsg(null);
              }}
              className={tabClass(tab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === 'branding' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#121212]">Branding</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">Customise how your organisation appears in Campsite.</p>

              <div className="mt-5 flex flex-col gap-4 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 sm:flex-row sm:items-center">
                <div className="mx-auto h-16 w-16 shrink-0 sm:mx-0">
                  {trimmedLogoUrl && !logoPreviewFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={trimmedLogoUrl}
                      src={trimmedLogoUrl}
                      alt=""
                      onError={() => setLogoPreviewFailed(true)}
                      className="h-16 w-16 rounded-xl border border-[#d8d8d8] bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#121212] font-authSerif text-[22px] text-[#faf9f6]">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="text-[13.5px] font-medium text-[#121212]">Organisation logo</div>
                  <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
                    Use a <strong className="font-medium text-[#6b6b6b]">direct image URL</strong> (PNG, SVG, JPG, or
                    WebP) - not a website homepage. The link should usually end in{' '}
                    <span className="font-mono">.png</span>, <span className="font-mono">.svg</span>, etc.
                  </p>
                  {trimmedLogoUrl && logoPreviewFailed ? (
                    <p className="mt-2 text-[11.5px] font-medium text-[#b45309]">
                      We couldn&apos;t load an image from this URL. Try opening it in a new tab - if you see a page
                      instead of a picture, paste the image file&apos;s address instead.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <button
                      type="button"
                      className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]"
                      onClick={() => {
                        const url = window.prompt('Logo image URL (https://...)');
                        if (url === null) return;
                        setLogoUrl(url.trim());
                      }}
                    >
                      Set from URL
                    </button>
                    <button
                      type="button"
                      disabled={!trimmedLogoUrl}
                      className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6] disabled:opacity-40"
                      onClick={() => setLogoUrl('')}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">Organisation name</span>
                <input
                  className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">Subdomain</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-2.5 font-mono text-[13px] text-[#121212]"
                    value={initial.slug}
                  />
                  <span className="shrink-0 text-[13px] text-[#9b9b9b]">.camp-site.co.uk</span>
                </div>
                <span className="mt-1 block text-[11.5px] text-[#9b9b9b]">
                  Slug is set when the organisation is created; contact support to change invite links.
                </span>
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">Logo URL</span>
                <input
                  className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.org/logo.png"
                />
                <span className="mt-1 block text-[11.5px] text-[#9b9b9b]">
                  Host the file somewhere public (your site, Supabase Storage, etc.) or right-click an image → copy image
                  address.
                </span>
              </label>

              <button
                type="button"
                disabled={loading}
                onClick={() => void saveBranding()}
                className="mt-6 rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save branding
              </button>
            </div>
          ) : null}

          {tab === 'general' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#121212]">General settings</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">System-wide defaults for your organisation.</p>

              <div className="mt-2 border-t border-[#d8d8d8]">
                <label className="block border-b border-[#d8d8d8] py-4">
                  <span className="text-[13.5px] font-medium text-[#121212]">Default timezone (rota &amp; calendar)</span>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b9b9b]">
                    IANA name (e.g. <span className="font-mono">Europe/London</span>). Leave empty to use each
                    viewer&apos;s device time. Used when displaying shift times on web and mobile.
                  </p>
                  <input
                    className="mt-2 w-full max-w-md rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Europe/London"
                    autoComplete="off"
                  />
                </label>
                <div className="flex items-start justify-between gap-5 border-b border-[#d8d8d8] py-4">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#121212]">Default in-app notifications</div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b9b9b]">
                      New members start with notifications enabled for broadcasts and updates unless they change this in
                      their profile.
                    </p>
                  </div>
                  <Toggle on={notif} onToggle={() => setNotif((v) => !v)} disabled={loading} />
                </div>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-[#9b9b9b]">
                Member approvals, broadcast approval queues, and role capabilities are enforced by permissions today  - 
                additional organisation policy toggles may appear here later.
              </p>

              <button
                type="button"
                disabled={loading}
                onClick={() => void saveGeneral()}
                className="mt-6 rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save settings
              </button>
            </div>
          ) : null}

          {tab === 'danger' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#b91c1c]">Danger zone</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                These actions have serious impact. Proceed with caution.
              </p>

              <div className="mt-2 border-t border-[#d8d8d8]">
                <div className="flex flex-col gap-4 border-b border-[#d8d8d8] py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#121212]">Export all member data</div>
                    <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
                      Download a CSV of members (up to 5000 rows) for your records.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void exportMemberCsv()}
                    className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] disabled:opacity-50"
                  >
                    {exporting ? 'Preparing...' : 'Export CSV'}
                  </button>
                </div>

                <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#121212]">Request deactivation</div>
                    <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
                      Records a request to wind down the org. Common Ground Studios follows up off-platform; data is not
                      immediately deleted.
                    </p>
                    {initial.deactivation_requested_at ? (
                      <p className="mt-2 text-[11px] text-[#9b9b9b]">
                        Requested {new Date(initial.deactivation_requested_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {initial.deactivation_requested_at ? null : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void requestDeactivation()}
                      className="shrink-0 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] font-medium text-[#b91c1c] hover:bg-[#fee2e2] disabled:opacity-50"
                    >
                      Request deactivation
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {msg ? (
        <p className={`mt-4 text-[13px] ${msgTone === 'err' ? 'text-[#b91c1c]' : 'text-[#15803d]'}`}>{msg}</p>
      ) : null}
    </div>
  );
}

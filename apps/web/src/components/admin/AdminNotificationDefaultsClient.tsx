'use client';

import { createClient } from '@/lib/supabase/client';
import { Bell, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

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

export function AdminNotificationDefaultsClient({
  initial,
}: {
  initial: { orgId: string; default_notifications_enabled: boolean };
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [on, setOn] = useState(initial.default_notifications_enabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOn(initial.default_notifications_enabled);
  }, [initial.default_notifications_enabled]);

  async function save() {
    setLoading(true);
    setMsg(null);
    const { error } = await supabase
      .from('organisations')
      .update({ default_notifications_enabled: on })
      .eq('id', initial.orgId);
    setLoading(false);
    if (error) setMsg(error.message);
    else {
      setMsg('Saved.');
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Notification defaults
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Org-wide defaults for new members. Individuals can still tune their own preferences in{' '}
          <Link href="/settings" className="font-medium text-[#121212] underline underline-offset-2">
            Settings
          </Link>
          .
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-[#d8d8d8] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-[#121212]">Enable notifications for new members</p>
            <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
              When on, new profiles inherit notification-friendly defaults until they change them.
            </p>
          </div>
          <Toggle on={on} onToggle={() => setOn((v) => !v)} disabled={loading} />
        </div>

        <div className="rounded-lg border border-[#eceae6] bg-[#faf9f6] px-3 py-2.5 text-[12px] text-[#6b6b6b]">
          <p className="font-medium text-[#121212]">What this changes</p>
          <p className="mt-1">
            New members will start with {on ? 'notifications enabled' : 'notifications disabled'} by default. Existing
            member preferences are not changed.
          </p>
        </div>

        {msg ? (
          <p
            className={[
              'text-[13px]',
              msg === 'Saved.' ? 'text-[#166534]' : 'text-[#b91c1c]',
            ].join(' ')}
          >
            {msg}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-[#eceae6] pt-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#121212] bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] disabled:opacity-45"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />
            {loading ? 'Saving...' : 'Save'}
          </button>
          <Link
            href="/admin/settings"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            Org settings
          </Link>
        </div>

        <p className="text-[12px] leading-relaxed text-[#9b9b9b]">
          Shift reminders, broadcast digests, and quiet hours are controlled per person in the member app. Additional
          org-level channels can be layered in later as the product grows.
        </p>
      </div>
    </div>
  );
}

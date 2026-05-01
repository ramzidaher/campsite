'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { queueEntityCalendarSync } from '@/lib/calendar/queueEntityCalendarSync';
import { createClient } from '@/lib/supabase/client';

export type OneOnOneMeetingRow = {
  id: string;
  manager_user_id: string;
  report_user_id: string;
  manager_name: string | null;
  report_name: string | null;
  template_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  completed_at: string | null;
  notes_preview: string | null;
};

export type DirectReportOption = { id: string; full_name: string };

export function OneOnOnesHubClient({
  userId,
  orgId: _orgId,
  initialMeetings,
  canManage,
  directReports,
}: {
  userId: string;
  orgId: string;
  initialMeetings: OneOnOneMeetingRow[];
  canManage: boolean;
  directReports: DirectReportOption[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [meetings, setMeetings] = useState(initialMeetings);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [reportId, setReportId] = useState(directReports[0]?.id ?? '');
  const [startsLocal, setStartsLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - (d.getTimezoneOffset() ?? 0));
    return d.toISOString().slice(0, 16);
  });
  const [templateId, setTemplateId] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.rpc('one_on_one_meeting_list', {
      p_limit: 80,
      p_include_cancelled: false,
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const rows = (data as unknown as OneOnOneMeetingRow[]) ?? [];
    setMeetings(rows);
  }, [supabase]);

  const createMeeting = async () => {
    if (!reportId || !startsLocal) return;
    setErr(null);
    const startsAt = new Date(startsLocal).toISOString();
    const { data, error } = await supabase.rpc('one_on_one_meeting_upsert', {
      p_report_user_id: reportId,
      p_starts_at: startsAt,
      p_ends_at: null,
      p_template_id: templateId || null,
      p_meeting_id: null,
      p_status: 'scheduled',
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setShowNew(false);
    const id = data as string;
    if (id) {
      queueEntityCalendarSync({ type: 'one-on-one', id, action: 'upsert' });
      window.location.href = `/one-on-ones/${id}`;
    } else await refresh();
  };

  const scheduleSidebar = canManage && directReports.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="campsite-title text-[#121212]">1:1 check-ins</h1>
        <p className="campsite-body mt-1 text-[#6b6b6b]">
          {canManage ? 'Schedule and run 1:1s with your team.' : 'Your upcoming and past 1:1 meetings.'}
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${scheduleSidebar ? 'lg:grid-cols-12 lg:gap-8' : ''}`}>
        <div className={`min-w-0 space-y-6 ${scheduleSidebar ? 'lg:col-span-8' : ''}`}>
          {err ? <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{err}</p> : null}

          {!scheduleSidebar && showNew ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-4 shadow-sm">
              <p className="mb-3 text-[13px] font-medium text-[#121212]">Schedule a 1:1</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12px] text-[#6b6b6b]">
                  Direct report
                  <select
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
                    value={reportId}
                    onChange={(e) => setReportId(e.target.value)}
                  >
                    {directReports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12px] text-[#6b6b6b]">
                  Starts
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
                    value={startsLocal}
                    onChange={(e) => setStartsLocal(e.target.value)}
                  />
                </label>
                <label className="block text-[12px] text-[#6b6b6b] sm:col-span-2">
                  Template (optional)
                  <TemplatePicker supabase={supabase} value={templateId} onChange={setTemplateId} />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={createMeeting}
                  className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6]"
                >
                  Create
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="rounded-lg border border-[#d8d8d8] px-4 py-2 text-[13px]">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {loading ? <p className="text-[13px] text-[#6b6b6b]">Loading…</p> : null}
            {meetings.length === 0 && !loading ? (
              <p className="rounded-xl border border-dashed border-[#d8d8d8] bg-[#faf9f6] px-4 py-8 text-center text-[13px] text-[#6b6b6b]">
                No 1:1 meetings yet.
              </p>
            ) : null}
            {meetings.map((m) => (
              <Link
                key={m.id}
                href={`/one-on-ones/${m.id}`}
                className="block rounded-xl border border-[#e8e8e8] bg-white p-4 transition-colors hover:bg-[#faf9f6]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-[#121212]">
                    {m.manager_user_id === userId ? m.report_name : m.manager_name} ·{' '}
                    {new Date(m.starts_at).toLocaleString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      m.status === 'completed'
                        ? 'bg-[#dcfce7] text-[#166534]'
                        : m.status === 'cancelled'
                          ? 'bg-[#f5f4f1] text-[#6b6b6b]'
                          : 'bg-[#eff6ff] text-[#1d4ed8]',
                    ].join(' ')}
                  >
                    {m.status.replace('_', ' ')}
                  </span>
                </div>
                {m.notes_preview ? <p className="mt-2 line-clamp-2 text-[12px] text-[#6b6b6b]">{m.notes_preview}</p> : null}
              </Link>
            ))}
          </div>
        </div>

        {scheduleSidebar ? (
          <aside className="min-w-0 space-y-4 lg:col-span-4">
            <div className="rounded-2xl border border-[#e8e8e8] bg-white p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Schedule</h2>
              <p className="mt-1 text-[12.5px] text-[#6b6b6b]">Pick a direct report and time. You can attach an optional template.</p>
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="mt-4 w-full rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
              >
                {showNew ? 'Close' : 'New 1:1'}
              </button>
              {showNew ? (
                <div className="mt-4 border-t border-[#f0f0f0] pt-4">
                  <div className="grid gap-3">
                    <label className="block text-[12px] text-[#6b6b6b]">
                      Direct report
                      <select
                        className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
                        value={reportId}
                        onChange={(e) => setReportId(e.target.value)}
                      >
                        {directReports.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[12px] text-[#6b6b6b]">
                      Starts
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
                        value={startsLocal}
                        onChange={(e) => setStartsLocal(e.target.value)}
                      />
                    </label>
                    <label className="block text-[12px] text-[#6b6b6b]">
                      Template (optional)
                      <TemplatePicker supabase={supabase} value={templateId} onChange={setTemplateId} />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={createMeeting}
                      className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6]"
                    >
                      Create
                    </button>
                    <button type="button" onClick={() => setShowNew(false)} className="rounded-lg border border-[#d8d8d8] px-4 py-2 text-[13px]">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="mt-4 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[12.5px] font-medium text-[#6b6b6b] hover:bg-[#f0efe9] disabled:opacity-50"
              >
                {loading ? 'Refreshing…' : 'Refresh list'}
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function TemplatePicker({
  supabase,
  value,
  onChange,
}: {
  supabase: ReturnType<typeof createClient>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [opts, setOpts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('one_on_one_templates_list');
      const raw = Array.isArray(data) ? (data as { id: string; name: string }[]) : [];
      setOpts(raw);
    })();
  }, [supabase]);
  return (
    <select
      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">None</option>
      {opts.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

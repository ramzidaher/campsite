'use client';

import {
  cancelAvailableInterviewSlot,
  completeInterviewSlot,
  createInterviewSlot,
} from '@/app/(main)/admin/interviews/actions';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';
import { isInterviewSlotStatus } from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

type JobOption = { id: string; title: string; status: string };
type ProfileOption = { id: string; full_name: string | null; email: string | null };

type SlotListRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  job_listing_id: string;
  job_listings: { title: string } | { title: string }[] | null;
  interview_slot_panelists: Array<{
    profile_id: string;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  }> | null;
};

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function panelistLabel(p: NonNullable<SlotListRow['interview_slot_panelists']>[number]): string {
  const pr = relOne(p.profiles);
  return pr?.full_name?.trim() || '—';
}

export function InterviewScheduleClient({
  jobs,
  profiles,
  initialSlots,
}: {
  jobs: JobOption[];
  profiles: ProfileOption[];
  initialSlots: SlotListRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [jobId, setJobId] = useState(jobs[0]?.id ?? '');
  const [slotTitle, setSlotTitle] = useState('Interview');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [selectedPanel, setSelectedPanel] = useState<Record<string, boolean>>({});

  const togglePanel = (id: string) => {
    setSelectedPanel((s) => ({ ...s, [id]: !s[id] }));
  };

  const selectedIds = useMemo(() => Object.keys(selectedPanel).filter((k) => selectedPanel[k]), [selectedPanel]);

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!jobId) {
      setMsg({ type: 'err', text: 'Choose a job listing.' });
      return;
    }
    if (!startLocal || !endLocal) {
      setMsg({ type: 'err', text: 'Enter start and end date/time.' });
      return;
    }
    const startsAtIso = new Date(startLocal).toISOString();
    const endsAtIso = new Date(endLocal).toISOString();

    startTransition(async () => {
      const res = await createInterviewSlot({
        jobListingId: jobId,
        title: slotTitle,
        startsAtIso,
        endsAtIso,
        panelistProfileIds: selectedIds,
      });
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      const w = 'warnings' in res && res.warnings ? res.warnings.join(' ') : '';
      setMsg({ type: 'ok', text: w ? `Slot created. ${w}` : 'Slot created and synced to panel calendars where connected.' });
      setSelectedPanel({});
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-7 sm:px-7">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">Operations</p>
        <h1 className="mt-1 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Interview schedule
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6b6b6b]">
          Create time slots for a job and assign panel members. Events are added to each member&apos;s Google Calendar
          when they have connected Calendar under Settings. When you move a candidate to{' '}
          <strong>{jobApplicationStageLabel('interview_scheduled')}</strong> on the hiring pipeline, choose an available
          slot — calendars update and the candidate is emailed.
        </p>
        <p className="mt-2 text-[13px] text-[#505050]">
          Need slots on the board? Open{' '}
          <Link href="/admin/jobs" className="text-[#008B60] hover:underline">
            Job listings
          </Link>{' '}
          → <strong>View pipeline</strong> on a live job.
        </p>
      </div>

      {msg ? (
        <div
          role={msg.type === 'err' ? 'alert' : 'status'}
          className={[
            'rounded-lg border px-3 py-2 text-[13px]',
            msg.type === 'err' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-950',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
        <h2 className="font-authSerif text-lg text-[#121212]">Create interview slot</h2>
        <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={submitCreate}>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-[12px] font-medium text-[#505050]">Job listing</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {(j.title || 'Untitled').trim()} {j.status !== 'live' ? ` (${j.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#505050]">Title (calendar event)</label>
            <input
              value={slotTitle}
              onChange={(e) => setSlotTitle(e.target.value)}
              className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
            />
          </div>
          <div className="hidden lg:block" />
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#505050]">Start</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#505050]">End</label>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
              required
            />
          </div>
          <div className="lg:col-span-2">
            <p className="mb-2 text-[12px] font-medium text-[#505050]">Panel members</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[#e8e8e8] p-2">
              {profiles.length === 0 ? (
                <p className="text-[13px] text-[#9b9b9b]">No active members.</p>
              ) : (
                <ul className="space-y-1">
                  {profiles.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-[#fafafa]">
                        <input
                          type="checkbox"
                          checked={!!selectedPanel[p.id]}
                          onChange={() => togglePanel(p.id)}
                        />
                        <span className="font-medium text-[#121212]">{p.full_name?.trim() || '—'}</span>
                        <span className="text-[#6b6b6b]">{p.email}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Panelists must connect Google Calendar in Settings → Integrations for automatic sync.
            </p>
          </div>
          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#008B60] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#007a54] disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Create slot'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
        <h2 className="font-authSerif text-lg text-[#121212]">Upcoming slots</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-[#f0f0f0] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              <tr>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Panel</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {initialSlots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-[#6b6b6b]">
                    No upcoming slots. Create one above.
                  </td>
                </tr>
              ) : (
                initialSlots.map((s) => {
                  const jl = relOne(s.job_listings);
                  const pan = s.interview_slot_panelists ?? [];
                  const when = `${new Date(s.starts_at).toLocaleString()} – ${new Date(s.ends_at).toLocaleTimeString()}`;
                  const st = isInterviewSlotStatus(s.status) ? s.status : s.status;
                  return (
                    <tr key={s.id} className="border-b border-[#f5f5f5] last:border-0">
                      <td className="py-3 pr-4 align-top text-[#121212]">{when}</td>
                      <td className="py-3 pr-4 align-top">
                        <span className="text-[#242424]">{jl?.title?.trim() || '—'}</span>
                        <div>
                          <Link
                            href={`/admin/jobs/${s.job_listing_id}/applications`}
                            className="text-[12px] text-[#008B60] hover:underline"
                          >
                            Pipeline
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-[#505050]">
                        {pan.length ? pan.map((p) => panelistLabel(p)).join(', ') : '—'}
                      </td>
                      <td className="py-3 pr-4 align-top capitalize">{st}</td>
                      <td className="py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          {st === 'available' ? (
                            <button
                              type="button"
                              disabled={pending}
                              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-900"
                              onClick={() => {
                                if (!window.confirm('Cancel this slot and remove calendar events?')) return;
                                startTransition(async () => {
                                  const r = await cancelAvailableInterviewSlot(s.id);
                                  if (!r.ok) alert(r.error);
                                  else router.refresh();
                                });
                              }}
                            >
                              Cancel
                            </button>
                          ) : null}
                          {st === 'booked' ? (
                            <button
                              type="button"
                              disabled={pending}
                              className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px]"
                              onClick={() => {
                                startTransition(async () => {
                                  const r = await completeInterviewSlot(s.id);
                                  if (!r.ok) alert(r.error);
                                  else router.refresh();
                                });
                              }}
                            >
                              Mark completed
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-[#6b6b6b]">
          Use <strong>Mark completed</strong> after the interview has taken place. Available slots can be cancelled to
          remove them from calendars.
        </p>
      </section>
    </div>
  );
}

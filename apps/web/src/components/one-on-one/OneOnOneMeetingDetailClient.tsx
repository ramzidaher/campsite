'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export type MeetingDetail = {
  id: string;
  manager_user_id: string;
  report_user_id: string;
  manager_name: string | null;
  report_name: string | null;
  template_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  shared_notes: string;
  notes_locked_at: string | null;
  completed_at: string | null;
};

export type EditRequestRow = {
  id: string;
  requester_id: string;
  proposed_notes: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
};

export function OneOnOneMeetingDetailClient({
  userId,
  meeting: initialMeeting,
  editRequests: initialRequests,
  isManager,
  canHrResolve,
}: {
  userId: string;
  meeting: MeetingDetail;
  editRequests: EditRequestRow[];
  isManager: boolean;
  canHrResolve: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [meeting, setMeeting] = useState(initialMeeting);
  const [notes, setNotes] = useState(initialMeeting.shared_notes);
  const [requests, setRequests] = useState(initialRequests);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [proposed, setProposed] = useState('');

  const locked = meeting.notes_locked_at != null || meeting.status === 'completed';
  const canEditNotes = !locked && meeting.status !== 'cancelled';

  const saveNotes = async () => {
    setSaving(true);
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_update_notes', {
      p_meeting_id: meeting.id,
      p_notes: notes,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else router.refresh();
  };

  const setStatus = async (status: string) => {
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_set_status', {
      p_meeting_id: meeting.id,
      p_status: status,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    const nextLocked = status === 'completed';
    setMeeting((m) => ({
      ...m,
      status,
      notes_locked_at: nextLocked ? new Date().toISOString() : m.notes_locked_at,
      completed_at: nextLocked ? new Date().toISOString() : m.completed_at,
    }));
    router.refresh();
  };

  const submitEditRequest = async () => {
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_note_edit_request_create', {
      p_meeting_id: meeting.id,
      p_proposed_notes: proposed,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setProposed('');
    const { data } = await supabase.rpc('one_on_one_note_edit_requests_for_meeting', {
      p_meeting_id: meeting.id,
    });
    setRequests(Array.isArray(data) ? (data as EditRequestRow[]) : []);
    router.refresh();
  };

  const resolveRequest = async (requestId: string, approved: boolean) => {
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_note_edit_request_resolve', {
      p_request_id: requestId,
      p_approved: approved,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    const { data } = await supabase.rpc('one_on_one_note_edit_requests_for_meeting', {
      p_meeting_id: meeting.id,
    });
    setRequests(Array.isArray(data) ? (data as EditRequestRow[]) : []);
    const { data: m2 } = await supabase.rpc('one_on_one_meeting_get', { p_meeting_id: meeting.id });
    if (m2 && typeof m2 === 'object' && 'shared_notes' in (m2 as object)) {
      const mm = m2 as MeetingDetail;
      setMeeting(mm);
      setNotes(mm.shared_notes);
    }
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      <Link href="/one-on-ones" className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
        ← All 1:1s
      </Link>
      <h1 className="mt-4 font-authSerif text-[24px] leading-tight text-[#121212]">
        {isManager ? meeting.report_name : meeting.manager_name}
      </h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">
        {new Date(meeting.starts_at).toLocaleString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
      <p className="mt-2 text-[12px] uppercase tracking-wide text-[#9b9b9b]">
        Status: <span className="font-medium text-[#121212]">{meeting.status.replace('_', ' ')}</span>
      </p>

      {err ? <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{err}</p> : null}

      <div className="mt-6 rounded-xl border border-[#e8e8e8] bg-white p-4">
        <h2 className="text-[13px] font-medium text-[#121212]">Shared notes</h2>
        {canEditNotes ? (
          <>
            <textarea
              className="mt-2 min-h-[160px] w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] text-[#121212]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveNotes()}
              className="mt-2 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
            >
              Save notes
            </button>
          </>
        ) : (
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[#2a2a2a]">
            {meeting.shared_notes || '—'}
          </pre>
        )}
        {locked ? (
          <p className="mt-3 text-[12px] text-[#6b6b6b]">Notes are locked after this meeting was completed. Request an edit to propose changes.</p>
        ) : null}
      </div>

      {isManager && meeting.status !== 'completed' && meeting.status !== 'cancelled' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {meeting.status === 'scheduled' ? (
            <button
              type="button"
              onClick={() => void setStatus('in_progress')}
              className="rounded-lg border border-[#d8d8d8] px-4 py-2 text-[13px]"
            >
              Start meeting
            </button>
          ) : null}
          {meeting.status === 'in_progress' || meeting.status === 'scheduled' ? (
            <button
              type="button"
              onClick={() => void setStatus('completed')}
              className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6]"
            >
              Mark complete
            </button>
          ) : null}
          <button type="button" onClick={() => void setStatus('cancelled')} className="text-[13px] text-[#b91c1c] underline">
            Cancel
          </button>
        </div>
      ) : null}

      {locked && (meeting.manager_user_id === userId || meeting.report_user_id === userId) ? (
        <div className="mt-6 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-4">
          <h3 className="text-[13px] font-medium text-[#121212]">Request a note change</h3>
          <textarea
            className="mt-2 min-h-[100px] w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
            placeholder="Proposed text for shared notes"
            value={proposed}
            onChange={(e) => setProposed(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void submitEditRequest()}
            className="mt-2 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6]"
          >
            Submit request
          </button>
        </div>
      ) : null}

      {requests.length > 0 ? (
        <div className="mt-6 space-y-3">
          <h3 className="text-[13px] font-medium text-[#121212]">Edit requests</h3>
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-[#e8e8e8] bg-white p-3 text-[13px]">
              <p className="text-[11px] text-[#9b9b9b]">
                {new Date(r.created_at).toLocaleString()} · {r.status}
              </p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] text-[#2a2a2a]">{r.proposed_notes}</pre>
              {r.status === 'pending' && (isManager || canHrResolve) ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void resolveRequest(r.id, true)}
                    className="rounded bg-[#121212] px-3 py-1.5 text-[12px] text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolveRequest(r.id, false)}
                    className="rounded border border-[#d8d8d8] px-3 py-1.5 text-[12px]"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

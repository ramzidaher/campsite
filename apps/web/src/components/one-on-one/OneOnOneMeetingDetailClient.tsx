'use client';

import { FormSelect } from '@campsite/ui/web';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';

export type QuestionOwner = 'employee' | 'manager' | 'both';

export type OneOnOneQuestion = {
  id: string;
  prompt: string;
  owner: QuestionOwner;
  answer: string;
};

export type OneOnOneActionItem = {
  id: string;
  text: string;
  done: boolean;
  assignee_user_id: string | null;
};

export type OneOnOneDoc = {
  version: number;
  questions: OneOnOneQuestion[];
  manager_notes_shared: string;
  private_manager_notes: string;
  action_items: OneOnOneActionItem[];
};

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
  session_title: string;
  doc: OneOnOneDoc;
  shared_notes: string;
  notes_locked_at: string | null;
  completed_at: string | null;
  manager_signed_at: string | null;
  report_signed_at: string | null;
  next_session_at: string | null;
  session_index: number;
  created_at: string;
  updated_at: string;
};

export type EditRequestRow = {
  id: string;
  requester_id: string;
  proposed_notes: string;
  proposed_doc: unknown | null;
  status: string;
  resolved_at: string | null;
  created_at: string;
};

function normalizeDoc(raw: unknown): OneOnOneDoc {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const qs = Array.isArray(o.questions) ? o.questions : [];
  const questions: OneOnOneQuestion[] = qs.map((q) => {
    const r = q && typeof q === 'object' ? (q as Record<string, unknown>) : {};
    const rawOwner = String(r.owner ?? 'employee');
    const owner: QuestionOwner =
      rawOwner === 'manager' || rawOwner === 'both' ? rawOwner : 'employee';
    return {
      id: String(r.id ?? globalThis.crypto?.randomUUID?.() ?? `q-${Math.random().toString(36).slice(2)}`),
      prompt: String(r.prompt ?? ''),
      owner,
      answer: String(r.answer ?? ''),
    };
  });
  const itemsRaw = Array.isArray(o.action_items) ? o.action_items : [];
  const action_items: OneOnOneActionItem[] = itemsRaw.map((a) => {
    const r = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
    return {
      id: String(r.id ?? globalThis.crypto?.randomUUID?.() ?? `a-${Math.random().toString(36).slice(2)}`),
      text: String(r.text ?? ''),
      done: Boolean(r.done),
      assignee_user_id: r.assignee_user_id != null ? String(r.assignee_user_id) : null,
    };
  });
  return {
    version: 1,
    questions,
    manager_notes_shared: String(o.manager_notes_shared ?? ''),
    private_manager_notes: String(o.private_manager_notes ?? ''),
    action_items,
  };
}

function initials(name: string | null) {
  if (!name?.trim()) return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function durationLabel(startsAt: string, endsAt: string | null) {
  if (!endsAt) return null;
  const a = new Date(startsAt).getTime();
  const b = new Date(endsAt).getTime();
  if (!(b > a)) return null;
  const mins = Math.round((b - a) / 60000);
  if (mins <= 0) return null;
  return `${mins} min`;
}

function answersOwnerLabel(
  owner: QuestionOwner,
  reportName: string | null,
  managerName: string | null,
): string {
  const report = reportName?.trim() || 'Participant';
  const manager = managerName?.trim() || 'Participant';
  if (owner === 'manager') return manager;
  if (owner === 'both') return `${report} & ${manager}`;
  return report;
}

function canEditAnswer(isManager: boolean, owner: QuestionOwner) {
  if (isManager) return true;
  return owner === 'employee' || owner === 'both';
}

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
  const [sessionTitle, setSessionTitle] = useState(initialMeeting.session_title ?? '');
  const [doc, setDoc] = useState(() => normalizeDoc(initialMeeting.doc));
  const [nextSessionLocal, setNextSessionLocal] = useState(() => {
    const t = initialMeeting.next_session_at;
    if (!t) return '';
    const d = new Date(t);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [requests, setRequests] = useState(initialRequests);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [proposed, setProposed] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReport = meeting.report_user_id === userId;
  const isHrViewer = !isManager && !isReport;
  const locked = meeting.notes_locked_at != null || meeting.status === 'completed';
  const canEditNotes = !locked && meeting.status !== 'cancelled' && !isHrViewer;

  const managerInitials = initials(meeting.manager_name);
  const reportInitials = initials(meeting.report_name);

  const syncTextareas = useCallback(() => {
    document.querySelectorAll<HTMLTextAreaElement>('[data-autosize]').forEach((ta) => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    });
  }, []);

  useEffect(() => {
    syncTextareas();
  }, [doc, sessionTitle, syncTextareas]);

  const persist = useCallback(
    async (title: string, body: OneOnOneDoc, nextIso: string | null) => {
      setSaving(true);
      setErr(null);
      const { error } = await supabase.rpc('one_on_one_meeting_update_doc', {
        p_meeting_id: meeting.id,
        p_session_title: title,
        p_doc: body as unknown as Record<string, unknown>,
        p_next_session_at: nextIso,
      });
      setSaving(false);
      if (error) {
        setErr(error.message);
        return;
      }
      await invalidateClientCaches({ scopes: ['one-on-ones'] }).catch(() => null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
      router.refresh();
    },
    [meeting.id, router, supabase],
  );

  const scheduleSave = useCallback(
    (title: string, body: OneOnOneDoc, nextLocal: string) => {
      if (!canEditNotes) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const nextIso = nextLocal ? new Date(nextLocal).toISOString() : null;
        void persist(title, body, isManager ? nextIso : null);
      }, 900);
    },
    [canEditNotes, isManager, persist],
  );

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const nextIso = nextSessionLocal ? new Date(nextSessionLocal).toISOString() : null;
    void persist(sessionTitle, doc, isManager ? nextIso : null);
  }, [doc, isManager, nextSessionLocal, persist, sessionTitle]);

  const setDocAndSave = useCallback(
    (next: OneOnOneDoc) => {
      setDoc(next);
      scheduleSave(sessionTitle, next, nextSessionLocal);
    },
    [nextSessionLocal, scheduleSave, sessionTitle],
  );

  const setTitleAndSave = useCallback(
    (t: string) => {
      setSessionTitle(t);
      scheduleSave(t, doc, nextSessionLocal);
    },
    [doc, nextSessionLocal, scheduleSave],
  );

  const setNextSessionAndSave = useCallback(
    (v: string) => {
      setNextSessionLocal(v);
      scheduleSave(sessionTitle, doc, v);
    },
    [doc, scheduleSave, sessionTitle],
  );

  const sign = async () => {
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_sign', { p_meeting_id: meeting.id });
    if (error) {
      setErr(error.message);
      return;
    }
    await invalidateClientCaches({ scopes: ['one-on-ones'] }).catch(() => null);
    const { data } = await supabase.rpc('one_on_one_meeting_get', { p_meeting_id: meeting.id });
    if (data && typeof data === 'object') {
      const m2 = data as unknown as MeetingDetail;
      setMeeting(m2);
    }
    router.refresh();
  };

  const setStatus = async (status: string) => {
    await flushSave();
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_set_status', {
      p_meeting_id: meeting.id,
      p_status: status,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    await invalidateClientCaches({ scopes: ['one-on-ones'] }).catch(() => null);
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
      p_proposed_doc: null,
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
    if (m2 && typeof m2 === 'object') {
      const mm = m2 as unknown as MeetingDetail;
      setMeeting(mm);
      setSessionTitle(mm.session_title ?? '');
      setDoc(normalizeDoc(mm.doc));
      const t = mm.next_session_at;
      if (t) {
        const d = new Date(t);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        setNextSessionLocal(d.toISOString().slice(0, 16));
      }
    }
    router.refresh();
  };

  const addQuestion = () => {
    if (!isManager || !canEditNotes) return;
    const next: OneOnOneDoc = {
      ...doc,
      questions: [
        ...doc.questions,
        {
          id: globalThis.crypto?.randomUUID?.() ?? `q-${Math.random().toString(36).slice(2)}`,
          prompt: '',
          owner: 'employee',
          answer: '',
        },
      ],
    };
    setDocAndSave(next);
  };

  const removeQuestion = (id: string) => {
    if (!isManager || !canEditNotes) return;
    setDocAndSave({ ...doc, questions: doc.questions.filter((q) => q.id !== id) });
  };

  const patchQuestion = (id: string, patch: Partial<OneOnOneQuestion>) => {
    if (!isManager || !canEditNotes) return;
    setDocAndSave({
      ...doc,
      questions: doc.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  };

  const patchAnswer = (id: string, answer: string) => {
    setDocAndSave({
      ...doc,
      questions: doc.questions.map((q) => (q.id === id ? { ...q, answer } : q)),
    });
  };

  const addAction = () => {
    if (!canEditNotes || !isManager) return;
    setDocAndSave({
      ...doc,
      action_items: [
        ...doc.action_items,
        {
          id: globalThis.crypto?.randomUUID?.() ?? `a-${Math.random().toString(36).slice(2)}`,
          text: '',
          done: false,
          assignee_user_id: meeting.report_user_id,
        },
      ],
    });
  };

  const patchAction = (id: string, patch: Partial<OneOnOneActionItem>) => {
    if (!canEditNotes) return;
    setDocAndSave({
      ...doc,
      action_items: doc.action_items.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };

  const dur = durationLabel(meeting.starts_at, meeting.ends_at);

  const metaDate = new Date(meeting.starts_at).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  /* Full-width page body; avoid `mx-auto` + `max-w-*` on this root — `.workspace-fluid` strips that pair anyway. */
  return (
    <div className="w-full bg-[#F9F8F6] pb-20">
      <article className="w-full min-w-0 px-5 py-10 selection:bg-[#e8e4df] sm:px-7 sm:py-12 lg:px-10">
        <header className="pb-2">
          <p className="text-[13px] leading-relaxed text-[#8f8f8f]">
            <span>1:1 Notes</span>
            <span className="mx-1 text-[#c9c7c4]" aria-hidden>
              /
            </span>
            <span>
              {meeting.report_name} × {meeting.manager_name}
            </span>
          </p>

          <textarea
            data-autosize
            className="mt-5 w-full resize-none border-0 bg-transparent font-authSerif text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-[#2d2d2d] outline-none placeholder:text-[#b9b7b4] sm:text-[2.25rem]"
            rows={1}
            placeholder="Untitled session"
            value={sessionTitle}
            onChange={(e) => (canEditNotes && isManager ? setTitleAndSave(e.target.value) : undefined)}
            readOnly={!canEditNotes || !isManager}
          />

          <p className="mt-3 text-[14px] leading-relaxed text-[#6b6b6b]">
            <span>{metaDate}</span>
            {dur ? (
              <>
                <span className="mx-1.5 text-[#c9c7c4]" aria-hidden>
                  ·
                </span>
                <span>{dur}</span>
              </>
            ) : null}
            <span className="mx-1.5 text-[#c9c7c4]" aria-hidden>
              ·
            </span>
            <span>Session {meeting.session_index ?? 1}</span>
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] text-[#a3a3a3]">Editing</span>
              <span className="flex -space-x-2">
                <span
                  className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#e3e2df] bg-[#E8F1FA] text-[11px] font-semibold text-[#1e4d7a]"
                  title={meeting.manager_name ?? ''}
                >
                  {managerInitials}
                </span>
                <span
                  className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[#e3e2df] bg-[#E4F0E4] text-[11px] font-semibold text-[#2d5a2d]"
                  title={meeting.report_name ?? ''}
                >
                  {reportInitials}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8f8f8f]">
              {savedFlash ? <span>Saved</span> : null}
              {saving ? <span>Saving…</span> : null}
            </div>
          </div>
        </header>

        {err ? (
          <p className="mt-8 rounded-md border border-red-200/70 bg-white px-3 py-2.5 text-[13px] text-red-800 shadow-sm">{err}</p>
        ) : null}

        <section className="mt-14">
          <h2 className="mb-4 text-[14px] font-semibold text-[#2d2d2d]">Participants</h2>
          <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-12">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e3e2df] bg-[#E8F1FA] text-[11px] font-semibold text-[#1e4d7a]">
                {managerInitials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[#2d2d2d]">{meeting.manager_name}</div>
                <div className="truncate text-[13px] text-[#6b6b6b]">
                  1:1 with {meeting.report_name ?? '—'}
                </div>
                {canEditNotes ? <span className="mt-0.5 text-[12px] text-[#8f8f8f]">Can edit</span> : null}
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e3e2df] bg-[#E4F0E4] text-[11px] font-semibold text-[#2d5a2d]">
                {reportInitials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[#2d2d2d]">{meeting.report_name}</div>
                <div className="truncate text-[13px] text-[#6b6b6b]">
                  1:1 with {meeting.manager_name ?? '—'}
                </div>
                {canEditNotes ? <span className="mt-0.5 text-[12px] text-[#8f8f8f]">Can edit</span> : null}
              </div>
            </div>
          </div>
        </section>

        <div className="my-10 h-px bg-[#e8e6e3]" aria-hidden />

        <section>
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8f8f8f]">Check-in questions</h2>
            {isManager && canEditNotes ? (
              <button
                type="button"
                onClick={addQuestion}
                className="text-[13px] font-medium text-[#6b6b6b] hover:text-[#2d2d2d] hover:underline hover:underline-offset-2"
              >
                + Add question
              </button>
            ) : null}
          </div>
          <div>
            {doc.questions.map((q) => (
              <div key={q.id} className="border-b border-[#ebe8e4] py-8 last:border-b-0">
                <div className="min-w-0">
                  {isManager && canEditNotes ? (
                    <textarea
                      data-autosize
                      rows={1}
                      className="min-h-[1.75rem] w-full resize-none border-0 bg-transparent text-[17px] font-semibold leading-snug text-[#2d2d2d] outline-none placeholder:text-[#b9b7b4]"
                      placeholder="Question…"
                      value={q.prompt}
                      onChange={(e) => patchQuestion(q.id, { prompt: e.target.value })}
                    />
                  ) : (
                    <p className="text-[17px] font-semibold leading-snug text-[#2d2d2d]">{q.prompt || '—'}</p>
                  )}
                </div>

                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-[#8f8f8f]">
                  <span
                    className={
                      q.owner === 'manager'
                        ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-[#1e4d7a]'
                        : q.owner === 'both'
                          ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-[#8f8f8f]'
                          : 'h-1.5 w-1.5 shrink-0 rounded-full bg-[#2d5a2d]'
                    }
                  />
                  <span className="shrink-0 text-[#a3a3a3]">Who answers</span>
                  {isManager && canEditNotes ? (
                    <FormSelect
                      className="min-w-0 max-w-[min(100%,18rem)] rounded-md border border-[#e3e2df] bg-white px-2 py-1 text-[12px] text-[#2d2d2d] outline-none"
                      value={q.owner}
                      onChange={(e) =>
                        patchQuestion(q.id, { owner: e.target.value as QuestionOwner })
                      }
                    >
                      <option value="employee">{meeting.report_name ?? 'Participant'}</option>
                      <option value="manager">{meeting.manager_name ?? 'Participant'}</option>
                      <option value="both">
                        {meeting.report_name ?? '—'} & {meeting.manager_name ?? '—'}
                      </option>
                    </FormSelect>
                  ) : (
                    <span className="min-w-0 truncate text-[#6b6b6b]">
                      {answersOwnerLabel(q.owner, meeting.report_name, meeting.manager_name)}
                    </span>
                  )}
                  {isManager && canEditNotes ? (
                    <>
                      <span className="text-[#dddcda]" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[12px] text-[#b45353] hover:underline"
                        onClick={() => removeQuestion(q.id)}
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="mt-3 rounded-md border border-[#e8e6e3] bg-white px-3 py-2.5 focus-within:border-[#d4d2cf]">
                  {canEditAnswer(isManager, q.owner) && canEditNotes ? (
                    <textarea
                      data-autosize
                      rows={2}
                      className="w-full min-w-0 resize-none border-0 bg-transparent text-[16px] leading-[1.65] text-[#37352f] outline-none placeholder:text-[#b9b7b4]"
                      placeholder="Answer…"
                      value={q.answer}
                      onChange={(e) => patchAnswer(q.id, e.target.value)}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-[16px] leading-[1.65] text-[#37352f]">{q.answer || '—'}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="my-10 h-px bg-[#e8e6e3]" aria-hidden />

        <section className="mb-10">
          <h2 className="mb-1 text-[14px] font-semibold text-[#2d2d2d]">Shared notes</h2>
          <p className="mb-3 text-[13px] text-[#8f8f8f]">Visible to both participants.</p>
          <div className="rounded-md border border-[#e8e6e3] bg-white px-4 py-3 focus-within:border-[#d4d2cf]">
            {canEditNotes && isManager ? (
              <textarea
                data-autosize
                rows={3}
                className="min-h-[5.5rem] w-full resize-none border-0 bg-transparent text-[16px] leading-[1.65] text-[#2d2d2d] outline-none placeholder:text-[#b9b7b4]"
                placeholder="Notes…"
                value={doc.manager_notes_shared}
                onChange={(e) => setDocAndSave({ ...doc, manager_notes_shared: e.target.value })}
              />
            ) : (
              <p className="whitespace-pre-wrap text-[16px] leading-[1.65] text-[#454545]">
                {doc.manager_notes_shared || '—'}
              </p>
            )}
          </div>
        </section>

        {isManager || isHrViewer ? (
          <section className="mb-10">
            <h2 className="mb-1 text-[14px] font-semibold text-[#2d2d2d]">Private notes</h2>
            <p className="mb-3 text-[13px] text-[#8f8f8f]">Only you and HR.</p>
            <div className="rounded-md border border-[#e5e0d6] bg-[#faf7f2] px-4 py-3 focus-within:border-[#d4cdc0]">
              {canEditNotes && isManager ? (
                <textarea
                  data-autosize
                  rows={2}
                  className="min-h-[3.5rem] w-full resize-none border-0 bg-transparent text-[16px] leading-[1.65] text-[#2d2d2d] outline-none placeholder:text-[#b9b7b4]"
                  placeholder="Private notes…"
                  value={doc.private_manager_notes}
                  onChange={(e) => setDocAndSave({ ...doc, private_manager_notes: e.target.value })}
                />
              ) : (
                <p className="whitespace-pre-wrap text-[16px] leading-[1.65] text-[#454545]">
                  {doc.private_manager_notes || '—'}
                </p>
              )}
            </div>
          </section>
        ) : null}

        <div className="my-10 h-px bg-[#e8e6e3]" aria-hidden />

        <section>
          <h2 className="mb-1 text-[14px] font-semibold text-[#2d2d2d]">Action items</h2>
          <p className="mb-3 text-[13px] text-[#8f8f8f]">Follow-ups from this session.</p>
          <div className="divide-y divide-[#ebe8e4]">
            {doc.action_items.map((a) => (
              <div key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 py-3 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-x-3">
                <button
                  type="button"
                  disabled={!canEditNotes}
                  onClick={() => patchAction(a.id, { done: !a.done })}
                  className={`mt-1 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                    a.done
                      ? 'border-[#6b6b6b] bg-[#2d2d2d] text-white'
                      : 'border-[#cfcac3] bg-white hover:border-[#b0aba4]'
                  } disabled:opacity-50`}
                  aria-label={a.done ? 'Mark not done' : 'Mark done'}
                >
                  {a.done ? (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2.5 6l2.5 2.5L9.5 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
                {canEditNotes ? (
                  <textarea
                    data-autosize
                    rows={1}
                    className={`min-h-[24px] min-w-0 resize-none border-0 bg-transparent py-0.5 text-[16px] leading-snug outline-none ${
                      a.done ? 'text-[#a3a3a3] line-through' : 'text-[#2d2d2d]'
                    }`}
                    value={a.text}
                    onChange={(e) => patchAction(a.id, { text: e.target.value })}
                  />
                ) : (
                  <p className={`min-w-0 text-[16px] leading-snug ${a.done ? 'text-[#a3a3a3] line-through' : 'text-[#2d2d2d]'}`}>
                    {a.text || '—'}
                  </p>
                )}
                {canEditNotes ? (
                  <FormSelect
                    className="col-span-2 mt-0.5 max-w-full justify-self-start rounded-md border border-[#e3e2df] bg-white px-2 py-1 text-[12px] text-[#2d2d2d] sm:col-span-1 sm:col-auto sm:mt-0.5 sm:max-w-[min(100%,14rem)] sm:justify-self-end"
                    value={a.assignee_user_id ?? ''}
                    onChange={(e) =>
                      patchAction(a.id, {
                        assignee_user_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Assign…</option>
                    <option value={meeting.manager_user_id}>{meeting.manager_name ?? managerInitials}</option>
                    <option value={meeting.report_user_id}>{meeting.report_name ?? reportInitials}</option>
                  </FormSelect>
                ) : (
                  <span className="col-span-2 min-w-0 truncate text-[12px] text-[#8f8f8f] sm:col-span-1 sm:text-right">
                    {a.assignee_user_id === meeting.manager_user_id
                      ? (meeting.manager_name ?? managerInitials)
                      : a.assignee_user_id === meeting.report_user_id
                        ? (meeting.report_name ?? reportInitials)
                        : '—'}
                  </span>
                )}
              </div>
            ))}
          </div>
          {canEditNotes ? (
            <button
              type="button"
              onClick={addAction}
              className="mt-2 flex w-full items-center gap-2 py-2 pl-0.5 text-left text-[14px] text-[#8f8f8f] transition-colors hover:text-[#2d2d2d]"
            >
              <span className="flex h-[17px] w-[17px] items-center justify-center rounded-[3px] border border-dashed border-[#cfcac3] text-[16px] font-light leading-none">
                +
              </span>
              Add action item
            </button>
          ) : null}
        </section>

        <footer className="mt-14 border-t border-[#e8e6e3] pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {meeting.manager_signed_at ? (
                <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-[#e3e2df] bg-[#E8F1FA] px-3 py-1 text-[12px] font-medium text-[#1e4d7a]">
                  ✓ {meeting.manager_name ?? '—'} signed
                </span>
              ) : isManager && canEditNotes ? (
                <button
                  type="button"
                  onClick={() => void sign()}
                  className="rounded-md border border-[#e3e2df] bg-white px-3.5 py-2 text-[13px] font-medium text-[#2d2d2d] hover:bg-[#f3f2ef]"
                >
                  Sign as {meeting.manager_name ?? 'Participant'}
                </button>
              ) : null}
              {meeting.report_signed_at ? (
                <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-[#e3e2df] bg-[#E4F0E4] px-3 py-1 text-[12px] font-medium text-[#2d5a2d]">
                  ✓ {meeting.report_name ?? '—'} signed
                </span>
              ) : isReport && canEditNotes ? (
                <button
                  type="button"
                  onClick={() => void sign()}
                  className="rounded-md border border-[#e3e2df] bg-white px-3.5 py-2 text-[13px] font-medium text-[#2d2d2d] hover:bg-[#f3f2ef]"
                >
                  Sign as {meeting.report_name ?? 'Participant'}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#6b6b6b]">
              <span className="text-[#8f8f8f]">Next session</span>
              {canEditNotes && isManager ? (
                <input
                  type="datetime-local"
                  className="rounded-md border border-[#e3e2df] bg-white px-2.5 py-1.5 text-[13px] text-[#2d2d2d] outline-none focus:border-[#cfcac3]"
                  value={nextSessionLocal}
                  onChange={(e) => setNextSessionAndSave(e.target.value)}
                />
              ) : meeting.next_session_at ? (
                <span className="font-medium text-[#2d2d2d]">
                  {new Date(meeting.next_session_at).toLocaleString('en-GB', {
                    timeZone: 'UTC',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : (
                <span className="text-[#c9c7c4]">—</span>
              )}
            </div>
          </div>

          {canEditNotes ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void flushSave()}
                className="rounded-md border border-[#e3e2df] bg-white px-4 py-2 text-[13px] font-medium text-[#2d2d2d] hover:bg-[#f3f2ef]"
              >
                Save now
              </button>
            </div>
          ) : null}

          {isManager && meeting.status !== 'completed' && meeting.status !== 'cancelled' ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {meeting.status === 'scheduled' ? (
                <button
                  type="button"
                  onClick={() => void setStatus('in_progress')}
                  className="rounded-md border border-[#e3e2df] bg-white px-4 py-2 text-[13px] font-medium text-[#2d2d2d] hover:bg-[#f3f2ef]"
                >
                  Start meeting
                </button>
              ) : null}
              {meeting.status === 'in_progress' || meeting.status === 'scheduled' ? (
                <button
                  type="button"
                  onClick={() => void setStatus('completed')}
                  className="rounded-md bg-[#2d2d2d] px-4 py-2 text-[13px] font-medium text-[#F9F8F6] hover:bg-[#1a1a1a]"
                >
                  Mark complete
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void setStatus('cancelled')}
                className="px-2 py-2 text-[13px] text-[#b45353] hover:underline"
              >
                Cancel session
              </button>
            </div>
          ) : null}
        </footer>

        {locked && (meeting.manager_user_id === userId || meeting.report_user_id === userId) ? (
          <div className="mt-10 rounded-md border border-[#e8e6e3] bg-white p-5">
            <h3 className="text-[14px] font-semibold text-[#2d2d2d]">Request a note change</h3>
            <p className="mt-1 text-[13px] text-[#8f8f8f]">Describe what should change in the shared notes.</p>
            <textarea
              className="mt-3 min-h-[100px] w-full rounded-md border border-[#e3e2df] bg-[#F9F8F6] px-3 py-2.5 text-[15px] leading-relaxed text-[#2d2d2d] outline-none focus:border-[#cfcac3]"
              placeholder="Proposed text for shared notes"
              value={proposed}
              onChange={(e) => setProposed(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void submitEditRequest()}
              className="mt-3 rounded-md bg-[#2d2d2d] px-4 py-2 text-[13px] font-medium text-[#F9F8F6] hover:bg-[#1a1a1a]"
            >
              Submit request
            </button>
          </div>
        ) : null}

        {requests.length > 0 ? (
          <div className="mt-10 space-y-3">
            <h3 className="text-[14px] font-semibold text-[#2d2d2d]">Edit requests</h3>
            {requests.map((r) => (
              <div key={r.id} className="rounded-md border border-[#e8e6e3] bg-white p-4 text-[13px]">
                <p className="text-[12px] text-[#8f8f8f]">
                  {new Date(r.created_at).toLocaleString()} · {r.status}
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[#454545]">{r.proposed_notes}</pre>
                {r.status === 'pending' && (isManager || canHrResolve) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void resolveRequest(r.id, true)}
                      className="rounded-md bg-[#2d2d2d] px-3 py-1.5 text-[12px] font-medium text-[#F9F8F6] hover:bg-[#1a1a1a]"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolveRequest(r.id, false)}
                      className="rounded-md border border-[#e3e2df] bg-white px-3 py-1.5 text-[12px] font-medium text-[#2d2d2d] hover:bg-[#f3f2ef]"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {isHrViewer ? (
          <p className="mt-10 text-[13px] text-[#8f8f8f]">You are viewing this 1:1 as HR. Notes are read-only.</p>
        ) : null}
      </article>
    </div>
  );
}

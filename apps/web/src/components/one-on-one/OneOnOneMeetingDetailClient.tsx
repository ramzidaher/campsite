'use client';

import Link from 'next/link';
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

function ownerLabel(owner: QuestionOwner) {
  if (owner === 'manager') return 'Manager';
  if (owner === 'both') return 'Both';
  return 'Employee';
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

  return (
    <div className="mx-auto max-w-[780px] px-5 py-8 pb-16 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#e8e8e8] pb-5">
        <div className="flex items-center gap-2 text-[12px] text-[#6b6b6b]">
          <span>Editing</span>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#E6F1FB] text-[11px] font-medium text-[#0C447C]"
            title={meeting.manager_name ?? 'Manager'}
          >
            {managerInitials}
          </span>
          <span
            className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#EAF3DE] text-[11px] font-medium text-[#27500A]"
            title={meeting.report_name ?? 'Report'}
          >
            {reportInitials}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {savedFlash ? (
            <span className="rounded-full border border-[#bbf7d0] px-2.5 py-1 text-[11px] text-[#166534]">Saved</span>
          ) : null}
          {saving ? (
            <span className="rounded-full border border-[#e8e8e8] px-2.5 py-1 text-[11px] text-[#6b6b6b]">Saving…</span>
          ) : null}
        </div>
      </div>

      <Link href="/one-on-ones" className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
        ← All 1:1s
      </Link>

      <div className="mt-4 text-[12px] text-[#6b6b6b]">
        <span>1:1 Notes</span>
        <span className="mx-1.5 text-[#d4d4d4]">/</span>
        <span>
          {meeting.report_name} × {meeting.manager_name}
        </span>
      </div>

      <textarea
        data-autosize
        className="mt-3 w-full resize-none border-0 bg-transparent font-authSerif text-[28px] font-medium leading-tight text-[#121212] outline-none placeholder:text-[#9b9b9b] sm:text-[30px]"
        rows={1}
        placeholder="Session title…"
        value={sessionTitle}
        onChange={(e) => (canEditNotes && isManager ? setTitleAndSave(e.target.value) : undefined)}
        readOnly={!canEditNotes || !isManager}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[#6b6b6b]">
        <span className="inline-flex items-center gap-1.5">
          <span className="opacity-50" aria-hidden>
            ◫
          </span>
          {new Date(meeting.starts_at).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        {dur ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="opacity-50" aria-hidden>
              ◷
            </span>
            {dur}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="opacity-50" aria-hidden>
            ≡
          </span>
          Session {meeting.session_index ?? 1}
        </span>
      </div>

      {err ? <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{err}</p> : null}

      <section className="mt-10">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">Participants</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#e8e8e8] bg-white px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6F1FB] text-[13px] font-medium text-[#0C447C]">
              {managerInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-[#121212]">{meeting.manager_name}</div>
              <div className="text-[12px] text-[#6b6b6b]">Manager</div>
            </div>
            {canEditNotes ? <span className="text-[10px] font-medium text-[#185FA5]">editing</span> : null}
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#e8e8e8] bg-white px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF3DE] text-[13px] font-medium text-[#27500A]">
              {reportInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-[#121212]">{meeting.report_name}</div>
              <div className="text-[12px] text-[#6b6b6b]">Employee</div>
            </div>
            {canEditNotes ? <span className="text-[10px] font-medium text-[#3B6D11]">editing</span> : null}
          </div>
        </div>
      </section>

      <hr className="my-8 border-0 border-t border-[#e8e8e8]" />

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">Check-in questions</p>
          {isManager && canEditNotes ? (
            <button
              type="button"
              onClick={addQuestion}
              className="text-[12px] font-medium text-[#185FA5] underline underline-offset-2"
            >
              Add question
            </button>
          ) : null}
        </div>
        <div className="space-y-4">
          {doc.questions.map((q) => (
            <div
              key={q.id}
              className="overflow-hidden rounded-xl border border-[#e8e8e8] bg-white focus-within:border-[#d4d4d4]"
            >
              <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
                {isManager && canEditNotes ? (
                  <textarea
                    data-autosize
                    rows={1}
                    className="min-h-[40px] w-full resize-none border-0 bg-transparent text-[13px] font-medium leading-snug text-[#121212] outline-none placeholder:text-[#9b9b9b]"
                    placeholder="Question…"
                    value={q.prompt}
                    onChange={(e) => patchQuestion(q.id, { prompt: e.target.value })}
                  />
                ) : (
                  <p className="text-[13px] font-medium leading-snug text-[#121212]">{q.prompt || '—'}</p>
                )}
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#9b9b9b]">
                  <span
                    className={
                      q.owner === 'manager'
                        ? 'h-1.5 w-1.5 rounded-full bg-[#185FA5]'
                        : q.owner === 'both'
                          ? 'h-1.5 w-1.5 rounded-full bg-[#888780]'
                          : 'h-1.5 w-1.5 rounded-full bg-[#3B6D11]'
                    }
                  />
                  {isManager && canEditNotes ? (
                    <select
                      className="max-w-[100px] rounded border border-[#e8e8e8] bg-white px-1 py-0.5 text-[11px]"
                      value={q.owner}
                      onChange={(e) =>
                        patchQuestion(q.id, { owner: e.target.value as QuestionOwner })
                      }
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="both">Both</option>
                    </select>
                  ) : (
                    <span>{ownerLabel(q.owner)}</span>
                  )}
                  {isManager && canEditNotes ? (
                    <button
                      type="button"
                      className="ml-1 text-[11px] text-[#b91c1c]"
                      onClick={() => removeQuestion(q.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="px-4 pb-3.5 pt-1">
                {canEditAnswer(isManager, q.owner) && canEditNotes ? (
                  <textarea
                    data-autosize
                    rows={2}
                    className="w-full resize-none border-0 bg-transparent text-[13px] leading-relaxed text-[#121212] outline-none placeholder:text-[#9b9b9b]"
                    placeholder="Add your answer…"
                    value={q.answer}
                    onChange={(e) => patchAnswer(q.id, e.target.value)}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#2a2a2a]">{q.answer || '—'}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <hr className="my-8 border-0 border-t border-[#e8e8e8]" />

      <section className="mb-8">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">Manager notes</p>
        <div className="overflow-hidden rounded-xl border border-[#e8e8e8] bg-white focus-within:border-[#d4d4d4]">
          {canEditNotes && isManager ? (
            <textarea
              data-autosize
              rows={3}
              className="min-h-[80px] w-full resize-none border-0 bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-[#121212] outline-none placeholder:text-[#9b9b9b]"
              placeholder="Notes visible to both participants…"
              value={doc.manager_notes_shared}
              onChange={(e) => setDocAndSave({ ...doc, manager_notes_shared: e.target.value })}
            />
          ) : (
            <p className="whitespace-pre-wrap px-4 py-3.5 text-[13px] leading-relaxed text-[#2a2a2a]">
              {doc.manager_notes_shared || '—'}
            </p>
          )}
        </div>
      </section>

      {isManager || isHrViewer ? (
        <section className="mb-8">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">Private manager notes</p>
          <div className="overflow-hidden rounded-xl border border-[#e8e8e8] bg-[#faf9f6] focus-within:border-[#d4d4d4]">
            {canEditNotes && isManager ? (
              <textarea
                data-autosize
                rows={2}
                className="min-h-[56px] w-full resize-none border-0 bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-[#121212] outline-none placeholder:text-[#9b9b9b]"
                placeholder="Only visible to you and HR…"
                value={doc.private_manager_notes}
                onChange={(e) => setDocAndSave({ ...doc, private_manager_notes: e.target.value })}
              />
            ) : (
              <p className="whitespace-pre-wrap px-4 py-3.5 text-[13px] leading-relaxed text-[#2a2a2a]">
                {doc.private_manager_notes || '—'}
              </p>
            )}
          </div>
        </section>
      ) : null}

      <hr className="my-8 border-0 border-t border-[#e8e8e8]" />

      <section>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">Action items</p>
        <div>
          {doc.action_items.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-2.5 border-b border-[#e8e8e8] py-2 last:border-b-0"
            >
              <button
                type="button"
                disabled={!canEditNotes}
                onClick={() => patchAction(a.id, { done: !a.done })}
                className={`mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border border-[#c4c4c4] ${
                  a.done ? 'bg-white' : ''
                }`}
                aria-label={a.done ? 'Mark not done' : 'Mark done'}
              >
                {a.done ? (
                  <span className="block h-1 w-2 rotate-[-45deg] border-b-[1.5px] border-l-[1.5px] border-[#6b6b6b]" />
                ) : null}
              </button>
              {canEditNotes ? (
                <textarea
                  data-autosize
                  rows={1}
                  className={`min-h-[22px] flex-1 resize-none border-0 bg-transparent py-0.5 text-[13px] leading-snug outline-none ${
                    a.done ? 'text-[#9b9b9b] line-through' : 'text-[#121212]'
                  }`}
                  value={a.text}
                  onChange={(e) => patchAction(a.id, { text: e.target.value })}
                />
              ) : (
                <p className={`flex-1 text-[13px] leading-snug ${a.done ? 'text-[#9b9b9b] line-through' : 'text-[#121212]'}`}>
                  {a.text || '—'}
                </p>
              )}
              {canEditNotes ? (
                <select
                  className="mt-0.5 max-w-[120px] shrink-0 rounded border border-[#e8e8e8] bg-white px-1 py-0.5 text-[11px]"
                  value={a.assignee_user_id ?? ''}
                  onChange={(e) =>
                    patchAction(a.id, {
                      assignee_user_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">—</option>
                  <option value={meeting.manager_user_id}>{managerInitials}</option>
                  <option value={meeting.report_user_id}>{reportInitials}</option>
                </select>
              ) : (
                <span className="mt-0.5 shrink-0 text-[11px] text-[#9b9b9b]">
                  {a.assignee_user_id === meeting.manager_user_id
                    ? managerInitials
                    : a.assignee_user_id === meeting.report_user_id
                      ? reportInitials
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
            className="mt-2 flex w-full items-center gap-2 py-2 text-left text-[13px] text-[#9b9b9b] hover:text-[#6b6b6b]"
          >
            <span className="flex h-[15px] w-[15px] items-center justify-center rounded border border-dashed border-[#c4c4c4] text-[14px] leading-none">
              +
            </span>
            Add action item
          </button>
        ) : null}
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[#e8e8e8] pt-6">
        <div className="flex flex-wrap items-center gap-3">
          {meeting.manager_signed_at ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F1FB] px-2.5 py-1 text-[12px] text-[#0C447C]">
              ✓ {meeting.manager_name?.split(' ')[0] ?? 'Manager'} signed
            </span>
          ) : isManager && canEditNotes ? (
            <button type="button" onClick={() => void sign()} className="rounded-lg border border-[#d8d8d8] px-3.5 py-1.5 text-[12px] text-[#121212] hover:bg-[#faf9f6]">
              Sign as manager
            </button>
          ) : null}
          {meeting.report_signed_at ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3DE] px-2.5 py-1 text-[12px] text-[#27500A]">
              ✓ {meeting.report_name?.split(' ')[0] ?? 'Report'} signed
            </span>
          ) : isReport && canEditNotes ? (
            <button type="button" onClick={() => void sign()} className="rounded-lg border border-[#d8d8d8] px-3.5 py-1.5 text-[12px] text-[#121212] hover:bg-[#faf9f6]">
              Sign as {meeting.report_name?.split(' ')[0] ?? 'employee'}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#6b6b6b]">
          <span>Next session</span>
          {canEditNotes && isManager ? (
            <input
              type="datetime-local"
              className="rounded-lg border border-[#d8d8d8] px-2 py-1 text-[12px]"
              value={nextSessionLocal}
              onChange={(e) => setNextSessionAndSave(e.target.value)}
            />
          ) : meeting.next_session_at ? (
            <span>
              {new Date(meeting.next_session_at).toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      {canEditNotes ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void flushSave()}
            className="rounded-lg border border-[#d8d8d8] px-4 py-2 text-[13px] text-[#121212]"
          >
            Save now
          </button>
        </div>
      ) : null}

      {isManager && meeting.status !== 'completed' && meeting.status !== 'cancelled' ? (
        <div className="mt-6 flex flex-wrap gap-2">
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
        <div className="mt-8 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-4">
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
        <div className="mt-8 space-y-3">
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

      {isHrViewer ? (
        <p className="mt-8 text-[12px] text-[#9b9b9b]">You are viewing this 1:1 as HR. Notes are read-only.</p>
      ) : null}
    </div>
  );
}

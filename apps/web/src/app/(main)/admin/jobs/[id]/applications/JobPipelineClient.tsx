'use client';

import { GenerateOfferModal } from '@/app/(main)/admin/jobs/[id]/applications/GenerateOfferModal';
import {
  bookInterviewForApplication,
  listAvailableInterviewSlotsForJob,
  type InterviewSlotRow,
} from '@/app/(main)/admin/interviews/actions';
import {
  loadJobApplicationDetail,
  addJobApplicationNote,
  sendCandidateOnlyMessage,
  setInterviewJoiningInstructions,
  updateJobApplicationStage,
  type JobApplicationDetail,
} from '@/app/(main)/admin/jobs/[id]/applications/actions';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';
import {
  JOB_APPLICATION_STAGE_ORDER,
  JOB_APPLICATION_STAGES,
  type JobApplicationStage,
  isJobApplicationStage,
} from '@campsite/types';
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';

export type PipelineApplicationRow = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  stage: string;
  submitted_at: string;
  cv_storage_path: string | null;
  loom_url: string | null;
  staffsavvy_score: number | null;
  offer_letter_status: string | null;
};

function StageColumn({
  stage,
  apps,
  renderCard,
}: {
  stage: JobApplicationStage;
  apps: PipelineApplicationRow[];
  renderCard: (app: PipelineApplicationRow) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const tone: Record<JobApplicationStage, string> = {
    applied: 'bg-white',
    shortlisted: 'bg-white',
    interview_scheduled: 'bg-white',
    offer_sent: 'bg-white',
    hired: 'bg-white',
    rejected: 'bg-white',
  };
  const accent: Record<JobApplicationStage, string> = {
    applied: 'bg-[#9b9b9b]',
    shortlisted: 'bg-[#0f766e]',
    interview_scheduled: 'bg-[#2563eb]',
    offer_sent: 'bg-[#b45309]',
    hired: 'bg-[#15803d]',
    rejected: 'bg-[#6b7280]',
  };
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex min-h-[430px] flex-1 flex-col rounded-xl border p-3 min-w-[240px]',
        tone[stage],
        isOver ? 'border-[#121212] ring-2 ring-[#121212]/10' : 'border-[#d8d8d8]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">
          {jobApplicationStageLabel(stage)}
        </h3>
        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#f5f4f1] px-1.5 py-0.5 text-[10px] font-medium text-[#6b6b6b]">
          {apps.length}
        </span>
      </div>
      <div className={`mt-2 h-1 w-full rounded-full ${accent[stage]} opacity-80`} />
      <div className="mt-3 flex flex-1 flex-col gap-2">
        {apps.length > 0 ? (
          apps.map((app) => renderCard(app))
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#e8e8e8] bg-[#faf9f6] px-3 text-center text-[12px] text-[#9b9b9b]">
            Drop candidates here
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineCard({
  app,
  onOpenDetail,
  onRequestStageChange,
  canMoveStage,
  canBookInterviewSlot,
}: {
  app: PipelineApplicationRow;
  onOpenDetail: () => void;
  onRequestStageChange: (next: JobApplicationStage) => void;
  canMoveStage: boolean;
  canBookInterviewSlot: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: isDragging ? 10 : undefined }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'rounded-lg border border-[#e4e4e4] bg-white p-3',
        isDragging ? 'opacity-80' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-[#b0b0b0] hover:text-[#808080]"
          aria-label="Drag to change stage"
          {...(canMoveStage ? listeners : {})}
          {...(canMoveStage ? attributes : {})}
          disabled={!canMoveStage}
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={onOpenDetail}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[13px] font-medium text-[#121212]">{app.candidate_name}</p>
          <p className="truncate text-[12px] text-[#6b6b6b]">{app.candidate_email}</p>
          <p className="mt-1 text-[11px] text-[#9b9b9b]">
            {app.submitted_at
              ? new Date(app.submitted_at).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })
              : '—'}
          </p>
          {app.offer_letter_status ? (
            <p
              className={[
                'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                app.offer_letter_status === 'signed'
                  ? 'border-emerald-200 bg-emerald-50 text-[#0f5132]'
                  : app.offer_letter_status === 'declined'
                    ? 'border-red-200 bg-red-50 text-[#b91c1c]'
                    : app.offer_letter_status === 'superseded'
                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                      : 'border-amber-200 bg-amber-50 text-[#b45309]',
              ].join(' ')}
            >
              Offer:{' '}
              {app.offer_letter_status === 'sent'
                ? 'Sent (awaiting sign)'
                : app.offer_letter_status === 'signed'
                  ? 'Signed'
                  : app.offer_letter_status === 'declined'
                    ? 'Declined'
                    : 'Superseded'}
            </p>
          ) : null}
        </button>
      </div>
      <label className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-[#9b9b9b]">
        Stage
      </label>
      <select
        className="mt-0.5 w-full rounded-md border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
        value={app.stage}
        disabled={!canMoveStage}
        onChange={(e) => {
          const v = e.target.value;
          if (isJobApplicationStage(v) && v !== app.stage) onRequestStageChange(v);
        }}
      >
        {JOB_APPLICATION_STAGES.filter((s) => s !== 'interview_scheduled' || canBookInterviewSlot).map((s) => (
          <option key={s} value={s}>
            {jobApplicationStageLabel(s)}
          </option>
        ))}
      </select>
    </div>
  );
}

type StageDialogState = {
  applicationId: string;
  toStage: JobApplicationStage;
};

export function JobPipelineClient({
  jobListingId,
  jobTitle,
  initialApplications,
  canMoveStage,
  canBookInterviewSlot,
  canManageInterviews,
  canAddInternalNotes,
  canNotifyCandidate,
  canManageOffers,
}: {
  jobListingId: string;
  jobTitle: string;
  initialApplications: PipelineApplicationRow[];
  canMoveStage: boolean;
  canBookInterviewSlot: boolean;
  canManageInterviews: boolean;
  canAddInternalNotes: boolean;
  canNotifyCandidate: boolean;
  canManageOffers: boolean;
}) {
  const router = useRouter();
  const [applications, setApplications] = useState(initialApplications);
  useEffect(() => {
    setApplications(initialApplications);
  }, [initialApplications]);

  const byStage = useMemo(() => {
    const m = new Map<JobApplicationStage, PipelineApplicationRow[]>();
    for (const s of JOB_APPLICATION_STAGE_ORDER) m.set(s, []);
    for (const app of applications) {
      const st = isJobApplicationStage(app.stage) ? app.stage : 'applied';
      m.get(st)?.push(app);
    }
    return m;
  }, [applications]);
  const totalApplications = applications.length;

  const [stageDialog, setStageDialog] = useState<StageDialogState | null>(null);
  const [notify, setNotify] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [interviewSlots, setInterviewSlots] = useState<InterviewSlotRow[]>([]);
  const [interviewSlotId, setInterviewSlotId] = useState('');
  const [interviewJoining, setInterviewJoining] = useState('');
  const [pending, startTransition] = useTransition();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobApplicationDetail | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!stageDialog || stageDialog.toStage !== 'interview_scheduled') {
      setInterviewSlots([]);
      setInterviewSlotId('');
      setInterviewJoining('');
      return;
    }
    let cancel = false;
    setInterviewSlotId('');
    setInterviewJoining('');
    void listAvailableInterviewSlotsForJob(jobListingId).then((r) => {
      if (cancel) return;
      if (r.ok) setInterviewSlots(r.slots);
      else setInterviewSlots([]);
    });
    return () => {
      cancel = true;
    };
  }, [stageDialog, jobListingId]);

  const openDetail = useCallback(
    (id: string) => {
      setDetailId(id);
      setDetail(null);
      startTransition(async () => {
        const res = await loadJobApplicationDetail(id, jobListingId);
        if ('error' in res) {
          setDetail(null);
          return;
        }
        setDetail(res);
        setJoiningDraft(res.application.interview_joining_instructions ?? '');
      });
    },
    [jobListingId]
  );

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
  };

  const submitStageChange = () => {
    if (!stageDialog) return;
    if (stageDialog.toStage === 'interview_scheduled') {
      if (!interviewSlotId) {
        alert('Choose an available interview slot (create slots under Admin → Interview schedule if none appear).');
        return;
      }
      startTransition(async () => {
        const res = await bookInterviewForApplication({
          applicationId: stageDialog.applicationId,
          slotId: interviewSlotId,
          jobListingId,
          joiningInstructions: interviewJoining,
          portalMessage: interviewJoining,
        });
        if (!res.ok) {
          alert(res.error);
          return;
        }
        setStageDialog(null);
        setNotify(false);
        setMessageBody('');
        setInterviewSlotId('');
        setInterviewJoining('');
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      const res = await updateJobApplicationStage(stageDialog.applicationId, stageDialog.toStage, {
        notifyCandidate: notify,
        messageBody,
        jobListingId,
      });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setStageDialog(null);
      setNotify(false);
      setMessageBody('');
      router.refresh();
    });
  };

  function resolveTargetStage(overId: string, activeAppId: string): JobApplicationStage | null {
    if (JOB_APPLICATION_STAGES.includes(overId as JobApplicationStage)) {
      return overId as JobApplicationStage;
    }
    const targetApp = applications.find((a) => a.id === overId);
    if (targetApp && isJobApplicationStage(targetApp.stage)) {
      if (targetApp.id === activeAppId) return null;
      return targetApp.stage as JobApplicationStage;
    }
    return null;
  }

  function onDragEnd(event: DragEndEvent) {
    if (!canMoveStage) return;
    const { active, over } = event;
    if (!over) return;
    const appId = String(active.id);
    const overId = String(over.id);
    const app = applications.find((a) => a.id === appId);
    if (!app) return;
    const target = resolveTargetStage(overId, appId);
    if (!target || target === app.stage) return;
    if (target === 'interview_scheduled' && !canBookInterviewSlot) return;
    setStageDialog({ applicationId: appId, toStage: target });
    setNotify(false);
    setMessageBody('');
  }

  const onRequestStageChange = (app: PipelineApplicationRow, next: JobApplicationStage) => {
    if (!canMoveStage) return;
    if (next === app.stage) return;
    if (next === 'interview_scheduled' && !canBookInterviewSlot) return;
    setStageDialog({ applicationId: app.id, toStage: next });
    setNotify(false);
    setMessageBody('');
  };

  const [noteBody, setNoteBody] = useState('');
  const [msgOnlyBody, setMsgOnlyBody] = useState('');
  const [joiningDraft, setJoiningDraft] = useState('');
  const [detailBusy, startDetailTransition] = useTransition();
  const [generateOfferFor, setGenerateOfferFor] = useState<PipelineApplicationRow | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-7 sm:px-7">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
          <a href="/hr/jobs" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
            Job listings
          </a>
          <span className="mx-1.5 text-[#cfcfcf]">/</span>
          Pipeline
        </p>
        <h1 className="mt-1 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">{jobTitle}</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Drag cards between columns or use the stage menu on each card. Optional email to the candidate when you move
          stage.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#6b6b6b]">
          <span className="rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1">
            Total applications: {totalApplications}
          </span>
          <a href="/hr/applications" className="rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 transition-colors hover:bg-[#f5f4f1]">
            Open full application tracker
          </a>
        </div>
      </div>

      {totalApplications === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-4 text-[13px] text-[#6b6b6b]">
          No applications yet. Share the public job link from the job edit page, then applications will appear here.
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-[#fcfcfb] p-3">
          <div className="grid min-w-[1500px] grid-cols-6 gap-3">
          {JOB_APPLICATION_STAGE_ORDER.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              apps={byStage.get(stage) ?? []}
              renderCard={(app) => (
                <PipelineCard
                  key={app.id}
                  app={app}
                  onOpenDetail={() => openDetail(app.id)}
                  onRequestStageChange={(next) => onRequestStageChange(app, next)}
                  canMoveStage={canMoveStage}
                  canBookInterviewSlot={canBookInterviewSlot}
                />
              )}
            />
          ))}
          </div>
        </div>
      </DndContext>

      {stageDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div
            role="dialog"
            aria-modal
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#d8d8d8] bg-white p-5 shadow-lg"
          >
            <h2 className="font-authSerif text-lg text-[#121212]">
              Move to {jobApplicationStageLabel(stageDialog.toStage)}?
            </h2>
            {stageDialog.toStage === 'interview_scheduled' ? (
              <div className="mt-4 space-y-3">
                <p className="text-[13px] text-[#505050]">
                  Pick a slot for this job. Panel calendars will show the booking.
                  {canManageInterviews ? (
                    canNotifyCandidate ? (
                      <>
                        {' '}
                        The candidate will receive an email with the time and your joining notes, and any notes below will
                        appear in their portal message thread.
                      </>
                    ) : (
                      <>
                        {' '}
                        Without permission to notify candidates, we will not send email or add a portal message; joining
                        notes are still saved on the application and visible on their status page.
                      </>
                    )
                  ) : (
                    <>
                      {' '}
                      Only interview admins can add joining instructions here. You can still book the slot; ask an admin
                      to add notes in the application detail if needed.
                    </>
                  )}
                </p>
                <label className="block text-[12px] font-medium text-[#505050]">
                  Available slot
                  <select
                    value={interviewSlotId}
                    onChange={(e) => setInterviewSlotId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  >
                    <option value="">Select a slot…</option>
                    {interviewSlots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString()}{' '}
                        {s.title ? `(${s.title})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {interviewSlots.length === 0 ? (
                  <p className="text-[13px] text-amber-900">
                    No available slots for this job.{' '}
                    <a href="/hr/interviews" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
                      Create interview slots
                    </a>
                    .
                  </p>
                ) : null}
                <label className="block text-[12px] font-medium text-[#505050]">
                  Joining instructions
                  {canManageInterviews
                    ? canNotifyCandidate
                      ? ' (email, portal message thread, and status page)'
                      : ' (status page)'
                    : ' (interview admin only)'}
                  <textarea
                    value={interviewJoining}
                    onChange={(e) => setInterviewJoining(e.target.value)}
                    placeholder="e.g. video link, building access, parking…"
                    rows={4}
                    disabled={!canManageInterviews}
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)] disabled:cursor-not-allowed disabled:bg-[#f5f5f5]"
                  />
                </label>
              </div>
            ) : (
              <>
                {canNotifyCandidate ? (
                  <label className="mt-4 flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    Email the candidate and show this text in their portal
                  </label>
                ) : (
                  <p className="mt-4 text-[12px] text-[#9b9b9b]">
                    You can move stages but cannot notify candidates.
                  </p>
                )}
                <textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Message to candidate (required if notifying)"
                  rows={4}
                  disabled={!canNotifyCandidate}
                  className="mt-2 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                />
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
                onClick={() => setStageDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-60"
                onClick={() => submitStageChange()}
              >
                {pending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {generateOfferFor ? (
        <GenerateOfferModal
          jobListingId={jobListingId}
          applicationId={generateOfferFor.id}
          candidateName={generateOfferFor.candidate_name}
          onClose={() => setGenerateOfferFor(null)}
          onSent={() => {
            router.refresh();
            if (detailId) openDetail(detailId);
          }}
        />
      ) : null}

      {detailId ? (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/20 p-0 sm:p-4">
          <div className="flex h-full w-full max-w-lg flex-col border-l border-[#e8e8e8] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
              <h2 className="text-[15px] font-semibold text-[#121212]">Application</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[13px] text-[#6b6b6b] hover:bg-[#f5f5f5]"
                onClick={closeDetail}
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!detail ? (
                <p className="text-[13px] text-[#6b6b6b]">{detailBusy ? 'Loading…' : 'Could not load detail.'}</p>
              ) : (
                <div className="space-y-6">
                  <section>
                    <p className="text-[13px] font-medium text-[#121212]">{detail.application.candidate_name}</p>
                    <p className="text-[12px] text-[#6b6b6b]">{detail.application.candidate_email}</p>
                    {detail.application.candidate_phone ? (
                      <p className="text-[12px] text-[#6b6b6b]">{detail.application.candidate_phone}</p>
                    ) : null}
                    {detail.application.candidate_location ? (
                      <p className="text-[12px] text-[#6b6b6b]">Location: {detail.application.candidate_location}</p>
                    ) : null}
                    {detail.application.current_title ? (
                      <p className="text-[12px] text-[#6b6b6b]">Current role: {detail.application.current_title}</p>
                    ) : null}
                    {detail.application.linkedin_url ? (
                      <p className="mt-1 text-[13px]">
                        <a
                          href={detail.application.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                        >
                          LinkedIn profile
                        </a>
                      </p>
                    ) : null}
                    {detail.application.portfolio_url ? (
                      <p className="mt-1 text-[13px]">
                        <a
                          href={detail.application.portfolio_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                        >
                          Portfolio / website
                        </a>
                      </p>
                    ) : null}
                    <p className="mt-2 text-[12px] text-[#9b9b9b]">
                      Stage: {jobApplicationStageLabel(detail.application.stage)}
                    </p>
                    {detail.application.cv_storage_path ? (
                      <a
                        href={`/api/admin/job-applications/${detail.application.id}/cv`}
                        className="mt-2 inline-block text-[13px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                      >
                        Download CV
                      </a>
                    ) : (
                      <p className="mt-2 text-[12px] text-[#9b9b9b]">No CV on file</p>
                    )}
                    {detail.application.loom_url ? (
                      <p className="mt-2 text-[13px]">
                        <a
                          href={detail.application.loom_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                        >
                          Loom video
                        </a>
                      </p>
                    ) : null}
                    {detail.application.staffsavvy_score != null ? (
                      <p className="mt-2 text-[13px] text-[#505050]">
                        StaffSavvy: {detail.application.staffsavvy_score}/5
                      </p>
                    ) : null}
                    {detail.application.motivation_text ? (
                      <div className="mt-3 rounded-md border border-[#eaeaea] bg-[#fafafa] p-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a8a8a]">
                          Candidate motivation
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#303030]">
                          {detail.application.motivation_text}
                        </p>
                      </div>
                    ) : null}
                  </section>

                  {detail.application.stage === 'offer_sent' ? (
                    <section className="rounded-lg border border-[#e8f0fe] bg-[#f8fbff] p-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#1e40af]">
                        Offer letter &amp; e-signature
                      </h3>
                      <p className="mt-1 text-[12px] text-[#505050]">
                        Workflow:{' '}
                        <span className="font-medium">
                          {detail.application.offer_letter_status === 'signed'
                            ? 'Signed'
                            : detail.application.offer_letter_status === 'declined'
                              ? 'Declined'
                              : detail.application.offer_letter_status === 'sent'
                                ? 'Sent — awaiting candidate signature'
                                : 'Not sent yet'}
                        </span>
                      </p>
                      {detail.latest_offer?.status === 'sent' ? (
                        <div className="mt-2">
                          <p className="text-[11px] text-[#6b6b6b]">Candidate signing link (same as email):</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <code className="max-w-[220px] truncate rounded bg-white px-2 py-1 text-[11px]">
                              {typeof window !== 'undefined'
                                ? `${window.location.origin}/jobs/offer-sign/${detail.latest_offer.portal_token}`
                                : `/jobs/offer-sign/${detail.latest_offer.portal_token}`}
                            </code>
                            <button
                              type="button"
                              className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                              onClick={() => {
                                const u = `${window.location.origin}/jobs/offer-sign/${detail.latest_offer?.portal_token}`;
                                void navigator.clipboard.writeText(u);
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {detail.latest_offer?.signed_pdf_storage_path ? (
                        <a
                          href={`/api/admin/application-offers/${detail.latest_offer.id}/pdf`}
                          className="mt-2 inline-block text-[13px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                        >
                          Download signed PDF
                        </a>
                      ) : null}
                      {canManageOffers ? (
                        <button
                          type="button"
                          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[#121212] px-3 text-[13px] font-medium text-[#faf9f6]"
                          onClick={() => {
                            setGenerateOfferFor({
                              id: detail.application.id,
                              candidate_name: detail.application.candidate_name,
                              candidate_email: detail.application.candidate_email,
                              stage: detail.application.stage,
                              submitted_at: detail.application.submitted_at,
                              cv_storage_path: detail.application.cv_storage_path,
                              loom_url: detail.application.loom_url,
                              staffsavvy_score: detail.application.staffsavvy_score,
                              offer_letter_status: detail.application.offer_letter_status,
                            });
                          }}
                        >
                          {detail.application.offer_letter_status ? 'Send / resend offer letter' : 'Generate offer letter'}
                        </button>
                      ) : null}
                    </section>
                  ) : null}

                  {detail.application.stage === 'interview_scheduled' ? (
                    <section className="rounded-lg border border-[#dbeafe] bg-[#f8fbff] p-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#1e40af]">
                        Interview joining instructions
                      </h3>
                      <p className="mt-1 text-[12px] text-[#505050]">
                        Shown in candidate portal and interview updates.
                      </p>
                      <textarea
                        value={joiningDraft}
                        onChange={(e) => setJoiningDraft(e.target.value)}
                        placeholder="e.g. video link, building access, parking..."
                        rows={4}
                        disabled={!canManageInterviews}
                        className="mt-2 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)] disabled:cursor-not-allowed disabled:bg-[#f5f5f5]"
                      />
                      {canManageInterviews ? (
                        <button
                          type="button"
                          className="mt-2 rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-white"
                          onClick={() => {
                            startDetailTransition(async () => {
                              const res = await setInterviewJoiningInstructions(
                                detail.application.id,
                                joiningDraft,
                                jobListingId
                              );
                              if (!res.ok) {
                                alert(res.error);
                                return;
                              }
                              openDetail(detail.application.id);
                            });
                          }}
                        >
                          Save instructions
                        </button>
                      ) : (
                        <p className="mt-2 text-[12px] text-[#6b6b6b]">You do not have permission to edit joining instructions.</p>
                      )}
                    </section>
                  ) : null}

                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                      Internal notes
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {detail.notes.length === 0 ? (
                        <li className="text-[13px] text-[#9b9b9b]">No notes yet.</li>
                      ) : (
                        detail.notes.map((n) => (
                          <li key={n.id} className="rounded-md border border-[#f0f0f0] bg-[#fafafa] p-2 text-[13px]">
                            <p className="text-[11px] text-[#9b9b9b]">
                              {n.created_at
                                ? new Date(n.created_at).toLocaleString(undefined, {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })
                                : ''}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-[#242424]">{n.body}</p>
                          </li>
                        ))
                      )}
                    </ul>
                    {canAddInternalNotes ? (
                      <>
                        <textarea
                          value={noteBody}
                          onChange={(e) => setNoteBody(e.target.value)}
                          placeholder="Add internal note (not visible to candidate)"
                          rows={3}
                          className="mt-2 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                        />
                        <button
                          type="button"
                          className="mt-2 rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-white"
                          onClick={() => {
                            startDetailTransition(async () => {
                              const res = await addJobApplicationNote(detail.application.id, noteBody, jobListingId);
                              if (!res.ok) {
                                alert(res.error);
                                return;
                              }
                              setNoteBody('');
                              openDetail(detail.application.id);
                            });
                          }}
                        >
                          Add note
                        </button>
                      </>
                    ) : (
                      <p className="mt-2 text-[12px] text-[#9b9b9b]">You can view notes but cannot add new ones.</p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                      Message candidate (portal + email)
                    </h3>
                    <p className="mt-1 text-[12px] text-[#6b6b6b]">Does not change application stage.</p>
                    {canNotifyCandidate ? (
                      <>
                        <textarea
                          value={msgOnlyBody}
                          onChange={(e) => setMsgOnlyBody(e.target.value)}
                          placeholder="Message…"
                          rows={3}
                          className="mt-2 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                        />
                        <button
                          type="button"
                          className="mt-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
                          onClick={() => {
                            startDetailTransition(async () => {
                              const res = await sendCandidateOnlyMessage(
                                detail.application.id,
                                msgOnlyBody,
                                jobListingId
                              );
                              if (!res.ok) {
                                alert(res.error);
                                return;
                              }
                              setMsgOnlyBody('');
                              openDetail(detail.application.id);
                            });
                          }}
                        >
                          Send &amp; notify by email
                        </button>
                      </>
                    ) : (
                      <p className="mt-2 text-[12px] text-[#9b9b9b]">You can view prior messages but cannot send candidate updates.</p>
                    )}

                    <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                      Previous candidate messages
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {detail.messages.map((m) => (
                        <li key={m.id} className="rounded-md border border-[#e8f5f0] bg-[#f6fdfb] p-2 text-[13px]">
                          <p className="text-[11px] text-[#9b9b9b]">
                            {m.created_at
                              ? new Date(m.created_at).toLocaleString(undefined, {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : ''}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

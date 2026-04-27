'use client';

import { GenerateOfferModal } from '@/app/(main)/admin/jobs/[id]/applications/GenerateOfferModal';
import {
  bookInterviewForApplication,
  listAvailableInterviewSlotsForJob,
  type InterviewSlotRow,
} from '@/app/(main)/admin/interviews/actions';
import {
  loadJobApplicationDetail,
  generateCandidateTrackerLink,
  generateOfferSigningLink,
  addJobApplicationNote,
  sendCandidateOnlyMessage,
  setInterviewJoiningInstructions,
  updateJobApplicationStage,
  upsertJobApplicationScreeningScore,
  type JobApplicationDetail,
} from '@/app/(main)/admin/jobs/[id]/applications/actions';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';
import {
  JOB_APPLICATION_STAGE_ORDER,
  JOB_APPLICATION_STAGES,
  type JobApplicationStage,
  isJobApplicationStage,
} from '@campsite/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

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
  screening_overall_avg: number | null;
  screening_scorer_count: number;
};

type StageDialogState = {
  applicationId: string;
  toStage: JobApplicationStage;
};

type TrackerView = 'all' | 'active' | 'rejected' | 'offer' | 'hired';
type QuickActionId =
  | 'applied'
  | 'draft_interview'
  | 'interview'
  | 'draft_reject'
  | 'reject'
  | 'draft_offer'
  | 'offer';

const QUICK_ACTION_OPTIONS: Array<{
  id: QuickActionId;
  label: string;
  stage: JobApplicationStage;
  draft: boolean;
}> = [
  { id: 'applied', label: 'Applied', stage: 'applied', draft: false },
  { id: 'draft_interview', label: 'Draft Interview', stage: 'shortlisted', draft: true },
  { id: 'interview', label: 'Interview', stage: 'interview_scheduled', draft: false },
  { id: 'draft_reject', label: 'Draft Reject', stage: 'assessed', draft: true },
  { id: 'reject', label: 'Reject', stage: 'rejected', draft: false },
  { id: 'draft_offer', label: 'Draft Offer', stage: 'offer_approved', draft: true },
  { id: 'offer', label: 'Offer', stage: 'offer_sent', draft: false },
];

function stageBadgeClass(stage: JobApplicationStage): string {
  switch (stage) {
    case 'applied':
      return 'bg-[#f3f4f6] text-[#4b5563]';
    case 'screened':
      return 'bg-[#e0f2fe] text-[#0369a1]';
    case 'assessed':
      return 'bg-[#ede9fe] text-[#6d28d9]';
    case 'shortlisted':
      return 'bg-[#d1fae5] text-[#065f46]';
    case 'interview_scheduled':
      return 'bg-[#dbeafe] text-[#1d4ed8]';
    case 'checks_cleared':
      return 'bg-[#dcfce7] text-[#166534]';
    case 'offer_approved':
    case 'offer_sent':
      return 'bg-[#fef3c7] text-[#92400e]';
    case 'hired':
      return 'bg-[#dcfce7] text-[#166534]';
    case 'rejected':
      return 'bg-[#fee2e2] text-[#991b1b]';
    default:
      return 'bg-[#f3f4f6] text-[#4b5563]';
  }
}

function formatStableShortDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

function parseBulkCommandToStage(command: string): JobApplicationStage | null {
  const c = command.toLowerCase();
  if (c.includes('draft interview')) return 'shortlisted';
  if (c.includes('offer approved')) return 'offer_approved';
  if (c.includes('draft offer')) return 'offer_approved';
  if (c.includes('offer sent') || c.includes('make offer')) return 'offer_sent';
  if (c.includes('checks cleared') || c.includes('clear checks')) return 'checks_cleared';
  if (c.includes('shortlist')) return 'shortlisted';
  if (c.includes('draft reject')) return 'assessed';
  if (c.includes('reject')) return 'rejected';
  if (c.includes('hire')) return 'hired';
  if (c.includes('screen')) return 'screened';
  if (c.includes('assess')) return 'assessed';
  if (c.includes('applied')) return 'applied';
  if (c.includes('interview')) return 'interview_scheduled';
  return null;
}

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
  canScoreScreening,
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
  canScoreScreening: boolean;
}) {
  const router = useRouter();
  const [applications, setApplications] = useState(initialApplications);
  useEffect(() => {
    setApplications(initialApplications);
  }, [initialApplications]);

  const [sortBy, setSortBy] = useState<'submitted_at' | 'screening_avg'>('submitted_at');
  const [trackerView, setTrackerView] = useState<TrackerView>('all');
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [bulkActionId, setBulkActionId] = useState<QuickActionId>('draft_interview');
  const [commandText, setCommandText] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const sortedApplications = useMemo(() => {
    const list = [...applications];
    if (sortBy === 'screening_avg') {
      list.sort((a, b) => {
        const as = a.screening_overall_avg;
        const bs = b.screening_overall_avg;
        if (as == null && bs == null) {
          return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
        }
        if (as == null) return 1;
        if (bs == null) return -1;
        if (bs !== as) return bs - as;
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      });
    }
    return list;
  }, [applications, sortBy]);

  const byStage = useMemo(() => {
    const m = new Map<JobApplicationStage, PipelineApplicationRow[]>();
    for (const s of JOB_APPLICATION_STAGE_ORDER) m.set(s, []);
    for (const app of sortedApplications) {
      const st = isJobApplicationStage(app.stage) ? app.stage : 'applied';
      m.get(st)?.push(app);
    }
    return m;
  }, [sortedApplications]);
  const totalApplications = applications.length;

  const applicantNumberById = useMemo(() => {
    const byAppliedAt = [...applications]
      .filter((a) => Boolean(a.submitted_at))
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    const map = new Map<string, number>();
    byAppliedAt.forEach((app, idx) => map.set(app.id, idx + 1));
    return map;
  }, [applications]);

  const applicationIdByApplicantNumber = useMemo(() => {
    const map = new Map<number, string>();
    applicantNumberById.forEach((num, id) => map.set(num, id));
    return map;
  }, [applicantNumberById]);

  const visibleApplications = useMemo(() => {
    if (trackerView === 'all') return sortedApplications;
    if (trackerView === 'active') {
      return sortedApplications.filter((a) => a.stage !== 'rejected' && a.stage !== 'hired');
    }
    if (trackerView === 'rejected') {
      return sortedApplications.filter((a) => a.stage === 'rejected');
    }
    if (trackerView === 'offer') {
      return sortedApplications.filter((a) => a.stage === 'offer_approved' || a.stage === 'offer_sent');
    }
    return sortedApplications.filter((a) => a.stage === 'hired');
  }, [sortedApplications, trackerView]);

  useEffect(() => {
    setSelectedApplicationIds((prev) => prev.filter((id) => visibleApplications.some((app) => app.id === id)));
  }, [visibleApplications]);

  const [stageDialog, setStageDialog] = useState<StageDialogState | null>(null);
  const [notify, setNotify] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [interviewSlots, setInterviewSlots] = useState<InterviewSlotRow[]>([]);
  const [interviewSlotId, setInterviewSlotId] = useState('');
  const [interviewJoining, setInterviewJoining] = useState('');
  const [pending, startTransition] = useTransition();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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
      setDetailError(null);
      setDetailLoading(true);
      startDetailTransition(async () => {
        const res = await loadJobApplicationDetail(id, jobListingId);
        if ('error' in res) {
          setDetailError(res.error || 'Could not load detail.');
          setDetail(null);
          setDetailLoading(false);
          return;
        }
        setDetail(res);
        setJoiningDraft(res.application.interview_joining_instructions ?? '');
        setDetailLoading(false);
      });
    },
    [jobListingId]
  );

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
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
  const quickActionForStage = useCallback((stage: string): QuickActionId => {
    if (stage === 'interview_scheduled') return 'interview';
    if (stage === 'shortlisted') return 'draft_interview';
    if (stage === 'assessed') return 'draft_reject';
    if (stage === 'rejected') return 'reject';
    if (stage === 'offer_approved') return 'draft_offer';
    if (stage === 'offer_sent') return 'offer';
    return 'applied';
  }, []);

  const executeBulkStageChange = useCallback(
    (targetIds: string[], targetStage: JobApplicationStage, notifyCandidate: boolean) => {
      if (!canMoveStage) {
        setBulkFeedback('You do not have permission to move application stages.');
        return;
      }
      if (!targetIds.length) {
        setBulkFeedback('Select at least one applicant.');
        return;
      }
      if (targetStage === 'interview_scheduled') {
        setBulkFeedback('Interview scheduling requires slot selection per applicant. Use individual stage change.');
        return;
      }
      startTransition(async () => {
        for (const id of targetIds) {
          const res = await updateJobApplicationStage(id, targetStage, {
            notifyCandidate,
            messageBody: notifyCandidate
              ? `Your application status has been updated to ${jobApplicationStageLabel(targetStage)}.`
              : '',
            jobListingId,
          });
          if (!res.ok) {
            setBulkFeedback(res.error);
            return;
          }
        }
        setBulkFeedback(
          `Updated ${targetIds.length} applicant${targetIds.length === 1 ? '' : 's'} to ${jobApplicationStageLabel(targetStage)}.`
        );
        setSelectedApplicationIds([]);
        setCommandText('');
        router.refresh();
      });
    },
    [canMoveStage, jobListingId, router]
  );

  const applyQuickAction = useCallback(
    (targetIds: string[], actionId: QuickActionId) => {
      const action = QUICK_ACTION_OPTIONS.find((a) => a.id === actionId);
      if (!action) {
        setBulkFeedback('Invalid action selected.');
        return;
      }
      executeBulkStageChange(targetIds, action.stage, !action.draft);
    },
    [executeBulkStageChange]
  );

  const runCommand = useCallback(() => {
    const command = commandText.trim();
    if (!command) {
      setBulkFeedback('Enter a command first.');
      return;
    }
    const targetStage = parseBulkCommandToStage(command);
    if (!targetStage) {
      setBulkFeedback('Could not detect an action. Try: "shortlist application numbers 1, 4, 6".');
      return;
    }
    const numberMatches = command.match(/\d+/g) ?? [];
    const numbers = [...new Set(numberMatches.map((n) => Number.parseInt(n, 10)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!numbers.length) {
      setBulkFeedback('No applicant numbers found in command.');
      return;
    }
    const invalidNumbers = numbers.filter((n) => !applicationIdByApplicantNumber.has(n));
    if (invalidNumbers.length) {
      setBulkFeedback(`Invalid applicant number(s): ${invalidNumbers.join(', ')}.`);
      return;
    }
    const targetIds = numbers.map((n) => applicationIdByApplicantNumber.get(n)).filter((v): v is string => Boolean(v));
    const isDraftAction = command.toLowerCase().includes('draft ');
    executeBulkStageChange(targetIds, targetStage, !isDraftAction);
  }, [applicationIdByApplicantNumber, commandText, executeBulkStageChange]);

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
          <label className="inline-flex items-center gap-1.5 rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'submitted_at' | 'screening_avg')}
              className="border-0 bg-transparent text-[12px] text-[#121212] outline-none"
            >
              <option value="submitted_at">Newest first</option>
              <option value="screening_avg">Application question average</option>
            </select>
          </label>
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

      {totalApplications > 0 ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#d8d8d8] bg-white p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#7a7a7a]">Quick actions</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#d8d8d8] bg-[#faf9f6] px-2.5 py-1 text-[12px] text-[#505050]">
                Selected: {selectedApplicationIds.length}
              </span>
              <select
                value={bulkActionId}
                onChange={(e) => setBulkActionId(e.target.value as QuickActionId)}
                className="h-8 rounded-lg border border-[#d8d8d8] bg-white px-2.5 text-[12px] text-[#121212]"
              >
                {QUICK_ACTION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => applyQuickAction(selectedApplicationIds, bulkActionId)}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-[#121212] px-3 text-[12px] font-medium text-white disabled:opacity-60"
                disabled={pending || selectedApplicationIds.length === 0}
              >
                Apply to selected
              </button>
            </div>
            <div className="mt-3">
              <label className="text-[12px] font-medium text-[#505050]">Command action</label>
              <textarea
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                rows={1}
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[12px] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                placeholder="Example: shortlist application numbers 1, 4, 6"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={runCommand}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-[#d8d8d8] bg-[#f5f4f1] px-3 text-[12px] font-medium text-[#121212] hover:bg-[#ecebe8]"
                  disabled={pending}
                >
                  Run command
                </button>
                <span className="text-[11px] text-[#6b6b6b]">
                  Uses applicant numbers. Invalid numbers or unsupported actions are rejected.
                </span>
              </div>
            </div>
            {bulkFeedback ? (
              <p className="mt-2 rounded-md border border-[#e5e7eb] bg-[#fafafa] px-2.5 py-2 text-[12px] text-[#4b5563]">
                {bulkFeedback}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-1">
            {([
              ['all', `All applications (${totalApplications})`],
              ['active', `Active applications (${applications.filter((a) => a.stage !== 'rejected' && a.stage !== 'hired').length})`],
              ['rejected', `Rejected (${applications.filter((a) => a.stage === 'rejected').length})`],
              ['offer', `Under offer (${applications.filter((a) => a.stage === 'offer_approved' || a.stage === 'offer_sent').length})`],
              ['hired', `Hired (${applications.filter((a) => a.stage === 'hired').length})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTrackerView(key)}
                className={[
                  'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
                  trackerView === key ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-[#ececec] bg-[#f7fbf8] text-[11px] font-semibold uppercase tracking-wide text-[#6a6a6a]">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={visibleApplications.length > 0 && visibleApplications.every((a) => selectedApplicationIds.includes(a.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedApplicationIds((prev) => [
                            ...new Set([...prev, ...visibleApplications.map((a) => a.id)]),
                          ]);
                        } else {
                          setSelectedApplicationIds((prev) =>
                            prev.filter((id) => !visibleApplications.some((a) => a.id === id))
                          );
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Actions</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {visibleApplications.map((app) => {
                  const stage = isJobApplicationStage(app.stage) ? app.stage : 'applied';
                  return (
                    <tr key={app.id} className="align-top transition-colors hover:bg-[#faf9f6]">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedApplicationIds.includes(app.id)}
                          onChange={(e) =>
                            setSelectedApplicationIds((prev) =>
                              e.target.checked ? [...new Set([...prev, app.id])] : prev.filter((id) => id !== app.id)
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#121212]">
                          {app.candidate_name}{' '}
                          <span className="text-[#6b6b6b]">({applicantNumberById.get(app.id) ? String(applicantNumberById.get(app.id)).padStart(4, '0') : 'Draft'})</span>
                        </p>
                        <p className="text-[12px] text-[#6b6b6b]">{app.candidate_email}</p>
                        {app.screening_overall_avg != null ? (
                          <p className="mt-1 text-[11px] text-[#0f766e]">
                            App Q avg {app.screening_overall_avg.toFixed(1)}
                            {app.screening_scorer_count > 0 ? ` · ${app.screening_scorer_count} scorer(s)` : null}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${stageBadgeClass(stage)}`}>
                          {jobApplicationStageLabel(stage)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#505050]">
                        {app.submitted_at ? formatStableShortDate(app.submitted_at) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openDetail(app.id)}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-[#d8d8d8] bg-[#f0f7f2] px-3 text-[12px] font-medium text-[#285943] transition-colors hover:bg-[#e6f1ea]"
                        >
                          View application
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="h-8 min-w-[11rem] rounded-md border border-[#d8d8d8] bg-white px-2 text-[12px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                          value={quickActionForStage(app.stage)}
                          disabled={!canMoveStage}
                          onChange={(e) => {
                            const nextAction = QUICK_ACTION_OPTIONS.find((opt) => opt.id === e.target.value);
                            if (!nextAction) return;
                            if (nextAction.stage !== app.stage || nextAction.id !== quickActionForStage(app.stage)) {
                              applyQuickAction([app.id], nextAction.id);
                            }
                          }}
                        >
                          {QUICK_ACTION_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4">
          <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-6 py-4">
              <h2 className="text-[15px] font-semibold text-[#121212]">Application</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[13px] text-[#6b6b6b] hover:bg-[#f5f5f5]"
                onClick={closeDetail}
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!detail ? (
                <p className="text-[13px] text-[#6b6b6b]">
                  {detailLoading || detailBusy ? 'Loading…' : detailError ?? 'Could not load detail.'}
                </p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                  <section className="space-y-6">
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

                    {detail.screening_answers.length > 0 ? (
                      <section className="rounded-lg border border-[#d1fae5] bg-[#f6fdfb] p-3">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#0f766e]">
                          Application question answers
                        </h3>
                        <p className="mt-1 text-[12px] text-[#505050]">
                          Score each answer (1–5). Team average updates as more reviewers score.
                        </p>
                        <div className="mt-3 space-y-4">
                          {detail.screening_answers.map((ans) => (
                            <div key={ans.id} className="rounded-md border border-[#e5e7eb] bg-white p-3">
                              <p className="text-[12px] font-medium text-[#121212]">{ans.prompt_snapshot}</p>
                              <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#303030]">{ans.display_value}</p>
                              <p className="mt-2 text-[11px] text-[#6b6b6b]">
                                Team avg:{' '}
                                {ans.team_avg == null ? '—' : ans.team_avg.toFixed(2)} · Your score:{' '}
                                {ans.my_score ?? '—'}
                              </p>
                              {canScoreScreening ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      disabled={detailBusy}
                                      onClick={() => {
                                        startDetailTransition(async () => {
                                          const res = await upsertJobApplicationScreeningScore(
                                            ans.id,
                                            n,
                                            jobListingId
                                          );
                                          if (!res.ok) {
                                            alert(res.error);
                                            return;
                                          }
                                          openDetail(detail.application.id);
                                        });
                                      }}
                                      className={[
                                        'h-8 min-w-[2rem] rounded-md border px-2 text-[12px] font-medium',
                                        ans.my_score === n
                                          ? 'border-[#0f766e] bg-[#0f766e] text-white'
                                          : 'border-[#d8d8d8] bg-[#fafafa] text-[#121212] hover:border-[#0f766e]',
                                      ].join(' ')}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-[11px] text-[#9b9b9b]">
                                  You do not have permission to score application question answers.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </section>

                  <section className="space-y-6">

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
                          <p className="text-[11px] text-[#6b6b6b]">Candidate signing link:</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                              onClick={() => {
                                startDetailTransition(async () => {
                                  const res = await generateOfferSigningLink(detail.latest_offer!.id);
                                  if (!res.ok) {
                                    alert(res.error);
                                    return;
                                  }
                                  const absolute = `${window.location.origin}${res.url}`;
                                  void navigator.clipboard.writeText(absolute);
                                  alert('Fresh signing link copied.');
                                });
                              }}
                            >
                              Generate & copy
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
                            const row = applications.find((a) => a.id === detail.application.id);
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
                              screening_overall_avg: row?.screening_overall_avg ?? null,
                              screening_scorer_count: row?.screening_scorer_count ?? 0,
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
                    <button
                      type="button"
                      className="mt-2 text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                      onClick={() => {
                        startDetailTransition(async () => {
                          const res = await generateCandidateTrackerLink(detail.application.id);
                          if (!res.ok) {
                            alert(res.error);
                            return;
                          }
                          const absolute = `${window.location.origin}${res.url}`;
                          void navigator.clipboard.writeText(absolute);
                          alert('Fresh tracker link copied.');
                        });
                      }}
                    >
                      Generate & copy tracker link
                    </button>
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

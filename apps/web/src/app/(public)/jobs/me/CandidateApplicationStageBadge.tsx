import { jobApplicationStageLabel } from '@/lib/jobs/labels';

const BADGE: Record<string, string> = {
  applied: 'bg-[#f4f4f4] text-[#3a3a3a] ring-1 ring-[#e0e0e0]',
  shortlisted: 'bg-[#eff6ff] text-[#1e40af] ring-1 ring-[#bfdbfe]',
  interview_scheduled: 'bg-[#f5f3ff] text-[#5b21b6] ring-1 ring-[#ddd6fe]',
  offer_sent: 'bg-[#fffbeb] text-[#b45309] ring-1 ring-[#fde68a]',
  hired: 'bg-[#ecfdf5] text-[#047857] ring-1 ring-[#a7f3d0]',
  rejected: 'bg-[#fef2f2] text-[#b91c1c] ring-1 ring-[#fecaca]',
};

export function CandidateApplicationStageBadge({ stage }: { stage: string }) {
  const cls = BADGE[stage] ?? 'bg-[#f4f4f4] text-[#3a3a3a] ring-1 ring-[#e0e0e0]';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {jobApplicationStageLabel(stage)}
    </span>
  );
}

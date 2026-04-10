import { candidateStageTimeline } from '@/lib/jobs/applicationStageTimeline';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';

export function ApplicationStageTimeline({ stage }: { stage: string }) {
  const t = candidateStageTimeline(stage);
  if (t.kind === 'rejected') {
    return (
      <div className="rounded-lg border border-[#fecaca] bg-[#fffafa] p-4">
        <p className="text-[13px] font-medium text-[#b91c1c]">Application not successful</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6b6b6b]">
          Thank you for your interest. We will not be moving forward with your application at this time.
        </p>
      </div>
    );
  }
  if (t.kind === 'unknown') {
    return <p className="text-[13px] text-[#505050]">Status: {jobApplicationStageLabel(t.stage)}</p>;
  }
  return (
    <ol className="space-y-0">
      {t.stages.map((s, i) => {
        const done = i < t.currentIndex;
        const cur = i === t.currentIndex;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                  done
                    ? 'bg-[#121212] text-[#faf9f6]'
                    : cur
                      ? 'bg-[#121212] text-[#faf9f6] ring-2 ring-[#121212]/25 ring-offset-2 ring-offset-white'
                      : 'bg-[#e8e8e8] text-[#9b9b9b]'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              {i < t.stages.length - 1 ? (
                <span className="my-0.5 block min-h-[18px] w-px grow bg-[#dcdcdc]" aria-hidden />
              ) : null}
            </div>
            <div className={`pb-5 pt-0.5 ${i === t.stages.length - 1 ? 'pb-0' : ''}`}>
              <p className={`text-[14px] ${cur ? 'font-semibold text-[#121212]' : 'text-[#505050]'}`}>
                {jobApplicationStageLabel(s)}
              </p>
              {cur ? <p className="mt-0.5 text-[12px] font-medium text-[#6b6b6b]">Current stage</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

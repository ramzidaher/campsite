'use client';

import { rotaGuideSections, rotaPageSubtitle, type RotaGuideSection } from '@/lib/rota/rotaRoleGuide';
import type { ProfileRole } from '@campsite/types';
import { useId, useState } from 'react';

export function RotaHowItWorksSubtitle({ role }: { role: ProfileRole }) {
  return (
    <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[#5c5c5c]">{rotaPageSubtitle(role)}</p>
  );
}

function SectionBlock({ section }: { section: RotaGuideSection }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[13px] font-semibold text-[#121212]">{section.heading}</h3>
      <ul className="list-inside list-disc space-y-1.5 text-[13px] leading-relaxed text-[#5c5c5c]">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Expandable help - role-specific copy so CSA vs org admin vs duty manager is obvious.
 */
export function RotaHowItWorksPanel({ role }: { role: ProfileRole }) {
  const [open, setOpen] = useState(false);
  const sections = rotaGuideSections(role);
  const panelId = useId();

  return (
    <div className="mb-6 rounded-2xl border border-[#e8e6e0] bg-[#faf9f6] px-4 py-3 sm:px-5 sm:py-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[14px] font-semibold text-[#121212]">How rota works for you</span>
        <span className="shrink-0 text-[12px] font-medium text-[#6b6b6b]" aria-hidden>
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="mt-4 space-y-5 border-t border-[#e4e2dc] pt-4">
          {sections.map((s) => (
            <SectionBlock key={s.heading} section={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

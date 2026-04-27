'use client';

import { useState } from 'react';

const PILLARS = [
  {
    title: 'COMMUNICATIONS',
    kicker: 'Broadcasts',
    body: 'Share company updates with clear ownership, audience targeting, and visibility on what has been read.',
  },
  {
    title: 'SCHEDULING',
    kicker: 'Rota & Attendance',
    body: 'Keep shifts, attendance, and leave aligned so managers can plan confidently without spreadsheet chaos.',
  },
  {
    title: 'RECRUITMENT',
    kicker: 'Hiring Flow',
    body: 'Move from applicants to interviews to offers in one connected workflow that everyone can follow.',
  },
  {
    title: 'PEOPLE OPS',
    kicker: 'Records & Reviews',
    body: 'Run day-to-day people operations in one place with consistent data, context, and accountability.',
  },
  {
    title: 'PERFORMANCE',
    kicker: 'Cycle Management',
    body: 'Track review cycles, actions, and follow-ups so growth conversations do not get lost over time.',
  },
];

export function StatementSection() {
  const [activeIndex, setActiveIndex] = useState(2);

  return (
    <section id="statement" className="px-4 py-16 md:px-8 md:py-20">
      <h2 className="lp-sr-only">How Campsite works</h2>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div className="space-y-1" role="tablist" aria-label="Campsite pillars">
          {PILLARS.map((item, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={item.title}
                type="button"
                role="tab"
                aria-selected={active}
                aria-pressed={active}
                aria-controls={`pillar-panel-${index}`}
                id={`pillar-tab-${index}`}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                className="font-grot block min-h-11 w-full text-left text-[clamp(2.4rem,9vw,8rem)] leading-[0.9] transition-colors"
                style={{
                  color: active ? 'var(--lp-foreground)' : 'color-mix(in srgb, var(--lp-foreground) 20%, var(--lp-background))',
                }}
              >
                {item.title}
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center lg:justify-start"
          role="tabpanel"
          id={`pillar-panel-${activeIndex}`}
          aria-labelledby={`pillar-tab-${activeIndex}`}
        >
          <div className="max-w-md">
            <p className="font-mono mb-3 text-xs tracking-wider text-[color:var(--lp-text-muted)]">
              {PILLARS[activeIndex]?.kicker}
            </p>
            <p className="text-[22px] leading-[1.35] text-[color:var(--lp-text-secondary)]">
              {PILLARS[activeIndex]?.body}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

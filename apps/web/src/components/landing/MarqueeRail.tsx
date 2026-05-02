'use client';

import { useEffect, useRef } from 'react';
import { createAnimatable } from 'animejs';

const WORDS = [
  'COMMUNICATIONS', '/', 'SCHEDULING', '/', 'RECRUITMENT', '/',
  'PEOPLE OPS', '/', 'PERFORMANCE', '/', 'SHIFT PLANNING', '/',
  'HR RECORDS', '/', 'ANNOUNCEMENTS', '/', 'ROTAS', '/',
];

// Repeat enough times that the rail never empties regardless of scroll depth
const RAIL_A = Array(5).fill(WORDS).flat();
const RAIL_B = Array(5).fill(WORDS).flat();

export function MarqueeRail() {
  const railARef = useRef<HTMLDivElement>(null);
  const railBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const elA = railARef.current;
    const elB = railBRef.current;
    if (!elA || !elB) return;

    // createAnimatable keeps a live interpolated target — calling the setter
    // mid-flight re-targets from the current position, giving natural deceleration.
    const aA = createAnimatable(elA, {
      translateX: { duration: 700, ease: 'outExpo' },
    });
    const aB = createAnimatable(elB, {
      translateX: { duration: 700, ease: 'outExpo' },
    });

    let xA = 0;
    let xB = -160; // stagger the two rails so they don't feel mirrored
    let lastScrollY = window.scrollY;

    const onScroll = () => {
      const delta = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      xA += -delta * 0.45; // left row drifts left on scroll down
      xB += delta * 0.45;  // right row drifts right on scroll down
      aA.translateX(xA);
      aB.translateX(xB);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      aA.revert();
      aB.revert();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden border-y border-[color:var(--lp-border)] py-4 select-none"
    >
      <div
        ref={railARef}
        className="will-change-transform mb-2.5 whitespace-nowrap"
      >
        {RAIL_A.map((word, i) => (
          <span
            key={i}
            className="font-mono mr-5 inline-block text-[11px] tracking-[0.12em] text-[color:var(--lp-text-muted)]"
          >
            {word}
          </span>
        ))}
      </div>
      <div
        ref={railBRef}
        className="will-change-transform whitespace-nowrap"
        style={{ transform: 'translateX(-160px)' }}
      >
        {RAIL_B.map((word, i) => (
          <span
            key={i}
            className="font-mono mr-5 inline-block text-[11px] tracking-[0.12em] opacity-40 text-[color:var(--lp-foreground)]"
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

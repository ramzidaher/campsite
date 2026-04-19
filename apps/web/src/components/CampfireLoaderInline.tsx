'use client';

import { useId } from 'react';

/**
 * Same campfire + dots as {@link AppLoader}, sized for modals and panels.
 * Gradient IDs are scoped with `useId()` so multiple instances on one page are safe.
 */
export function CampfireLoaderInline({
  label = 'Loading…',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const g = {
    glow: `cf-glow-${uid}`,
    fc: `cf-flame-c-${uid}`,
    fs: `cf-flame-s-${uid}`,
    fi: `cf-flame-inner-${uid}`,
  };

  return (
    <div
      className={`campsite-loader-wrap flex flex-col items-center justify-center gap-5 py-8 ${className}`}
      aria-busy
      aria-label={label}
    >
      <svg
        width={88}
        height={108}
        viewBox="0 0 80 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden
      >
        <defs>
          <radialGradient id={g.glow} cx="50%" cy="85%" r="55%">
            <stop offset="0%" stopColor="#FF8C28" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#FF8C28" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={g.fc} x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#FFCC30" />
            <stop offset="45%" stopColor="#FF7A1A" />
            <stop offset="100%" stopColor="#E84020" />
          </linearGradient>
          <linearGradient id={g.fs} x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#FF9030" />
            <stop offset="100%" stopColor="#CC3A10" />
          </linearGradient>
          <linearGradient id={g.fi} x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#FFF0A0" />
            <stop offset="100%" stopColor="#FFD040" />
          </linearGradient>
        </defs>
        <ellipse cx="40" cy="76" rx="34" ry="18" fill={`url(#${g.glow})`} />
        <rect x="10" y="72" width="60" height="7" rx="3.5" transform="rotate(-18 40 75.5)" fill="#A07048" />
        <rect x="10" y="72" width="60" height="7" rx="3.5" transform="rotate(18 40 75.5)" fill="#8B5E38" />
        <path
          className="campsite-flame-l"
          d="M33,72 C22,64 19,52 25,39 C27,33 35,35 35,43 C37,54 35,64 33,72 Z"
          fill={`url(#${g.fs})`}
        />
        <path
          className="campsite-flame-r"
          d="M47,72 C58,64 61,52 55,39 C53,33 45,35 45,43 C43,54 45,64 47,72 Z"
          fill={`url(#${g.fs})`}
        />
        <path
          className="campsite-flame-c"
          d="M40,72 C28,62 24,46 30,26 C34,14 46,14 50,26 C56,46 52,62 40,72 Z"
          fill={`url(#${g.fc})`}
        />
        <path
          className="campsite-flame-c"
          d="M40,68 C34,60 32,50 36,38 C38,31 42,31 44,38 C48,50 46,60 40,68 Z"
          fill={`url(#${g.fi})`}
          style={{ animationDelay: '0.1s' }}
        />
        <circle className="campsite-ember-1" cx="36" cy="26" r="1.5" fill="#FF9030" />
        <circle className="campsite-ember-2" cx="44" cy="32" r="1" fill="#FFCC30" />
        <circle className="campsite-ember-3" cx="40" cy="22" r="1.2" fill="#FF7A1A" />
      </svg>
      <span className="flex items-center gap-2" aria-hidden>
        <span className="campsite-loader-dot h-2 w-2 rounded-full bg-[#FFAA40]" style={{ opacity: 0.6 }} />
        <span className="campsite-loader-dot h-2 w-2 rounded-full bg-[#FF8C28]" style={{ opacity: 0.7 }} />
        <span className="campsite-loader-dot h-2 w-2 rounded-full bg-[#FFAA40]" style={{ opacity: 0.6 }} />
      </span>
      <p className="text-center text-[12.5px] text-[#6b6b6b]">{label}</p>
    </div>
  );
}

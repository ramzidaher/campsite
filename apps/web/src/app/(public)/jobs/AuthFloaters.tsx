'use client';

import { useEffect, useState } from 'react';

type Dot = { size: number; left: number; duration: number; delay: number; secondary: boolean };

export function AuthFloaters() {
  const [dots, setDots] = useState<Dot[]>([]);

  useEffect(() => {
    setDots(
      Array.from({ length: 12 }, (_, i) => ({
        size: 4 + Math.random() * 9,
        left: Math.random() * 100,
        duration: 9 + Math.random() * 14,
        delay: -(Math.random() * 18),
        secondary: i % 3 === 2,
      })),
    );
  }, []);

  if (!dots.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <style>{`
        @keyframes auth-orb-rise {
          0%   { transform: translateY(110vh) rotate(0deg);   opacity: 0; }
          8%   { opacity: 0.11; }
          88%  { opacity: 0.07; }
          100% { transform: translateY(-40px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {dots.map((d, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            bottom: 0,
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            borderRadius: '50%',
            background: d.secondary
              ? 'color-mix(in oklab, var(--org-brand-primary) 55%, var(--org-brand-secondary, #888))'
              : 'var(--org-brand-primary)',
            animation: `auth-orb-rise ${d.duration}s linear ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

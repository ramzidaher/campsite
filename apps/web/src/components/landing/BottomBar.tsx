'use client';

import { useEffect, useMemo, useState } from 'react';

const TAGLINES = [
  'BY PEOPLE, FOR PEOPLE OPERATIONS.',
  'BUILT BY PEOPLE, FOR PEOPLE TEAMS.',
  'PEOPLE OPS, MADE BY ACTUAL PEOPLE.',
  'FOR PEOPLE TEAMS, BY PEOPLE PEOPLE.',
  'LESS ADMIN. MORE ACTUAL PEOPLE.',
  'HR, BUT MAKE IT HUMAN.',
  'KEEP THE HUMANS. DROP THE CHAOS.',
  'PEOPLE STUFF, WITHOUT THE STUFFINESS.',
  'BY PEOPLE. FOR PEOPLE. ZERO NONSENSE.',
  'YOUR TEAM RUNS ON PEOPLE, NOT SPREADSHEETS.',
  'MADE FOR PEOPLE WHO MANAGE PEOPLE.',
  'WE PUT THE "HUMAN" BACK IN HR.',
];

function Clock() {
  const [time, setTime] = useState('');
  const location = 'LONDON, UK';

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/London',
      });
      setTime(timeStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return <div className="font-mono">{location} {time}</div>;
}

function BottomLeftTagline() {
  const index = useMemo(() => {
    const daySeed = new Date().getUTCDate();
    return daySeed % TAGLINES.length;
  }, []);

  return <p className="font-mono">{TAGLINES[index]}</p>;
}

export function BottomBar() {
  useEffect(() => {
    document.body.classList.remove('dark');
    try {
      window.localStorage.removeItem('campsite_landing_theme');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="v5-bottom-bar">
      <BottomLeftTagline />
      <div className="v5-bottom-right">
        <Clock />
      </div>
    </div>
  );
}

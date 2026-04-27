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

function ThemeToggle() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.body;
    const saved = window.localStorage.getItem('campsite_landing_theme');
    const nextMode = saved === 'dark' || saved === 'light'
      ? saved
      : root.classList.contains('dark')
        ? 'dark'
        : 'light';

    root.classList.toggle('dark', nextMode === 'dark');
    setMode(nextMode);
  }, []);

  const toggleMode = () => {
    const root = document.body;
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    root.classList.toggle('dark', nextMode === 'dark');
    window.localStorage.setItem('campsite_landing_theme', nextMode);
    setMode(nextMode);
  };

  return (
    <button
      type="button"
      onClick={toggleMode}
      data-mode={mode}
      className="font-mono v5-theme-toggle"
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="lp-sr-only">
        {mode === 'dark' ? 'Dark mode active. Switch to light mode.' : 'Light mode active. Switch to dark mode.'}
      </span>
      <span className="v5-theme-toggle-thumb" aria-hidden="true" />
    </button>
  );
}

function BottomLeftTagline() {
  const index = useMemo(() => {
    const daySeed = new Date().getUTCDate();
    return daySeed % TAGLINES.length;
  }, []);

  return <p className="font-mono">{TAGLINES[index]}</p>;
}

export function BottomBar() {
  return (
    <div className="v5-bottom-bar">
      <BottomLeftTagline />
      <div className="v5-bottom-right">
        <Clock />
        <ThemeToggle />
      </div>
    </div>
  );
}

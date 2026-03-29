'use client';

import { type ReactNode } from 'react';

function ToolbarIcon({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-[#121212] transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function BroadcastDetailStyleRail({
  canSetCover,
  coverBusy,
  onUploadClick,
  onOpenBackdropPanel,
}: {
  canSetCover: boolean;
  coverBusy: boolean;
  onUploadClick: () => void;
  onOpenBackdropPanel: () => void;
}) {
  const scrollToTitle = () => {
    document.getElementById('broadcast-detail-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openInfo = () => {
    document.getElementById('broadcast-detail-meta')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <aside
      className="fixed right-3 top-1/2 z-[60] flex -translate-y-1/2 flex-col gap-0.5 rounded-full border border-black/10 bg-[#faf9f6]/75 p-1 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-md md:right-5"
      aria-label="Broadcast page tools"
    >
      <ToolbarIcon
        label={canSetCover ? 'Upload background image' : 'Only editors can change the background'}
        onClick={() => canSetCover && onUploadClick()}
        disabled={!canSetCover || coverBusy}
      >
        <span className="text-lg font-light leading-none">+</span>
      </ToolbarIcon>
      <ToolbarIcon label="Jump to title" onClick={scrollToTitle}>
        <span className="text-[13px] font-semibold tracking-tight">Aa</span>
      </ToolbarIcon>
      <ToolbarIcon
        label={canSetCover ? 'Backdrop and background' : 'Only editors can change the background'}
        onClick={() => canSetCover && onOpenBackdropPanel()}
        disabled={!canSetCover || coverBusy}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#121212]"
          aria-hidden
        >
          <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
          <path d="M9 8c-2.003 2.998-4 6.5-4 9a3 3 0 0 0 3 3c2.5 0 6.002-1.998 9-4" />
        </svg>
      </ToolbarIcon>
      <ToolbarIcon label="Jump to details" onClick={openInfo}>
        <span className="text-sm font-serif italic text-[#121212]">i</span>
      </ToolbarIcon>
    </aside>
  );
}

import React from 'react';

import { campusBorder, campusSurface } from './campusTokens';

export type DataToolbarProps = {
  /** Filters, search, segment controls. */
  start?: React.ReactNode;
  /** Secondary actions or meta. */
  end?: React.ReactNode;
  className?: string;
};

export function DataToolbar({ start, end, className }: DataToolbarProps) {
  if (!start && !end) return null;
  return (
    <div
      className={[
        'mb-5 flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        campusBorder.hairline,
        campusSurface.panel,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{start}</div>
      {end ? <div className="flex shrink-0 flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}

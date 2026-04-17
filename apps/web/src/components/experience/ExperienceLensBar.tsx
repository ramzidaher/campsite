'use client';

/**
 * Segmented control for switching UI “lens” (stream vs timeline vs board, etc.).
 * Parent owns persistence (localStorage / sessionStorage) when needed.
 */
export function ExperienceLensBar<V extends string>({
  value,
  onChange,
  choices,
  ariaLabel,
  className = '',
}: {
  value: V;
  onChange: (next: V) => void;
  choices: { value: V; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-0.5',
        className,
      ].join(' ')}
    >
      {choices.map((c) => {
        const selected = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(c.value)}
            className={[
              'rounded-md px-2.5 py-1 text-[11.5px] font-medium transition',
              selected ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
            ].join(' ')}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared Tailwind class strings for Campsite web data surfaces (hiring, admin tables).
 * Centralises repeated hex tokens so screens stay visually aligned.
 */
export const campusText = {
  ink: 'text-[#121212]',
  muted: 'text-[#6b6b6b]',
  subtle: 'text-[#9b9b9b]',
  tableSecondary: 'text-[#505050]',
  link: 'text-[#008B60]',
} as const;

export const campusBorder = {
  hairline: 'border-[#d8d8d8]',
  row: 'border-[#ececec]',
  divide: 'divide-[#f0f0f0]',
} as const;

export const campusSurface = {
  canvas: 'bg-[#faf9f6]',
  panel: 'bg-white',
  tableHead: 'bg-[#fafafa]',
  /** Light row tint (tables, dense lists). */
  rowHover: 'hover:bg-[#f5f4f1]',
  pill: 'bg-[#f5f4f1]',
  /**
   * Full bordered card / list row hover (resource library file rows, hub tiles, profile shortcuts).
   * Use on the same element as `border`, `rounded-*`, and base `bg-*` / `shadow-*`.
   */
  interactiveSheetRow:
    'transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-[color-mix(in_oklab,var(--org-brand-border,#d8d8d8)_75%,#e0e0e0)] hover:bg-[#eeeeee] hover:shadow-none focus-within:border-[color-mix(in_oklab,var(--org-brand-border,#d8d8d8)_75%,#e0e0e0)] focus-within:bg-[#eeeeee] focus-within:shadow-none',
} as const;

export const campusFocusRing =
  'transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';

export const recruitmentStatusChips: Record<string, string> = {
  pending_review: 'bg-[#fff7ed] text-[#c2410c]',
  approved: 'bg-[#eff6ff] text-[#1d4ed8]',
  in_progress: 'bg-[#faf5ff] text-[#7c3aed]',
  filled: 'bg-[#dcfce7] text-[#166534]',
  rejected: 'bg-[#fef2f2] text-[#b91c1c]',
};

export const recruitmentUrgencyChips: Record<string, string> = {
  high: 'bg-[#fef2f2] text-[#b91c1c]',
  normal: 'bg-[#f5f4f1] text-[#6b6b6b]',
  low: 'bg-[#f0fdf4] text-[#166534]',
};

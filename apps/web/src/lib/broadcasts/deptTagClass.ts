/** Tailwind classes for department pill tags (matches dashboard / HTML mock). */
export function deptTagClass(deptName: string) {
  if (deptName.includes('Events')) return 'bg-[#dcfce7] text-[#15803D] border-[#bbf7d0]';
  if (deptName.includes('Human') || deptName.includes('HR')) return 'bg-[#dbeafe] text-[#1d4ed8] border-[#bfdbfe]';
  if (deptName.includes('Marketing')) return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
  if (deptName.includes('Welfare')) return 'bg-[#f3e8ff] text-[#7c3aed] border-[#e9d5ff]';
  return 'bg-[#f5f4f1] text-[#6b6b6b] border-[#d8d8d8]';
}

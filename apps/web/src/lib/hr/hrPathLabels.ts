/** Human-readable segments for HR workspace breadcrumbs (pathname after `/hr`). */
export function hrBreadcrumbTrail(pathname: string): { href: string; label: string }[] {
  if (!pathname.startsWith('/hr')) return [];
  const rest = pathname.slice('/hr'.length).replace(/^\//, '');
  if (!rest) return [];

  const segments = rest.split('/').filter(Boolean);
  const trail: { href: string; label: string }[] = [];
  let acc = '/hr';

  const labelFor = (seg: string, fullPath: string): string => {
    const map: Record<string, string> = {
      people: 'Employee directory',
      records: 'Employee records',
      hiring: 'Hiring',
      recruitment: 'Hiring requests',
      requests: 'Hiring requests',
      jobs: 'Job listings',
      applications: 'Applicants',
      interviews: 'Interview schedule',
      'offer-templates': 'Offer templates',
      onboarding: 'Onboarding',
      performance: 'Performance reviews',
      'one-on-ones': '1:1 check-ins',
      'absence-reporting': 'Absence reporting',
      'hr-metric-alerts': 'HR metric alerts',
      'org-chart': 'Org chart',
      timesheets: 'Timesheet review',
      wagesheets: 'Wagesheets',
      leave: 'Leave (HR)',
      'attendance-settings': 'Attendance sites',
      templates: 'Offer templates',
    };
    if (map[seg]) return map[seg];
    if (fullPath.startsWith('/hr/people/') && seg.length > 20) return 'Employee file';
    if (fullPath.startsWith('/hr/hiring/requests/') && seg.length > 20) return 'Request detail';
    if (fullPath.startsWith('/hr/recruitment/') && seg.length > 20) return 'Request detail';
    if (fullPath.startsWith('/hr/jobs/')) return seg === 'edit' ? 'Edit job' : seg === 'applications' ? 'Applicants' : 'Job';
    return seg.replace(/-/g, ' ');
  };

  for (let i = 0; i < segments.length; i++) {
    acc += `/${segments[i]}`;
    const label = labelFor(segments[i]!, acc);
    trail.push({ href: acc, label });
  }

  return trail;
}

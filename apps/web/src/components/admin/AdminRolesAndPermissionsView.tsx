import { PROFILE_ROLES, isApproverRole } from '@campsite/types';
import Link from 'next/link';

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Organisation admin',
  manager: 'Manager',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
  duty_manager: 'Duty manager',
  csa: 'CSA',
  society_leader: 'Society leader',
};

const ROLE_BLURB: Record<string, string> = {
  org_admin: 'Full tenant control: members, structure, broadcasts, rota, discounts, and org settings.',
  manager: 'Team oversight, pending approvals, and the manager workspace.',
  coordinator: 'Day-to-day coordination; department-scoped approvals where enabled.',
  administrator: 'Operational staff; broadcasts and rota self-service; no org admin screens.',
  duty_manager: 'Like administrator plus discount QR verification where enabled.',
  csa: 'Frontline staff: rota, broadcasts, discount card.',
  society_leader: 'Leads a society or club slice of the org.',
};

const CAP_ROWS: { area: string; roles: string[] }[] = [
  { area: 'Members & pending approval', roles: ['org_admin'] },
  { area: 'Departments & broadcast categories', roles: ['org_admin'] },
  { area: 'Broadcast admin', roles: ['org_admin'] },
  { area: 'Rota management & Sheets import', roles: ['org_admin'] },
  { area: 'Discount rules & scan activity', roles: ['org_admin'] },
  { area: 'Org settings & integrations', roles: ['org_admin'] },
  { area: 'Pending approvals (non–org-admin)', roles: ['org_admin', 'manager', 'coordinator'] },
];

function roleHasCapability(role: string, row: { roles: string[] }) {
  return row.roles.includes(role);
}

export function AdminRolesAndPermissionsView() {
  const matrixRoles = PROFILE_ROLES.filter((r) => CAP_ROWS.some((row) => row.roles.includes(r)));

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Roles & permissions
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          How roles map to admin and day-to-day features. Assign roles from{' '}
          <Link href="/admin/users" className="font-medium text-[#121212] underline underline-offset-2">
            All members
          </Link>
          .
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {PROFILE_ROLES.map((role) => (
          <div
            key={role}
            className="rounded-xl border border-[#d8d8d8] bg-white p-4 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
              {role.replace(/_/g, ' ')}
            </p>
            <p className="mt-1 font-authSerif text-lg text-[#121212]">{ROLE_LABELS[role] ?? role}</p>
            <p className="mt-2 text-[13px] leading-snug text-[#6b6b6b]">
              {ROLE_BLURB[role] ?? 'Standard profile role.'}
            </p>
            {isApproverRole(role) ? (
              <p className="mt-2 text-[12px] text-[#9b9b9b]">Can act on pending approvals when enabled.</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mb-3">
        <h2 className="font-authSerif text-lg text-[#121212]">Capability overview</h2>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          High-level map; exact checks may vary by screen. Empty cells mean the role does not use that admin area by
          default.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[#d8d8d8] bg-[#f5f4f1]">
              <th className="px-3 py-2.5 font-semibold text-[#121212]">Area</th>
              {matrixRoles.map((r) => (
                <th key={r} className="px-2 py-2.5 text-center font-semibold text-[#6b6b6b]">
                  {r.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAP_ROWS.map((row) => (
              <tr key={row.area} className="border-b border-[#d8d8d8] last:border-0">
                <td className="px-3 py-2.5 text-[#121212]">{row.area}</td>
                {matrixRoles.map((r) => (
                  <td key={r} className="px-2 py-2.5 text-center text-[#121212]">
                    {roleHasCapability(r, row) ? '✓' : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

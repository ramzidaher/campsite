import {
  canEditRotaShifts,
  canFinalApproveRotaRequests,
  isOrgAdminRole,
  type ProfileRole,
} from '@campsite/types';

/** Short line under the page title - tuned to this user’s role. */
export function rotaPageSubtitle(role: ProfileRole): string {
  const r = role?.trim();
  if (isOrgAdminRole(r)) {
    return 'See the whole organisation’s shifts, build schedules, and run roster admin - or use Requests when you need to change your own assignments.';
  }
  if (r === 'coordinator') {
    return 'Manage department rotas and shifts, or check your own hours - swaps and unassign requests live under Requests.';
  }
  if (r === 'manager') {
    return 'View your shifts and your department’s coverage; add or edit shifts for departments you manage.';
  }
  if (canFinalApproveRotaRequests(r) && !canEditRotaShifts(r)) {
    return 'See your personal schedule and approve swap or coverage requests from staff (you don’t build the master rota here).';
  }
  return 'Your upcoming shifts are on the Schedule tab. Use Requests if you need a swap or to ask to be unassigned from a shift.';
}

export type RotaGuideSection = { heading: string; items: string[] };

/** Sections for the expandable “How rota works” panel. */
export function rotaGuideSections(role: ProfileRole): RotaGuideSection[] {
  const r = role?.trim();

  const basics: RotaGuideSection = {
    heading: 'Words we use',
    items: [
      'A rota is a named schedule (for example “Night team” or “Reception”).',
      'A shift is one block of time on the calendar - linked to a rota when coordinators build coverage, and assigned to a person or left as an open slot.',
    ],
  };

  if (isOrgAdminRole(r)) {
    return [
      basics,
      {
        heading: 'What you can do',
        items: [
          'Schedule → My schedule: only your own shifts. Department / Whole organisation: wider views.',
          'Add shift puts new shifts on the calendar. Roster setup creates rotas, publishes drafts, transfers ownership, and controls who is invited to a rota.',
          'Import Sheets (admins) pulls rows from a linked Google Sheet into shifts.',
          'Requests & swaps: where people ask for swaps or unassigns; managers and duty managers approve org-wide.',
        ],
      },
    ];
  }

  if (r === 'coordinator') {
    return [
      basics,
      {
        heading: 'What you can do',
        items: [
          'You edit department schedules and add shifts; new shifts should be linked to a rota.',
          'Roster setup: create rotas, set draft or published, and invite people who should see that rota.',
          'Requests & swaps: your own change requests, plus anything waiting on you.',
        ],
      },
    ];
  }

  if (r === 'manager') {
    return [
      basics,
      {
        heading: 'What you can do',
        items: [
          'Department shows shifts in departments you manage. If it is empty, you may not be set as a department manager yet - ask an org admin.',
          'You can add and edit shifts in those departments. When you create a new rota, you must pick a department you manage.',
          'Roster setup: new rotas, draft/published, and roster visibility.',
          'You can approve swap and unassign requests from any part of the organisation (same pool as duty managers).',
        ],
      },
    ];
  }

  if (canFinalApproveRotaRequests(r) && !canEditRotaShifts(r)) {
    return [
      basics,
      {
        heading: 'What you can do',
        items: [
          'You do not build or edit the master rota - coordinators, managers, and org admins do that.',
          'Schedule shows your own upcoming shifts.',
          'Requests & swaps is where you approve swaps and unassign requests after any required peer step.',
        ],
      },
    ];
  }

  return [
    basics,
    {
      heading: 'What you can do',
      items: [
        'Schedule → My schedule lists shifts assigned to you (and open slots you are allowed to see).',
        'You cannot edit everyone’s rota from here - use Requests & swaps to propose a swap or ask to be unassigned.',
        'Swaps need the other person to accept, then a manager or duty manager gives final approval.',
      ],
    },
  ];
}

export type CampsiteStatus = 'open' | 'seasonal' | 'closed';

export type Campsite = {
  id: number;
  name: string;
  location: string;
  status: CampsiteStatus;
  members: number;
  bookings: number;
  revenue: number;
  occ: number;
  mgr: string;
  mgr_init: string;
};

export const CAMPSITES: Campsite[] = [
  {
    id: 1,
    name: 'Lakeside Peak',
    location: 'Lake District, Cumbria',
    status: 'open',
    members: 42,
    bookings: 312,
    revenue: 11200,
    occ: 96,
    mgr: 'Sarah A.',
    mgr_init: 'SA',
  },
  {
    id: 2,
    name: 'Birchwood Valley',
    location: 'Brecon Beacons, Wales',
    status: 'open',
    members: 38,
    bookings: 274,
    revenue: 9800,
    occ: 88,
    mgr: 'Tom W.',
    mgr_init: 'TW',
  },
  {
    id: 3,
    name: 'Glenshee Highlands',
    location: 'Cairngorms, Scotland',
    status: 'open',
    members: 35,
    bookings: 291,
    revenue: 10100,
    occ: 92,
    mgr: 'Fiona M.',
    mgr_init: 'FM',
  },
  {
    id: 4,
    name: 'Riverstone Glen',
    location: 'Peak District, Derbyshire',
    status: 'open',
    members: 29,
    bookings: 208,
    revenue: 7600,
    occ: 84,
    mgr: 'Alex J.',
    mgr_init: 'AJ',
  },
  {
    id: 5,
    name: 'Ashdown Forest',
    location: 'East Sussex',
    status: 'open',
    members: 26,
    bookings: 195,
    revenue: 7200,
    occ: 79,
    mgr: 'Priya M.',
    mgr_init: 'PM',
  },
  {
    id: 6,
    name: 'Cliffside Bay',
    location: 'North Devon Coast',
    status: 'open',
    members: 31,
    bookings: 226,
    revenue: 8400,
    occ: 91,
    mgr: 'Matt R.',
    mgr_init: 'MR',
  },
  {
    id: 7,
    name: 'Mossy Stone Creek',
    location: 'Yorkshire Dales',
    status: 'open',
    members: 24,
    bookings: 183,
    revenue: 6800,
    occ: 82,
    mgr: 'Lena K.',
    mgr_init: 'LK',
  },
  {
    id: 8,
    name: 'Heather Moor',
    location: 'Northumberland',
    status: 'seasonal',
    members: 18,
    bookings: 102,
    revenue: 4200,
    occ: 61,
    mgr: 'Jack S.',
    mgr_init: 'JS',
  },
  {
    id: 9,
    name: 'Silverwater Loch',
    location: 'Loch Lomond, Scotland',
    status: 'seasonal',
    members: 22,
    bookings: 144,
    revenue: 5600,
    occ: 73,
    mgr: 'Nina O.',
    mgr_init: 'NO',
  },
  {
    id: 10,
    name: 'Fernwood Glade',
    location: 'New Forest, Hampshire',
    status: 'open',
    members: 28,
    bookings: 217,
    revenue: 8100,
    occ: 87,
    mgr: 'Sam B.',
    mgr_init: 'SB',
  },
  {
    id: 11,
    name: 'Saltmarsh Edge',
    location: 'Norfolk Broads',
    status: 'closed',
    members: 14,
    bookings: 0,
    revenue: 0,
    occ: 0,
    mgr: 'Unassigned',
    mgr_init: '-',
  },
  {
    id: 12,
    name: 'Copperfield Ridge',
    location: 'Exmoor, Somerset',
    status: 'seasonal',
    members: 21,
    bookings: 131,
    revenue: 5100,
    occ: 68,
    mgr: 'Cara T.',
    mgr_init: 'CT',
  },
];

export type GlobalMember = {
  initials: string;
  name: string;
  email: string;
  site: string;
  role: 'admin' | 'mgr' | 'coord' | 'staff';
  status: 'active' | 'pending' | 'inactive';
  joined: string;
};

export const GLOBAL_MEMBERS: GlobalMember[] = [
  {
    initials: 'SA',
    name: 'Sarah Al-Amin',
    email: 'sarah@lakesidepeak.co.uk',
    site: 'Lakeside Peak',
    role: 'admin',
    status: 'active',
    joined: 'Jan 2024',
  },
  {
    initials: 'TW',
    name: 'Tom Wilson',
    email: 't.wilson@birchwood.co.uk',
    site: 'Birchwood Valley',
    role: 'admin',
    status: 'active',
    joined: 'Feb 2024',
  },
  {
    initials: 'AJ',
    name: 'Alex Johnson',
    email: 'a.j@riverstone.co.uk',
    site: 'Riverstone Glen',
    role: 'mgr',
    status: 'active',
    joined: 'Mar 2024',
  },
  {
    initials: 'PM',
    name: 'Priya Mehta',
    email: 'p.mehta@ashdown.co.uk',
    site: 'Ashdown Forest',
    role: 'mgr',
    status: 'active',
    joined: 'Mar 2024',
  },
  {
    initials: 'TO',
    name: 'Tom Okafor',
    email: 't.okafor@lakesidepeak.co.uk',
    site: 'Lakeside Peak',
    role: 'coord',
    status: 'active',
    joined: 'Apr 2024',
  },
  {
    initials: 'LK',
    name: 'Lena Kim',
    email: 'l.kim@mossystone.co.uk',
    site: 'Mossy Stone Creek',
    role: 'mgr',
    status: 'active',
    joined: 'Apr 2024',
  },
  {
    initials: 'SP',
    name: 'Sophie Park',
    email: 's.park@birchwood.co.uk',
    site: 'Birchwood Valley',
    role: 'coord',
    status: 'active',
    joined: 'Jun 2024',
  },
  {
    initials: 'MW',
    name: 'Marcus Webb',
    email: 'm.webb@cliffside.co.uk',
    site: 'Cliffside Bay',
    role: 'staff',
    status: 'active',
    joined: 'Sep 2024',
  },
  {
    initials: 'CJ',
    name: 'Chloe Jensen',
    email: 'c.j@heathermoor.co.uk',
    site: 'Heather Moor',
    role: 'staff',
    status: 'inactive',
    joined: 'Sep 2024',
  },
  {
    initials: 'RN',
    name: 'Ravi Nair',
    email: 'r.nair@fernwood.co.uk',
    site: 'Fernwood Glade',
    role: 'staff',
    status: 'active',
    joined: 'Oct 2024',
  },
  {
    initials: 'KP',
    name: 'Kate Phillips',
    email: 'k.p@glenshee.co.uk',
    site: 'Glenshee Highlands',
    role: 'coord',
    status: 'active',
    joined: 'Nov 2024',
  },
  {
    initials: 'DB',
    name: 'Dan Brown',
    email: 'd.b@fernwood.co.uk',
    site: 'Fernwood Glade',
    role: 'staff',
    status: 'pending',
    joined: 'Mar 2026',
  },
];

export type PendingRow = {
  initials: string;
  name: string;
  email: string;
  site: string;
  role: string;
  time: string;
};

export const PENDING_GLOBAL: PendingRow[] = [
  {
    initials: 'DB',
    name: 'Dan Brown',
    email: 'd.b@fernwood.co.uk',
    site: 'Fernwood Glade',
    role: 'Weekly Paid Staff',
    time: '2 hours ago',
  },
  {
    initials: 'ML',
    name: 'Maya Liu',
    email: 'm.l@lakesidepeak.co.uk',
    site: 'Lakeside Peak',
    role: 'Assistant',
    time: '5 hours ago',
  },
  {
    initials: 'JK',
    name: 'Jake Kowalski',
    email: 'j.k@riverstone.co.uk',
    site: 'Riverstone Glen',
    role: 'Coordinator',
    time: 'Yesterday',
  },
  {
    initials: 'EN',
    name: 'Ellie Nguyen',
    email: 'e.n@cliffside.co.uk',
    site: 'Cliffside Bay',
    role: 'Weekly Paid Staff',
    time: 'Yesterday',
  },
  {
    initials: 'RL',
    name: 'Raj Lakhani',
    email: 'r.l@birchwood.co.uk',
    site: 'Birchwood Valley',
    role: 'Assistant',
    time: '2 days ago',
  },
];

export type RotaRow = {
  name: string;
  site?: string;
  date: string;
  time: string;
  role: string;
};

export const ROTA_GLOBAL: RotaRow[] = [
  { name: 'Alex Johnson', site: 'Riverstone Glen', date: 'Mon 24 Mar', time: '09:00-13:00', role: 'Events Desk' },
  { name: 'Marcus Webb', site: 'Cliffside Bay', date: 'Mon 24 Mar', time: '14:00-18:00', role: 'Front Desk' },
  { name: 'Tom Okafor', site: 'Lakeside Peak', date: 'Tue 25 Mar', time: '10:00-14:00', role: 'Events Desk' },
  { name: 'Lena Kim', site: 'Mossy Stone Creek', date: 'Wed 26 Mar', time: '09:00-17:00', role: 'Campaign Lead' },
  { name: 'Sophie Park', site: 'Birchwood Valley', date: 'Wed 26 Mar', time: '15:00-19:00', role: 'Events Desk' },
  { name: 'Priya Mehta', site: 'Ashdown Forest', date: 'Thu 27 Mar', time: '10:00-16:00', role: 'Drop-in Coord.' },
  { name: 'Kate Phillips', site: 'Glenshee Highlands', date: 'Thu 27 Mar', time: '09:00-13:00', role: 'Reception' },
  { name: 'Marcus Webb', site: 'Cliffside Bay', date: 'Fri 28 Mar', time: '14:00-18:00', role: 'Front Desk' },
];

export type BroadcastRow = {
  icon: string;
  title: string;
  by: string;
  sent: string;
  reach: string;
};

export function getBroadcasts(founderDisplayName: string): BroadcastRow[] {
  return [
    {
      icon: '📡',
      title: 'Spring Opening - All Sites',
      by: `${founderDisplayName} (Founder)`,
      sent: '2 hours ago',
      reach: 'All 348 members',
    },
    {
      icon: '📡',
      title: 'Safety Update - Lakeside Peak',
      by: 'Sarah Al-Amin',
      sent: 'Yesterday',
      reach: '42 members',
    },
    {
      icon: '📡',
      title: 'Wellbeing Session - Ashdown Forest',
      by: 'Priya Mehta',
      sent: '2 days ago',
      reach: '26 members',
    },
    {
      icon: '📡',
      title: 'Spring Volunteer Drive',
      by: 'Alex Johnson',
      sent: '24 Mar',
      reach: '29 members',
    },
  ];
}

export type ActivityRow = { icon: string; html: string; time: string };

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getActivity(founderDisplayName: string): ActivityRow[] {
  return [
    {
      icon: '✅',
      html: '<strong>Sarah Al-Amin</strong> approved <strong>Jake Kowalski</strong> at Riverstone Glen',
      time: '14 min ago',
    },
    {
      icon: '📡',
      html: `<strong>You</strong> sent "Spring Opening" broadcast to all 348 members`,
      time: '2 hours ago',
    },
    {
      icon: '👤',
      html: '<strong>Dan Brown</strong> registered at Fernwood Glade - pending verification',
      time: '2 hours ago',
    },
    {
      icon: '🎖',
      html: '<strong>Tom Wilson</strong> promoted Sophie Park from Assistant → Coordinator',
      time: '5 hours ago',
    },
    {
      icon: '🔗',
      html: 'Google Sheets sync completed for Cliffside Bay - 14 shifts updated',
      time: '7 hours ago',
    },
    {
      icon: '⛺',
      html: `New campsite <strong>Saltmarsh Edge</strong> listed (closed) by <strong>${escapeHtml(founderDisplayName)}</strong>`,
      time: 'Yesterday',
    },
  ];
}

export type CsMember = {
  initials: string;
  name: string;
  role: 'admin' | 'mgr' | 'coord' | 'staff';
  status: 'active' | 'pending' | 'inactive';
};

export const CS_MEMBERS: Record<number, CsMember[]> = {
  1: [
    { initials: 'SA', name: 'Sarah Al-Amin', role: 'admin', status: 'active' },
    { initials: 'TO', name: 'Tom Okafor', role: 'coord', status: 'active' },
    { initials: 'ML', name: 'Maya Liu', role: 'staff', status: 'pending' },
  ],
};

export const CS_ROTA: Record<number, RotaRow[]> = {
  1: [
    { name: 'Tom Okafor', date: 'Tue 25 Mar', time: '10:00-14:00', role: 'Events Desk' },
    { name: 'Marcus Webb', date: 'Wed 26 Mar', time: '14:00-18:00', role: 'Front Desk' },
  ],
};

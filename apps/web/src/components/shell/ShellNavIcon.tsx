import type { ShellNavIconId } from '@/lib/adminGates';
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock3,
  ClipboardList,
  FileSignature,
  FileText,
  Folder,
  Inbox,
  HeartHandshake,
  Home,
  Hourglass,
  LayoutDashboard,
  Library,
  Link2,
  MapPinned,
  Megaphone,
  ClipboardCheck,
  CircleDollarSign,
  FolderOpen,
  GitBranch,
  Star,
  UserCircle,
  Palmtree,
  MessageSquare,
  Share2,
  Puzzle,
  Send,
  Settings,
  SlidersHorizontal,
  Tag,
  Timer,
  Ticket,
  UserCog,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';

const cls = 'h-[18px] w-[18px] shrink-0 text-current';
const stroke = 1.9;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/**
 * One distinct Tailwind text color per `ShellNavIconId` so no two sidebar entries share a hue step.
 * When adding a nav item, add a new key here and a new case in the switch below.
 */
const SHELL_NAV_TONE: Record<ShellNavIconId, string> = {
  absenceReport: 'text-orange-400',
  accountSettings: 'text-slate-400',
  activity: 'text-gray-300',
  applications: 'text-gray-400',
  attendance: 'text-zinc-300',
  attendanceSites: 'text-zinc-400',
  broadcasts: 'text-blue-500',
  calendar: 'text-indigo-500',
  categories: 'text-stone-300',
  dashboard: 'text-sky-500',
  departments: 'text-red-300',
  discount: 'text-red-400',
  home: 'text-orange-300',
  hrRecords: 'text-orange-400',
  hrSection: 'text-amber-300',
  integrations: 'text-amber-400',
  interviews: 'text-yellow-300',
  jobs: 'text-yellow-400',
  leave: 'text-lime-300',
  manager: 'text-lime-400',
  members: 'text-green-300',
  notifications: 'text-green-400',
  offerTemplates: 'text-emerald-300',
  onboarding: 'text-emerald-400',
  oneOnOnes: 'text-teal-300',
  orgChart: 'text-teal-400',
  orgSettings: 'text-cyan-300',
  payroll: 'text-cyan-400',
  pending: 'text-sky-300',
  performance: 'text-sky-400',
  recruitment: 'text-blue-300',
  recruitmentRequests: 'text-blue-400',
  resources: 'text-indigo-300',
  roles: 'text-indigo-400',
  rota: 'text-violet-300',
  settings: 'text-violet-400',
  systemOverview: 'text-purple-300',
  teams: 'text-purple-400',
  timesheets: 'text-fuchsia-300',
  userProfile: 'text-fuchsia-400',
};

function tone(name: ShellNavIconId) {
  return SHELL_NAV_TONE[name];
}

export function ShellNavIcon({ name, open }: { name: ShellNavIconId; open?: boolean }) {
  const p = {
    className: cn(cls, tone(name)),
    strokeWidth: stroke,
    absoluteStrokeWidth: true,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'settings':
      if (open !== undefined) {
        return (
          <span
            className={cn(
              'inline-flex shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform',
              open ? 'rotate-[76deg]' : 'rotate-0'
            )}
          >
            <Settings {...p} />
          </span>
        );
      }
      return <Settings {...p} />;
    case 'accountSettings':
      return <SlidersHorizontal {...p} />;
    case 'dashboard':
      return <LayoutDashboard {...p} />;
    case 'broadcasts':
      return <Megaphone {...p} />;
    case 'calendar':
      return <CalendarDays {...p} />;
    case 'timesheets':
      return <CalendarRange {...p} />;
    case 'rota':
      return <Clock3 {...p} />;
    case 'discount':
      return <Ticket {...p} />;
    case 'resources':
      return <Library {...p} />;
    case 'home':
      return <Home {...p} />;
    case 'members':
      return <Users {...p} />;
    case 'pending':
      return <Hourglass {...p} />;
    case 'roles':
      return <UserCog {...p} />;
    case 'departments':
      return <Building2 {...p} />;
    case 'teams':
      return <Puzzle {...p} />;
    case 'categories':
      return <Tag {...p} />;
    case 'activity':
      return <ClipboardList {...p} />;
    case 'absenceReport':
      return <BarChart3 {...p} />;
    case 'attendance':
      return <Timer {...p} />;
    case 'payroll':
      return <CircleDollarSign {...p} />;
    case 'orgSettings':
      return <Wrench {...p} />;
    case 'attendanceSites':
      return <MapPinned {...p} />;
    case 'notifications':
      return <Bell {...p} />;
    case 'integrations':
      return <Link2 {...p} />;
    case 'manager':
      if (open !== undefined) {
        return (
          <span
            className={cn(
              'inline-flex shrink-0 origin-[50%_88%] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              open ? 'rotate-[22deg]' : 'rotate-0'
            )}
          >
            <Briefcase {...p} />
          </span>
        );
      }
      return <Briefcase {...p} />;
    case 'recruitment':
      return <UserPlus {...p} />;
    case 'recruitmentRequests':
      return <Send {...p} />;
    case 'jobs':
      return <FileText {...p} />;
    case 'applications':
      return <Inbox {...p} />;
    case 'offerTemplates':
      return <FileSignature {...p} />;
    case 'interviews':
      return <CalendarClock {...p} />;
    case 'leave':
      return <Palmtree {...p} />;
    case 'userProfile':
      return <UserCircle {...p} />;
    case 'oneOnOnes':
      return <MessageSquare {...p} />;
    case 'hrSection':
      if (open !== undefined) {
        return (
          <span
            className={cn(
              'inline-flex shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              open ? 'scale-110' : 'scale-100'
            )}
          >
            <HeartHandshake {...p} />
          </span>
        );
      }
      return <HeartHandshake {...p} />;
    case 'hrRecords':
      if (open !== undefined) {
        const iconCls = cn('h-[18px] w-[18px] shrink-0 text-current', tone(name));
        return (
          <span
            className={cn(
              'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center transition-[transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              open ? 'scale-[1.12] rotate-0' : 'scale-100 -rotate-[9deg]'
            )}
          >
            {open ? (
              <FolderOpen
                className={iconCls}
                strokeWidth={stroke}
                absoluteStrokeWidth
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              />
            ) : (
              <Folder
                className={iconCls}
                strokeWidth={stroke}
                absoluteStrokeWidth
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              />
            )}
          </span>
        );
      }
      return <FolderOpen {...p} />;
    case 'onboarding':
      return <ClipboardCheck {...p} />;
    case 'performance':
      return <Star {...p} />;
    case 'orgChart':
      return <GitBranch {...p} />;
    case 'systemOverview':
      return <Share2 {...p} />;
    default: {
      const _x: never = name;
      return _x;
    }
  }
}

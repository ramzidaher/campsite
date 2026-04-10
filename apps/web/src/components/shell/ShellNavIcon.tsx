import type { ShellNavIconId } from '@/lib/adminGates';
import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock3,
  ClipboardList,
  FileSignature,
  FileText,
  Folder,
  Inbox,
  Home,
  Hourglass,
  LayoutDashboard,
  Link2,
  Megaphone,
  ClipboardCheck,
  FolderOpen,
  GitBranch,
  Star,
  UserCircle,
  Palmtree,
  Share2,
  Puzzle,
  Settings,
  Tag,
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

function tone(name: ShellNavIconId) {
  switch (name) {
    // Communications and awareness
    case 'dashboard':
    case 'broadcasts':
    case 'notifications':
      return 'text-slate-300';

    // People and profile
    case 'userProfile':
    case 'members':
    case 'roles':
    case 'departments':
    case 'teams':
    case 'hrRecords':
    case 'onboarding':
    case 'orgChart':
      return 'text-violet-300';

    // Scheduling and time
    case 'calendar':
    case 'rota':
    case 'leave':
    case 'pending':
    case 'interviews':
      return 'text-cyan-300';

    // Management and admin controls
    case 'manager':
    case 'recruitment':
    case 'settings':
      return 'text-rose-300';

    // Workstreams and delivery
    case 'jobs':
    case 'applications':
    case 'offerTemplates':
    case 'performance':
    case 'activity':
      return 'text-orange-300';

    // Perks, taxonomy and integrations
    case 'discount':
    case 'categories':
    case 'integrations':
      return 'text-emerald-300';

    case 'orgSettings':
    case 'systemOverview':
      return 'text-zinc-300';

    case 'home':
      return 'text-zinc-300';
    default:
      return 'text-zinc-300';
  }
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
    case 'dashboard':
      return <LayoutDashboard {...p} />;
    case 'broadcasts':
      return <Megaphone {...p} />;
    case 'calendar':
      return <CalendarDays {...p} />;
    case 'rota':
      return <Clock3 {...p} />;
    case 'discount':
      return <Ticket {...p} />;
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
    case 'orgSettings':
      return <Wrench {...p} />;
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

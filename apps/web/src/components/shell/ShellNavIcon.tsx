import type { ShellNavIconId } from '@/lib/adminGates';
import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
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
  Users,
  Wrench,
} from 'lucide-react';

const cls = 'h-[18px] w-[18px] shrink-0 opacity-[0.92]';
const stroke = 1.75;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function ShellNavIcon({ name, open }: { name: ShellNavIconId; open?: boolean }) {
  const p = { className: cls, strokeWidth: stroke, 'aria-hidden': true as const };
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
      return <CalendarRange {...p} />;
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
      return <Briefcase {...p} />;
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
        const iconCls = 'h-[18px] w-[18px] shrink-0 opacity-[0.92]';
        return (
          <span
            className={cn(
              'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center transition-[transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              open ? 'scale-[1.12] rotate-0' : 'scale-100 -rotate-[9deg]'
            )}
          >
            {open ? (
              <FolderOpen className={iconCls} strokeWidth={stroke} aria-hidden />
            ) : (
              <Folder className={iconCls} strokeWidth={stroke} aria-hidden />
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

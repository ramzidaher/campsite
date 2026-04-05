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
  Inbox,
  Home,
  Hourglass,
  LayoutDashboard,
  Link2,
  Megaphone,
  ClipboardCheck,
  FolderOpen,
  Star,
  Palmtree,
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

export function ShellNavIcon({ name }: { name: ShellNavIconId }) {
  const p = { className: cls, strokeWidth: stroke, 'aria-hidden': true as const };
  switch (name) {
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
    case 'settings':
      return <Settings {...p} />;
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
    case 'hrRecords':
      return <FolderOpen {...p} />;
    case 'onboarding':
      return <ClipboardCheck {...p} />;
    case 'performance':
      return <Star {...p} />;
    default: {
      const _x: never = name;
      return _x;
    }
  }
}

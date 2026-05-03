import type { ShellNavIconId } from '@/lib/adminGates';
import {
  Activity,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock3,
  ClipboardList,
  FileSignature,
  FileLock,
  FileText,
  Folder,
  Inbox,
  Home,
  Hourglass,
  LayoutDashboard,
  Link2,
  Megaphone,
  ClipboardCheck,
  CircleDollarSign,
  FolderOpen,
  GitBranch,
  Star,
  UserCircle,
  Download,
  Share2,
  Puzzle,
  Settings,
  Tag,
  Timer,
  UserCog,
  UserPlus,
  Users,
  Wrench,
  SquarePlus,
  SunMedium,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const cls = 'h-[18px] w-[18px] shrink-0';
const stroke = 1.9;
const ICON_TONE: Record<string, string> = {
  white: '#faf9f6',
  indigo: '#7a7aff',
  sky: '#4fc3f7',
  pink: '#f48fb1',
  rose: '#f06292',
  violet: '#9575cd',
  cyan: '#4dd0e1',
  teal: '#4db6ac',
  green: '#81c784',
  mint: '#a5d6a7',
  amber: '#ffb74d',
  orange: '#ff8a65',
  lilac: '#a89af7',
  slate: '#d4d4d8',
};
const SHELL_ICON_STYLE_STORAGE_KEY = 'campsite_shell_icon_style';
type ShellIconStyle = 'classic' | 'white';

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

function tone(name: ShellNavIconId, style: ShellIconStyle) {
  if (style === 'white') return ICON_TONE.white;
  switch (name) {
    case 'dashboard':
      return ICON_TONE.white;
    case 'userProfile':
      return ICON_TONE.sky;
    case 'broadcasts':
      return ICON_TONE.rose;
    case 'calendar':
      return ICON_TONE.violet;
    case 'rota':
      return ICON_TONE.cyan;
    case 'leave':
      return ICON_TONE.green;
    case 'performance':
      return ICON_TONE.amber;
    case 'resources':
      return ICON_TONE.mint;
    case 'manager':
      return ICON_TONE.lilac;
    case 'managerSection':
      return ICON_TONE.lilac;
    case 'financeSection':
      return ICON_TONE.green;
    case 'hrSection':
      return ICON_TONE.sky;
    case 'adminSection':
      return ICON_TONE.orange;
    case 'oneOnOnes':
      return ICON_TONE.pink;
    case 'hrRecords':
      return ICON_TONE.lilac;
    case 'recruitment':
      return ICON_TONE.pink;
    case 'jobs':
    case 'applications':
    case 'offerTemplates':
      return ICON_TONE.amber;
    case 'interviews':
      return ICON_TONE.cyan;
    case 'absenceReport':
      return ICON_TONE.amber;
    case 'onboarding':
      return ICON_TONE.lilac;
    case 'orgChart':
      return ICON_TONE.lilac;
    case 'attendance':
      return ICON_TONE.cyan;
    case 'payroll':
      return ICON_TONE.green;
    case 'reports':
      return ICON_TONE.amber;
    case 'settings':
      return ICON_TONE.orange;
    case 'members':
    case 'roles':
    case 'departments':
    case 'teams':
      return ICON_TONE.sky;
    case 'pending':
      return ICON_TONE.amber;
    case 'activity':
      return ICON_TONE.amber;
    case 'categories':
      return ICON_TONE.mint;
    case 'notifications':
      return ICON_TONE.slate;
    case 'integrations':
      return ICON_TONE.violet;
    case 'privacy':
      return ICON_TONE.violet;
    case 'orgSettings':
      return ICON_TONE.slate;
    case 'systemOverview':
    case 'home':
      return ICON_TONE.slate;
    default:
      return ICON_TONE.slate;
  }
}

export function ShellNavIcon({ name, open }: { name: ShellNavIconId; open?: boolean }) {
  const [iconStyle, setIconStyle] = useState<ShellIconStyle>('classic');
  useEffect(() => {
    const applyFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(SHELL_ICON_STYLE_STORAGE_KEY);
        setIconStyle(raw === 'white' ? 'white' : 'classic');
      } catch {
        setIconStyle('classic');
      }
    };
    applyFromStorage();
    const onCustom = () => applyFromStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHELL_ICON_STYLE_STORAGE_KEY) applyFromStorage();
    };
    window.addEventListener('campsite:shell-icon-style-change', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('campsite:shell-icon-style-change', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const p = {
    className: cls,
    style: { color: tone(name, iconStyle) },
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
    case 'resources':
      return <FileLock {...p} />;
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
    case 'reports':
      return <BarChart3 {...p} />;
    case 'orgSettings':
      return <Wrench {...p} />;
    case 'notifications':
      return <Bell {...p} />;
    case 'integrations':
      return <Link2 {...p} />;
    case 'privacy':
      return <FileLock {...p} />;
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
    case 'managerSection':
      return <SquarePlus {...p} />;
    case 'financeSection':
      return <CircleDollarSign {...p} />;
    case 'hrSection':
      return <Star {...p} />;
    case 'adminSection':
      return <SunMedium {...p} />;
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
      return <Download {...p} />;
    case 'userProfile':
      return <UserCircle {...p} />;
    case 'hrRecords':
      if (open !== undefined) {
        const iconCls = 'h-[18px] w-[18px] shrink-0';
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
                style={{ color: tone(name, iconStyle) }}
                strokeWidth={stroke}
                absoluteStrokeWidth
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              />
            ) : (
              <Folder
                className={iconCls}
                style={{ color: tone(name, iconStyle) }}
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
      return <Activity {...p} />;
    case 'oneOnOnes':
      return <Users {...p} />;
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

import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Boxes,
  CircleUser,
  Clapperboard,
  CloudUpload,
  FolderTree,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  ListTree,
  Mic2,
  Music2,
  PenLine,
  ClipboardCheck,
  ServerCog,
  ShieldAlert,
  UserRound,
  Users2,
  Workflow,
} from 'lucide-react';

export type NavPageId =
  | 'dashboard'
  | 'adminOps'
  | 'adminProviders'
  | 'adminBusiness'
  | 'adminQualityEval'
  | 'users'
  | 'characters'
  | 'outline'
  | 'writing'
  | 'video'
  | 'graph'
  | 'audio'
  | 'music'
  | 'smartflow'
  | 'knowledgeBase'
  | 'uploadManager'
  | 'account'
  | 'agentChat'
  | 'adminSensitiveWords';

const NAV_ICON_MAP: Record<NavPageId, LucideIcon> = {
  dashboard: LayoutDashboard,
  characters: UserRound,
  outline: ListTree,
  writing: PenLine,
  graph: ImageIcon,
  audio: Mic2,
  music: Music2,
  video: Clapperboard,
  agentChat: Bot,
  knowledgeBase: FolderTree,
  uploadManager: CloudUpload,
  account: CircleUser,
  adminProviders: ServerCog,
  adminBusiness: Boxes,
  adminQualityEval: ClipboardCheck,
  adminOps: Gauge,
  smartflow: Workflow,
  users: Users2,
  adminSensitiveWords: ShieldAlert,
};

export function NavIcon({ id, size = 18 }: { id: NavPageId; size?: number }) {
  const Icon = NAV_ICON_MAP[id];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}

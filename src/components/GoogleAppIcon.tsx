import {
  AppWindow,
  Calendar,
  ListTodo,
  Mail,
  StickyNote,
  Sun,
  type LucideIcon,
} from 'lucide-react';

import type { LauncherAppId } from '@/lib/settings';

const APP_ICONS: Record<LauncherAppId, LucideIcon> = {
  today: Sun,
  calendar: Calendar,
  gmail: Mail,
  tasks: ListTodo,
  keep: StickyNote,
  tabs: AppWindow,
};

export type GoogleAppIconId = LauncherAppId;

interface GoogleAppIconProps {
  id: GoogleAppIconId;
  className?: string;
}

export function GoogleAppIcon({ id, className }: GoogleAppIconProps) {
  const Icon = APP_ICONS[id];

  return (
    <Icon
      className={className ?? 'size-5'}
      aria-hidden="true"
      strokeWidth={1.75}
    />
  );
}

import { useMemo, useState, type ComponentProps } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RefreshCw, Settings } from 'lucide-react';

import { GoogleAppIcon, type GoogleAppIconId } from '@/components/GoogleAppIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LAUNCHER_APPS,
  applyEnabledAppOrder,
  isVerticalNav,
  type EnabledApps,
  type LauncherAppId,
  type NavAlign,
  type NavPosition,
} from '@/lib/settings';
import { cn } from '@/lib/utils';

export type AppView = LauncherAppId | 'settings';

/** Apps that re-fetch or remount when the active nav icon is clicked again. */
export const REFRESHABLE_APPS = new Set<LauncherAppId>([
  'today',
  'gmail',
  'calendar',
  'tasks',
  'keep',
]);

interface AppLauncherProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  /** Called when the already-active launcher app is clicked again (manual refresh). */
  onRefreshActive?: (id: LauncherAppId) => void;
  /** When set, the matching active nav icon shows a spinning refresh affordance. */
  refreshingApp?: LauncherAppId | null;
  enabledApps: EnabledApps;
  /** Full saved order; settings gear is never included. */
  appOrder: LauncherAppId[];
  onAppOrderChange: (order: LauncherAppId[]) => void;
  navPosition?: NavPosition;
  navAlign?: NavAlign;
}

const appMeta = Object.fromEntries(LAUNCHER_APPS.map((app) => [app.id, app])) as Record<
  LauncherAppId,
  (typeof LAUNCHER_APPS)[number]
>;

const ALIGN_JUSTIFY: Record<NavAlign, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

interface AppIconButtonProps {
  id: LauncherAppId;
  label: string;
  active: boolean;
  /** When active, hover/focus swaps the app icon for a refresh affordance. */
  refreshable?: boolean;
  /** Manual refresh in flight — keep the refresh icon visible and spinning. */
  refreshing?: boolean;
  className?: string;
  onSelect?: () => void;
}

function AppIconButton({
  id,
  label,
  active,
  refreshable = false,
  refreshing = false,
  className,
  onSelect,
  onClick,
  ...rest
}: AppIconButtonProps & ComponentProps<typeof Button>) {
  const showRefreshAffordance = active && refreshable;

  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      aria-label={
        refreshing
          ? `Refreshing ${label}`
          : showRefreshAffordance
            ? `Refresh ${label}`
            : label
      }
      aria-busy={refreshing || undefined}
      className={cn('group cursor-pointer touch-none', className)}
      {...rest}
      // Must come after {...rest}: TooltipTrigger asChild injects onClick into rest,
      // which would otherwise replace onSelect and block app switching / refresh.
      // Call onSelect first (like Slot’s child-then-slot order). Do not bail on
      // defaultPrevented — Radix tooltip close must not swallow navigation/refresh.
      onClick={(event) => {
        onSelect?.();
        onClick?.(event);
      }}
    >
      {refreshing ? (
        <RefreshCw
          className="size-5 animate-spin"
          aria-hidden="true"
          strokeWidth={1.75}
        />
      ) : showRefreshAffordance ? (
        <>
          <GoogleAppIcon
            id={id as GoogleAppIconId}
            className="size-5 group-hover:hidden group-focus-visible:hidden"
          />
          <RefreshCw
            className="hidden size-5 group-hover:block group-focus-visible:block"
            aria-hidden="true"
            strokeWidth={1.75}
          />
        </>
      ) : (
        <GoogleAppIcon id={id as GoogleAppIconId} />
      )}
    </Button>
  );
}

interface SortableAppButtonProps {
  id: LauncherAppId;
  label: string;
  active: boolean;
  refreshable: boolean;
  refreshing: boolean;
  onSelect: () => void;
}

function SortableAppButton({
  id,
  label,
  active,
  refreshable,
  refreshing,
  onSelect,
}: SortableAppButtonProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AppIconButton
          ref={setNodeRef}
          id={id}
          label={label}
          active={active}
          refreshable={refreshable}
          refreshing={refreshing}
          onSelect={onSelect}
          aria-grabbed={isDragging}
          style={{
            transform: CSS.Transform.toString(transform),
            // Button uses transition-all; never animate transform while this item is the drag source.
            transition: isDragging ? 'none' : transition,
          }}
          className={cn(isDragging && 'relative z-10 opacity-40 transition-none')}
          {...attributes}
          {...listeners}
        />
      </TooltipTrigger>
      <TooltipContent>
        {refreshing ? 'Refreshing…' : active && refreshable ? 'Refresh' : label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppLauncher({
  activeView,
  onViewChange,
  onRefreshActive,
  refreshingApp = null,
  enabledApps,
  appOrder,
  onAppOrderChange,
  navPosition = 'top',
  navAlign = 'start',
}: AppLauncherProps) {
  const [activeId, setActiveId] = useState<LauncherAppId | null>(null);
  const vertical = isVerticalNav(navPosition);
  const sortingStrategy = vertical ? rectSortingStrategy : horizontalListSortingStrategy;

  const visibleIds = useMemo(
    () => appOrder.filter((id) => enabledApps[id]),
    [appOrder, enabledApps],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Keep clicks for navigation/refresh; only start drag after a clear move.
      // Too-low distance lets fidgety clicks activate drag and swallow the click.
      activationConstraint: { distance: 10 },
    }),
  );

  const activeApp = activeId ? appMeta[activeId] : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as LauncherAppId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const from = visibleIds.indexOf(active.id as LauncherAppId);
    const to = visibleIds.indexOf(over.id as LauncherAppId);
    if (from < 0 || to < 0) return;

    const nextVisible = arrayMove(visibleIds, from, to);
    onAppOrderChange(applyEnabledAppOrder(appOrder, enabledApps, nextVisible));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <div
      className={cn(
        'flex gap-1',
        vertical ? 'h-full flex-col items-center' : 'w-full flex-row flex-wrap items-center',
        ALIGN_JUSTIFY[navAlign],
      )}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={visibleIds} strategy={sortingStrategy}>
          {visibleIds.map((id) => {
            const app = appMeta[id];
            if (!app) return null;
            const refreshable = REFRESHABLE_APPS.has(id);
            return (
              <SortableAppButton
                key={id}
                id={id}
                label={app.label}
                active={activeView === id}
                refreshable={refreshable}
                refreshing={refreshingApp === id}
                onSelect={() => {
                  if (activeView === id) {
                    if (refreshable) onRefreshActive?.(id);
                  } else {
                    onViewChange(id);
                  }
                }}
              />
            );
          })}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeApp ? (
            <AppIconButton
              id={activeApp.id}
              label={activeApp.label}
              active={activeView === activeApp.id}
              className="cursor-pointer transition-none shadow-md"
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={activeView === 'settings' ? 'secondary' : 'ghost'}
            size="icon"
            className="cursor-pointer"
            onClick={() => onViewChange('settings')}
            aria-label="Settings"
          >
            <Settings className="size-5" strokeWidth={1.75} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
    </div>
  );
}

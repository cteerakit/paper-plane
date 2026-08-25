import {
  Component,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  AppWindow,
  Archive,
  ChevronDown,
  Plus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  isSessionsApiAvailable,
  listRecentlyClosedTabs,
  restoreClosedSession,
  subscribeSessionsChanged,
  type ClosedTab,
} from '@/lib/chrome-sessions';
import {
  activateTab,
  canRenameTabTitle,
  closeOpenTab,
  createNewTab,
  duplicateOpenTab,
  listOpenTabs,
  moveOpenTab,
  moveOpenTabs,
  normalizeTabUrl,
  openTabInSplitView,
  renameOpenTabTitle,
  setTabMuted,
  setTabPinned,
  updateTabUrl,
  type OpenTab,
  type SplitViewLayout,
} from '@/lib/chrome-tabs';
import { getGoogleFaviconUrl, resolveFaviconSrc } from '@/lib/favicon';
import type { NewTabPosition } from '@/lib/settings';
import { cn, formatRelativeTime } from '@/lib/utils';

function newTabShortcutLabel() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    ? '⌘T'
    : 'Ctrl+T';
}

interface TabsSectionProps {
  enabled: boolean;
  /** When true, refresh list (on view focus / visibility). */
  active: boolean;
  /** Where the New tab control sits relative to the open-tab list. */
  newTabPosition?: NewTabPosition;
  /** Bump from AppLauncher when Tabs is already active (manual refresh). */
  refreshToken?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
}

const PINNED_DROPPABLE_ID = 'pinned-drop-zone';
const OPEN_DROPPABLE_ID = 'open-drop-zone';

/** Flat open-tab row — no card chrome; hover / active lighten via surface ladder. */
const openTabRowClass =
  'group flex h-11 w-full touch-none cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2';

/** Combined Split View row: two (or more) panes share one strip height. */
const splitRowClass =
  'flex h-11 w-full touch-none cursor-default items-center overflow-hidden rounded-md';

const splitPaneClass =
  'group flex h-full min-w-0 flex-1 cursor-default items-center gap-2 px-2 text-left text-sm transition-colors hover:bg-surface-2';

/** Matches open-tab row height (h-11); cursor-default with Ctrl/⌘T on hover. */
const newTabButtonClass =
  'text-muted-foreground hover:bg-surface-2 hover:text-foreground group flex h-11 w-full cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-50';

function NewTabButton({
  disabled,
  onClick,
  className,
}: {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(newTabButtonClass, className)}
      onClick={onClick}
    >
      <Plus className="size-4 shrink-0" aria-hidden />
      <span>New tab</span>
      <span
        className="text-muted-foreground ml-auto shrink-0 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      >
        {newTabShortcutLabel()}
      </span>
    </button>
  );
}

const tabsCollisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type as string | undefined;
  const pointerHits = pointerWithin(args);

  // Unpinned → pin-zone wins so dropping on the strip (or a pinned icon) pins.
  if (activeType === 'open-tab') {
    const overPinned = pointerHits.find((c) => c.id === PINNED_DROPPABLE_ID);
    if (overPinned) return [overPinned];
  }

  // Pinned → open-zone wins so dropping on the open list unpins.
  if (activeType === 'pinned-tab') {
    const overOpen = pointerHits.find((c) => c.id === OPEN_DROPPABLE_ID);
    if (overOpen) return [overOpen];
  }

  // Pinned reorder / open-tab reorder: hit sibling sortables, not the drop zones.
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.id !== PINNED_DROPPABLE_ID && c.id !== OPEN_DROPPABLE_ID,
    ),
  });
};

function groupTabsByWindow(tabs: OpenTab[]): { windowId: number; tabs: OpenTab[] }[] {
  const groups: { windowId: number; tabs: OpenTab[] }[] = [];
  for (const tab of tabs) {
    const last = groups[groups.length - 1];
    if (last && last.windowId === tab.windowId) {
      last.tabs.push(tab);
    } else {
      groups.push({ windowId: tab.windowId, tabs: [tab] });
    }
  }
  return groups;
}

type OpenTabRow =
  | { type: 'single'; tab: OpenTab }
  | { type: 'split'; tabs: OpenTab[] };

/** Collapse adjacent tabs that share a Chrome Split View into one visual row. */
function groupTabsIntoRows(tabs: OpenTab[]): OpenTabRow[] {
  const rows: OpenTabRow[] = [];
  for (const tab of tabs) {
    const prev = rows[rows.length - 1];
    if (tab.splitViewId != null && prev) {
      if (prev.type === 'split' && prev.tabs[0]?.splitViewId === tab.splitViewId) {
        prev.tabs.push(tab);
        continue;
      }
      if (prev.type === 'single' && prev.tab.splitViewId === tab.splitViewId) {
        rows[rows.length - 1] = { type: 'split', tabs: [prev.tab, tab] };
        continue;
      }
    }
    rows.push({ type: 'single', tab });
  }
  return rows;
}

function rowTabs(row: OpenTabRow): OpenTab[] {
  return row.type === 'split' ? row.tabs : [row.tab];
}

function rowPrimaryId(row: OpenTabRow): number {
  return row.type === 'split' ? row.tabs[0]!.id : row.tab.id;
}

function unpinnedIndexOfRow(rows: OpenTabRow[], rowIndex: number): number {
  let index = 0;
  for (let i = 0; i < rowIndex; i++) {
    index += rowTabs(rows[i]!).length;
  }
  return index;
}

/**
 * Chrome unsplits a Split View if either of its tabs is moved away from the
 * other. To reorder a split row, move the tabs *around* it instead.
 */
function moveAroundSplitRow(
  rows: OpenTabRow[],
  fromRow: number,
  toRow: number,
  pinnedCount: number,
): { tabIds: number[]; index: number } | null {
  if (fromRow === toRow) return null;

  if (fromRow < toRow) {
    const intervening = rows.slice(fromRow + 1, toRow + 1).flatMap(rowTabs);
    if (intervening.length === 0) return null;
    return {
      tabIds: intervening.map((t) => t.id),
      index: pinnedCount + unpinnedIndexOfRow(rows, fromRow),
    };
  }

  const intervening = rows.slice(toRow, fromRow).flatMap(rowTabs);
  if (intervening.length === 0) return null;
  const splitStart = unpinnedIndexOfRow(rows, fromRow);
  const splitLen = rowTabs(rows[fromRow]!).length;
  return {
    tabIds: intervening.map((t) => t.id),
    index: pinnedCount + splitStart + splitLen - 1,
  };
}

function FaviconIcon({
  src,
  fallbackUrl,
}: {
  src?: string;
  /** Page URL used for Google S2 fallback after primary src fails. */
  fallbackUrl?: string;
}) {
  const googleFallback =
    fallbackUrl && fallbackUrl.trim() ? getGoogleFaviconUrl(fallbackUrl, 32) : undefined;
  const candidates = [src, googleFallback && googleFallback !== src ? googleFallback : undefined].filter(
    (v): v is string => Boolean(v),
  );

  const [srcIndex, setSrcIndex] = useState(0);
  const current = srcIndex < candidates.length ? candidates[srcIndex] : undefined;

  if (!current) {
    return (
      <span className="bg-muted text-muted-foreground flex size-4 shrink-0 items-center justify-center overflow-visible rounded-sm">
        <AppWindow className="size-3" aria-hidden />
      </span>
    );
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center overflow-visible">
      <img
        key={current}
        src={current}
        alt=""
        aria-hidden
        decoding="async"
        className="block size-4 max-h-4 max-w-4 object-contain object-center"
        onError={() => {
          setSrcIndex((i) => {
            const next = i + 1;
            // Advance past the last candidate so we render the placeholder once — never loop.
            return next > candidates.length ? candidates.length : next;
          });
        }}
      />
    </span>
  );
}

function TabFavicon({ tab }: { tab: OpenTab }) {
  const src = resolveFaviconSrc(tab.url || undefined, tab.favIconUrl);
  return <FaviconIcon src={src} fallbackUrl={tab.url || undefined} />;
}

function ClosedTabFavicon({ tab }: { tab: ClosedTab }) {
  const src = resolveFaviconSrc(tab.url || undefined, tab.favIconUrl);
  return <FaviconIcon src={src} fallbackUrl={tab.url || undefined} />;
}

async function copyTabUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  await navigator.clipboard.writeText(trimmed);
}

function OpenInSplitViewSubmenu({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (layout: SplitViewLayout) => void;
}) {
  // Flat disabled item — a SubTrigger can still open on hover when "disabled".
  if (disabled) {
    return (
      <ContextMenuItem className="cursor-pointer" disabled>
        Open in Split View
      </ContextMenuItem>
    );
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="cursor-pointer">
        Open in Split View
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-0 w-max">
        <ContextMenuItem
          className="cursor-pointer"
          onSelect={() => {
            onSelect('sideBySide');
          }}
        >
          Side-by-side
        </ContextMenuItem>
        <ContextMenuItem
          className="cursor-pointer"
          onSelect={() => {
            onSelect('stacked');
          }}
        >
          Stacked
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function AddMenu({
  disabled,
  onNewTab,
}: {
  disabled?: boolean;
  onNewTab: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div className="absolute bottom-3 right-3 z-20">
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          // Focus returns to the trigger on outside dismiss; keep tooltip off until hover.
          setTooltipOpen(false);
        }}
      >
        <Tooltip open={tooltipOpen && !menuOpen}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Add"
                disabled={disabled}
                onPointerEnter={() => {
                  if (!menuOpen) setTooltipOpen(true);
                }}
                onPointerLeave={() => {
                  setTooltipOpen(false);
                }}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Add</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" side="top" sideOffset={8}>
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => {
              onNewTab();
            }}
          >
            <Plus aria-hidden />
            New tab
            <DropdownMenuShortcut>{newTabShortcutLabel()}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RecentlyClosedMenu({
  active,
  enabled,
}: {
  active: boolean;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [closedTabs, setClosedTabs] = useState<ClosedTab[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const refreshClosed = useCallback(async () => {
    if (!isSessionsApiAvailable()) {
      setClosedTabs([]);
      setError('Reload Paper Plane on chrome://extensions to enable Recently Closed.');
      return;
    }
    try {
      const next = await listRecentlyClosedTabs(5);
      setClosedTabs(next);
      setError(null);
    } catch (err) {
      setClosedTabs([]);
      setError(err instanceof Error ? err.message : 'Failed to load recently closed tabs');
    }
  }, []);

  useEffect(() => {
    if (!enabled || !active || !open) return;

    void refreshClosed();

    const onSessionsChanged = () => {
      void refreshClosed();
    };
    const unsubscribeSessions = subscribeSessionsChanged(onSessionsChanged);

    const onTabsChanged = () => {
      void refreshClosed();
    };
    browser.tabs.onRemoved.addListener(onTabsChanged);
    browser.tabs.onCreated.addListener(onTabsChanged);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshClosed();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      unsubscribeSessions();
      browser.tabs.onRemoved.removeListener(onTabsChanged);
      browser.tabs.onCreated.removeListener(onTabsChanged);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [enabled, active, open, refreshClosed]);

  async function handleRestore(tab: ClosedTab) {
    setRestoringId(tab.sessionId);
    setClosedTabs((prev) => prev.filter((t) => t.sessionId !== tab.sessionId));
    try {
      await restoreClosedSession(tab.sessionId);
      setError(null);
      await refreshClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore tab');
      await refreshClosed();
    } finally {
      setRestoringId(null);
    }
  }

  if (!enabled) return null;

  return (
    <div className="absolute bottom-3 left-3 z-20">
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setTooltipOpen(false);
        }}
      >
        <Tooltip open={tooltipOpen && !open}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Recently closed"
                onPointerEnter={() => {
                  if (!open) setTooltipOpen(true);
                }}
                onPointerLeave={() => {
                  setTooltipOpen(false);
                }}
              >
                <Archive className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Recently Closed</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-72 p-1"
        >
          {error && (
            <p className="text-destructive px-2 py-3 text-sm" role="status">
              {error}
            </p>
          )}
          {!error && closedTabs.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-sm" role="status">
              No recently closed tabs.
            </p>
          )}
          {closedTabs.map((tab) => {
            const closedAgo = formatRelativeTime(tab.lastModified);
            return (
              <DropdownMenuItem
                key={tab.sessionId}
                disabled={restoringId === tab.sessionId}
                className="gap-2.5"
                onSelect={() => {
                  void handleRestore(tab);
                }}
              >
                <ClosedTabFavicon tab={tab} />
                <span className="min-w-0 flex-1 truncate font-medium">{tab.title}</span>
                {closedAgo && (
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {closedAgo}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TabRowContent({ tab }: { tab: OpenTab }) {
  return (
    <>
      <TabFavicon tab={tab} />
      <p className="min-w-0 flex-1 truncate font-medium leading-snug">
        <span className="truncate">{tab.title}</span>
      </p>
    </>
  );
}

const tabTitleInputClass =
  'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-w-0 flex-1 rounded-md border px-2 py-1 text-sm font-medium leading-snug outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50';

function EditTabUrlDialog({
  tab,
  open,
  onOpenChange,
  onSave,
}: {
  tab: OpenTab | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tab: OpenTab, url: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !tab) return;
    setDraft(tab.url);
    setFormError(null);
    setBusy(false);
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open, tab]);

  async function handleSubmit(event?: { preventDefault(): void }) {
    event?.preventDefault();
    if (!tab || busy) return;
    const normalized = normalizeTabUrl(draft);
    if (!normalized) {
      setFormError(draft.trim() ? 'Enter a valid URL' : 'URL cannot be empty');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await onSave(tab, normalized);
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update URL');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Edit URL</AlertDialogTitle>
            <AlertDialogDescription>
              Change where this tab navigates. A missing protocol gets https://.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2">
            <input
              ref={inputRef}
              type="text"
              name="url"
              aria-label="Tab URL"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              disabled={busy}
              className={cn(tabTitleInputClass, 'w-full')}
              onChange={(event) => {
                setDraft(event.target.value);
                if (formError) setFormError(null);
              }}
            />
            {formError && <p className="text-destructive text-sm">{formError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} type="button">
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RenameTabDialog({
  tab,
  open,
  onOpenChange,
  onSave,
}: {
  tab: OpenTab | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tab: OpenTab, title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !tab) return;
    setDraft(tab.title);
    setFormError(null);
    setBusy(false);
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open, tab]);

  async function handleSubmit(event?: { preventDefault(): void }) {
    event?.preventDefault();
    if (!tab || busy) return;
    const next = draft.trim();
    if (!next) {
      setFormError('Title cannot be empty');
      return;
    }
    if (next === tab.title) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await onSave(tab, next);
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not rename tab');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Rename tab</AlertDialogTitle>
            <AlertDialogDescription>
              Change the title shown for this pinned tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2">
            <input
              ref={inputRef}
              type="text"
              name="title"
              aria-label="Tab title"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              disabled={busy}
              className={cn(tabTitleInputClass, 'w-full')}
              onChange={(event) => {
                setDraft(event.target.value);
                if (formError) setFormError(null);
              }}
            />
            {formError && <p className="text-destructive text-sm">{formError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} type="button">
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const tabCloseButtonClass =
  'text-muted-foreground hover:bg-surface-2 hover:text-foreground flex h-[1.875rem] w-0 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md opacity-0 transition-[width,opacity] group-hover:w-[1.875rem] group-hover:opacity-100 focus-visible:w-[1.875rem] focus-visible:opacity-100 disabled:pointer-events-none';

function TabPane({
  tab,
  disabled,
  variant,
  isDragging,
  dragAttributes,
  dragListeners,
  onActivate,
  onClose,
  onPin,
  onMute,
  onDuplicate,
  onOpenInSplitView,
  onRename,
  onRenamingChange,
}: {
  tab: OpenTab;
  disabled: boolean;
  variant: 'row' | 'pane';
  isDragging?: boolean;
  dragAttributes?: HTMLAttributes<HTMLElement>;
  dragListeners?: Record<string, unknown>;
  onActivate: (tab: OpenTab) => void;
  onClose: (tab: OpenTab) => void;
  onPin: (tab: OpenTab) => void;
  onMute: (tab: OpenTab) => void;
  onDuplicate: (tab: OpenTab) => void;
  onOpenInSplitView: (tab: OpenTab, layout: SplitViewLayout) => void;
  onRename: (tab: OpenTab, title: string) => void | Promise<void>;
  onRenamingChange?: (renaming: boolean) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(tab.title);
  const [renamingBusy, setRenamingBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);
  /** Prevent Radix menu close from restoring focus onto the row (which blurs the input). */
  const suppressCloseAutoFocusRef = useRef(false);
  /** Ignore blur right after entering rename — menu teardown / focus thrash. */
  const ignoreBlurUntilRef = useRef(0);

  const { onPointerDown: dndPointerDown, ...dndListeners } = dragListeners ?? {};
  const canRename = canRenameTabTitle(tab.url);
  const canCopyLink = Boolean(tab.url.trim());
  const rowBusy = disabled || renamingBusy;
  const isPane = variant === 'pane';

  useEffect(() => {
    onRenamingChange?.(isRenaming);
    // Parent callback identity is not stable (split row); only notify on the flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRenaming]);

  useEffect(() => {
    if (!isRenaming) return;
    setDraftTitle(tab.title);
    ignoreBlurUntilRef.current = Date.now() + 200;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
    // Only when entering rename mode — avoid resetting draft while typing if title updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: enter-rename focus only
  }, [isRenaming]);

  function beginRename() {
    // Radix restores focus to the trigger on close; that blurs a synchronously-mounted
    // input and onBlur commit exits rename (unchanged title). Defer past menu teardown.
    suppressCloseAutoFocusRef.current = true;
    window.setTimeout(() => {
      setDraftTitle(tab.title);
      setIsRenaming(true);
    }, 0);
  }

  async function commitRename() {
    if (renamingBusy) return;
    const next = draftTitle.trim();
    if (!next || next === tab.title) {
      setIsRenaming(false);
      setDraftTitle(tab.title);
      return;
    }
    setRenamingBusy(true);
    try {
      await onRename(tab, next);
      setIsRenaming(false);
    } catch {
      // Parent surfaces the error; keep editor open so the user can retry or Escape.
      setDraftTitle(tab.title);
    } finally {
      setRenamingBusy(false);
    }
  }

  function cancelRename() {
    skipBlurCommitRef.current = true;
    setIsRenaming(false);
    setDraftTitle(tab.title);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            isPane ? splitPaneClass : openTabRowClass,
            tab.active && !isRenaming && 'bg-surface-3 hover:bg-surface-3',
            !isPane && isDragging && 'cursor-grabbing opacity-40',
            rowBusy && !isRenaming && 'pointer-events-none opacity-50',
            isRenaming && 'bg-surface-1',
          )}
          {...dragAttributes}
          {...(isRenaming || !dragListeners ? {} : dndListeners)}
          onPointerDown={(event) => {
            if (isRenaming) return;
            // Primary button only — right-click opens the menu without starting a drag.
            if (event.button !== 0) return;
            if (typeof dndPointerDown === 'function') {
              (dndPointerDown as (event: ReactPointerEvent<HTMLElement>) => void)(event);
            }
          }}
          onClick={() => {
            if (rowBusy || isRenaming) return;
            void onActivate(tab);
          }}
        >
          {isRenaming ? (
            <>
              <TabFavicon tab={tab} />
              <input
                ref={inputRef}
                type="text"
                aria-label="Rename tab"
                value={draftTitle}
                disabled={renamingBusy}
                className={tabTitleInputClass}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    skipBlurCommitRef.current = true;
                    void commitRename();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelRename();
                  }
                }}
                onBlur={() => {
                  if (skipBlurCommitRef.current) {
                    skipBlurCommitRef.current = false;
                    return;
                  }
                  // Menu close / focus restore can blur the input in the same tick as mount.
                  if (Date.now() < ignoreBlurUntilRef.current) {
                    requestAnimationFrame(() => {
                      inputRef.current?.focus();
                    });
                    return;
                  }
                  void commitRename();
                }}
              />
            </>
          ) : (
            <TabRowContent tab={tab} />
          )}
          <div className="-mr-0.5 ml-auto flex shrink-0 items-center">
            {(tab.audible || tab.muted) && !isRenaming && (
              <button
                type="button"
                aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
                disabled={rowBusy}
                className="text-muted-foreground hover:bg-surface-2 hover:text-foreground cursor-pointer rounded-md p-1.5 disabled:pointer-events-none"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (rowBusy) return;
                  void onMute(tab);
                }}
              >
                {tab.muted ? (
                  <VolumeX className="size-4.5" strokeWidth={2.25} aria-hidden />
                ) : (
                  <Volume2 className="size-4.5" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            )}
            <button
              type="button"
              aria-label="Close tab"
              disabled={rowBusy || isRenaming}
              className={tabCloseButtonClass}
              onPointerDown={(event) => {
                // Keep dnd-kit from starting a drag when pressing Close.
                event.stopPropagation();
                event.preventDefault();
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                if (rowBusy || isRenaming) return;
                void onClose(tab);
              }}
            >
              <X className="size-4.5 shrink-0" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          if (suppressCloseAutoFocusRef.current) {
            event.preventDefault();
            suppressCloseAutoFocusRef.current = false;
          }
        }}
      >
        <ContextMenuItem
          className="cursor-pointer"
          disabled={rowBusy || !canCopyLink}
          onSelect={() => {
            void copyTabUrl(tab.url);
          }}
        >
          Copy Link
        </ContextMenuItem>
        <ContextMenuItem
          className="cursor-pointer"
          disabled={rowBusy || !canRename}
          title={canRename ? undefined : 'Cannot rename this page'}
          onSelect={() => {
            beginRename();
          }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          className="cursor-pointer"
          disabled={rowBusy}
          onSelect={() => {
            void onMute(tab);
          }}
        >
          {tab.muted ? 'Unmute' : 'Mute'}
        </ContextMenuItem>
        <ContextMenuItem
          className="cursor-pointer"
          disabled={rowBusy}
          onSelect={() => {
            void onDuplicate(tab);
          }}
        >
          Duplicate
        </ContextMenuItem>
        <OpenInSplitViewSubmenu
          disabled={rowBusy || variant === 'pane' || tab.splitViewId != null}
          onSelect={(layout) => {
            void onOpenInSplitView(tab, layout);
          }}
        />
        <ContextMenuItem
          className="cursor-pointer"
          disabled={rowBusy}
          onSelect={() => {
            void onPin(tab);
          }}
        >
          Pin Tab
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          className="cursor-pointer"
          disabled={rowBusy || isRenaming}
          onSelect={() => {
            void onClose(tab);
          }}
        >
          Close Tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SortableTabRow({
  tab,
  disabled,
  onActivate,
  onClose,
  onPin,
  onMute,
  onDuplicate,
  onOpenInSplitView,
  onRename,
}: {
  tab: OpenTab;
  disabled: boolean;
  onActivate: (tab: OpenTab) => void;
  onClose: (tab: OpenTab) => void;
  onPin: (tab: OpenTab) => void;
  onMute: (tab: OpenTab) => void;
  onDuplicate: (tab: OpenTab) => void;
  onOpenInSplitView: (tab: OpenTab, layout: SplitViewLayout) => void;
  onRename: (tab: OpenTab, title: string) => void | Promise<void>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    data: { type: 'open-tab', tab },
    disabled: isRenaming || disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
      }}
      className={cn(isDragging && 'relative z-10')}
    >
      <TabPane
        tab={tab}
        disabled={disabled}
        variant="row"
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners as Record<string, unknown> | undefined}
        onActivate={onActivate}
        onClose={onClose}
        onPin={onPin}
        onMute={onMute}
        onDuplicate={onDuplicate}
        onOpenInSplitView={onOpenInSplitView}
        onRename={onRename}
        onRenamingChange={setIsRenaming}
      />
    </li>
  );
}

function SortableSplitTabRow({
  tabs,
  disabled,
  onActivate,
  onClose,
  onPin,
  onMute,
  onDuplicate,
  onOpenInSplitView,
  onRename,
}: {
  tabs: OpenTab[];
  disabled: boolean;
  onActivate: (tab: OpenTab) => void;
  onClose: (tab: OpenTab) => void;
  onPin: (tab: OpenTab) => void;
  onMute: (tab: OpenTab) => void;
  onDuplicate: (tab: OpenTab) => void;
  onOpenInSplitView: (tab: OpenTab, layout: SplitViewLayout) => void;
  onRename: (tab: OpenTab, title: string) => void | Promise<void>;
}) {
  const primary = tabs[0]!;
  const [renaming, setRenaming] = useState(false);
  const renamingPanesRef = useRef(new Set<number>());

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: primary.id,
    data: { type: 'open-tab', tab: primary, splitTabs: tabs },
    disabled: renaming || disabled,
  });

  const { onPointerDown: dndPointerDown, ...dndListeners } = listeners ?? {};

  function handlePaneRenamingChange(tabId: number, next: boolean) {
    if (next) renamingPanesRef.current.add(tabId);
    else renamingPanesRef.current.delete(tabId);
    setRenaming(renamingPanesRef.current.size > 0);
  }

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
      }}
      className={cn(isDragging && 'relative z-10')}
      aria-label={`Split view: ${tabs.map((t) => t.title).join(' and ')}`}
    >
      <div
        className={cn(
          splitRowClass,
          isDragging && 'cursor-grabbing opacity-40',
          disabled && 'pointer-events-none opacity-50',
        )}
        {...attributes}
        {...(renaming ? {} : dndListeners)}
        onPointerDown={(event) => {
          if (renaming) return;
          if (event.button !== 0) return;
          dndPointerDown?.(event);
        }}
      >
        {tabs.map((tab) => (
          <TabPane
            key={tab.id}
            tab={tab}
            disabled={disabled}
            variant="pane"
            onActivate={onActivate}
            onClose={onClose}
            onPin={onPin}
            onMute={onMute}
            onDuplicate={onDuplicate}
            onOpenInSplitView={onOpenInSplitView}
            onRename={onRename}
            onRenamingChange={(next) => handlePaneRenamingChange(tab.id, next)}
          />
        ))}
      </div>
    </li>
  );
}

function SortablePinnedTab({
  tab,
  stretch,
  disabled,
  onActivate,
  onUnpin,
  onMute,
  onDuplicate,
  onOpenInSplitView,
  onRename,
  onEdit,
}: {
  tab: OpenTab;
  /** Equal-width flex fill when ≤4 pinned tabs. */
  stretch: boolean;
  disabled: boolean;
  onActivate: (tab: OpenTab) => void;
  onUnpin: (tab: OpenTab) => void;
  onMute: (tab: OpenTab) => void;
  onDuplicate: (tab: OpenTab) => void;
  onOpenInSplitView: (tab: OpenTab, layout: SplitViewLayout) => void;
  onRename: (tab: OpenTab) => void;
  onEdit: (tab: OpenTab) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    data: { type: 'pinned-tab', tab },
    disabled,
  });

  const { onPointerDown: dndPointerDown, ...dndListeners } = listeners ?? {};
  const canRename = canRenameTabTitle(tab.url);
  const canCopyLink = Boolean(tab.url.trim());

  return (
    <li
      ref={setNodeRef}
      data-pinned-tab
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
      }}
      className={cn('min-w-0', stretch && 'flex-1', isDragging && 'relative z-10')}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={cn('relative min-w-0', stretch && 'w-full')}>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={disabled}
              aria-label={`Pinned: ${tab.title}`}
              className={cn(
                'h-11 w-full touch-none rounded-lg border shadow-none',
                tab.active
                  ? 'border-transparent bg-surface-3 hover:bg-surface-3'
                  : 'border-transparent bg-surface-1 hover:bg-surface-2',
                isDragging ? 'cursor-grabbing opacity-40' : 'cursor-default',
              )}
              {...attributes}
              {...dndListeners}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                dndPointerDown?.(event);
              }}
              onClick={() => {
                if (disabled) return;
                void onActivate(tab);
              }}
            >
              <TabFavicon tab={tab} />
            </Button>
            {(tab.audible || tab.muted) && (
              <button
                type="button"
                aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
                disabled={disabled}
                className="bg-surface-2 text-muted-foreground hover:text-foreground absolute right-0.5 bottom-0.5 z-10 flex size-4 cursor-pointer items-center justify-center rounded-sm disabled:pointer-events-none"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (disabled) return;
                  void onMute(tab);
                }}
              >
                {tab.muted ? (
                  <VolumeX className="size-3" strokeWidth={2.5} aria-hidden />
                ) : (
                  <Volume2 className="size-3" strokeWidth={2.5} aria-hidden />
                )}
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="cursor-pointer"
            disabled={disabled || !canCopyLink}
            onSelect={() => {
              void copyTabUrl(tab.url);
            }}
          >
            Copy Link
          </ContextMenuItem>
          <ContextMenuItem
            className="cursor-pointer"
            disabled={disabled || !canRename}
            title={canRename ? undefined : 'Cannot rename this page'}
            onSelect={() => {
              onRename(tab);
            }}
          >
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="cursor-pointer"
            disabled={disabled}
            onSelect={() => {
              void onMute(tab);
            }}
          >
            {tab.muted ? 'Unmute' : 'Mute'}
          </ContextMenuItem>
          <ContextMenuItem
            className="cursor-pointer"
            disabled={disabled}
            onSelect={() => {
              void onDuplicate(tab);
            }}
          >
            Duplicate
          </ContextMenuItem>
          <OpenInSplitViewSubmenu
            disabled={disabled || tab.splitViewId != null}
            onSelect={(layout) => {
              void onOpenInSplitView(tab, layout);
            }}
          />
          <ContextMenuItem
            className="cursor-pointer"
            disabled={disabled}
            onSelect={() => {
              onEdit(tab);
            }}
          >
            Edit
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            className="cursor-pointer"
            disabled={disabled}
            onSelect={() => {
              void onUnpin(tab);
            }}
          >
            Unpin
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

function PinnedDropZone({
  highlight,
  children,
}: {
  highlight?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: PINNED_DROPPABLE_ID });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'min-h-10 w-full space-y-2 rounded-lg transition-colors',
        highlight && 'bg-accent/40 ring-border ring-1 ring-inset',
      )}
      aria-label="Pinned"
    >
      {children}
    </section>
  );
}

/** Empty pinned strip while dragging — labeled so the drop target is obvious. */
function PinnedEmptyDropHint({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'border-foreground/25 text-muted-foreground flex h-11 w-full items-center justify-center rounded-lg border border-dashed text-xs transition-colors',
        active && 'border-foreground/40 bg-accent/40 text-foreground/70',
      )}
      aria-hidden
    >
      Drop to pin
    </div>
  );
}

/** Ghost slot in the pinned strip showing where a dragged tab will land. */
function PinnedDropPlaceholder({ stretch }: { stretch: boolean }) {
  return (
    <li aria-hidden className={cn('pointer-events-none min-w-0', stretch && 'flex-1')}>
      <div className="border-foreground/25 bg-accent/40 h-11 w-full rounded-lg border border-dashed" />
    </li>
  );
}

/**
 * Insert index among pinned slots from the pointer (reading order).
 * Uses live `[data-pinned-tab]` rects — placeholder is excluded so it can't
 * steal hits; left-of-center on a pin means insert before that pin.
 */
function computePinnedInsertIndex(
  clientX: number,
  clientY: number,
  listEl: HTMLElement | null,
): number {
  if (!listEl) return 0;
  const slots = [...listEl.querySelectorAll<HTMLElement>('[data-pinned-tab]')];
  if (slots.length === 0) return 0;

  for (let i = 0; i < slots.length; i++) {
    const rect = slots[i]!.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;

    // Above this row → insert before this item (start of row).
    if (clientY < rect.top) return i;
    // On this row: left half → insert before, right half → keep scanning.
    if (clientY <= rect.bottom && clientX < midX) return i;
  }
  return slots.length;
}

function OpenDropZone({
  highlight,
  children,
}: {
  highlight: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: OPEN_DROPPABLE_ID });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-10 w-full flex-col gap-0.5 rounded-lg transition-colors',
        highlight && 'bg-accent/40 ring-border ring-1 ring-inset',
      )}
      aria-label="Open tabs"
    >
      {children}
    </section>
  );
}

function TabsSectionInner({
  enabled,
  active,
  newTabPosition = 'bottom',
  refreshToken = 0,
  onRefreshingChange,
}: TabsSectionProps) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);
  const [creatingTab, setCreatingTab] = useState(false);
  const [activeDragTab, setActiveDragTab] = useState<OpenTab | null>(null);
  const [overPinned, setOverPinned] = useState(false);
  const [overOpen, setOverOpen] = useState(false);
  const [pinnedDropIndex, setPinnedDropIndex] = useState<number | null>(null);
  const [editingTab, setEditingTab] = useState<OpenTab | null>(null);
  const [renamingTab, setRenamingTab] = useState<OpenTab | null>(null);
  /**
   * Empty pin strip is revealed one layout pass after drag start so DragOverlay
   * can lock its initial rect before the in-flow zone shifts the list.
   */
  const [revealEmptyPinZone, setRevealEmptyPinZone] = useState(false);
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Keep click-to-focus; only start drag after a short move.
      activationConstraint: { distance: 6 },
    }),
  );

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const pinnedListRef = useRef<HTMLUListElement | null>(null);
  const pinnedDropIndexRef = useRef<number | null>(null);
  /** Pointer client pos at drag start — overlay center is wrong for wide open-tab rows. */
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);

  const refreshTabs = useCallback(async () => {
    try {
      const next = await listOpenTabs();
      setTabs(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tabs');
    }
  }, []);

  useEffect(() => {
    if (!enabled || !active) return;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      // Skeleton only when there are no rows yet — keep the list mounted on re-focus.
      if (tabsRef.current.length === 0) setLoading(true);
      try {
        const nextTabs = await listOpenTabs();
        if (!cancelled) {
          setTabs(nextTabs);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tabs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const onTabsChanged = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refreshTabs();
      }, 150);
    };

    browser.tabs.onCreated.addListener(onTabsChanged);
    browser.tabs.onRemoved.addListener(onTabsChanged);
    browser.tabs.onUpdated.addListener(onTabsChanged);
    browser.tabs.onActivated.addListener(onTabsChanged);
    browser.tabs.onMoved.addListener(onTabsChanged);
    browser.tabs.onAttached.addListener(onTabsChanged);
    browser.tabs.onDetached.addListener(onTabsChanged);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshTabs();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      browser.tabs.onCreated.removeListener(onTabsChanged);
      browser.tabs.onRemoved.removeListener(onTabsChanged);
      browser.tabs.onUpdated.removeListener(onTabsChanged);
      browser.tabs.onActivated.removeListener(onTabsChanged);
      browser.tabs.onMoved.removeListener(onTabsChanged);
      browser.tabs.onAttached.removeListener(onTabsChanged);
      browser.tabs.onDetached.removeListener(onTabsChanged);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, active, refreshTabs]);

  // Manual refresh from active nav re-click — keep the list mounted (no skeleton).
  useEffect(() => {
    if (!enabled || !active || refreshToken <= 0) return;
    let cancelled = false;
    onRefreshingChangeRef.current?.(true);
    void refreshTabs().finally(() => {
      if (!cancelled) onRefreshingChangeRef.current?.(false);
    });
    return () => {
      cancelled = true;
      onRefreshingChangeRef.current?.(false);
    };
  }, [enabled, active, refreshToken, refreshTabs]);

  async function handleActivate(tab: OpenTab) {
    // Optimistic active highlight — avoid waiting on Chrome events (and never dim the row).
    if (!tab.active) {
      setTabs((prev) =>
        prev.map((t) =>
          t.windowId === tab.windowId ? { ...t, active: t.id === tab.id } : t,
        ),
      );
    }
    try {
      await activateTab(tab.id, tab.windowId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch to tab');
      await refreshTabs();
    }
  }

  async function handleCloseTab(tab: OpenTab) {
    setClosingId(tab.id);
    setTabs((prev) => prev.filter((t) => t.id !== tab.id));
    try {
      await closeOpenTab(tab.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close tab');
      await refreshTabs();
    } finally {
      setClosingId(null);
    }
  }

  async function handlePinTab(tab: OpenTab, insertIndex?: number) {
    setPinningId(tab.id);
    const currentPinned = tabs.filter((t) => t.pinned);
    const at = Math.max(
      0,
      Math.min(insertIndex ?? currentPinned.length, currentPinned.length),
    );
    const chromeIndex = currentPinned
      .slice(0, at)
      .filter((t) => t.windowId === tab.windowId).length;

    setTabs((prev) => {
      const without = prev.filter((t) => t.id !== tab.id);
      const otherPinned = without.filter((t) => t.pinned);
      const unpinned = without.filter((t) => !t.pinned);
      const pinAt = Math.max(0, Math.min(at, otherPinned.length));
      return [
        ...otherPinned.slice(0, pinAt),
        { ...tab, pinned: true },
        ...otherPinned.slice(pinAt),
        ...unpinned,
      ];
    });

    try {
      await setTabPinned(tab.id, true);
      if (insertIndex !== undefined) {
        await moveOpenTab(tab.id, chromeIndex, tab.windowId);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pin tab');
      await refreshTabs();
    } finally {
      setPinningId(null);
    }
  }

  async function handleUnpinTab(tab: OpenTab) {
    setPinningId(tab.id);
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, pinned: false } : t)),
    );
    try {
      await setTabPinned(tab.id, false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unpin tab');
      await refreshTabs();
    } finally {
      setPinningId(null);
    }
  }

  async function handleClearTabs() {
    const activeTab = tabs.find((t) => t.active);
    if (!activeTab) return;

    const toClose = tabs.filter((t) => {
      if (t.pinned || t.id === activeTab.id) return false;
      // Keep the other half of an active Split View — clearing it would unsplit.
      if (
        activeTab.splitViewId != null &&
        t.splitViewId === activeTab.splitViewId
      ) {
        return false;
      }
      return true;
    });
    if (toClose.length === 0) return;

    const keepIds = new Set(
      tabs.filter((t) => !toClose.some((c) => c.id === t.id)).map((t) => t.id),
    );
    setTabs((prev) => prev.filter((t) => keepIds.has(t.id)));
    try {
      await Promise.all(toClose.map((tab) => closeOpenTab(tab.id)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear tabs');
      await refreshTabs();
    }
  }

  async function handleMuteTab(tab: OpenTab) {
    const muted = !tab.muted;
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, muted } : t)),
    );
    try {
      await setTabMuted(tab.id, muted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : muted ? 'Could not mute tab' : 'Could not unmute tab');
      await refreshTabs();
    }
  }

  async function handleDuplicateTab(tab: OpenTab) {
    try {
      await duplicateOpenTab(tab.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate tab');
      await refreshTabs();
    }
  }

  async function handleOpenInSplitView(tab: OpenTab, layout: SplitViewLayout) {
    try {
      await openTabInSplitView(tab, layout);
      setError(null);
      await refreshTabs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Split View');
      await refreshTabs();
    }
  }

  async function handleRenameTab(tab: OpenTab, title: string) {
    try {
      await renameOpenTabTitle(tab.id, title);
      setTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, title } : t)),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename tab');
      throw err;
    }
  }

  async function handleEditTabUrl(tab: OpenTab, url: string) {
    try {
      await updateTabUrl(tab.id, url);
      setTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, url } : t)),
      );
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update URL';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  function openEditTabUrl(tab: OpenTab) {
    setEditingTab(tab);
  }

  function openRenameTab(tab: OpenTab) {
    setRenamingTab(tab);
  }

  async function handleCreateTab() {
    setCreatingTab(true);
    try {
      await createNewTab();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create tab');
    } finally {
      setCreatingTab(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const tab =
      (event.active.data.current?.tab as OpenTab | undefined) ??
      tabs.find((t) => t.id === event.active.id) ??
      null;
    setActiveDragTab(tab);
    // Keep revealEmptyPinZone false this commit — see effect below.

    const activator = event.activatorEvent;
    if (activator && 'clientX' in activator && 'clientY' in activator) {
      pointerOriginRef.current = {
        x: (activator as PointerEvent).clientX,
        y: (activator as PointerEvent).clientY,
      };
    } else {
      pointerOriginRef.current = null;
    }
  }

  useEffect(() => {
    const shouldReveal =
      activeDragTab !== null &&
      !activeDragTab.pinned &&
      !tabsRef.current.some((t) => t.pinned);

    if (!shouldReveal) {
      setRevealEmptyPinZone(false);
      return;
    }

    // Wait until after paint so DragOverlay has locked its initial rect on the
    // unshifted list; then insert the in-flow "Drop to pin" zone.
    const frame = requestAnimationFrame(() => {
      setRevealEmptyPinZone(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeDragTab]);

  function updatePinnedDropIndicator(
    event: Pick<DragMoveEvent, 'active' | 'over' | 'delta'>,
  ) {
    const activeTab = event.active.data.current?.tab as OpenTab | undefined;
    const draggingUnpinned = Boolean(activeTab && !activeTab.pinned);
    const overId = event.over?.id;
    const overPinnedZone =
      overId === PINNED_DROPPABLE_ID ||
      (typeof overId === 'number' &&
        tabsRef.current.some((t) => t.id === overId && t.pinned));

    setOverPinned(draggingUnpinned && overPinnedZone);
    setOverOpen(event.over?.id === OPEN_DROPPABLE_ID);

    if (!draggingUnpinned || !overPinnedZone) {
      pinnedDropIndexRef.current = null;
      setPinnedDropIndex(null);
      return;
    }

    const origin = pointerOriginRef.current;
    const clientX = origin ? origin.x + event.delta.x : null;
    const clientY = origin ? origin.y + event.delta.y : null;
    const pinnedCount = tabsRef.current.filter((t) => t.pinned).length;
    const index =
      clientX !== null && clientY !== null
        ? computePinnedInsertIndex(clientX, clientY, pinnedListRef.current)
        : pinnedCount;

    pinnedDropIndexRef.current = index;
    setPinnedDropIndex(index);
  }

  function handleDragOver(event: DragOverEvent) {
    updatePinnedDropIndicator(event);
  }

  function handleDragMove(event: DragMoveEvent) {
    updatePinnedDropIndicator(event);
  }

  function handleDragCancel() {
    setActiveDragTab(null);
    setRevealEmptyPinZone(false);
    setOverPinned(false);
    setOverOpen(false);
    pinnedDropIndexRef.current = null;
    setPinnedDropIndex(null);
    pointerOriginRef.current = null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const draggedTab =
      (active.data.current?.tab as OpenTab | undefined) ??
      tabs.find((t) => t.id === active.id) ??
      null;
    const dropIndex = pinnedDropIndexRef.current;

    setActiveDragTab(null);
    setRevealEmptyPinZone(false);
    setOverPinned(false);
    setOverOpen(false);
    pinnedDropIndexRef.current = null;
    setPinnedDropIndex(null);
    pointerOriginRef.current = null;

    if (!over || !draggedTab) return;

    if (over.id === PINNED_DROPPABLE_ID) {
      if (!draggedTab.pinned) {
        void handlePinTab(
          draggedTab,
          dropIndex ?? tabs.filter((t) => t.pinned).length,
        );
      }
      return;
    }

    if (over.id === OPEN_DROPPABLE_ID) {
      if (draggedTab.pinned) void handleUnpinTab(draggedTab);
      return;
    }

    if (active.id === over.id) return;

    const overTab = tabs.find((t) => t.id === over.id);
    if (!overTab || overTab.windowId !== draggedTab.windowId) return;

    // Reorder pinned tabs within the same window (Chrome indices 0..n-1).
    if (draggedTab.pinned && overTab.pinned) {
      const windowTabs = tabs.filter((t) => t.windowId === draggedTab.windowId);
      const pinnedWindowTabs = windowTabs.filter((t) => t.pinned);
      const oldIndex = pinnedWindowTabs.findIndex((t) => t.id === draggedTab.id);
      const newIndex = pinnedWindowTabs.findIndex((t) => t.id === overTab.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      setTabs((prev) => {
        const next: OpenTab[] = [];
        for (const group of groupTabsByWindow(prev)) {
          if (group.windowId !== draggedTab.windowId) {
            next.push(...group.tabs);
            continue;
          }
          const pinned = group.tabs.filter((t) => t.pinned);
          const unpinned = group.tabs.filter((t) => !t.pinned);
          next.push(...arrayMove(pinned, oldIndex, newIndex), ...unpinned);
        }
        return next;
      });

      void (async () => {
        try {
          await moveOpenTab(draggedTab.id, newIndex, draggedTab.windowId);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not reorder tab');
          await refreshTabs();
        }
      })();
      return;
    }

    // Pinned → open row (fallback if open zone didn't win collision): unpin.
    if (draggedTab.pinned && !overTab.pinned) {
      void handleUnpinTab(draggedTab);
      return;
    }

    if (overTab.pinned) return;

    const windowTabs = tabs.filter((t) => t.windowId === draggedTab.windowId);
    const pinnedCount = windowTabs.filter((t) => t.pinned).length;
    const unpinnedWindowTabs = windowTabs.filter((t) => !t.pinned);
    const rows = groupTabsIntoRows(unpinnedWindowTabs);
    const oldRowIndex = rows.findIndex((r) => rowTabs(r).some((t) => t.id === draggedTab.id));
    const newRowIndex = rows.findIndex((r) => rowTabs(r).some((t) => t.id === overTab.id));
    if (oldRowIndex < 0 || newRowIndex < 0 || oldRowIndex === newRowIndex) return;

    const draggedRow = rows[oldRowIndex]!;
    const nextUnpinned = arrayMove(rows, oldRowIndex, newRowIndex).flatMap(rowTabs);
    const chromeIndex =
      pinnedCount + nextUnpinned.findIndex((t) => t.id === rowPrimaryId(draggedRow));
    if (chromeIndex < pinnedCount) return;

    // Optimistic reorder among unpinned only; Chrome index includes leading pinned tabs.
    // Split pairs move as one row so they stay adjacent.
    setTabs((prev) => {
      const next: OpenTab[] = [];
      for (const group of groupTabsByWindow(prev)) {
        if (group.windowId !== draggedTab.windowId) {
          next.push(...group.tabs);
          continue;
        }
        const pinned = group.tabs.filter((t) => t.pinned);
        next.push(...pinned, ...nextUnpinned);
      }
      return next;
    });

    void (async () => {
      try {
        if (draggedRow.type === 'split') {
          // Do not tabs.move the split pair — Chrome unsplits as soon as one
          // half is moved away from the other. Shift the surrounding tabs.
          const around = moveAroundSplitRow(
            rows,
            oldRowIndex,
            newRowIndex,
            pinnedCount,
          );
          if (around) {
            await moveOpenTabs(around.tabIds, around.index, draggedTab.windowId);
          }
        } else {
          await moveOpenTabs([draggedTab.id], chromeIndex, draggedTab.windowId);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reorder tab');
        await refreshTabs();
      }
    })();
  }

  const pinnedTabs = useMemo(() => tabs.filter((t) => t.pinned), [tabs]);
  const openTabs = useMemo(() => tabs.filter((t) => !t.pinned), [tabs]);
  const tabGroups = useMemo(() => groupTabsByWindow(openTabs), [openTabs]);
  const showWindowHeadings = tabGroups.length > 1;
  const isDraggingUnpinned = Boolean(activeDragTab) && !activeDragTab?.pinned;
  const isDraggingPinned = Boolean(activeDragTab?.pinned);
  const openDropHighlight = overOpen && isDraggingPinned;
  const showPinnedPlaceholder =
    isDraggingUnpinned && overPinned && pinnedDropIndex !== null;
  const pinnedSlotCount = pinnedTabs.length + (showPinnedPlaceholder ? 1 : 0);
  const pinnedStretch = pinnedSlotCount <= 4;
  // Empty pin target is in-flow (pushes the list) but revealed after DragOverlay
  // locks its rect — so the floating preview doesn't jump with the layout shift.
  const showPinnedSection =
    pinnedTabs.length > 0 || (isDraggingUnpinned && revealEmptyPinZone);
  const canClearTabs = tabs.some((t) => {
    if (t.pinned || t.active) return false;
    const activeTab = tabs.find((x) => x.active);
    if (!activeTab) return false;
    if (
      activeTab.splitViewId != null &&
      t.splitViewId === activeTab.splitViewId
    ) {
      return false;
    }
    return true;
  });
  const dragSplitTabs = useMemo(() => {
    if (!activeDragTab || activeDragTab.pinned || activeDragTab.splitViewId == null) {
      return null;
    }
    const pair = openTabs.filter((t) => t.splitViewId === activeDragTab.splitViewId);
    return pair.length > 1 ? pair : null;
  }, [activeDragTab, openTabs]);

  if (!enabled) return null;

  const showSkeleton = loading && tabs.length === 0;

  const newTabControl = (
    <NewTabButton
      disabled={creatingTab}
      onClick={() => {
        void handleCreateTab();
      }}
    />
  );

  return (
    <div className="relative flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-14">
        {showSkeleton && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!showSkeleton && (
          <DndContext
            sensors={sensors}
            collisionDetection={tabsCollisionDetection}
            // In-flow empty pin zone shifts the list; don't scroll to "undo" that
            // (it would hide the zone) — DragOverlay keeps its pre-shift rect instead.
            autoScroll={{ layoutShiftCompensation: false }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex flex-col gap-1.5">
            {showPinnedSection && (
              <PinnedDropZone highlight={isDraggingUnpinned && overPinned}>
                {pinnedTabs.length === 0 ? (
                  <PinnedEmptyDropHint active={overPinned} />
                ) : (
                  // ≤4: equal-width flex fill. >4: fixed 4-col grid (no stretch on incomplete last row).
                  // Height matches open-tab rows (h-11).
                  // max-height ≈ 3 rows (h-11 + gap-2), scroll when more than 12.
                  <SortableContext
                    items={pinnedTabs.map((t) => t.id)}
                    strategy={rectSortingStrategy}
                  >
                    <ul
                      ref={pinnedListRef}
                      className={
                        pinnedStretch
                          ? 'flex max-h-[9.25rem] w-full gap-2 overflow-y-auto'
                          : 'grid max-h-[9.25rem] w-full grid-cols-4 gap-2 overflow-y-auto'
                      }
                    >
                      {pinnedTabs.map((tab, index) => (
                        <Fragment key={tab.id}>
                          {showPinnedPlaceholder && pinnedDropIndex === index && (
                            <PinnedDropPlaceholder stretch={pinnedStretch} />
                          )}
                          <SortablePinnedTab
                            tab={tab}
                            stretch={pinnedStretch}
                            disabled={closingId === tab.id || pinningId === tab.id}
                            onActivate={handleActivate}
                            onUnpin={handleUnpinTab}
                            onMute={handleMuteTab}
                            onDuplicate={handleDuplicateTab}
                            onOpenInSplitView={handleOpenInSplitView}
                            onRename={openRenameTab}
                            onEdit={openEditTabUrl}
                          />
                        </Fragment>
                      ))}
                      {showPinnedPlaceholder &&
                        pinnedDropIndex === pinnedTabs.length && (
                          <PinnedDropPlaceholder stretch={pinnedStretch} />
                        )}
                    </ul>
                  </SortableContext>
                )}
              </PinnedDropZone>
            )}

            <div className="group/clear-zone flex flex-col gap-1.5">
              <div className="relative flex h-6 items-center">
                <Separator className="bg-border/40 w-full" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'bg-background text-muted-foreground/55 hover:bg-background hover:text-foreground absolute right-0 h-6 gap-1 px-1.5 text-xs transition-[opacity,color]',
                    canClearTabs
                      ? 'pointer-events-none opacity-0 group-hover/clear-zone:pointer-events-auto group-hover/clear-zone:opacity-100 group-focus-within/clear-zone:pointer-events-auto group-focus-within/clear-zone:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'
                      : 'pointer-events-none opacity-0',
                  )}
                  aria-label="Clear all unpinned tabs except the active one"
                  tabIndex={canClearTabs ? undefined : -1}
                  disabled={!canClearTabs || closingId !== null}
                  onClick={() => {
                    void handleClearTabs();
                  }}
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                  Clear
                </Button>
              </div>

              <OpenDropZone highlight={openDropHighlight}>
                {newTabPosition === 'top' && newTabControl}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Tabs unavailable</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {openTabs.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {tabGroups.map((group, groupIndex) => {
                      const rows = groupTabsIntoRows(group.tabs);
                      return (
                      <div key={group.windowId} className="flex flex-col gap-0.5">
                        {showWindowHeadings && (
                          <p className="text-muted-foreground px-1 text-[11px] font-medium tracking-wide uppercase">
                            Window {groupIndex + 1}
                          </p>
                        )}
                        <SortableContext
                          items={rows.map(rowPrimaryId)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul className="flex flex-col gap-0.5">
                            {rows.map((row) =>
                              row.type === 'split' ? (
                                <SortableSplitTabRow
                                  key={row.tabs[0]!.id}
                                  tabs={row.tabs}
                                  disabled={row.tabs.some(
                                    (t) => t.id === closingId || t.id === pinningId,
                                  )}
                                  onActivate={handleActivate}
                                  onClose={handleCloseTab}
                                  onPin={handlePinTab}
                                  onMute={handleMuteTab}
                                  onDuplicate={handleDuplicateTab}
                                  onOpenInSplitView={handleOpenInSplitView}
                                  onRename={handleRenameTab}
                                />
                              ) : (
                                <SortableTabRow
                                  key={row.tab.id}
                                  tab={row.tab}
                                  disabled={
                                    closingId === row.tab.id || pinningId === row.tab.id
                                  }
                                  onActivate={handleActivate}
                                  onClose={handleCloseTab}
                                  onPin={handlePinTab}
                                  onMute={handleMuteTab}
                                  onDuplicate={handleDuplicateTab}
                                  onOpenInSplitView={handleOpenInSplitView}
                                  onRename={handleRenameTab}
                                />
                              ),
                            )}
                          </ul>
                        </SortableContext>
                      </div>
                      );
                    })}
                  </div>
                )}
                {newTabPosition === 'bottom' && newTabControl}
              </OpenDropZone>
            </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {activeDragTab ? (
                activeDragTab.pinned ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-hidden
                    className={cn(
                      'h-11 w-11 cursor-grabbing rounded-lg border border-transparent shadow-md',
                      activeDragTab.active ? 'bg-surface-3' : 'bg-surface-1',
                    )}
                  >
                    <TabFavicon tab={activeDragTab} />
                  </Button>
                ) : dragSplitTabs ? (
                  <div
                    className={cn(
                      splitRowClass,
                      'w-72 cursor-grabbing bg-surface-1 shadow-md',
                    )}
                  >
                    {dragSplitTabs.map((tab) => (
                      <div
                        key={tab.id}
                        className={cn(
                          splitPaneClass,
                          tab.active && 'bg-surface-3',
                        )}
                      >
                        <TabRowContent tab={tab} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={cn(
                      openTabRowClass,
                      'cursor-grabbing bg-background shadow-md',
                      activeDragTab.active && 'bg-surface-3',
                    )}
                  >
                    <TabRowContent tab={activeDragTab} />
                  </div>
                )
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <EditTabUrlDialog
        tab={editingTab}
        open={editingTab !== null}
        onOpenChange={(next) => {
          if (!next) setEditingTab(null);
        }}
        onSave={handleEditTabUrl}
      />

      <RenameTabDialog
        tab={renamingTab}
        open={renamingTab !== null}
        onOpenChange={(next) => {
          if (!next) setRenamingTab(null);
        }}
        onSave={handleRenameTab}
      />

      <AddMenu
        disabled={!enabled || creatingTab}
        onNewTab={() => {
          void handleCreateTab();
        }}
      />
      <RecentlyClosedMenu enabled={enabled} active={active} />
    </div>
  );
}

interface TabsErrorBoundaryState {
  error: Error | null;
}

/** Keeps a Tabs render crash from blanking the entire side panel. */
class TabsErrorBoundary extends Component<{ children: ReactNode }, TabsErrorBoundaryState> {
  override state: TabsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabsErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TabsSection crashed', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Tabs failed to load</AlertTitle>
          <AlertDescription>
            {this.state.error.message || 'Something went wrong rendering this page.'}
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

export function TabsSection(props: TabsSectionProps) {
  return (
    <TabsErrorBoundary>
      <TabsSectionInner {...props} />
    </TabsErrorBoundary>
  );
}

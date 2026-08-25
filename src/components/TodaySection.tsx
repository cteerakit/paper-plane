import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, listRowButtonClass } from '@/components/ui/button';
import { cardSurfaceClass } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import {
  GOOGLE_CACHE_STALE_MS,
  removeTaskFromCaches,
  subscribeTaskCompleted,
  todayCacheItem,
} from '@/lib/cache';
import {
  completeTask,
  fetchTodaySnapshot,
  getGmailThreadUrl,
  type TaskItem,
  type TodaySnapshot,
} from '@/lib/google/api';
import { cn } from '@/lib/utils';

interface TodaySectionProps {
  enabled: boolean;
  /** Increment to force a network refetch while the panel stays mounted. */
  refreshToken?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
}

const EMPTY_SNAPSHOT: TodaySnapshot = { events: [], tasks: [], threads: [] };

type TodaySectionId = 'calendar' | 'tasks' | 'email';

const COLLAPSED_STORAGE_KEY = 'flyout.today.collapsedSections';

type CollapsedMap = Partial<Record<TodaySectionId, boolean>>;

function loadCollapsedSections(): CollapsedMap {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as CollapsedMap;
  } catch {
    return {};
  }
}

function persistCollapsedSections(map: CollapsedMap) {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function formatEventWhen(start: string): string {
  if (!start) return '';
  if (start.length === 10) return 'All day';
  const date = new Date(start);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dueDateKey(due: string): string {
  return due.slice(0, 10);
}

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDue(due: string): string {
  const today = localDateKey();
  const key = dueDateKey(due);
  if (key === today) return 'Due today';
  const [y, m, d] = key.split('-').map(Number);
  return `Overdue · ${new Date(y!, m! - 1, d!).toLocaleDateString()}`;
}

function CollapsibleSection({
  id,
  title,
  expanded,
  onToggle,
  children,
}: {
  id: TodaySectionId;
  title: string;
  expanded: boolean;
  onToggle: (id: TodaySectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onToggle(id)}
          className="text-muted-foreground flex w-full cursor-pointer items-center gap-1 text-left text-xs font-medium tracking-wide uppercase"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              expanded && 'rotate-90',
            )}
            aria-hidden
          />
          {title}
        </button>
      </h2>
      {expanded && children}
    </section>
  );
}

export function TodaySection({
  enabled,
  refreshToken = 0,
  onRefreshingChange,
}: TodaySectionProps) {
  const {
    data,
    setData,
    loading,
    error,
    setError,
  } = useCachedFetch(
    enabled,
    todayCacheItem,
    fetchTodaySnapshot,
    EMPTY_SNAPSHOT,
    'Failed to load Today',
    refreshToken,
    onRefreshingChange,
    GOOGLE_CACHE_STALE_MS,
  );
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<CollapsedMap>(loadCollapsedSections);

  useEffect(() => {
    return subscribeTaskCompleted((listId, taskId) => {
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.listId !== listId || t.id !== taskId),
      }));
    });
  }, [setData]);

  function toggleSection(id: TodaySectionId) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persistCollapsedSections(next);
      return next;
    });
  }

  async function handleComplete(task: TaskItem) {
    const key = `${task.listId}:${task.id}`;
    setCompletingKey(key);
    try {
      await completeTask(task.listId, task.id);
      await removeTaskFromCaches(task.listId, task.id);
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => !(t.id === task.id && t.listId === task.listId)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setCompletingKey(null);
    }
  }

  if (!enabled) return null;

  const { events, tasks, threads } = data;
  const showBody = !loading && !error;

  return (
    <div className="flex flex-col gap-5">
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Today unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showBody && (
        <>
          <CollapsibleSection
            id="calendar"
            title="Calendar"
            expanded={!collapsed.calendar}
            onToggle={toggleSection}
          >
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events today.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className={cardSurfaceClass}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 cursor-pointer text-left font-medium leading-snug hover:underline"
                        onClick={() => {
                          if (event.htmlLink) browser.tabs.create({ url: event.htmlLink });
                        }}
                      >
                        {event.title}
                      </button>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatEventWhen(event.start)}
                      </span>
                    </div>
                    {event.meetLink && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7"
                        onClick={() => browser.tabs.create({ url: event.meetLink! })}
                      >
                        Join Meet
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="tasks"
            title="Task"
            expanded={!collapsed.tasks}
            onToggle={toggleSection}
          >
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tasks due today.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li
                    key={`${task.listId}:${task.id}`}
                    className={cn(cardSurfaceClass, 'flex items-start gap-3')}
                  >
                    <Checkbox
                      checked={false}
                      disabled={completingKey === `${task.listId}:${task.id}`}
                      onCheckedChange={() => handleComplete(task)}
                      aria-label={`Complete ${task.title}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug font-medium">{task.title}</p>
                      {task.due && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {formatDue(task.due)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="email"
            title="Unread emails"
            expanded={!collapsed.email}
            onToggle={toggleSection}
          >
            {threads.length === 0 ? (
              <p className="text-muted-foreground text-sm">No messages today.</p>
            ) : (
              <ul className="space-y-2">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={cn(
                        listRowButtonClass,
                        thread.unread === false &&
                          'text-muted-foreground opacity-55 hover:opacity-80',
                      )}
                      onClick={() =>
                        browser.tabs.create({ url: getGmailThreadUrl(thread.id) })
                      }
                    >
                      <p
                        className={cn(
                          'truncate font-medium',
                          thread.unread === false && 'text-muted-foreground',
                        )}
                      >
                        {thread.subject}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{thread.from}</p>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {thread.snippet}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

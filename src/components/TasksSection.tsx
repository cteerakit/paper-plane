import { useMemo, useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cardSurfaceClass } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { setCacheEntry, tasksCacheItem } from '@/lib/cache';
import { completeTask, fetchIncompleteTasks, type TaskItem } from '@/lib/google/api';
import { cn } from '@/lib/utils';

interface TasksSectionProps {
  enabled: boolean;
  /** Increment to force a network refetch while the panel stays mounted. */
  refreshToken?: number;
}

type TaskGroupId = 'overdue' | 'today' | 'future' | 'nodate';

interface TaskGroup {
  id: TaskGroupId;
  label: string;
  tasks: TaskItem[];
}

const COLLAPSED_STORAGE_KEY = 'flyout.tasks.collapsedSections';

type CollapsedMap = Partial<Record<TaskGroupId, boolean>>;

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

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Google Tasks `due` is midnight UTC for a calendar day — compare by YYYY-MM-DD. */
function dueDateKey(due: string): string {
  return due.slice(0, 10);
}

function formatDue(due: string): string {
  const [y, m, d] = dueDateKey(due).split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString();
}

function compareDueAsc(a: TaskItem, b: TaskItem): number {
  return (a.due ?? '').localeCompare(b.due ?? '');
}

function compareTitle(a: TaskItem, b: TaskItem): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

function groupTasks(tasks: TaskItem[]): TaskGroup[] {
  const today = localDateKey();
  const overdue: TaskItem[] = [];
  const dueToday: TaskItem[] = [];
  const future: TaskItem[] = [];
  const noDate: TaskItem[] = [];

  for (const task of tasks) {
    if (!task.due) {
      noDate.push(task);
      continue;
    }
    const key = dueDateKey(task.due);
    if (key < today) overdue.push(task);
    else if (key === today) dueToday.push(task);
    else future.push(task);
  }

  overdue.sort(compareDueAsc);
  dueToday.sort(compareDueAsc);
  future.sort(compareDueAsc);
  noDate.sort(compareTitle);

  const groups: TaskGroup[] = [
    { id: 'overdue', label: 'Overdue', tasks: overdue },
    { id: 'today', label: 'Due today', tasks: dueToday },
    { id: 'future', label: 'Future task', tasks: future },
    { id: 'nodate', label: 'No date', tasks: noDate },
  ];
  return groups.filter((g) => g.tasks.length > 0);
}

export function TasksSection({ enabled, refreshToken = 0 }: TasksSectionProps) {
  const { data: tasks, setData: setTasks, loading, error, setError } = useCachedFetch(
    enabled,
    tasksCacheItem,
    fetchIncompleteTasks,
    [],
    'Failed to load tasks',
    refreshToken,
  );
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<CollapsedMap>(loadCollapsedSections);
  const groups = useMemo(() => groupTasks(tasks), [tasks]);

  function toggleGroup(id: TaskGroupId) {
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
      setTasks((prev) => {
        const next = prev.filter((t) => !(t.id === task.id && t.listId === task.listId));
        void setCacheEntry(tasksCacheItem, next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setCompletingKey(null);
    }
  }

  if (!enabled) return null;

  return (
    <div>
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Task unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && tasks.length === 0 && (
        <p className="text-muted-foreground text-sm">No open tasks.</p>
      )}
      {!loading && !error && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => {
            const isExpanded = !collapsed[group.id];
            return (
              <section key={group.id}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      'text-muted-foreground flex w-full cursor-pointer items-center gap-1 text-left text-xs font-medium tracking-wide uppercase',
                      isExpanded && 'mb-2',
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 shrink-0 transition-transform',
                        isExpanded && 'rotate-90',
                      )}
                      aria-hidden
                    />
                    {group.label}
                  </button>
                </h3>
                {isExpanded && (
                  <ul className="space-y-2">
                    {group.tasks.map((task) => (
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
                              Due {formatDue(task.due)}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

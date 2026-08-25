import { storage } from 'wxt/utils/storage';

import type { CalendarEvent, GmailThread, TaskItem, TodaySnapshot } from '@/lib/google/api';

export interface CacheEntry<T> {
  updatedAt: number;
  data: T;
}

/** Soft-stale window for Google list caches (visibility / TTL refetch). */
export const GOOGLE_CACHE_STALE_MS = 5 * 60 * 1000;

export const gmailCacheItem = storage.defineItem<CacheEntry<GmailThread[]> | null>(
  'local:flyout.cache.gmail',
  { fallback: null },
);

export const calendarCacheItem = storage.defineItem<CacheEntry<CalendarEvent[]> | null>(
  'local:flyout.cache.calendar',
  { fallback: null },
);

/** v2: multi-list incomplete tasks (replaces single-list `flyout.cache.tasks`). */
export const tasksCacheItem = storage.defineItem<CacheEntry<TaskItem[]> | null>(
  'local:flyout.cache.tasks.v2',
  { fallback: null },
);

export const todayCacheItem = storage.defineItem<CacheEntry<TodaySnapshot> | null>(
  'local:flyout.cache.today',
  { fallback: null },
);

export async function setCacheEntry<T>(
  item: {
    setValue: (value: CacheEntry<T> | null) => Promise<void>;
  },
  data: T,
): Promise<void> {
  await item.setValue({ updatedAt: Date.now(), data });
}

/** Drop API list caches (e.g. on sign-out). Keep iframe state is not cached. */
export async function clearApiCaches(): Promise<void> {
  await Promise.all([
    gmailCacheItem.setValue(null),
    calendarCacheItem.setValue(null),
    tasksCacheItem.setValue(null),
    todayCacheItem.setValue(null),
  ]);
}

type TaskCompletedListener = (listId: string, taskId: string) => void;

const taskCompletedListeners = new Set<TaskCompletedListener>();

export function subscribeTaskCompleted(listener: TaskCompletedListener): () => void {
  taskCompletedListeners.add(listener);
  return () => taskCompletedListeners.delete(listener);
}

function notifyTaskCompleted(listId: string, taskId: string): void {
  for (const listener of taskCompletedListeners) {
    listener(listId, taskId);
  }
}

/** Remove a completed task from Today + Tasks caches and notify mounted panels. */
export async function removeTaskFromCaches(listId: string, taskId: string): Promise<void> {
  const tasksCache = await tasksCacheItem.getValue();
  if (tasksCache) {
    const next = tasksCache.data.filter((t) => t.listId !== listId || t.id !== taskId);
    await tasksCacheItem.setValue({ updatedAt: Date.now(), data: next });
  }

  const todayCache = await todayCacheItem.getValue();
  if (todayCache) {
    const next: TodaySnapshot = {
      ...todayCache.data,
      tasks: todayCache.data.tasks.filter((t) => t.listId !== listId || t.id !== taskId),
    };
    await todayCacheItem.setValue({ updatedAt: Date.now(), data: next });
  }

  notifyTaskCompleted(listId, taskId);
}

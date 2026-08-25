import { storage } from 'wxt/utils/storage';

import type { CalendarEvent, GmailThread, TaskItem, TodaySnapshot } from '@/lib/google/api';

export interface CacheEntry<T> {
  updatedAt: number;
  data: T;
}

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

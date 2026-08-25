import { useCallback, useEffect, useRef, useState } from 'react';

import { setCacheEntry, type CacheEntry } from '@/lib/cache';

type CacheItem<T> = {
  getValue: () => Promise<CacheEntry<T> | null>;
  setValue: (value: CacheEntry<T> | null) => Promise<void>;
};

/**
 * Stale-while-revalidate: paint cache immediately (if any), then refresh in the background.
 * Skeleton only when there is no cache yet.
 * `refetch` / `refreshToken` force-fetch from the network while keeping current data on screen —
 * never clears data and never toggles `loading` when rows are already shown.
 * `refreshing` is true only during manual refetch (for the nav spin affordance).
 */
export function useCachedFetch<T>(
  enabled: boolean,
  item: CacheItem<T>,
  fetcher: () => Promise<T>,
  empty: T,
  fallbackError: string,
  refreshToken = 0,
  onRefreshingChange?: (refreshing: boolean) => void,
) {
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  const generationRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  const itemRef = useRef(item);
  const fallbackErrorRef = useRef(fallbackError);
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  fetcherRef.current = fetcher;
  itemRef.current = item;
  fallbackErrorRef.current = fallbackError;
  onRefreshingChangeRef.current = onRefreshingChange;

  useEffect(() => {
    onRefreshingChangeRef.current?.(refreshing);
  }, [refreshing]);

  useEffect(() => {
    return () => onRefreshingChangeRef.current?.(false);
  }, []);

  const runFetch = useCallback(async (mode: 'load' | 'refetch') => {
    if (!enabled) return;
    const generation = ++generationRef.current;
    const hadData = hasDataRef.current;
    let hadCache = false;

    if (mode === 'load') {
      const cached = await itemRef.current.getValue();
      if (generation !== generationRef.current) return;

      if (cached) {
        hadCache = true;
        hasDataRef.current = true;
        setData(cached.data);
        setLoading(false);
      } else if (!hadData) {
        setLoading(true);
      }
      setError(null);
    } else {
      // Manual refresh (nav re-click): keep current rows; never skeleton if anything is painted.
      setRefreshing(true);
      setError(null);
    }

    try {
      const fresh = await fetcherRef.current();
      if (generation !== generationRef.current) return;
      setData(fresh);
      hasDataRef.current = true;
      setError(null);
      await setCacheEntry(itemRef.current, fresh);
    } catch (err) {
      if (generation !== generationRef.current) return;
      // Only surface errors when we have nothing useful to show.
      if (mode === 'load' ? !hadCache && !hadData : !hadData) {
        setError(err instanceof Error ? err.message : fallbackErrorRef.current);
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled]);

  const refetch = useCallback(async () => {
    await runFetch('refetch');
  }, [runFetch]);

  useEffect(() => {
    if (!enabled) return;
    void runFetch('load');
  }, [enabled, runFetch]);

  // Bump from AppLauncher when the already-active nav icon is clicked.
  // Gate on > 0 so the initial 0 does not double-fetch with the load effect.
  useEffect(() => {
    if (!enabled || refreshToken <= 0) return;
    void runFetch('refetch');
  }, [enabled, refreshToken, runFetch]);

  return { data, setData, loading, refreshing, error, setError, refetch };
}

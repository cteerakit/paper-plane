import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { listRowButtonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { gmailCacheItem } from '@/lib/cache';
import { fetchInboxThreads, getGmailThreadUrl } from '@/lib/google/api';
import { cn } from '@/lib/utils';

interface GmailSectionProps {
  enabled: boolean;
  /** Increment to force a network refetch while the panel stays mounted. */
  refreshToken?: number;
}

export function GmailSection({ enabled, refreshToken = 0 }: GmailSectionProps) {
  const { data: threads, loading, error } = useCachedFetch(
    enabled,
    gmailCacheItem,
    fetchInboxThreads,
    [],
    'Failed to load email',
    refreshToken,
  );

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
          <AlertTitle>Email unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && threads.length === 0 && (
        <p className="text-muted-foreground text-sm">Inbox is empty.</p>
      )}
      {!loading && !error && threads.length > 0 && (
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
                onClick={() => browser.tabs.create({ url: getGmailThreadUrl(thread.id) })}
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
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{thread.snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

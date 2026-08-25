import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cardSurfaceClass } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { calendarCacheItem } from '@/lib/cache';
import { fetchUpcomingEvents } from '@/lib/google/api';

interface CalendarSectionProps {
  enabled: boolean;
  /** Increment to force a network refetch while the panel stays mounted. */
  refreshToken?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
}

function formatEventWhen(start: string): string {
  if (!start) return '';
  if (start.length === 10) {
    const date = new Date(`${start}T00:00:00`);
    return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · All day`;
  }
  const date = new Date(start);
  const day = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function CalendarSection({
  enabled,
  refreshToken = 0,
  onRefreshingChange,
}: CalendarSectionProps) {
  const { data: events, loading, error } = useCachedFetch(
    enabled,
    calendarCacheItem,
    fetchUpcomingEvents,
    [],
    'Failed to load calendar',
    refreshToken,
    onRefreshingChange,
  );

  if (!enabled) return null;

  return (
    <div>
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Calendar unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && events.length === 0 && (
        <p className="text-muted-foreground text-sm">No upcoming events.</p>
      )}
      {!loading && !error && events.length > 0 && (
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
    </div>
  );
}

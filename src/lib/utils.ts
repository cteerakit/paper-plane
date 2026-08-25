import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const relativeTimeFormatter =
  typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
    ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    : null;

/**
 * Short relative label for a timestamp in ms (e.g. "2 minutes ago", "yesterday").
 * Returns null when the value is missing/invalid so callers can omit the UI.
 */
export function formatRelativeTime(timestampMs: number | undefined, now = Date.now()): string | null {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs <= 0) {
    return null;
  }
  if (!relativeTimeFormatter) return null;

  const diffSec = Math.round((timestampMs - now) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return relativeTimeFormatter.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return relativeTimeFormatter.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTimeFormatter.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 7) return relativeTimeFormatter.format(diffDay, 'day');
  const diffWeek = Math.round(diffDay / 7);
  if (Math.abs(diffWeek) < 5) return relativeTimeFormatter.format(diffWeek, 'week');
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return relativeTimeFormatter.format(diffMonth, 'month');
  return relativeTimeFormatter.format(Math.round(diffDay / 365), 'year');
}

import { clearApiCaches } from '@/lib/cache';

const GOOGLE_API = 'https://www.googleapis.com';
const GMAIL_API = 'https://gmail.googleapis.com';

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

export interface GmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  unread: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  meetLink?: string;
  htmlLink?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  due?: string;
  status: 'needsAction' | 'completed';
  listId: string;
}

export interface GoogleFetchInit extends RequestInit {
  /** OAuth retry on 401 — defaults to !silent */
  interactiveOnRetry?: boolean;
  /** Background list loads — non-interactive OAuth retry */
  silent?: boolean;
}

const MAX_TRANSIENT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function getAuthToken(interactive = false): Promise<string> {
  const result = await browser.identity.getAuthToken({ interactive });
  const token = result.token;
  if (!token) {
    throw new Error('Failed to get Google auth token');
  }
  return token;
}

async function removeCachedToken(token: string): Promise<void> {
  await browser.identity.removeCachedAuthToken({ token });
}

export async function clearAllAuthTokens(): Promise<void> {
  await browser.identity.clearAllCachedAuthTokens();
}

/** Best-effort server revoke so the next interactive getAuthToken can show the account picker. */
async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(
      `https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`,
    );
  } catch {
    // ignore network errors; local cache clear still proceeds
  }
}

export async function googleFetch(url: string, options: GoogleFetchInit = {}): Promise<Response> {
  const { interactiveOnRetry, silent = false, ...requestInit } = options;
  const interactive = interactiveOnRetry ?? !silent;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      let token = await getAuthToken(false);
      const headers = {
        ...requestInit.headers,
        Authorization: `Bearer ${token}`,
      };
      // Always hit the network — manual nav refresh must not reuse HTTP cache.
      const init: RequestInit = { ...requestInit, cache: 'no-store', headers };
      let response = await fetch(url, init);

      if (response.status === 401) {
        await removeCachedToken(token);
        token = await getAuthToken(interactive);
        response = await fetch(url, {
          ...init,
          headers: {
            ...requestInit.headers,
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (isTransientStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
        const retryAfter =
          response.status === 429 ? parseRetryAfterMs(response) : null;
        const delay = retryAfter ?? Math.min(1000 * 2 ** attempt, 8000);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (err) {
      if (attempt < MAX_TRANSIENT_RETRIES) {
        await sleep(Math.min(1000 * 2 ** attempt, 8000));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Google API request failed after retries');
}

export async function signIn(): Promise<void> {
  await getAuthToken(true);
}

/** Non-interactive check — does not open the OAuth consent UI. */
export async function isSignedIn(): Promise<boolean> {
  try {
    await getAuthToken(false);
    return true;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  try {
    const token = await getAuthToken(false);
    await revokeToken(token);
  } catch {
    // already signed out or token unavailable
  }
  await clearAllAuthTokens();
  await clearApiCaches();
}

/**
 * Forget the current Chrome identity account choice and prompt again
 * (account picker / consent). Clears API list caches so panels reload.
 */
export async function switchAccount(): Promise<GoogleUser> {
  try {
    const token = await getAuthToken(false);
    await revokeToken(token);
  } catch {
    // no cached token yet
  }
  await clearAllAuthTokens();
  await clearApiCaches();
  await getAuthToken(true);
  return getUserInfo();
}

export async function getUserInfo(): Promise<GoogleUser> {
  const response = await googleFetch(`${GOOGLE_API}/oauth2/v3/userinfo`);
  if (!response.ok) {
    throw new Error(`User info failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    email: data.email,
    name: data.name ?? data.email,
    picture: data.picture,
  };
}

function parseEmailHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? '';
}

export async function fetchInboxThreads(max = 8): Promise<GmailThread[]> {
  const params = new URLSearchParams({
    maxResults: String(max),
    labelIds: 'INBOX',
  });
  return fetchGmailThreads(params);
}

/** Local calendar day bounds as Date objects (start inclusive, end exclusive-ish via end-of-day). */
function localDayBounds(day = new Date()): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function localDateParts(d = new Date()): { y: number; m: number; day: number } {
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}

/** Gmail search date as YYYY/M/D (no zero-pad required). */
function gmailSearchDate(d: Date): string {
  const { y, m, day } = localDateParts(d);
  return `${y}/${m}/${day}`;
}

async function fetchGmailThreads(params: URLSearchParams): Promise<GmailThread[]> {
  const listRes = await googleFetch(
    `${GMAIL_API}/gmail/v1/users/me/messages?${params}`,
    { silent: true },
  );
  if (!listRes.ok) {
    throw new Error(`Gmail list failed: ${listRes.status}`);
  }
  const list = await listRes.json();
  const messages = list.messages ?? [];

  const threads: GmailThread[] = [];
  for (const msg of messages) {
    const detailRes = await googleFetch(
      `${GMAIL_API}/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { silent: true },
    );
    if (!detailRes.ok) continue;
    const detail = await detailRes.json();
    const headers = detail.payload?.headers ?? [];
    const labelIds: string[] = detail.labelIds ?? [];
    threads.push({
      id: detail.id,
      subject: parseEmailHeader(headers, 'Subject') || '(No subject)',
      from: parseEmailHeader(headers, 'From'),
      snippet: detail.snippet ?? '',
      unread: labelIds.includes('UNREAD'),
    });
  }
  return threads;
}

/** Inbox messages received on the local calendar day. */
export async function fetchTodayThreads(max = 12): Promise<GmailThread[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const params = new URLSearchParams({
    maxResults: String(max),
    q: `in:inbox after:${gmailSearchDate(today)} before:${gmailSearchDate(tomorrow)}`,
  });
  return fetchGmailThreads(params);
}

export function getGmailThreadUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

function mapCalendarItems(items: Record<string, unknown>[]): CalendarEvent[] {
  return items.map((event) => {
    const start = event.start as { dateTime?: string; date?: string };
    const end = event.end as { dateTime?: string; date?: string };
    const conference = event.conferenceData as {
      entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    } | undefined;

    let meetLink = (event.hangoutLink as string | undefined) ?? undefined;
    if (!meetLink && conference?.entryPoints) {
      const video = conference.entryPoints.find((e) => e.entryPointType === 'video');
      meetLink = video?.uri;
    }

    return {
      id: event.id as string,
      title: (event.summary as string) || '(No title)',
      start: start.dateTime ?? start.date ?? '',
      end: end.dateTime ?? end.date,
      meetLink,
      htmlLink: event.htmlLink as string | undefined,
    };
  });
}

async function fetchCalendarEvents(timeMin: Date, timeMax: Date, maxResults = 50): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });

  const response = await googleFetch(
    `${GOOGLE_API}/calendar/v3/calendars/primary/events?${params}`,
    { silent: true },
  );
  if (!response.ok) {
    throw new Error(`Calendar failed: ${response.status}`);
  }
  const data = await response.json();
  return mapCalendarItems(data.items ?? []);
}

export async function fetchUpcomingEvents(): Promise<CalendarEvent[]> {
  const { start: timeMin } = localDayBounds();
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 7);
  timeMax.setHours(23, 59, 59, 999);
  return fetchCalendarEvents(timeMin, timeMax);
}

/** Events occurring on the local calendar day (all-day + timed). */
export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const { start, end } = localDayBounds();
  return fetchCalendarEvents(start, end);
}

export async function fetchTaskLists(): Promise<Array<{ id: string; title: string }>> {
  const response = await googleFetch(`${GOOGLE_API}/tasks/v1/users/@me/lists`, { silent: true });
  if (!response.ok) {
    throw new Error(`Task lists failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.items ?? []).map((list: { id: string; title: string }) => ({
    id: list.id,
    title: list.title,
  }));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function fetchIncompleteTasksForList(
  listId: string,
  maxResults: number,
): Promise<TaskItem[]> {
  const response = await googleFetch(
    `${GOOGLE_API}/tasks/v1/lists/${listId}/tasks?showCompleted=false&maxResults=${maxResults}`,
    { silent: true },
  );
  if (!response.ok) {
    throw new Error(`Tasks failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.items ?? []).map((task: Record<string, unknown>) => ({
    id: task.id as string,
    title: (task.title as string) || '(No title)',
    due: task.due as string | undefined,
    status: (task.status as 'needsAction' | 'completed') ?? 'needsAction',
    listId,
  }));
}

/** Incomplete tasks from every task list (parallel, concurrency-capped). */
export async function fetchIncompleteTasks(
  maxPerList = 100,
  listConcurrency = 4,
): Promise<TaskItem[]> {
  const lists = await fetchTaskLists();
  if (lists.length === 0) return [];

  const perList = await mapPool(lists, listConcurrency, (list) =>
    fetchIncompleteTasksForList(list.id, maxPerList),
  );
  return perList.flat();
}

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Google Tasks `due` is midnight UTC for a calendar day — compare by YYYY-MM-DD. */
function taskDueDateKey(due: string): string {
  return due.slice(0, 10);
}

/**
 * Incomplete tasks due today or overdue (still relevant for "today").
 * Excludes future-dated and undated tasks.
 */
export async function fetchTodayTasks(
  maxPerList = 100,
  listConcurrency = 4,
): Promise<TaskItem[]> {
  const tasks = await fetchIncompleteTasks(maxPerList, listConcurrency);
  const today = localDateKey();
  return tasks
    .filter((task) => task.due && taskDueDateKey(task.due) <= today)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
}

export interface TodaySnapshot {
  events: CalendarEvent[];
  tasks: TaskItem[];
  threads: GmailThread[];
}

/** Calendar + tasks + mail scoped to the local calendar day. */
export async function fetchTodaySnapshot(): Promise<TodaySnapshot> {
  const [events, tasks, threads] = await Promise.all([
    fetchTodayEvents(),
    fetchTodayTasks(),
    fetchTodayThreads(),
  ]);
  return { events, tasks, threads };
}

export async function completeTask(listId: string, taskId: string): Promise<void> {
  const response = await googleFetch(
    `${GOOGLE_API}/tasks/v1/lists/${listId}/tasks/${taskId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    },
  );
  if (!response.ok) {
    throw new Error(`Task update failed: ${response.status}`);
  }
}

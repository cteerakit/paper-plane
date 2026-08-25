export interface ClosedTab {
  sessionId: string;
  title: string;
  url: string;
  favIconUrl?: string;
  /** Close time in ms since epoch (normalized from chrome.sessions `lastModified`). */
  lastModified?: number;
}

const MAX_RECENTLY_CLOSED = 5;

const SESSIONS_UNAVAILABLE_MESSAGE =
  'Reload Paper Plane on chrome://extensions to enable Recently Closed.';

type SessionsApi = {
  getRecentlyClosed: (filter?: { maxResults?: number }) => Promise<
    Array<{
      /** Chrome documents this as seconds since epoch. */
      lastModified?: number;
      tab?: { sessionId?: string; title?: string; url?: string; favIconUrl?: string };
    }>
  >;
  restore: (sessionId: string) => Promise<unknown>;
  onChanged?: {
    addListener: (callback: () => void) => void;
    removeListener: (callback: () => void) => void;
  };
};

/**
 * Normalize chrome.sessions `lastModified` to ms.
 * Chrome documents seconds; values already in ms (e.g. Firefox) pass through.
 */
function sessionLastModifiedToMs(lastModified: number | undefined): number | undefined {
  if (typeof lastModified !== 'number' || !Number.isFinite(lastModified) || lastModified <= 0) {
    return undefined;
  }
  // Seconds ≈ 1e9 today; ms ≈ 1e12. Threshold separates the two.
  return lastModified < 1e12 ? lastModified * 1000 : lastModified;
}

/**
 * Resolve the sessions API from `browser` (WXT) or `chrome` (Chromium).
 * Permission must be in the manifest and the extension reloaded after adding it.
 */
function getSessionsApi(): SessionsApi | null {
  try {
    const fromBrowser =
      typeof browser !== 'undefined'
        ? (browser as { sessions?: SessionsApi }).sessions
        : undefined;
    if (
      fromBrowser &&
      typeof fromBrowser.getRecentlyClosed === 'function' &&
      typeof fromBrowser.restore === 'function'
    ) {
      return fromBrowser;
    }
  } catch {
    // Fall through to chrome.*
  }

  try {
    const chromeGlobal = (globalThis as { chrome?: { sessions?: SessionsApi } }).chrome;
    const fromChrome = chromeGlobal?.sessions;
    if (
      fromChrome &&
      typeof fromChrome.getRecentlyClosed === 'function' &&
      typeof fromChrome.restore === 'function'
    ) {
      return fromChrome;
    }
  } catch {
    // Unavailable
  }

  return null;
}

/** True when the sessions API is present (permission granted + extension reloaded). */
export function isSessionsApiAvailable(): boolean {
  return getSessionsApi() !== null;
}

/**
 * List recently closed tabs (not whole windows), newest first, up to `limit`.
 * Requests extra sessions from Chrome so window entries do not crowd out tabs.
 */
export async function listRecentlyClosedTabs(
  limit = MAX_RECENTLY_CLOSED,
): Promise<ClosedTab[]> {
  const api = getSessionsApi();
  if (!api) {
    throw new Error(SESSIONS_UNAVAILABLE_MESSAGE);
  }

  const sessions = await api.getRecentlyClosed({
    // Chrome caps at 25; fetch enough that filtering windows still yields `limit` tabs.
    maxResults: 25,
  });

  const closed: ClosedTab[] = [];
  for (const session of sessions) {
    const tab = session.tab;
    if (!tab?.sessionId) continue;
    const lastModified = sessionLastModifiedToMs(session.lastModified);
    closed.push({
      sessionId: tab.sessionId,
      title: tab.title?.trim() || tab.url || 'Untitled',
      url: tab.url ?? '',
      favIconUrl: tab.favIconUrl,
      ...(lastModified !== undefined ? { lastModified } : {}),
    });
    if (closed.length >= limit) break;
  }
  return closed;
}

/** Restore a closed tab (or window) by its session id. */
export async function restoreClosedSession(sessionId: string): Promise<void> {
  const api = getSessionsApi();
  if (!api) {
    throw new Error(SESSIONS_UNAVAILABLE_MESSAGE);
  }
  await api.restore(sessionId);
}

/** Subscribe to recently-closed list changes. Returns unsubscribe. */
export function subscribeSessionsChanged(onChange: () => void): () => void {
  const api = getSessionsApi();
  if (!api?.onChanged?.addListener) return () => {};

  try {
    api.onChanged.addListener(onChange);
    return () => {
      try {
        api.onChanged?.removeListener(onChange);
      } catch {
        // Ignore cleanup failures if the API disappeared mid-session.
      }
    };
  } catch {
    return () => {};
  }
}

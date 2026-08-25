export interface OpenTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  muted: boolean;
  /** True while the tab is producing sound (Chrome `tab.audible`). */
  audible: boolean;
  /**
   * Chrome 140+ Split View id. `undefined` when the tab is not in a split
   * (`tabs.SPLIT_VIEW_ID_NONE` / missing on older Chrome).
   */
  splitViewId?: number;
}

/** Chrome `tabs.SPLIT_VIEW_ID_NONE` — tab is not in a Split View. */
const SPLIT_VIEW_ID_NONE = -1;

function readSplitViewId(tab: { splitViewId?: number }): number | undefined {
  const value = tab.splitViewId;
  if (typeof value !== 'number' || value <= SPLIT_VIEW_ID_NONE) return undefined;
  return value;
}

/**
 * List open tabs from **normal** browser windows only.
 *
 * Interpretation: installed PWAs open as `windows.WindowType` `"app"` and should not
 * appear in Open tabs (the PWA shell is not a browser tab the user wants listed).
 * Tabs inside other `normal` windows are included; when multiple normal windows exist,
 * callers can group by `windowId`. Excludes `app`, `popup`, and `devtools` windows.
 */
export async function listOpenTabs(): Promise<OpenTab[]> {
  const windows = await browser.windows.getAll({
    populate: true,
    windowTypes: ['normal'],
  });

  const ordered = [...windows].sort((a, b) => {
    if (a.focused !== b.focused) return a.focused ? -1 : 1;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  const result: OpenTab[] = [];
  for (const win of ordered) {
    if (typeof win.id !== 'number') continue;
    for (const tab of win.tabs ?? []) {
      if (typeof tab.id !== 'number') continue;
      result.push({
        id: tab.id,
        windowId: win.id,
        title: tab.title?.trim() || tab.url || 'Untitled',
        url: tab.url ?? '',
        favIconUrl: tab.favIconUrl,
        active: tab.active ?? false,
        pinned: tab.pinned ?? false,
        muted: tab.mutedInfo?.muted ?? false,
        audible: tab.audible ?? false,
        splitViewId: readSplitViewId(tab),
      });
    }
  }
  return result;
}

/** Focus the given tab and its window. No-ops tab activation when already active. */
export async function activateTab(tabId: number, windowId: number): Promise<void> {
  const existing = await browser.tabs.get(tabId);
  if (!existing.active) {
    await browser.tabs.update(tabId, { active: true });
  }
  const win = await browser.windows.get(windowId);
  if (!win.focused) {
    await browser.windows.update(windowId, { focused: true });
  }
}

/** Open a new blank tab in the current / last-focused window. */
export async function createNewTab(): Promise<void> {
  await browser.tabs.create({});
}

/**
 * Duplicate a tab into a new unpinned tab in the same window.
 * Uses Chrome’s duplicate API, then unpins when the source was pinned so the
 * copy lands in the regular open-tab strip.
 */
export async function duplicateOpenTab(tabId: number): Promise<void> {
  const created = await browser.tabs.duplicate(tabId);
  if (typeof created?.id === 'number' && created.pinned) {
    await browser.tabs.update(created.id, { pinned: false });
  }
}

/** Chrome Split View pane arrangement (matches `split_tabs::SplitTabLayout`). */
export type SplitViewLayout = 'sideBySide' | 'stacked';

/**
 * `tabs.create` options Chrome accepts for opening a Split View.
 * `splitWithTabId` is real but `nodoc` in Chromium’s tabs.json; `splitLayout`
 * matches internal SplitTabLayout names when the build supports stacked splits.
 */
type CreateTabInSplitProperties = {
  windowId?: number;
  index?: number;
  active?: boolean;
  splitWithTabId: number;
  splitLayout?: SplitViewLayout;
};

/**
 * Open `tab` in a new Split View with the chosen layout — same path Chrome’s
 * Bookmarks side panel uses (`tabs.create` + `splitWithTabId`).
 *
 * Creates a partner tab beside `tab` and puts both in a Split View. Defaults to
 * side-by-side when the browser ignores/rejects `splitLayout`.
 */
export async function openTabInSplitView(
  tab: Pick<OpenTab, 'id' | 'windowId' | 'splitViewId' | 'pinned'>,
  layout: SplitViewLayout,
): Promise<void> {
  if (tab.splitViewId != null) {
    throw new Error('This tab is already in a Split View');
  }

  // Split View is for regular tabs; unpin first so Chrome will accept the pair.
  if (tab.pinned) {
    await browser.tabs.update(tab.id, { pinned: false });
  }

  const existing = await browser.tabs.get(tab.id);
  const index = typeof existing.index === 'number' ? existing.index + 1 : undefined;

  const withLayout: CreateTabInSplitProperties = {
    windowId: tab.windowId,
    index,
    active: true,
    splitWithTabId: tab.id,
    splitLayout: layout,
  };

  try {
    await browser.tabs.create(withLayout as Parameters<typeof browser.tabs.create>[0]);
    return;
  } catch (err) {
    // Older builds reject unknown `splitLayout`; retry with Chrome’s default (side-by-side).
    const message = err instanceof Error ? err.message : String(err);
    if (!/unexpected property|splitLayout/i.test(message)) {
      throw err instanceof Error ? err : new Error(message);
    }
  }

  const { splitLayout: _ignored, ...withoutLayout } = withLayout;
  await browser.tabs.create(withoutLayout as Parameters<typeof browser.tabs.create>[0]);
}

/** Reorder a tab within a window (Chrome tab strip index). */
export async function moveOpenTab(
  tabId: number,
  index: number,
  windowId: number,
): Promise<void> {
  await browser.tabs.move(tabId, { index, windowId });
}

/**
 * Reorder one or more tabs. Prefer this over sequential `moveOpenTab` calls
 * when the tabs should stay in the given relative order.
 */
export async function moveOpenTabs(
  tabIds: number[],
  index: number,
  windowId: number,
): Promise<void> {
  if (tabIds.length === 0) return;
  await browser.tabs.move(tabIds, { index, windowId });
}

/** Close a tab by id. List refresh is handled by `tabs.onRemoved` listeners. */
export async function closeOpenTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId);
}

/** Pin or unpin a tab in Chrome’s native tab strip. */
export async function setTabPinned(tabId: number, pinned: boolean): Promise<void> {
  await browser.tabs.update(tabId, { pinned });
}

/** Mute or unmute a tab in Chrome’s native tab strip. */
export async function setTabMuted(tabId: number, muted: boolean): Promise<void> {
  await browser.tabs.update(tabId, { muted });
}

/**
 * Normalize a user-entered URL for `tabs.update`.
 * Trims whitespace; if there is no scheme, prepends `https://`.
 * Returns `null` when empty or not a valid absolute URL.
 */
export function normalizeTabUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname && parsed.protocol !== 'file:') {
      // e.g. "https://" with no host
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** Navigate a tab to a new URL. */
export async function updateTabUrl(tabId: number, url: string): Promise<void> {
  await browser.tabs.update(tabId, { url });
}

/**
 * Whether `chrome.scripting.executeScript` can typically run in this tab.
 * Restricted schemes (chrome://, edge://, …), stores, and PDFs are excluded.
 */
export function canRenameTabTitle(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'chromewebstore.google.com') return false;
  if (host === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
    return false;
  }
  if (
    host === 'microsoftedge.microsoft.com' &&
    parsed.pathname.toLowerCase().includes('/addons')
  ) {
    return false;
  }

  // Built-in PDF viewer / direct PDF URLs usually reject scripting.
  if (/\.pdf$/i.test(parsed.pathname)) return false;

  return true;
}

/**
 * Set the tab’s document title via scripting (Chrome has no `tabs.update({ title })`).
 * Requires the `scripting` permission and host access for the tab’s URL.
 */
export async function renameOpenTabTitle(tabId: number, title: string): Promise<void> {
  const next = title.trim();
  if (!next) {
    throw new Error('Title cannot be empty');
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: (newTitle: string) => {
        document.title = newTitle;
      },
      args: [next],
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (
      /cannot access|cannot be scripted|missing host permission|extension manifest must request/i.test(
        raw,
      )
    ) {
      throw new Error('Cannot rename this page');
    }
    throw new Error('Could not rename tab');
  }
}

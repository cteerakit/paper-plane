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

/**
 * Last non-fullscreen state per window, so exiting fullscreen can restore
 * maximized (or normal) instead of always collapsing to a restored window.
 */
const fullscreenRestoreStateByWindowId = new Map<number, 'normal' | 'maximized'>();

async function getTargetNormalWindow(): Promise<Browser.windows.Window | undefined> {
  try {
    const current = await browser.windows.getCurrent();
    if (current.type === 'normal' && typeof current.id === 'number') {
      return current;
    }
  } catch {
    // Side panel / callers without a current window fall through.
  }
  try {
    return await browser.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return undefined;
  }
}

/**
 * Toggle native browser-window fullscreen (same state as F11).
 * Remembers maximized vs normal so exit restores the prior window mode.
 *
 * Note: Chromium’s `windows.update({ state: 'fullscreen' })` calls `Restore()`
 * when the window is maximized before entering fullscreen, so the transition
 * animates differently from pressing F11.
 */
export async function toggleFocusedWindowFullscreen(): Promise<void> {
  const win = await getTargetNormalWindow();
  if (!win || typeof win.id !== 'number') return;

  if (win.state === 'fullscreen') {
    const restore = fullscreenRestoreStateByWindowId.get(win.id) ?? 'maximized';
    fullscreenRestoreStateByWindowId.delete(win.id);
    await browser.windows.update(win.id, { state: restore, focused: true });
    return;
  }

  const prior: 'normal' | 'maximized' =
    win.state === 'maximized' ? 'maximized' : 'normal';
  fullscreenRestoreStateByWindowId.set(win.id, prior);

  // Enter fullscreen in one step. Going via `normal` first causes the
  // restore-sized intermediate frame users see as a weird animation.
  await browser.windows.update(win.id, { state: 'fullscreen', focused: true });
}

/** Whether the side panel’s host (or last-focused normal) window is fullscreen. */
export async function isFocusedWindowFullscreen(): Promise<boolean> {
  const win = await getTargetNormalWindow();
  return win?.state === 'fullscreen';
}

/**
 * Subscribe to fullscreen changes for the target normal window.
 * Returns an unsubscribe function.
 */
export function subscribeFocusedWindowFullscreen(
  listener: (fullscreen: boolean) => void,
): () => void {
  let cancelled = false;

  const emit = () => {
    void isFocusedWindowFullscreen().then((fullscreen) => {
      if (!cancelled) listener(fullscreen);
    });
  };

  emit();

  const onFocusChanged = () => {
    emit();
  };
  browser.windows.onFocusChanged.addListener(onFocusChanged);

  // Bounds/state changes (including F11 / Esc) — available in modern Chrome.
  const onBoundsChanged =
    typeof browser.windows.onBoundsChanged?.addListener === 'function'
      ? () => {
          emit();
        }
      : null;
  if (onBoundsChanged) {
    browser.windows.onBoundsChanged.addListener(onBoundsChanged);
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') emit();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);

  return () => {
    cancelled = true;
    browser.windows.onFocusChanged.removeListener(onFocusChanged);
    if (onBoundsChanged) {
      browser.windows.onBoundsChanged.removeListener(onBoundsChanged);
    }
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onVisibility);
  };
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

/** Chrome Split View pane arrangement (UI labels; API currently defaults to side-by-side). */
export type SplitViewLayout = 'sideBySide' | 'stacked';

/**
 * `tabs.create` options for opening a Split View.
 *
 * `splitWithTabId` landed in Chromium mid-Aug 2026 (`nodoc`, behind
 * `ApiTabsSplitView` which is off by default). Stable Chrome still rejects it
 * as an unexpected property. There is no `splitLayout` create property.
 */
type CreateTabInSplitProperties = {
  windowId?: number;
  index?: number;
  active?: boolean;
  splitWithTabId: number;
};

/** Shown when this Chrome build can’t create Split Views via the extensions API. */
export const SPLIT_VIEW_CREATE_UNAVAILABLE =
  'Chrome can’t create Split Views from extensions yet. Use Chrome’s tab menu, or try Canary with --enable-features=ApiTabsSplitView.';

/** Shown when the create API exists but the feature flag ignored the request. */
export const SPLIT_VIEW_CREATE_FLAG_DISABLED =
  'Split View create API is present but disabled. Restart Chrome with --enable-features=ApiTabsSplitView.';

/** Cached after a schema rejection so the UI can disable the menu. */
let splitViewCreateUnsupported = false;

/** Whether this session already saw Chrome reject `splitWithTabId`. */
export function isSplitViewCreateUnsupported(): boolean {
  return splitViewCreateUnsupported;
}

/**
 * Open `tab` in a new Split View via `tabs.create({ splitWithTabId })`.
 *
 * Requires a Chromium build that includes `splitWithTabId` (Canary / very new)
 * and `ApiTabsSplitView` enabled. Layout (side-by-side vs stacked) is not
 * exposed yet — both menu options use Chrome’s default.
 */
export async function openTabInSplitView(
  tab: Pick<OpenTab, 'id' | 'windowId' | 'splitViewId' | 'pinned'>,
  _layout: SplitViewLayout,
): Promise<void> {
  if (splitViewCreateUnsupported) {
    throw new Error(SPLIT_VIEW_CREATE_UNAVAILABLE);
  }

  if (tab.splitViewId != null) {
    throw new Error('This tab is already in a Split View');
  }

  // Split View is for regular tabs; unpin first so Chrome will accept the pair.
  if (tab.pinned) {
    await browser.tabs.update(tab.id, { pinned: false });
  }

  // Always read live tab state — stale windowId/index from React state makes
  // Chrome reject splitWithTabId (wrong window / non-adjacent index).
  const existing = await browser.tabs.get(tab.id);
  if (readSplitViewId(existing as { splitViewId?: number }) != null) {
    throw new Error('This tab is already in a Split View');
  }

  // Activate first so the partner lands next to the focused tab.
  if (!existing.active) {
    await browser.tabs.update(tab.id, { active: true });
  }

  // Re-read after activate/unpin — index can shift.
  const live = await browser.tabs.get(tab.id);
  if (typeof live.index !== 'number' || typeof live.windowId !== 'number') {
    throw new Error('Could not resolve tab position for Split View');
  }

  // Chrome validates adjacency *before* OpenTabHelper runs. Omitting index
  // defaults to -1, which fails "not adjacent" — always pass splitIndex + 1.
  const createProperties: CreateTabInSplitProperties = {
    windowId: live.windowId,
    index: live.index + 1,
    active: true,
    splitWithTabId: tab.id,
  };

  let created: { id?: number } | undefined;
  try {
    created = (await browser.tabs.create(
      createProperties as Parameters<typeof browser.tabs.create>[0],
    )) as { id?: number } | undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Schema rejection — Stable / older builds don’t know splitWithTabId yet.
    if (/unexpected property/i.test(message)) {
      splitViewCreateUnsupported = true;
      throw new Error(SPLIT_VIEW_CREATE_UNAVAILABLE);
    }
    throw err instanceof Error ? err : new Error(message);
  }

  // When ApiTabsSplitView is off, Chrome may accept the property but ignore it
  // and create a normal tab — detect that and clean up.
  const partnerId = created?.id;
  if (typeof partnerId !== 'number') {
    throw new Error('Failed to create split view');
  }

  const [source, partner] = await Promise.all([
    browser.tabs.get(tab.id),
    browser.tabs.get(partnerId),
  ]);
  const sourceSplit = readSplitViewId(source as { splitViewId?: number });
  const partnerSplit = readSplitViewId(partner as { splitViewId?: number });

  if (sourceSplit == null || partnerSplit == null || sourceSplit !== partnerSplit) {
    try {
      await browser.tabs.remove(partnerId);
    } catch {
      // Partner may already be gone if Chrome rolled back a failed split.
    }
    throw new Error(SPLIT_VIEW_CREATE_FLAG_DISABLED);
  }
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

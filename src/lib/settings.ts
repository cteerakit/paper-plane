import { storage } from 'wxt/utils/storage';

export type LauncherAppId = 'today' | 'gmail' | 'calendar' | 'keep' | 'tasks' | 'tabs';

/** Any side-panel page the user can leave open (launcher apps + Settings). */
export type AppViewId = LauncherAppId | 'settings';

export const LAUNCHER_APPS: Array<{ id: LauncherAppId; label: string }> = [
  { id: 'tabs', label: 'Tabs' },
  { id: 'today', label: 'Today' },
  { id: 'gmail', label: 'Email' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'tasks', label: 'Task' },
  { id: 'keep', label: 'Note' },
];

export type EnabledApps = Record<LauncherAppId, boolean>;

export const DEFAULT_ENABLED_APPS: EnabledApps = {
  today: true,
  gmail: true,
  calendar: true,
  keep: true,
  tasks: true,
  tabs: true,
};

/** Canonical launcher order when nothing is saved yet. */
export const DEFAULT_APP_ORDER: LauncherAppId[] = LAUNCHER_APPS.map((app) => app.id);

/** Default app on fresh install / empty storage. */
export const DEFAULT_DEFAULT_APP: LauncherAppId = 'tabs';

/** Previous shipped default before Tabs became the default. */
export const PREVIOUS_DEFAULT_APP: LauncherAppId = 'today';

/** Hardcoded default before Today existed. */
export const LEGACY_DEFAULT_APP: LauncherAppId = 'calendar';

/**
 * Bumped when the shipped default app changes.
 * Used as a one-shot so prior Today/Calendar defaults migrate to Tabs even if
 * `tabs` was already merged into enabledApps from an earlier Tabs-feature build.
 */
export const DEFAULT_APP_GENERATION = 2;

/** Fallback when no enabled default can be resolved. */
export const DEFAULT_APP_FALLBACK: LauncherAppId = DEFAULT_DEFAULT_APP;

/**
 * True when upgrading into Tabs-as-default and the stored default is still a
 * prior shipped default (Today or Calendar), not an intentional pick of another app.
 *
 * One-shot via missing `tabs` in enabledApps (same idea as Calendar→Today), or via
 * `defaultAppGeneration` when Tabs was already present but Today was still the shipped default.
 */
export function shouldMigrateDefaultToTabs(
  storedEnabled: Partial<EnabledApps> | null | undefined,
  preferred: LauncherAppId,
  generation = 0,
): boolean {
  if (preferred !== PREVIOUS_DEFAULT_APP && preferred !== LEGACY_DEFAULT_APP) {
    return false;
  }
  if (storedEnabled?.tabs === undefined) return true;
  // Tabs already merged earlier; still move prior shipped Today default once.
  return generation < DEFAULT_APP_GENERATION && preferred === PREVIOUS_DEFAULT_APP;
}

export const enabledAppsItem = storage.defineItem<EnabledApps>('local:flyout.enabledApps', {
  fallback: DEFAULT_ENABLED_APPS,
});

export const defaultAppItem = storage.defineItem<LauncherAppId>('local:flyout.defaultApp', {
  fallback: DEFAULT_DEFAULT_APP,
});

export const appOrderItem = storage.defineItem<LauncherAppId[]>('local:flyout.appOrder', {
  fallback: DEFAULT_APP_ORDER,
});

/** Tracks which shipped-default generation this install has applied. */
export const defaultAppGenerationItem = storage.defineItem<number>(
  'local:flyout.defaultAppGeneration',
  { fallback: 0 },
);

/** Last viewed side-panel page; used when reopening the panel. */
export const lastAppItem = storage.defineItem<AppViewId | null>('local:flyout.lastAppId', {
  fallback: null,
});

export type NavPosition = 'top' | 'bottom' | 'left' | 'right';
export type NavAlign = 'start' | 'center' | 'end';
export type ColorTheme = 'light' | 'dark' | 'system';
/** Where the New tab control sits on the Tabs page. */
export type NewTabPosition = 'top' | 'bottom';

/** Matches current top bar with icons packed to the start (left). */
export const DEFAULT_NAV_POSITION: NavPosition = 'top';
export const DEFAULT_NAV_ALIGN: NavAlign = 'start';
export const DEFAULT_COLOR_THEME: ColorTheme = 'system';
/** After open tabs in the scrollable list. */
export const DEFAULT_NEW_TAB_POSITION: NewTabPosition = 'bottom';

export const navPositionItem = storage.defineItem<NavPosition>('local:flyout.navPosition', {
  fallback: DEFAULT_NAV_POSITION,
});

export const navAlignItem = storage.defineItem<NavAlign>('local:flyout.navAlign', {
  fallback: DEFAULT_NAV_ALIGN,
});

export const colorThemeItem = storage.defineItem<ColorTheme>('local:flyout.theme', {
  fallback: DEFAULT_COLOR_THEME,
});

export const newTabPositionItem = storage.defineItem<NewTabPosition>(
  'local:flyout.newTabPosition',
  { fallback: DEFAULT_NEW_TAB_POSITION },
);

const NAV_POSITIONS: readonly NavPosition[] = ['top', 'bottom', 'left', 'right'];
const NAV_ALIGNS: readonly NavAlign[] = ['start', 'center', 'end'];
const COLOR_THEMES: readonly ColorTheme[] = ['light', 'dark', 'system'];
const NEW_TAB_POSITIONS: readonly NewTabPosition[] = ['top', 'bottom'];

export function isNavPosition(value: unknown): value is NavPosition {
  return typeof value === 'string' && (NAV_POSITIONS as readonly string[]).includes(value);
}

export function isNavAlign(value: unknown): value is NavAlign {
  return typeof value === 'string' && (NAV_ALIGNS as readonly string[]).includes(value);
}

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value);
}

export function isNewTabPosition(value: unknown): value is NewTabPosition {
  return typeof value === 'string' && (NEW_TAB_POSITIONS as readonly string[]).includes(value);
}

export function parseNavPosition(value: unknown): NavPosition {
  return isNavPosition(value) ? value : DEFAULT_NAV_POSITION;
}

export function parseNavAlign(value: unknown): NavAlign {
  return isNavAlign(value) ? value : DEFAULT_NAV_ALIGN;
}

export function parseColorTheme(value: unknown): ColorTheme {
  return isColorTheme(value) ? value : DEFAULT_COLOR_THEME;
}

/** Maps current and legacy (`above` / `below` / sticky `bottom`) values. */
export function parseNewTabPosition(value: unknown): NewTabPosition {
  if (value === 'top' || value === 'above') return 'top';
  if (value === 'bottom' || value === 'below') return 'bottom';
  return DEFAULT_NEW_TAB_POSITION;
}

/**
 * Whether the document should use the `.dark` class for the given preference.
 * For Appearance "System" with a browser theme, prefer `syncDocumentAppearance`
 * in `@/lib/chrome-theme` (Chrome colors + luminance) instead of this alone.
 */
export function shouldUseDarkClass(theme: ColorTheme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Toggle `dark` on `<html>` from the stored theme preference (fixed Light/Dark,
 * or OS scheme when System has no browser theme colors).
 */
export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.classList.toggle('dark', shouldUseDarkClass(theme));
}

export function isVerticalNav(position: NavPosition): boolean {
  return position === 'left' || position === 'right';
}

export function isLauncherAppId(id: string): id is LauncherAppId {
  return LAUNCHER_APPS.some((app) => app.id === id);
}

export function isAppViewId(id: string): id is AppViewId {
  return id === 'settings' || isLauncherAppId(id);
}

/** Normalize a stored last-app value; ignore unknown / corrupt entries. */
export function parseLastApp(value: unknown): AppViewId | null {
  return typeof value === 'string' && isAppViewId(value) ? value : null;
}

/**
 * Keep known ids from saved order; insert any apps missing from storage
 * at their canonical DEFAULT_APP_ORDER position (so Tabs lands first on upgrade
 * when it was not yet in the saved list).
 */
export function mergeAppOrder(order: readonly LauncherAppId[]): LauncherAppId[] {
  const seen = new Set<LauncherAppId>();
  const result: LauncherAppId[] = [];

  for (const id of order) {
    if (!isLauncherAppId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  for (const app of LAUNCHER_APPS) {
    if (seen.has(app.id)) continue;
    const canonicalIndex = LAUNCHER_APPS.findIndex((a) => a.id === app.id);
    let insertAt = 0;
    for (let i = 0; i < canonicalIndex; i++) {
      const earlier = LAUNCHER_APPS[i]!.id;
      const pos = result.indexOf(earlier);
      if (pos >= 0) insertAt = pos + 1;
    }
    result.splice(insertAt, 0, app.id);
    seen.add(app.id);
  }

  return result;
}

export function getEnabledAppIds(
  enabled: EnabledApps,
  order: readonly LauncherAppId[] = DEFAULT_APP_ORDER,
): LauncherAppId[] {
  return mergeAppOrder(order).filter((id) => enabled[id]);
}

export function enabledAppCount(enabled: EnabledApps): number {
  return getEnabledAppIds(enabled).length;
}

/**
 * Apply a new visible (enabled-only) order onto the full order list.
 * Disabled apps keep their relative slots; settings is never part of this list.
 */
export function applyEnabledAppOrder(
  order: readonly LauncherAppId[],
  enabled: EnabledApps,
  visibleOrder: readonly LauncherAppId[],
): LauncherAppId[] {
  const full = mergeAppOrder(order);
  const expected = full.filter((id) => enabled[id]);
  if (
    visibleOrder.length !== expected.length ||
    visibleOrder.some((id) => !enabled[id]) ||
    new Set(visibleOrder).size !== visibleOrder.length
  ) {
    return full;
  }

  let i = 0;
  return full.map((id) => (enabled[id] ? visibleOrder[i++]! : id));
}

/**
 * Reorder two enabled apps within the full order list.
 * Disabled apps keep their relative slots; settings is never part of this list.
 */
export function reorderEnabledApps(
  order: readonly LauncherAppId[],
  enabled: EnabledApps,
  activeId: LauncherAppId,
  overId: LauncherAppId,
): LauncherAppId[] {
  const full = mergeAppOrder(order);
  if (activeId === overId || !enabled[activeId] || !enabled[overId]) return full;

  const visible = full.filter((id) => enabled[id]);
  const from = visible.indexOf(activeId);
  const to = visible.indexOf(overId);
  if (from < 0 || to < 0) return full;

  const nextVisible = [...visible];
  nextVisible.splice(from, 1);
  nextVisible.splice(to, 0, activeId);

  return applyEnabledAppOrder(full, enabled, nextVisible);
}

/** Prefer saved default if enabled; else first enabled (by order); else Tabs-first. */
export function resolveInitialApp(
  enabled: EnabledApps,
  defaultApp: LauncherAppId,
  order: readonly LauncherAppId[] = DEFAULT_APP_ORDER,
): LauncherAppId {
  if (enabled[defaultApp]) return defaultApp;

  const firstEnabled = getEnabledAppIds(enabled, order)[0];
  if (firstEnabled) return firstEnabled;

  if (enabled.tabs) return 'tabs';
  if (enabled.today) return 'today';
  if (enabled.gmail) return 'gmail';
  if (enabled.calendar) return 'calendar';
  if (enabled.tasks) return 'tasks';
  if (enabled.keep) return 'keep';
  return DEFAULT_APP_FALLBACK;
}

/**
 * Startup view when opening the side panel.
 * Prefer last viewed page if still available; else configured default app.
 */
export function resolveStartupApp(
  enabled: EnabledApps,
  defaultApp: LauncherAppId,
  order: readonly LauncherAppId[] = DEFAULT_APP_ORDER,
  lastApp: AppViewId | null = null,
): AppViewId {
  if (lastApp === 'settings') return 'settings';
  if (lastApp && isLauncherAppId(lastApp) && enabled[lastApp]) return lastApp;
  return resolveInitialApp(enabled, defaultApp, order);
}

import { applyColorTheme, type ColorTheme } from '@/lib/settings';

/** CSS custom properties Paper Plane may override from the browser theme. */
export const CHROME_THEME_CSS_VARS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--ring',
] as const;

type ThemeColorValue = string | number[];

/** Subset of theme.colors used for Paper Plane token mapping. */
export type BrowserThemeColors = {
  frame?: ThemeColorValue;
  frame_inactive?: ThemeColorValue;
  toolbar?: ThemeColorValue;
  toolbar_text?: ThemeColorValue;
  bookmark_text?: ThemeColorValue;
  tab_background_text?: ThemeColorValue;
  tab_text?: ThemeColorValue;
  ntp_background?: ThemeColorValue;
  ntp_text?: ThemeColorValue;
  ntp_card_background?: ThemeColorValue;
  popup?: ThemeColorValue;
  popup_text?: ThemeColorValue;
  popup_border?: ThemeColorValue;
  toolbar_field?: ThemeColorValue;
  toolbar_field_text?: ThemeColorValue;
  toolbar_field_border?: ThemeColorValue;
  button_background_hover?: ThemeColorValue;
  button_background_active?: ThemeColorValue;
  icons?: ThemeColorValue;
  icons_attention?: ThemeColorValue;
};

export type BrowserTheme = {
  colors?: BrowserThemeColors | null;
  properties?: {
    color_scheme?: 'light' | 'dark' | 'system' | 'auto';
    content_color_scheme?: 'light' | 'dark' | 'system' | 'auto';
  } | null;
};

type ThemeApi = {
  getCurrent: (windowId?: number) => Promise<BrowserTheme>;
  onUpdated?: {
    addListener: (
      callback: (updateInfo: { theme: BrowserTheme; windowId?: number }) => void,
    ) => void;
    removeListener: (
      callback: (updateInfo: { theme: BrowserTheme; windowId?: number }) => void,
    ) => void;
  };
};

type Rgb = { r: number; g: number; b: number; a: number };

const COLOR_PROVIDER_SURFACE_VARS = [
  '--color-toolbar',
  '--color-sys-base',
  '--color-side-panel-content-background',
  '--color-side-panel-background',
  '--color-sys-base-container',
] as const;

const COLOR_PROVIDER_TEXT_VARS = [
  '--color-toolbar-text',
  '--color-bookmark-text',
  '--color-sys-on-surface',
] as const;

/**
 * Resolve `browser.theme` / `chrome.theme` when present.
 * `getCurrent` does not require a manifest `theme` permission.
 */
export function getThemeApi(): ThemeApi | null {
  try {
    const fromBrowser =
      typeof browser !== 'undefined'
        ? (browser as { theme?: ThemeApi }).theme
        : undefined;
    if (fromBrowser && typeof fromBrowser.getCurrent === 'function') {
      return fromBrowser;
    }
  } catch {
    // Fall through to chrome.*
  }

  try {
    const chromeGlobal = (globalThis as { chrome?: { theme?: ThemeApi } }).chrome;
    const fromChrome = chromeGlobal?.theme;
    if (fromChrome && typeof fromChrome.getCurrent === 'function') {
      return fromChrome;
    }
  } catch {
    // Unavailable
  }

  return null;
}

export function isThemeApiAvailable(): boolean {
  return getThemeApi() !== null;
}

/** Fetch the current browser theme, or null if the API is missing / errors. */
export async function getCurrentBrowserTheme(): Promise<BrowserTheme | null> {
  const api = getThemeApi();
  if (!api) return null;
  try {
    return await api.getCurrent();
  } catch {
    return null;
  }
}

function readResolvedCssColor(
  name: string,
  root: HTMLElement = document.documentElement,
): string | null {
  const probe = document.createElement('span');
  probe.style.backgroundColor = `var(${name})`;
  probe.style.position = 'absolute';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  root.appendChild(probe);
  const computed = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const parsed = parseThemeColor(computed);
  if (!parsed || parsed.a === 0) return null;
  return computed;
}

/**
 * Build a Theme from Color Provider CSS variables if the page already has them.
 */
export function themeFromColorProvider(
  root: HTMLElement = document.documentElement,
): BrowserTheme | null {
  let surface: string | null = null;
  for (const name of COLOR_PROVIDER_SURFACE_VARS) {
    surface = readResolvedCssColor(name, root);
    if (surface) break;
  }
  if (!surface) return null;

  let toolbarText: string | undefined;
  for (const name of COLOR_PROVIDER_TEXT_VARS) {
    const value = readResolvedCssColor(name, root);
    if (value) {
      toolbarText = value;
      break;
    }
  }

  return {
    colors: {
      // Map onto `toolbar` so mapBrowserThemeToCssVars uses this as --background.
      // This is SysBaseContainer / side-panel content — the native header stripe.
      toolbar: surface,
      ...(toolbarText ? { toolbar_text: toolbarText, bookmark_text: toolbarText } : {}),
    },
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseThemeColor(value: ThemeColorValue | undefined | null): Rgb | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    if (value.length < 3) return null;
    const [r, g, b, a = 1] = value;
    if (
      typeof r !== 'number' ||
      typeof g !== 'number' ||
      typeof b !== 'number' ||
      typeof a !== 'number'
    ) {
      return null;
    }
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a };
  }

  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgba =
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(
      raw,
    );
  if (rgba) {
    return {
      r: clampByte(Number(rgba[1])),
      g: clampByte(Number(rgba[2])),
      b: clampByte(Number(rgba[3])),
      a: rgba[4] !== undefined ? Number(rgba[4]) : 1,
    };
  }

  const named: Record<string, Rgb> = {
    white: { r: 255, g: 255, b: 255, a: 1 },
    black: { r: 0, g: 0, b: 0, a: 1 },
    transparent: { r: 0, g: 0, b: 0, a: 0 },
  };
  return named[raw.toLowerCase()] ?? null;
}

function toCss(rgb: Rgb): string {
  if (rgb.a < 1) {
    const a = Math.round(rgb.a * 1000) / 1000;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  }
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function relativeLuminance(rgb: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function isDarkColor(rgb: Rgb): boolean {
  return relativeLuminance(rgb) < 0.45;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const u = 1 - t;
  return {
    r: clampByte(a.r * u + b.r * t),
    g: clampByte(a.g * u + b.g * t),
    b: clampByte(a.b * u + b.b * t),
    a: a.a * u + b.a * t,
  };
}

function withAlpha(rgb: Rgb, a: number): Rgb {
  return { ...rgb, a };
}

function firstColor(
  colors: BrowserThemeColors,
  keys: Array<keyof BrowserThemeColors>,
): Rgb | null {
  for (const key of keys) {
    const parsed = parseThemeColor(colors[key]);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Map browser theme.colors → Paper Plane CSS variables.
 * Returns null when there are no usable colors (default Chrome theme often returns {}).
 */
export function mapBrowserThemeToCssVars(
  theme: BrowserTheme,
): Record<(typeof CHROME_THEME_CSS_VARS)[number], string> | null {
  const colors = theme.colors;
  if (!colors || typeof colors !== 'object') return null;

  // Bookmark bar, 3-dot menu, and toolbar share COLOR_TOOLBAR / SysBase.
  const background = firstColor(colors, [
    'toolbar',
    'frame',
    'frame_inactive',
    'ntp_background',
  ]);
  const foreground = firstColor(colors, [
    'toolbar_text',
    'bookmark_text',
    'tab_text',
    'ntp_text',
    'tab_background_text',
    'toolbar_field_text',
  ]);

  // Need at least a surface + text to be useful.
  if (!background && !foreground) return null;

  const dark =
    theme.properties?.color_scheme === 'dark' ||
    theme.properties?.content_color_scheme === 'dark' ||
    (theme.properties?.color_scheme !== 'light' &&
      theme.properties?.content_color_scheme !== 'light' &&
      (background ? isDarkColor(background) : foreground ? !isDarkColor(foreground) : true));

  const white: Rgb = { r: 255, g: 255, b: 255, a: 1 };
  const black: Rgb = { r: 0, g: 0, b: 0, a: 1 };
  const ink = dark ? white : black;

  const bg = background ?? (dark ? { r: 60, g: 60, b: 60, a: 1 } : white);
  const fg = foreground ?? (dark ? { r: 227, g: 227, b: 227, a: 1 } : { r: 37, g: 37, b: 37, a: 1 });

  const card =
    firstColor(colors, ['ntp_card_background', 'popup']) ??
    mix(bg, ink, dark ? 0.08 : 0.04);

  const popover = firstColor(colors, ['popup', 'toolbar']) ?? bg;
  const popoverFg = firstColor(colors, ['popup_text', 'toolbar_text', 'ntp_text']) ?? fg;

  const secondary =
    firstColor(colors, ['button_background_hover', 'toolbar_field']) ??
    mix(bg, ink, dark ? 0.08 : 0.05);

  const muted = firstColor(colors, ['toolbar_field', 'button_background_hover']) ?? secondary;
  const mutedFg = mix(fg, bg, 0.35);

  const accent =
    firstColor(colors, ['button_background_hover', 'button_background_active', 'icons_attention']) ??
    card;

  const primary =
    firstColor(colors, ['icons_attention', 'bookmark_text', 'toolbar_text', 'icons']) ?? fg;
  const primaryFg = isDarkColor(primary) ? white : black;

  const border =
    firstColor(colors, ['popup_border', 'toolbar_field_border']) ??
    withAlpha(ink, dark ? 0.12 : 0.1);

  const input =
    firstColor(colors, ['toolbar_field', 'popup_border', 'toolbar_field_border']) ??
    withAlpha(ink, dark ? 0.16 : 0.12);

  const ring =
    firstColor(colors, ['toolbar_field_border', 'icons', 'bookmark_text']) ?? mutedFg;

  return {
    '--background': toCss(bg),
    '--foreground': toCss(fg),
    '--card': toCss(card),
    '--card-foreground': toCss(fg),
    '--popover': toCss(popover),
    '--popover-foreground': toCss(popoverFg),
    '--primary': toCss(primary),
    '--primary-foreground': toCss(primaryFg),
    '--secondary': toCss(secondary),
    '--secondary-foreground': toCss(fg),
    '--muted': toCss(muted),
    '--muted-foreground': toCss(mutedFg),
    '--accent': toCss(accent),
    '--accent-foreground': toCss(fg),
    '--border': toCss(border),
    '--input': toCss(input),
    '--ring': toCss(ring),
  };
}

/** Whether the mapped theme should use the `.dark` class (for Tailwind dark: variants). */
export function browserThemePrefersDark(theme: BrowserTheme): boolean {
  const scheme = theme.properties?.color_scheme ?? theme.properties?.content_color_scheme;
  if (scheme === 'dark') return true;
  if (scheme === 'light') return false;

  const colors = theme.colors;
  if (!colors) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  const background = firstColor(colors, [
    'toolbar',
    'frame',
    'frame_inactive',
    'ntp_background',
  ]);
  if (background) return isDarkColor(background);

  const foreground = firstColor(colors, [
    'toolbar_text',
    'bookmark_text',
    'tab_background_text',
  ]);
  if (foreground) return !isDarkColor(foreground);

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function clearChromeThemeCssVars(root: HTMLElement = document.documentElement): void {
  for (const prop of CHROME_THEME_CSS_VARS) {
    root.style.removeProperty(prop);
  }
}

export function applyChromeThemeCssVars(
  vars: Record<(typeof CHROME_THEME_CSS_VARS)[number], string>,
  root: HTMLElement = document.documentElement,
): void {
  for (const prop of CHROME_THEME_CSS_VARS) {
    root.style.setProperty(prop, vars[prop]);
  }
}

/**
 * Apply a browser Theme object onto the document when it has usable colors.
 * Returns true if Chrome/extension theme colors were applied.
 */
export function applyBrowserThemeToDocument(theme: BrowserTheme): boolean {
  const vars = mapBrowserThemeToCssVars(theme);
  if (!vars) {
    clearChromeThemeCssVars();
    return false;
  }

  document.documentElement.classList.toggle('dark', browserThemePrefersDark(theme));
  document.documentElement.style.colorScheme = browserThemePrefersDark(theme)
    ? 'dark'
    : 'light';
  applyChromeThemeCssVars(vars);
  return true;
}

/**
 * Appearance orchestration:
 * - System → OS light/dark (Chrome does not expose Appearance theme colors
 *   to extension pages). Optional theme.getCurrent() when the browser provides it.
 * - Light / Dark → fixed Paper Plane palettes
 */
export async function syncDocumentAppearance(preference: ColorTheme): Promise<void> {
  if (preference === 'light' || preference === 'dark') {
    clearChromeThemeCssVars();
    document.documentElement.style.removeProperty('color-scheme');
    applyColorTheme(preference);
    return;
  }

  const fromProvider = themeFromColorProvider();
  if (fromProvider && applyBrowserThemeToDocument(fromProvider)) {
    return;
  }

  const theme = await getCurrentBrowserTheme();
  if (theme && applyBrowserThemeToDocument(theme)) {
    return;
  }

  clearChromeThemeCssVars();
  document.documentElement.style.removeProperty('color-scheme');
  applyColorTheme('system');
}

/**
 * Subscribe to browser theme updates. No-op when the API is unavailable.
 * Returns an unsubscribe function.
 */
export function subscribeBrowserTheme(
  onTheme: (theme: BrowserTheme) => void,
): () => void {
  const api = getThemeApi();
  if (!api?.onUpdated) return () => {};

  const listener = (updateInfo: { theme: BrowserTheme; windowId?: number }) => {
    onTheme(updateInfo.theme ?? {});
  };

  api.onUpdated.addListener(listener);
  return () => {
    api.onUpdated?.removeListener(listener);
  };
}

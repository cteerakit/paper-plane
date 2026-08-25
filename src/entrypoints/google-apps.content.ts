import { EMBED_CONTENT_SCRIPT_MATCHES } from '@/lib/google/apps';

/**
 * Aggressive Keep chrome trim for the side-panel iframe only.
 * Live Keep DOM (keep.google.com): #gb / #ognwrapper header, .PvRhvb left rail,
 * .notes-container main flex shell. Hiding header alone leaves a 64px strip via
 * #ognwrapper; nav is not a <nav> — it's .PvRhvb (class family).
 */
const KEEP_COMPACT_CSS = `
html.flyout-keep-embed,
html.flyout-keep-embed body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  box-sizing: border-box !important;
  /* Document itself must not scroll — .notes-container owns vertical scroll */
  overflow: hidden !important;
}

/* Top Google bar + wrapper that reserves ~64px when #gb is hidden */
html.flyout-keep-embed #gb,
html.flyout-keep-embed #ognwrapper,
html.flyout-keep-embed header[role="banner"],
html.flyout-keep-embed [role="banner"],
html.flyout-keep-embed .gb_Ra,
html.flyout-keep-embed [class*="aSVJYc-UU3Zxb"] {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Left nav rail (not a <nav>; Keep uses .PvRhvb* drawers) */
html.flyout-keep-embed .PvRhvb,
html.flyout-keep-embed [class^="PvRhvb"],
html.flyout-keep-embed [class*=" PvRhvb"],
html.flyout-keep-embed nav,
html.flyout-keep-embed nav[role="navigation"],
html.flyout-keep-embed [role="navigation"],
html.flyout-keep-embed [aria-label="Main menu"],
html.flyout-keep-embed [aria-label="Navigation menu"],
html.flyout-keep-embed [aria-label="Navigation Menu"],
html.flyout-keep-embed [data-tooltip="Main menu"] {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Notes grid fills the panel and owns vertical scroll.
   scrollbar-gutter + border-box reserves track space so width:100% does not
   clip note cards under an overlay scrollbar; avoid overflow-x:hidden here. */
html.flyout-keep-embed .notes-container {
  position: relative !important;
  top: 0 !important;
  left: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  overflow-x: clip !important;
  overflow-y: auto !important;
  scrollbar-gutter: stable !important;
}

/* Inner shells fill width but do not become nested scroll containers */
html.flyout-keep-embed .notes-container > div,
html.flyout-keep-embed .notes-container > div > div:not([class*="PvRhvb"]),
html.flyout-keep-embed [class*="ogm-kpc"],
html.flyout-keep-embed [role="main"],
html.flyout-keep-embed main {
  position: relative !important;
  top: 0 !important;
  left: 0 !important;
  margin: 0 !important;
  margin-left: 0 !important;
  margin-top: 0 !important;
  padding: 0 !important;
  padding-left: 0 !important;
  padding-top: 0 !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 100% !important;
  max-height: none !important;
  flex: 1 1 auto !important;
  overflow: visible !important;
}

html.flyout-keep-embed .flyout-keep-fill {
  margin-left: 0 !important;
  margin-top: 0 !important;
  padding-left: 0 !important;
  padding-top: 0 !important;
  left: 0 !important;
  top: 0 !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
}
`;

const HEADER_SELECTORS = [
  '#gb',
  '#ognwrapper',
  'header[role="banner"]',
  '[role="banner"]',
];

const RAIL_SELECTORS = [
  '.PvRhvb',
  '[class^="PvRhvb"]',
  '[class*=" PvRhvb"]',
  'nav',
  'nav[role="navigation"]',
  '[role="navigation"]',
  '[aria-label="Main menu"]',
  '[aria-label="Navigation menu"]',
  '[aria-label="Navigation Menu"]',
  '[data-tooltip="Main menu"]',
];

function isKeepHost(): boolean {
  return location.hostname === 'keep.google.com';
}

function injectKeepStyles(): void {
  document.documentElement.classList.add('flyout-keep-embed');
  if (document.getElementById('flyout-keep-compact')) return;
  const style = document.createElement('style');
  style.id = 'flyout-keep-compact';
  style.textContent = KEEP_COMPACT_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

function forceHide(el: HTMLElement): void {
  el.style.setProperty('display', 'none', 'important');
  el.style.setProperty('width', '0', 'important');
  el.style.setProperty('height', '0', 'important');
  el.style.setProperty('min-width', '0', 'important');
  el.style.setProperty('min-height', '0', 'important');
  el.style.setProperty('max-width', '0', 'important');
  el.style.setProperty('max-height', '0', 'important');
  el.style.setProperty('overflow', 'hidden', 'important');
  el.style.setProperty('visibility', 'hidden', 'important');
  el.style.setProperty('pointer-events', 'none', 'important');
  el.style.setProperty('padding', '0', 'important');
  el.style.setProperty('margin', '0', 'important');
  el.style.setProperty('border', '0', 'important');
}

/** Walk from Notes/Reminders tabs up to the rail root (.PvRhvb or similar). */
function hideRailFromTabs(): void {
  const tab =
    document.querySelector<HTMLElement>('[role="tab"][aria-label="Notes"]') ??
    document.querySelector<HTMLElement>('[role="tab"][aria-label="Reminders"]');
  if (!tab) return;

  let el: HTMLElement | null = tab;
  let rail: HTMLElement | null = null;
  while (el && el !== document.body) {
    const className = typeof el.className === 'string' ? el.className : '';
    if (className.includes('PvRhvb') && !className.includes('ibnC6b')) {
      rail = el;
      if (className === 'PvRhvb' || className.startsWith('PvRhvb ')) break;
    }
    const rect = el.getBoundingClientRect();
    if (
      rect.left <= 8 &&
      rect.width >= 48 &&
      rect.width <= 320 &&
      rect.height > window.innerHeight * 0.35
    ) {
      rail = el;
    }
    el = el.parentElement;
  }
  if (rail) forceHide(rail);
}

function fillNotesSurface(): void {
  const notes = document.querySelector<HTMLElement>('.notes-container');
  if (notes) {
    notes.classList.add('flyout-keep-fill');
    notes.style.setProperty('top', '0', 'important');
    notes.style.setProperty('left', '0', 'important');
    notes.style.setProperty('margin', '0', 'important');
    notes.style.setProperty('padding', '0', 'important');
    notes.style.setProperty('box-sizing', 'border-box', 'important');
    notes.style.setProperty('width', '100%', 'important');
    notes.style.setProperty('height', '100%', 'important');
    notes.style.setProperty('min-height', '0', 'important');
    notes.style.setProperty('max-height', '100%', 'important');
    notes.style.setProperty('overflow-x', 'clip', 'important');
    notes.style.setProperty('overflow-y', 'auto', 'important');
    notes.style.setProperty('scrollbar-gutter', 'stable', 'important');
  }

  const main =
    document.querySelector<HTMLElement>('[class*="ogm-kpc"]') ??
    document.querySelector<HTMLElement>('[role="main"], main');
  if (main) {
    main.classList.add('flyout-keep-fill');
    main.style.setProperty('margin', '0', 'important');
    main.style.setProperty('padding', '0', 'important');
    main.style.setProperty('left', '0', 'important');
    main.style.setProperty('top', '0', 'important');
    main.style.setProperty('box-sizing', 'border-box', 'important');
    main.style.setProperty('width', '100%', 'important');
    main.style.setProperty('max-width', '100%', 'important');
    main.style.setProperty('height', 'auto', 'important');
    main.style.setProperty('min-height', '100%', 'important');
    main.style.setProperty('max-height', 'none', 'important');
    main.style.setProperty('flex', '1 1 auto', 'important');
    /* Do not nest scroll — .notes-container is the sole vertical scroller */
    main.style.setProperty('overflow', 'visible', 'important');
  }

  const candidates = new Set<HTMLElement>();
  if (notes) candidates.add(notes);
  for (const child of Array.from(document.body?.children ?? [])) {
    if (child instanceof HTMLElement) candidates.add(child);
    child.querySelectorAll<HTMLElement>(':scope > div').forEach((node) => candidates.add(node));
  }

  for (const el of candidates) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const width = el.getBoundingClientRect().width;
    if (width < Math.min(200, window.innerWidth * 0.5)) continue;

    const marginLeft = Number.parseFloat(style.marginLeft) || 0;
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const marginTop = Number.parseFloat(style.marginTop) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const top = Number.parseFloat(style.top) || 0;
    const left = Number.parseFloat(style.left) || 0;

    let changed = false;
    if (marginLeft >= 48 && marginLeft <= 320) {
      el.style.setProperty('margin-left', '0', 'important');
      changed = true;
    }
    if (paddingLeft >= 48 && paddingLeft <= 320) {
      el.style.setProperty('padding-left', '0', 'important');
      changed = true;
    }
    if (paddingTop >= 48 && paddingTop <= 96) {
      el.style.setProperty('padding-top', '0', 'important');
      changed = true;
    }
    if (marginTop >= 48 && marginTop <= 96) {
      el.style.setProperty('margin-top', '0', 'important');
      changed = true;
    }
    if (
      (style.position === 'absolute' || style.position === 'fixed' || style.position === 'sticky') &&
      left >= 48 &&
      left <= 320
    ) {
      el.style.setProperty('left', '0', 'important');
      changed = true;
    }
    if (
      (style.position === 'absolute' || style.position === 'fixed' || style.position === 'sticky') &&
      top >= 48 &&
      top <= 96
    ) {
      el.style.setProperty('top', '0', 'important');
      changed = true;
    }
    if (changed) el.classList.add('flyout-keep-fill');
  }
}

function hideKeepChrome(): void {
  for (const selector of HEADER_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach(forceHide);
  }
  for (const selector of RAIL_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach(forceHide);
  }
  hideRailFromTabs();
  fillNotesSurface();
}

export default defineContentScript({
  matches: EMBED_CONTENT_SCRIPT_MATCHES,
  allFrames: true,
  runAt: 'document_start',
  main() {
    if (window === window.top) return;
    if (!isKeepHost()) return;

    injectKeepStyles();

    const run = () => {
      try {
        injectKeepStyles();
        hideKeepChrome();
      } catch (error) {
        console.warn('Paper Plane Keep compact failed', error);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }

    window.addEventListener('load', run, { once: true });

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        run();
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});

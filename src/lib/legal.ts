/** Public legal document URLs (GitHub-rendered markdown). */
export const PRIVACY_POLICY_URL =
  'https://github.com/cteerakit/paper-plane/blob/master/PRIVACY.md';

export const TERMS_OF_SERVICE_URL =
  'https://github.com/cteerakit/paper-plane/blob/master/TERMS.md';

/** App identity and outbound links shown in Settings → About. */
export const APP_NAME = 'Paper Plane';
export const APP_AUTHOR = 'Teerakit Chantrakul';
export const APP_ICON_PATH = '/icon/128.png';
export const HOMEPAGE_URL = 'https://cteerakit.github.io/paper-plane';
export const GITHUB_URL = 'https://github.com/cteerakit/paper-plane';
/** Pinned extension ID from `wxt.config.ts` / README (listing may still be unpublished). */
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/paper-plane/jmgnpjpmanloikfnmbfeblibnaagnhin';
export const DISCORD_INVITE_URL = 'https://discord.gg/jN5yk9AFjZ';

export function getAppVersion(): string {
  return browser.runtime.getManifest().version;
}

export function openLegalUrl(url: string): void {
  void browser.tabs.create({ url });
}

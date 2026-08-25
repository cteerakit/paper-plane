/** Public legal document URLs (GitHub-rendered markdown). */
export const PRIVACY_POLICY_URL =
  'https://github.com/cteerakit/paper-plane/blob/master/PRIVACY.md';

export const TERMS_OF_SERVICE_URL =
  'https://github.com/cteerakit/paper-plane/blob/master/TERMS.md';

export const DISCORD_INVITE_URL = 'https://discord.gg/jN5yk9AFjZ';

export function openLegalUrl(url: string): void {
  void browser.tabs.create({ url });
}

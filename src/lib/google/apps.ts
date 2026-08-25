/** Apps loaded as iframes (Keep only). Gmail and Calendar use Google API UIs. */
export const GOOGLE_EMBED_APPS = {
  keep: {
    label: 'Note',
    url: 'https://keep.google.com/',
    origin: 'https://keep.google.com',
    domain: 'keep.google.com',
  },
} as const;

export type EmbedAppId = keyof typeof GOOGLE_EMBED_APPS;

export const EMBED_APP_IDS = Object.keys(GOOGLE_EMBED_APPS) as EmbedAppId[];

export const EMBED_APP_DOMAINS = EMBED_APP_IDS.map((id) => GOOGLE_EMBED_APPS[id].domain);

export const EMBED_CONTENT_SCRIPT_MATCHES = EMBED_APP_IDS.map(
  (id) => `${GOOGLE_EMBED_APPS[id].origin}/*`,
);

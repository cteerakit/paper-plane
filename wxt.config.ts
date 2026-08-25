import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

import { EMBED_CONTENT_SCRIPT_MATCHES } from './src/lib/google/apps';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * WXT loads `.env` into process.env only after the config file is imported.
 * Read `.env` ourselves so oauth2.client_id is never stuck on the placeholder.
 */
function resolveGoogleClientId(): string {
  const fromEnv = process.env.WXT_GOOGLE_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const envPath = path.resolve(root, '.env');
  if (existsSync(envPath)) {
    const parsed = parseEnv(readFileSync(envPath, 'utf8'));
    const fromFile = parsed.WXT_GOOGLE_CLIENT_ID?.trim();
    if (fromFile) return fromFile;
  }

  return 'YOUR_CLIENT_ID.apps.googleusercontent.com';
}

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
  }),
  dev: {
    server: {
      port: 3000,
      strictPort: true,
    },
  },
  webExt: {
    // Don't open a separate Chrome — load unpacked in your existing profile instead.
    disabled: true,
  },
  // Function form runs after WXT loadEnv; also reads .env directly via resolveGoogleClientId.
  manifest: () => ({
    name: 'Paper Plane',
    description:
      'Google Workspace apps in Chrome’s side panel — Email, Calendar, and Note.',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAo2m/N4aCgjfdij0ivmOMditXFwn+HjUHLkyliGj4HJleQkWGfoVRGTQTN+wZQTLFZuVO/77OkGB6EuJKvfAL77Aoba8vCjfYD17UF5AGlTYbRHxXd2tXQCV6H5NZ7SCVw3W+tRLsfadXIWhD1EfhQKKN43+BX6XYWkrxRfGIVNI3XOc+BfSyLgY/88ml+HUmEamjI6v6emA0KMFkRETAMIJBp2LxFhYvc9FZF8s3740Qu6gL8gKgdxtkNPVkUQbNZOJswS5+1XIQSPrw6qibTtpWuDrx2Wu4PfGycGjkxyHWEC8/NXWWA3xovLQKl/NL+aa2P19zm+QVqE5lfPD2yQIDAQAB',
    permissions: [
      'sidePanel',
      'identity',
      'storage',
      'cookies',
      'tabs',
      'sessions',
      'bookmarks',
      'favicon',
      'scripting',
      'declarativeNetRequest',
      'declarativeNetRequestWithHostAccess',
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'google_embed',
          enabled: true,
          path: 'rules/embed.json',
        },
      ],
    },
    host_permissions: [
      // Broad http(s) so tab rename (`scripting.executeScript` → document.title) works
      // on normal websites. chrome://, edge://, Web Store, etc. remain unscriptable.
      'http://*/*',
      'https://*/*',
      'https://www.googleapis.com/*',
      'https://gmail.googleapis.com/*',
      ...EMBED_CONTENT_SCRIPT_MATCHES,
      'https://accounts.google.com/*',
      'https://*.google.com/*',
      'https://*.gstatic.com/*',
      'https://*.googleusercontent.com/*',
    ],
    oauth2: {
      client_id: resolveGoogleClientId(),
      scopes: GOOGLE_SCOPES,
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    // Do not restrict img-src to chrome://theme — that blocked favicons and
    // other https images. Chrome also forbids chrome://theme in extension pages.
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' https: http: data: blob:;",
    },
  }),
});

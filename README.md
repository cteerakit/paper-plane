# Paper Plane

Google Workspace apps in Chrome’s native side panel — Keep embed, plus Gmail and Calendar via Google APIs.

Built with [WXT](https://wxt.dev), React, Tailwind CSS v4, and shadcn/ui.

## Features

- **Side panel** opens from the toolbar icon (not a popup)
- **Keep**: full web app embedded in the panel (iframe + header stripping)
- **Gmail**: native unread-mail UI via Gmail API — not an iframe of mail.google.com
- **Calendar**: native agenda UI via Google Calendar API (today’s events + Meet join links)
- **Google OAuth** via `chrome.identity.getAuthToken` for Gmail + Calendar API access
- **shadcn/ui** components for the panel chrome

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Google Cloud project (required for Gmail + Calendar)

Gmail and Calendar use Google APIs. Create an OAuth client and put the client ID in `.env`.

1. **Create a project** in [Google Cloud Console](https://console.cloud.google.com/)
2. **Enable APIs** — [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com). Other APIs in the manifest scopes (Tasks, Drive) can stay enabled for future hub widgets.
3. **OAuth consent screen** — User type **External**, publish status **Testing**, add your Google account as a **test user**. `gmail.readonly` is a **restricted** scope; while the app is in Testing, only listed test users can grant it.
4. **Create OAuth client** — Application type **Chrome extension**, extension ID:

   ```
   jmgnpjpmanloikfnmbfeblibnaagnhin
   ```

   This ID is pinned by the `key` in `wxt.config.ts`. After loading the unpacked build, confirm it matches on `chrome://extensions`.
5. **Copy the client ID** into `.env`:

```bash
cp .env.example .env
# Edit WXT_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
```

6. **Scopes** are already declared in `wxt.config.ts` for Calendar (`calendar.events.readonly`) and Gmail (`gmail.readonly`), plus Tasks/Drive for possible future API widgets.

**Keep** uses your existing Chrome Google session and does not need this OAuth client. **Gmail** and **Calendar** do (shared `chrome.identity.getAuthToken` sign-in).

### 3. Develop (your logged-in Chrome)

WXT does **not** auto-open a browser. Use the Chrome profile where you’re already signed into Google:

```bash
pnpm dev
```

Then in **that** Chrome window:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `D:\Projects\flyout\.output\chrome-mv3-dev`
4. Pin Paper Plane and click the icon to open the side panel

`pnpm dev` watches files and rebuilds; click **Reload** on the extension card after changes.

Click **Gmail** or **Calendar** in the launcher — you should see the API UI (unread list / today’s agenda), not an iframe. If auth fails with a bad client ID, use a **Chrome extension** OAuth client type (not Web), matching the extension ID above. Re-check APIs enabled, test user, and `.env` client ID.

To use WXT’s separate dev browser instead, set `webExt.disabled` to `false` in `wxt.config.ts`.

### 4. Build

```bash
pnpm build
```

Output: `.output/chrome-mv3`

## Project structure

```
src/
  entrypoints/
    background.ts         # side panel on action click, Keep embed DNR rules
    google-apps.content.ts # compact Keep UI when framed
    sidepanel/            # React launcher + Gmail/Calendar API views + Keep embed
  components/             # GmailSection, CalendarSection, embeds, shadcn primitives
  lib/google/api.ts       # OAuth + Gmail/Calendar (and other Google API clients)
  lib/google/apps.ts      # Keep embed URL only
```

## OAuth scopes

- `calendar.events.readonly` — used by the Calendar agenda view
- `gmail.readonly` — used by the Gmail unread list (**restricted**; Testing + test users required)
- `tasks`, `drive.metadata.readonly` — declared for possible future API widgets

Keep uses your existing Google session in Chrome, not these API scopes.

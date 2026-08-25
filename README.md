# Paper Plane

Chrome side panel for your open tabs, email, calendar, tasks, notes, and an overview of your day.

Built with [WXT](https://wxt.dev), React, Tailwind CSS v4, and shadcn/ui.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — free for noncommercial use. Commercial use requires a separate license from the author.

## Features

- **Side panel** — opens from the toolbar icon (not a popup)
- **Tabs** — open tabs by window: activate, reorder, pin/unpin, mute, rename, edit URL, close, restore recently closed, new tab
- **Today** — one view of today’s events, due tasks, and recent mail
- **Email** — native unread list (API-backed, not a full mailbox iframe)
- **Calendar** — upcoming events, with video-call join links when present
- **Task** — incomplete tasks grouped by overdue / today / later
- **Note** — notes app embedded in the panel
- **Launcher** — enable/disable apps, drag to reorder, choose default app and nav position (top / bottom / left / right)
- **Theme** — light, dark, or follow the browser
- **Sign-in** — connect an account for email, calendar, and tasks (Google today; more providers later)

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Google Cloud project (required for Email, Calendar, Tasks, Today)

Those panels use Google APIs. Create an OAuth client and put the client ID in `.env`.

1. **Create a project** in [Google Cloud Console](https://console.cloud.google.com/)
2. **Enable APIs** — [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com), [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com), and [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com).
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

6. **Scopes** are declared in `wxt.config.ts` (see [OAuth scopes](#oauth-scopes) below).

**Tabs** works without Google sign-in. **Note (Keep)** uses your existing Chrome Google session. **Email**, **Calendar**, **Task**, and **Today** need the OAuth client above.

### 3. Develop (your logged-in Chrome)

WXT does **not** auto-open a browser. Use the Chrome profile where you’re already signed into Google:

```bash
pnpm dev
```

Then in **that** Chrome window:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `.output/chrome-mv3-dev` under this repo
4. Pin Paper Plane and click the icon to open the side panel

`pnpm dev` watches files and rebuilds; click **Reload** on the extension card after changes.

If Google API auth fails with a bad client ID, use a **Chrome extension** OAuth client type (not Web), matching the extension ID above. Re-check APIs enabled, test user, and `.env` client ID.

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
    background.ts          # side panel on action click, Keep embed DNR rules
    google-apps.content.ts # compact Keep UI when framed
    sidepanel/             # React launcher + panels
  components/              # Tabs, Today, Gmail, Calendar, Tasks, Keep embed, Settings, UI
  lib/
    chrome-tabs.ts         # open tabs / pin / mute / rename
    chrome-sessions.ts     # recently closed
    chrome-theme.ts        # light / dark / system
    settings.ts            # launcher prefs
    google/api.ts          # OAuth + Gmail / Calendar / Tasks clients
    google/apps.ts         # Keep embed URL
```

## OAuth scopes

- `calendar.events.readonly` — Calendar agenda and Today events
- `gmail.readonly` — Email list and Today mail (**restricted**; Testing + test users required)
- `tasks` — Task list and Today tasks

Keep uses your existing Google session in Chrome, not these API scopes. Tabs uses Chrome extension APIs only.

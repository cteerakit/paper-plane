# Privacy Policy

**Paper Plane**  
Last updated: August 25, 2026

Paper Plane (“the Extension”) is a Chrome side panel developed by Teerakit Chantrakul (“we,” “us”). This policy explains what information the Extension accesses and how it is used. By using Paper Plane, you agree to this policy.

## Summary

Paper Plane runs in your browser. It does not operate a separate backend that collects your mail, calendar, tasks, or browsing data. Google account data is requested only so the Extension can show it to you locally, and Chrome APIs are used only to power features you turn on in the side panel.

## Information we access

Depending on which features you use, Paper Plane may access:

- **Google account profile** — name, email address, and profile picture when you connect Google (OpenID, email, profile).
- **Gmail** — read-only access to message metadata and content needed to list unread mail and Today’s overview (`gmail.readonly`).
- **Google Calendar** — read-only access to event details for upcoming events (`calendar.events.readonly`).
- **Google Tasks** — access to create, read, update, and complete tasks (`tasks`).
- **Chrome tabs & sessions** — open tabs, recently closed tabs, and related metadata for the Tabs feature.
- **Bookmarks & favicons** — as needed to display and manage tab-related UI.
- **Notes (Google Keep)** — an embedded Keep experience that uses your existing Chrome Google session; it does not use the separate OAuth “Connect Google” flow.
- **Extension settings** — preferences such as theme, navigation layout, enabled apps, and last viewed page, stored in Chrome extension storage on your device.

## How we use information

Accessed data is used only to:

- Display mail, calendar, tasks, tabs, notes, and Today in the side panel
- Remember your settings and last opened view
- Cache recent API responses on your device to load panels faster
- Authenticate with Google when you choose to connect your account

We do not sell your personal information or use it for advertising.

## Storage and retention

OAuth tokens are managed by Chrome’s identity APIs. Settings and short-lived caches of mail, calendar, tasks, and Today data are stored locally in the Extension’s storage on your device. Signing out revokes the Google token used by the Extension and clears the in-panel account state. Uninstalling the Extension removes its local storage.

## Data sharing

Paper Plane does not send your Google Workspace content or tab data to our own servers. Requests for Google data go to Google’s APIs under Google’s terms and privacy policy. Embedded Google products (such as Keep) are provided by Google and subject to Google’s policies.

## Permissions

The Extension’s Chrome permissions (including side panel, identity, storage, tabs, sessions, bookmarks, scripting, and host access needed for embeds and tab tools) are declared in the extension manifest and are limited to features described in the product.

## Children

Paper Plane is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes

We may update this policy from time to time. The “Last updated” date at the top will change when we do. Continued use of the Extension after an update means you accept the revised policy.

## Contact

Questions about privacy: [open an issue on GitHub](https://github.com/cteerakit/paper-plane/issues).

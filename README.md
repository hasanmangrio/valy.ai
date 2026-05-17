# Valy ⚡

> OTP codes and verification links from your inbox — before you can even open Gmail.

Valy is a Chrome extension that monitors your Gmail inbox and instantly surfaces verification codes and action links in a sleek purple overlay, dropping down from the toolbar the moment an email arrives.

---

## How it works

1. You connect Gmail once (OAuth — Valy only requests `gmail.modify` scope).
2. The extension polls your inbox every **10 seconds** via a background service worker kept alive by a content script keepalive port.
3. When a transactional email (OTP, password reset, magic link) arrives, Valy:
   - Parses the code or action link
   - **Archives + marks the email read** automatically
   - Drops a purple overlay onto your active tab with a Copy / Open button
4. The overlay auto-dismisses after **30 seconds** with a reverse slide animation.

---

## Setup (required before the extension works)

### 1. Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **New Project**.
2. Enable **Gmail API**: APIs & Services → Library → search "Gmail API" → Enable.
3. Go to **APIs & Services → Credentials** → Create Credentials → **OAuth client ID**.
4. Application type: **Chrome Extension**.
5. In the **Application ID** field, paste your extension's ID (see step 2 below).
6. Copy the generated **Client ID**.

### 2. Load the extension

```bash
node scripts/generate-icons.js   # generates icons/icon{16,48,128}.png
```

Then in Chrome:
- Open `chrome://extensions` → enable **Developer mode** → **Load unpacked**
- Select: `/Users/hasanmangrio/Desktop/projects/valy`
- Copy the **Extension ID** shown on the card.

### 3. Wire up the client ID

Open `manifest.json` and replace the placeholder:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  ...
}
```

Paste your Client ID from step 1. Then **reload** the extension in `chrome://extensions`.

---

## Install & run (dev)

```bash
node scripts/generate-icons.js
# Then load unpacked from chrome://extensions
```

---

## Project structure

```
valy/
├── manifest.json        Chrome Extension Manifest V3
├── background.js        Service worker — Gmail API, OAuth, email parsing
├── content.js           Injected into every tab — overlay UI + keepalive port
├── popup.html/css/js    Extension popup — login, status, manual check
├── icons/               Generated PNG icons (run scripts/generate-icons.js)
└── scripts/
    └── generate-icons.js  Pure-Node PNG icon generator (no dependencies)
```

---

## Permissions

| Permission | Why |
|---|---|
| `identity` | OAuth2 sign-in via `chrome.identity.getAuthToken` |
| `storage` | Tracks processed email IDs to prevent duplicates |
| `alarms` | 1-minute fallback polling when no active tab |
| `tabs` | Sends overlay message to the active focused tab |
| `gmail.googleapis.com` | Gmail API calls (list, get, modify messages) |

---

## Privacy

- Valy reads only **unread inbox emails** and only while the extension is active.
- Emails are immediately **archived and marked read** after the code is extracted.
- No email content leaves your device — everything runs locally in the extension.
- OAuth tokens are managed by Chrome's identity API and never stored in plain text.

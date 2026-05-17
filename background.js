'use strict';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
      } else {
        resolve(token);
      }
    });
  });
}

async function clearToken(token) {
  return new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
}

// ─── Gmail API ───────────────────────────────────────────────────────────────

async function gapi(path, opts = {}) {
  const token = await getToken(false);
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401) {
    await clearToken(token);
    throw new Error('Token expired');
  }
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  return res.json();
}

// ─── Email parsing ───────────────────────────────────────────────────────────

function b64decode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  try { return atob(str); } catch { return ''; }
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractBody(payload) {
  function decode(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return b64decode(part.body.data);
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      return b64decode(part.body.data)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    }
    if (part.parts) {
      const plain = part.parts.find(p => p.mimeType === 'text/plain');
      if (plain) return decode(plain);
      for (const p of part.parts) {
        const r = decode(p);
        if (r) return r;
      }
    }
    return '';
  }
  return decode(payload);
}

function parseEmail(message) {
  const headers = message.payload?.headers || [];
  const subject = getHeader(headers, 'Subject');
  const from = getHeader(headers, 'From');
  const body = extractBody(message.payload);
  const full = `${subject}\n${body}`;

  // OTP code detection — ordered most specific to least
  const otpPatterns = [
    /(?:code|otp|pin|passcode|verification|one.time|token)[^\d]{0,30}([0-9]{4,8})\b/i,
    /\b([0-9]{6})\b/,
    /\b([0-9]{4,8})\b/,
  ];

  for (const re of otpPatterns) {
    const m = full.match(re);
    if (m) {
      const code = m[1];
      if (/^(19|20)\d{2}$/.test(code)) continue; // skip years
      return { type: 'code', code, subject, from };
    }
  }

  // Action link detection
  const links = [...(full.match(/https?:\/\/[^\s"'<>{}|\\^`[\]]+/gi) || [])];
  const actionKeywords = /verify|confirm|activate|reset|password|magic|login|signin|validate|click/i;
  const link = links.find(l => actionKeywords.test(l) && l.length < 2000);
  if (link) return { type: 'link', link, subject, from };

  return null;
}

// ─── Core check ──────────────────────────────────────────────────────────────

let checking = false;

async function checkGmail() {
  if (checking) return;
  checking = true;
  try {
    const { processedIds = [] } = await chrome.storage.local.get('processedIds');
    const data = await gapi('/messages?q=is:unread+in:inbox&maxResults=10');
    const messages = data.messages || [];
    const fresh = messages.filter(m => !processedIds.includes(m.id));
    if (!fresh.length) return;

    for (const { id } of fresh) {
      // Mark processed immediately to prevent double-processing
      processedIds.unshift(id);
      await chrome.storage.local.set({ processedIds: processedIds.slice(0, 1000) });

      const message = await gapi(`/messages/${id}?format=full`);
      const result = parseEmail(message);
      if (!result) continue;

      // Archive + mark read right away
      await gapi(`/messages/${id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['UNREAD', 'INBOX'] }),
      });

      // Push to active focused tab
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id && tab.url && !tab.url.startsWith('chrome://')) {
        chrome.tabs.sendMessage(tab.id, { type: 'VALY_CODE', payload: result }).catch(() => {});
      }
    }
  } catch (err) {
    if (!['No token', 'Token expired'].some(s => err.message.includes(s))) {
      console.error('[Valy]', err.message);
    }
  } finally {
    checking = false;
  }
}

// ─── Keepalive + fast polling via content script ports ───────────────────────

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'valy-keepalive') return;
  port.onMessage.addListener(msg => {
    if (msg.type === 'POLL') checkGmail();
  });
});

// ─── 1-minute alarm as fallback ──────────────────────────────────────────────

chrome.alarms.create('valy-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'valy-poll') checkGmail();
});

// ─── Popup messages ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === 'LOGIN') {
    getToken(true)
      .then(() => respond({ ok: true }))
      .catch(e => respond({ ok: false, err: e.message }));
    return true;
  }
  if (msg.type === 'LOGOUT') {
    getToken(false)
      .then(token => clearToken(token))
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: true }));
    return true;
  }
  if (msg.type === 'CHECK_AUTH') {
    getToken(false)
      .then(t => respond({ loggedIn: !!t }))
      .catch(() => respond({ loggedIn: false }));
    return true;
  }
  if (msg.type === 'CHECK_NOW') {
    checkGmail().then(() => respond({ ok: true }));
    return true;
  }
});

// Check immediately on startup
checkGmail();

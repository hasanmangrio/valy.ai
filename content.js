(function () {
  'use strict';

  // Don't run in iframes
  if (window !== window.top) return;

  // ─── Keepalive port → background polls Gmail every 10s ───────────────────

  let port;

  function connectPort() {
    try {
      port = chrome.runtime.connect({ name: 'valy-keepalive' });
      port.onDisconnect.addListener(() => setTimeout(connectPort, 2000));
    } catch { /* extension context invalidated */ }
  }

  connectPort();

  setInterval(() => {
    try {
      port?.postMessage({ type: 'POLL' });
    } catch {
      connectPort();
    }
  }, 10000);

  // ─── Overlay state ────────────────────────────────────────────────────────

  let overlayHost = null;
  let dismissTimer = null;

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showOverlay(payload) {
    removeOverlay(true); // clear any existing one instantly

    overlayHost = document.createElement('div');
    overlayHost.setAttribute('id', 'valy-host');
    overlayHost.style.cssText =
      'position:fixed;top:0;right:24px;z-index:2147483647;pointer-events:none;';

    const shadow = overlayHost.attachShadow({ mode: 'closed' });

    const isCode = payload.type === 'code';

    // Derive a clean sender name
    const fromRaw = payload.from || '';
    const senderName = (fromRaw.match(/^"?([^"<]+)"?\s*</) || [])[1]?.trim() || fromRaw.split('@')[0] || 'Inbox';

    const fontUrl = chrome.runtime.getURL('fonts/Manrope.woff2');

    shadow.innerHTML = `
<style>
@font-face{
  font-family:'Manrope';
  src:url('${fontUrl}') format('woff2');
  font-weight:100 900;
  font-style:normal;
  font-display:block;
}
*{box-sizing:border-box;margin:0;padding:0;font-family:'Manrope',sans-serif}
.card{
  background:linear-gradient(150deg,#7B2FF7 0%,#A45EFF 100%);
  border-radius:20px;
  margin-top:10px;
  padding:16px 18px 18px;
  min-width:276px;max-width:320px;
  box-shadow:0 24px 64px rgba(123,47,247,.45),0 8px 24px rgba(0,0,0,.18);
  pointer-events:all;
  animation:slideDown .42s cubic-bezier(.34,1.56,.64,1) both;
  transform-origin:top center;
}
.card.out{animation:slideUp .32s cubic-bezier(.55,0,.65,-0.4) both}
@keyframes slideDown{from{transform:translateY(-120%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes slideUp{from{transform:translateY(0);opacity:1}to{transform:translateY(-120%);opacity:0}}

.row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.brand{display:flex;align-items:center;gap:7px}
.brand-icon{
  width:26px;height:26px;
  background:rgba(255,255,255,.22);
  border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;line-height:1;
}
.brand-name{color:rgba(255,255,255,.92);font-size:13px;font-weight:700;letter-spacing:.1px}
.close{
  width:24px;height:24px;border-radius:50%;border:none;cursor:pointer;
  background:rgba(255,255,255,.18);color:rgba(255,255,255,.85);
  font-size:12px;display:flex;align-items:center;justify-content:center;
  transition:background .15s;padding:0;line-height:1;
}
.close:hover{background:rgba(255,255,255,.3)}

.eyebrow{color:rgba(255,255,255,.65);font-size:12px;font-weight:500;letter-spacing:0;margin-bottom:6px}
.code-val{
  font-size:52px;font-weight:800;color:#fff;
  letter-spacing:2px;line-height:1;
  margin-bottom:16px;
}
.subject{
  font-size:12px;color:rgba(255,255,255,.72);
  margin-bottom:14px;line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}

.btn{
  width:100%;background:rgba(255,255,255,.95);
  color:#6B1FE8;border:none;border-radius:13px;
  padding:13px 16px;font-size:14px;font-weight:700;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
  transition:background .15s,transform .1s;
  letter-spacing:.1px;
}
.btn:hover{background:#fff;transform:translateY(-1px)}
.btn:active{transform:translateY(0) scale(.98)}
.btn.done{background:rgba(255,255,255,.65);color:rgba(107,31,232,.65);cursor:default}

.timer{height:3px;background:rgba(255,255,255,.18);border-radius:2px;margin-top:14px;overflow:hidden}
.timer-fill{height:100%;background:rgba(255,255,255,.55);width:100%;animation:drain 60s linear both}
@keyframes drain{from{width:100%}to{width:0%}}
</style>

<div class="card" id="card">
  <div class="row">
    <div class="brand">
      <div class="brand-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </div>
      <span class="brand-name">Valy</span>
    </div>
    <button class="close" id="close" aria-label="Dismiss">✕</button>
  </div>

  <div class="eyebrow">From your inbox</div>

  ${isCode
    ? `<div class="code-val">${escHtml(payload.code)}</div>
       <button class="btn" id="action">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
           <rect x="9" y="9" width="13" height="13" rx="2"/>
           <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
         </svg>
         Copy
       </button>`
    : `<div class="subject">${escHtml(payload.subject || 'Verification link')}</div>
       <button class="btn" id="action">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
           <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
           <polyline points="15 3 21 3 21 9"/>
           <line x1="10" y1="14" x2="21" y2="3"/>
         </svg>
         Open link
       </button>`
  }

  <div class="timer"><div class="timer-fill"></div></div>
</div>`;

    shadow.querySelector('#close').addEventListener('click', () => removeOverlay());

    const btn = shadow.querySelector('#action');
    btn.addEventListener('click', () => {
      if (isCode) {
        copyText(payload.code);
        btn.innerHTML = '✓&nbsp; Copied!';
        btn.classList.add('done');
        setTimeout(() => removeOverlay(), 1400);
      } else {
        window.open(payload.link, '_blank', 'noopener,noreferrer');
        removeOverlay();
      }
    });

    document.documentElement.appendChild(overlayHost);
    dismissTimer = setTimeout(() => removeOverlay(), 60000);
  }

  function removeOverlay(instant = false) {
    clearTimeout(dismissTimer);
    if (!overlayHost) return;

    if (instant) {
      overlayHost.remove();
      overlayHost = null;
      return;
    }

    const card = overlayHost.shadowRoot?.querySelector('#card');
    if (card) {
      card.classList.add('out');
      card.addEventListener('animationend', () => {
        overlayHost?.remove();
        overlayHost = null;
      }, { once: true });
    } else {
      overlayHost.remove();
      overlayHost = null;
    }
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    } else {
      legacyCopy(text);
    }
  }

  function legacyCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); } catch { /* noop */ }
    document.body.removeChild(el);
  }

  // ─── Listen for codes from background ────────────────────────────────────

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'VALY_CODE') showOverlay(msg.payload);
  });
})();

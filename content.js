(function () {
  'use strict';

  if (window !== window.top) return;

  // ─── Inject Manrope into the main document so shadow DOM can use it ──────
  // @font-face inside shadow roots is unreliable in Chrome — main doc is the fix.
  function ensureFonts() {
    if (document.getElementById('valy-fonts')) return;
    const fontBase = chrome.runtime.getURL('fonts/');
    const s = document.createElement('style');
    s.id = 'valy-fonts';
    s.textContent = [400, 500, 700, 800].map(w =>
      `@font-face{font-family:'ValyManrope';src:url('${fontBase}Manrope-${w}.woff2') format('woff2');font-weight:${w};font-display:block}`
    ).join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ─── Keepalive port → background polls Gmail every 10 s ──────────────────

  let port;

  function connectPort() {
    try {
      port = chrome.runtime.connect({ name: 'valy-keepalive' });
      port.onDisconnect.addListener(() => setTimeout(connectPort, 2000));
    } catch { /* context invalidated */ }
  }

  connectPort();
  setInterval(() => {
    try { port?.postMessage({ type: 'POLL' }); }
    catch { connectPort(); }
  }, 10000);

  // ─── Overlay ──────────────────────────────────────────────────────────────

  let overlayHost = null;
  let dismissTimer = null;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showOverlay(payload) {
    ensureFonts();
    removeOverlay(true);

    overlayHost = document.createElement('div');
    overlayHost.id = 'valy-host';
    overlayHost.style.cssText =
      'position:fixed;top:0;right:20px;z-index:2147483647;pointer-events:none;';

    const shadow = overlayHost.attachShadow({ mode: 'open' });
    const isCode = payload.type === 'code';

    shadow.innerHTML = `
<style>
*{box-sizing:border-box;margin:0;padding:0}

.card{
  font-family:'ValyManrope',sans-serif;
  background:#8B2DE8;
  border-radius:20px;
  margin-top:12px;
  width:320px;
  padding:16px 16px 18px;
  box-shadow:0 16px 48px rgba(100,20,200,.35);
  pointer-events:all;
  animation:drop .45s cubic-bezier(.34,1.56,.64,1) both;
}
.card.out{animation:rise .3s cubic-bezier(.55,0,.65,-.4) both}

@keyframes drop{
  from{transform:translateY(-115%);opacity:0}
  to  {transform:translateY(0);opacity:1}
}
@keyframes rise{
  from{transform:translateY(0);opacity:1}
  to  {transform:translateY(-115%);opacity:0}
}

/* header row */
.hdr{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:14px;
}
.icon{
  width:28px;height:28px;
  display:flex;align-items:center;justify-content:center;
  opacity:.9;
}
.close{
  width:28px;height:28px;border-radius:50%;
  background:rgba(255,255,255,.18);
  border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:13px;line-height:1;
  transition:background .15s;
}
.close:hover{background:rgba(255,255,255,.3)}

/* body */
.eyebrow{
  text-align:center;
  font-family:'ValyManrope',sans-serif;
  font-weight:400;
  font-size:13px;
  color:rgba(255,255,255,.65);
  margin-bottom:6px;
  letter-spacing:0;
}
.code{
  text-align:center;
  font-family:'ValyManrope',sans-serif;
  font-weight:800;
  font-size:58px;
  color:#fff;
  line-height:1;
  letter-spacing:1px;
  margin-bottom:18px;
}
.subject{
  text-align:center;
  font-family:'ValyManrope',sans-serif;
  font-weight:400;
  font-size:13px;
  color:rgba(255,255,255,.75);
  margin-bottom:14px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}

/* button */
.btn{
  width:100%;
  background:#fff;
  color:#8B2DE8;
  border:none;
  border-radius:12px;
  padding:14px;
  font-family:'ValyManrope',sans-serif;
  font-weight:700;
  font-size:15px;
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:8px;
  transition:opacity .15s,transform .1s;
  letter-spacing:0;
}
.btn:hover{opacity:.93;transform:translateY(-1px)}
.btn:active{transform:translateY(0) scale(.98)}
.btn.done{opacity:.6;cursor:default}

/* timer bar */
.bar{height:3px;background:rgba(255,255,255,.18);border-radius:2px;margin-top:14px;overflow:hidden}
.bar-fill{height:100%;background:rgba(255,255,255,.5);animation:drain 60s linear both}
@keyframes drain{from{width:100%}to{width:0%}}
</style>

<div class="card" id="card">
  <div class="hdr">
    <div class="icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </div>
    <button class="close" id="close" aria-label="Close">✕</button>
  </div>

  <div class="eyebrow">From your inbox</div>

  ${isCode
    ? `<div class="code">${esc(payload.code)}</div>`
    : `<div class="subject">${esc(payload.subject || 'Verification link')}</div>`
  }

  <button class="btn" id="action">
    ${isCode ? `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copy
    ` : `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      Open link
    `}
  </button>

  <div class="bar"><div class="bar-fill"></div></div>
</div>`;

    shadow.querySelector('#close').addEventListener('click', () => removeOverlay());

    const btn = shadow.querySelector('#action');
    btn.addEventListener('click', () => {
      if (isCode) {
        copyText(payload.code);
        btn.innerHTML = '✓&nbsp;&nbsp;Copied!';
        btn.classList.add('done');
        setTimeout(() => removeOverlay(), 1500);
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
    if (instant) { overlayHost.remove(); overlayHost = null; return; }

    const card = overlayHost.shadowRoot?.querySelector('#card');
    if (card) {
      card.classList.add('out');
      card.addEventListener('animationend', () => { overlayHost?.remove(); overlayHost = null; }, { once: true });
    } else {
      overlayHost.remove(); overlayHost = null;
    }
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => legacyCopy(text)) ?? legacyCopy(text);
  }

  function legacyCopy(text) {
    const el = Object.assign(document.createElement('textarea'), {
      value: text,
      style: 'position:fixed;opacity:0;pointer-events:none',
    });
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); } catch { /* noop */ }
    document.body.removeChild(el);
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'VALY_CODE') showOverlay(msg.payload);
  });
})();

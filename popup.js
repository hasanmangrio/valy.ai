'use strict';

const $ = id => document.getElementById(id);

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

async function msg(type, data = {}) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type, ...data }, resolve)
  );
}

async function init() {
  show('view-loading');
  hide('view-logged-out');
  hide('view-logged-in');

  const { loggedIn } = await msg('CHECK_AUTH');

  hide('view-loading');
  if (loggedIn) {
    show('view-logged-in');
  } else {
    show('view-logged-out');
  }
}

$('btn-login').addEventListener('click', async () => {
  hide('view-logged-out');
  show('view-loading');

  const result = await msg('LOGIN');

  hide('view-loading');
  if (result?.ok) {
    show('view-logged-in');
    msg('CHECK_NOW');
  } else {
    show('view-logged-out');
  }
});

$('btn-check').addEventListener('click', async () => {
  const btn = $('btn-check');
  btn.textContent = 'Checking…';
  btn.disabled = true;
  await msg('CHECK_NOW');
  btn.textContent = 'Check now';
  btn.disabled = false;
});

$('btn-logout').addEventListener('click', async () => {
  await msg('LOGOUT');
  hide('view-logged-in');
  show('view-logged-out');
});

init();

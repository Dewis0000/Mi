/* StreOps — связь страниц с сервером.
   window.StreAPI.get/post — запросы к /api/index.php; шапка и меню получают настоящий профиль;
   страницы панели без входа отправляют на вход через Twitch. */
(function () {
  'use strict';
  const API = '/api/index.php?r=';

  async function call(method, route, data) {
    const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'StreOps' } };
    let url = API + encodeURIComponent(route);
    if (method === 'GET' && data) url += '&' + new URLSearchParams(data).toString();
    if (method === 'POST') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data || {}); }
    let res;
    try { res = await fetch(url, opts); } catch (e) { throw new Error('Нет связи с сервером. Проверь интернет.'); }
    let json = null;
    try { json = await res.json(); } catch (e) { /* не JSON */ }
    if (res.status === 401 && isPanel()) { location.href = '/auth/login.php?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('Нужно войти'); }
    if (!json) throw new Error('Сервер ответил с ошибкой (' + res.status + ')');
    if (!json.ok) throw new Error(json.error || 'Ошибка');
    return json;
  }

  function isPanel() { return !!document.querySelector('nav.sb'); }

  let mePromise = null;
  const StreAPI = {
    get: (r, q) => call('GET', r, q),
    post: (r, body) => call('POST', r, body),
    me: () => (mePromise = mePromise || call('GET', 'me').catch(() => ({ user: null }))),
    refreshMe: () => { mePromise = null; return StreAPI.me(); },
    toast,
    fmtTime: (ts) => new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    fmtDate: (ts) => new Date(ts * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    fmtNum: (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    fmtDur: (s) => { s = Math.max(0, s | 0); const p = (n) => String(n).padStart(2, '0'); return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60); },
  };
  window.StreAPI = StreAPI;

  // ---------- уведомления ----------
  function toast(text, kind) {
    let box = document.getElementById('stre-toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'stre-toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:600;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'pointer-events:auto;max-width:min(560px,90vw);padding:12px 16px;border-radius:8px;font:500 14px/20px var(--font-sans,Onest),system-ui,sans-serif;color:var(--n-12,#F2F2F2);background:rgb(var(--n-1-rgb,10 10 10) / .94);backdrop-filter:blur(20px);box-shadow:0 12px 32px -8px rgba(0,0,0,.6);border:' +
      (kind === 'error' ? '2px solid var(--n-12,#F2F2F2)' : '1px solid rgb(var(--n-13-rgb,255 255 255) / .14)');
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, kind === 'error' ? 6000 : 3500);
  }

  // ---------- шапка, меню, статус эфира ----------
  function initials(name) { return (name || '?').replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').slice(0, 2).toUpperCase() || '?'; }

  function applyUser(me) {
    const u = me.user;
    const header = document.querySelector('header');
    if (header && u) {
      header.querySelectorAll('a').forEach((a) => {
        if (!/kira_stream/.test(a.textContent)) return;
        const av = a.querySelector('span');
        const img = u.avatar ? '<img src="' + u.avatar.replace(/"/g, '') + '" alt="" width="32" height="32" style="width:32px;height:32px;border-radius:999px;object-fit:cover;display:block">' : '';
        if (av && img) { av.innerHTML = img; av.style.background = 'none'; }
        else if (av) av.textContent = initials(u.name);
        a.childNodes.forEach((n) => { if (n.nodeType === 3 && /kira_stream/.test(n.nodeValue)) n.nodeValue = u.name; });
        a.setAttribute('aria-label', 'Профиль ' + u.name);
      });
    }
    const sb = document.querySelector('nav.sb');
    if (sb && u) {
      if (u.isAdmin && !sb.querySelector('[data-admin]')) {
        const a = document.createElement('a');
        a.href = '/admin.html';
        a.className = 'sb-i';
        a.dataset.admin = '1';
        if (location.pathname.endsWith('/admin.html')) a.setAttribute('aria-current', 'page');
        a.innerHTML = '<svg class="sb-ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>Админ-панель';
        sb.appendChild(a);
      }
      if (!sb.querySelector('[data-logout]')) {
        const a = document.createElement('a');
        a.href = '/auth/logout.php';
        a.className = 'sb-i';
        a.dataset.logout = '1';
        a.innerHTML = '<svg class="sb-ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>Выйти';
        sb.appendChild(a);
      }
    }
    // лендинг: кнопки входа
    if (!u) document.querySelectorAll('a[href$="panel.html"]').forEach((a) => { a.href = '/auth/login.php?next=/panel.html'; });
    applyStream(me.stream);
  }

  let streamState = null;
  function applyStream(st) {
    streamState = st || streamState;
    const box = document.querySelector('header [role="status"]');
    if (!box || !streamState) return;
    const spans = box.querySelectorAll(':scope > span');
    if (!box.dataset.wired) {
      box.dataset.wired = '1';
      setInterval(() => applyStream(null), 1000);
    }
    const live = streamState.live;
    const dot = spans[0] && spans[0].querySelector('span');
    const label = spans[0] && spans[0].lastElementChild;
    if (label) label.textContent = live ? 'В ЭФИРЕ' : 'НЕ В ЭФИРЕ';
    if (dot) dot.style.opacity = live ? '1' : '0.25';
    const timer = spans[1];
    const viewers = spans[2];
    if (timer) {
      const m = timer.classList.contains('mono') ? timer : timer.querySelector('.mono');
      if (m) m.textContent = live ? StreAPI.fmtDur(Date.now() / 1000 - streamState.startedAt) : '—';
    }
    if (viewers) {
      const m = viewers.classList.contains('mono') ? viewers : viewers.querySelector('.mono');
      if (m) m.textContent = live ? StreAPI.fmtNum(streamState.viewers) : '—';
    }
    box.setAttribute('aria-label', live ? 'В эфире, ' + streamState.viewers + ' зрителей' : 'Не в эфире');
  }

  async function boot() {
    const me = await StreAPI.me();
    if (!me.user && isPanel()) {
      location.href = '/auth/login.php?next=' + encodeURIComponent(location.pathname + location.search);
      return;
    }
    applyUser(me);
    if (me.user && isPanel()) setInterval(async () => { try { const m = await StreAPI.refreshMe(); applyStream(m.stream); } catch (e) { /* позже */ } }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();

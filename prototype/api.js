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
    document.querySelectorAll('[data-stre-user]').forEach((a) => {
      if (!u) return;
      const av = a.querySelector('[data-av]');
      const name = a.querySelector('[data-name]');
      if (av) {
        if (u.avatar) {
          const img = document.createElement('img');
          img.src = u.avatar; img.alt = ''; img.width = 32; img.height = 32;
          img.style.cssText = 'width:100%;height:100%;border-radius:999px;object-fit:cover;display:block';
          av.replaceChildren(img);
        } else av.textContent = initials(u.name);
      }
      if (name) name.textContent = u.name;
      a.setAttribute('aria-label', 'Профиль ' + u.name);
    });
    const sb = document.querySelector('nav.sb');
    if (sb && u) {
      if (u.isAdmin && !sb.querySelector('[data-admin]')) {
        const a = document.createElement('a');
        a.href = '/admin.html';
        a.className = 'sb-i';
        a.dataset.admin = '1';
        if (/\/admin\.html$/.test(location.pathname)) a.setAttribute('aria-current', 'page');
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
    applyStream(me.stream);
    if (me.announcement) showBanner(me.announcement);
    if (u && u.isAdmin && /admin\.html$/.test(location.pathname)) adminAnnounceForm();
    if (me.support && u) supportBanner(u.login);
    if (u && !me.support && /settings\.html$/.test(location.pathname)) settingsSupportBlock();
    if (u && u.isAdmin && /admin\.html$/.test(location.pathname)) adminSupportEnter();
  }

  // ---------- объявления: баннер для всех и форма администратора ----------
  function showBanner(a) {
    if (!a || document.getElementById('stre-ann')) return;
    const box = document.createElement('div');
    box.id = 'stre-ann';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Объявление от StreOps');
    box.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:550;max-width:min(680px,calc(100vw - 32px));display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:10px;background:rgba(10,10,10,.92);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 32px -8px rgba(0,0,0,.6);font:400 14px/20px Onest,system-ui,sans-serif;color:#F2F2F2';
    const txt = document.createElement('span');
    txt.style.flex = '1';
    txt.textContent = a.text;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Понятно';
    ok.style.cssText = 'height:32px;padding:0 12px;border-radius:6px;border:0;background:#FFFFFF;color:#0A0A0A;font:500 13px/16px Onest,system-ui,sans-serif;cursor:pointer;flex:none';
    ok.onclick = () => { box.remove(); StreAPI.post('announce.dismiss', { id: a.id }).catch(() => {}); };
    box.append(txt, ok);
    document.body.appendChild(box);
  }

  function adminAnnounceForm() {
    if (document.getElementById('stre-ann-admin')) return;
    const wrap = document.createElement('section');
    wrap.id = 'stre-ann-admin';
    wrap.setAttribute('aria-labelledby', 'stre-ann-admin-h');
    wrap.style.cssText = 'margin:24px auto 0;max-width:1200px;padding:16px 20px;border-radius:12px;background:rgba(18,18,18,.7);border:1px solid #2A2A2A;font:400 14px/20px Onest,system-ui,sans-serif;color:#F2F2F2';
    wrap.innerHTML = '<h2 id="stre-ann-admin-h" style="margin:0 0 4px;font-size:18px;font-weight:600">Объявление пользователям</h2>' +
      '<p style="margin:0 0 12px;color:#B4B4B4">Баннер увидят все, кто зайдёт в панель. Пользователь закрывает его сам. Оставь ник пустым, чтобы показать всем.</p>' +
      '<div id="stre-ann-now" style="margin:0 0 12px;color:#8F8F8F"></div>' +
      '<label style="display:block;margin-bottom:10px">Текст (до 300 символов)<textarea id="stre-ann-text" maxlength="300" rows="2" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border-radius:6px;background:#171717;border:1px solid #6E6E6E;color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif"></textarea></label>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">' +
      '<label>Сколько часов показывать<input id="stre-ann-hours" type="number" min="1" max="720" value="24" style="display:block;margin-top:4px;width:110px;height:36px;padding:0 10px;border-radius:6px;background:#171717;border:1px solid #6E6E6E;color:#F2F2F2"></label>' +
      '<label>Ник (необязательно)<input id="stre-ann-login" type="text" placeholder="всем" style="display:block;margin-top:4px;width:200px;height:36px;padding:0 10px;border-radius:6px;background:#171717;border:1px solid #6E6E6E;color:#F2F2F2"></label></div>' +
      '<div style="display:flex;gap:8px"><button type="button" id="stre-ann-pub" style="height:36px;padding:0 14px;border-radius:6px;border:0;background:#FFFFFF;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;cursor:pointer">Опубликовать</button>' +
      '<button type="button" id="stre-ann-clr" style="height:36px;padding:0 14px;border-radius:6px;border:1px solid #3A3A3A;background:transparent;color:#F2F2F2;font:500 14px/20px Onest,system-ui,sans-serif;cursor:pointer">Убрать объявление</button></div>';
    document.querySelector('main, body').prepend(wrap);
    const now = document.getElementById('stre-ann-now');
    const showNow = () => StreAPI.get('admin.announce.get').then((r) => {
      const a = r.item;
      now.textContent = a && a.until > Date.now() / 1000 ? 'Сейчас показывается: «' + a.text + '»' + (a.userId ? ' (одному пользователю)' : ' (всем)') : 'Сейчас объявления нет.';
    }).catch(() => {});
    showNow();
    document.getElementById('stre-ann-pub').onclick = () => {
      const text = document.getElementById('stre-ann-text').value.trim();
      const hours = Number(document.getElementById('stre-ann-hours').value) || 24;
      const login = document.getElementById('stre-ann-login').value.trim();
      if (!text) { toast('Напиши текст объявления', 'error'); return; }
      StreAPI.post('admin.announce.set', { text, hours, login }).then(() => { toast('Объявление опубликовано'); showNow(); }).catch((e) => toast(e.message, 'error'));
    };
    document.getElementById('stre-ann-clr').onclick = () => {
      if (!confirm('Убрать объявление у всех?')) return;
      StreAPI.post('admin.announce.clear').then(() => { toast('Объявление убрано'); showNow(); }).catch((e) => toast(e.message, 'error'));
    };
  }

  // ---------- поддержка по согласию ----------
  function supportBanner(login) {
    if (document.getElementById('stre-support')) return;
    const box = document.createElement('div');
    box.id = 'stre-support';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:560;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:10px;background:#FFFFFF;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;box-shadow:0 12px 32px -8px rgba(0,0,0,.6)';
    const t = document.createElement('span');
    t.textContent = 'Режим поддержки: ты в аккаунте ' + login + '. Все действия идут от его имени.';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Выйти из поддержки';
    b.style.cssText = 'height:32px;padding:0 12px;border-radius:6px;border:0;background:#0A0A0A;color:#FFFFFF;font:500 13px/16px Onest,system-ui,sans-serif;cursor:pointer';
    b.onclick = () => StreAPI.post('account.supportExit').then(() => { location.href = '/admin.html'; }).catch((e) => toast(e.message, 'error'));
    box.append(t, b);
    document.body.appendChild(box);
  }

  function settingsSupportBlock() {
    const anchor = document.getElementById('platforms') || document.querySelector('main') || document.body;
    if (document.getElementById('stre-support-code')) return;
    const wrap = document.createElement('section');
    wrap.id = 'stre-support-code';
    wrap.setAttribute('aria-labelledby', 'stre-support-code-h');
    wrap.style.cssText = 'margin:24px auto 0;max-width:720px;padding:16px 20px;border-radius:12px;background:rgba(18,18,18,.7);border:1px solid #2A2A2A;font:400 14px/20px Onest,system-ui,sans-serif;color:#F2F2F2';
    wrap.innerHTML = '<h2 id="stre-support-code-h" style="margin:0 0 4px;font-size:18px;font-weight:600">Помощь с настройкой</h2>' +
      '<p style="margin:0 0 12px;color:#B4B4B4">Если хочешь, чтобы поддержка помогла настроить канал, создай код. Он действует один час и работает один раз. Доступ можно закрыть, просто подождав окончания часа. Все входы записываются.</p>' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button type="button" id="stre-support-make" style="height:36px;padding:0 14px;border-radius:6px;border:0;background:#FFFFFF;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;cursor:pointer">Создать код на 1 час</button><span id="stre-support-out" class="mono" style="font-size:18px;letter-spacing:.12em"></span></div>';
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    document.getElementById('stre-support-make').onclick = () => StreAPI.post('account.supportCode').then((r) => {
      document.getElementById('stre-support-out').textContent = r.code;
      toast('Код создан. Передай его администратору.');
    }).catch((e) => toast(e.message, 'error'));
  }

  function adminSupportEnter() {
    const form = document.getElementById('stre-ann-admin');
    if (!form || document.getElementById('stre-support-enter')) return;
    const box = document.createElement('div');
    box.id = 'stre-support-enter';
    box.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid #2A2A2A';
    box.innerHTML = '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600">Войти в аккаунт по коду поддержки</h3>' +
      '<p style="margin:0 0 10px;color:#B4B4B4">Код даёт сам пользователь (Настройки → «Создать код на 1 час»). Код одноразовый.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="stre-support-in" type="text" maxlength="16" placeholder="Код" style="height:36px;width:180px;padding:0 10px;border-radius:6px;background:#171717;border:1px solid #6E6E6E;color:#F2F2F2;letter-spacing:.1em"><button type="button" id="stre-support-go" style="height:36px;padding:0 14px;border-radius:6px;border:0;background:#FFFFFF;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;cursor:pointer">Войти</button></div>';
    form.appendChild(box);
    document.getElementById('stre-support-go').onclick = () => {
      const code = document.getElementById('stre-support-in').value.trim();
      if (!code) { toast('Введи код', 'error'); return; }
      StreAPI.post('admin.support.enter', { code }).then((r) => { toast('Ты в аккаунте ' + r.login); location.href = '/panel.html'; }).catch((e) => toast(e.message, 'error'));
    };
  }

  let streamState = null;
  let ticking = false;
  function applyStream(st) {
    if (st) streamState = st;
    const box = document.querySelector('[data-stre-live]');
    if (!box || !streamState) return;
    if (!ticking) { ticking = true; setInterval(() => applyStream(null), 1000); }
    const live = !!streamState.live;
    const q = (sel) => box.querySelector(sel);
    q('[data-label]').textContent = live ? 'В ЭФИРЕ' : 'НЕ В ЭФИРЕ';
    const dot = q('[data-dot]');
    dot.style.background = live ? 'var(--accent, #D92D20)' : 'var(--n-8, #6E6E6E)';
    dot.style.boxShadow = live ? '0 0 0 4px rgb(var(--accent-rgb, 217 45 32) / .25)' : 'none';
    q('[data-timer]').textContent = live ? StreAPI.fmtDur(Date.now() / 1000 - streamState.startedAt) : '—';
    q('[data-viewers]').textContent = live ? StreAPI.fmtNum(streamState.viewers) : '—';
    box.setAttribute('aria-label', live ? 'В эфире, зрителей: ' + streamState.viewers : 'Не в эфире');
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

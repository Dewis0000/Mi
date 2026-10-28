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
    if (isPanel() && !window.__streNotify) { window.__streNotify = true; notifyTick(); setInterval(notifyTick, 5000); }
    if (me.support && u) supportBanner(u.login);
    if (u && u.isAdmin && /admin\.html$/.test(location.pathname)) adminPanels();
  }

  // ---------- блоки, которые добавляет скрипт: общий стиль из стеклянной темы ----------
  const CSS = [
    '.stre-card{box-sizing:border-box;padding:20px 22px;border-radius:12px;background:rgba(18,18,18,.72);border:1px solid rgba(255,255,255,.10);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif}',
    '.stre-h{margin:0 0 4px;font-size:18px;line-height:24px;font-weight:600;color:#F2F2F2}',
    '.stre-p{margin:0 0 14px;color:#B4B4B4}',
    '.stre-lbl{display:block;margin:0 0 6px;font-size:11px;line-height:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:#8F8F8F}',
    '.stre-in{box-sizing:border-box;height:38px;padding:0 12px;border-radius:6px;background:#171717;border:1px solid #6E6E6E;color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif}',
    '.stre-ta{box-sizing:border-box;width:100%;padding:10px 12px;border-radius:6px;background:#171717;border:1px solid #6E6E6E;color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif;resize:vertical}',
    '.stre-btn{height:36px;padding:0 14px;border-radius:6px;border:1px solid #3A3A3A;background:transparent;color:#F2F2F2;font:500 14px/20px Onest,system-ui,sans-serif;cursor:pointer}',
    '.stre-btn:hover{border-color:#8F8F8F}',
    '.stre-btn-p{height:36px;padding:0 14px;border-radius:6px;border:0;background:#FFFFFF;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;cursor:pointer}',
    '.stre-btn-p:disabled{opacity:.5;cursor:default}',
    '.stre-row{display:flex;gap:12px;align-items:center;width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #2A2A2A;background:#111111;color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif;text-align:left;cursor:pointer}',
    '.stre-row:hover,.stre-row[aria-current="true"]{border-color:#8F8F8F}',
    '.stre-msg{max-width:80%;padding:8px 12px;border-radius:10px;font:400 14px/20px Onest,system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.stre-msg-u{background:#F2F2F2;color:#0A0A0A;margin-left:auto}',
    '.stre-msg-a{background:#1F1F1F;border:1px solid #2A2A2A;color:#F2F2F2}',
    '.stre-banner{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:550;max-width:min(680px,calc(100vw - 32px));display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;background:rgba(10,10,10,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 32px -8px rgba(0,0,0,.6);font:400 14px/20px Onest,system-ui,sans-serif;color:#F2F2F2}',
    '.stre-support-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:560;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:12px;background:#FFFFFF;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}',
    '.stre-kbd{font:500 22px/26px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.14em;color:#F2F2F2}',
    '.stre-grid{max-width:1200px;margin:24px auto 0;padding:0 16px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}',
    '.stre-wide{grid-column:1/-1}'
  ].join('\n');

  function styles() {
    if (document.getElementById('stre-css')) return;
    const st = document.createElement('style');
    st.id = 'stre-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function when(ts) { return new Date(ts * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

  let shownAnn = null; // id объявления, которое уже показано в этой вкладке
  function showBanner(a) {
    styles();
    if (!a || a.id === shownAnn) return;
    shownAnn = a.id;
    document.getElementById('stre-ann') && document.getElementById('stre-ann').remove();
    document.getElementById('stre-ann-center') && document.getElementById('stre-ann-center').remove();
    const close = () => StreAPI.post('announce.dismiss', { id: a.id }).catch(() => {});
    if (a.mode === 'center') { // окно по центру экрана: закрывается только кнопкой или Escape
      const ov = el('div');
      ov.id = 'stre-ann-center';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'Объявление от StreOps');
      ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
      const dlg = el('div');
      dlg.style.cssText = 'box-sizing:border-box;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;padding:24px;border-radius:12px;background:#111111;border:1px solid #2A2A2A;color:#F2F2F2;font-family:Onest,system-ui,sans-serif;box-shadow:0 24px 64px rgba(0,0,0,.6)';
      const h = el('p', null, 'Сообщение от StreOps');
      h.style.cssText = 'margin:0;font-size:13px;color:#8F8F8F';
      const t = el('p', null, a.text);
      t.style.cssText = 'margin:10px 0 0;font-size:17px;line-height:24px;white-space:pre-wrap;word-break:break-word';
      const hasAct = !!(a.action && a.action.url);
      const parts = [h, t];
      if (hasAct) { const c = el('div'); c.style.cssText = 'margin-top:20px;text-align:center'; c.appendChild(actionLink(a.action)); parts.push(c); }
      const ok = el('button', 'stre-btn-p', 'Понятно'); ok.type = 'button';
      ok.style.cssText = 'margin-top:' + (hasAct ? 12 : 20) + 'px;height:40px;padding:0 18px';
      const done = () => { ov.remove(); document.removeEventListener('keydown', onKey); close(); };
      const onKey = (e) => { if (e.key === 'Escape') done(); };
      ok.onclick = done;
      document.addEventListener('keydown', onKey);
      dlg.append(...parts, ok);
      ov.appendChild(dlg);
      document.body.appendChild(ov);
      ok.focus();
      return;
    }
    const box = el('div', 'stre-banner');
    box.id = 'stre-ann';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Объявление от StreOps');
    const txt = el('span', null, a.text);
    txt.style.cssText = 'flex:1;min-width:0;max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:break-word';
    const ok = el('button', 'stre-btn-p', 'Понятно');
    ok.type = 'button';
    ok.style.height = '32px';
    ok.onclick = () => { box.remove(); close(); };
    const parts = [txt];
    if (a.action && a.action.url) parts.push(actionLink(a.action));
    parts.push(ok);
    box.append(...parts);
    document.body.appendChild(box);
  }

  // Ответ поддержки: уведомление в углу, пока его не закроют
  // Кнопка-ссылка в ответе поддержки (открывает адрес в этой же вкладке)
  function actionLink(a) {
    const link = el('a', null, a.label);
    link.href = a.url;
    link.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border-radius:6px;background:#F2F2F2;color:#0A0A0A;font:500 14px/20px Onest,system-ui,sans-serif;text-decoration:none';
    return link;
  }

  // Кнопка-ссылка для объявления и ответа поддержки: текст, адрес (путь /… или https://…) и готовые варианты
  const REAUTH_URL = '/auth/login.php?reauth=1&next=/panel.html';
  function buttonEditor(toggleText, presets) {
    const toggle = el('button', 'stre-btn', toggleText); toggle.type = 'button';
    toggle.style.marginTop = '8px';
    const box = el('div');
    box.style.cssText = 'margin-top:8px;display:none;flex-direction:column;gap:8px';
    const lbl = el('input', 'stre-in'); lbl.type = 'text'; lbl.maxLength = 40; lbl.placeholder = 'Текст кнопки'; lbl.setAttribute('aria-label', 'Текст кнопки');
    const url = el('input', 'stre-in'); url.type = 'text'; url.maxLength = 500; url.placeholder = '/путь или https://адрес'; url.setAttribute('aria-label', 'Ссылка кнопки');
    const set = (label, href) => { lbl.value = label; url.value = href; box.style.display = 'flex'; };
    const reset = () => { lbl.value = ''; url.value = ''; box.style.display = 'none'; };
    const row = el('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    presets.forEach(([label, href]) => { const b = el('button', 'stre-btn', 'Кнопка «' + label + '»'); b.type = 'button'; b.onclick = () => set(label, href); row.appendChild(b); });
    const hide = el('button', 'stre-btn', 'Убрать кнопку'); hide.type = 'button'; hide.onclick = reset;
    row.appendChild(hide);
    box.append(lbl, url, row);
    toggle.onclick = () => { box.style.display = box.style.display === 'flex' ? 'none' : 'flex'; };
    return { toggle, box, set, reset, value: () => (url.value.trim() ? { buttonUrl: url.value.trim(), buttonLabel: lbl.value.trim() } : {}) };
  }

  function supportNote(text, action) {
    styles();
    document.getElementById('stre-sup-note') && document.getElementById('stre-sup-note').remove();
    const box = el('div');
    box.id = 'stre-sup-note';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;width:min(360px,calc(100vw - 32px));padding:16px;border-radius:12px;background:#111111;border:1px solid #3A3A3A;color:#F2F2F2;font-family:Onest,system-ui,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.5)';
    const h = el('p', null, 'Поддержка ответила');
    h.style.cssText = 'margin:0;font-size:13px;font-weight:600';
    const t = el('p', null, text);
    t.style.cssText = 'margin:8px 0 0;font-size:14px;line-height:20px;white-space:pre-wrap;word-break:break-word;color:#DCDCDC;max-height:120px;overflow:hidden';
    const row = el('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end';
    const open = el('a', 'stre-btn-p', 'Открыть переписку');
    open.href = 'support.html';
    const x = el('button', 'stre-btn', 'Закрыть'); x.type = 'button';
    x.onclick = () => box.remove();
    row.append(x, open);
    const parts = [h, t];
    if (action && action.url) { const c = el('div'); c.style.cssText = 'margin-top:12px;text-align:center'; c.appendChild(actionLink(action)); parts.push(c); }
    parts.push(row);
    box.append(...parts);
    document.body.appendChild(box);
  }

  // Опрос новых объявлений и ответов поддержки: без перезагрузки страницы
  let supKey = null;
  function notifyTick() {
    if (document.hidden) return;
    StreAPI.get('notify.poll').then((r) => {
      if (r.announcement) showBanner(r.announcement);
      const last = r.support && r.support.last;
      if (!last) return;
      const key = last.at + '|' + last.text;
      if (supKey === null) { supKey = key; return; } // первый опрос — старые ответы не всплывают
      if (key !== supKey) {
        supKey = key;
        if (!/support\.html$/.test(location.pathname)) supportNote(last.text, last.action);
      }
    }).catch(() => {});
  }

  function supportBanner(login) {
    styles();
    if (document.getElementById('stre-support')) return;
    const box = el('div', 'stre-support-bar');
    box.id = 'stre-support';
    box.setAttribute('role', 'status');
    box.append(el('span', null, 'Режим поддержки: ты в аккаунте ' + login + '. Все действия идут от его имени.'));
    const b = el('button', 'stre-btn', 'Выйти из поддержки');
    b.type = 'button';
    b.style.cssText = 'background:#0A0A0A;color:#FFFFFF;border:0;height:32px';
    b.onclick = () => StreAPI.post('account.supportExit').then(() => { location.href = '/admin.html'; }).catch((e) => toast(e.message, 'error'));
    box.appendChild(b);
    document.body.appendChild(box);
  }

  // Вкладки админки «Объявления» и «Поддержка»: блоки кладём в контейнеры, которые страница не перерисовывает
  function adminPanels(tries) {
    styles();
    const ann = document.getElementById('stre-ann-host');
    const sup = document.getElementById('stre-support-host');
    const promo = document.getElementById('stre-promo-host');
    const money = document.getElementById('stre-money-host');
    const prices = document.getElementById('stre-prices-host');
    if (!ann || !sup || !promo || !money || !prices) { // страница ещё не отрисовала вкладки — попробуем чуть позже
      if ((tries || 0) < 40) setTimeout(() => adminPanels((tries || 0) + 1), 150);
      return;
    }
    if (ann.dataset.filled) return;
    ann.dataset.filled = '1';
    ann.appendChild(announceCard());
    sup.append(enterCard(), inboxCard());
    promo.appendChild(promoCard());
    prices.appendChild(pricesCard());
    money.appendChild(moneyCard());
  }

  // ---------- тарифы: один список цен для админки и страниц сайта ----------
  let plansPromise = null;
  function loadPlans(fresh) {
    if (fresh || !plansPromise) plansPromise = StreAPI.get('plans').then((r) => r.items).catch(() => []);
    return plansPromise;
  }

  // Цены на страницах сайта: в разметке стоит data-plan-price="pro", подставляем актуальную цену
  function fillPlanPrices() {
    if (!document.querySelector('[data-plan-price]')) return;
    loadPlans().then((items) => {
      const price = {};
      items.forEach((p) => { price[p.key] = p.price; });
      document.querySelectorAll('[data-plan-price]').forEach((n) => {
        const v = price[n.getAttribute('data-plan-price')];
        if (v != null) n.textContent = StreAPI.fmtNum(v);
      });
    });
  }

  function rub(n) { return StreAPI.fmtNum(n) + ' ₽'; }

  function optionEl(value, text) { const o = el('option', null, text); o.value = value; return o; }

  // Список тарифов в форме: платные тарифы и, если нужно, «любой платный»
  function fillPlanSelect(select, withAny, current) {
    loadPlans().then((items) => {
      select.textContent = '';
      if (withAny) select.appendChild(optionEl('any', 'Любой платный тариф'));
      items.filter((p) => p.price > 0).forEach((p) => select.appendChild(optionEl(p.key, p.name + ' · ' + rub(p.price))));
      if (current) select.value = current;
    });
  }

  function actionsRow(...nodes) {
    const row = el('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;grid-column:1/-1';
    row.append(...nodes);
    return row;
  }

  function fieldLabel(text, input) {
    const l = el('label', 'stre-lbl', text);
    l.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    l.appendChild(input);
    return l;
  }

  // Дата окончания кода в формате ГГГГ-ММ-ДД по Москве (как её считает сервер)
  function moscowDate(ts) {
    return ts ? new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }) : '';
  }

  // Изменить условия кода: скидку, срок, лимит, партнёра, срок действия. Тариф — только пока не было оплат
  function promoEditor(c, reload, close) {
    const f = el('form');
    f.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin-top:12px';
    const plan = el('select', 'stre-in');
    fillPlanSelect(plan, true, c.plan);
    plan.disabled = c.hasPayments;
    if (c.hasPayments) plan.title = 'По коду уже были оплаты: тариф менять нельзя';
    const percent = el('input', 'stre-in'); percent.type = 'number'; percent.min = '1'; percent.max = '100'; percent.value = String(c.percent);
    const days = el('input', 'stre-in'); days.type = 'number'; days.min = '1'; days.max = '365'; days.value = String(c.days);
    const max = el('input', 'stre-in'); max.type = 'number'; max.min = '0'; max.value = String(c.maxUses);
    const partner = el('input', 'stre-in'); partner.maxLength = 120; partner.value = c.partner;
    const expires = el('input', 'stre-in'); expires.type = 'date'; expires.value = moscowDate(c.expiresAt);
    const save = el('button', 'stre-btn-p', 'Сохранить'); save.type = 'submit';
    const cancel = el('button', 'stre-btn', 'Отмена'); cancel.type = 'button'; cancel.onclick = close;
    f.append(fieldLabel('Тариф', plan), fieldLabel('Скидка, %', percent), fieldLabel('Дней подписки', days),
      fieldLabel('Лимит, раз (0 — без лимита)', max), fieldLabel('Партнёр', partner), fieldLabel('Действует до', expires),
      actionsRow(save, cancel));
    f.onsubmit = (e) => {
      e.preventDefault();
      const body = { id: c.id, percent: Number(percent.value), days: Number(days.value), maxUses: Number(max.value), partner: partner.value.trim(), expiresAt: expires.value };
      if (!plan.disabled) body.plan = plan.value;
      save.disabled = true;
      StreAPI.post('promo.update', body).then(() => { toast('Код «' + c.code + '» обновлён'); reload(); })
        .catch((err) => toast(err.message, 'error')).then(() => { save.disabled = false; });
    };
    return f;
  }

  // Таблица из сетки: заголовки и строки текста
  function grid(cols, head, rows) {
    const g = el('div');
    g.style.cssText = 'display:grid;gap:8px 14px;align-items:center;font-size:13px;grid-template-columns:' + cols;
    head.forEach((t) => { const c = el('span', 'stre-lbl', t); c.style.margin = '0'; g.appendChild(c); });
    rows.forEach((r) => r.forEach((v) => {
      const c = el('span', null, v == null ? '' : String(v));
      c.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#DCDCDC';
      g.appendChild(c);
    }));
    return g;
  }

  const PAY_STATUS = { paid: 'Оплачено', free: 'Бесплатно', pending: 'Ждёт оплаты', canceled: 'Отменено', error: 'Ошибка', creating: 'Создаётся' };

  // Кто применил код: оплаты (любой статус) и бесплатные активации
  function activationsTable(rows) {
    if (!rows.length) return el('p', 'stre-p', 'Пока никто не применил этот код.');
    return grid('minmax(110px,1.1fr) minmax(110px,1fr) minmax(100px,0.9fr) 110px 120px', ['Пользователь', 'Тариф', 'Сумма', 'Статус', 'Дата'], rows.map((x) => [
      '@' + x.login, x.planName,
      x.status === 'free' ? '0 ₽' : rub(x.amount) + (x.listPrice > x.amount ? ' (было ' + rub(x.listPrice) + ')' : ''),
      PAY_STATUS[x.status] || x.status, when(x.at),
    ]));
  }

  // Промокоды: создать, включить или выключить, удалить; видно, кто применил код, что купил и сколько принёс
  function promoCard() {
    const card = el('section', 'stre-card stre-wide');
    card.setAttribute('aria-labelledby', 'stre-promo-h');
    const h = el('h2', 'stre-h', 'Промокоды');
    h.id = 'stre-promo-h';
    card.append(h, el('p', 'stre-p', 'Скидка или бесплатный период. Код привязан к одному тарифу или работает на любой платный. Партнёр нужен для статистики: видно, кто по его коду покупал и сколько принёс денег. Один пользователь применяет код один раз.'));
    const form = el('form');
    form.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin-top:12px';
    const code = el('input', 'stre-in'); code.maxLength = 32; code.placeholder = 'WELCOME'; code.setAttribute('aria-label', 'Код');
    const plan = el('select', 'stre-in');
    fillPlanSelect(plan, true);
    const percent = el('input', 'stre-in'); percent.type = 'number'; percent.min = '1'; percent.max = '100'; percent.value = '50'; percent.setAttribute('aria-label', 'Скидка, процентов');
    const days = el('input', 'stre-in'); days.type = 'number'; days.min = '1'; days.max = '365'; days.value = '30'; days.setAttribute('aria-label', 'Дней подписки');
    const max = el('input', 'stre-in'); max.type = 'number'; max.min = '0'; max.value = '0'; max.setAttribute('aria-label', 'Лимит использований, 0 — без лимита');
    const partner = el('input', 'stre-in'); partner.maxLength = 120; partner.placeholder = 'Блогер, канал, партнёр'; partner.setAttribute('aria-label', 'Партнёр');
    const expires = el('input', 'stre-in'); expires.type = 'date'; expires.setAttribute('aria-label', 'Действует до');
    const lbl = (text, input) => { const l = el('label', 'stre-lbl', text); l.style.cssText = 'display:flex;flex-direction:column;gap:6px'; l.appendChild(input); return l; };
    const submit = el('button', 'stre-btn-p', 'Создать код'); submit.type = 'submit';
    form.append(lbl('Код', code), lbl('Тариф', plan), lbl('Скидка, %', percent), lbl('Дней подписки', days),
      lbl('Лимит, раз (0 — без лимита)', max), lbl('Партнёр (необязательно)', partner), lbl('Действует до (необязательно)', expires), submit);
    const list = el('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:16px';
    const load = () => Promise.all([StreAPI.get('promo.list'), loadPlans()]).then(([r, plans]) => {
      const names = {};
      plans.forEach((p) => { names[p.key] = p.name; });
      names.any = 'любой платный';
      list.textContent = '';
      if (!r.items.length) { list.appendChild(el('p', 'stre-p', 'Промокодов пока нет.')); return; }
      r.items.forEach((c) => list.appendChild(promoRow(c, names, load)));
    }).catch((e) => toast(e.message, 'error'));
    form.onsubmit = (e) => {
      e.preventDefault();
      const body = { code: code.value, plan: plan.value, percent: Number(percent.value), days: Number(days.value), maxUses: Number(max.value), partner: partner.value.trim(), expiresAt: expires.value };
      submit.disabled = true;
      StreAPI.post('promo.save', body).then(() => { toast('Код «' + code.value.trim().toUpperCase() + '» создан'); code.value = ''; partner.value = ''; expires.value = ''; load(); })
        .catch((err) => toast(err.message, 'error')).then(() => { submit.disabled = false; });
    };
    card.append(form, list);
    load();
    return card;
  }

  function promoRow(c, names, reload) {
    const box = el('div', 'stre-row');
    box.style.cssText = 'display:block';
    const top = el('div');
    top.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    const info = el('span');
    info.style.cssText = 'flex:1;min-width:0;display:block';
    const title = el('span', null, c.code);
    title.style.cssText = 'font-family:"JetBrains Mono",monospace;font-weight:600';
    const tags = [c.percent >= 100 ? 'бесплатно' : 'скидка ' + c.percent + '%', names[c.plan] || c.plan, c.days + ' дн.'];
    if (c.partner) tags.push('партнёр: ' + c.partner);
    tags.push('использовано ' + c.used + (c.maxUses ? ' из ' + c.maxUses : ''));
    if (c.expiresAt) tags.push('до ' + StreAPI.fmtDate(c.expiresAt));
    if (!c.active) tags.push('выключен');
    const sub = el('span', 'stre-p', tags.join(' · '));
    sub.style.cssText = 'display:block;margin-top:2px;color:#8F8F8F';
    const money = el('span', null, 'Применили: ' + c.applied + ' · оплатили: ' + c.paid + ' · принесли: ' + rub(c.revenue) + (c.discount ? ' · скидки: ' + rub(c.discount) : ''));
    money.style.cssText = 'display:block;margin-top:4px;font-size:13px;color:#DCDCDC';
    info.append(title, sub, money);
    const det = el('button', 'stre-btn', 'Кто применил'); det.type = 'button';
    const edit = el('button', 'stre-btn', 'Изменить'); edit.type = 'button';
    let editor = null;
    edit.onclick = () => {
      if (editor) { editor.remove(); editor = null; return; }
      editor = promoEditor(c, reload, () => { editor.remove(); editor = null; });
      box.append(editor);
    };
    const tgl = el('button', 'stre-btn', c.active ? 'Выключить' : 'Включить'); tgl.type = 'button';
    tgl.onclick = () => StreAPI.post('promo.toggle', { id: c.id }).then(reload).catch((e) => toast(e.message, 'error'));
    const del = el('button', 'stre-btn', 'Удалить'); del.type = 'button';
    del.style.color = '#FF6369';
    if (c.hasPayments) { del.disabled = true; del.title = 'По коду были оплаты: его нельзя удалить, можно выключить'; }
    del.onclick = () => { if (confirm('Удалить код «' + c.code + '»?')) StreAPI.post('promo.delete', { id: c.id }).then(() => { toast('Код удалён'); reload(); }).catch((e) => toast(e.message, 'error')); };
    top.append(info, det, edit, tgl, del);
    box.append(top);
    let detail = null;
    det.onclick = () => {
      if (detail) { detail.remove(); detail = null; det.textContent = 'Кто применил'; return; }
      det.textContent = 'Скрыть';
      detail = el('div');
      detail.style.cssText = 'margin-top:12px';
      detail.append(el('p', 'stre-p', 'Загружаем…'));
      box.append(detail);
      StreAPI.get('promo.detail', { id: c.id }).then((r) => {
        detail.textContent = '';
        detail.append(activationsTable(r.activations));
      }).catch((e) => { detail.textContent = ''; toast(e.message, 'error'); });
    };
    return box;
  }

  // Цены тарифов: меняются в админке, новые оплаты идут уже по ним, прошлые платежи не меняются
  function pricesCard() {
    const card = el('section', 'stre-card');
    card.setAttribute('aria-labelledby', 'stre-prices-h');
    const h = el('h2', 'stre-h', 'Цены тарифов');
    h.id = 'stre-prices-h';
    card.append(h, el('p', 'stre-p', 'Новая цена действует для всех новых оплат и на страницах сайта. Уже оплаченные платежи не меняются: в отчёте о деньгах остаётся сумма, которую заплатили.'));
    const form = el('form');
    form.style.cssText = 'display:grid;gap:12px;margin-top:12px;max-width:420px';
    const inputs = {};
    const fill = (items) => {
      form.textContent = '';
      items.filter((p) => p.defaultPrice > 0).forEach((p) => {
        const input = el('input', 'stre-in');
        input.type = 'number'; input.min = '1'; input.max = '100000'; input.step = '1'; input.value = String(p.price);
        input.setAttribute('aria-label', 'Цена, ' + p.name);
        inputs[p.key] = input;
        const hint = el('span', 'stre-p', p.price !== p.defaultPrice ? 'по умолчанию было ' + rub(p.defaultPrice) : 'стандартная цена');
        hint.style.cssText = 'margin:0;font-size:12px;color:#8F8F8F';
        const l = el('label', 'stre-lbl', p.name + ', ₽ за 30 дней');
        l.style.cssText = 'display:flex;flex-direction:column;gap:6px';
        l.append(input, hint);
        form.appendChild(l);
      });
      const save = el('button', 'stre-btn-p', 'Сохранить цены'); save.type = 'submit';
      form.appendChild(save);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const prices = {};
      Object.keys(inputs).forEach((k) => { prices[k] = inputs[k].value.trim(); });
      StreAPI.post('admin.prices.set', { prices }).then((r) => {
        toast('Цены сохранены');
        loadPlans(true).then(fill);
      }).catch((err) => toast(err.message, 'error'));
    };
    card.appendChild(form);
    loadPlans(true).then(fill);
    return card;
  }

  // Деньги: выручка по периодам и дням, тарифы, промокоды, партнёры, последние оплаты
  function moneyCard() {
    const card = el('section', 'stre-card stre-wide');
    card.setAttribute('aria-labelledby', 'stre-money-h');
    const head = el('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap';
    const h = el('h2', 'stre-h', 'Деньги');
    h.id = 'stre-money-h';
    const refresh = el('button', 'stre-btn', 'Обновить'); refresh.type = 'button';
    head.append(h, refresh);
    const body = el('div');
    body.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:22px';
    card.append(head, el('p', 'stre-p', 'Учитываются только подтверждённые оплаты тарифов через ЮKassa. Скидка — цена без скидки минус сумма, которую заплатил пользователь. Возвраты через панель не делаются: деньги, которые вернули в ЮKassa вручную, в отчёте остаются.'), body);
    const tile = (label, value, sub) => {
      const t = el('div');
      t.style.cssText = 'border:1px solid #2A2A2A;border-radius:10px;padding:14px 16px;background:#141414;min-width:0';
      t.append(el('span', 'stre-lbl', label), el('span', null, value), el('span', 'stre-p', sub));
      t.lastChild.style.cssText = 'display:block;margin-top:4px;color:#8F8F8F;font-size:12px';
      t.children[1].style.cssText = 'display:block;font-size:22px;font-weight:600;letter-spacing:-.01em';
      return t;
    };
    const chart = (daily) => {
      const max = Math.max(1, ...daily.map((d) => d.sum));
      const bars = el('div');
      bars.style.cssText = 'display:flex;align-items:flex-end;gap:3px;height:150px;padding:8px 0;border-bottom:1px solid #2A2A2A';
      daily.forEach((d) => {
        const b = el('div');
        b.style.cssText = 'flex:1;min-width:4px;border-radius:3px 3px 0 0;background:' + (d.sum ? '#F2F2F2' : '#2A2A2A') + ';height:' + Math.max(2, Math.round(d.sum / max * 140)) + 'px';
        b.title = StreAPI.fmtDate(new Date(d.day + 'T12:00:00').getTime() / 1000) + ': ' + rub(d.sum) + ', оплат: ' + d.count;
        bars.appendChild(b);
      });
      const axis = el('div');
      axis.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;color:#8F8F8F;margin-top:6px';
      axis.append(el('span', null, daily.length ? daily[0].day : ''), el('span', null, 'Максимум за день: ' + rub(max)), el('span', null, daily.length ? daily[daily.length - 1].day : ''));
      return [bars, axis];
    };
    const render = (r) => {
      body.textContent = '';
      const tiles = el('div');
      tiles.style.cssText = 'display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))';
      tiles.append(
        tile('Сегодня', rub(r.periods.today.sum), r.periods.today.count + ' оплат'),
        tile('7 дней', rub(r.periods.week.sum), r.periods.week.count + ' оплат'),
        tile('30 дней', rub(r.periods.month.sum), r.periods.month.count + ' оплат'),
        tile('Всё время', rub(r.all.sum), r.all.count + ' оплат'),
        tile('Средний чек', rub(r.all.avgCheck), 'по всем оплатам'),
        tile('Скидки выданы', rub(r.all.discount), 'разница с ценой без скидки'),
        tile('Без промокода', rub(r.direct.sum), r.direct.count + ' оплат'),
      );
      const sec = (title, node) => {
        const s = el('div');
        s.append(el('p', 'stre-lbl', title), node);
        return s;
      };
      const f = r.funnel;
      const conv = f.created ? Math.round(f.succeeded / f.created * 100) : 0;
      const funnel = grid('1fr 1fr', ['Что произошло', 'Оплат'], [
        ['Оплата начата', f.created], ['Оплачено', f.succeeded + ' (' + conv + '%)'], ['Ждут оплаты', f.pending], ['Отменено', f.canceled], ['Ошибка ЮKassa', f.error],
      ]);
      const plans = r.byPlan.length
        ? grid('1.3fr 0.7fr 1fr 0.7fr', ['Тариф', 'Оплат', 'Выручка', 'Доля'], r.byPlan.map((p) => [p.name, p.count, rub(p.sum), (r.all.sum ? Math.round(p.sum / r.all.sum * 100) : 0) + '%']))
        : el('p', 'stre-p', 'Оплат пока нет.');
      const promos = r.byPromo.length
        ? grid('1fr 1fr 0.6fr 1fr 1fr 0.7fr', ['Код', 'Партнёр', 'Оплат', 'Выручка', 'Скидки', 'Бесплатно'], r.byPromo.map((c) => [c.code, c.partner || '—', c.count, rub(c.sum), rub(c.discount), c.free]))
        : el('p', 'stre-p', 'По промокодам оплат пока нет.');
      const partners = r.byPartner.length
        ? grid('1.4fr 0.6fr 1fr 1fr 0.7fr', ['Партнёр', 'Оплат', 'Выручка', 'Скидки', 'Бесплатно'], r.byPartner.map((p) => [p.partner, p.count, rub(p.sum), rub(p.discount), p.free]))
        : el('p', 'stre-p', 'Партнёров пока нет.');
      const recent = r.recent.length
        ? grid('1fr 1.2fr 1fr 1fr 1fr 1fr', ['Когда', 'Пользователь', 'Тариф', 'Сумма', 'Было', 'Промокод'], r.recent.map((p) => [
          when(p.at), '@' + p.login, p.planName, rub(p.amount), p.listPrice > p.amount ? rub(p.listPrice) : '—', p.promo || '—']))
        : el('p', 'stre-p', 'Оплат пока нет.');
      const [bars, axis] = chart(r.daily);
      body.append(tiles, sec('Оплаты за последние 30 дней', bars), axis, sec('Тарифы', plans), sec('Промокоды', promos), sec('Партнёры', partners), sec('Воронка оплат', funnel), sec('Последние оплаты', recent));
    };
    const load = () => {
      body.textContent = '';
      body.append(el('p', 'stre-p', 'Считаем…'));
      StreAPI.get('admin.money').then(render).catch((e) => { body.textContent = ''; body.append(el('p', 'stre-p', e.message)); toast(e.message, 'error'); });
    };
    refresh.onclick = load;
    load();
    return card;
  }

  // Шаблон объявления: последние обновления и просьба перезайти; текст можно поправить перед публикацией
  const ANN_TEMPLATE = [
    'Обновления StreOps за последнее время:',
    '• Заказы за баллы канала работают: заказ попадает в очередь, а если трек не сыграл, баллы возвращаются.',
    '• Импорт плейлистов: ссылка на YouTube, Deezer или Apple Music либо список песен текстом. Статус видно по каждому треку.',
    '• Автоподбор музыки: без повторов песни и без одного исполнителя подряд, подбирает похожие треки.',
    '• Модераторы канала не попадают под автомодерацию, а владелец и модераторы пишут на сайте без паузы.',
    '• В ответах поддержки бывают кнопки-ссылки, например для обновления доступа к Twitch.',
    '',
    'В связи с технической настройкой нужно заново войти в аккаунт. Нажми кнопку ниже.',
  ].join('\n');

  function announceCard() {
    const card = el('section', 'stre-card');
    card.setAttribute('aria-labelledby', 'stre-ann-h');
    card.append(el('h2', 'stre-h', 'Объявление пользователям'), el('p', 'stre-p', 'Увидят все, кто зайдёт в панель: полосой сверху или окном по центру. Можно добавить кнопку-ссылку. Пользователь закрывает объявление сам. Ник оставь пустым, чтобы показать всем.'));
    const now = el('p', 'stre-p');
    now.style.color = '#8F8F8F';
    const lab1 = el('label', 'stre-lbl', 'Текст (до 1000 символов)');
    const ta = el('textarea', 'stre-ta');
    ta.rows = 3; ta.maxLength = 1000;
    lab1.appendChild(ta);
    const row = el('div');
    row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:12px 0';
    const mLab = el('label', 'stre-lbl', 'Как показать');
    const mode = el('select', 'stre-in');
    mode.style.width = '220px';
    [['top', 'Полосой сверху'], ['center', 'Окном по центру экрана']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; mode.appendChild(o); });
    mLab.appendChild(mode);
    const hLab = el('label', 'stre-lbl', 'Часов показывать');
    const hours = el('input', 'stre-in'); hours.type = 'number'; hours.min = '1'; hours.max = '720'; hours.value = '24'; hours.style.width = '110px';
    const nLab = el('label', 'stre-lbl', 'Ник (необязательно)');
    const login = el('input', 'stre-in'); login.type = 'text'; login.placeholder = 'всем'; login.style.width = '200px';
    hLab.appendChild(hours); nLab.appendChild(login);
    row.append(mLab, hLab, nLab);
    // Кнопка-ссылка под текстом (перезайти в аккаунт) и заполнение шаблоном с обновлениями
    const btn = buttonEditor('Добавить кнопку под текстом', [['Перезайти в аккаунт', REAUTH_URL], ['Обновить доступ к Twitch', REAUTH_URL]]);
    btn.toggle.style.display = 'inline-flex';
    const btns = el('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const tpl = el('button', 'stre-btn', 'Заполнить шаблоном: обновления и перезаход'); tpl.type = 'button';
    tpl.onclick = () => { ta.value = ANN_TEMPLATE; mode.value = 'center'; btn.set('Перезайти в аккаунт', REAUTH_URL); ta.focus(); };
    const pub = el('button', 'stre-btn-p', 'Опубликовать'); pub.type = 'button';
    const clr = el('button', 'stre-btn', 'Убрать объявление'); clr.type = 'button';
    btns.append(pub, tpl, clr);
    const showNow = () => StreAPI.get('admin.announce.get').then((r) => {
      const a = r.item;
      const short = a && a.text.length > 120 ? a.text.slice(0, 120) + '…' : a && a.text;
      now.textContent = a && a.until > Date.now() / 1000 ? 'Сейчас показывается: «' + short + '»' + (a.userId ? ' — одному пользователю' : ' — всем') + (a.action ? ' · с кнопкой «' + a.action.label + '»' : '') : 'Сейчас объявления нет.';
    }).catch(() => {});
    pub.onclick = () => {
      const text = ta.value.trim();
      if (!text) { toast('Напиши текст объявления', 'error'); return; }
      StreAPI.post('admin.announce.set', Object.assign({ text, mode: mode.value, hours: Number(hours.value) || 24, login: login.value.trim() }, btn.value()))
        .then(() => { toast('Объявление опубликовано'); ta.value = ''; btn.reset(); showNow(); })
        .catch((e) => toast(e.message, 'error'));
    };
    clr.onclick = () => {
      if (!confirm('Убрать объявление у всех?')) return;
      StreAPI.post('admin.announce.clear').then(() => { toast('Объявление убрано'); showNow(); }).catch((e) => toast(e.message, 'error'));
    };
    card.append(now, lab1, row, btn.toggle, btn.box, btns);
    showNow();
    return card;
  }

  function enterCard() {
    const card = el('section', 'stre-card');
    card.setAttribute('aria-labelledby', 'stre-enter-h');
    card.append(el('h2', 'stre-h', 'Войти в аккаунт по коду'), el('p', 'stre-p', 'Код даёт сам пользователь: Поддержка → «Создать код на 1 час». Код одноразовый, а вход записывается в журнал.'));
    const row = el('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    const inp = el('input', 'stre-in'); inp.type = 'text'; inp.maxLength = 16; inp.placeholder = 'Код'; inp.style.cssText += ';width:180px;letter-spacing:.1em';
    inp.setAttribute('aria-label', 'Код поддержки');
    const go = el('button', 'stre-btn-p', 'Войти'); go.type = 'button';
    row.append(inp, go);
    card.appendChild(row);
    go.onclick = () => {
      const code = inp.value.trim();
      if (!code) { toast('Введи код', 'error'); return; }
      StreAPI.post('admin.support.enter', { code }).then((r) => { toast('Ты в аккаунте ' + r.login); location.href = '/panel.html'; }).catch((e) => toast(e.message, 'error'));
    };
    return card;
  }

  function inboxCard() {
    const card = el('section', 'stre-card stre-wide');
    card.setAttribute('aria-labelledby', 'stre-inbox-h');
    const head = el('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap';
    head.append(el('h2', 'stre-h', 'Обращения в поддержку'));
    const refresh = el('button', 'stre-btn', 'Обновить'); refresh.type = 'button';
    head.appendChild(refresh);
    const list = el('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:12px';
    const thread = el('div');
    thread.style.cssText = 'margin-top:16px;display:none;flex-direction:column;gap:8px';
    const replyBox = el('div');
    replyBox.style.cssText = 'margin-top:12px;display:none;gap:8px;align-items:flex-end';
    const ta = el('textarea', 'stre-ta'); ta.rows = 2; ta.maxLength = 1000; ta.placeholder = 'Ответ пользователю'; ta.setAttribute('aria-label', 'Ответ пользователю');
    const send = el('button', 'stre-btn-p', 'Ответить'); send.type = 'button';
    replyBox.append(ta, send);
    // Кнопка под сообщением: текст и ссылка (путь на сайте /… или https://…); пользователь нажмёт её в переписке
    const btn = buttonEditor('Добавить кнопку под сообщением', [['Обновить доступ к Twitch', REAUTH_URL]]);
    btn.toggle.style.display = 'none';
    // Быстрые ответы: нажал — текст попал в поле, можно поправить и отправить
    const TEMPLATES = ['Заявка закрыта, спасибо за обращение.', 'Заявка принята, ответим здесь же.', 'Нужна дополнительная информация: опиши, что произошло и на какой странице.', 'Проблема решена. Если появится снова, напиши сюда.', 'Тариф и промокоды проверь в разделе «Тариф» в настройках.'];
    const tplRow = el('div');
    tplRow.style.cssText = 'margin-top:12px;display:none;flex-wrap:wrap;gap:6px;align-items:center';
    tplRow.appendChild(el('span', 'stre-p', 'Быстрый ответ:'));
    TEMPLATES.forEach((t) => {
      const b = el('button', 'stre-btn', t.length > 34 ? t.slice(0, 32) + '…' : t); b.type = 'button'; b.title = t;
      b.onclick = () => { ta.value = ta.value ? ta.value + ' ' + t : t; ta.focus(); };
      tplRow.appendChild(b);
    });
    let current = 0;
    let currentLogin = '';
    const renderThread = (items) => {
      thread.textContent = '';
      items.forEach((m) => {
        const mine = m.from === 'admin';
        const bub = el('div', null, m.text);
        bub.style.cssText = 'max-width:80%;padding:10px 12px;border-radius:8px;font-size:14px;line-height:20px;white-space:pre-wrap;word-break:break-word;' + (mine ? 'background:#F2F2F2;color:#0A0A0A;' : 'background:#1F1F1F;border:1px solid #2A2A2A;color:#F2F2F2;');
        const meta = el('div', null, (mine ? 'Ты (поддержка)' : currentLogin + ' (пользователь)') + ' · ' + when(m.at));
        meta.style.cssText = 'font-size:11px;color:#8F8F8F;margin-bottom:4px';
        const wrapM = el('div');
        wrapM.style.cssText = 'display:flex;flex-direction:column;max-width:100%;align-items:' + (mine ? 'flex-end' : 'flex-start');
        if (m.action && m.action.url) { const ab = el('div'); ab.style.cssText = 'text-align:center;margin-top:6px'; ab.appendChild(actionLink(m.action)); wrapM.append(meta, bub, ab); }
        else wrapM.append(meta, bub);
        thread.appendChild(wrapM);
      });
      if (!items.length) thread.appendChild(el('p', 'stre-p', 'Сообщений пока нет.'));
      thread.scrollTop = thread.scrollHeight;
    };
    const openThread = (id, login) => {
      current = id;
      currentLogin = login;
      thread.style.display = 'flex';
      tplRow.style.display = 'flex';
      replyBox.style.display = 'flex';
      btn.toggle.style.display = 'inline-flex';
      card.querySelector('#stre-thread-h') && card.querySelector('#stre-thread-h').remove();
      const th = el('h3', 'stre-lbl', 'Переписка с ' + login + '. Слева — пользователь, справа — ты');
      th.id = 'stre-thread-h';
      card.insertBefore(th, thread);
      StreAPI.get('admin.support.thread', { id }).then((r) => renderThread(r.items)).catch((e) => toast(e.message, 'error'));
    };
    const loadInbox = () => StreAPI.get('admin.support.inbox').then((r) => {
      list.textContent = '';
      if (!r.items.length) { list.appendChild(el('p', 'stre-p', 'Обращений пока нет.')); return; }
      r.items.forEach((x) => {
        const row = el('button', 'stre-row');
        row.type = 'button';
        row.setAttribute('aria-current', String(current === x.id));
        const txt = el('span');
        txt.style.cssText = 'flex:1;min-width:0;display:block';
        txt.append(el('span', null, x.login), el('span', 'stre-p', x.last));
        txt.lastChild.style.cssText = 'display:block;margin:2px 0 0;color:#8F8F8F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        const t = el('span', null, when(x.at));
        t.style.cssText = 'font-size:12px;color:#8F8F8F;flex:none';
        row.append(txt, t);
        row.onclick = () => openThread(x.id, x.login);
        list.appendChild(row);
      });
    }).catch((e) => toast(e.message, 'error'));
    send.onclick = () => {
      const text = ta.value.trim();
      if (!text || !current) return;
      const body = Object.assign({ id: current, text }, btn.value());
      send.disabled = true;
      StreAPI.post('admin.support.reply', body).then((r) => { ta.value = ''; btn.reset(); renderThread(r.items); loadInbox(); })
        .catch((e) => toast(e.message, 'error')).then(() => { send.disabled = false; });
    };
    refresh.onclick = () => { loadInbox(); if (current) openThread(current, (card.querySelector('#stre-thread-h') || { textContent: '' }).textContent.replace('Переписка с ', '')); };
    card.append(head, list, thread, tplRow, replyBox, btn.toggle, btn.box);
    loadInbox();
    return card;
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
    fillPlanPrices();
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

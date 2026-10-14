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
      dlg.style.cssText = 'width:100%;max-width:440px;padding:24px;border-radius:12px;background:#111111;border:1px solid #2A2A2A;color:#F2F2F2;font-family:Onest,system-ui,sans-serif;box-shadow:0 24px 64px rgba(0,0,0,.6)';
      const h = el('p', null, 'Сообщение от StreOps');
      h.style.cssText = 'margin:0;font-size:13px;color:#8F8F8F';
      const t = el('p', null, a.text);
      t.style.cssText = 'margin:10px 0 0;font-size:17px;line-height:24px;white-space:pre-wrap;word-break:break-word';
      const ok = el('button', 'stre-btn-p', 'Понятно'); ok.type = 'button';
      ok.style.cssText = 'margin-top:20px;height:40px;padding:0 18px';
      const done = () => { ov.remove(); document.removeEventListener('keydown', onKey); close(); };
      const onKey = (e) => { if (e.key === 'Escape') done(); };
      ok.onclick = done;
      document.addEventListener('keydown', onKey);
      dlg.append(h, t, ok);
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
    txt.style.flex = '1';
    const ok = el('button', 'stre-btn-p', 'Понятно');
    ok.type = 'button';
    ok.style.height = '32px';
    ok.onclick = () => { box.remove(); close(); };
    box.append(txt, ok);
    document.body.appendChild(box);
  }

  // Ответ поддержки: уведомление в углу, пока его не закроют
  function supportNote(text) {
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
    box.append(h, t, row);
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
        if (!/support\.html$/.test(location.pathname)) supportNote(last.text);
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
    if (!ann || !sup || !promo) { // страница ещё не отрисовала вкладки — попробуем чуть позже
      if ((tries || 0) < 40) setTimeout(() => adminPanels((tries || 0) + 1), 150);
      return;
    }
    if (ann.dataset.filled) return;
    ann.dataset.filled = '1';
    ann.appendChild(announceCard());
    sup.append(enterCard(), inboxCard());
    promo.appendChild(promoCard());
  }

  // Промокоды: создать, включить или выключить, удалить
  function promoCard() {
    const card = el('section', 'stre-card stre-wide');
    card.setAttribute('aria-labelledby', 'stre-promo-h');
    const h = el('h2', 'stre-h', 'Промокоды');
    h.id = 'stre-promo-h';
    card.append(h, el('p', 'stre-p', 'Скидка на тариф или бесплатный период. Код привязан к одному тарифу, каждый пользователь применяет его один раз. Бесплатный код (скидка 100%) включает тариф сразу.'));
    const form = el('form');
    form.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin-top:12px';
    const code = el('input', 'stre-in'); code.maxLength = 32; code.placeholder = 'WELCOME'; code.setAttribute('aria-label', 'Код');
    const plan = el('select', 'stre-in');
    [['advanced', 'Продвинутая · 299 ₽'], ['pro', 'Про · 499 ₽'], ['max', 'Максимум · 967 ₽']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; plan.appendChild(o); });
    const percent = el('input', 'stre-in'); percent.type = 'number'; percent.min = '1'; percent.max = '100'; percent.value = '50'; percent.setAttribute('aria-label', 'Скидка, процентов');
    const days = el('input', 'stre-in'); days.type = 'number'; days.min = '1'; days.max = '365'; days.value = '30'; days.setAttribute('aria-label', 'Дней');
    const max = el('input', 'stre-in'); max.type = 'number'; max.min = '0'; max.value = '0'; max.setAttribute('aria-label', 'Лимит использований, 0 — без лимита');
    const lbl = (text, input) => { const l = el('label', 'stre-lbl', text); l.style.cssText = 'display:flex;flex-direction:column;gap:6px'; l.appendChild(input); return l; };
    const submit = el('button', 'stre-btn-p', 'Создать код'); submit.type = 'submit';
    form.append(lbl('Код', code), lbl('Тариф', plan), lbl('Скидка, %', percent), lbl('Дней', days), lbl('Лимит, раз (0 — без лимита)', max), submit);
    const list = el('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:16px';
    const names = { advanced: 'Продвинутая', pro: 'Про', max: 'Максимум' };
    const load = () => StreAPI.get('promo.list').then((r) => {
      list.textContent = '';
      if (!r.items.length) { list.appendChild(el('p', 'stre-p', 'Промокодов пока нет.')); return; }
      r.items.forEach((c) => {
        const row = el('div', 'stre-row');
        const info = el('span');
        info.style.cssText = 'flex:1;min-width:0;display:block';
        const title = el('span', null, c.code);
        title.style.cssText = 'font-family:"JetBrains Mono",monospace';
        const sub = el('span', 'stre-p', (c.percent >= 100 ? 'бесплатно, ' : 'скидка ' + c.percent + '%, ') + c.days + ' дн. · ' + (names[c.plan] || c.plan) + ' · использовано ' + c.used + (c.maxUses ? ' из ' + c.maxUses : '') + (c.active ? '' : ' · выключен'));
        sub.style.cssText = 'display:block;margin-top:2px;color:#8F8F8F';
        info.append(title, sub);
        const tgl = el('button', 'stre-btn', c.active ? 'Выключить' : 'Включить'); tgl.type = 'button';
        tgl.onclick = () => StreAPI.post('promo.toggle', { id: c.id }).then(load).catch((e) => toast(e.message, 'error'));
        const del = el('button', 'stre-btn', 'Удалить'); del.type = 'button';
        del.style.color = '#FF6369';
        del.onclick = () => { if (confirm('Удалить код «' + c.code + '»? История его использования тоже удалится.')) StreAPI.post('promo.delete', { id: c.id }).then(() => { toast('Код удалён'); load(); }).catch((e) => toast(e.message, 'error')); };
        row.append(info, tgl, del);
        list.appendChild(row);
      });
    }).catch((e) => toast(e.message, 'error'));
    form.onsubmit = (e) => {
      e.preventDefault();
      const body = { code: code.value, plan: plan.value, percent: Number(percent.value), days: Number(days.value), maxUses: Number(max.value) };
      submit.disabled = true;
      StreAPI.post('promo.save', body).then(() => { toast('Код «' + code.value.trim().toUpperCase() + '» создан'); code.value = ''; load(); })
        .catch((err) => toast(err.message, 'error')).then(() => { submit.disabled = false; });
    };
    card.append(form, list);
    load();
    return card;
  }

  function announceCard() {
    const card = el('section', 'stre-card');
    card.setAttribute('aria-labelledby', 'stre-ann-h');
    card.append(el('h2', 'stre-h', 'Объявление пользователям'), el('p', 'stre-p', 'Баннер увидят все, кто зайдёт в панель. Пользователь закрывает его сам. Ник оставь пустым, чтобы показать всем.'));
    const now = el('p', 'stre-p');
    now.style.color = '#8F8F8F';
    const lab1 = el('label', 'stre-lbl', 'Текст (до 300 символов)');
    const ta = el('textarea', 'stre-ta');
    ta.rows = 2; ta.maxLength = 300;
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
    const btns = el('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const pub = el('button', 'stre-btn-p', 'Опубликовать'); pub.type = 'button';
    const clr = el('button', 'stre-btn', 'Убрать объявление'); clr.type = 'button';
    btns.append(pub, clr);
    const showNow = () => StreAPI.get('admin.announce.get').then((r) => {
      const a = r.item;
      now.textContent = a && a.until > Date.now() / 1000 ? 'Сейчас показывается: «' + a.text + '»' + (a.userId ? ' — одному пользователю' : ' — всем') : 'Сейчас объявления нет.';
    }).catch(() => {});
    pub.onclick = () => {
      const text = ta.value.trim();
      if (!text) { toast('Напиши текст объявления', 'error'); return; }
      StreAPI.post('admin.announce.set', { text, mode: mode.value, hours: Number(hours.value) || 24, login: login.value.trim() })
        .then(() => { toast('Объявление опубликовано'); ta.value = ''; showNow(); })
        .catch((e) => toast(e.message, 'error'));
    };
    clr.onclick = () => {
      if (!confirm('Убрать объявление у всех?')) return;
      StreAPI.post('admin.announce.clear').then(() => { toast('Объявление убрано'); showNow(); }).catch((e) => toast(e.message, 'error'));
    };
    card.append(now, lab1, row, btns);
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
        wrapM.append(meta, bub);
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
      send.disabled = true;
      StreAPI.post('admin.support.reply', { id: current, text }).then((r) => { ta.value = ''; renderThread(r.items); loadInbox(); })
        .catch((e) => toast(e.message, 'error')).then(() => { send.disabled = false; });
    };
    refresh.onclick = () => { loadInbox(); if (current) openThread(current, (card.querySelector('#stre-thread-h') || { textContent: '' }).textContent.replace('Переписка с ', '')); };
    card.append(head, list, thread, tplRow, replyBox);
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

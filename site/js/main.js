(function () {
  'use strict';

  /* ================== Утилиты ================== */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;

  var KEY_USER = 'streop.user';
  var KEY_LOOK = 'streop.look.v2';
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var BLOCKS = { hero: 'Главный экран', features: 'Возможности', pricing: 'Уровни подписок' };
  // Тёмная тема по умолчанию, светлая — как вариант; один тёмно-красный акцент
  var PRESETS = [
    { id: 'dark', name: 'Тёмная', bg: '#0d0b0b', fg: '#efe9e3', accent: '#c8102e' },
    { id: 'light', name: 'Светлая', bg: '#f5f1ec', fg: '#161212', accent: '#b0101f' },
    { id: 'black', name: 'Чёрная', bg: '#000000', fg: '#ffffff', accent: '#ffffff' },
    { id: 'white', name: 'Белая', bg: '#ffffff', fg: '#000000', accent: '#000000' }
  ];
  function defaultLook() {
    return {
      bg: '#0d0b0b', fg: '#efe9e3', accent: '#c8102e',
      fontHead: 'Inter Tight', fontBody: 'Inter', radius: 0, fontSize: 16,
      order: ['hero', 'features', 'pricing'], hidden: [],
      siteName: 'Streop', logo: null
    };
  }

  var user = load(KEY_USER);
  var look = Object.assign(defaultLook(), load(KEY_LOOK) || {});

  /* ================== Тост ================== */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2800);
  }

  /* ================== Хедер ================== */
  var header = $('#header');
  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var burger = $('#burger'), nav = $('#nav');
  function setNav(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  burger.addEventListener('click', function () { setNav(!nav.classList.contains('is-open')); });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });

  /* ================== Авторизация ================== */
  var loginBtn = $('#loginBtn'), userBox = $('#userBox');

  function renderAuth() {
    var logged = !!user;
    loginBtn.hidden = logged;
    userBox.hidden = !logged;
    if (logged) {
      $('#avatarLetter').textContent = (user.name || 'S').trim().charAt(0).toUpperCase();
      $('#menuName').textContent = user.name;
      $('#menuPlan').textContent = user.plan || 'Free';
    }
  }

  function login(platform) {
    var now = Date.now();
    user = {
      name: 'Стример', email: 'streamer@example.com', platform: platform,
      created: new Date(now).toISOString(),
      id: 'ST-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      plan: 'Про', renew: new Date(now + 30 * 864e5).toISOString(), balance: 1250,
      history: [
        { t: 'Пополнение баланса', d: now - 12 * 864e5, v: 1000 },
        { t: 'Подписка «Про»', d: now - 12 * 864e5, v: -499 },
        { t: 'Пополнение баланса', d: now - 3 * 864e5, v: 750 }
      ]
    };
    save(KEY_USER, user);
    renderAuth();
    closeModal($('#loginModal'));
    toast('Вы вошли через ' + platform);
  }

  function logout() {
    user = null;
    drop(KEY_USER);
    closeMenu();
    renderAuth();
    toast('Вы вышли из аккаунта');
  }

  loginBtn.addEventListener('click', function () { openModal($('#loginModal')); });
  $$('[data-login]').forEach(function (b) {
    b.addEventListener('click', function () { login(b.getAttribute('data-login')); });
  });
  $('#logoutBtn').addEventListener('click', logout);

  /* ================== Меню пользователя ================== */
  var avatarBtn = $('#avatarBtn'), menu = $('#userMenu');
  function menuItems() { return $$('[role="menuitem"]', menu); }
  function openMenu() {
    menu.classList.add('is-open');
    avatarBtn.setAttribute('aria-expanded', 'true');
    menuItems()[0].focus();
  }
  function closeMenu(focusBack) {
    if (!menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    avatarBtn.setAttribute('aria-expanded', 'false');
    if (focusBack) avatarBtn.focus();
  }
  avatarBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.classList.contains('is-open')) closeMenu(); else openMenu();
  });
  document.addEventListener('click', function (e) {
    if (!userBox.contains(e.target)) closeMenu();
    if (!nav.contains(e.target) && !burger.contains(e.target)) setNav(false);
  });
  menu.addEventListener('keydown', function (e) {
    var items = menuItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') closeMenu(true);
    else if (e.key === 'Tab') closeMenu();
  });

  $$('[data-soon]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      closeMenu();
      toast('«' + a.getAttribute('data-soon') + '» — раздел скоро появится');
    });
  });

  /* ================== Модальные окна ================== */
  var lastFocus = null;
  function openModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    var f = m.querySelector('[role="tab"][aria-selected="true"], .login-btn, input, button:not([data-close])');
    if (f) f.focus();
  }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null) lastFocus.focus();
  }
  $$('.modal').forEach(function (m) {
    $$('[data-close]', m).forEach(function (c) { c.addEventListener('click', function () { closeModal(m); }); });
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(m); return; }
      if (e.key !== 'Tab') return;
      var f = $$('button, input, select, [href]', m).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  /* ================== Кнопки действий ================== */
  $('#continueBtn').addEventListener('click', function () {
    if (user) toast('Переход в «Панель стримера» — раздел скоро появится');
    else openModal($('#loginModal'));
  });
  $$('[data-plan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var plan = b.getAttribute('data-plan');
      if (!user) { openModal($('#loginModal')); toast('Войдите, чтобы оформить тариф «' + plan + '»'); return; }
      toast('Тариф «' + plan + '»: онлайн-оплата скоро будет доступна');
    });
  });

  /* ================== Появление при скролле ================== */
  if ('IntersectionObserver' in window && !reducedMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) {
      var sib = el.parentElement ? $$('.reveal', el.parentElement).indexOf(el) : 0;
      el.style.transitionDelay = Math.min(sib, 6) * 70 + 'ms';
      io.observe(el);
    });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* =========================================================
     ОФОРМЛЕНИЕ
     ========================================================= */
  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function applyLook() {
    var s = root.style;
    s.setProperty('--bg', look.bg);
    s.setProperty('--fg', look.fg);
    s.setProperty('--accent', look.accent);
    s.setProperty('--accent-fg', luminance(look.accent) > 0.45 ? '#000000' : '#ffffff');
    s.setProperty('--font-head', '"' + look.fontHead + '", system-ui, sans-serif');
    s.setProperty('--font-body', '"' + look.fontBody + '", system-ui, sans-serif');
    s.setProperty('--r', look.radius + 'px');
    s.setProperty('--fs', look.fontSize + 'px');
    root.style.colorScheme = luminance(look.bg) > 0.4 ? 'light' : 'dark';
    s.setProperty('--vignette', luminance(look.bg) > 0.4 ? 'transparent' : 'rgba(0, 0, 0, .55)');
    $('meta[name="theme-color"]').setAttribute('content', look.bg);

    look.order.forEach(function (id, i) {
      var sec = $('[data-block="' + id + '"]');
      if (!sec) return;
      sec.style.order = i;
      sec.hidden = look.hidden.indexOf(id) !== -1;
    });
    $$('.nav a, .footer__grid a').forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      if (BLOCKS[id]) a.hidden = look.hidden.indexOf(id) !== -1;
    });

    $$('[data-site-name]').forEach(function (el) { el.textContent = look.siteName; });
    document.title = look.siteName + ' — бот и инструменты для стримеров';

    $$('[data-logo]').forEach(function (box) {
      var img = box.querySelector('img'), svg = box.querySelector('svg');
      if (look.logo) {
        if (!img) { img = document.createElement('img'); img.alt = ''; box.appendChild(img); }
        img.src = look.logo;
        if (svg) svg.style.display = 'none';
      } else {
        if (img) img.remove();
        if (svg) svg.style.display = '';
      }
    });
  }

  function commit() { save(KEY_LOOK, look); applyLook(); syncLookForm(); }

  // Пресеты
  var presetsEl = $('#presets');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.setAttribute('data-preset', p.id);
    b.innerHTML = '<span class="preset__sw"><i></i><i></i></span><span></span>';
    var sw = b.querySelectorAll('i');
    sw[0].style.background = p.bg;
    sw[1].style.background = p.fg;
    b.lastChild.textContent = p.name;
    b.addEventListener('click', function () {
      look.bg = p.bg; look.fg = p.fg; look.accent = p.accent;
      commit();
    });
    presetsEl.appendChild(b);
  });

  function syncLookForm() {
    $$('.preset').forEach(function (b) {
      var p = PRESETS.filter(function (x) { return x.id === b.getAttribute('data-preset'); })[0];
      b.classList.toggle('is-active', p.bg === look.bg && p.fg === look.fg && p.accent === look.accent);
    });
    [['cBg', 'bg'], ['cFg', 'fg'], ['cAccent', 'accent']].forEach(function (c) {
      $('#' + c[0]).value = look[c[1]];
      $('#' + c[0] + 'Hex').textContent = look[c[1]];
    });
    $('#fontHead').value = look.fontHead;
    $('#fontBody').value = look.fontBody;
    $$('#radiusSeg button').forEach(function (b) { b.classList.toggle('is-active', +b.getAttribute('data-radius') === look.radius); });
    $('#fontSize').value = look.fontSize;
    $('#sizeVal').textContent = look.fontSize;
    $('#siteName').value = look.siteName;
    renderOrder();
  }

  function renderOrder() {
    var list = $('#blockOrder');
    list.innerHTML = '';
    look.order.forEach(function (id, i) {
      var off = look.hidden.indexOf(id) !== -1;
      var li = document.createElement('li');
      if (off) li.className = 'is-off';
      li.innerHTML =
        '<label><input type="checkbox"' + (off ? '' : ' checked') + '><span></span></label>' +
        '<button type="button" class="icon-btn" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-up"/></svg></button>' +
        '<button type="button" class="icon-btn" aria-label="Ниже"' + (i === look.order.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-down"/></svg></button>';
      li.querySelector('label span').textContent = BLOCKS[id];
      li.querySelector('input').addEventListener('change', function (e) {
        if (!e.target.checked && look.hidden.length >= look.order.length - 1) {
          e.target.checked = true;
          toast('Хотя бы один блок должен остаться видимым');
          return;
        }
        look.hidden = look.hidden.filter(function (h) { return h !== id; });
        if (!e.target.checked) look.hidden.push(id);
        commit();
        $('#blockOrder').children[i].querySelector('input').focus();
      });
      var btns = li.querySelectorAll('button');
      btns[0].addEventListener('click', function () { move(i, -1); });
      btns[1].addEventListener('click', function () { move(i, 1); });
      list.appendChild(li);
    });
  }
  function move(i, dir) {
    var j = i + dir, o = look.order.slice(), t = o[i];
    o[i] = o[j]; o[j] = t;
    look.order = o;
    commit();
    var btn = $('#blockOrder').children[j].querySelectorAll('button')[dir < 0 ? 0 : 1];
    if (btn.disabled) btn = $('#blockOrder').children[j].querySelectorAll('button')[dir < 0 ? 1 : 0];
    btn.focus();
  }

  [['cBg', 'bg'], ['cFg', 'fg'], ['cAccent', 'accent']].forEach(function (c) {
    $('#' + c[0]).addEventListener('input', function (e) { look[c[1]] = e.target.value; commit(); });
  });
  $('#fontHead').addEventListener('change', function (e) { look.fontHead = e.target.value; commit(); });
  $('#fontBody').addEventListener('change', function (e) { look.fontBody = e.target.value; commit(); });
  $$('#radiusSeg button').forEach(function (b) {
    b.addEventListener('click', function () { look.radius = +b.getAttribute('data-radius'); commit(); });
  });
  $('#fontSize').addEventListener('input', function (e) { look.fontSize = +e.target.value; commit(); });
  $('#siteName').addEventListener('input', function (e) {
    look.siteName = e.target.value.trim() || 'Streop';
    save(KEY_LOOK, look); applyLook();
  });
  $('#logoFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 400 * 1024) { toast('Логотип должен весить меньше 400 КБ'); e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () { look.logo = reader.result; commit(); toast('Логотип обновлён'); };
    reader.readAsDataURL(file);
  });
  $('#resetLook').addEventListener('click', function () {
    look = defaultLook();
    $('#logoFile').value = '';
    commit();
    toast('Оформление сброшено');
  });

  /* =========================================================
     НАСТРОЙКИ АККАУНТА
     ========================================================= */
  var tabs = $$('.tabs [role="tab"]');
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return;
      var next = tabs[(i + n + tabs.length) % tabs.length];
      selectTab(next); next.focus();
    });
  });

  function fmtDate(d) { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtMoney(v) { return v.toLocaleString('ru-RU') + ' ₽'; }

  function renderSettings() {
    $('#accName').value = user.name;
    $('#accEmail').value = user.email;
    $('#accPlatform').textContent = user.platform;
    $('#accDate').textContent = fmtDate(user.created);
    $('#accId').textContent = user.id;

    $('#balAmount').textContent = fmtMoney(user.balance);
    $('#balPlan').textContent = user.plan || 'Нет';
    $('#balRenew').textContent = user.plan ? 'Продление ' + fmtDate(user.renew) : '';

    var h = $('#history');
    h.innerHTML = '';
    user.history.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (op) {
      var li = document.createElement('li');
      var left = document.createElement('div');
      left.textContent = op.t;
      var sm = document.createElement('small');
      sm.textContent = fmtDate(op.d);
      left.appendChild(sm);
      var right = document.createElement('b');
      right.className = op.v > 0 ? 'plus' : 'minus';
      right.textContent = (op.v > 0 ? '+ ' : '− ') + fmtMoney(Math.abs(op.v));
      li.appendChild(left); li.appendChild(right);
      h.appendChild(li);
    });

    $('#deleteConfirm').value = '';
    $('#deleteBtn').disabled = true;
    syncLookForm();
  }

  $('#openSettings').addEventListener('click', function () {
    closeMenu();
    renderSettings();
    selectTab(tabs[0]);
    openModal($('#settingsModal'));
  });

  $('#saveAccount').addEventListener('click', function () {
    var name = $('#accName').value.trim(), email = $('#accEmail').value.trim();
    if (!name) { toast('Имя не может быть пустым'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Проверьте адрес e-mail'); return; }
    user.name = name; user.email = email;
    save(KEY_USER, user); renderAuth();
    toast('Данные аккаунта сохранены');
  });

  $('#topUp').addEventListener('click', function () {
    user.balance += 500;
    user.history.push({ t: 'Пополнение баланса', d: Date.now(), v: 500 });
    save(KEY_USER, user); renderSettings();
    toast('Баланс пополнен на 500 ₽');
  });

  $('#deleteConfirm').addEventListener('input', function (e) {
    $('#deleteBtn').disabled = e.target.value.trim().toUpperCase() !== 'УДАЛИТЬ';
  });
  $('#deleteBtn').addEventListener('click', function () {
    drop(KEY_USER); drop(KEY_LOOK);
    user = null;
    look = defaultLook();
    applyLook();
    closeModal($('#settingsModal'));
    renderAuth();
    loginBtn.focus();
    toast('Аккаунт и все данные удалены');
  });

  /* ================== Старт ================== */
  $('#year').textContent = new Date().getFullYear();
  applyLook();
  renderAuth();
})();

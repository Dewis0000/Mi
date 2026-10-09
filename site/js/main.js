(function () {
  'use strict';

  /* ---------- Хранилище (демо: localStorage) ---------- */
  var KEY_USER = 'streamix.user';
  var KEY_LOOK = 'streamix.look';

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* приватный режим */ }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var BLOCKS = { hero: 'Главный экран', features: 'Преимущества бота', pricing: 'Уровни подписок' };
  var DEFAULT_LOOK = {
    theme: 'dark', accent: '#8b5cf6', fontHead: 'Unbounded', fontBody: 'Inter',
    order: ['hero', 'features', 'pricing'], siteName: 'Streamix', logo: null
  };

  var user = load(KEY_USER);
  var look = Object.assign({}, DEFAULT_LOOK, load(KEY_LOOK) || {});

  /* ---------- Тост ---------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2600);
  }

  /* ---------- Хедер: тень при скролле ---------- */
  var header = $('#header');
  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 10); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Burger ---------- */
  var burger = $('#burger'), nav = $('#nav');
  burger.addEventListener('click', function () {
    var open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  $$('#nav a').forEach(function (a) {
    a.addEventListener('click', function () {
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Авторизация ---------- */
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
    user = {
      name: 'Стример',
      email: 'streamer@example.com',
      platform: platform,
      created: new Date().toISOString(),
      id: 'SX-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      plan: 'Про',
      renew: new Date(Date.now() + 30 * 864e5).toISOString(),
      balance: 1250,
      history: [
        { t: 'Пополнение баланса', d: Date.now() - 12 * 864e5, v: 1000 },
        { t: 'Подписка «Про»', d: Date.now() - 12 * 864e5, v: -499 },
        { t: 'Пополнение баланса', d: Date.now() - 3 * 864e5, v: 750 }
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

  /* ---------- Меню пользователя ---------- */
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
    menu.classList.contains('is-open') ? closeMenu() : openMenu();
  });
  document.addEventListener('click', function (e) {
    if (!userBox.contains(e.target)) closeMenu();
  });
  menu.addEventListener('keydown', function (e) {
    var items = menuItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape') closeMenu(true);
    if (e.key === 'Tab') closeMenu();
  });

  // Разделы, которые появятся позже
  $$('[data-soon]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      closeMenu();
      toast('«' + a.getAttribute('data-soon') + '» — раздел скоро появится');
    });
  });

  /* ---------- Модалки ---------- */
  var lastFocus = null;
  function openModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    var f = m.querySelector('button:not([data-close]), input, [tabindex="0"]');
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

  /* ---------- Hero: живой градиент + магнитная кнопка ---------- */
  var stage = $('#stage'), cta = $('#continueBtn');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduced) {
    var raf = null;
    window.addEventListener('pointermove', function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var r = stage.getBoundingClientRect();
        var x = Math.max(-0.1, Math.min(1.1, (e.clientX - r.left) / r.width));
        var y = Math.max(-0.1, Math.min(1.1, (e.clientY - r.top) / r.height));
        stage.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        stage.style.setProperty('--my', (y * 100).toFixed(1) + '%');

        var c = cta.getBoundingClientRect();
        var dx = e.clientX - (c.left + c.width / 2), dy = e.clientY - (c.top + c.height / 2);
        var dist = Math.hypot(dx, dy);
        if (dist < 180) {
          cta.style.setProperty('--tx', (dx * 0.2).toFixed(1) + 'px');
          cta.style.setProperty('--ty', (dy * 0.2).toFixed(1) + 'px');
        } else {
          cta.style.setProperty('--tx', '0px');
          cta.style.setProperty('--ty', '0px');
        }
      });
    }, { passive: true });
  }

  cta.addEventListener('click', function () {
    if (user) toast('Переход в «Панель стримера» — раздел скоро появится');
    else openModal($('#loginModal'));
  });

  /* ---------- Подсветка карточек за курсором ---------- */
  $$('.feature').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--px', (e.clientX - r.left) + 'px');
      card.style.setProperty('--py', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------- Выбор тарифа ---------- */
  $$('[data-plan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var plan = b.getAttribute('data-plan');
      if (!user) { openModal($('#loginModal')); toast('Войдите, чтобы оформить «' + plan + '»'); return; }
      toast('Оформление тарифа «' + plan + '» — оплата скоро будет доступна');
    });
  });

  /* ---------- Появление при скролле ---------- */
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = (el.classList.contains('feature') ? (i % 5) * 60 : 0) + 'ms';
      io.observe(el);
    });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ============ Оформление ============ */
  function shade(hex, deg) {
    // сдвиг оттенка для второго и третьего акцентного цвета
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return 'hsl(' + Math.round((h + deg + 360) % 360) + ' ' + Math.round(Math.max(s, 0.6) * 100) + '% ' + Math.round(Math.min(Math.max(l, 0.5), 0.62) * 100) + '%)';
  }

  function applyLook() {
    var root = document.documentElement;
    root.setAttribute('data-theme', look.theme);
    root.style.setProperty('--accent', look.accent);
    root.style.setProperty('--accent-2', shade(look.accent, 60));
    root.style.setProperty('--accent-3', shade(look.accent, -70));
    root.style.setProperty('--font-head', '"' + look.fontHead + '", system-ui, sans-serif');
    root.style.setProperty('--font-body', '"' + look.fontBody + '", system-ui, sans-serif');
    $('meta[name="theme-color"]').setAttribute('content', look.theme === 'light' ? '#f7f6fb' : '#0b0b14');

    look.order.forEach(function (id, i) {
      var sec = $('[data-block="' + id + '"]');
      if (sec) sec.style.order = i;
    });

    $$('[data-site-name]').forEach(function (el) { el.textContent = look.siteName; });
    document.title = look.siteName + ' — бот и инструменты для стримеров';

    $$('.brand__logo').forEach(function (box) {
      var img = box.querySelector('img');
      var svg = box.querySelector('svg');
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

  function persistLook() { save(KEY_LOOK, look); applyLook(); syncLookForm(); }

  function syncLookForm() {
    $$('#themeSeg button').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-theme-val') === look.theme); });
    $$('#swatches [data-accent]').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-accent') === look.accent); });
    $('#accentPicker').value = look.accent;
    $('#fontHead').value = look.fontHead;
    $('#fontBody').value = look.fontBody;
    $('#siteName').value = look.siteName;
    renderOrder();
  }

  function renderOrder() {
    var list = $('#blockOrder');
    list.innerHTML = '';
    look.order.forEach(function (id, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span></span>' +
        '<button type="button" class="icon-btn" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-up"/></svg></button>' +
        '<button type="button" class="icon-btn" aria-label="Ниже"' + (i === look.order.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-down"/></svg></button>';
      li.querySelector('span').textContent = BLOCKS[id];
      var btns = li.querySelectorAll('button');
      btns[0].addEventListener('click', function () { move(i, -1); });
      btns[1].addEventListener('click', function () { move(i, 1); });
      list.appendChild(li);
    });
  }
  function move(i, dir) {
    var j = i + dir, o = look.order.slice();
    var t = o[i]; o[i] = o[j]; o[j] = t;
    look.order = o;
    persistLook();
    var target = $('#blockOrder').children[j];
    if (target) target.querySelectorAll('button')[dir < 0 ? 0 : 1].focus();
  }

  $$('#themeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { look.theme = b.getAttribute('data-theme-val'); persistLook(); });
  });
  $$('#swatches [data-accent]').forEach(function (b) {
    b.addEventListener('click', function () { look.accent = b.getAttribute('data-accent'); persistLook(); });
  });
  $('#accentPicker').addEventListener('input', function (e) { look.accent = e.target.value; persistLook(); });
  $('#fontHead').addEventListener('change', function (e) { look.fontHead = e.target.value; persistLook(); });
  $('#fontBody').addEventListener('change', function (e) { look.fontBody = e.target.value; persistLook(); });
  $('#siteName').addEventListener('input', function (e) {
    look.siteName = e.target.value.trim() || DEFAULT_LOOK.siteName;
    save(KEY_LOOK, look); applyLook();
  });
  $('#logoFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 400 * 1024) { toast('Логотип должен быть меньше 400 КБ'); e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () { look.logo = reader.result; persistLook(); toast('Логотип обновлён'); };
    reader.readAsDataURL(file);
  });
  $('#resetLook').addEventListener('click', function () {
    look = Object.assign({}, DEFAULT_LOOK, { order: DEFAULT_LOOK.order.slice() });
    $('#logoFile').value = '';
    persistLook();
    toast('Оформление сброшено');
  });

  /* ============ Настройки ============ */
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

  var fmtDate = function (d) { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
  var fmtMoney = function (v) { return v.toLocaleString('ru-RU') + ' ₽'; };

  function renderSettings() {
    $('#accName').value = user.name;
    $('#accEmail').value = user.email;
    $('#accPlatform').textContent = user.platform;
    $('#accDate').textContent = fmtDate(user.created);
    $('#accId').textContent = user.id;

    $('#balAmount').textContent = fmtMoney(user.balance);
    $('#balPlan').textContent = user.plan ? '«' + user.plan + '»' : 'Нет';
    $('#balRenew').textContent = user.plan ? 'Продление ' + fmtDate(user.renew) : '';
    var h = $('#history');
    h.innerHTML = '';
    user.history.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (op) {
      var li = document.createElement('li');
      var left = document.createElement('div');
      left.textContent = op.t;
      var small = document.createElement('small');
      small.textContent = fmtDate(op.d);
      left.appendChild(small);
      var right = document.createElement('span');
      right.className = op.v > 0 ? 'plus' : 'minus';
      right.textContent = (op.v > 0 ? '+' : '−') + fmtMoney(Math.abs(op.v));
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
    tabs[0].focus();
  });

  $('#saveAccount').addEventListener('click', function () {
    var name = $('#accName').value.trim(), email = $('#accEmail').value.trim();
    if (!name) { toast('Имя не может быть пустым'); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { toast('Проверьте e-mail'); return; }
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
    look = Object.assign({}, DEFAULT_LOOK, { order: DEFAULT_LOOK.order.slice() });
    applyLook();
    closeModal($('#settingsModal'));
    renderAuth();
    loginBtn.focus();
    toast('Аккаунт и все данные удалены');
  });

  /* ---------- Старт ---------- */
  $('#year').textContent = new Date().getFullYear();
  applyLook();
  renderAuth();
})();

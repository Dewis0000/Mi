(function () {
  'use strict';

  /* ================== Утилиты ================== */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  var KEY_USER = 'streop.user';
  var KEY_LOOK = 'streop.look.v3';
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMQ = window.matchMedia('(max-width: 760px)');
  function reduced() { return reducedMQ.matches; }

  /* =========================================================
     ПРУЖИНЫ
     Параметры как у Apple: response (сек, «скорость») и
     damping (1 — без перелёта, <1 — с отскоком).
     Пружина всегда продолжает с текущего значения и скорости,
     поэтому любую анимацию можно перехватить на середине.
     ========================================================= */
  var active = [];
  var rafId = 0, lastT = 0;

  function Spring(value, opts) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.response = opts.response || 0.4;
    this.damping = opts.damping == null ? 1 : opts.damping;
    this.precision = opts.precision || 0.001;
    this.onUpdate = opts.onUpdate || function () {};
    this.onRest = opts.onRest || null;
  }
  Spring.prototype.to = function (target, o) {
    o = o || {};
    this.target = target;
    if (o.velocity != null) this.velocity = o.velocity;
    if (o.response) this.response = o.response;
    if (o.damping != null) this.damping = o.damping;
    if (active.indexOf(this) === -1) active.push(this);
    kick();
    return this;
  };
  Spring.prototype.set = function (v) {
    this.stop();
    this.value = this.target = v;
    this.velocity = 0;
    this.onUpdate(v);
  };
  Spring.prototype.stop = function () {
    var i = active.indexOf(this);
    if (i !== -1) active.splice(i, 1);
  };
  Spring.prototype.step = function (dt) {
    var k = Math.pow(2 * Math.PI / this.response, 2);
    var c = 4 * Math.PI * this.damping / this.response;
    var h = 1 / 480, n = Math.ceil(dt / h);
    h = dt / n;
    for (var i = 0; i < n; i++) {
      var a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    var rest = Math.abs(this.velocity) < this.precision * 10 && Math.abs(this.value - this.target) < this.precision;
    if (rest) { this.value = this.target; this.velocity = 0; }
    return rest;
  };
  function kick() {
    if (rafId) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function loop(t) {
    var dt = clamp((t - lastT) / 1000, 0.001, 0.05);
    lastT = t;
    active.slice().forEach(function (s) {
      var rest = s.step(dt);
      s.onUpdate(s.value);
      if (rest) { s.stop(); if (s.onRest) s.onRest(s.value); }
    });
    rafId = active.length ? requestAnimationFrame(loop) : 0;
  }

  // Проекция инерции (функция Apple из «Designing Fluid Interfaces»)
  function project(v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); }
  // Мягкое сопротивление за границей
  function rubberband(over, dim, c) { c = c || 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); }

  /* ================== Тост ================== */
  var toastEl = $('#toast'), toastTimer;
  var toastSpring = new Spring(0, {
    response: 0.42, precision: 0.001,
    onUpdate: function (v) {
      toastEl.style.opacity = clamp(v, 0, 1);
      toastEl.style.transform = reduced()
        ? 'translate(-50%, 0)'
        : 'translate(-50%, ' + ((1 - v) * 140).toFixed(2) + '%) scale(' + (0.92 + 0.08 * v).toFixed(4) + ')';
    }
  });
  function toast(msg) {
    toastEl.textContent = msg;
    toastSpring.to(1, { response: 0.42, damping: 0.86 });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastSpring.to(0, { response: 0.36, damping: 1 }); }, 2600);
  }

  /* ================== Хедер ================== */
  var header = $('#header');
  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 4); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var burger = $('#burger'), nav = $('#nav');
  function setNav(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  burger.addEventListener('click', function () { setNav(!nav.classList.contains('is-open')); });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });

  /* ================== Меню пользователя ================== */
  var avatarBtn = $('#avatarBtn'), menu = $('#userMenu'), userBox = $('#userBox');
  var menuOpen = false;
  var menuSpring = new Spring(0, {
    response: 0.32, precision: 0.001,
    onUpdate: function (v) {
      menu.style.opacity = clamp(v, 0, 1);
      menu.style.transform = reduced() ? 'none' : 'scale(' + (0.86 + 0.14 * v).toFixed(4) + ')';
    },
    onRest: function (v) { if (v === 0 && !menuOpen) menu.hidden = true; }
  });
  function menuItems() { return $$('[role="menuitem"]', menu); }
  function openMenu() {
    menuOpen = true;
    menu.hidden = false;
    avatarBtn.setAttribute('aria-expanded', 'true');
    menuSpring.to(1, { response: 0.34, damping: 0.9 });
    menuItems()[0].focus({ preventScroll: true });
  }
  function closeMenu(focusBack) {
    if (!menuOpen) return;
    menuOpen = false;
    avatarBtn.setAttribute('aria-expanded', 'false');
    menuSpring.to(0, { response: 0.26, damping: 1 });
    if (focusBack) avatarBtn.focus();
  }
  avatarBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menuOpen) closeMenu(); else openMenu();
  });
  document.addEventListener('pointerdown', function (e) {
    if (menuOpen && !userBox.contains(e.target)) closeMenu();
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
      toast('«' + a.getAttribute('data-soon') + '» скоро появится');
    });
  });

  /* =========================================================
     ШТОРКИ
     Компьютер: окно по центру «материализуется» (масштаб +
     прозрачность + размытие) и уходит тем же путём.
     Телефон: шторка снизу, тянется пальцем 1:1, с мягким
     сопротивлением вверх, инерцией и передачей скорости пружине.
     ========================================================= */
  var openSheet = null;

  function Sheet(el) {
    var self = this;
    this.el = el;
    this.panel = $('.sheet__panel', el);
    this.scrim = $('.sheet__scrim', el);
    this.isOpen = false;
    this.mode = 'd';
    this.H = 600;
    this.lastFocus = null;

    this.p = new Spring(0, {
      response: 0.36, precision: 0.0005,
      onUpdate: function (v) { self.renderDesktop(v); },
      onRest: function (v) { if (v === 0 && !self.isOpen) self.finish(); }
    });
    this.y = new Spring(0, {
      response: 0.42, precision: 0.3,
      onUpdate: function (v) { self.renderMobile(v); },
      onRest: function (v) { if (!self.isOpen && v >= self.H - 1) self.finish(); }
    });

    $$('[data-close]', el).forEach(function (c) { c.addEventListener('click', function () { self.close(); }); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { self.close(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('button, input, select, [href]', self.panel).filter(function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    this.bindDrag();
  }

  Sheet.prototype.renderDesktop = function (v) {
    var o = clamp(v, 0, 1);
    this.scrim.style.opacity = o;
    this.panel.style.opacity = o;
    if (reduced()) { this.panel.style.transform = 'none'; this.panel.style.filter = ''; return; }
    this.panel.style.transform = 'translateY(' + ((1 - v) * 18).toFixed(2) + 'px) scale(' + (0.94 + 0.06 * v).toFixed(4) + ')';
    this.panel.style.filter = o < 0.995 ? 'blur(' + ((1 - o) * 8).toFixed(2) + 'px)' : '';
  };
  Sheet.prototype.renderMobile = function (v) {
    this.panel.style.opacity = 1;
    this.panel.style.filter = '';
    this.panel.style.transform = 'translate3d(0,' + v.toFixed(2) + 'px,0)';
    this.scrim.style.opacity = clamp(1 - v / this.H, 0, 1);
  };

  Sheet.prototype.open = function () {
    if (openSheet && openSheet !== this) openSheet.close(0, true);
    var wasHidden = this.el.hidden;
    this.isOpen = true;
    openSheet = this;
    if (wasHidden) this.lastFocus = document.activeElement;
    this.el.hidden = false;
    root.style.overflow = 'hidden';
    this.mode = mobileMQ.matches && !reduced() ? 'm' : 'd';
    if (this.mode === 'm') {
      this.H = this.panel.offsetHeight || window.innerHeight;
      if (wasHidden) this.y.set(this.H);
      this.y.to(0, { response: 0.42, damping: 1 });
    } else {
      if (wasHidden) this.p.set(0);
      this.p.to(1, { response: reduced() ? 0.25 : 0.38, damping: 1 });
    }
    var f = $('[role="tab"][aria-selected="true"], .list__row, input, button:not([data-close])', this.panel);
    if (f) f.focus({ preventScroll: true });
  };
  Sheet.prototype.close = function (velocity, instant) {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (openSheet === this) openSheet = null;
    if (instant) { this.p.stop(); this.y.stop(); this.finish(); return; }
    if (this.mode === 'm') this.y.to(this.H, { velocity: velocity || 0, response: 0.34, damping: 1 });
    else this.p.to(0, { response: 0.28, damping: 1 });
  };
  Sheet.prototype.finish = function () {
    this.el.hidden = true;
    this.panel.style.transform = this.panel.style.opacity = this.panel.style.filter = '';
    this.scrim.style.opacity = '';
    if (!openSheet) root.style.overflow = '';
    var lf = this.lastFocus;
    if (lf && document.contains(lf) && lf.offsetParent !== null) lf.focus({ preventScroll: true });
  };

  Sheet.prototype.bindDrag = function () {
    var self = this, drag = null;
    this.panel.addEventListener('pointerdown', function (e) {
      if (self.mode !== 'm') return;
      if (!e.target.closest('.sheet__grabber, .sheet__content > h2')) return;
      // Хватаем прямо на лету: стартуем с текущего положения на экране
      self.y.stop();
      self.isOpen = true;
      openSheet = self;
      drag = { id: e.pointerId, startY: e.clientY, startVal: self.y.value, hist: [{ t: e.timeStamp, y: e.clientY }] };
      try { self.panel.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    this.panel.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var raw = drag.startVal + (e.clientY - drag.startY);
      var v = raw < 0 ? -rubberband(-raw, self.H) : raw;
      self.y.value = self.y.target = v;
      self.renderMobile(v);
      drag.hist.push({ t: e.timeStamp, y: e.clientY });
      if (drag.hist.length > 8) drag.hist.shift();
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var h = drag.hist, now = e.timeStamp, i = h.length - 1;
      while (i > 0 && now - h[i - 1].t < 90) i--;
      var dt = (h[h.length - 1].t - h[i].t) / 1000;
      var vel = dt > 0.008 ? (h[h.length - 1].y - h[i].y) / dt : 0;
      if (now - h[h.length - 1].t > 90) vel = 0;
      drag = null;
      var projected = self.y.value + project(vel);
      if (projected > self.H * 0.45) self.close(vel);
      else self.y.to(0, { velocity: vel, response: 0.32, damping: Math.abs(vel) > 250 ? 0.8 : 1 });
    }
    this.panel.addEventListener('pointerup', end);
    this.panel.addEventListener('pointercancel', end);
  };

  var loginSheet = new Sheet($('#loginModal'));
  var settingsSheet = new Sheet($('#settingsModal'));

  /* ================== Авторизация ================== */
  var loginBtn = $('#loginBtn');
  var user = load(KEY_USER);

  function renderAuth() {
    var logged = !!user;
    loginBtn.hidden = logged;
    userBox.hidden = !logged;
    if (logged) {
      var letter = (user.name || 'S').trim().charAt(0).toUpperCase();
      $('#avatarLetter').textContent = letter;
      $('#menuAvatar').textContent = letter;
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
    loginSheet.close();
    toast('Вы вошли через ' + platform);
  }
  function logout() {
    user = null;
    drop(KEY_USER);
    closeMenu();
    renderAuth();
    toast('Вы вышли из аккаунта');
  }

  loginBtn.addEventListener('click', function () { loginSheet.open(); });
  $$('[data-login]').forEach(function (b) {
    b.addEventListener('click', function () { login(b.getAttribute('data-login')); });
  });
  $('#logoutBtn').addEventListener('click', logout);

  $('#continueBtn').addEventListener('click', function () {
    if (user) toast('«Панель стримера» скоро появится');
    else loginSheet.open();
  });
  $$('[data-plan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var plan = b.getAttribute('data-plan');
      if (!user) { loginSheet.open(); toast('Войдите, чтобы оформить «' + plan + '»'); return; }
      toast('Тариф «' + plan + '»: оплата скоро будет доступна');
    });
  });

  /* ================== Появление при скролле ================== */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) {
      var idx = $$('.reveal', el.parentElement).indexOf(el);
      el.style.transitionDelay = (reduced() ? 0 : Math.min(idx, 5) * 70) + 'ms';
      io.observe(el);
    });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ================== Живой чат в окне-снимке ================== */
  (function () {
    var list = $('#demoChat');
    if (!list) return;
    var names = ['nikita_play', 'marina.tv', 'zloy_kot', 'dashka', 'vovan228', 'sanya_pro', 'lera_mur', 'tima'];
    var texts = ['всем привет 👋', 'какой билд сейчас?', 'ору с этого момента', 'го ещё каточку', 'лучший стрим недели', 'лайк уже поставил', 'когда розыгрыш?', 'музыку погромче плиз', 'это было мощно'];
    var bad = [
      { u: 'bot_4421', m: 'КУПИ ПОДПИСЧИКОВ ДЁШЕВО', tag: 'Спам' },
      { u: 'promo_x', m: 'переходи по ссылке, там халява', tag: 'Реклама' },
      { u: 'anon_77', m: 'АААААААААА ПОЧЕМУ ТАК', tag: 'Капс' }
    ];
    var viewers = 1284, blocked = 47, rate = 312;
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    var fmt = function (n) { return n.toLocaleString('ru-RU'); };

    function add(isBad) {
      var li = document.createElement('li');
      var b = document.createElement('b');
      var s = document.createElement('span');
      if (isBad) {
        var x = pick(bad);
        b.textContent = x.u; s.textContent = x.m;
        var em = document.createElement('em');
        em.textContent = 'Удалено: ' + x.tag.toLowerCase();
        li.className = 'is-blocked';
        li.appendChild(b); li.appendChild(s); li.appendChild(em);
        blocked++;
        $('#demoBlocked').textContent = fmt(blocked);
      } else {
        b.textContent = pick(names); s.textContent = pick(texts);
        li.appendChild(b); li.appendChild(s);
      }
      list.appendChild(li);
      while (list.children.length > 7) list.removeChild(list.firstChild);
    }
    for (var i = 0; i < 6; i++) add(i === 3);

    if (reduced()) return;
    var visible = true, timer = null;
    function tick() {
      if (visible && !document.hidden) {
        add(Math.random() < 0.22);
        viewers = clamp(viewers + Math.round((Math.random() - 0.45) * 14), 900, 2400);
        rate = clamp(rate + Math.round((Math.random() - 0.5) * 24), 180, 520);
        $('#demoViewers').textContent = fmt(viewers);
        $('#demoRate').textContent = fmt(rate);
      }
      timer = setTimeout(tick, 1500 + Math.random() * 900);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(list);
    }
    timer = setTimeout(tick, 1200);
  })();

  /* =========================================================
     ОФОРМЛЕНИЕ
     ========================================================= */
  var BLOCKS = { hero: 'Главный экран', features: 'Преимущества', pricing: 'Уровни подписок' };
  var PRESETS = [
    { id: 'dark', name: 'Тёмная', bg: '#000000', fg: '#f5f5f7', accent: '#e5193a' },
    { id: 'light', name: 'Светлая', bg: '#f5f5f7', fg: '#1d1d1f', accent: '#c8102e' },
    { id: 'graphite', name: 'Графит', bg: '#1c1c1e', fg: '#f5f5f7', accent: '#0a84ff' },
    { id: 'white', name: 'Белая', bg: '#ffffff', fg: '#1d1d1f', accent: '#0071e3' }
  ];
  function defaultLook() {
    return {
      bg: '#000000', fg: '#f5f5f7', accent: '#e5193a',
      fontHead: 'system', fontBody: 'system', radius: 1, fontSize: 17,
      order: ['hero', 'features', 'pricing'], hidden: [],
      siteName: 'Streop', logo: null
    };
  }
  var look = Object.assign(defaultLook(), load(KEY_LOOK) || {});

  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function fontStack(name) { return name === 'system' ? 'var(--font-system)' : '"' + name + '", var(--font-system)'; }

  function applyLook() {
    var s = root.style;
    s.setProperty('--bg', look.bg);
    s.setProperty('--fg', look.fg);
    s.setProperty('--accent', look.accent);
    s.setProperty('--accent-fg', luminance(look.accent) > 0.45 ? '#000000' : '#ffffff');
    s.setProperty('--font-head', fontStack(look.fontHead));
    s.setProperty('--font-body', fontStack(look.fontBody));
    s.setProperty('--rk', look.radius);
    s.setProperty('--r-btn', look.radius === 0 ? '0px' : look.radius < 1 ? '12px' : '980px');
    s.setProperty('--fs', look.fontSize + 'px');

    // Поверхности: в светлых темах — белые карточки и лёгкие тени
    var light = luminance(look.bg) > 0.5;
    var props = ['--fill', '--elevated', '--group', '--scrim', '--shadow-lg', '--shadow-md'];
    if (light) {
      var nearWhite = luminance(look.bg) > 0.96;
      s.setProperty('--fill', nearWhite ? 'color-mix(in srgb, var(--fg) 4%, var(--bg))' : '#ffffff');
      s.setProperty('--elevated', 'color-mix(in srgb, var(--fg) 4%, #ffffff)');
      s.setProperty('--group', '#ffffff');
      s.setProperty('--scrim', 'rgba(0, 0, 0, .28)');
      s.setProperty('--shadow-lg', '0 30px 80px rgba(0, 0, 0, .14), 0 8px 24px rgba(0, 0, 0, .08)');
      s.setProperty('--shadow-md', '0 12px 40px rgba(0, 0, 0, .14)');
    } else {
      props.forEach(function (p) { s.removeProperty(p); });
    }
    root.style.colorScheme = light ? 'light' : 'dark';
    $('meta[name="theme-color"]').setAttribute('content', look.bg);

    look.order.forEach(function (id, i) {
      var sec = $('[data-block="' + id + '"]');
      if (!sec) return;
      sec.style.order = i;
      sec.hidden = look.hidden.indexOf(id) !== -1;
    });
    $$('.nav a, .footer a').forEach(function (a) {
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

  var presetsEl = $('#presets');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.setAttribute('data-preset', p.id);
    var tile = document.createElement('span');
    tile.className = 'preset__tile';
    tile.style.background = p.bg;
    tile.style.color = p.fg;
    tile.textContent = 'Aa';
    var dot = document.createElement('i');
    dot.style.background = p.accent;
    tile.appendChild(dot);
    var name = document.createElement('span');
    name.textContent = p.name;
    b.appendChild(tile); b.appendChild(name);
    b.addEventListener('click', function () {
      look.bg = p.bg; look.fg = p.fg; look.accent = p.accent;
      commit();
    });
    presetsEl.appendChild(b);
  });

  function syncLookForm() {
    $$('.preset').forEach(function (b) {
      var p = PRESETS.filter(function (x) { return x.id === b.getAttribute('data-preset'); })[0];
      var on = p.bg === look.bg && p.fg === look.fg && p.accent === look.accent;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    [['cBg', 'bg'], ['cFg', 'fg'], ['cAccent', 'accent']].forEach(function (c) {
      $('#' + c[0]).value = look[c[1]];
      $('#' + c[0] + 'Hex').textContent = look[c[1]];
    });
    $('#fontHead').value = look.fontHead;
    $('#fontBody').value = look.fontBody;
    $$('#radiusSeg button').forEach(function (b) {
      var on = +b.getAttribute('data-radius') === look.radius;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
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
        '<span></span>' +
        '<button type="button" class="icon-btn" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-up"/></svg></button>' +
        '<button type="button" class="icon-btn" aria-label="Ниже"' + (i === look.order.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-down"/></svg></button>' +
        '<label class="switch"><input type="checkbox" role="switch"' + (off ? '' : ' checked') + '><span></span></label>';
      li.querySelector('span').textContent = BLOCKS[id];
      li.querySelector('input').setAttribute('aria-label', 'Показывать блок «' + BLOCKS[id] + '»');
      li.querySelector('input').addEventListener('change', function (e) {
        if (!e.target.checked && look.hidden.length >= look.order.length - 1) {
          e.target.checked = true;
          toast('Хотя бы один блок должен остаться');
          return;
        }
        look.hidden = look.hidden.filter(function (h) { return h !== id; });
        if (!e.target.checked) look.hidden.push(id);
        save(KEY_LOOK, look); applyLook();
        li.classList.toggle('is-off', !e.target.checked);
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
    var btns = $('#blockOrder').children[j].querySelectorAll('button');
    var btn = btns[dir < 0 ? 0 : 1];
    (btn.disabled ? btns[dir < 0 ? 1 : 0] : btn).focus();
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
     НАСТРОЙКИ: вкладки с «ползунком» на пружине
     ========================================================= */
  var tabs = $$('#tabs [role="tab"]');
  var thumb = $('#tabThumb');
  var thumbX = new Spring(0, { response: 0.36, precision: 0.1, onUpdate: function (v) { thumb.style.transform = 'translateX(' + v.toFixed(2) + 'px)'; } });
  var thumbW = new Spring(0, { response: 0.36, precision: 0.1, onUpdate: function (v) { thumb.style.width = v.toFixed(2) + 'px'; } });

  function moveThumb(tab, animate) {
    var x = tab.offsetLeft, w = tab.offsetWidth;
    if (!animate || reduced()) { thumbX.set(x); thumbW.set(w); return; }
    thumbX.to(x, { response: 0.36, damping: 1 });
    thumbW.to(w, { response: 0.36, damping: 1 });
  }
  function selectTab(tab, animate) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    moveThumb(tab, animate);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t, true); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return;
      var next = tabs[(i + n + tabs.length) % tabs.length];
      selectTab(next, true); next.focus();
    });
  });
  window.addEventListener('resize', function () {
    var sel = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (sel && !settingsSheet.el.hidden) moveThumb(sel, false);
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
    settingsSheet.open();
    selectTab(tabs[0], false);
    tabs[0].focus({ preventScroll: true });
  });

  $('#saveAccount').addEventListener('click', function () {
    var name = $('#accName').value.trim(), email = $('#accEmail').value.trim();
    if (!name) { toast('Имя не может быть пустым'); $('#accName').focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Проверьте адрес e-mail'); $('#accEmail').focus(); return; }
    user.name = name; user.email = email;
    save(KEY_USER, user); renderAuth();
    toast('Сохранено');
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
    settingsSheet.close();
    renderAuth();
    toast('Аккаунт и все данные удалены');
  });

  /* ================== Старт ================== */
  $('#year').textContent = new Date().getFullYear();
  applyLook();
  renderAuth();
})();
